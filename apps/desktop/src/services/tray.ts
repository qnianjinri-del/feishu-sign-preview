import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "./runtime";

export type TrayAction =
  | "new-task"
  | "open-settings"
  | "toggle-always-on-top"
  | "toggle-click-through"
  | "toggle-launch-at-login"
  | "quit-requested";

export async function listenForTrayAction(action: TrayAction, handler: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  return listen(`floatlist://${action}`, handler);
}

export async function syncTrayState(values: {
  alwaysOnTop: boolean;
  clickThrough: boolean;
  launchAtLogin: boolean;
}): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("sync_tray_state", {
    alwaysOnTop: values.alwaysOnTop,
    clickThrough: values.clickThrough,
    launchAtLogin: values.launchAtLogin,
  });
}

export async function quitApp(): Promise<void> {
  if (isTauriRuntime()) await invoke("quit_app");
}
