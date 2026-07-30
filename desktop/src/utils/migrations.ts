import type { AppSettings, ThemeMode } from "../types/settings";
import type { PersistedState } from "../types/state";
import type { PersistedSyncState, SyncMutation } from "../types/sync";
import type { Task, TaskStatus, TaskSyncState } from "../types/task";
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS, MAX_TASK_LENGTH, createDefaultState, createId } from "./defaults";
import { normalizeTaskOrder } from "./reorder";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIso(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

function sanitizeTaskStatus(value: UnknownRecord): TaskStatus {
  if (value.status === "todo" || value.status === "doing" || value.status === "blocked" || value.status === "done") {
    return value.status;
  }
  return value.completed === true ? "done" : "todo";
}

function sanitizeSyncState(value: unknown): TaskSyncState {
  return value === "synced" || value === "error" || value === "pending" ? value : "pending";
}

function sanitizeTask(value: unknown, index: number): Task | null {
  if (!isRecord(value) || typeof value.text !== "string") return null;
  const text = value.text.trim().slice(0, MAX_TASK_LENGTH);
  if (!text) return null;
  const now = new Date().toISOString();
  const status = sanitizeTaskStatus(value);
  const task: Task = {
    id: typeof value.id === "string" && value.id ? value.id : createId(),
    text,
    status,
    order: typeof value.order === "number" && Number.isFinite(value.order) ? value.order : index,
    createdAt: validIso(value.createdAt, now),
    updatedAt: validIso(value.updatedAt, now),
    syncState: sanitizeSyncState(value.syncState),
  };
  if (status === "done") task.completedAt = validIso(value.completedAt, task.updatedAt);
  if (typeof value.parentId === "string" && value.parentId) task.parentId = value.parentId;
  if (status === "blocked") {
    task.blockedReason = typeof value.blockedReason === "string" && value.blockedReason.trim()
      ? value.blockedReason.trim().slice(0, 1_000)
      : "未记录受阻原因";
  }
  if (typeof value.remoteRecordId === "string" && value.remoteRecordId) task.remoteRecordId = value.remoteRecordId;
  if (typeof value.remoteUpdatedAt === "string" && !Number.isNaN(Date.parse(value.remoteUpdatedAt))) {
    task.remoteUpdatedAt = value.remoteUpdatedAt;
  }
  return task;
}

function numberInRange(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function sanitizeTheme(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_SETTINGS.theme;
}

function sanitizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {};
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    listTitle:
      typeof source.listTitle === "string" && source.listTitle.trim()
        ? source.listTitle.trim().slice(0, 80)
        : DEFAULT_SETTINGS.listTitle,
    opacity: numberInRange(source.opacity, DEFAULT_SETTINGS.opacity, 0.35, 0.95),
    alwaysOnTop: typeof source.alwaysOnTop === "boolean" ? source.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop,
    showCompleted: typeof source.showCompleted === "boolean" ? source.showCompleted : DEFAULT_SETTINGS.showCompleted,
    compactMode: typeof source.compactMode === "boolean" ? source.compactMode : DEFAULT_SETTINGS.compactMode,
    theme: sanitizeTheme(source.theme),
    // Click-through intentionally never survives a restart, preventing an inaccessible window.
    clickThrough: false,
    launchAtLogin: typeof source.launchAtLogin === "boolean" ? source.launchAtLogin : DEFAULT_SETTINGS.launchAtLogin,
    toggleWindowShortcut:
      typeof source.toggleWindowShortcut === "string" && source.toggleWindowShortcut.trim()
        ? source.toggleWindowShortcut.trim().slice(0, 80)
        : DEFAULT_SETTINGS.toggleWindowShortcut,
    toggleClickThroughShortcut:
      typeof source.toggleClickThroughShortcut === "string" && source.toggleClickThroughShortcut.trim()
        ? source.toggleClickThroughShortcut.trim().slice(0, 80)
        : DEFAULT_SETTINGS.toggleClickThroughShortcut,
    syncEnabled: typeof source.syncEnabled === "boolean" ? source.syncEnabled : DEFAULT_SETTINGS.syncEnabled,
    syncServiceUrl:
      typeof source.syncServiceUrl === "string"
        ? source.syncServiceUrl.trim().slice(0, 2_000)
        : DEFAULT_SETTINGS.syncServiceUrl,
    syncPollIntervalSeconds: numberInRange(
      source.syncPollIntervalSeconds,
      DEFAULT_SETTINGS.syncPollIntervalSeconds,
      5,
      300,
    ),
  };
}

function sanitizeMutation(value: unknown): SyncMutation | null {
  if (!isRecord(value) || typeof value.operationId !== "string" || !value.operationId.trim()) return null;
  const operationId = value.operationId.trim().slice(0, 128);
  if ((value.type === "archive" || value.type === "restore" || value.type === "set_todo"
    || value.type === "set_doing" || value.type === "set_done")
    && typeof value.taskId === "string" && value.taskId) {
    return { operationId, type: value.type, taskId: value.taskId.slice(0, 128) };
  }
  if (value.type === "update_text" && typeof value.taskId === "string" && typeof value.text === "string" && value.text.trim()) {
    return {
      operationId,
      type: "update_text",
      taskId: value.taskId.slice(0, 128),
      text: value.text.trim().slice(0, MAX_TASK_LENGTH),
    };
  }
  if (value.type === "set_blocked" && typeof value.taskId === "string" && typeof value.reason === "string" && value.reason.trim()) {
    return {
      operationId,
      type: "set_blocked",
      taskId: value.taskId.slice(0, 128),
      reason: value.reason.trim().slice(0, 1_000),
    };
  }
  if (value.type === "reorder" && Array.isArray(value.items)) {
    const items = value.items.flatMap((item) => {
      if (!isRecord(item) || typeof item.taskId !== "string" || typeof item.order !== "number") return [];
      return [{ taskId: item.taskId.slice(0, 128), order: Math.max(0, Math.trunc(item.order)) }];
    }).slice(0, 500);
    return items.length ? { operationId, type: "reorder", items } : null;
  }
  if ((value.type === "create" || value.type === "create_subtask") && isRecord(value.task)) {
    const task = sanitizeTask(value.task, 0);
    if (!task) return null;
    const payload = {
      id: task.id,
      text: task.text,
      status: task.status,
      order: task.order,
      ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
      ...(task.createdAt ? { createdAt: task.createdAt } : {}),
      ...(task.updatedAt ? { updatedAt: task.updatedAt } : {}),
      ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    };
    if (value.type === "create_subtask" && task.parentId) {
      return { operationId, type: "create_subtask", task: { ...payload, parentId: task.parentId } };
    }
    if (value.type === "create" && !task.parentId) return { operationId, type: "create", task: payload };
  }
  return null;
}

function sanitizePersistedSyncState(value: unknown): PersistedSyncState {
  const source = isRecord(value) ? value : {};
  const outbox = Array.isArray(source.outbox)
    ? source.outbox.map(sanitizeMutation).filter((mutation): mutation is SyncMutation => Boolean(mutation)).slice(0, 5_000)
    : [];
  return {
    outbox,
    ...(typeof source.lastServerVersion === "string" && source.lastServerVersion
      ? { lastServerVersion: source.lastServerVersion.slice(0, 128) }
      : {}),
    ...(typeof source.lastSuccessfulSyncAt === "string" && !Number.isNaN(Date.parse(source.lastSuccessfulSyncAt))
      ? { lastSuccessfulSyncAt: source.lastSuccessfulSyncAt }
      : {}),
  };
}

/** Accepts the current schema and the pre-schema `{ tasks, settings }` shape. */
export function migratePersistedState(input: unknown): PersistedState {
  if (!isRecord(input)) return createDefaultState();

  const rawTasks = Array.isArray(input.tasks) ? input.tasks : [];
  const seenIds = new Set<string>();
  const sanitized = rawTasks
    .map(sanitizeTask)
    .filter((task): task is Task => {
      if (!task || seenIds.has(task.id)) return false;
      seenIds.add(task.id);
      return true;
    });
  const byId = new Map(sanitized.map((task) => [task.id, task]));
  const repairedHierarchy = sanitized.map((task) => {
    if (!task.parentId) return task;
    const parent = byId.get(task.parentId);
    if (!parent || parent.id === task.id || parent.parentId) {
      const rootTask = { ...task };
      delete rootTask.parentId;
      return rootTask;
    }
    return task;
  });
  let foundDoingRoot = false;
  const childDoingParents = new Set<string>();
  const tasks = repairedHierarchy
    .map((task) => {
      if (task.status !== "doing") return task;
      if (task.parentId) {
        if (!childDoingParents.has(task.parentId)) {
          childDoingParents.add(task.parentId);
          return task;
        }
        return { ...task, status: "todo" as const };
      }
      if (!foundDoingRoot) {
        foundDoingRoot = true;
        return task;
      }
      return { ...task, status: "todo" as const };
    });

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tasks: normalizeTaskOrder(tasks),
    settings: sanitizeSettings(input.settings),
    sync: sanitizePersistedSyncState(input.sync),
  };
}
