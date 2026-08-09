import type { TaskPriority, TaskStatus } from "@floatlist/contracts";

export type { TaskPriority, TaskStatus } from "@floatlist/contracts";
export type TaskSyncState = "synced" | "pending" | "error";

export interface Task {
  id: string;
  text: string;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parentId?: string;
  blockedReason?: string;
  dueDate?: string;
  dueTime?: string;
  reminderAt?: string;
  remoteRecordId?: string;
  remoteUpdatedAt?: string;
  syncState: TaskSyncState;
}
