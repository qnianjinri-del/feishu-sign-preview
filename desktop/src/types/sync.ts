import type { TaskStatus } from "./task";

export interface SyncTask {
  id: string;
  text: string;
  status: TaskStatus;
  order: number;
  parentId?: string;
  blockedReason?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  remoteRecordId?: string;
  remoteUpdatedAt?: string;
}

interface OperationBase {
  operationId: string;
}

export type SyncMutation =
  | (OperationBase & { type: "create"; task: Omit<SyncTask, "parentId" | "remoteRecordId" | "remoteUpdatedAt"> })
  | (OperationBase & { type: "create_subtask"; task: Omit<SyncTask, "remoteRecordId" | "remoteUpdatedAt"> & { parentId: string } })
  | (OperationBase & { type: "update_text"; taskId: string; text: string })
  | (OperationBase & { type: "set_todo" | "set_doing" | "set_done"; taskId: string })
  | (OperationBase & { type: "set_blocked"; taskId: string; reason: string })
  | (OperationBase & { type: "reorder"; items: Array<{ taskId: string; order: number }> })
  | (OperationBase & { type: "archive" | "restore"; taskId: string });

export interface SyncWarning {
  code: "multiple_doing" | "orphan_subtask";
  message: string;
  taskIds: string[];
}

export interface TaskSnapshot {
  version: string;
  tasks: SyncTask[];
  warnings: SyncWarning[];
}

export interface PersistedSyncState {
  lastServerVersion?: string;
  outbox: SyncMutation[];
  lastSuccessfulSyncAt?: string;
}

export type SyncRuntimeStatus =
  | "disabled"
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "attention";

export interface SyncRuntimeState {
  status: SyncRuntimeStatus;
  tokenConfigured: boolean;
  message?: string;
  warnings: SyncWarning[];
  pendingRemoteSnapshot?: TaskSnapshot;
  conflictKind?: "initial" | "version";
}
