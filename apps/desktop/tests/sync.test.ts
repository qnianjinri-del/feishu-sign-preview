import { beforeEach, describe, expect, it } from "vitest";
import { resetTaskStoreForTests, useTaskStore } from "../src/stores/taskStore";
import type { PersistedState } from "../src/types/state";
import type { TaskSnapshot } from "../src/types/sync";
import { DEFAULT_SETTINGS } from "../src/utils/defaults";

const syncedState = (): PersistedState => ({
  schemaVersion: 5,
  tasks: [{
    id: "remote-one",
    text: "已有事项",
    status: "todo",
    priority: "none",
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    remoteRecordId: "rec-one",
    syncState: "synced",
  }],
  settings: { ...DEFAULT_SETTINGS, syncEnabled: true },
  sync: { outbox: [], lastServerVersion: "version-one" },
});

function snapshot(tasks: TaskSnapshot["tasks"], version = "version-two"): TaskSnapshot {
  return { version, tasks, warnings: [] };
}

describe("task synchronization state", () => {
  beforeEach(() => resetTaskStoreForTests(syncedState()));

  it("queues local create, edit, status, and archive operations", () => {
    useTaskStore.getState().addTask("新增事项");
    const created = useTaskStore.getState().tasks.find((task) => task.text === "新增事项");
    expect(created).toBeDefined();
    expect(useTaskStore.getState().sync.outbox[0]).toMatchObject({
      type: "create",
      task: { id: created?.id, text: "新增事项" },
    });

    useTaskStore.getState().editTask("remote-one", "修改正文");
    useTaskStore.getState().setDoingTask("remote-one");
    useTaskStore.getState().deleteTask("remote-one");
    expect(useTaskStore.getState().sync.outbox.map((mutation) => mutation.type)).toEqual([
      "create",
      "patch",
      "patch",
      "archive",
      "reorder",
    ]);
  });

  it("queues a child creation when its parent already exists remotely", () => {
    expect(useTaskStore.getState().addSubtask("remote-one", "下一步")).toBe(true);
    expect(useTaskStore.getState().sync.outbox).toHaveLength(1);
    expect(useTaskStore.getState().sync.outbox[0]).toMatchObject({
      type: "create",
      task: { parentId: "remote-one", text: "下一步" },
    });
  });

  it("queues only child status changes when a child starts doing", () => {
    const initial = syncedState();
    initial.tasks = [
      { ...initial.tasks[0], id: "old-root", status: "doing", priority: "none", order: 0 },
      { ...initial.tasks[0], id: "parent", text: "父事项", order: 1 },
      { ...initial.tasks[0], id: "old-child", parentId: "parent", text: "旧步骤", status: "doing", priority: "none", order: 0 },
      { ...initial.tasks[0], id: "new-child", parentId: "parent", text: "新步骤", order: 1 },
    ];
    resetTaskStoreForTests(initial);

    useTaskStore.getState().setDoingTask("new-child");

    expect(useTaskStore.getState().sync.outbox.map((mutation) => (
      "taskId" in mutation ? [mutation.taskId, mutation.type] : ["", mutation.type]
    ))).toEqual([
      ["old-child", "patch"],
      ["new-child", "patch"],
    ]);
  });

  it("requires a choice before first sync replaces local-only tasks", () => {
    const initial = syncedState();
    initial.sync = { outbox: [] };
    resetTaskStoreForTests(initial);
    const applied = useTaskStore.getState().applyRemoteSnapshot(snapshot([{
      id: "from-feishu",
      text: "飞书事项",
      status: "doing",
      priority: "none",
      order: 0,
      remoteRecordId: "rec-feishu",
    }]));
    expect(applied).toBe(false);
    expect(useTaskStore.getState().syncRuntime).toMatchObject({
      status: "attention",
      conflictKind: "initial",
    });
    expect(useTaskStore.getState().tasks[0].id).toBe("remote-one");

    useTaskStore.getState().acceptRemoteSnapshot();
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      id: "from-feishu",
      status: "doing",
      priority: "none",
      syncState: "synced",
    });
  });

  it("clears only acknowledged outbox operations and applies the authoritative snapshot", () => {
    useTaskStore.getState().editTask("remote-one", "本地修改");
    const operationId = useTaskStore.getState().sync.outbox[0].operationId;
    useTaskStore.getState().completeSync(snapshot([{
      id: "remote-one",
      text: "本地修改",
      status: "todo",
      priority: "none",
      order: 0,
      remoteRecordId: "rec-one",
    }]), [operationId]);
    expect(useTaskStore.getState().sync.outbox).toEqual([]);
    expect(useTaskStore.getState().tasks[0]).toMatchObject({
      text: "本地修改",
      syncState: "synced",
    });
    expect(useTaskStore.getState().sync.lastServerVersion).toBe("version-two");
  });
});
