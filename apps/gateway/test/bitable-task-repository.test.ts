import assert from "node:assert/strict";
import test from "node:test";

import {
  BitableTaskRepository,
  SyncConfigurationError,
} from "../src/services/bitable-task-repository.ts";

function createJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERROR",
    async json() {
      return payload;
    },
  };
}

function createOptions(fetchFn: (url: string, init?: RequestInit) => Promise<ReturnType<typeof createJsonResponse>>) {
  return {
    apiBaseUrl: "https://open.feishu.test/open-apis",
    appId: "cli_test",
    appSecret: "secret_test",
    appToken: "app_test",
    tableId: "tbl_test",
    resultFieldName: "任务名",
    statusFieldName: "任务状态",
    subtaskStatusFieldName: "子状态",
    childStatusFieldName: "FloatList子事项状态",
    subtaskDataFieldName: "FloatList子事项数据",
    syncIdFieldName: "FloatList同步ID",
    orderFieldName: "FloatList顺序",
    archivedFieldName: "FloatList归档",
    parentIdFieldName: "FloatList父事项ID",
    blockedReasonFieldName: "FloatList受阻原因",
    targetStatus: "在干",
    fetchFn,
  };
}

test("BitableTaskRepository maps hierarchy fields and backfills missing stable IDs", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = new BitableTaskRepository(createOptions(async (url, init) => {
    requests.push({ url, init });
    if (url.includes("/auth/v3/tenant_access_token/internal")) {
      return createJsonResponse({ code: 0, tenant_access_token: "tenant_test", expire: 7_200 });
    }
    if (url.includes("/records/search")) {
      return createJsonResponse({
        code: 0,
        data: {
          has_more: false,
          items: [
            {
              record_id: "rec_parent",
              last_modified_time: 1_784_707_200_000,
              fields: {
                FloatList同步ID: "parent",
                任务名: [{ text: "父事项" }],
                任务状态: "在干",
                FloatList顺序: 3,
                FloatList归档: false,
                FloatList父事项ID: "",
                FloatList受阻原因: "",
                FloatList子事项数据: "[]",
              },
            },
            {
              record_id: "rec_child",
              fields: {
                任务名: "子事项",
                任务状态: "待办",
                子状态: "受阻",
                FloatList顺序: "8",
                FloatList归档: "否",
                FloatList父事项ID: "parent",
                FloatList受阻原因: "等待接口权限",
              },
            },
          ],
        },
      });
    }
    return createJsonResponse({ code: 0, data: {} });
  }));

  const tasks = await repository.listTasks(true);

  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], {
    id: "parent",
    text: "父事项",
    status: "doing",
    priority: "none",
    order: 3,
    archived: false,
    remoteRecordId: "rec_parent",
    remoteUpdatedAt: "2026-07-22T08:00:00.000Z",
  });
  assert.equal(tasks[1]?.text, "子事项");
  assert.equal(tasks[1]?.status, "blocked");
  assert.equal(tasks[1]?.parentId, "parent");
  assert.equal(tasks[1]?.blockedReason, "等待接口权限");
  assert.match(tasks[1]?.id ?? "", /^[0-9a-f-]{36}$/);

  const searchBody = JSON.parse(String(requests[1]?.init?.body));
  assert.equal(searchBody.view_id, undefined);
  assert.deepEqual(searchBody.field_names, [
    "FloatList同步ID",
    "任务名",
    "任务状态",
    "子状态",
    "FloatList子事项状态",
    "FloatList子事项数据",
    "FloatList顺序",
    "FloatList归档",
    "FloatList父事项ID",
    "FloatList受阻原因",
    "日期",
    "FloatList截止时刻",
    "优先级",
    "FloatList提醒时间",
  ]);
  assert.equal(requests[1]?.init?.headers && (requests[1].init.headers as Record<string, string>).Authorization, "Bearer tenant_test");
  assert.match(requests[2]?.url ?? "", /\/records\/rec_child$/);
  const backfillBody = JSON.parse(String(requests[2]?.init?.body));
  assert.equal(backfillBody.fields.FloatList同步ID, tasks[1]?.id);
  assert.equal(backfillBody.fields.子状态, "");
  assert.equal(backfillBody.fields.FloatList子事项状态, "受阻");
});

test("BitableTaskRepository creates and updates a child inside its parent row", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = new BitableTaskRepository(createOptions(async (url, init) => {
    requests.push({ url, init });
    if (url.includes("/auth/v3/tenant_access_token/internal")) {
      return createJsonResponse({ code: 0, tenant_access_token: "tenant_test", expire: 7_200 });
    }
    if (url.includes("/records/search")) {
      return createJsonResponse({
        code: 0,
        data: {
          has_more: false,
          items: [{
            record_id: "rec_parent",
            fields: {
              FloatList同步ID: "parent",
              任务名: "父事项",
              任务状态: "在干",
              FloatList顺序: 0,
              FloatList归档: false,
              FloatList父事项ID: "",
              FloatList子事项数据: "[]",
            },
          }],
        },
      });
    }
    return createJsonResponse({ code: 0, data: {} });
  }));

  await repository.listTasks(true);
  const created = await repository.createTask({
    id: "child",
    text: "等待后端联调",
    status: "blocked",
    order: 1,
    parentId: "parent",
    blockedReason: "没有测试账号",
  });
  await repository.updateTask(created, {
    status: "todo",
    blockedReason: null,
    order: 0,
  });

  assert.equal(created.remoteRecordId, "rec_parent");
  const createBody = JSON.parse(String(requests[2]?.init?.body));
  const createdChildren = JSON.parse(createBody.fields.FloatList子事项数据);
  assert.equal(createdChildren.length, 1);
  assert.deepEqual(createdChildren[0], {
    id: "child",
    text: "等待后端联调",
    status: "blocked",
    order: 1,
    archived: false,
    parentId: "parent",
    blockedReason: "没有测试账号",
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  });
  const updateBody = JSON.parse(String(requests[3]?.init?.body));
  const updatedChildren = JSON.parse(updateBody.fields.FloatList子事项数据);
  assert.equal(updatedChildren.length, 1);
  assert.equal(updatedChildren[0].status, "todo");
  assert.equal(updatedChildren[0].order, 0);
  assert.equal(updatedChildren[0].blockedReason, undefined);
  assert.equal(requests[3]?.init?.method, "PUT");
});

test("BitableTaskRepository reads embedded children without duplicating a matching legacy row", async () => {
  const repository = new BitableTaskRepository(createOptions(async (url) => {
    if (url.includes("/auth/v3/tenant_access_token/internal")) {
      return createJsonResponse({ code: 0, tenant_access_token: "tenant_test", expire: 7_200 });
    }
    if (url.includes("/records/search")) {
      return createJsonResponse({
        code: 0,
        data: {
          has_more: false,
          items: [
            {
              record_id: "rec_parent",
              last_modified_time: 1_784_707_200_000,
              fields: {
                FloatList同步ID: "parent",
                任务名: "父事项",
                任务状态: "在干",
                FloatList顺序: 0,
                FloatList归档: false,
                FloatList父事项ID: "",
                FloatList子事项数据: JSON.stringify([{
                  id: "child",
                  text: "当前推进步骤",
                  status: "doing",
                  order: 0,
                  archived: false,
                  parentId: "parent",
                }]),
              },
            },
            {
              record_id: "rec_legacy_child",
              fields: {
                FloatList同步ID: "child",
                任务名: "当前推进步骤",
                任务状态: "待办",
                FloatList子事项状态: "在干",
                FloatList顺序: 0,
                FloatList归档: false,
                FloatList父事项ID: "parent",
              },
            },
          ],
        },
      });
    }
    return createJsonResponse({ code: 0, data: {} });
  }));

  const tasks = await repository.listTasks(true);

  assert.equal(tasks.length, 2);
  assert.equal(tasks[1]?.id, "child");
  assert.equal(tasks[1]?.status, "doing");
  assert.equal(tasks[1]?.remoteRecordId, "rec_parent");
});

test("BitableTaskRepository writes the derived subtask name on the parent row", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = new BitableTaskRepository(createOptions(async (url, init) => {
    requests.push({ url, init });
    if (url.includes("/auth/v3/tenant_access_token/internal")) {
      return createJsonResponse({ code: 0, tenant_access_token: "tenant_test", expire: 7_200 });
    }
    return createJsonResponse({ code: 0, data: {} });
  }));

  await repository.updateTask({
    id: "parent",
    text: "父事项",
    status: "doing",
    order: 0,
    archived: false,
    remoteRecordId: "rec_parent",
  }, { subtaskSummary: "当前推进步骤" });

  const updateBody = JSON.parse(String(requests[1]?.init?.body));
  assert.deepEqual(updateBody.fields, { 子状态: "当前推进步骤" });
});

test("BitableTaskRepository fails fast when sync credentials are absent", async () => {
  const repository = new BitableTaskRepository({
    appId: "",
    appSecret: "",
    appToken: "",
    tableId: "",
  });

  await assert.rejects(repository.listTasks(), SyncConfigurationError);
});
