import type { FastifyPluginAsync } from "fastify";

import { config } from "../config.js";
import { buildEditorUrl, normalizeJumpUrl } from "../lib/url.js";
import { escapeHtml } from "../utils/text.js";
import { rootQuerySchema } from "../utils/validation.js";

function renderLandingPage() {
  const exampleBase = config.publicBaseUrl;
  const pureText = `${exampleBase}/?t=${encodeURIComponent("你好呀~")}`;
  const imageText = `${exampleBase}/?k=img_v3_xxx&t=${encodeURIComponent("你好呀~")}`;
  const imageTextLink = `${exampleBase}/?k=img_v3_xxx&t=${encodeURIComponent("你好呀~")}&u=${encodeURIComponent("https://open.feishu.cn")}`;
  const currentTask = `${exampleBase}/?slot=current_task`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>飞书个性签名 / 自定义链接预览服务</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe6;
        --panel: rgba(255, 255, 255, 0.88);
        --ink: #132238;
        --muted: #5e6a7d;
        --accent: #0d7c66;
        --accent-2: #2f6df6;
        --line: rgba(19, 34, 56, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(13, 124, 102, 0.22), transparent 28%),
          radial-gradient(circle at 85% 15%, rgba(47, 109, 246, 0.18), transparent 24%),
          linear-gradient(160deg, #f7f3ea 0%, #ece7de 48%, #e5edf0 100%);
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 48px 20px 64px;
      }
      .hero {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 28px;
        backdrop-filter: blur(12px);
        box-shadow: 0 20px 60px rgba(19, 34, 56, 0.08);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(13, 124, 102, 0.12);
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
      }
      h1 {
        margin: 18px 0 12px;
        font-size: clamp(30px, 5vw, 52px);
        line-height: 1.04;
        letter-spacing: -0.03em;
      }
      p {
        color: var(--muted);
        line-height: 1.7;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 18px;
        border-radius: 14px;
        text-decoration: none;
        font-weight: 800;
      }
      .button.primary {
        background: var(--accent-2);
        color: #fff;
      }
      .button.secondary {
        border: 1px solid var(--line);
        color: var(--ink);
        background: rgba(255, 255, 255, 0.74);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
        margin-top: 22px;
      }
      .card {
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 20px;
      }
      h2 {
        margin: 0 0 12px;
        font-size: 18px;
      }
      ul {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        line-height: 1.7;
      }
      code, pre {
        font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      }
      pre {
        margin: 12px 0 0;
        padding: 14px;
        border-radius: 16px;
        background: #132238;
        color: #f4f8ff;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="badge">Feishu Link Preview MVP</div>
        <h1>飞书个性签名 / 自定义链接预览服务</h1>
        <p>这套玩法基于飞书的链接预览回调能力。现在已经内置了一个自助设置页，你可以自己修改外显文案、切换到当前任务模式、设置点击跳转，还能直接在编辑器里挑选小表情图标。</p>
        <div class="row">
          <a class="button primary" href="/editor">打开设置页</a>
          <a class="button secondary" href="/api/debug/preview?slot=current_task">查看当前任务调试结果</a>
        </div>

        <div class="grid">
          <article class="card">
            <h2>参数说明</h2>
            <ul>
              <li><code>t</code>：显示文案，缺省时回退为零宽占位字符。</li>
              <li><code>k</code>：飞书图片 <code>image_key</code>，建议在签名场景保留图标。</li>
              <li><code>u</code>：点击跳转地址，不填时默认跳回设置页。</li>
              <li><code>slot=current_task</code>：从多维表格读取“当前任务”。</li>
            </ul>
          </article>
          <article class="card">
            <h2>推荐入口</h2>
            <ul>
              <li>想自己改签名：打开 <a href="/editor">/editor</a></li>
              <li>想测试当前任务：访问 <code>${escapeHtml(currentTask)}</code></li>
              <li>编辑器生成的链接会自动编码，更适合直接贴到飞书签名。</li>
            </ul>
          </article>
          <article class="card">
            <h2>示例链接</h2>
            <pre>${escapeHtml(pureText)}</pre>
            <pre>${escapeHtml(imageText)}</pre>
            <pre>${escapeHtml(imageTextLink)}</pre>
            <pre>${escapeHtml(currentTask)}</pre>
          </article>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

export const indexRoute: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const query = rootQuerySchema.safeParse(request.query);

    if (query.success) {
      const isSignatureLink = Boolean(query.data.t || query.data.k || query.data.slot || query.data.u);

      if (isSignatureLink) {
        const fallbackUrl = buildEditorUrl(config.publicBaseUrl, {
          t: query.data.t,
          k: query.data.k,
          slot: query.data.slot,
        });
        const jumpUrl = normalizeJumpUrl(query.data.u, fallbackUrl);
        return reply.redirect(jumpUrl, 302);
      }
    }

    reply.type("text/html; charset=utf-8");
    return renderLandingPage();
  });
};
