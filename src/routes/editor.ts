import type { FastifyPluginAsync } from "fastify";

import { config } from "../config.js";
import { buildBitableAppUrl, buildEditorUrl } from "../lib/url.js";
import { rootQuerySchema } from "../utils/validation.js";

function renderEditorPage(initialQuery: Record<string, string | undefined>) {
  const previewBaseUrl = config.publicBaseUrl;
  const editorBaseUrl = buildEditorUrl(config.publicBaseUrl, {});
  const defaultBitableUrl = buildBitableAppUrl(
    config.publicBaseUrl,
    config.bitableAppToken,
    config.bitableTableId,
    config.bitableViewId,
  );

  const appConfig = {
    previewBaseUrl,
    editorBaseUrl,
    defaultBitableUrl,
    initialQuery,
  };

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>飞书签名设置器</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #eef4fb;
        --panel: #ffffff;
        --panel-soft: #f7faff;
        --ink: #16233a;
        --muted: #657388;
        --line: rgba(22, 35, 58, 0.12);
        --accent: #2f6df6;
        --accent-soft: rgba(47, 109, 246, 0.12);
        --success: #0d7c66;
        --shadow: 0 18px 48px rgba(38, 60, 112, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(47, 109, 246, 0.14), transparent 26%),
          radial-gradient(circle at 100% 0, rgba(13, 124, 102, 0.10), transparent 24%),
          linear-gradient(180deg, #f5f8fc 0%, #edf3fb 100%);
      }
      .shell {
        max-width: 1320px;
        margin: 0 auto;
        padding: 24px;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 18px;
      }
      .title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .subtitle {
        color: var(--muted);
        margin-top: 4px;
      }
      .link {
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) 380px;
        gap: 22px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 22px;
        box-shadow: var(--shadow);
      }
      .controls {
        padding: 18px;
      }
      .tabs {
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        background: #f0f4fb;
        border-radius: 14px;
        margin-bottom: 18px;
      }
      .tab {
        border: 0;
        background: transparent;
        color: var(--muted);
        padding: 10px 16px;
        border-radius: 10px;
        font-weight: 700;
        cursor: pointer;
      }
      .tab.active {
        background: #fff;
        color: var(--accent);
        box-shadow: 0 8px 20px rgba(47, 109, 246, 0.14);
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .field {
        display: grid;
        gap: 8px;
      }
      .field label {
        font-weight: 700;
      }
      .hint {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
      }
      input[type="text"], textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px 14px;
        font: inherit;
        color: var(--ink);
        background: var(--panel-soft);
      }
      textarea {
        min-height: 92px;
        resize: vertical;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .button {
        border: 0;
        border-radius: 14px;
        padding: 11px 16px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        background: #edf2ff;
        color: var(--accent);
      }
      .button.primary {
        background: var(--accent);
        color: #fff;
      }
      .button.ghost {
        background: transparent;
        border: 1px solid var(--line);
        color: var(--ink);
      }
      .checkbox {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-weight: 600;
      }
      .readonly {
        padding: 14px;
        border-radius: 16px;
        background: linear-gradient(180deg, #f7faff 0%, #eef4ff 100%);
        border: 1px solid rgba(47, 109, 246, 0.16);
      }
      .preview {
        overflow: hidden;
      }
      .preview-cover {
        height: 132px;
        background:
          linear-gradient(135deg, rgba(47, 109, 246, 0.88), rgba(40, 187, 157, 0.72)),
          radial-gradient(circle at top right, rgba(255, 255, 255, 0.32), transparent 28%);
      }
      .preview-body {
        padding: 18px;
      }
      .avatar {
        width: 78px;
        height: 78px;
        border-radius: 50%;
        margin-top: -56px;
        background: #fff;
        box-shadow: 0 12px 28px rgba(22, 35, 58, 0.16);
        display: grid;
        place-items: center;
        color: var(--accent);
        font-size: 28px;
        font-weight: 900;
      }
      .preview-title {
        margin-top: 14px;
        font-size: 15px;
        color: var(--muted);
        font-weight: 700;
      }
      .preview-name {
        margin-top: 6px;
        font-size: 34px;
        letter-spacing: -0.04em;
        font-weight: 900;
      }
      .signature-box {
        margin-top: 16px;
        padding: 18px;
        border-radius: 18px;
        background: #f5f8ff;
        border: 1px solid rgba(47, 109, 246, 0.14);
      }
      .signature-link {
        color: var(--accent);
        font-size: 22px;
        line-height: 1.5;
        text-decoration: none;
        word-break: break-word;
      }
      .signature-meta {
        margin-top: 12px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }
      .notice {
        margin-top: 14px;
        padding: 14px 16px;
        border-radius: 16px;
        background: rgba(13, 124, 102, 0.10);
        color: var(--success);
        font-size: 14px;
        line-height: 1.7;
      }
      .footer-note {
        margin-top: 16px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.7;
      }
      @media (max-width: 1080px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 720px) {
        .shell {
          padding: 16px;
        }
        .title {
          font-size: 24px;
        }
        .preview-name {
          font-size: 28px;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="topbar">
        <div>
          <div class="title">飞书签名设置器</div>
          <div class="subtitle">参考原版编辑器思路，做一个你自己也能维护的轻量设置页。改完后复制新链接到飞书签名里即可。</div>
        </div>
        <a class="link" href="/">返回说明页</a>
      </div>

      <div class="layout">
        <section class="panel controls">
          <div class="tabs">
            <button class="tab active" type="button" data-mode="single">单链接</button>
            <button class="tab" type="button" data-mode="current_task">当前任务</button>
          </div>

          <div class="grid">
            <div class="field" id="text-field">
              <label for="text-input">外显文案</label>
              <textarea id="text-input" placeholder="例如：你好呀~"></textarea>
              <div class="hint">这里填你希望飞书里直接显示的文案。</div>
            </div>

            <div class="field">
              <label for="jump-input">点击跳转</label>
              <input id="jump-input" type="text" placeholder="https:// 开头，不填时默认跳到设置页" />
              <div class="hint">如果这里不填，点击签名时会自动打开当前设置页，方便你继续修改。</div>
            </div>

            <div class="row">
              <button class="button ghost" type="button" id="use-bitable-target">使用当前多维表格作为跳转</button>
              <button class="button ghost" type="button" id="clear-target">清空跳转</button>
            </div>

            <div class="field">
              <label for="icon-input">图标 key</label>
              <input id="icon-input" type="text" placeholder="可选，飞书 image_key" />
              <div class="hint">不填则使用飞书默认链接图标。</div>
            </div>

            <label class="checkbox" id="slot-fallback-row">
              <input id="slot-fallback" type="checkbox" />
              保留 <code>current_task</code> 作为兜底文案
            </label>

            <div class="readonly" id="slot-readonly" hidden>
              <strong>当前任务模式</strong>
              <div class="hint">会读取多维表格指定视图里“任务状态 = 在干”的第一条记录，把“任务名”显示成签名文案。</div>
            </div>

            <div class="field">
              <label for="link-output">签名链接</label>
              <textarea id="link-output" readonly></textarea>
              <div class="hint">把这里生成的链接复制到飞书签名里即可。后续要改内容，重新打开设置页调整并复制新的链接。</div>
            </div>

            <div class="row">
              <button class="button primary" type="button" id="copy-link">复制签名链接</button>
              <button class="button" type="button" id="open-preview">打开签名链接</button>
              <button class="button ghost" type="button" id="open-editor-link">打开当前设置页</button>
            </div>
          </div>
        </section>

        <aside class="panel preview">
          <div class="preview-cover"></div>
          <div class="preview-body">
            <div class="avatar">飞</div>
            <div class="preview-title">实时预览</div>
            <div class="preview-name">飞书用户</div>

            <div class="signature-box">
              <a class="signature-link" href="#" id="preview-link" target="_blank" rel="noreferrer">正在生成预览...</a>
              <div class="signature-meta" id="preview-meta">等待输入中。</div>
            </div>

            <div class="notice" id="preview-notice">
              如果没设置点击跳转，点击签名会自动打开当前设置页，方便你继续修改。
            </div>

            <div class="footer-note">
              原理不变：编辑页只负责生成链接，真正显示在飞书里的还是当前服务返回的链接预览。
            </div>
          </div>
        </aside>
      </div>
    </div>

    <script>
      const APP_CONFIG = ${JSON.stringify(appConfig)};

      const state = {
        mode: "single",
        text: "",
        iconKey: "",
        jumpUrl: "",
        slotFallback: false,
      };

      const modeButtons = Array.from(document.querySelectorAll(".tab"));
      const textField = document.getElementById("text-field");
      const textInput = document.getElementById("text-input");
      const jumpInput = document.getElementById("jump-input");
      const iconInput = document.getElementById("icon-input");
      const slotFallback = document.getElementById("slot-fallback");
      const slotFallbackRow = document.getElementById("slot-fallback-row");
      const slotReadonly = document.getElementById("slot-readonly");
      const linkOutput = document.getElementById("link-output");
      const previewLink = document.getElementById("preview-link");
      const previewMeta = document.getElementById("preview-meta");
      const previewNotice = document.getElementById("preview-notice");
      const copyLink = document.getElementById("copy-link");
      const openPreview = document.getElementById("open-preview");
      const openEditorLink = document.getElementById("open-editor-link");
      const useBitableTarget = document.getElementById("use-bitable-target");
      const clearTarget = document.getElementById("clear-target");

      let pendingController = null;
      let debounceTimer = null;

      function hydrateFromQuery() {
        const query = APP_CONFIG.initialQuery || {};
        const hasManualText = Boolean(query.t);
        const hasSlot = query.slot === "current_task";
        state.mode = hasSlot && !hasManualText ? "current_task" : "single";
        state.text = query.t || "";
        state.iconKey = query.k || "";
        state.jumpUrl = query.u || "";
        state.slotFallback = hasSlot && hasManualText;

        textInput.value = state.text;
        iconInput.value = state.iconKey;
        jumpInput.value = state.jumpUrl;
        slotFallback.checked = state.slotFallback;
      }

      function setMode(mode) {
        state.mode = mode;
        modeButtons.forEach((button) => {
          button.classList.toggle("active", button.dataset.mode === mode);
        });

        const isCurrentTask = mode === "current_task";
        textField.hidden = isCurrentTask;
        slotFallbackRow.hidden = isCurrentTask;
        slotReadonly.hidden = !isCurrentTask;
        update();
      }

      function buildParams() {
        const params = new URLSearchParams();
        const text = textInput.value.trim();
        const iconKey = iconInput.value.trim();
        const jumpUrl = jumpInput.value.trim();
        const shouldUseSlot = state.mode === "current_task" || slotFallback.checked;

        if (state.mode === "single" && text) {
          params.set("t", text);
        }

        if (shouldUseSlot) {
          params.set("slot", "current_task");
        }

        if (iconKey) {
          params.set("k", iconKey);
        }

        if (jumpUrl) {
          params.set("u", jumpUrl);
        }

        return params;
      }

      function buildUrl(baseUrl, params) {
        const url = new URL(baseUrl);
        url.search = params.toString();
        return url.toString();
      }

      function syncEditorLocation(editorUrl) {
        window.history.replaceState({}, "", editorUrl);
      }

      async function fetchPreview(params) {
        if (pendingController) {
          pendingController.abort();
        }

        pendingController = new AbortController();
        const response = await fetch(\`/api/debug/preview?\${params.toString()}\`, {
          signal: pendingController.signal,
        });
        return response.json();
      }

      async function update() {
        const params = buildParams();
        const previewUrl = buildUrl(APP_CONFIG.previewBaseUrl, params);
        const editorUrl = buildUrl(APP_CONFIG.editorBaseUrl, params);

        linkOutput.value = previewUrl;
        openPreview.onclick = () => window.open(previewUrl, "_blank", "noopener,noreferrer");
        openEditorLink.onclick = () => window.open(editorUrl, "_blank", "noopener,noreferrer");
        syncEditorLocation(editorUrl);

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            const payload = await fetchPreview(params);
            const resolved = payload.resolved || {};
            const jumpUrl = resolved.jumpUrl || editorUrl;
            const title = resolved.text && resolved.text !== " " ? resolved.text : "单个空格占位";
            previewLink.textContent = title;
            previewLink.href = jumpUrl;
            previewMeta.textContent = \`点击后跳转到：\${jumpUrl}\`;
            previewNotice.textContent = jumpInput.value.trim()
              ? "你已经设置了点击跳转，点击签名会优先跳到这个地址。"
              : "你还没设置点击跳转，点击签名时会自动打开当前设置页。";
          } catch (error) {
            previewLink.textContent = "预览生成失败";
            previewLink.href = editorUrl;
            previewMeta.textContent = "调试接口暂时不可用，先回退到设置页。";
            previewNotice.textContent = "当前仍可复制签名链接，但实时预览接口暂时不可用。";
          }
        }, 120);
      }

      modeButtons.forEach((button) => {
        button.addEventListener("click", () => setMode(button.dataset.mode));
      });

      textInput.addEventListener("input", update);
      jumpInput.addEventListener("input", update);
      iconInput.addEventListener("input", update);
      slotFallback.addEventListener("change", update);

      copyLink.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(linkOutput.value);
          copyLink.textContent = "已复制";
          setTimeout(() => {
            copyLink.textContent = "复制签名链接";
          }, 1200);
        } catch {
          copyLink.textContent = "复制失败";
          setTimeout(() => {
            copyLink.textContent = "复制签名链接";
          }, 1200);
        }
      });

      useBitableTarget.addEventListener("click", () => {
        jumpInput.value = APP_CONFIG.defaultBitableUrl;
        update();
      });

      clearTarget.addEventListener("click", () => {
        jumpInput.value = "";
        update();
      });

      hydrateFromQuery();
      setMode(state.mode);
    </script>
  </body>
</html>`;
}

export const editorRoute: FastifyPluginAsync = async (app) => {
  app.get("/editor", async (request, reply) => {
    const query = rootQuerySchema.parse(request.query);
    reply.type("text/html; charset=utf-8");
    return renderEditorPage({
      t: query.t,
      k: query.k,
      u: query.u,
      slot: query.slot,
    });
  });
};
