import {
  PhysicalPosition,
  PhysicalSize,
  availableMonitors,
  getCurrentWindow,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { isTauriRuntime } from "./runtime";

const MIN_WIDTH = 260;
const MIN_HEIGHT = 160;

function containsUsefulArea(
  position: { x: number; y: number },
  size: { width: number; height: number },
  monitor: Monitor,
): boolean {
  const left = Math.max(position.x, monitor.position.x);
  const top = Math.max(position.y, monitor.position.y);
  const right = Math.min(position.x + size.width, monitor.position.x + monitor.size.width);
  const bottom = Math.min(position.y + size.height, monitor.position.y + monitor.size.height);
  return right - left >= 80 && bottom - top >= 60;
}

export async function ensureWindowVisible(forceTopRight = false): Promise<void> {
  if (!isTauriRuntime()) return;
  const window = getCurrentWindow();
  const [position, rawSize, monitors] = await Promise.all([
    window.outerPosition(),
    window.outerSize(),
    availableMonitors(),
  ]);
  const width = Math.max(MIN_WIDTH, rawSize.width);
  const height = Math.max(MIN_HEIGHT, rawSize.height);
  if (width !== rawSize.width || height !== rawSize.height) {
    await window.setSize(new PhysicalSize(width, height));
  }
  if (!forceTopRight && monitors.some((monitor) => containsUsefulArea(position, { width, height }, monitor))) return;

  const monitor = (await primaryMonitor()) ?? monitors[0];
  if (!monitor) return;
  const margin = Math.round(24 * monitor.scaleFactor);
  await window.setPosition(
    new PhysicalPosition(
      monitor.position.x + monitor.size.width - width - margin,
      monitor.position.y + margin,
    ),
  );
}

export async function setWindowAlwaysOnTop(value: boolean): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().setAlwaysOnTop(value);
}

export async function setWindowClickThrough(value: boolean): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().setIgnoreCursorEvents(value);
}

export async function showWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  const window = getCurrentWindow();
  await window.show();
  await window.setFocus();
}

export async function hideWindow(): Promise<void> {
  if (isTauriRuntime()) await getCurrentWindow().hide();
}

export async function toggleWindowVisibility(): Promise<void> {
  if (!isTauriRuntime()) return;
  const window = getCurrentWindow();
  if (await window.isVisible()) await window.hide();
  else {
    await window.show();
    await window.setFocus();
  }
}
