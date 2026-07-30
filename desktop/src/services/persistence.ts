import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import type { PersistedState } from "../types/state";
import { migratePersistedState } from "../utils/migrations";
import { isTauriRuntime } from "./runtime";

const STORE_FILE = "floatlist.json";
const STORE_KEY = "state";
const SAVE_DELAY_MS = 220;

let storePromise: Promise<Store> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: PersistedState | null = null;
let memoryState: unknown;

async function openStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE, { autoSave: false });
  }
  return storePromise;
}

export interface LoadedPersistedState {
  state: PersistedState;
  isFirstLaunch: boolean;
}

export async function loadPersistedState(): Promise<LoadedPersistedState> {
  if (!isTauriRuntime()) return { state: migratePersistedState(memoryState), isFirstLaunch: memoryState === undefined };

  try {
    const store = await openStore();
    const raw = await store.get<unknown>(STORE_KEY);
    return { state: migratePersistedState(raw), isFirstLaunch: raw === undefined };
  } catch (originalError) {
    storePromise = null;
    try {
      await invoke("backup_corrupt_store");
      const store = await openStore();
      const raw = await store.get<unknown>(STORE_KEY);
      return { state: migratePersistedState(raw), isFirstLaunch: raw === undefined };
    } catch {
      throw originalError;
    }
  }
}

async function writeState(state: PersistedState): Promise<void> {
  if (!isTauriRuntime()) {
    memoryState = structuredClone(state);
    return;
  }
  const store = await openStore();
  await store.set(STORE_KEY, state);
  await store.save();
}

export function schedulePersist(state: PersistedState, onError: (message: string) => void): void {
  pendingState = structuredClone(state);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const next = pendingState;
    pendingState = null;
    saveTimer = null;
    if (next) void writeState(next).catch(() => onError("保存失败，当前修改仍保留在内存中"));
  }, SAVE_DELAY_MS);
}

export async function flushPersist(state?: PersistedState): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const next = state ?? pendingState;
  pendingState = null;
  if (next) await writeState(next);
}

export function setMemoryPersistedStateForTests(value: unknown): void {
  memoryState = value;
  pendingState = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
