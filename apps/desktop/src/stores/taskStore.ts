import { create } from "zustand";
import type { PersistedState } from "../types/state";
import { createDefaultState } from "../utils/defaults";
import { cloneTasks } from "./storeHelpers";
import { createSettingsSlice } from "./slices/settingsSlice";
import { createSyncSlice } from "./slices/syncSlice";
import { createTaskSlice } from "./slices/taskSlice";
import type { TaskStoreState } from "./storeTypes";

export type { TaskStoreState } from "./storeTypes";

const initial = createDefaultState();

export const useTaskStore = create<TaskStoreState>((...store) => ({
  ...createTaskSlice(initial)(...store),
  ...createSettingsSlice(initial)(...store),
  ...createSyncSlice(initial)(...store),
}));

export function resetTaskStoreForTests(input?: PersistedState): void {
  const state = input ?? createDefaultState();
  useTaskStore.setState({
    tasks: cloneTasks(state.tasks),
    settings: { ...state.settings },
    sync: {
      ...state.sync,
      outbox: state.sync.outbox.map((mutation) => structuredClone(mutation)),
    },
    syncRuntime: {
      status: state.settings.syncEnabled ? "idle" : "disabled",
      tokenConfigured: false,
      warnings: [],
    },
    hydrated: true,
    firstLaunch: false,
    historyPast: [],
    historyFuture: [],
    toast: null,
    shortcutStatus: { window: true, clickThrough: true, quickAdd: true, errors: [] },
  });
}
