import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disable: vi.fn(() => Promise.resolve()),
  enable: vi.fn(() => Promise.resolve()),
  isEnabled: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("@tauri-apps/plugin-autostart", () => mocks);

import { readLaunchAtLogin, setLaunchAtLoginEnabled } from "../src/services/autostart";

describe("autostart boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("is a no-op in the browser preview", async () => {
    expect(await readLaunchAtLogin()).toBe(false);
    await setLaunchAtLoginEnabled(true);
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("reads, enables and disables the native launch item", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    expect(await readLaunchAtLogin()).toBe(true);
    await setLaunchAtLoginEnabled(true);
    await setLaunchAtLoginEnabled(false);
    expect(mocks.enable).toHaveBeenCalledOnce();
    expect(mocks.disable).toHaveBeenCalledOnce();
  });
});
