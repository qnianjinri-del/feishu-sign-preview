import type { FastifyPluginAsync } from "fastify";

import { config } from "../config.js";
import { normalizeJumpUrl } from "../lib/url.js";
import { escapeHtml } from "../utils/text.js";
import { rootQuerySchema } from "../utils/validation.js";

function renderLandingPage() {
  const exampleBase = config.publicBaseUrl;
  const pureText = `${exampleBase}/?t=${encodeURIComponent("你好呀~")}`;
  const imageText = `${exampleBase}/?k=img_v3_xxx&t=${encodeURIComponent("你好呀~")}`;
  const imageTextLink = `${exampleBase}/?k=img_v3_xxx&t=${encodeURIComponent("你好呀~")}&u=${encodeURIComponent("https://open.feishu.cn")}`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>飞书个性签名 / 链接预览服务</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe6;
        --panel: rgba(255,255,255,0.88);
        --ink: #132238;
        --muted: #5e6a7d;
        --accent: #0d7c66;
        --accent-2: #d95f43;
        --line: rgba(19,34,56,0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(13,124,102,0.22), transparent 28%),
          radial-gradient(circle at 85% 15%, rgba(217,95,67,0.18), transparent 24%),
          linear-gradient(160deg, #f7f3ea 0%, #ece7de 48%, #e5edf0 100%);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 48px 20px 64px;
      }
      .hero {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 28px;
        backdrop-filter: blur(12px);
        box-shadow: 0 20px 60px rgba(19,34,56,0.08);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(13,124,102,0.12);
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
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
        margin-top: 22px;
      }
      .card {
        background: rgba(255,255,255,0.82);
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
      .accent {
        color: var(--accent-2);
        font-weight: 700;
      }
      a { color: inherit; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="badge">Feishu Link Preview MVP</div>
        <h1>飞书个性签名 / 自定义链接预览服务</h1>
        <p>这套玩法基于飞书的 <span class="accent">链接预览</span> 回调能力：命中 URL 规则后，飞书会向 <code>/api/handler</code> 拉取预览数据，再把普通链接渲染成图标 + 文字的签名样式。</p>
        <div class="grid">
          <article class="card">
            <h2>参数说明</h2>
            <ul>
              <li><code>t</code>：显示文案，缺省时回退为单个空格。</li>
              <li><code>k</code>：飞书图片 <code>image_key</code>，缺省时使用默认链接图标。</li>
              <li><code>u</code>：点击跳转地址，未传或非法时回退到帮助页。</li>
            </ul>
          </article>
          <article class="card">
            <h2>飞书后台配置</h2>
            <ul>
              <li>创建企业自建应用并启用“链接预览”能力。</li>
              <li>URL 规则填写 <code>${escapeHtml(new URL(config.publicBaseUrl).host)}/**</code>。</li>
              <li>事件回调地址配置为 <code>${escapeHtml(config.publicBaseUrl)}/api/handler</code>。</li>
              <li>勾选“拉取链接预览数据”，发布版本并将可用范围设为全部成员。</li>
            </ul>
          </article>
          <article class="card">
            <h2>示例链接</h2>
            <pre>${escapeHtml(pureText)}</pre>
            <pre>${escapeHtml(imageText)}</pre>
            <pre>${escapeHtml(imageTextLink)}</pre>
          </article>
          <article class="card">
            <h2>图标建议</h2>
            <ul>
              <li>透明背景、纯白主体、尽量小体积。</li>
              <li>GIF / APNG 桌面端可动，移动端通常只显示首帧。</li>
              <li>本服务不依赖公共海外服务，适合私有部署。</li>
            </ul>
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
      const jumpUrl = normalizeJumpUrl(query.data.u, config.helpUrl);
      if (query.data.u && jumpUrl !== config.helpUrl) {
        return reply.redirect(jumpUrl, 302);
      }
    }

    reply.type("text/html; charset=utf-8");
    return renderLandingPage();
  });
};
