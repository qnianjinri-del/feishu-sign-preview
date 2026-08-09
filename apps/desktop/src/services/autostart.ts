import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isTauriRuntime } from "./runtime";

export async function readLaunchAtLogin(): Promise<boolean> {
  return isTauriRuntime() ? isEnabled() : false;
}

export async function setLaunchAtLoginEnabled(value: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  if (value) await enable();
  else await disable();
}
