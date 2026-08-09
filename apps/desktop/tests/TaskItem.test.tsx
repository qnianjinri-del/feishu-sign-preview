import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { TaskItem } from "../src/components/TaskItem/TaskItem";
import { resetTaskStoreForTests, useTaskStore } from "../src/stores/taskStore";
import type { PersistedState } from "../src/types/state";
import { DEFAULT_SETTINGS } from "../src/utils/defaults";

const state: PersistedState = {
  schemaVersion: 5,
  tasks: [{ id: "one", text: "第一项", status: "todo", priority: "none", order: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", syncState: "pending" }],
  settings: { ...DEFAULT_SETTINGS },
  sync: { outbox: [] },
};

function renderItem() {
  const task = useTaskStore.getState().tasks[0];
  return render(<DndContext><SortableContext items={[task.id]}><ul><TaskItem task={task} /></ul></SortableContext></DndContext>);
}

describe("TaskItem", () => {
  beforeEach(() => resetTaskStoreForTests(state));

  it("toggles completion from the checkbox", async () => {
    renderItem();
    await userEvent.click(screen.getByRole("button", { name: "完成事项" }));
    expect(useTaskStore.getState().tasks[0].status).toBe("done");
  });

  it("marks a task as doing from the context menu", async () => {
    renderItem();
    fireEvent.contextMenu(screen.getByRole("listitem"));
    await userEvent.click(screen.getByRole("menuitem", { name: "标记为正在做" }));
    expect(useTaskStore.getState().tasks[0].status).toBe("doing");
  });

  it("opens the same accessible menu from the visible more button", async () => {
    renderItem();
    await userEvent.click(screen.getByRole("button", { name: "更多事项操作" }));
    expect(screen.getByRole("menu", { name: /事项操作/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "标记为正在做" })).toHaveFocus();
  });

  it("adds a child item from the item menu", async () => {
    renderItem();
    await userEvent.click(screen.getByRole("button", { name: "更多事项操作" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "添加子事项" }));
    await userEvent.type(screen.getByRole("textbox", { name: "新子事项" }), "核对接口{Enter}");
    expect(useTaskStore.getState().tasks[1]).toMatchObject({ text: "核对接口", parentId: "one", status: "todo" });
  });

  it("records why an item is blocked", async () => {
    renderItem();
    fireEvent.contextMenu(screen.getByRole("listitem"));
    await userEvent.click(screen.getByRole("menuitem", { name: "标记为受阻" }));
    await userEvent.type(screen.getByRole("textbox", { name: "受阻原因" }), "等待飞书权限{Enter}");
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ status: "blocked", priority: "none", blockedReason: "等待飞书权限" });
  });

  it("starts editing on double click and cancels with Escape", async () => {
    renderItem();
    await userEvent.dblClick(screen.getByText("第一项"));
    const editor = screen.getByRole("textbox", { name: "编辑事项" });
    await userEvent.clear(editor);
    await userEvent.type(editor, "不会保存{Escape}");
    expect(screen.queryByRole("textbox", { name: "编辑事项" })).not.toBeInTheDocument();
    expect(useTaskStore.getState().tasks[0].text).toBe("第一项");
  });

  it("saves editing with Enter", async () => {
    renderItem();
    await userEvent.dblClick(screen.getByText("第一项"));
    const editor = screen.getByRole("textbox", { name: "编辑事项" });
    await userEvent.clear(editor);
    await userEvent.type(editor, "已修改{Enter}");
    expect(useTaskStore.getState().tasks[0].text).toBe("已修改");
  });

  it("deletes a focused row only after an explicit row key event", () => {
    renderItem();
    fireEvent.keyDown(screen.getByRole("listitem"), { key: "Delete" });
    expect(useTaskStore.getState().tasks).toHaveLength(0);
  });
});
