import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TaskList } from "../src/components/TaskList/TaskList";
import { resetTaskStoreForTests, useTaskStore } from "../src/stores/taskStore";
import type { PersistedState } from "../src/types/state";
import { DEFAULT_SETTINGS } from "../src/utils/defaults";

const state: PersistedState = {
  schemaVersion: 4,
  tasks: [
    { id: "open", text: "未完成", status: "todo", order: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", syncState: "pending" },
    { id: "done", text: "已完成", status: "done", order: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:00.000Z", syncState: "pending" },
  ],
  settings: { ...DEFAULT_SETTINGS, showCompleted: false },
  sync: { outbox: [] },
};

describe("TaskList", () => {
  beforeEach(() => resetTaskStoreForTests(state));

  it("does not render completed tasks when they are hidden", () => {
    render(<TaskList onAdd={() => undefined} />);
    expect(screen.getByText("未完成")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
  });

  it("renders the doing state with its semantic class and label", () => {
    useTaskStore.getState().setDoingTask("open");
    render(<TaskList onAdd={() => undefined} />);
    const row = screen.getByRole("listitem", { name: "事项：未完成，正在做" });
    expect(row).toHaveClass("status-doing");
    expect(screen.getByText("正在做")).toBeInTheDocument();
  });

  it("hides completed root history after the completion day even when completed tasks are enabled", () => {
    resetTaskStoreForTests({
      ...state,
      tasks: [state.tasks[1]],
      settings: { ...DEFAULT_SETTINGS, showCompleted: true },
    });
    render(<TaskList onAdd={() => undefined} />);
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.getByText("历史完成事项仍保留在任务记录中")).toBeInTheDocument();
  });

  it("renders child progress and blocked details", () => {
    resetTaskStoreForTests({
      schemaVersion: 4,
      tasks: [
        { id: "parent", text: "合并项目", status: "todo", order: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", syncState: "pending" },
        { id: "done-child", parentId: "parent", text: "本地改造", status: "done", order: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", syncState: "pending" },
        { id: "blocked-child", parentId: "parent", text: "接入权限", status: "blocked", blockedReason: "等待管理员授权", order: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", syncState: "pending" },
      ],
      settings: { ...DEFAULT_SETTINGS },
      sync: { outbox: [] },
    });
    render(<TaskList onAdd={() => undefined} />);
    expect(screen.getByText("1/2 子事项已完成 · 1 项受阻")).toBeInTheDocument();
    expect(screen.getByText("本地改造")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "子事项：接入权限，受阻" })).toHaveClass("subtask-item", "status-blocked");
    expect(screen.getByText("卡点：等待管理员授权")).toBeInTheDocument();
  });

  it("disables sorting while a query is active and renders a useful empty state", () => {
    render(<TaskList onAdd={() => undefined} query="不存在" />);
    expect(screen.getByText("没有匹配的任务")).toBeInTheDocument();
  });

  it("disables drag handles for a matching filtered result", () => {
    render(<TaskList onAdd={() => undefined} query="未完成" />);
    expect(screen.getByRole("button", { name: "拖动调整事项顺序" })).toBeDisabled();
  });
});
