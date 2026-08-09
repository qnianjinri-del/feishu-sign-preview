import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.ts";
import { config } from "../src/config.ts";
import { TaskSyncService } from "../src/services/task-sync-service.ts";
import type { RepositoryTask, TaskPatch, TaskRepository } from "../src/services/task-repository.ts";
import type { SyncTask } from "../src/types/task-sync.ts";

class RouteTaskRepository implements TaskRepository {
  tasks: RepositoryTask[] = [{
    id: "one",
    text: "第一项",
    status: "todo",
    priority: "none",
    order: 0,
    archived: false,
    remoteRecordId: "rec-one",
  }];

  async listTasks(includeArchived = false): Promise<RepositoryTask[]> {
    return this.tasks.filter((task) => includeArchived || !task.archived).map((task) => ({ ...task }));
  }

  async createTask(task: SyncTask): Promise<RepositoryTask> {
    const created = { ...task, archived: false, remoteRecordId: `rec-${task.id}` };
    this.tasks.push(created);
    return created;
  }

  async updateTask(task: RepositoryTask, patch: TaskPatch): Promise<void> {
    const stored = this.tasks.find((item) => item.id === task.id);
    if (!stored) throw new Error("missing route test task");
    const { blockedReason, ...rest } = patch;
    Object.assign(stored, rest);
    if (blockedReason === null) delete stored.blockedReason;
    else if (blockedReason !== undefined) stored.blockedReason = blockedReason;
  }
}

async function buildSyncTestApp() {
  return buildApp({
    appConfig: { ...config, floatlistClientToken: "test-client-token" },
    syncService: new TaskSyncService(new RouteTaskRepository()),
  });
}

test("FloatList snapshot route requires authentication and supports ETag", async () => {
  const app = await buildSyncTestApp();
  try {
    const unauthorized = await app.inject({ method: "GET", url: "/api/floatlist/v2/tasks" });
    assert.equal(unauthorized.statusCode, 401);

    const first = await app.inject({
      method: "GET",
      url: "/api/floatlist/v2/tasks",
      headers: { authorization: "Bearer test-client-token" },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().tasks[0].id, "one");
    assert.ok(first.headers.etag);

    const unchanged = await app.inject({
      method: "GET",
      url: "/api/floatlist/v2/tasks",
      headers: { authorization: "Bearer test-client-token", "if-none-match": first.headers.etag },
    });
    assert.equal(unchanged.statusCode, 304);
  } finally {
    await app.close();
  }
});

test("v1 sync routes require a coordinated desktop upgrade", async () => {
  const app = await buildSyncTestApp();
  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/floatlist/v1/tasks",
      headers: { authorization: "Bearer test-client-token" },
    });
    assert.equal(response.statusCode, 426);
    assert.deepEqual(response.json(), {
      error: "FloatList desktop 0.3.0 or newer is required by this gateway.",
      minimumDesktopVersion: "0.3.0",
      syncApiVersion: 2,
    });
  } finally {
    await app.close();
  }
});

test("FloatList mutation route validates idempotency and returns authoritative state", async () => {
  const app = await buildSyncTestApp();
  try {
    const missingKey = await app.inject({
      method: "POST",
      url: "/api/floatlist/v2/mutations",
      headers: { authorization: "Bearer test-client-token" },
      payload: { operations: [{ operationId: "block", type: "patch", taskId: "one", changes: { status: "blocked", blockedReason: "等待权限" } }] },
    });
    assert.equal(missingKey.statusCode, 400);

    const response = await app.inject({
      method: "POST",
      url: "/api/floatlist/v2/mutations",
      headers: { authorization: "Bearer test-client-token", "idempotency-key": "block-one" },
      payload: { operations: [{ operationId: "block", type: "patch", taskId: "one", changes: { status: "blocked", blockedReason: "等待权限" } }] },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().tasks[0], {
      id: "one",
      text: "第一项",
      status: "blocked",
      priority: "none",
      order: 0,
      blockedReason: "等待权限",
      remoteRecordId: "rec-one",
    });
  } finally {
    await app.close();
  }
});

test("health routes report whether sync is configured", async () => {
  const app = await buildApp({
    appConfig: { ...config, floatlistClientToken: "" },
    syncService: new TaskSyncService(new RouteTaskRepository()),
  });
  try {
    const live = await app.inject({ method: "GET", url: "/health/live" });
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    assert.deepEqual(live.json(), { status: "ok" });
    assert.equal(ready.statusCode, 200);
    assert.equal(ready.json().syncConfigured, false);
  } finally {
    await app.close();
  }
});

test("FloatList sync routes rate limit repeated clients", async () => {
  const app = await buildApp({
    appConfig: {
      ...config,
      floatlistClientToken: "test-client-token",
      floatlistRateLimitMaxRequests: 1,
    },
    syncService: new TaskSyncService(new RouteTaskRepository()),
  });
  try {
    const headers = { authorization: "Bearer test-client-token" };
    const first = await app.inject({ method: "GET", url: "/api/floatlist/v2/tasks", headers });
    const limited = await app.inject({ method: "GET", url: "/api/floatlist/v2/tasks", headers });
    assert.equal(first.statusCode, 200);
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);
  } finally {
    await app.close();
  }
});
