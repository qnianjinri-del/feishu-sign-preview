import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Header } from "../src/components/Header/Header";
import { resetTaskStoreForTests } from "../src/stores/taskStore";
import type { PersistedState } from "../src/types/state";
import { DEFAULT_SETTINGS } from "../src/utils/defaults";

const state: PersistedState = {
  schemaVersion: 3,
  tasks: [
    {
      id: "doing",
      text: "整理合并方案",
      status: "doing",
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      syncState: "pending",
    },
  ],
  settings: { ...DEFAULT_SETTINGS },
  sync: { outbox: [] },
};

describe("Header", () => {
  beforeEach(() => resetTaskStoreForTests(state));

  it("shows the current doing task", () => {
    render(<Header completed={0} total={1} />);
    expect(screen.getByText("正在做：整理合并方案")).toHaveClass("active");
  });

  it("keeps the signature line on the root task when a child item is doing", () => {
    resetTaskStoreForTests({
      ...state,
      tasks: [
        { ...state.tasks[0], id: "parent", text: "合并项目", status: "doing" },
        { ...state.tasks[0], id: "child", parentId: "parent", text: "接入接口", status: "doing" },
      ],
    });
    render(<Header completed={0} total={1} />);
    expect(screen.getByText("正在做：合并项目")).toHaveClass("active");
    expect(screen.queryByText(/接入接口/)).not.toBeInTheDocument();
  });

  it("surfaces blocked work while idle", () => {
    resetTaskStoreForTests({
      ...state,
      tasks: [{ ...state.tasks[0], status: "blocked", blockedReason: "等待权限" }],
    });
    render(<Header completed={0} total={1} />);
    expect(screen.getByText("当前空闲 · 1 项受阻")).toHaveClass("warning");
  });
});
