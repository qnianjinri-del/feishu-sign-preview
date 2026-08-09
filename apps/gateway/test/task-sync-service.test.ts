import assert from "node:assert/strict";
import test from "node:test";

import {
  SyncValidationError,
  SyncVersionConflictError,
  TaskSyncService,
} from "../src/services/task-sync-service.ts";
import type { RepositoryTask, TaskPatch, TaskRepository } from "../src/services/task-repository.ts";
import type { SyncTask } from "../src/types/task-sync.ts";

class FakeTaskRepository implements TaskRepository {
  readonly updates: Array<{ id: string; patch: TaskPatch }> = [];
  activeWrites = 0;
  maxActiveWrites = 0;

  constructor(
    readonly tasks: RepositoryTask[],
    private readonly delayMs = 0,
  ) {}

  async listTasks(includeArchived = false): Promise<RepositoryTask[]> {
    return this.tasks.filter((task) => includeArchived || !task.archived).map((task) => ({ ...task }));
  }

  async createTask(task: SyncTask): Promise<RepositoryTask> {
    const created = { ...task, archived: false, remoteRecordId: `rec-${task.id}` };
    this.tasks.push(created);
    return { ...created };
  }

  async updateTask(task: RepositoryTask, patch: TaskPatch): Promise<void> {
    this.activeWrites += 1;
    this.maxActiveWrites = Math.max(this.maxActiveWrites, this.activeWrites);
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const stored = this.tasks.find((item) => item.id === task.id);
    if (!stored) throw new Error("missing fake task");
    const { blockedReason, ...rest } = patch;
    Object.assign(stored, rest);
    if (blockedReason === null) delete stored.blockedReason;
    else if (blockedReason !== undefined) stored.blockedReason = blockedReason;
    this.updates.push({ id: task.id, patch: { ...patch } });
    this.activeWrites -= 1;
  }
}

function task(id: string, status: RepositoryTask["status"] = "todo", order = 0): RepositoryTask {
  return { id, text: id, status, priority: "none", order, archived: false, remoteRecordId: `rec-${id}` };
}

test("TaskSyncService treats root and child doing states independently", async () => {
  const parent = task("parent", "doing", 4);
  const child = { ...task("child", "doing", 9), parentId: parent.id };
  const repository = new FakeTaskRepository([parent, child]);
  const service = new TaskSyncService(repository);
  const first = await service.getSnapshot();
  const second = await service.getSnapshot();

  assert.deepEqual(first.tasks.map(({ id, order }) => [id, order]), [["parent", 0], ["child", 0]]);
  assert.equal(first.warnings.length, 0);
  assert.equal(first.version, second.version);
  assert.deepEqual(repository.updates[0], {
    id: "parent",
    patch: { subtaskSummary: "child" },
  });
});

test("snapshot versions ignore remote metadata but track semantic task changes", async () => {
  const original = {
    ...task("stable"),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    remoteUpdatedAt: "2026-01-01T00:00:00.000Z",
  };
  const repository = new FakeTaskRepository([original]);
  const service = new TaskSyncService(repository);
  const first = await service.getSnapshot();

  original.remoteRecordId = "rec-reconciled";
  original.updatedAt = "2026-01-02T00:00:00.000Z";
  original.remoteUpdatedAt = "2026-01-02T00:00:00.000Z";
  const metadataOnly = await service.getSnapshot();
  assert.equal(metadataOnly.version, first.version);

  original.text = "用户修改后的内容";
  const semanticChange = await service.getSnapshot();
  assert.notEqual(semanticChange.version, first.version);

  original.text = "stable";
  original.priority = "high";
  original.dueDate = "2026-08-10";
  original.dueTime = "18:00";
  original.reminderAt = "2026-08-10T09:00:00.000Z";
  const scheduledChange = await service.getSnapshot();
  assert.notEqual(scheduledChange.version, first.version);
});

test("rejects reminders later than the effective due time", async () => {
  const repository = new FakeTaskRepository([{ ...task("scheduled"), dueDate: "2026-08-10", dueTime: "18:00" }]);
  const service = new TaskSyncService(repository, { timeZone: "Asia/Shanghai" });
  await assert.rejects(service.applyMutations({
    operations: [{
      operationId: "bad-reminder",
      type: "patch",
      taskId: "scheduled",
      changes: { reminderAt: "2026-08-10T10:01:00.000Z" },
    }],
  }, "bad-reminder"), SyncValidationError);
});

test("TaskSyncService shows a single child name and clears ambiguous idle child summaries", async () => {
  const singleParent = task("single-parent");
  const onlyChild = { ...task("only-child"), parentId: singleParent.id, text: "唯一子项" };
  const multiParent = { ...task("multi-parent", "todo", 1), subtaskSummary: "过期摘要" };
  const first = { ...task("first"), parentId: multiParent.id };
  const second = { ...task("second", "todo", 1), parentId: multiParent.id };
  const repository = new FakeTaskRepository([singleParent, onlyChild, multiParent, first, second]);

  await new TaskSyncService(repository).getSnapshot();

  assert.deepEqual(repository.updates, [
    { id: "single-parent", patch: { subtaskSummary: "唯一子项" } },
    { id: "multi-parent", patch: { subtaskSummary: null } },
  ]);
});

test("retries an already persisted create as an idempotent no-op", async () => {
  const existing = { ...task("created", "todo"), text: "已写入的事项" };
  const repository = new FakeTaskRepository([existing]);
  const service = new TaskSyncService(repository);

  const snapshot = await service.applyMutations({
    operations: [
      {
        operationId: "retry-create",
        type: "create",
        task: { id: existing.id, text: existing.text, status: "todo", priority: "none", order: existing.order },
      },
      { operationId: "finish-after-retry", type: "patch", taskId: existing.id, changes: { status: "done" } },
    ],
  }, "retry-create");

  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0]?.status, "done");
  assert.equal(repository.updates.length, 1);
});

test("rejects a create retry when the stable ID belongs to different content", async () => {
  const repository = new FakeTaskRepository([task("same-id")]);
  const service = new TaskSyncService(repository);

  await assert.rejects(
    service.applyMutations({
      operations: [{
        operationId: "conflicting-create",
        type: "create",
        task: { id: "same-id", text: "另一件事", status: "todo", priority: "none", order: 0 },
      }],
    }, "conflicting-create"),
    /different content/,
  );
});

test("patch doing is unique and retries are idempotent", async () => {
  const repository = new FakeTaskRepository([task("a", "doing"), task("b", "todo", 1)]);
  let invalidations = 0;
  const service = new TaskSyncService(repository, { invalidatePreview: () => { invalidations += 1; } });
  const request = {
    operations: [{ operationId: "op-doing", type: "patch" as const, taskId: "b", changes: { status: "doing" as const } }],
  };

  const first = await service.applyMutations(request, "same-request");
  const updateCount = repository.updates.length;
  const second = await service.applyMutations(request, "same-request");

  assert.deepEqual(first.tasks.map(({ id, status }) => [id, status]), [["a", "todo"], ["b", "doing"]]);
  assert.equal(second.version, first.version);
  assert.equal(repository.updates.length, updateCount);
  assert.equal(invalidations, 1);
});

test("setting a child doing leaves root status alone and only replaces a doing sibling", async () => {
  const oldRoot = task("old-root", "doing");
  const parent = task("parent", "todo", 1);
  const firstChild = { ...task("first-child", "doing"), parentId: parent.id };
  const secondChild = { ...task("second-child", "todo", 1), parentId: parent.id };
  const otherParent = task("other-parent", "todo", 2);
  const otherChild = { ...task("other-child", "doing"), parentId: otherParent.id };
  const service = new TaskSyncService(new FakeTaskRepository([
    oldRoot,
    parent,
    firstChild,
    secondChild,
    otherParent,
    otherChild,
  ]));

  const snapshot = await service.applyMutations({
    operations: [{ operationId: "do-child", type: "patch", taskId: secondChild.id, changes: { status: "doing" } }],
  }, "do-child");

  assert.deepEqual(
    snapshot.tasks.map(({ id, status }) => [id, status]),
    [
      ["old-root", "doing"],
      ["parent", "todo"],
      ["first-child", "todo"],
      ["second-child", "doing"],
      ["other-parent", "todo"],
      ["other-child", "doing"],
    ],
  );
});

test("parent completion requires completed children and blocked children reopen it", async () => {
  const parent = task("parent");
  const child = { ...task("child"), parentId: parent.id };
  const repository = new FakeTaskRepository([parent, child]);
  const service = new TaskSyncService(repository);

  await assert.rejects(
    service.applyMutations({ operations: [{ operationId: "finish-parent", type: "patch", taskId: parent.id, changes: { status: "done" } }] }, "finish-parent"),
    SyncValidationError,
  );
  await service.applyMutations({ operations: [{ operationId: "finish-child", type: "patch", taskId: child.id, changes: { status: "done" } }] }, "finish-child");
  await service.applyMutations({ operations: [{ operationId: "finish-parent-2", type: "patch", taskId: parent.id, changes: { status: "done" } }] }, "finish-parent-2");
  const blocked = await service.applyMutations({
    operations: [{ operationId: "block-child", type: "patch", taskId: child.id, changes: { status: "blocked", blockedReason: "等待接口权限" } }],
  }, "block-child");

  assert.equal(blocked.tasks.find((item) => item.id === parent.id)?.status, "todo");
  assert.deepEqual(blocked.tasks.find((item) => item.id === child.id), {
    id: "child",
    text: "child",
    status: "blocked",
    priority: "none",
    order: 0,
    parentId: "parent",
    blockedReason: "等待接口权限",
    remoteRecordId: "rec-child",
  });
});

test("creating active subtasks reopens a completed parent", async () => {
  const parent = task("parent", "done");
  const repository = new FakeTaskRepository([parent]);
  const service = new TaskSyncService(repository);

  const snapshot = await service.applyMutations({
    operations: [{
      operationId: "new-child",
      type: "create",
      task: { id: "child", text: "继续推进", status: "todo", priority: "none", order: 0, parentId: "parent" },
    }],
  }, "new-child");

  assert.equal(snapshot.tasks.find((item) => item.id === "parent")?.status, "todo");
  assert.equal(snapshot.tasks.find((item) => item.id === "child")?.parentId, "parent");
});

test("creating a doing task keeps the global doing state unique", async () => {
  const repository = new FakeTaskRepository([task("old", "doing")]);
  const service = new TaskSyncService(repository);

  const snapshot = await service.applyMutations({
    operations: [{
      operationId: "new-doing",
      type: "create",
      task: { id: "new", text: "新的当前事项", status: "doing", priority: "none", order: 1 },
    }],
  }, "new-doing");

  assert.deepEqual(snapshot.tasks.map(({ id, status }) => [id, status]), [["old", "todo"], ["new", "doing"]]);
});

test("an archived child cannot be restored below an archived parent", async () => {
  const parent = { ...task("parent"), archived: true };
  const child = { ...task("child"), parentId: "parent", archived: true };
  const service = new TaskSyncService(new FakeTaskRepository([parent, child]));

  await assert.rejects(
    service.applyMutations({ operations: [{ operationId: "restore-child", type: "restore", taskId: "child" }] }, "restore-child"),
    SyncValidationError,
  );
});

test("write requests are serialized per service", async () => {
  const repository = new FakeTaskRepository([task("a"), task("b", "todo", 1)], 15);
  const service = new TaskSyncService(repository);
  await Promise.all([
    service.applyMutations({ operations: [{ operationId: "edit-a", type: "patch", taskId: "a", changes: { text: "A" } }] }, "edit-a"),
    service.applyMutations({ operations: [{ operationId: "edit-b", type: "patch", taskId: "b", changes: { text: "B" } }] }, "edit-b"),
  ]);
  assert.equal(repository.maxActiveWrites, 1);
});

test("snapshot reads wait for an in-flight write", async () => {
  const repository = new FakeTaskRepository([task("a")], 20);
  const service = new TaskSyncService(repository);
  const mutation = service.applyMutations({
    operations: [{ operationId: "edit-a", type: "patch", taskId: "a", changes: { text: "A" } }],
  }, "edit-a");
  await new Promise((resolve) => setTimeout(resolve, 5));

  const [, snapshot] = await Promise.all([mutation, service.getSnapshot()]);

  assert.equal(snapshot.tasks[0]?.text, "A");
});

test("stale versions return the latest snapshot", async () => {
  const service = new TaskSyncService(new FakeTaskRepository([task("a")]));
  await assert.rejects(
    service.applyMutations({
      baseVersion: "stale",
      operations: [{ operationId: "edit-a", type: "patch", taskId: "a", changes: { text: "A" } }],
    }, "stale"),
    (error) => error instanceof SyncVersionConflictError && error.snapshot.tasks[0]?.id === "a",
  );
});
