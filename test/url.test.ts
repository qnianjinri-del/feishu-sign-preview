import assert from "node:assert/strict";
import test from "node:test";

import type { AppConfig } from "../src/config.ts";
import { buildEditorUrl, parsePreviewParamsFromUrl } from "../src/lib/url.ts";
import { PreviewService } from "../src/services/preview-service.ts";
import { ZERO_WIDTH_SPACE } from "../src/utils/text.ts";

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

test("parsePreviewParamsFromUrl decodes t/k/u/ks/cols parameters", () => {
  const params = parsePreviewParamsFromUrl(
    "https://sign.example.com/?t=%E4%BD%A0%E5%A5%BD%E5%91%80~&k=img_v3_xxx&u=https%3A%2F%2Fopen.feishu.cn&ks=img_a%2Cimg_b&cols=5",
  );

  assert.deepEqual(params, {
    t: "你好呀~",
    k: "img_v3_xxx",
    u: "https://open.feishu.cn",
    slot: undefined,
    ks: "img_a,img_b",
    cols: "5",
  });
});

test("PreviewService returns title only for plain text preview", async () => {
  const previewService = new PreviewService(testConfig);
  const preview = await previewService.buildFromParams(
    { t: "你好" },
    { sourceUrl: "http://127.0.0.1:3000/?t=%E4%BD%A0%E5%A5%BD" },
  );

  assert.equal(preview.response.inline.title, "你好");
  assert.equal("image_key" in preview.response.inline, false);
  assert.equal("url" in preview.response.inline, false);
});

test("PreviewService returns title and image_key without inline.url for icon preview", async () => {
  const previewService = new PreviewService(testConfig);
  const preview = await previewService.buildFromParams(
    { t: "你好", k: "img_xxx" },
    { sourceUrl: "http://127.0.0.1:3000/?t=%E4%BD%A0%E5%A5%BD&k=img_xxx" },
  );

  assert.equal(preview.response.inline.title, "你好");
  assert.equal(preview.response.inline.image_key, "img_xxx");
  assert.equal("url" in preview.response.inline, false);
});

test("PreviewService uses zero-width space instead of a normal space for empty text", async () => {
  const previewService = new PreviewService(testConfig);
  const preview = await previewService.buildFromParams({}, { sourceUrl: testConfig.publicBaseUrl });

  assert.equal(preview.text, ZERO_WIDTH_SPACE);
  assert.equal(preview.response.inline.title, ZERO_WIDTH_SPACE);
});

test("PreviewService still resolves jump target to editor when u is missing", async () => {
  const previewService = new PreviewService(testConfig);
  const preview = await previewService.buildFromParams(
    { t: "hello" },
    { sourceUrl: "http://127.0.0.1:3000/?t=hello" },
  );

  const expected = buildEditorUrl(testConfig.publicBaseUrl, { t: "hello" });
  assert.equal(preview.jumpUrl, expected);
  assert.equal("url" in preview.response.inline, false);
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

test("PreviewService returns fixed editor preview for /editor links", async () => {
  const previewService = new PreviewService(testConfig);
  const preview = await previewService.buildFromSourceUrl(
    "http://127.0.0.1:3000/editor?t=%E4%BD%A0%E5%A5%BD&slot=current_task&ks=img_a%2Cimg_b&cols=5",
    { sourceUrl: "http://127.0.0.1:3000/editor?t=%E4%BD%A0%E5%A5%BD&slot=current_task&ks=img_a%2Cimg_b&cols=5" },
  );

  assert.match(preview.response.inline.title, /飞书签名设置器@127.0.0.1/);
  assert.equal("url" in preview.response.inline, false);
});
