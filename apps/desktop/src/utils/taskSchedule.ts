import type { Task, TaskPriority } from "../types/task";

export type TaskDateFilter = "any" | "today" | "upcoming" | "overdue";
export type TaskPriorityFilter = "any" | Exclude<TaskPriority, "none">;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function parseLocalCalendarDate(value: string, time = "00:00"): Date | undefined {
  const dateMatch = DATE_PATTERN.exec(value);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) return undefined;
  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  if (parsed.getFullYear() !== Number(year)
    || parsed.getMonth() !== Number(month) - 1
    || parsed.getDate() !== Number(day)
    || parsed.getHours() !== Number(hour)
    || parsed.getMinutes() !== Number(minute)) return undefined;
  return parsed;
}

export function taskDueAt(task: Pick<Task, "dueDate" | "dueTime">): Date | undefined {
  if (!task.dueDate) return undefined;
  if (task.dueTime) return parseLocalCalendarDate(task.dueDate, task.dueTime);
  const endOfDay = parseLocalCalendarDate(task.dueDate, "23:59");
  if (endOfDay) endOfDay.setSeconds(59, 999);
  return endOfDay;
}

export function isTaskOverdue(task: Pick<Task, "status" | "dueDate" | "dueTime">, now = new Date()): boolean {
  const dueAt = taskDueAt(task);
  return task.status !== "done" && Boolean(dueAt && dueAt.getTime() < now.getTime());
}

export function matchesTaskDateFilter(task: Task, filter: TaskDateFilter, now = new Date()): boolean {
  if (filter === "any") return true;
  const dueAt = taskDueAt(task);
  if (!dueAt) return false;
  if (filter === "overdue") return isTaskOverdue(task, now);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const dueTime = dueAt.getTime();
  if (filter === "today") {
    return (dueTime >= todayStart && dueTime < tomorrowStart) || isTaskOverdue(task, now);
  }
  const sevenDayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).getTime();
  return dueTime >= now.getTime() && dueTime < sevenDayEnd;
}

export function taskPriorityMatches(task: Task, filter: TaskPriorityFilter): boolean {
  return filter === "any" || task.priority === filter;
}

export function formatTaskDue(task: Pick<Task, "dueDate" | "dueTime">, now = new Date()): string | undefined {
  if (!task.dueDate) return undefined;
  const parsed = parseLocalCalendarDate(task.dueDate, task.dueTime ?? "00:00");
  if (!parsed) return undefined;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const dayDelta = Math.round((taskDay.getTime() - today.getTime()) / 86_400_000);
  const dayLabel = dayDelta === 0 ? "今天" : dayDelta === 1 ? "明天" : `${parsed.getMonth() + 1}/${parsed.getDate()}`;
  return task.dueTime ? `${dayLabel} ${task.dueTime}` : dayLabel;
}

export function latestAllowedReminder(task: Pick<Task, "dueDate" | "dueTime">): Date | undefined {
  return taskDueAt(task);
}

export function validateReminder(
  reminderAt: string | undefined,
  task: Pick<Task, "dueDate" | "dueTime">,
): string | undefined {
  if (!reminderAt) return undefined;
  const reminder = new Date(reminderAt);
  if (Number.isNaN(reminder.getTime())) return "提醒时间无效";
  const dueAt = latestAllowedReminder(task);
  if (dueAt && reminder.getTime() > dueAt.getTime()) return "提醒不能晚于截止时间";
  return undefined;
}

export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function isoToLocalInput(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function reminderForPreset(
  preset: "due" | "10m" | "1h" | "1d" | "day-0900" | "previous-0900",
  dueDate?: string,
  dueTime?: string,
): string | undefined {
  if (!dueDate) return undefined;
  const due = dueTime ? parseLocalCalendarDate(dueDate, dueTime) : parseLocalCalendarDate(dueDate, "09:00");
  if (!due) return undefined;
  if (preset === "day-0900") return due.toISOString();
  if (preset === "previous-0900") {
    due.setDate(due.getDate() - 1);
    return due.toISOString();
  }
  const offsets = { due: 0, "10m": 10 * 60_000, "1h": 60 * 60_000, "1d": 24 * 60 * 60_000 };
  return new Date(due.getTime() - offsets[preset]).toISOString();
}
