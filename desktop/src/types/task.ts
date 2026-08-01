export type TaskStatus = "todo" | "doing" | "blocked" | "done";
export type TaskSyncState = "synced" | "pending" | "error";

export interface Task {
  id: string;
  text: string;
  status: TaskStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parentId?: string;
  blockedReason?: string;
  remoteRecordId?: string;
  remoteUpdatedAt?: string;
  syncState: TaskSyncState;
}
