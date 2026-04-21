import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "development";
process.env.PUBLIC_BASE_URL = "http://127.0.0.1:3000";
process.env.DEFAULT_JUMP_URL = "http://127.0.0.1:3000/";
process.env.FEISHU_VERIFICATION_TOKEN = "";
process.env.FEISHU_ENCRYPT_KEY = "";

const { buildApp } = await import("../src/app.ts");

test("POST /api/handler returns url_verification challenge", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/handler",
      payload: {
        type: "url_verification",
        challenge: "abc123",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { challenge: "abc123" });
  } finally {
    await app.close();
  }
});

test("GET / redirects when u is valid", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/?u=https%3A%2F%2Fopen.feishu.cn",
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "https://open.feishu.cn");
  } finally {
    await app.close();
  }
});

test("GET /editor returns the self-service editor page", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/editor?t=%E4%BD%A0%E5%A5%BD%E5%91%80~&slot=current_task",
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /text\/html/);
    assert.match(response.body, /飞书签名设置器/);
    assert.match(response.body, /current_task/);
  } finally {
    await app.close();
  }
});

test("GET /api/debug/preview returns resolved preview payload", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/debug/preview?t=%E4%BD%A0%E5%A5%BD%E5%91%80~&k=img_v3_xxx&u=https%3A%2F%2Fopen.feishu.cn",
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.resolved.text, "你好呀~");
    assert.equal(body.resolved.iconKey, "img_v3_xxx");
    assert.equal(body.resolved.jumpUrl, "https://open.feishu.cn");
  } finally {
    await app.close();
  }
});
