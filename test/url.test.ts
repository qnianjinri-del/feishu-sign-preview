import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../src/config.ts";
import { buildEditorUrl, parsePreviewParamsFromUrl } from "../src/lib/url.ts";
import { PreviewService } from "../src/services/preview-service.ts";

const testConfig: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 3000,
  publicBaseUrl: "http://127.0.0.1:3000",
  defaultHelpPath: "/",
  defaultJumpUrl: "http://127.0.0.1:3000/",
  helpUrl: "http://127.0.0.1:3000/",
  feishuAppId: "",
  feishuAppSecret: "",
  feishuVerificationToken: "",
  feishuEncryptKey: "",
  bitableAppToken: "XLNaboeiCaFzN5sUtMfcVl9Mn8z",
  bitableTableId: "tbl9MppZ1OXYKapw",
  bitableViewId: "vewbgk85az",
  bitableResultFieldName: "任务名",
  bitableStatusFieldName: "任务状态",
  bitableTargetStatus: "在干",
  bitableCacheTtlSeconds: 60,
  bitableRequestTimeoutMs: 1500,
  maxTextLength: 80,
  handlerTimeoutMs: 1500,
  debugTimeoutMs: 2000,
  enableCardPreview: false,
};

test("parsePreviewParamsFromUrl decodes t/k/u parameters", () => {
  const params = parsePreviewParamsFromUrl(
    "https://sign.example.com/?t=%E4%BD%A0%E5%A5%BD%E5%91%80~&k=img_v3_xxx&u=https%3A%2F%2Fopen.feishu.cn",
  );

  assert.deepEqual(params, {
    t: "你好呀~",
    k: "img_v3_xxx",
    u: "https://open.feishu.cn",
    slot: undefined,
  });
});

test("PreviewService falls back to a single space when text is missing", async () => {
  const previewService = new PreviewService(testConfig);
  const preview = await previewService.buildFromParams({}, { sourceUrl: testConfig.publicBaseUrl });

  assert.equal(preview.text, " ");
  assert.equal(preview.response.inline.title, " ");
});

test("PreviewService falls back to the editor when redirect url is invalid", async () => {
  const previewService = new PreviewService(testConfig);
  const preview = await previewService.buildFromParams(
    {
      t: "hello",
      u: "javascript:alert(1)",
    },
    { sourceUrl: testConfig.publicBaseUrl },
  );

  const expected = buildEditorUrl(testConfig.publicBaseUrl, { t: "hello" });
  assert.equal(preview.jumpUrl, expected);
  assert.equal(preview.response.inline.url.web, expected);
});

test("PreviewService keeps t as the primary text and treats slot as fallback", async () => {
  let slotResolveCount = 0;
  const previewService = new PreviewService(
    testConfig,
    undefined,
    undefined,
    {
      resolve: async () => {
        slotResolveCount += 1;
        return "来自 slot 的文案";
      },
    } as never,
  );

  const preview = await previewService.buildFromParams(
    {
      t: "手动文案",
      slot: "current_task",
    },
    { sourceUrl: testConfig.publicBaseUrl },
  );

  assert.equal(preview.text, "手动文案");
  assert.equal(slotResolveCount, 0);
});
