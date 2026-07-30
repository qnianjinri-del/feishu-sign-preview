import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { isTauriRuntime } from "./runtime";

export interface ShortcutRegistrationResult {
  window: boolean;
  clickThrough: boolean;
  errors: string[];
}

function nativeShortcut(value: string): string {
  return value.replace(/^Command\+/i, "CommandOrControl+").replace(/\s+/g, "");
}

export async function registerGlobalShortcuts(
  windowShortcut: string,
  clickThroughShortcut: string,
  handlers: { toggleWindow: () => void; toggleClickThrough: () => void },
): Promise<ShortcutRegistrationResult> {
  if (!isTauriRuntime()) return { window: true, clickThrough: true, errors: [] };

  const result: ShortcutRegistrationResult = { window: false, clickThrough: false, errors: [] };
  const windowNative = nativeShortcut(windowShortcut);
  const clickNative = nativeShortcut(clickThroughShortcut);

  // Clear registrations left by a dev hot reload before claiming the new combinations.
  await Promise.all([unregister(windowNative).catch(() => undefined), unregister(clickNative).catch(() => undefined)]);

  try {
    await register(windowNative, (event) => {
      if (event.state === "Pressed") handlers.toggleWindow();
    });
    result.window = true;
  } catch {
    result.errors.push(`快捷键 ${windowShortcut} 注册失败`);
  }

  try {
    await register(clickNative, (event) => {
      if (event.state === "Pressed") handlers.toggleClickThrough();
    });
    result.clickThrough = true;
  } catch {
    result.errors.push(`快捷键 ${clickThroughShortcut} 注册失败`);
  }
  return result;
}

export async function unregisterGlobalShortcuts(...shortcuts: string[]): Promise<void> {
  if (!isTauriRuntime()) return;
  await Promise.all(shortcuts.map((shortcut) => unregister(nativeShortcut(shortcut)).catch(() => undefined)));
}
