import type { SyncTask, TaskStatus } from "../types/task-sync.js";

export interface RepositoryTask extends SyncTask {
  archived: boolean;
  remoteRecordId: string;
  subtaskSummary?: string | undefined;
}

export interface TaskPatch {
  archived?: boolean | undefined;
  blockedReason?: string | null | undefined;
  order?: number | undefined;
  parentId?: string | null | undefined;
  status?: TaskStatus | undefined;
  subtaskSummary?: string | null | undefined;
  text?: string | undefined;
}

export interface TaskRepository {
  createTask(task: SyncTask): Promise<RepositoryTask>;
  listTasks(includeArchived?: boolean): Promise<RepositoryTask[]>;
  updateTask(task: RepositoryTask, patch: TaskPatch): Promise<void>;
}
