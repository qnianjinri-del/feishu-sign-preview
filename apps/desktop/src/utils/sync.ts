import type { Task } from "../types/task";
import type { SyncMutation, SyncTask, TaskPatchInput, TaskSnapshot } from "../types/sync";
import { createId } from "./defaults";
import { normalizeTaskOrder } from "./reorder";

function operationId(): string {
  return createId();
}

function toSyncTask(task: Task): SyncTask {
  return {
    id: task.id,
    text: task.text,
    status: task.status,
    priority: task.priority,
    order: task.order,
    ...(task.parentId ? { parentId: task.parentId } : {}),
    ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
    ...(task.dueDate ? { dueDate: task.dueDate } : {}),
    ...(task.dueTime ? { dueTime: task.dueTime } : {}),
    ...(task.reminderAt ? { reminderAt: task.reminderAt } : {}),
    ...(task.createdAt ? { createdAt: task.createdAt } : {}),
    ...(task.updatedAt ? { updatedAt: task.updatedAt } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
  };
}

function hasCreateMutation(outbox: SyncMutation[], taskId: string): boolean {
  return outbox.some((mutation) => mutation.type === "create" && mutation.task.id === taskId);
}

function taskPatch(previous: Task, task: Task): TaskPatchInput | null {
  const changes: TaskPatchInput = {} as TaskPatchInput;
  if (previous.text !== task.text) changes.text = task.text;
  if (previous.status !== task.status) {
    changes.status = task.status;
    changes.blockedReason = task.status === "blocked"
      ? task.blockedReason ?? "未记录受阻原因"
      : null;
  } else if (task.status === "blocked" && previous.blockedReason !== task.blockedReason) {
    changes.blockedReason = task.blockedReason ?? "未记录受阻原因";
  }
  if (previous.priority !== task.priority) changes.priority = task.priority;
  if (previous.dueDate !== task.dueDate) changes.dueDate = task.dueDate ?? null;
  if (previous.dueTime !== task.dueTime) changes.dueTime = task.dueTime ?? null;
  if (previous.reminderAt !== task.reminderAt) changes.reminderAt = task.reminderAt ?? null;
  return Object.keys(changes).length ? changes : null;
}

export function createMutationsForTaskDiff(
  before: Task[],
  after: Task[],
  outbox: SyncMutation[],
): SyncMutation[] {
  const beforeById = new Map(before.map((task) => [task.id, task]));
  const afterById = new Map(after.map((task) => [task.id, task]));
  const mutations: SyncMutation[] = [];

  const removed = before.filter((task) => !afterById.has(task.id));
  const removedIds = new Set(removed.map((task) => task.id));
  for (const task of removed) {
    if (task.parentId && removedIds.has(task.parentId)) continue;
    mutations.push({ operationId: operationId(), type: "archive", taskId: task.id });
  }

  for (const task of after.filter((item) => !beforeById.has(item.id))) {
    if (task.remoteRecordId || hasCreateMutation(outbox, task.id)) {
      mutations.push({ operationId: operationId(), type: "restore", taskId: task.id });
    } else {
      mutations.push({ operationId: operationId(), type: "create", task: toSyncTask(task) });
    }
  }

  const changedSiblingGroups = new Set<string>();
  for (const task of after) {
    const previous = beforeById.get(task.id);
    if (!previous) continue;
    const changes = taskPatch(previous, task);
    if (changes) mutations.push({ operationId: operationId(), type: "patch", taskId: task.id, changes });
    if (previous.order !== task.order || previous.parentId !== task.parentId) {
      changedSiblingGroups.add(task.parentId ?? "");
    }
  }

  for (const parentId of changedSiblingGroups) {
    const siblings = after
      .filter((task) => (task.parentId ?? "") === parentId)
      .sort((left, right) => left.order - right.order);
    if (siblings.length) {
      mutations.push({
        operationId: operationId(),
        type: "reorder",
        items: siblings.map((task) => ({ taskId: task.id, order: task.order })),
      });
    }
  }
  return mutations;
}

export function operationTaskIds(mutation: SyncMutation): string[] {
  if (mutation.type === "create") return [mutation.task.id];
  if (mutation.type === "reorder") return mutation.items.map((item) => item.taskId);
  return [mutation.taskId];
}

export function tasksFromSnapshot(snapshot: TaskSnapshot, existing: Task[] = []): Task[] {
  const existingById = new Map(existing.map((task) => [task.id, task]));
  const now = new Date().toISOString();
  return normalizeTaskOrder(snapshot.tasks.map((remote) => {
    const local = existingById.get(remote.id);
    const updatedAt = remote.updatedAt ?? remote.remoteUpdatedAt ?? local?.updatedAt ?? now;
    return {
      id: remote.id,
      text: remote.text,
      status: remote.status,
      priority: remote.priority,
      order: remote.order,
      createdAt: remote.createdAt ?? local?.createdAt ?? updatedAt,
      updatedAt,
      syncState: "synced" as const,
      ...(remote.status === "done"
        ? { completedAt: remote.completedAt ?? local?.completedAt ?? updatedAt }
        : {}),
      ...(remote.parentId ? { parentId: remote.parentId } : {}),
      ...(remote.status === "blocked" && remote.blockedReason ? { blockedReason: remote.blockedReason } : {}),
      ...(remote.dueDate ? { dueDate: remote.dueDate } : {}),
      ...(remote.dueTime ? { dueTime: remote.dueTime } : {}),
      ...(remote.reminderAt ? { reminderAt: remote.reminderAt } : {}),
      ...(remote.remoteRecordId ? { remoteRecordId: remote.remoteRecordId } : {}),
      ...(remote.remoteUpdatedAt ? { remoteUpdatedAt: remote.remoteUpdatedAt } : {}),
    };
  }));
}

export function markTasksForMutations(
  tasks: Task[],
  mutations: SyncMutation[],
  syncState: Task["syncState"],
): Task[] {
  const affected = new Set(mutations.flatMap(operationTaskIds));
  if (!affected.size) return tasks;
  return tasks.map((task) => affected.has(task.id) ? { ...task, syncState } : task);
}
