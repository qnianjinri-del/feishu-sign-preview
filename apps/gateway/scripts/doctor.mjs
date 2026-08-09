import "./load-env.mjs";
import { spawn } from "node:child_process";
import process from "node:process";

const required = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "BITABLE_APP_TOKEN",
  "BITABLE_TABLE_ID",
  "FLOATLIST_CLIENT_TOKEN",
];

function line(symbol, message) {
  process.stdout.write(`${symbol} ${message}\n`);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 22) line("✓", `Node.js ${process.versions.node}`);
else {
  line("✗", `Node.js ${process.versions.node} 过旧，需要 22 或更高版本`);
  process.exitCode = 1;
}

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  line("✗", `缺少环境变量：${missing.join(", ")}`);
  line("→", "未输出任何变量值；请编辑本机 .env 后重试");
  process.exitCode = 1;
} else {
  line("✓", "同步网关所需环境变量已填写（值已隐藏）");
}

const port = Number(process.env.PORT || 3000);
const healthUrl = process.env.FLOATLIST_DOCTOR_URL?.trim()
  || `http://127.0.0.1:${Number.isFinite(port) ? port : 3000}/health/ready`;
try {
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(3_000) });
  const payload = await response.json();
  if (response.ok && payload?.status === "ok" && payload?.syncApiVersion === 2) {
    line(payload.syncConfigured ? "✓" : "✗", `网关健康检查：${healthUrl}`);
    line("✓", `同步协议 v${payload.syncApiVersion}，网关 ${payload.gatewayVersion || "unknown"}`);
    if (!payload.syncConfigured) process.exitCode = 1;
  } else {
    line("✗", `网关健康检查失败或协议不兼容（HTTP ${response.status}）`);
    process.exitCode = 1;
  }
} catch {
  line("!", `网关未运行，已跳过在线检查：${healthUrl}`);
}

if (!missing.filter((name) => name !== "FLOATLIST_CLIENT_TOKEN").length) {
  line("→", "正在只读检查飞书多维表格字段…");
  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/setup-bitable-fields.mjs", "--check"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode === 0) line("✓", "飞书字段只读检查完成");
  else {
    line("✗", "飞书字段检查失败；doctor 未修改任何记录或字段");
    process.exitCode = 1;
  }
} else {
  line("!", "飞书凭证不完整，已跳过字段检查");
}
