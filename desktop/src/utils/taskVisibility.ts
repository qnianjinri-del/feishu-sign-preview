import type { Task } from "../types/task";

export function localDayStart(value = Date.now()): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isExpiredCompletedRoot(task: Task, todayStart = localDayStart()): boolean {
  if (task.parentId || task.status !== "done") return false;
  const completedAt = Date.parse(task.completedAt ?? task.updatedAt);
  return Number.isFinite(completedAt) && completedAt < todayStart;
}
