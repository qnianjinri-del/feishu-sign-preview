import type { FastifyPluginAsync } from "fastify";

import { config } from "../config.js";
import { buildBitableAppUrl, buildEditorUrl } from "../lib/url.js";
import { IconService } from "../services/icon-service.js";
import { rootQuerySchema } from "../utils/validation.js";

const iconService = new IconService();

function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

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
    defaultIconKey: iconService.getDefaultEditorIconKey(),
    iconCatalog: iconService.getEditorCatalog(),
    initialQuery,
  };

  const appConfigJson = serializeForScript(appConfig);

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
        --panel-strong: #eef4ff;
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
        max-width: 1380px;
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
        line-height: 1.7;
      }
      .link {
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) 380px;
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
        gap: 18px;
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
        line-height: 1.7;
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
      .toolbar-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
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
      .selected-icon {
        display: grid;
        grid-template-columns: 56px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        padding: 12px;
        border-radius: 16px;
        background: linear-gradient(180deg, #f7faff 0%, #eef4ff 100%);
        border: 1px solid rgba(47, 109, 246, 0.16);
      }
      .selected-icon img {
        width: 56px;
        height: 56px;
        border-radius: 14px;
        object-fit: contain;
        background: rgba(47, 109, 246, 0.08);
        padding: 8px;
      }
      .selected-icon strong {
        display: block;
        font-size: 15px;
      }
      .selected-icon code {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        word-break: break-all;
      }
      .icon-panel {
        border: 1px solid rgba(47, 109, 246, 0.16);
        border-radius: 18px;
        background: linear-gradient(180deg, #fcfdff 0%, #f4f8ff 100%);
        padding: 14px;
      }
      .icon-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
        gap: 10px;
        margin-top: 12px;
        max-height: 480px;
        overflow: auto;
        padding-right: 4px;
      }
      .icon-card {
        border: 1px solid rgba(22, 35, 58, 0.10);
        background: #fff;
        border-radius: 16px;
        padding: 8px;
        cursor: pointer;
        display: grid;
        gap: 6px;
        justify-items: center;
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
      }
      .icon-card:hover {
        transform: translateY(-1px);
        border-color: rgba(47, 109, 246, 0.34);
        box-shadow: 0 10px 18px rgba(47, 109, 246, 0.12);
      }
      .icon-card.active {
        border-color: rgba(47, 109, 246, 0.72);
        box-shadow: 0 12px 22px rgba(47, 109, 246, 0.18);
        background: #eef4ff;
      }
      .icon-card img {
        width: 34px;
        height: 34px;
        object-fit: contain;
      }
      .icon-card span {
        width: 100%;
        font-size: 11px;
        line-height: 1.3;
        text-align: center;
        color: var(--muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
        .toolbar-row {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="topbar">
        <div>
          <div class="title">飞书签名设置器</div>
          <div class="subtitle">这里生成的签名链接会自动编码，更适合直接贴到飞书个性签名里。你也可以直接点选小表情，不用再手填 <code>image_key</code>。</div>
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
              <div class="hint">这里填你希望飞书里直接显示的文字。如果同时勾选当前任务兜底，只有当你不填文案时才会去读多维表格。</div>
            </div>

            <div class="field">
              <label for="jump-input">点击跳转</label>
              <input id="jump-input" type="text" placeholder="https:// 开头，不填时默认跳回设置页" />
              <div class="hint">如果这里不填，点击签名时会自动打开当前设置页，方便你继续修改。</div>
            </div>

            <div class="row">
              <button class="button ghost" type="button" id="use-bitable-target">使用当前多维表格作为跳转</button>
              <button class="button ghost" type="button" id="clear-target">清空跳转</button>
            </div>

            <div class="field">
              <label>小表情图标</label>
              <div class="hint">签名场景建议保留图标，更稳。下面可以直接点图选择，编辑器会自动把对应的 <code>k</code> 参数带进链接里。</div>

              <div class="selected-icon">
                <img id="selected-icon-thumb" alt="已选图标" />
                <div>
                  <strong id="selected-icon-name">默认表情</strong>
                  <code id="selected-icon-key"></code>
                </div>
              </div>

              <div class="icon-panel">
                <div class="toolbar-row">
                  <input id="icon-search" type="text" placeholder="搜索表情名或 image_key" />
                  <button class="button ghost" type="button" id="reset-icon">恢复默认表情</button>
                </div>
                <div class="hint" id="icon-stats"></div>
                <div class="icon-grid" id="icon-grid"></div>
                <div class="row">
                  <button class="button ghost" type="button" id="load-more-icons">加载更多表情</button>
                </div>
              </div>

              <label for="icon-input">高级模式：图标 key</label>
              <input id="icon-input" type="text" placeholder="也可以直接粘贴自定义 image_key" />
              <div class="hint">如果你已经有自己的飞书图片 key，也可以直接粘贴覆盖当前选择。</div>
            </div>

            <label class="checkbox" id="slot-fallback-row">
              <input id="slot-fallback" type="checkbox" />
              保留 <code>current_task</code> 作为兜底文案
            </label>

            <div class="readonly" id="slot-readonly" hidden>
              <strong>当前任务模式</strong>
              <div class="hint">会读取多维表格指定视图里“任务状态 = 在干”的第一条记录，把“任务名”显示成签名文字。</div>
            </div>

            <div class="field">
              <label for="link-output">签名链接</label>
              <textarea id="link-output" readonly></textarea>
              <div class="hint">把这里生成的链接复制到飞书签名里即可。后续想改内容，重新打开这个设置页调整并复制新的链接。</div>
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
              原理不变：编辑器只负责生成链接，真正显示在飞书里的还是当前服务返回的链接预览。为了让签名更稳，这里默认会带上一个图标。
            </div>
          </div>
        </aside>
      </div>
    </div>

    <script>
      const APP_CONFIG = ${appConfigJson};

      const state = {
        mode: "single",
        visibleIconCount: 120,
      };

      const modeButtons = Array.from(document.querySelectorAll(".tab"));
      const textField = document.getElementById("text-field");
      const textInput = document.getElementById("text-input");
      const jumpInput = document.getElementById("jump-input");
      const iconInput = document.getElementById("icon-input");
      const iconSearch = document.getElementById("icon-search");
      const iconGrid = document.getElementById("icon-grid");
      const iconStats = document.getElementById("icon-stats");
      const loadMoreIcons = document.getElementById("load-more-icons");
      const resetIcon = document.getElementById("reset-icon");
      const selectedIconThumb = document.getElementById("selected-icon-thumb");
      const selectedIconName = document.getElementById("selected-icon-name");
      const selectedIconKey = document.getElementById("selected-icon-key");
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

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function hydrateFromQuery() {
        const query = APP_CONFIG.initialQuery || {};
        const hasManualText = Boolean(query.t);
        const hasSlot = query.slot === "current_task";

        state.mode = hasSlot && !hasManualText ? "current_task" : "single";
        textInput.value = query.t || "";
        iconInput.value = query.k || APP_CONFIG.defaultIconKey || "";
        jumpInput.value = query.u || "";
        slotFallback.checked = hasSlot && hasManualText;
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

      function findSelectedIcon() {
        const currentKey = iconInput.value.trim();
        return APP_CONFIG.iconCatalog.find((item) => item.key === currentKey);
      }

      function renderSelectedIcon() {
        const currentKey = iconInput.value.trim();
        const selected = findSelectedIcon();

        if (selected) {
          selectedIconThumb.src = selected.imageUrl;
          selectedIconThumb.alt = selected.label;
          selectedIconName.textContent = selected.label;
          selectedIconKey.textContent = selected.key;
          return;
        }

        selectedIconThumb.removeAttribute("src");
        selectedIconThumb.alt = "";
        selectedIconName.textContent = currentKey ? "自定义图标" : "未选择图标";
        selectedIconKey.textContent = currentKey || "建议签名场景保留一个图标";
      }

      function renderIconGrid() {
        const term = iconSearch.value.trim().toLowerCase();
        const filtered = term
          ? APP_CONFIG.iconCatalog.filter((item) => item.keywords.includes(term))
          : APP_CONFIG.iconCatalog;
        const visibleCount = term ? Math.max(180, state.visibleIconCount) : state.visibleIconCount;
        const visibleItems = filtered.slice(0, visibleCount);
        const selectedKey = iconInput.value.trim();

        iconGrid.innerHTML = visibleItems
          .map((item) => {
            const isActive = item.key === selectedKey;
            return \`<button class="icon-card \${isActive ? "active" : ""}" type="button" data-icon-key="\${escapeHtml(item.key)}" title="\${escapeHtml(item.label)}">
              <img loading="lazy" src="\${escapeHtml(item.imageUrl)}" alt="\${escapeHtml(item.label)}" referrerpolicy="no-referrer" />
              <span>\${escapeHtml(item.label)}</span>
            </button>\`;
          })
          .join("");

        if (term) {
          iconStats.textContent = \`共找到 \${filtered.length} 个表情，当前显示 \${visibleItems.length} 个。\`;
        } else {
          iconStats.textContent = \`已显示 \${visibleItems.length} / \${APP_CONFIG.iconCatalog.length} 个表情。\`;
        }

        loadMoreIcons.hidden = visibleItems.length >= filtered.length;
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
        renderSelectedIcon();
        renderIconGrid();

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            const payload = await fetchPreview(params);
            const resolved = payload.resolved || {};
            const jumpUrl = resolved.jumpUrl || editorUrl;
            const title = resolved.text && resolved.text !== "\\u200b" ? resolved.text : "零宽占位字符";
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

      iconSearch.addEventListener("input", () => {
        state.visibleIconCount = 120;
        renderIconGrid();
      });

      iconGrid.addEventListener("click", (event) => {
        const target = event.target.closest("[data-icon-key]");
        if (!target) {
          return;
        }

        iconInput.value = target.dataset.iconKey || "";
        update();
      });

      loadMoreIcons.addEventListener("click", () => {
        state.visibleIconCount += 120;
        renderIconGrid();
      });

      resetIcon.addEventListener("click", () => {
        iconInput.value = APP_CONFIG.defaultIconKey || "";
        update();
      });

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
