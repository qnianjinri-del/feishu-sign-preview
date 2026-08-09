import type { Task, TaskPriority, TaskStatus } from "../../types/task";
import type { PersistedState } from "../../types/state";
import { createTask, MAX_BATCH_TASKS } from "../../utils/defaults";
import { migratePersistedState } from "../../utils/migrations";
import { reorderTasks as reorderTaskArray } from "../../utils/reorder";
import { validateReminder } from "../../utils/taskSchedule";
import {
  cloneTasks,
  commitTasks,
  nextToast,
  persistSoon,
  prepareTaskCommit,
} from "../storeHelpers";
import type { StoreSliceCreator } from "../storeTypes";

export interface ToastState {
  id: number;
  message: string;
  undo: boolean;
}

export interface TaskSlice {
  tasks: Task[];
  historyPast: Task[][];
  historyFuture: Task[][];
  toast: ToastState | null;
  addTask: (text: string) => void;
  addTasks: (texts: string[]) => number;
  addSubtask: (parentId: string, text: string) => boolean;
  editTask: (id: string, text: string) => void;
  deleteTask: (id: string) => void;
  restoreTask: (task: Task, index: number) => void;
  toggleTask: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  setTaskBlocked: (id: string, reason: string) => void;
  setTaskSchedule: (id: string, schedule: {
    priority: TaskPriority;
    dueDate?: string;
    dueTime?: string;
    reminderAt?: string;
  }) => void;
  setDoingTask: (id: string) => void;
  reorderTasks: (activeId: string, overId: string) => void;
  clearCompleted: () => void;
  importState: (input: unknown) => void;
  undo: () => void;
  redo: () => void;
  dismissToast: () => void;
  showError: (message: string) => void;
}

export function createTaskSlice(initial: PersistedState): StoreSliceCreator<TaskSlice> {
  return (set, get) => ({
    tasks: initial.tasks,
    historyPast: [],
    historyFuture: [],
    toast: null,

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
      commitTasks(set, get, [...current, ...added]);
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
      commitTasks(set, get, [...next, child]);
      return true;
    },

    editTask: (id, text) => {
      const clean = text.trim();
      if (!clean) {
        get().deleteTask(id);
        return;
      }
      const updatedAt = new Date().toISOString();
      commitTasks(set, get, get().tasks.map((task) => (
        task.id === id ? { ...task, text: clean.slice(0, 4_000), updatedAt } : task
      )));
    },

    deleteTask: (id) => {
      const tasks = get().tasks;
      if (!tasks.some((task) => task.id === id)) return;
      const removed = tasks.filter((task) => task.id === id || task.parentId === id).length;
      commitTasks(
        set,
        get,
        tasks.filter((task) => task.id !== id && task.parentId !== id),
        nextToast(removed > 1 ? `事项及 ${removed - 1} 个子事项已删除` : "事项已删除", true),
      );
    },

    restoreTask: (task, index) => {
      if (get().tasks.some((item) => item.id === task.id)) return;
      const next = [...get().tasks];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, task);
      commitTasks(set, get, next);
    },

    toggleTask: (id) => {
      const target = get().tasks.find((task) => task.id === id);
      if (target) get().setTaskStatus(id, target.status === "done" ? "todo" : "done");
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
      commitTasks(set, get, tasks.map((task) => {
        let nextStatus = task.id === id ? status : task.status;
        if (status === "doing") {
          const sameScope = target.parentId
            ? task.parentId === target.parentId
            : !task.parentId;
          if (sameScope && task.status === "doing" && task.id !== target.id) nextStatus = "todo";
        }
        const reopensParent = target.parentId === task.id && status !== "done" && task.status === "done";
        if (nextStatus === task.status && !reopensParent) return task;
        if (reopensParent) {
          return {
            ...task,
            status: "todo" as const,
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
      }));
    },

    setTaskBlocked: (id, reason) => {
      const clean = reason.trim().slice(0, 1_000);
      const tasks = get().tasks;
      const target = tasks.find((task) => task.id === id);
      if (!clean || !target) return;
      const now = new Date().toISOString();
      commitTasks(set, get, tasks.map((task) => {
        if (task.id === id) {
          return {
            ...task,
            status: "blocked" as const,
            blockedReason: clean,
            completedAt: undefined,
            updatedAt: now,
          };
        }
        if (target.parentId === task.id && task.status === "done") {
          return {
            ...task,
            status: "todo" as const,
            completedAt: undefined,
            blockedReason: undefined,
            updatedAt: now,
          };
        }
        return task;
      }));
    },

    setTaskSchedule: (id, schedule) => {
      if (!get().tasks.some((item) => item.id === id)) return;
      const dueDate = schedule.dueDate || undefined;
      const dueTime = dueDate && schedule.dueTime ? schedule.dueTime : undefined;
      const reminderAt = schedule.reminderAt || undefined;
      const error = validateReminder(reminderAt, { dueDate, dueTime });
      if (error) {
        set({ toast: nextToast(error) });
        return;
      }
      const updatedAt = new Date().toISOString();
      commitTasks(set, get, get().tasks.map((item) => item.id === id ? {
        ...item,
        priority: schedule.priority,
        dueDate,
        dueTime,
        reminderAt,
        updatedAt,
      } : item));
    },

    setDoingTask: (id) => get().setTaskStatus(id, "doing"),

    reorderTasks: (activeId, overId) => {
      if (activeId !== overId) commitTasks(set, get, reorderTaskArray(get().tasks, activeId, overId));
    },

    clearCompleted: () => {
      const tasks = get().tasks;
      const completedRootIds = new Set(
        tasks.filter((task) => !task.parentId && task.status === "done").map((task) => task.id),
      );
      const remaining = tasks.filter((task) => (
        task.status !== "done" && (!task.parentId || !completedRootIds.has(task.parentId))
      ));
      const count = tasks.length - remaining.length;
      if (count) commitTasks(set, get, remaining, nextToast(`已清除 ${count} 个已完成事项`, true));
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
      persistSoon(get);
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
      persistSoon(get);
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
      persistSoon(get);
    },

    dismissToast: () => set({ toast: null }),
    showError: (message) => set({ toast: nextToast(message) }),
  });
}
