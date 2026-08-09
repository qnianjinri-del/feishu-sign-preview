import { beforeEach, describe, expect, it, vi } from "vitest";

const windowMocks = vi.hoisted(() => {
  const current = {
    outerPosition: vi.fn(() => Promise.resolve({ x: 100, y: 100 })),
    outerSize: vi.fn(() => Promise.resolve({ width: 320, height: 420 })),
    setSize: vi.fn(() => Promise.resolve()),
    setPosition: vi.fn(() => Promise.resolve()),
    setAlwaysOnTop: vi.fn(() => Promise.resolve()),
    setIgnoreCursorEvents: vi.fn(() => Promise.resolve()),
    show: vi.fn(() => Promise.resolve()),
    hide: vi.fn(() => Promise.resolve()),
    setFocus: vi.fn(() => Promise.resolve()),
    isVisible: vi.fn(() => Promise.resolve(true)),
  };
  const monitor = { position: { x: 0, y: 0 }, size: { width: 1440, height: 900 }, scaleFactor: 2 };
  return {
    current,
    monitor,
    availableMonitors: vi.fn(() => Promise.resolve([monitor])),
    primaryMonitor: vi.fn<() => Promise<typeof monitor | null>>(() => Promise.resolve(monitor)),
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  PhysicalPosition: class PhysicalPosition { constructor(public x: number, public y: number) {} },
  PhysicalSize: class PhysicalSize { constructor(public width: number, public height: number) {} },
  availableMonitors: windowMocks.availableMonitors,
  primaryMonitor: windowMocks.primaryMonitor,
  getCurrentWindow: () => windowMocks.current,
}));

import {
  ensureWindowVisible,
  hideWindow,
  setWindowAlwaysOnTop,
  setWindowClickThrough,
  showWindow,
  toggleWindowVisibility,
} from "../src/services/tauriWindow";

describe("Tauri window boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    windowMocks.current.outerPosition.mockResolvedValue({ x: 100, y: 100 });
    windowMocks.current.outerSize.mockResolvedValue({ width: 320, height: 420 });
    windowMocks.current.isVisible.mockResolvedValue(true);
    windowMocks.availableMonitors.mockResolvedValue([windowMocks.monitor]);
    windowMocks.primaryMonitor.mockResolvedValue(windowMocks.monitor);
  });

  it("keeps a usable onscreen window in place", async () => {
    await ensureWindowVisible();
    expect(windowMocks.current.setSize).not.toHaveBeenCalled();
    expect(windowMocks.current.setPosition).not.toHaveBeenCalled();
  });

  it("repairs a tiny offscreen window at the primary monitor top-right", async () => {
    windowMocks.current.outerPosition.mockResolvedValue({ x: -900, y: -900 });
    windowMocks.current.outerSize.mockResolvedValue({ width: 100, height: 80 });
    await ensureWindowVisible();
    expect(windowMocks.current.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 260, height: 160 }));
    expect(windowMocks.current.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 1132, y: 48 }));
  });

  it("can force repositioning and tolerates a missing monitor", async () => {
    await ensureWindowVisible(true);
    expect(windowMocks.current.setPosition).toHaveBeenCalled();
    windowMocks.primaryMonitor.mockResolvedValue(null);
    windowMocks.availableMonitors.mockResolvedValue([]);
    await expect(ensureWindowVisible(true)).resolves.toBeUndefined();
  });

  it("forwards window visibility and interaction operations", async () => {
    await setWindowAlwaysOnTop(false);
    await setWindowClickThrough(true);
    await showWindow();
    await hideWindow();
    await toggleWindowVisibility();
    expect(windowMocks.current.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(windowMocks.current.setIgnoreCursorEvents).toHaveBeenCalledWith(true);
    expect(windowMocks.current.show).toHaveBeenCalledOnce();
    expect(windowMocks.current.hide).toHaveBeenCalledTimes(2);

    windowMocks.current.isVisible.mockResolvedValue(false);
    await toggleWindowVisibility();
    expect(windowMocks.current.show).toHaveBeenCalledTimes(2);
    expect(windowMocks.current.setFocus).toHaveBeenCalledTimes(2);
  });
});
