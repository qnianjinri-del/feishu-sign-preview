import type { PersistedSyncState, SyncRuntimeState, TaskSnapshot } from "../../types/sync";
import type { PersistedState } from "../../types/state";
import { normalizeTaskOrder } from "../../utils/reorder";
import {
  createMutationsForTaskDiff,
  markTasksForMutations,
  operationTaskIds,
  tasksFromSnapshot,
} from "../../utils/sync";
import { persistSoon, updateSettings } from "../storeHelpers";
import type { StoreSliceCreator } from "../storeTypes";

export interface SyncSlice {
  sync: PersistedSyncState;
  syncRuntime: SyncRuntimeState;
  setSyncEnabled: (value: boolean) => void;
  setSyncConfig: (serviceUrl: string, pollIntervalSeconds: number) => void;
  setSyncTokenConfigured: (configured: boolean) => void;
  markSyncStarted: () => void;
  markSyncUnchanged: () => void;
  markSyncFailure: (message: string, offline?: boolean) => void;
  applyRemoteSnapshot: (snapshot: TaskSnapshot, force?: boolean) => boolean;
  completeSync: (snapshot: TaskSnapshot, completedOperationIds: string[]) => void;
  setSyncConflict: (snapshot: TaskSnapshot) => void;
  acceptRemoteSnapshot: () => void;
  rebaseLocalChanges: () => void;
  mergeLocalWithRemote: () => void;
}

export function createSyncSlice(initial: PersistedState): StoreSliceCreator<SyncSlice> {
  return (set, get) => ({
    sync: initial.sync,
    syncRuntime: {
      status: initial.settings.syncEnabled ? "idle" : "disabled",
      tokenConfigured: false,
      warnings: [],
    },

    setSyncEnabled: (syncEnabled) => {
      updateSettings(set, get, { syncEnabled });
      set((state) => ({
        syncRuntime: {
          ...state.syncRuntime,
          status: syncEnabled ? "idle" : "disabled",
          message: undefined,
          pendingRemoteSnapshot: undefined,
          conflictKind: undefined,
        },
      }));
    },

    setSyncConfig: (syncServiceUrl, syncPollIntervalSeconds) => {
      updateSettings(set, get, {
        syncServiceUrl: syncServiceUrl.trim().replace(/\/+$/, "").slice(0, 2_000),
        syncPollIntervalSeconds: Math.min(300, Math.max(5, Math.round(syncPollIntervalSeconds))),
      });
    },

    setSyncTokenConfigured: (tokenConfigured) =>
      set((state) => ({ syncRuntime: { ...state.syncRuntime, tokenConfigured } })),

    markSyncStarted: () =>
      set((state) => ({
        syncRuntime: { ...state.syncRuntime, status: "syncing", message: undefined },
      })),

    markSyncUnchanged: () => {
      set((state) => ({
        sync: { ...state.sync, lastSuccessfulSyncAt: new Date().toISOString() },
        syncRuntime: { ...state.syncRuntime, status: "idle", message: undefined },
      }));
      persistSoon(get);
    },

    markSyncFailure: (message, offline = false) => {
      const state = get();
      set({
        tasks: markTasksForMutations(state.tasks, state.sync.outbox, "error"),
        syncRuntime: {
          ...state.syncRuntime,
          status: offline ? "offline" : "error",
          message,
        },
      });
      persistSoon(get);
    },

    applyRemoteSnapshot: (snapshot, force = false) => {
      const state = get();
      const remoteIds = new Set(snapshot.tasks.map((task) => task.id));
      const hasLocalOnlyTasks = state.tasks.some((task) => !remoteIds.has(task.id));
      if (!force && !state.sync.lastServerVersion && state.tasks.length && hasLocalOnlyTasks) {
        set({
          syncRuntime: {
            ...state.syncRuntime,
            status: "attention",
            message: "首次同步发现本地事项，请选择保留方式",
            warnings: snapshot.warnings,
            pendingRemoteSnapshot: snapshot,
            conflictKind: "initial",
          },
        });
        return false;
      }
      set({
        tasks: tasksFromSnapshot(snapshot, state.tasks),
        sync: {
          ...state.sync,
          lastServerVersion: snapshot.version,
          lastSuccessfulSyncAt: new Date().toISOString(),
        },
        historyPast: [],
        historyFuture: [],
        syncRuntime: {
          ...state.syncRuntime,
          status: "idle",
          message: undefined,
          warnings: snapshot.warnings,
          pendingRemoteSnapshot: undefined,
          conflictKind: undefined,
        },
      });
      persistSoon(get);
      return true;
    },

    completeSync: (snapshot, completedOperationIds) => {
      const state = get();
      const completed = new Set(completedOperationIds);
      const outbox = state.sync.outbox.filter((mutation) => !completed.has(mutation.operationId));
      const pendingTaskIds = new Set(outbox.flatMap(operationTaskIds));
      const tasks = outbox.length
        ? state.tasks.map((task) => ({
          ...task,
          syncState: pendingTaskIds.has(task.id) ? "pending" as const : "synced" as const,
        }))
        : tasksFromSnapshot(snapshot, state.tasks);
      set({
        tasks,
        sync: {
          outbox,
          lastServerVersion: snapshot.version,
          lastSuccessfulSyncAt: new Date().toISOString(),
        },
        syncRuntime: {
          ...state.syncRuntime,
          status: "idle",
          message: undefined,
          warnings: snapshot.warnings,
          pendingRemoteSnapshot: undefined,
          conflictKind: undefined,
        },
      });
      persistSoon(get);
    },

    setSyncConflict: (snapshot) =>
      set((state) => ({
        syncRuntime: {
          ...state.syncRuntime,
          status: "attention",
          message: "飞书和本地都发生了变化",
          warnings: snapshot.warnings,
          pendingRemoteSnapshot: snapshot,
          conflictKind: "version",
        },
      })),

    acceptRemoteSnapshot: () => {
      const state = get();
      const snapshot = state.syncRuntime.pendingRemoteSnapshot;
      if (!snapshot) return;
      set({ sync: { ...state.sync, outbox: [] } });
      get().applyRemoteSnapshot(snapshot, true);
    },

    rebaseLocalChanges: () => {
      const state = get();
      const snapshot = state.syncRuntime.pendingRemoteSnapshot;
      if (!snapshot) return;
      set({
        sync: { ...state.sync, lastServerVersion: snapshot.version },
        syncRuntime: {
          ...state.syncRuntime,
          status: "idle",
          message: undefined,
          pendingRemoteSnapshot: undefined,
          conflictKind: undefined,
        },
      });
      persistSoon(get);
    },

    mergeLocalWithRemote: () => {
      const state = get();
      const snapshot = state.syncRuntime.pendingRemoteSnapshot;
      if (!snapshot) return;
      const remoteTasks = tasksFromSnapshot(snapshot, state.tasks);
      const remoteIds = new Set(remoteTasks.map((task) => task.id));
      const localOnly = state.tasks.filter((task) => !remoteIds.has(task.id));
      const merged = normalizeTaskOrder([...remoteTasks, ...localOnly]);
      const mutations = createMutationsForTaskDiff(remoteTasks, merged, []);
      set({
        tasks: markTasksForMutations(merged, mutations, "pending"),
        sync: {
          ...state.sync,
          lastServerVersion: snapshot.version,
          outbox: mutations,
        },
        syncRuntime: {
          ...state.syncRuntime,
          status: "idle",
          message: undefined,
          warnings: snapshot.warnings,
          pendingRemoteSnapshot: undefined,
          conflictKind: undefined,
        },
      });
      persistSoon(get);
    },
  });
}
