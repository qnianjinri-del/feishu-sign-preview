import type { AppSettings } from "./settings";
import type { PersistedSyncState } from "./sync";
import type { Task } from "./task";

export interface PersistedState {
  schemaVersion: 4;
  tasks: Task[];
  settings: AppSettings;
  sync: PersistedSyncState;
}
