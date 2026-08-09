import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../src/types/task";

const notificationMocks = vi.hoisted(() => ({
  cancelAll: vi.fn(() => Promise.resolve()),
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve("granted" as NotificationPermission)),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  ...notificationMocks,
  Schedule: { at: (date: Date) => ({ at: date }) },
}));

import {
  ensureReminderPermission,
  reconcileTaskReminders,
  sendTestReminder,
} from "../src/services/notifications";

const future = new Date(Date.now() + 60_000).toISOString();
const task = (patch: Partial<Task> = {}): Task => ({
  id: "task-one",
  text: "提交发布包",
  status: "todo",
  priority: "high",
  order: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  syncState: "synced",
  reminderAt: future,
  ...patch,
});

describe("native reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationMocks.isPermissionGranted.mockResolvedValue(true);
    notificationMocks.requestPermission.mockResolvedValue("granted");
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  });

  it("cancels stale schedules and rebuilds only future incomplete reminders", async () => {
    await reconcileTaskReminders([
      task(),
      task({ id: "done", status: "done" }),
      task({ id: "past", reminderAt: new Date(Date.now() - 60_000).toISOString() }),
    ], true);
    expect(notificationMocks.cancelAll).toHaveBeenCalledOnce();
    expect(notificationMocks.sendNotification).toHaveBeenCalledOnce();
    expect(notificationMocks.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ body: "提交发布包" }));
  });

  it("preserves settings without scheduling when permission is denied", async () => {
    notificationMocks.isPermissionGranted.mockResolvedValue(false);
    notificationMocks.requestPermission.mockResolvedValue("denied");
    expect(await ensureReminderPermission()).toBe("not-granted");
    expect(await reconcileTaskReminders([task()], true)).toBe("not-granted");
    expect(notificationMocks.cancelAll).not.toHaveBeenCalled();
  });

  it("requests permission before a test notification", async () => {
    notificationMocks.isPermissionGranted.mockResolvedValue(false);
    expect(await sendTestReminder()).toBe("granted");
    expect(notificationMocks.requestPermission).toHaveBeenCalledOnce();
    expect(notificationMocks.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ title: "FloatList 测试提醒" }));
  });
});
