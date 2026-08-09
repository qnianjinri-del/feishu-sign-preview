import type { AppSettings } from "../types/settings";
import type { PersistedState } from "../types/state";
import type { Task } from "../types/task";
import { schedulePersist } from "../services/persistence";
import { normalizeTaskOrder } from "../utils/reorder";
import { createMutationsForTaskDiff, markTasksForMutations } from "../utils/sync";
import type { ToastState } from "./slices/taskSlice";
import type { TaskStoreState } from "./storeTypes";

type SetStore = (
  partial: Partial<TaskStoreState> | ((state: TaskStoreState) => Partial<TaskStoreState>),
) => void;

export function cloneTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({ ...task }));
}

export function persistedSnapshot(
  state: Pick<TaskStoreState, "tasks" | "settings" | "sync">,
): PersistedState {
  return {
    schemaVersion: 5,
    tasks: cloneTasks(state.tasks),
    settings: { ...state.settings },
    sync: {
      ...state.sync,
      outbox: state.sync.outbox.map((mutation) => structuredClone(mutation)),
    },
  };
}

export function persistSoon(get: () => TaskStoreState): void {
  schedulePersist(persistedSnapshot(get()), (message) => get().showError(message));
}

export function nextToast(message: string, undo = false): ToastState {
  return { id: Date.now() + Math.random(), message, undo };
}

export function prepareTaskCommit(current: TaskStoreState, tasks: Task[]) {
  const normalized = normalizeTaskOrder(tasks);
  if (!current.settings.syncEnabled) return { tasks: normalized, sync: current.sync };
  const mutations = createMutationsForTaskDiff(current.tasks, normalized, current.sync.outbox);
  if (!mutations.length) return { tasks: normalized, sync: current.sync };
  return {
    tasks: markTasksForMutations(normalized, mutations, "pending"),
    sync: { ...current.sync, outbox: [...current.sync.outbox, ...mutations] },
  };
}

export function commitTasks(
  set: SetStore,
  get: () => TaskStoreState,
  tasks: Task[],
  toast?: ToastState,
): void {
  const current = get();
  const prepared = prepareTaskCommit(current, tasks);
  set({
    ...prepared,
    historyPast: [...current.historyPast.slice(-49), cloneTasks(current.tasks)],
    historyFuture: [],
    ...(toast ? { toast } : {}),
  });
  persistSoon(get);
}

export function updateSettings(
  set: SetStore,
  get: () => TaskStoreState,
  patch: Partial<AppSettings>,
): void {
  set((state) => ({ settings: { ...state.settings, ...patch } }));
  persistSoon(get);
}
