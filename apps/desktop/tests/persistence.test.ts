import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPersist,
  loadPersistedState,
  schedulePersist,
  setMemoryPersistedStateForTests,
} from "../src/services/persistence";
import { createDefaultState } from "../src/utils/defaults";

describe("memory persistence boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setMemoryPersistedStateForTests(undefined);
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  afterEach(() => vi.useRealTimers());

  it("distinguishes first launch from an existing empty list", async () => {
    expect((await loadPersistedState()).isFirstLaunch).toBe(true);
    const state = createDefaultState();
    state.tasks = [];
    await flushPersist(state);
    const loaded = await loadPersistedState();
    expect(loaded.isFirstLaunch).toBe(false);
    expect(loaded.state.tasks).toEqual([]);
  });

  it("debounces writes and flushes only the latest pending state", async () => {
    const first = createDefaultState();
    first.settings.listTitle = "第一版";
    const second = createDefaultState();
    second.settings.listTitle = "第二版";
    const onError = vi.fn();
    schedulePersist(first, onError);
    schedulePersist(second, onError);
    await flushPersist();
    expect((await loadPersistedState()).state.settings.listTitle).toBe("第二版");
    expect(onError).not.toHaveBeenCalled();
  });

  it("writes after the debounce delay", async () => {
    const state = createDefaultState();
    state.settings.listTitle = "自动保存";
    schedulePersist(state, () => undefined);
    await vi.advanceTimersByTimeAsync(220);
    expect((await loadPersistedState()).state.settings.listTitle).toBe("自动保存");
  });
});
