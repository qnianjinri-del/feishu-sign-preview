import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = os.homedir();
const label = "com.feishu.floatlist.gateway";
const launchAgentsDir = path.join(home, "Library", "LaunchAgents");
const logsDir = path.join(home, "Library", "Logs", "FloatList");
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const logPath = path.join(logsDir, "sync-gateway.log");
const nodePath = process.execPath;
const appPath = path.join(repoRoot, "dist", "app.js");

function xml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plist() {
  const args = [nodePath, appPath];
  const argsXml = args.map((arg) => `    <string>${xml(arg)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(repoRoot)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>${xml(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logPath)}</string>
</dict>
</plist>
`;
}

async function launchctl(...args) {
  try {
    await execFileAsync("launchctl", args);
  } catch (error) {
    const code = error?.code;
    const message = error instanceof Error ? error.message : String(error);
    if (args[0] === "bootout" && (code === 3 || code === 36 || message.includes("No such process") || message.includes("Could not find service"))) return;
    throw error;
  }
}

await mkdir(launchAgentsDir, { recursive: true });
await mkdir(logsDir, { recursive: true });
await writeFile(plistPath, plist(), { mode: 0o600 });

const domain = `gui/${process.getuid()}`;
try {
  await launchctl("bootout", `${domain}/${label}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("Could not find service")) throw error;
}
await launchctl("bootstrap", domain, plistPath);
await launchctl("enable", `${domain}/${label}`);

console.log(`已安装并启动 ${label}`);
console.log(`配置文件：${plistPath}`);
console.log(`日志文件：${logPath}`);
