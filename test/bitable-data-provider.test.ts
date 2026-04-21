import assert from "node:assert/strict";
import test from "node:test";

import { BitableDataProvider } from "../src/services/bitable-data-provider.ts";

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

test("BitableDataProvider returns the first matching current task", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new BitableDataProvider({
    appId: "cli_xxx",
    appSecret: "secret_xxx",
    logger: {},
    fetchFn: async (url, init) => {
      requests.push({ url, init });

      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return createJsonResponse({
          code: 0,
          tenant_access_token: "tenant_token",
          expire: 7200,
        });
      }

      return createJsonResponse({
        code: 0,
        data: {
          has_more: false,
          items: [
            {
              fields: {
                任务状态: "在干",
                任务名: [{ text: "进阶规划最新的作业模板" }],
              },
            },
          ],
        },
      });
    },
  });

  const value = await provider.getSlotValue("current_task", {
    sourceUrl: "http://127.0.0.1:3000/?slot=current_task",
  });

  assert.equal(value, "进阶规划最新的作业模板");
  assert.equal(requests.length, 2);
  assert.match(requests[1]?.url ?? "", /\/records\/search\?page_size=1/);

  const body = JSON.parse(String(requests[1]?.init?.body ?? "{}"));
  assert.equal(body.view_id, "vewbgk85az");
  assert.deepEqual(body.field_names, ["任务名", "任务状态"]);
  assert.equal(body.filter.conditions[0].field_name, "任务状态");
  assert.deepEqual(body.filter.conditions[0].value, ["在干"]);
});

test("BitableDataProvider returns 空闲中 when no record matches", async () => {
  const provider = new BitableDataProvider({
    appId: "cli_xxx",
    appSecret: "secret_xxx",
    logger: {},
    fetchFn: async (url) => {
      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return createJsonResponse({
          code: 0,
          tenant_access_token: "tenant_token",
          expire: 7200,
        });
      }

      return createJsonResponse({
        code: 0,
        data: {
          has_more: false,
          items: [],
        },
      });
    },
  });

  const value = await provider.getSlotValue("current_task", {
    sourceUrl: "http://127.0.0.1:3000/?slot=current_task",
  });

  assert.equal(value, "空闲中");
});

test("BitableDataProvider keeps a handler-safe fallback when Feishu API fails", async () => {
  const provider = new BitableDataProvider({
    appId: "cli_xxx",
    appSecret: "secret_xxx",
    logger: {},
    fetchFn: async () => {
      throw new Error("network error");
    },
  });

  const value = await provider.getSlotValue("current_task", {
    sourceUrl: "http://127.0.0.1:3000/?slot=current_task",
  });

  assert.equal(value, "空闲中");
});

test("BitableDataProvider uses cache within the TTL window", async () => {
  let now = 1_000;
  let fetchCount = 0;
  const provider = new BitableDataProvider({
    appId: "cli_xxx",
    appSecret: "secret_xxx",
    cacheTtlSeconds: 60,
    now: () => now,
    logger: {},
    fetchFn: async (url) => {
      fetchCount += 1;

      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return createJsonResponse({
          code: 0,
          tenant_access_token: "tenant_token",
          expire: 7200,
        });
      }

      return createJsonResponse({
        code: 0,
        data: {
          has_more: false,
          items: [
            {
              fields: {
                任务状态: "在干",
                任务名: "进阶规划最新的作业模板",
              },
            },
          ],
        },
      });
    },
  });

  const first = await provider.getSlotValue("current_task", {
    sourceUrl: "http://127.0.0.1:3000/?slot=current_task",
  });
  now += 30_000;
  const second = await provider.getSlotValue("current_task", {
    sourceUrl: "http://127.0.0.1:3000/?slot=current_task",
  });

  assert.equal(first, "进阶规划最新的作业模板");
  assert.equal(second, "进阶规划最新的作业模板");
  assert.equal(fetchCount, 2);
});
