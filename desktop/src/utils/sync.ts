import type { Task } from "../types/task";
import type { SyncMutation, SyncTask, TaskSnapshot } from "../types/sync";
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
    order: task.order,
    ...(task.parentId ? { parentId: task.parentId } : {}),
    ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
    ...(task.createdAt ? { createdAt: task.createdAt } : {}),
    ...(task.updatedAt ? { updatedAt: task.updatedAt } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
  };
}

function statusMutation(task: Task): SyncMutation {
  if (task.status === "doing") return { operationId: operationId(), type: "set_doing", taskId: task.id };
  if (task.status === "done") return { operationId: operationId(), type: "set_done", taskId: task.id };
  if (task.status === "blocked") {
    return {
      operationId: operationId(),
      type: "set_blocked",
      taskId: task.id,
      reason: task.blockedReason ?? "未记录受阻原因",
    };
  }
  return { operationId: operationId(), type: "set_todo", taskId: task.id };
}

function hasCreateMutation(outbox: SyncMutation[], taskId: string): boolean {
  return outbox.some((mutation) =>
    (mutation.type === "create" || mutation.type === "create_subtask") && mutation.task.id === taskId);
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

  const added = after.filter((task) => !beforeById.has(task.id));
  for (const task of added) {
    if (task.remoteRecordId || hasCreateMutation(outbox, task.id)) {
      mutations.push({ operationId: operationId(), type: "restore", taskId: task.id });
      continue;
    }
    const payload = toSyncTask(task);
    if (task.parentId) {
      mutations.push({ operationId: operationId(), type: "create_subtask", task: { ...payload, parentId: task.parentId } });
    } else {
      const { parentId: _parentId, remoteRecordId: _remoteRecordId, remoteUpdatedAt: _remoteUpdatedAt, ...root } = payload;
      void _parentId;
      void _remoteRecordId;
      void _remoteUpdatedAt;
      mutations.push({ operationId: operationId(), type: "create", task: root });
    }
  }

  const changedSiblingGroups = new Set<string>();
  for (const task of after) {
    const previous = beforeById.get(task.id);
    if (!previous) continue;
    if (previous.text !== task.text) {
      mutations.push({ operationId: operationId(), type: "update_text", taskId: task.id, text: task.text });
    }
    if (previous.status !== task.status
      || (task.status === "blocked" && previous.blockedReason !== task.blockedReason)) {
      mutations.push(statusMutation(task));
    }
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
  if (mutation.type === "create" || mutation.type === "create_subtask") return [mutation.task.id];
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
      order: remote.order,
      createdAt: remote.createdAt ?? local?.createdAt ?? updatedAt,
      updatedAt,
      syncState: "synced" as const,
      ...(remote.status === "done"
        ? { completedAt: remote.completedAt ?? local?.completedAt ?? updatedAt }
        : {}),
      ...(remote.parentId ? { parentId: remote.parentId } : {}),
      ...(remote.status === "blocked" && remote.blockedReason
        ? { blockedReason: remote.blockedReason }
        : {}),
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
