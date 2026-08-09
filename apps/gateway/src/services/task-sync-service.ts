import { createHash } from "node:crypto";

import type {
  MutationRequest,
  SyncMutation,
  SyncTask,
  SyncWarning,
  TaskSnapshot,
  TaskStatus,
} from "../types/task-sync.js";
import type { RepositoryTask, TaskPatch, TaskRepository } from "./task-repository.js";
import { zonedDateTimeToTimestamp } from "../utils/zoned-time.js";

export class SyncValidationError extends Error {}
export class SyncNotFoundError extends Error {}
export class SyncVersionConflictError extends Error {
  constructor(public readonly snapshot: TaskSnapshot) {
    super("The task snapshot changed before these mutations were applied.");
  }
}

interface IdempotencyEntry {
  expiresAt: number;
  promise: Promise<TaskSnapshot>;
}

interface TaskSyncServiceOptions {
  idempotencyTtlSeconds?: number;
  invalidatePreview?: () => void;
  now?: () => number;
  timeZone?: string;
}

export class TaskSyncService {
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private readonly idempotencyTtlMs: number;
  private readonly invalidatePreview: () => void;
  private readonly now: () => number;
  private readonly timeZone: string;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: TaskRepository,
    options: TaskSyncServiceOptions = {},
  ) {
    this.idempotencyTtlMs = (options.idempotencyTtlSeconds ?? 3_600) * 1_000;
    this.invalidatePreview = options.invalidatePreview ?? (() => undefined);
    this.now = options.now ?? Date.now;
    this.timeZone = options.timeZone ?? "Asia/Shanghai";
  }

  async getSnapshot(): Promise<TaskSnapshot> {
    return this.enqueue(async () => {
      const tasks = await this.reconcileSubtaskSummaries(await this.repository.listTasks(false));
      return this.buildSnapshot(tasks);
    });
  }

  applyMutations(input: MutationRequest, idempotencyKey: string): Promise<TaskSnapshot> {
    this.cleanupIdempotency();
    const existing = this.idempotency.get(idempotencyKey);
    if (existing && existing.expiresAt > this.now()) return existing.promise;

    const promise = this.enqueue(async () => {
      const result = await this.applyMutationsInQueue(input);
      this.invalidatePreview();
      return result;
    });
    this.idempotency.set(idempotencyKey, {
      promise,
      expiresAt: this.now() + this.idempotencyTtlMs,
    });
    void promise.catch(() => {
      if (this.idempotency.get(idempotencyKey)?.promise === promise) this.idempotency.delete(idempotencyKey);
    });
    return promise;
  }

  private async applyMutationsInQueue(input: MutationRequest): Promise<TaskSnapshot> {
    let tasks = await this.repository.listTasks(true);
    const current = this.buildSnapshot(tasks.filter((task) => !task.archived));
    if (input.baseVersion && input.baseVersion !== current.version) {
      throw new SyncVersionConflictError(current);
    }

    for (const operation of input.operations) {
      tasks = await this.applyOperation(tasks, operation);
    }
    tasks = await this.reconcileSubtaskSummaries(tasks);
    return this.buildSnapshot(tasks.filter((task) => !task.archived));
  }

  private async reconcileSubtaskSummaries(tasks: RepositoryTask[]): Promise<RepositoryTask[]> {
    let next = tasks;
    const activeRoots = next.filter((task) => !task.archived && !task.parentId);
    for (const root of activeRoots) {
      const children = next
        .filter((task) => !task.archived && task.parentId === root.id)
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
      const doingChild = children.find((task) => task.status === "doing");
      const desired = doingChild?.text ?? (children.length === 1 ? children[0]?.text : undefined);
      if ((root.subtaskSummary ?? "") === (desired ?? "")) continue;
      await this.repository.updateTask(root, { subtaskSummary: desired ?? null });
      next = this.patchLocal(next, root.id, { subtaskSummary: desired });
    }
    return next;
  }

  private async applyOperation(tasks: RepositoryTask[], operation: SyncMutation): Promise<RepositoryTask[]> {
    if (operation.type === "create") {
      const existing = tasks.find((task) => task.id === operation.task.id);
      if (existing) {
        const sameSemanticContent = existing.text === operation.task.text
          && existing.status === operation.task.status
          && (existing.priority ?? "none") === operation.task.priority
          && existing.order === operation.task.order
          && (existing.parentId ?? undefined) === operation.task.parentId
          && (existing.blockedReason ?? undefined) === operation.task.blockedReason
          && (existing.dueDate ?? undefined) === operation.task.dueDate
          && (existing.dueTime ?? undefined) === operation.task.dueTime
          && (existing.reminderAt ?? undefined) === operation.task.reminderAt;
        if (!sameSemanticContent) {
          throw new SyncValidationError(`Task ${operation.task.id} already exists with different content.`);
        }
        // A client may retry after the create reached Feishu but its response was lost.
        // Treat the matching create as a no-op so the rest of the batch can finish.
        return tasks;
      }
      let next = tasks;
      let parent: RepositoryTask | undefined;
      if (operation.task.parentId) {
        parent = tasks.find((task) => task.id === operation.task.parentId && !task.archived);
        if (!parent || parent.parentId) throw new SyncValidationError("Subtasks require an active root parent.");
      }
      if (operation.task.status === "blocked" && !operation.task.blockedReason) {
        throw new SyncValidationError("Blocked tasks require a reason.");
      }
      this.validateSchedule(operation.task);
      if (operation.task.status === "doing") {
        next = await this.prepareDoingContext(
          next,
          operation.task.id,
          operation.task.parentId,
        );
      }
      if (parent?.status === "done" && operation.task.status !== "done") {
        await this.repository.updateTask(parent, { blockedReason: null, status: "todo" });
        next = this.patchLocal(next, parent.id, { blockedReason: undefined, status: "todo" });
      }
      const created = await this.repository.createTask(operation.task);
      return [...next, created];
    }

    if (operation.type === "patch") return this.patchTask(tasks, operation.taskId, operation.changes);

    if (operation.type === "reorder") {
      const targets = operation.items.map((item) => this.requireActiveTask(tasks, item.taskId));
      const parentId = targets[0]?.parentId;
      if (targets.some((task) => task.parentId !== parentId)) {
        throw new SyncValidationError("A reorder mutation may only contain sibling tasks.");
      }
      let next = tasks;
      for (const item of operation.items) {
        const target = this.requireActiveTask(next, item.taskId);
        await this.repository.updateTask(target, { order: item.order });
        next = this.patchLocal(next, target.id, { order: item.order });
      }
      return next;
    }

    const target = this.requireTask(tasks, operation.taskId);
    if (operation.type === "restore" && target.parentId) {
      const parent = tasks.find((task) => task.id === target.parentId);
      if (!parent || parent.archived) {
        throw new SyncValidationError("Restore the active parent before restoring this subtask.");
      }
    }
    const affected = target.parentId
      ? [target]
      : tasks.filter((task) => task.id === target.id || task.parentId === target.id);
    let next = tasks;
    for (const task of affected) {
      const archived = operation.type === "archive";
      await this.repository.updateTask(task, { archived });
      next = this.patchLocal(next, task.id, { archived });
    }
    return next;
  }

  private async patchTask(
    tasks: RepositoryTask[],
    taskId: string,
    changes: Extract<SyncMutation, { type: "patch" }>["changes"],
  ): Promise<RepositoryTask[]> {
    let next = tasks;
    let target = this.requireActiveTask(next, taskId);
    if (changes.status) {
      const reason = changes.status === "blocked"
        ? changes.blockedReason ?? target.blockedReason
        : undefined;
      next = await this.setStatus(next, taskId, changes.status, reason ?? undefined);
      target = this.requireActiveTask(next, taskId);
    }

    const dueDate = changes.dueDate === undefined ? target.dueDate : changes.dueDate ?? undefined;
    const dueTime = changes.dueDate === null
      ? undefined
      : changes.dueTime === undefined ? target.dueTime : changes.dueTime ?? undefined;
    if (dueTime && !dueDate) throw new SyncValidationError("A due time requires a due date.");
    const reminderAt = changes.reminderAt === undefined ? target.reminderAt : changes.reminderAt ?? undefined;
    this.validateSchedule({ dueDate, dueTime, reminderAt });

    const patch: TaskPatch = {};
    const localPatch: Partial<RepositoryTask> = {};
    if (changes.text !== undefined) patch.text = localPatch.text = changes.text;
    if (changes.priority !== undefined) patch.priority = localPatch.priority = changes.priority;
    if (changes.dueDate !== undefined) {
      patch.dueDate = changes.dueDate;
      localPatch.dueDate = dueDate;
      if (changes.dueDate === null && changes.dueTime === undefined) {
        patch.dueTime = null;
        localPatch.dueTime = undefined;
      }
    }
    if (changes.dueTime !== undefined) {
      patch.dueTime = changes.dueTime;
      localPatch.dueTime = dueTime;
    }
    if (changes.reminderAt !== undefined) {
      patch.reminderAt = changes.reminderAt;
      localPatch.reminderAt = changes.reminderAt ?? undefined;
    }
    if (changes.blockedReason !== undefined && changes.status === undefined) {
      if (target.status !== "blocked" && changes.blockedReason) {
        throw new SyncValidationError("Only blocked tasks may have a blocked reason.");
      }
      patch.blockedReason = changes.blockedReason;
      localPatch.blockedReason = changes.blockedReason ?? undefined;
    }
    if (!Object.keys(patch).length) return next;
    await this.repository.updateTask(target, patch);
    return this.patchLocal(next, taskId, localPatch);
  }

  private async setStatus(
    tasks: RepositoryTask[],
    taskId: string,
    status: TaskStatus,
    blockedReason?: string,
  ): Promise<RepositoryTask[]> {
    let next = tasks;
    const target = this.requireActiveTask(next, taskId);
    if (status === "done" && !target.parentId) {
      const unfinished = next.filter((task) => task.parentId === target.id && !task.archived && task.status !== "done");
      if (unfinished.length) throw new SyncValidationError("All subtasks must be complete before the parent can be completed.");
    }
    if (status === "blocked" && !blockedReason?.trim()) {
      throw new SyncValidationError("Blocked tasks require a reason.");
    }

    if (status === "doing") {
      next = await this.prepareDoingContext(next, target.id, target.parentId);
    }

    if (target.parentId && status !== "done") {
      const parent = next.find((task) => task.id === target.parentId && !task.archived);
      if (!parent) throw new SyncValidationError("The subtask parent is missing or archived.");
      if (parent.status === "done") {
        await this.repository.updateTask(parent, { blockedReason: null, status: "todo" });
        next = this.patchLocal(next, parent.id, { blockedReason: undefined, status: "todo" });
      }
    }

    const freshTarget = this.requireActiveTask(next, taskId);
    const patch: TaskPatch = {
      status,
      blockedReason: status === "blocked" ? blockedReason?.trim() : null,
    };
    await this.repository.updateTask(freshTarget, patch);
    return this.patchLocal(next, taskId, {
      status,
      blockedReason: status === "blocked" ? blockedReason?.trim() : undefined,
    });
  }

  private async prepareDoingContext(
    tasks: RepositoryTask[],
    targetId: string,
    parentId?: string,
  ): Promise<RepositoryTask[]> {
    let next = tasks;
    if (!parentId) {
      for (const current of next.filter(
        (task) => !task.archived && !task.parentId && task.status === "doing" && task.id !== targetId,
      )) {
        await this.repository.updateTask(current, { blockedReason: null, status: "todo" });
        next = this.patchLocal(next, current.id, { blockedReason: undefined, status: "todo" });
      }
      return next;
    }

    const parent = next.find((task) => task.id === parentId && !task.archived);
    if (!parent || parent.parentId) throw new SyncValidationError("The subtask parent is missing, nested, or archived.");
    for (const sibling of next.filter(
      (task) => !task.archived
        && task.parentId === parentId
        && task.status === "doing"
        && task.id !== targetId,
    )) {
      await this.repository.updateTask(sibling, { blockedReason: null, status: "todo" });
      next = this.patchLocal(next, sibling.id, { blockedReason: undefined, status: "todo" });
    }
    return next;
  }

  private buildSnapshot(repositoryTasks: RepositoryTask[]): TaskSnapshot {
    const tasks = this.normalizeHierarchy(repositoryTasks.map((task) => this.toPublicTask(task)));
    const warnings: SyncWarning[] = [];
    const doing = tasks.filter((task) => !task.parentId && task.status === "doing");
    if (doing.length > 1) {
      warnings.push({
        code: "multiple_doing",
        message: "发现多个正在做事项；签名会稳定选择顺序最靠前的一项。",
        taskIds: doing.map((task) => task.id),
      });
    }
    const ids = new Set(tasks.map((task) => task.id));
    const orphans = tasks.filter((task) => task.parentId && !ids.has(task.parentId));
    if (orphans.length) {
      warnings.push({
        code: "orphan_subtask",
        message: "发现父事项缺失的子事项。",
        taskIds: orphans.map((task) => task.id),
      });
    }
    // The ETag represents user-visible task meaning, not reconciliation metadata.
    // Feishu may refresh record IDs and timestamps while normalizing rows; including
    // those fields would make an unchanged list look like a concurrent edit.
    const semanticTasks = tasks.map((task) => ({
      id: task.id,
      text: task.text,
      status: task.status,
      order: task.order,
      parentId: task.parentId ?? null,
      blockedReason: task.blockedReason ?? null,
      priority: task.priority ?? "none",
      dueDate: task.dueDate ?? null,
      dueTime: task.dueTime ?? null,
      reminderAt: task.reminderAt ?? null,
    }));
    const version = createHash("sha256").update(JSON.stringify(semanticTasks)).digest("hex");
    return { version, tasks, warnings };
  }

  private normalizeHierarchy(tasks: SyncTask[]): SyncTask[] {
    const roots = tasks.filter((task) => !task.parentId).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const result: SyncTask[] = [];
    for (const [rootOrder, root] of roots.entries()) {
      result.push(root.order === rootOrder ? root : { ...root, order: rootOrder });
      const children = tasks
        .filter((task) => task.parentId === root.id)
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
      children.forEach((child, childOrder) => {
        result.push(child.order === childOrder ? child : { ...child, order: childOrder });
      });
    }
    result.push(...tasks
      .filter((task) => task.parentId && !tasks.some((parent) => parent.id === task.parentId))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
    return result;
  }

  private toPublicTask(task: RepositoryTask): SyncTask {
    return {
      id: task.id,
      text: task.text,
      status: task.status,
      priority: task.priority,
      order: task.order,
      remoteRecordId: task.remoteRecordId,
      ...(task.parentId ? { parentId: task.parentId } : {}),
      ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
      ...(task.dueDate ? { dueDate: task.dueDate } : {}),
      ...(task.dueTime ? { dueTime: task.dueTime } : {}),
      ...(task.reminderAt ? { reminderAt: task.reminderAt } : {}),
      ...(task.createdAt ? { createdAt: task.createdAt } : {}),
      ...(task.updatedAt ? { updatedAt: task.updatedAt } : {}),
      ...(task.completedAt ? { completedAt: task.completedAt } : {}),
      ...(task.remoteUpdatedAt ? { remoteUpdatedAt: task.remoteUpdatedAt } : {}),
    };
  }

  private requireTask(tasks: RepositoryTask[], taskId: string): RepositoryTask {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new SyncNotFoundError(`Task ${taskId} was not found.`);
    return task;
  }

  private validateSchedule(task: Pick<SyncTask, "dueDate" | "dueTime" | "reminderAt">): void {
    if (task.dueTime && !task.dueDate) throw new SyncValidationError("A due time requires a due date.");
    if (!task.dueDate || !task.reminderAt) return;
    const dueTimestamp = zonedDateTimeToTimestamp(
      task.dueDate,
      task.dueTime ?? "23:59",
      this.timeZone,
    ) + (task.dueTime ? 0 : 59_999);
    if (Date.parse(task.reminderAt) > dueTimestamp) {
      throw new SyncValidationError("A reminder cannot be later than its due time.");
    }
  }

  private requireActiveTask(tasks: RepositoryTask[], taskId: string): RepositoryTask {
    const task = this.requireTask(tasks, taskId);
    if (task.archived) throw new SyncNotFoundError(`Task ${taskId} is archived.`);
    return task;
  }

  private patchLocal(tasks: RepositoryTask[], taskId: string, patch: Partial<RepositoryTask>): RepositoryTask[] {
    return tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeTail.then(operation, operation);
    this.writeTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private cleanupIdempotency(): void {
    const now = this.now();
    for (const [key, entry] of this.idempotency) {
      if (entry.expiresAt <= now) this.idempotency.delete(key);
    }
    if (this.idempotency.size <= 1_000) return;
    const overflow = this.idempotency.size - 1_000;
    for (const key of [...this.idempotency.keys()].slice(0, overflow)) this.idempotency.delete(key);
  }
}
