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
  const appConfig = {
    previewBaseUrl: config.publicBaseUrl,
    editorBaseUrl: buildEditorUrl(config.publicBaseUrl, {}),
    defaultJumpUrl: buildBitableAppUrl(
      config.publicBaseUrl,
      config.bitableAppToken,
      config.bitableTableId,
      config.bitableViewId,
    ),
    defaultIconKey: iconService.getDefaultEditorIconKey(),
    iconCatalog: iconService.getEditorCatalog(),
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
      input[type="text"], textarea, select {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px 14px;
        font: inherit;
        color: var(--ink);
        background: var(--panel-soft);
      }
      textarea {
        min-height: 112px;
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
      .selected-icons {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        padding: 12px;
        border-radius: 16px;
        background: linear-gradient(180deg, #f7faff 0%, #eef4ff 100%);
        border: 1px solid rgba(47, 109, 246, 0.16);
      }
      .selected-placeholder {
        grid-column: 1 / -1;
        color: var(--muted);
        font-size: 13px;
      }
      .picked-icon {
        display: grid;
        gap: 6px;
        justify-items: center;
        text-align: center;
        padding: 10px 6px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.86);
      }
      .picked-icon img {
        width: 36px;
        height: 36px;
        object-fit: contain;
      }
      .picked-icon span {
        width: 100%;
        font-size: 11px;
        line-height: 1.3;
        color: var(--muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .picked-summary {
        color: var(--muted);
        font-size: 13px;
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
        white-space: pre-line;
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
        .selected-icons {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="topbar">
        <div>
          <div class="title">飞书签名设置器</div>
          <div class="subtitle">这里生成的签名链接会自动编码，更适合直接贴到飞书个性签名里。现在支持一次选择多个小表情，你还可以自己决定每行放几个。</div>
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
              <div class="hint">这里填飞书里直接显示的文字。如果同时勾选当前任务兜底，只有当你不填文案时才会去读多维表格。</div>
            </div>

            <div class="field">
              <label for="jump-input">点击跳转</label>
              <input id="jump-input" type="text" placeholder="https:// 开头，不填时默认跳回设置页" />
              <div class="hint">这里可以填任何你想跳转的地址。如果留空，点击签名时会自动打开当前设置页，方便继续修改。</div>
            </div>

            <div class="row">
              <button class="button ghost" type="button" id="use-default-target">填入默认跳转地址</button>
              <button class="button ghost" type="button" id="clear-target">清空跳转</button>
            </div>

            <div class="field">
              <label for="cols-select">每行图标数量</label>
              <select id="cols-select">
                <option value="3">3 个</option>
                <option value="4" selected>4 个</option>
                <option value="5">5 个</option>
                <option value="6">6 个</option>
              </select>
              <div class="hint" id="cols-hint">多表情模式下会按这个数量自动换行。你想排 4 个、5 个都可以自己切。</div>
            </div>

            <div class="field">
              <label>小表情图标</label>
              <div class="hint">可以一次选多个，生成结果会按你设置的每行数量排版。再次点击同一个图标会取消选择。</div>

              <div class="selected-icons" id="selected-icons"></div>
              <div class="picked-summary" id="selected-icons-summary"></div>

              <div class="icon-panel">
                <div class="toolbar-row">
                  <input id="icon-search" type="text" placeholder="搜索表情名或 image_key" />
                  <button class="button ghost" type="button" id="reset-icon">恢复默认表情</button>
                </div>
                <div class="hint" id="icon-stats"></div>
                <div class="icon-grid" id="icon-grid"></div>
                <div class="row">
                  <button class="button ghost" type="button" id="load-more-icons">加载更多表情</button>
                  <button class="button ghost" type="button" id="clear-icons">清空已选表情</button>
                </div>
              </div>

              <label for="icon-input">高级模式：支持逗号分隔多个 key</label>
              <input id="icon-input" type="text" placeholder="例如：img_xxx,img_yyy,img_zzz" />
              <div class="hint">如果你已经有自己的飞书图片 key，可以直接粘贴多个 key。编辑器会自动去重并保留顺序。</div>
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
              <div class="hint">如果你选了多个小表情，这里会生成多条链接并按你设置的每行数量自动排版。整块复制到飞书签名里即可。</div>
            </div>

            <div class="row">
              <button class="button primary" type="button" id="copy-link">复制签名链接</button>
              <button class="button" type="button" id="open-preview">打开主链接</button>
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
              编辑器只负责生成链接，真正显示在飞书里的还是服务端返回的链接预览。多表情模式下，会先生成图标链接块，再按需要补一条主链接。
            </div>
          </div>
        </aside>
      </div>
    </div>

    <script>
      const APP_CONFIG = ${serializeForScript(appConfig)};

      const state = {
        mode: "single",
        visibleIconCount: 120,
      };

      const modeButtons = Array.from(document.querySelectorAll(".tab"));
      const textField = document.getElementById("text-field");
      const textInput = document.getElementById("text-input");
      const jumpInput = document.getElementById("jump-input");
      const colsSelect = document.getElementById("cols-select");
      const colsHint = document.getElementById("cols-hint");
      const iconInput = document.getElementById("icon-input");
      const iconSearch = document.getElementById("icon-search");
      const iconGrid = document.getElementById("icon-grid");
      const iconStats = document.getElementById("icon-stats");
      const loadMoreIcons = document.getElementById("load-more-icons");
      const resetIcon = document.getElementById("reset-icon");
      const clearIcons = document.getElementById("clear-icons");
      const selectedIcons = document.getElementById("selected-icons");
      const selectedIconsSummary = document.getElementById("selected-icons-summary");
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
      const useDefaultTarget = document.getElementById("use-default-target");
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

      function parseIconKeys(value) {
        const seen = new Set();
        return String(value || "")
          .split(/[\\s,，]+/)
          .map((item) => item.trim())
          .filter(Boolean)
          .filter((item) => {
            if (seen.has(item)) {
              return false;
            }
            seen.add(item);
            return true;
          });
      }

      function parseColumns(value) {
        const parsed = Number.parseInt(String(value || "4"), 10);
        if (!Number.isFinite(parsed)) {
          return 4;
        }
        return Math.min(6, Math.max(3, parsed));
      }

      function setSelectedIconKeys(keys) {
        iconInput.value = keys.join(",");
      }

      function getSelectedIconKeys() {
        const parsed = parseIconKeys(iconInput.value);
        return parsed.length > 0 ? parsed : [APP_CONFIG.defaultIconKey];
      }

      function getColumnsPerRow() {
        return parseColumns(colsSelect.value);
      }

      function chunk(items, size) {
        const output = [];
        for (let index = 0; index < items.length; index += size) {
          output.push(items.slice(index, index + size));
        }
        return output;
      }

      function buildUrl(baseUrl, params) {
        const url = new URL(baseUrl);
        url.search = params.toString();
        return url.toString();
      }

      function syncEditorLocation(editorUrl) {
        window.history.replaceState({}, "", editorUrl);
      }

      function buildEditorParams() {
        const params = new URLSearchParams();
        const text = textInput.value.trim();
        const jumpUrl = jumpInput.value.trim();
        const selectedKeys = getSelectedIconKeys();
        const shouldUseSlot = state.mode === "current_task" || slotFallback.checked;
        const cols = String(getColumnsPerRow());

        if (state.mode === "single" && text) {
          params.set("t", text);
        }

        if (shouldUseSlot) {
          params.set("slot", "current_task");
        }

        if (selectedKeys[0]) {
          params.set("k", selectedKeys[0]);
        }

        if (selectedKeys.length > 1) {
          params.set("ks", selectedKeys.join(","));
        }

        if (selectedKeys.length > 1) {
          params.set("cols", cols);
        }

        if (jumpUrl) {
          params.set("u", jumpUrl);
        }

        return params;
      }

      function buildSignatureDraft() {
        const text = textInput.value.trim();
        const jumpUrl = jumpInput.value.trim();
        const selectedKeys = getSelectedIconKeys();
        const shouldUseSlot = state.mode === "current_task" || slotFallback.checked;
        const cols = getColumnsPerRow();
        const ksValue = selectedKeys.length > 1 ? selectedKeys.join(",") : "";
        const editorUrl = buildUrl(APP_CONFIG.editorBaseUrl, buildEditorParams());

        const lines = [];
        const iconOnlyUrls = [];

        if (selectedKeys.length > 1) {
          for (const key of selectedKeys) {
            const params = new URLSearchParams();
            params.set("k", key);
            iconOnlyUrls.push(buildUrl(APP_CONFIG.previewBaseUrl, params));
          }

          for (const group of chunk(iconOnlyUrls, cols)) {
            lines.push(group.join(" "));
          }
        }

        const shouldAddMainLink = selectedKeys.length <= 1 || Boolean(text) || shouldUseSlot;
        let mainUrl = "";

        if (shouldAddMainLink) {
          const params = new URLSearchParams();

          if (state.mode === "single" && text) {
            params.set("t", text);
          }

          if (shouldUseSlot) {
            params.set("slot", "current_task");
          }

          if (selectedKeys[0]) {
            params.set("k", selectedKeys[0]);
          }

          if (jumpUrl) {
            params.set("u", jumpUrl);
          }

          if (ksValue && !jumpUrl) {
            params.set("ks", ksValue);
            params.set("cols", String(cols));
          }

          mainUrl = buildUrl(APP_CONFIG.previewBaseUrl, params);
          lines.push(mainUrl);
        }

        return {
          cols,
          selectedKeys,
          text,
          jumpUrl,
          shouldUseSlot,
          editorUrl,
          mainUrl,
          openUrl: mainUrl || iconOnlyUrls[0] || editorUrl,
          signatureContent: lines.join("\\n"),
        };
      }

      function renderSelectedIcons() {
        const selectedKeys = getSelectedIconKeys();
        const cols = getColumnsPerRow();
        const items = selectedKeys.map((key) => APP_CONFIG.iconCatalog.find((item) => item.key === key) || {
          key,
          label: key,
          imageUrl: "",
        });

        const previewCols = Math.max(1, Math.min(cols, items.length || 1));
        selectedIcons.style.gridTemplateColumns = "repeat(" + previewCols + ", minmax(0, 1fr))";
        colsSelect.disabled = items.length <= 1;
        colsHint.textContent = items.length > 1
          ? "多表情模式下会按这个数量自动换行。你想排 4 个、5 个都可以自己切。"
          : "只用一个表情时不需要分行，这个设置会在你选了多个表情后自动生效。";

        if (items.length === 0) {
          selectedIcons.innerHTML = '<div class="selected-placeholder">还没有选择表情，建议至少保留一个默认图标。</div>';
          selectedIconsSummary.textContent = "";
          return;
        }

        selectedIcons.innerHTML = items
          .map((item) => {
            const imageHtml = item.imageUrl
              ? '<img src="' +
                escapeHtml(item.imageUrl) +
                '" alt="' +
                escapeHtml(item.label) +
                '" referrerpolicy="no-referrer" />'
              : "";
            return '<div class="picked-icon">' + imageHtml + "<span>" + escapeHtml(item.label) + "</span></div>";
          })
          .join("");

        selectedIconsSummary.textContent =
          items.length > 1
            ? "已选 " + items.length + " 个小表情。生成时会自动每行放 " + cols + " 个。"
            : "已选 1 个小表情。当前就是单表情模式，复制出来会是一条更简洁的签名链接。";
      }

      function renderIconGrid() {
        const term = iconSearch.value.trim().toLowerCase();
        const filtered = term
          ? APP_CONFIG.iconCatalog.filter((item) => item.keywords.includes(term))
          : APP_CONFIG.iconCatalog;
        const visibleCount = term ? Math.max(180, state.visibleIconCount) : state.visibleIconCount;
        const visibleItems = filtered.slice(0, visibleCount);
        const selectedKeySet = new Set(getSelectedIconKeys());

        iconGrid.innerHTML = visibleItems
          .map((item) => {
            const isActive = selectedKeySet.has(item.key);
            return '<button class="icon-card ' +
              (isActive ? "active" : "") +
              '" type="button" data-icon-key="' +
              escapeHtml(item.key) +
              '" title="' +
              escapeHtml(item.label) +
              '">' +
              '<img loading="lazy" src="' +
              escapeHtml(item.imageUrl) +
              '" alt="' +
              escapeHtml(item.label) +
              '" referrerpolicy="no-referrer" />' +
              "<span>" +
              escapeHtml(item.label) +
              "</span>" +
              "</button>";
          })
          .join("");

        iconStats.textContent = term
          ? "共找到 " + filtered.length + " 个表情，当前显示 " + visibleItems.length + " 个。"
          : "已显示 " + visibleItems.length + " / " + APP_CONFIG.iconCatalog.length + " 个表情。";

        loadMoreIcons.hidden = visibleItems.length >= filtered.length;
      }

      function hydrateFromQuery() {
        const query = APP_CONFIG.initialQuery || {};
        const hasManualText = Boolean(query.t);
        const hasSlot = query.slot === "current_task";
        const initialKeys = parseIconKeys(query.ks || query.k || APP_CONFIG.defaultIconKey);

        state.mode = hasSlot && !hasManualText ? "current_task" : "single";
        textInput.value = query.t || "";
        jumpInput.value = query.u || "";
        colsSelect.value = String(parseColumns(query.cols || "4"));
        slotFallback.checked = hasSlot && hasManualText;
        setSelectedIconKeys(initialKeys);
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

      async function fetchPreview(params) {
        if (pendingController) {
          pendingController.abort();
        }

        pendingController = new AbortController();
        const response = await fetch("/api/debug/preview?" + params.toString(), {
          signal: pendingController.signal,
        });
        return response.json();
      }

      async function update() {
        const draft = buildSignatureDraft();

        linkOutput.value = draft.signatureContent;
        openPreview.onclick = () => window.open(draft.openUrl, "_blank", "noopener,noreferrer");
        openEditorLink.onclick = () => window.open(draft.editorUrl, "_blank", "noopener,noreferrer");
        syncEditorLocation(draft.editorUrl);
        renderSelectedIcons();
        renderIconGrid();

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          if (!draft.mainUrl && draft.selectedKeys.length > 1) {
            previewLink.textContent = "已选择 " + draft.selectedKeys.length + " 个小表情";
            previewLink.href = draft.openUrl;
            previewMeta.textContent = "生成结果会自动每行排 " + draft.cols + " 个图标链接。多表情场景会优先使用短链接，减少飞书把整串地址原样显示出来的概率。";
            previewNotice.textContent = draft.jumpUrl
              ? "纯图标模式下会优先保证图标正常显示。如果你还想要一个稳定的点击跳转入口，建议再补一条文案或当前任务主链接。"
              : "这些图标链接默认会回到当前设置页，方便你继续修改。";
            return;
          }

          const params = new URLSearchParams();
          if (state.mode === "single" && draft.text) {
            params.set("t", draft.text);
          }
          if (draft.shouldUseSlot) {
            params.set("slot", "current_task");
          }
          if (draft.selectedKeys[0]) {
            params.set("k", draft.selectedKeys[0]);
          }
          if (draft.jumpUrl) {
            params.set("u", draft.jumpUrl);
          }
          if (draft.selectedKeys.length > 1) {
            params.set("ks", draft.selectedKeys.join(","));
          }
          params.set("cols", String(draft.cols));

          try {
            const payload = await fetchPreview(params);
            const resolved = payload.resolved || {};
            const jumpUrl = resolved.jumpUrl || draft.editorUrl;
            const title =
              draft.selectedKeys.length === 1 && !draft.text && !draft.shouldUseSlot
                ? "单表情签名预览"
                : resolved.text && resolved.text !== "\\u200b"
                  ? resolved.text
                  : "零宽占位字符";

            previewLink.textContent = title;
            previewLink.href = jumpUrl;
            previewMeta.textContent = draft.selectedKeys.length > 1
              ? "已生成 " + draft.selectedKeys.length + " 个短图标链接 + 1 条主链接。\\n图标块会按每行 " + draft.cols + " 个排版。\\n点击主链接后会跳到：" + jumpUrl
              : draft.selectedKeys.length === 1 && !draft.text && !draft.shouldUseSlot
                ? "当前是单表情模式，最终效果会以图标为主。\\n点击后会跳到：" + jumpUrl
                : "点击后跳转到：" + jumpUrl;
            previewNotice.textContent = draft.jumpUrl
              ? "你已经设置了点击跳转，点击签名会优先跳到这个地址。"
              : "你还没设置点击跳转，点击签名时会自动打开当前设置页。";
          } catch {
            previewLink.textContent = "预览生成失败";
            previewLink.href = draft.editorUrl;
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
      colsSelect.addEventListener("change", update);
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

        const currentKeys = getSelectedIconKeys();
        const key = target.dataset.iconKey || "";
        const nextKeys = currentKeys.includes(key)
          ? currentKeys.filter((item) => item !== key)
          : currentKeys.concat(key);

        setSelectedIconKeys(nextKeys.length > 0 ? nextKeys : [APP_CONFIG.defaultIconKey]);
        update();
      });

      loadMoreIcons.addEventListener("click", () => {
        state.visibleIconCount += 120;
        renderIconGrid();
      });

      resetIcon.addEventListener("click", () => {
        setSelectedIconKeys([APP_CONFIG.defaultIconKey]);
        update();
      });

      clearIcons.addEventListener("click", () => {
        setSelectedIconKeys([APP_CONFIG.defaultIconKey]);
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

      useDefaultTarget.addEventListener("click", () => {
        jumpInput.value = APP_CONFIG.defaultJumpUrl;
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
      ks: query.ks,
      cols: query.cols,
    });
  });
};
