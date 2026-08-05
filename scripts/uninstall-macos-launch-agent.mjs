import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const label = "com.feishu.floatlist.gateway";
const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const domain = `gui/${process.getuid()}`;

try {
  await execFileAsync("launchctl", ["bootout", `${domain}/${label}`]);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("Could not find service") && !message.includes("No such process")) throw error;
}

try {
  await unlink(plistPath);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(`已停止并移除 ${label}`);
