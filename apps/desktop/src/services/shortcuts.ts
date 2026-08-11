import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { isTauriRuntime } from "./runtime";

export interface ShortcutRegistrationResult {
  window: boolean;
  clickThrough: boolean;
  quickAdd: boolean;
  errors: string[];
}

function nativeShortcut(value: string): string {
  return value.replace(/^Command\+/i, "CommandOrControl+").replace(/\s+/g, "");
}

export async function registerGlobalShortcuts(
  windowShortcut: string,
  clickThroughShortcut: string,
  quickAddShortcut: string,
  handlers: { toggleWindow: () => void; toggleClickThrough: () => void; quickAdd: () => void },
): Promise<ShortcutRegistrationResult> {
  if (!isTauriRuntime()) return { window: true, clickThrough: true, quickAdd: true, errors: [] };

  const result: ShortcutRegistrationResult = { window: false, clickThrough: false, quickAdd: false, errors: [] };
  const windowNative = nativeShortcut(windowShortcut);
  const clickNative = nativeShortcut(clickThroughShortcut);
  const quickAddNative = nativeShortcut(quickAddShortcut);

  // Clear registrations left by a dev hot reload before claiming the new combinations.
  await Promise.all([...new Set([windowNative, clickNative, quickAddNative])]
    .map((shortcut) => unregister(shortcut).catch(() => undefined)));

  const duplicates = new Set<string>();
  for (const [shortcut, count] of [...new Set([windowNative, clickNative, quickAddNative])]
    .map((shortcut) => [shortcut, [windowNative, clickNative, quickAddNative].filter((item) => item === shortcut).length] as const)) {
    if (count > 1) duplicates.add(shortcut);
  }

  const registerOne = async (
    native: string,
    display: string,
    key: "window" | "clickThrough" | "quickAdd",
    handler: () => void,
  ) => {
    if (duplicates.has(native)) {
      result.errors.push(`快捷键 ${display} 与其他操作重复`);
      return;
    }
    try {
      await register(native, (event) => {
        if (event.state === "Pressed") handler();
      });
      result[key] = true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      result.errors.push(detail ? `快捷键 ${display} 注册失败：${detail}` : `快捷键 ${display} 注册失败`);
    }
  };

  await registerOne(windowNative, windowShortcut, "window", handlers.toggleWindow);
  await registerOne(clickNative, clickThroughShortcut, "clickThrough", handlers.toggleClickThrough);
  await registerOne(quickAddNative, quickAddShortcut, "quickAdd", handlers.quickAdd);
  return result;
}

export async function unregisterGlobalShortcuts(...shortcuts: string[]): Promise<void> {
  if (!isTauriRuntime()) return;
  await Promise.all(shortcuts.map((shortcut) => unregister(nativeShortcut(shortcut)).catch(() => undefined)));
}
