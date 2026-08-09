import { create } from "zustand";
import type { AppSettings, ThemeMode } from "../types/settings";
import type { PersistedState } from "../types/state";
import type {
  PersistedSyncState,
  SyncRuntimeState,
  TaskSnapshot,
} from "../types/sync";
import type { Task, TaskStatus } from "../types/task";
import { readLaunchAtLogin, setLaunchAtLoginEnabled } from "../services/autostart";
import { flushPersist, loadPersistedState, schedulePersist } from "../services/persistence";
import { setWindowAlwaysOnTop, setWindowClickThrough } from "../services/tauriWindow";
import { createDefaultState, createTask, MAX_BATCH_TASKS } from "../utils/defaults";
import { migratePersistedState } from "../utils/migrations";
import { normalizeTaskOrder, reorderTasks as reorderTaskArray } from "../utils/reorder";
import {
  createMutationsForTaskDiff,
  markTasksForMutations,
  operationTaskIds,
  tasksFromSnapshot,
} from "../utils/sync";

interface ToastState {
  id: number;
  message: string;
  undo: boolean;
}

interface ShortcutStatus {
  window: boolean;
  clickThrough: boolean;
  quickAdd: boolean;
  errors: string[];
}

interface TaskStoreState {
  tasks: Task[];
  settings: AppSettings;
  sync: PersistedSyncState;
  syncRuntime: SyncRuntimeState;
  hydrated: boolean;
  firstLaunch: boolean;
  historyPast: Task[][];
  historyFuture: Task[][];
  toast: ToastState | null;
  shortcutStatus: ShortcutStatus;
  addTask: (text: string) => void;
  addTasks: (texts: string[]) => number;
  addSubtask: (parentId: string, text: string) => boolean;
  editTask: (id: string, text: string) => void;
  deleteTask: (id: string) => void;
  restoreTask: (task: Task, index: number) => void;
  toggleTask: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  setTaskBlocked: (id: string, reason: string) => void;
  setDoingTask: (id: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  clearCompleted: () => void;
  setListTitle: (title: string) => void;
  setOpacity: (opacity: number) => void;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setShowCompleted: (value: boolean) => void;
  setCompactMode: (value: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  setClickThrough: (value: boolean) => Promise<void>;
  setLaunchAtLogin: (value: boolean) => Promise<void>;
  setShortcuts: (windowShortcut: string, clickThroughShortcut: string, quickAddShortcut: string) => void;
  setOnboardingCompleted: (value: boolean) => void;
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
  setShortcutStatus: (status: ShortcutStatus) => void;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  importState: (input: unknown) => void;
  undo: () => void;
  redo: () => void;
  dismissToast: () => void;
  showError: (message: string) => void;
}

const initial = createDefaultState();

function cloneTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({ ...task }));
}

function persistedSnapshot(state: Pick<TaskStoreState, "tasks" | "settings" | "sync">): PersistedState {
  return {
    schemaVersion: 4,
    tasks: cloneTasks(state.tasks),
    settings: { ...state.settings },
    sync: {
      ...state.sync,
      outbox: state.sync.outbox.map((mutation) => structuredClone(mutation)),
    },
  };
}

function persistSoon(): void {
  const state = useTaskStore.getState();
  schedulePersist(persistedSnapshot(state), (message) => useTaskStore.getState().showError(message));
}

function nextToast(message: string, undo = false): ToastState {
  return { id: Date.now() + Math.random(), message, undo };
}

export const useTaskStore = create<TaskStoreState>((set, get) => {
  const prepareTaskCommit = (current: TaskStoreState, tasks: Task[]) => {
    const normalized = normalizeTaskOrder(tasks);
    if (!current.settings.syncEnabled) return { tasks: normalized, sync: current.sync };
    const mutations = createMutationsForTaskDiff(current.tasks, normalized, current.sync.outbox);
    if (!mutations.length) return { tasks: normalized, sync: current.sync };
    return {
      tasks: markTasksForMutations(normalized, mutations, "pending"),
      sync: { ...current.sync, outbox: [...current.sync.outbox, ...mutations] },
    };
  };

  const commitTasks = (tasks: Task[], toast?: ToastState) => {
    const current = get();
    const prepared = prepareTaskCommit(current, tasks);
    set({
      ...prepared,
      historyPast: [...current.historyPast.slice(-49), cloneTasks(current.tasks)],
      historyFuture: [],
      ...(toast ? { toast } : {}),
    });
    persistSoon();
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    set((state) => ({ settings: { ...state.settings, ...patch } }));
    persistSoon();
  };

  return {
    tasks: initial.tasks,
    settings: initial.settings,
    sync: initial.sync,
    syncRuntime: {
      status: initial.settings.syncEnabled ? "idle" : "disabled",
      tokenConfigured: false,
      warnings: [],
    },
    hydrated: false,
    firstLaunch: false,
    historyPast: [],
    historyFuture: [],
    toast: null,
    shortcutStatus: { window: false, clickThrough: false, quickAdd: false, errors: [] },

    addTask: (text) => {
      get().addTasks([text]);
    },

    addTasks: (texts) => {
      const clean = texts.map((text) => text.trim()).filter(Boolean).slice(0, MAX_BATCH_TASKS);
      if (!clean.length) return 0;
      const current = get().tasks;
      const rootCount = current.filter((task) => !task.parentId).length;
      const now = new Date().toISOString();
      const added = clean.map((text, index) => createTask(text, rootCount + index, now));
      commitTasks([...current, ...added]);
      if (texts.length > MAX_BATCH_TASKS) set({ toast: nextToast(`一次最多添加 ${MAX_BATCH_TASKS} 条任务`) });
      return added.length;
    },

    addSubtask: (parentId, text) => {
      const clean = text.trim();
      const tasks = get().tasks;
      const parent = tasks.find((task) => task.id === parentId);
      if (!clean || !parent || parent.parentId) return false;
      const now = new Date().toISOString();
      const childOrder = tasks.filter((task) => task.parentId === parentId).length;
      const child = { ...createTask(clean, childOrder, now), parentId };
      const next = tasks.map((task) => task.id === parentId && task.status === "done"
        ? { ...task, status: "todo" as const, completedAt: undefined, updatedAt: now }
        : task);
      commitTasks([...next, child]);
      return true;
    },

    editTask: (id, text) => {
      const clean = text.trim();
      if (!clean) {
        get().deleteTask(id);
        return;
      }
      const timestamp = new Date().toISOString();
      commitTasks(get().tasks.map((task) => (task.id === id ? { ...task, text: clean.slice(0, 4_000), updatedAt: timestamp } : task)));
    },

    deleteTask: (id) => {
      const tasks = get().tasks;
      if (!tasks.some((task) => task.id === id)) return;
      const removed = tasks.filter((task) => task.id === id || task.parentId === id).length;
      commitTasks(
        tasks.filter((task) => task.id !== id && task.parentId !== id),
        nextToast(removed > 1 ? `事项及 ${removed - 1} 个子事项已删除` : "事项已删除", true),
      );
    },

    restoreTask: (task, index) => {
      if (get().tasks.some((item) => item.id === task.id)) return;
      const next = [...get().tasks];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, task);
      commitTasks(next);
    },

    toggleTask: (id) => {
      const target = get().tasks.find((task) => task.id === id);
      if (!target) return;
      get().setTaskStatus(id, target.status === "done" ? "todo" : "done");
    },

    setTaskStatus: (id, status) => {
      const tasks = get().tasks;
      const target = tasks.find((task) => task.id === id);
      if (!target || (target.status === status && status !== "doing")) return;
      if (status === "done" && !target.parentId) {
        const unfinished = tasks.filter((task) => task.parentId === id && task.status !== "done").length;
        if (unfinished) {
          set({ toast: nextToast(`还有 ${unfinished} 个子事项未完成`) });
          return;
        }
      }

      const now = new Date().toISOString();
      commitTasks(
        tasks.map((task) => {
          let nextStatus = task.id === id ? status : task.status;
          if (status === "doing") {
            if (target.parentId) {
              if (
                task.parentId === target.parentId
                && task.status === "doing"
                && task.id !== target.id
              ) {
                nextStatus = "todo";
              }
            } else {
              if (!task.parentId && task.status === "doing" && task.id !== target.id) nextStatus = "todo";
            }
          }
          const reopensParent = target.parentId === task.id && status !== "done" && task.status === "done";
          if (nextStatus === task.status && !reopensParent) return task;
          if (reopensParent) {
            return {
              ...task,
              status: "todo",
              completedAt: undefined,
              blockedReason: undefined,
              updatedAt: now,
            };
          }
          return {
            ...task,
            status: nextStatus,
            updatedAt: now,
            ...(nextStatus === "done" ? { completedAt: now } : { completedAt: undefined }),
            ...(nextStatus === "blocked"
              ? { blockedReason: task.blockedReason ?? "未记录受阻原因" }
              : { blockedReason: undefined }),
          };
        }),
      );
    },

    setTaskBlocked: (id, reason) => {
      const clean = reason.trim().slice(0, 1_000);
      const tasks = get().tasks;
      const target = tasks.find((task) => task.id === id);
      if (!clean || !target) return;
      const now = new Date().toISOString();
      commitTasks(tasks.map((task) => {
        if (task.id === id) {
          return {
            ...task,
            status: "blocked",
            blockedReason: clean,
            completedAt: undefined,
            updatedAt: now,
          };
        }
        if (target.parentId === task.id && task.status === "done") {
          return { ...task, status: "todo", completedAt: undefined, blockedReason: undefined, updatedAt: now };
        }
        return task;
      }));
    },

    setDoingTask: (id) => get().setTaskStatus(id, "doing"),

    reorderTasks: (activeId, overId) => {
      if (activeId === overId) return;
      commitTasks(reorderTaskArray(get().tasks, activeId, overId));
    },

    clearCompleted: () => {
      const tasks = get().tasks;
      const completedRootIds = new Set(tasks.filter((task) => !task.parentId && task.status === "done").map((task) => task.id));
      const remaining = tasks.filter((task) => task.status !== "done" && (!task.parentId || !completedRootIds.has(task.parentId)));
      const count = tasks.length - remaining.length;
      if (!count) return;
      commitTasks(remaining, nextToast(`已清除 ${count} 个已完成事项`, true));
    },

    setListTitle: (title) => {
      const clean = title.trim().slice(0, 80) || "工作清单";
      updateSettings({ listTitle: clean });
    },
    setOpacity: (opacity) => updateSettings({ opacity: Math.min(0.95, Math.max(0.35, opacity)) }),
    setShowCompleted: (showCompleted) => updateSettings({ showCompleted }),
    setCompactMode: (compactMode) => updateSettings({ compactMode }),
    setTheme: (theme) => updateSettings({ theme }),
    setShortcuts: (toggleWindowShortcut, toggleClickThroughShortcut, quickAddShortcut) =>
      updateSettings({ toggleWindowShortcut, toggleClickThroughShortcut, quickAddShortcut }),
    setOnboardingCompleted: (onboardingCompleted) => updateSettings({ onboardingCompleted }),
    setSyncEnabled: (syncEnabled) => {
      updateSettings({ syncEnabled });
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
      updateSettings({
        syncServiceUrl: syncServiceUrl.trim().replace(/\/+$/, "").slice(0, 2_000),
        syncPollIntervalSeconds: Math.min(300, Math.max(5, Math.round(syncPollIntervalSeconds))),
      });
    },
    setSyncTokenConfigured: (tokenConfigured) =>
      set((state) => ({ syncRuntime: { ...state.syncRuntime, tokenConfigured } })),
    markSyncStarted: () =>
      set((state) => ({ syncRuntime: { ...state.syncRuntime, status: "syncing", message: undefined } })),
    markSyncUnchanged: () => {
      set((state) => ({
        sync: { ...state.sync, lastSuccessfulSyncAt: new Date().toISOString() },
        syncRuntime: {
          ...state.syncRuntime,
          status: "idle",
          message: undefined,
        },
      }));
      persistSoon();
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
      persistSoon();
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
      persistSoon();
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
      persistSoon();
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
      persistSoon();
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
      persistSoon();
    },

    setAlwaysOnTop: async (alwaysOnTop) => {
      const previous = get().settings.alwaysOnTop;
      updateSettings({ alwaysOnTop });
      try {
        await setWindowAlwaysOnTop(alwaysOnTop);
      } catch {
        updateSettings({ alwaysOnTop: previous });
        get().showError("无法更新始终置顶状态");
      }
    },

    setClickThrough: async (clickThrough) => {
      if (clickThrough && !get().shortcutStatus.clickThrough) {
        get().showError("穿透快捷键不可用，已阻止进入点击穿透模式");
        return;
      }
      try {
        await setWindowClickThrough(clickThrough);
        updateSettings({ clickThrough });
      } catch {
        get().showError(clickThrough ? "无法开启点击穿透" : "无法关闭点击穿透，请使用菜单栏重试");
      }
    },

    setLaunchAtLogin: async (launchAtLogin) => {
      try {
        await setLaunchAtLoginEnabled(launchAtLogin);
        updateSettings({ launchAtLogin });
      } catch {
        get().showError("无法更新开机启动设置");
      }
    },

    setShortcutStatus: (shortcutStatus) => set({ shortcutStatus }),

    hydrate: async () => {
      try {
        const loadedResult = await loadPersistedState();
        const loaded = loadedResult.state;
        let launchAtLogin = loaded.settings.launchAtLogin;
        try {
          launchAtLogin = await readLaunchAtLogin();
        } catch {
          // The persisted value remains useful if the OS query is unavailable.
        }
        set({
          tasks: loaded.tasks,
          settings: { ...loaded.settings, clickThrough: false, launchAtLogin },
          sync: loaded.sync,
          syncRuntime: {
            status: loaded.settings.syncEnabled ? "idle" : "disabled",
            tokenConfigured: false,
            warnings: [],
          },
          hydrated: true,
          firstLaunch: loadedResult.isFirstLaunch,
          historyPast: [],
          historyFuture: [],
        });
        if (loadedResult.isFirstLaunch) persistSoon();
      } catch {
        set({ hydrated: true, firstLaunch: true, toast: nextToast("本地数据读取失败，已使用默认清单") });
      }
    },

    persist: async () => {
      await flushPersist(persistedSnapshot(get()));
    },

    importState: (input) => {
      const migrated = migratePersistedState(input);
      const current = get();
      set({
        tasks: migrated.tasks,
        settings: migrated.settings,
        sync: migrated.sync,
        syncRuntime: {
          status: migrated.settings.syncEnabled ? "idle" : "disabled",
          tokenConfigured: false,
          warnings: [],
        },
        historyPast: [...current.historyPast.slice(-49), cloneTasks(current.tasks)],
        historyFuture: [],
        toast: nextToast("清单已导入"),
      });
      persistSoon();
    },

    undo: () => {
      const state = get();
      const previous = state.historyPast.at(-1);
      if (!previous) return;
      const prepared = prepareTaskCommit(state, cloneTasks(previous));
      set({
        ...prepared,
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [cloneTasks(state.tasks), ...state.historyFuture].slice(0, 50),
        toast: nextToast("已撤销"),
      });
      persistSoon();
    },

    redo: () => {
      const state = get();
      const next = state.historyFuture[0];
      if (!next) return;
      const prepared = prepareTaskCommit(state, cloneTasks(next));
      set({
        ...prepared,
        historyPast: [...state.historyPast, cloneTasks(state.tasks)].slice(-50),
        historyFuture: state.historyFuture.slice(1),
        toast: nextToast("已重做"),
      });
      persistSoon();
    },

    dismissToast: () => set({ toast: null }),
    showError: (message) => set({ toast: nextToast(message) }),
  };
});

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
