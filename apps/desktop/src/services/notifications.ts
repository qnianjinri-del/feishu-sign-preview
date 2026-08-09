import {
  Schedule,
  cancelAll,
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Task } from "../types/task";
import { isTauriRuntime } from "./runtime";

export type ReminderPermission = "granted" | "not-granted" | "unavailable";

export async function checkReminderPermission(): Promise<ReminderPermission> {
  if (!isTauriRuntime()) return "unavailable";
  try {
    return await isPermissionGranted() ? "granted" : "not-granted";
  } catch {
    return "unavailable";
  }
}

export async function ensureReminderPermission(): Promise<ReminderPermission> {
  const current = await checkReminderPermission();
  if (current !== "not-granted") return current;
  try {
    return await requestPermission() === "granted" ? "granted" : "not-granted";
  } catch {
    return "unavailable";
  }
}

function notificationId(taskId: string): number {
  let hash = 0;
  for (const character of taskId) hash = Math.imul(31, hash) + character.charCodeAt(0) | 0;
  return hash || 1;
}

export async function reconcileTaskReminders(tasks: Task[], enabled: boolean): Promise<ReminderPermission> {
  const permission = await checkReminderPermission();
  if (permission !== "granted") return permission;
  await cancelAll();
  if (!enabled) return permission;

  const now = Date.now();
  for (const task of tasks) {
    if (task.status === "done" || !task.reminderAt) continue;
    const reminderDate = new Date(task.reminderAt);
    if (Number.isNaN(reminderDate.getTime()) || reminderDate.getTime() <= now) continue;
    sendNotification({
      id: notificationId(task.id),
      title: "FloatList 提醒",
      body: task.text,
      schedule: Schedule.at(reminderDate),
      sound: "Ping",
      extra: { taskId: task.id },
    });
  }
  return permission;
}

export async function sendTestReminder(): Promise<ReminderPermission> {
  const permission = await ensureReminderPermission();
  if (permission === "granted") {
    sendNotification({ title: "FloatList 测试提醒", body: "系统通知已配置成功。", sound: "Ping" });
  }
  return permission;
}
