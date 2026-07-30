import { beforeEach, describe, expect, it } from "vitest";
import { setMemoryPersistedStateForTests } from "../src/services/persistence";
import { resetTaskStoreForTests, useTaskStore } from "../src/stores/taskStore";
import type { PersistedState } from "../src/types/state";
import { DEFAULT_SETTINGS } from "../src/utils/defaults";

const emptyState = (): PersistedState => ({
  schemaVersion: 3,
  tasks: [],
  settings: { ...DEFAULT_SETTINGS },
  sync: { outbox: [] },
});

describe("task store", () => {
  beforeEach(() => {
    setMemoryPersistedStateForTests(undefined);
    resetTaskStoreForTests(emptyState());
  });

  it("adds and edits tasks", () => {
    useTaskStore.getState().addTask(" 写测试 ");
    const added = useTaskStore.getState().tasks[0];
    expect(added.text).toBe("写测试");
    useTaskStore.getState().editTask(added.id, "更新测试");
    expect(useTaskStore.getState().tasks[0].text).toBe("更新测试");
  });

  it("deletes and restores with undo", () => {
    useTaskStore.getState().addTasks(["一", "二"]);
    const first = useTaskStore.getState().tasks[0];
    useTaskStore.getState().deleteTask(first.id);
    expect(useTaskStore.getState().tasks.map((task) => task.text)).toEqual(["二"]);
    useTaskStore.getState().undo();
    expect(useTaskStore.getState().tasks.map((task) => task.text)).toEqual(["一", "二"]);
  });

  it("adds one-level child items and cascades parent deletion", () => {
    useTaskStore.getState().addTask("主事项");
    const parentId = useTaskStore.getState().tasks[0].id;
    expect(useTaskStore.getState().addSubtask(parentId, "第一步")).toBe(true);
    expect(useTaskStore.getState().addSubtask(parentId, "第二步")).toBe(true);
    expect(useTaskStore.getState().tasks.map((task) => [task.text, task.parentId, task.order])).toEqual([
      ["主事项", undefined, 0],
      ["第一步", parentId, 0],
      ["第二步", parentId, 1],
    ]);
    expect(useTaskStore.getState().addSubtask(useTaskStore.getState().tasks[1].id, "不允许的孙事项")).toBe(false);

    useTaskStore.getState().deleteTask(parentId);
    expect(useTaskStore.getState().tasks).toHaveLength(0);
    useTaskStore.getState().undo();
    expect(useTaskStore.getState().tasks).toHaveLength(3);
  });

  it("requires all child items to finish before completing the parent", () => {
    useTaskStore.getState().addTask("主事项");
    const parentId = useTaskStore.getState().tasks[0].id;
    useTaskStore.getState().addSubtask(parentId, "第一步");
    const childId = useTaskStore.getState().tasks[1].id;

    useTaskStore.getState().toggleTask(parentId);
    expect(useTaskStore.getState().tasks[0].status).toBe("todo");
    expect(useTaskStore.getState().toast?.message).toBe("还有 1 个子事项未完成");

    useTaskStore.getState().toggleTask(childId);
    useTaskStore.getState().toggleTask(parentId);
    expect(useTaskStore.getState().tasks.find((task) => task.id === parentId)?.status).toBe("done");
  });

  it("reopens a finished parent when a new child item is added", () => {
    useTaskStore.getState().addTask("已交付事项");
    const parentId = useTaskStore.getState().tasks[0].id;
    useTaskStore.getState().toggleTask(parentId);
    useTaskStore.getState().addSubtask(parentId, "补充检查");
    expect(useTaskStore.getState().tasks.find((task) => task.id === parentId)?.status).toBe("todo");
  });

  it("stores a blocked reason and reopens a completed parent", () => {
    useTaskStore.getState().addTask("主事项");
    const parentId = useTaskStore.getState().tasks[0].id;
    useTaskStore.getState().addSubtask(parentId, "等待确认");
    const childId = useTaskStore.getState().tasks[1].id;
    useTaskStore.getState().toggleTask(childId);
    useTaskStore.getState().toggleTask(parentId);
    useTaskStore.getState().setTaskBlocked(childId, "等待产品确认范围");
    expect(useTaskStore.getState().tasks.find((task) => task.id === childId)).toMatchObject({
      status: "blocked",
      blockedReason: "等待产品确认范围",
    });
    expect(useTaskStore.getState().tasks.find((task) => task.id === parentId)?.status).toBe("todo");
  });

  it("completes and uncompletes without changing order", () => {
    useTaskStore.getState().addTasks(["一", "二"]);
    const first = useTaskStore.getState().tasks[0];
    useTaskStore.getState().toggleTask(first.id);
    expect(useTaskStore.getState().tasks[0].status).toBe("done");
    expect(useTaskStore.getState().tasks.map((task) => task.text)).toEqual(["一", "二"]);
    useTaskStore.getState().toggleTask(first.id);
    expect(useTaskStore.getState().tasks[0].status).toBe("todo");
  });

  it("keeps exactly one doing task", () => {
    useTaskStore.getState().addTasks(["一", "二"]);
    const [first, second] = useTaskStore.getState().tasks;
    useTaskStore.getState().setDoingTask(first.id);
    useTaskStore.getState().setDoingTask(second.id);
    expect(useTaskStore.getState().tasks.map((task) => task.status)).toEqual(["todo", "doing"]);
  });

  it("keeps child doing state separate from the root current task", () => {
    useTaskStore.getState().addTasks(["旧主事项", "新主事项"]);
    const [oldRoot, newRoot] = useTaskStore.getState().tasks;
    useTaskStore.getState().addSubtask(newRoot.id, "第一步");
    useTaskStore.getState().addSubtask(newRoot.id, "第二步");
    const [firstChild, secondChild] = useTaskStore.getState().tasks.filter((task) => task.parentId === newRoot.id);

    useTaskStore.getState().setDoingTask(oldRoot.id);
    useTaskStore.getState().setDoingTask(firstChild.id);
    useTaskStore.getState().setDoingTask(secondChild.id);

    expect(useTaskStore.getState().tasks.map(({ id, status }) => [id, status])).toEqual([
      [oldRoot.id, "doing"],
      [newRoot.id, "todo"],
      [firstChild.id, "todo"],
      [secondChild.id, "doing"],
    ]);
  });

  it("completes a doing task and restores it to todo", () => {
    useTaskStore.getState().addTask("进行中");
    const id = useTaskStore.getState().tasks[0].id;
    useTaskStore.getState().setDoingTask(id);
    useTaskStore.getState().toggleTask(id);
    expect(useTaskStore.getState().tasks[0].status).toBe("done");
    useTaskStore.getState().toggleTask(id);
    expect(useTaskStore.getState().tasks[0].status).toBe("todo");
  });

  it("clears completed tasks", () => {
    useTaskStore.getState().addTasks(["完成", "保留"]);
    useTaskStore.getState().toggleTask(useTaskStore.getState().tasks[0].id);
    useTaskStore.getState().clearCompleted();
    expect(useTaskStore.getState().tasks.map((task) => task.text)).toEqual(["保留"]);
  });

  it("reorders tasks", () => {
    useTaskStore.getState().addTasks(["一", "二", "三"]);
    const tasks = useTaskStore.getState().tasks;
    useTaskStore.getState().reorderTasks(tasks[0].id, tasks[2].id);
    expect(useTaskStore.getState().tasks.map((task) => task.text)).toEqual(["二", "三", "一"]);
  });

  it("hiding completed tasks only changes settings", () => {
    useTaskStore.getState().addTask("任务");
    const id = useTaskStore.getState().tasks[0].id;
    useTaskStore.getState().toggleTask(id);
    useTaskStore.getState().setShowCompleted(false);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().settings.showCompleted).toBe(false);
  });

  it("hydrates an equivalent persisted state", async () => {
    const persisted = emptyState();
    persisted.tasks = [{ id: "saved", text: "已保存", status: "done", order: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:00.000Z", syncState: "pending" }];
    persisted.settings.opacity = 0.6;
    setMemoryPersistedStateForTests(persisted);
    useTaskStore.setState({ hydrated: false });
    await useTaskStore.getState().hydrate();
    expect(useTaskStore.getState().tasks).toEqual(persisted.tasks);
    expect(useTaskStore.getState().settings.opacity).toBe(0.6);
  });
});
