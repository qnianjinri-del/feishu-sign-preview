import { beforeEach, describe, expect, it, vi } from "vitest";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { registerGlobalShortcuts } from "../src/services/shortcuts";

vi.mock("../src/services/runtime", () => ({ isTauriRuntime: () => true }));
vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: vi.fn(() => Promise.resolve()),
  unregister: vi.fn(() => Promise.resolve()),
}));

describe("native global shortcut registration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects duplicate combinations while keeping an independent shortcut active", async () => {
    const result = await registerGlobalShortcuts(
      "Command+Shift+N",
      "Command+Shift+L",
      "Command+Shift+N",
      { toggleWindow: vi.fn(), toggleClickThrough: vi.fn(), quickAdd: vi.fn() },
    );
    expect(result).toMatchObject({ window: false, clickThrough: true, quickAdd: false });
    expect(result.errors).toHaveLength(2);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("CommandOrControl+Shift+L", expect.any(Function));
    expect(unregister).toHaveBeenCalledTimes(2);
  });
});
