import type { Task, TaskStatus } from "../types/task";
import { isExpiredCompletedRoot } from "./taskVisibility";

export type TaskFilterMode = "current" | "todo" | "doing" | "blocked" | "done" | "all";

export interface TaskGroup {
  root: Task;
  children: Task[];
  progress: { total: number; done: number; blocked: number };
}

export interface TaskFilterOptions {
  mode: TaskFilterMode;
  query: string;
  showCompleted: boolean;
  todayStart: number;
}

const STATUS_MODES: Partial<Record<TaskFilterMode, TaskStatus>> = {
  todo: "todo",
  doing: "doing",
  blocked: "blocked",
  done: "done",
};

function matchesQuery(task: Task, query: string): boolean {
  if (!query) return true;
  return `${task.text}\n${task.blockedReason ?? ""}`.toLocaleLowerCase().includes(query);
}

function visibleInMode(task: Task, mode: TaskFilterMode, showCompleted: boolean): boolean {
  const status = STATUS_MODES[mode];
  if (status) return task.status === status;
  if (mode === "all") return true;
  return showCompleted || task.status !== "done";
}

export function filterTaskGroups(tasks: Task[], options: TaskFilterOptions): TaskGroup[] {
  const query = options.query.trim().toLocaleLowerCase();
  const roots = tasks
    .filter((task) => !task.parentId)
    .filter((task) => options.mode === "done" || options.mode === "all"
      || !isExpiredCompletedRoot(task, options.todayStart))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  return roots.flatMap((root) => {
    const allChildren = tasks
      .filter((task) => task.parentId === root.id)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const modeChildren = allChildren.filter((child) => visibleInMode(child, options.mode, options.showCompleted));
    const rootModeMatch = visibleInMode(root, options.mode, options.showCompleted);
    const rootQueryMatch = matchesQuery(root, query);
    const matchingChildren = modeChildren.filter((child) => matchesQuery(child, query));
    const rootMatches = rootModeMatch && rootQueryMatch;
    if (!rootMatches && !matchingChildren.length) return [];

    return [{
      root,
      children: rootMatches ? modeChildren : matchingChildren,
      progress: {
        total: allChildren.length,
        done: allChildren.filter((child) => child.status === "done").length,
        blocked: allChildren.filter((child) => child.status === "blocked").length,
      },
    }];
  });
}

export function visibleTaskCount(groups: TaskGroup[]): number {
  return groups.reduce((count, group) => count + 1 + group.children.length, 0);
}
