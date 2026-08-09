import type {
  SyncMutation,
  SyncWarning,
  TaskSnapshot,
} from "@floatlist/contracts";

export type {
  SyncMutation,
  SyncTask,
  SyncWarning,
  TaskPatchInput,
  TaskSnapshot,
} from "@floatlist/contracts";

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
