import { describe, expect, it, vi } from "vitest";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "../src/services/shortcuts";

describe("global shortcuts outside Tauri", () => {
  it("reports all three shortcuts as available and accepts cleanup", async () => {
    const handlers = { toggleWindow: vi.fn(), toggleClickThrough: vi.fn(), quickAdd: vi.fn() };
    await expect(registerGlobalShortcuts(
      "Command+Shift+Space",
      "Command+Shift+L",
      "Command+Shift+N",
      handlers,
    )).resolves.toEqual({ window: true, clickThrough: true, quickAdd: true, errors: [] });
    await expect(unregisterGlobalShortcuts("Command+Shift+Space", "Command+Shift+L", "Command+Shift+N"))
      .resolves.toBeUndefined();
  });
});
