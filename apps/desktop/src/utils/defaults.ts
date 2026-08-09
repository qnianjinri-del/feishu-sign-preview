import type { AppSettings } from "../types/settings";
import type { PersistedState } from "../types/state";
import type { Task } from "../types/task";

export const CURRENT_SCHEMA_VERSION = 5 as const;
export const MAX_TASK_LENGTH = 4_000;
export const MAX_BATCH_TASKS = 500;

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  listTitle: "工作清单",
  opacity: 0.72,
  alwaysOnTop: true,
  showCompleted: true,
  compactMode: false,
  theme: "system",
  clickThrough: false,
  launchAtLogin: false,
  toggleWindowShortcut: "Command+Shift+Space",
  toggleClickThroughShortcut: "Command+Shift+L",
  quickAddShortcut: "Command+Shift+N",
  onboardingCompleted: false,
  remindersEnabled: true,
  syncEnabled: false,
  syncServiceUrl: "http://127.0.0.1:3000",
  syncPollIntervalSeconds: 10,
};

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createTask(text: string, order: number, now = new Date().toISOString()): Task {
  return {
    id: createId(),
    text: text.trim().slice(0, MAX_TASK_LENGTH),
    status: "todo",
    priority: "none",
    order,
    createdAt: now,
    updatedAt: now,
    syncState: "pending",
  };
}

export function createDefaultState(): PersistedState {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tasks: [
      createTask("写下今天最重要的工作", 0, now),
      createTask("拖动左侧把手调整顺序", 1, now),
      createTask("勾选圆圈完成任务", 2, now),
    ],
    settings: { ...DEFAULT_SETTINGS },
    sync: { outbox: [] },
  };
}
