import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskScheduleEditor } from "../src/components/TaskScheduleEditor/TaskScheduleEditor";
import { resetTaskStoreForTests, useTaskStore } from "../src/stores/taskStore";
import type { PersistedState } from "../src/types/state";
import { DEFAULT_SETTINGS } from "../src/utils/defaults";

const notificationMocks = vi.hoisted(() => ({
  ensureReminderPermission: vi.fn(() => Promise.resolve("granted" as const)),
}));
vi.mock("../src/services/notifications", () => notificationMocks);

const makeState = (): PersistedState => ({
  schemaVersion: 5,
  tasks: [{
    id: "scheduled",
    text: "发布安装包",
    status: "todo",
    priority: "none",
    order: 0,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    syncState: "pending",
  }],
  settings: { ...DEFAULT_SETTINGS },
  sync: { outbox: [] },
});

describe("TaskScheduleEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTaskStoreForTests(makeState());
  });

  it("saves priority, date, time and a reminder preset", async () => {
    const onClose = vi.fn();
    render(<TaskScheduleEditor task={useTaskStore.getState().tasks[0]} onClose={onClose} />);
    await userEvent.selectOptions(screen.getByLabelText("优先级"), "high");
    await userEvent.type(screen.getByLabelText("截止日期"), "2026-08-12");
    await userEvent.type(screen.getByLabelText("时刻（可选）"), "18:30");
    await userEvent.click(screen.getByRole("button", { name: "提前 1 小时" }));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      priority: "high",
      dueDate: "2026-08-12",
      dueTime: "18:30",
      reminderAt: new Date(2026, 7, 12, 17, 30).toISOString(),
    });
    expect(notificationMocks.ensureReminderPermission).toHaveBeenCalledOnce();
  });

  it("rejects a newly entered reminder after its deadline", async () => {
    render(<TaskScheduleEditor task={useTaskStore.getState().tasks[0]} onClose={() => undefined} />);
    await userEvent.type(screen.getByLabelText("截止日期"), "2026-08-12");
    await userEvent.type(screen.getByLabelText("时刻（可选）"), "09:00");
    await userEvent.type(screen.getByLabelText("自定义提醒（可独立设置）"), "2026-08-12T10:00");
    expect(screen.getByText("提醒不能晚于截止时间")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(useTaskStore.getState().tasks[0]?.dueDate).toBeUndefined();
    expect(useTaskStore.getState().toast?.message).toBe("提醒不能晚于截止时间");
  });

  it("allows a standalone custom reminder and cancellation", async () => {
    const onClose = vi.fn();
    render(<TaskScheduleEditor task={useTaskStore.getState().tasks[0]} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText("自定义提醒（可独立设置）"), "2026-08-13T09:00");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(useTaskStore.getState().tasks[0]?.reminderAt).toBe(new Date(2026, 7, 13, 9).toISOString());

    render(<TaskScheduleEditor task={useTaskStore.getState().tasks[0]} onClose={onClose} />);
    await userEvent.click(screen.getAllByRole("button", { name: "取消" }).at(-1)!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
