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
}

export class TaskSyncService {
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private readonly idempotencyTtlMs: number;
  private readonly invalidatePreview: () => void;
  private readonly now: () => number;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: TaskRepository,
    options: TaskSyncServiceOptions = {},
  ) {
    this.idempotencyTtlMs = (options.idempotencyTtlSeconds ?? 3_600) * 1_000;
    this.invalidatePreview = options.invalidatePreview ?? (() => undefined);
    this.now = options.now ?? Date.now;
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
    if (operation.type === "create" || operation.type === "create_subtask") {
      const existing = tasks.find((task) => task.id === operation.task.id);
      if (existing) {
        const requestedParentId = "parentId" in operation.task ? operation.task.parentId : undefined;
        if (existing.text !== operation.task.text || (existing.parentId ?? undefined) !== requestedParentId) {
          throw new SyncValidationError(`Task ${operation.task.id} already exists with different content.`);
        }
        // A client may retry after the create reached Feishu but its response was lost.
        // Treat the matching create as a no-op so the rest of the batch can finish.
        return tasks;
      }
      let next = tasks;
      let parent: RepositoryTask | undefined;
      if (operation.type === "create_subtask") {
        parent = tasks.find((task) => task.id === operation.task.parentId && !task.archived);
        if (!parent || parent.parentId) throw new SyncValidationError("Subtasks require an active root parent.");
      }
      if (operation.task.status === "blocked" && !operation.task.blockedReason) {
        throw new SyncValidationError("Blocked tasks require a reason.");
      }
      if (operation.task.status === "doing") {
        next = await this.prepareDoingContext(
          next,
          operation.task.id,
          operation.type === "create_subtask" ? operation.task.parentId : undefined,
        );
      }
      if (parent?.status === "done" && operation.task.status !== "done") {
        await this.repository.updateTask(parent, { blockedReason: null, status: "todo" });
        next = this.patchLocal(next, parent.id, { blockedReason: undefined, status: "todo" });
      }
      const created = await this.repository.createTask(operation.task);
      return [...next, created];
    }

    if (operation.type === "update_text") {
      const target = this.requireActiveTask(tasks, operation.taskId);
      await this.repository.updateTask(target, { text: operation.text });
      return this.patchLocal(tasks, target.id, { text: operation.text });
    }

    if (operation.type === "set_todo") return this.setStatus(tasks, operation.taskId, "todo");
    if (operation.type === "set_doing") return this.setStatus(tasks, operation.taskId, "doing");
    if (operation.type === "set_done") return this.setStatus(tasks, operation.taskId, "done");
    if (operation.type === "set_blocked") {
      return this.setStatus(tasks, operation.taskId, "blocked", operation.reason);
    }

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
    const version = createHash("sha256").update(JSON.stringify({ tasks, warnings })).digest("hex");
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
    result.push(...tasks.filter((task) => task.parentId && !tasks.some((parent) => parent.id === task.parentId)));
    return result;
  }

  private toPublicTask(task: RepositoryTask): SyncTask {
    return {
      id: task.id,
      text: task.text,
      status: task.status,
      order: task.order,
      remoteRecordId: task.remoteRecordId,
      ...(task.parentId ? { parentId: task.parentId } : {}),
      ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
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
