import type { AppSettings, ThemeMode } from "../../types/settings";
import type { PersistedState } from "../../types/state";
import { readLaunchAtLogin, setLaunchAtLoginEnabled } from "../../services/autostart";
import { flushPersist, loadPersistedState } from "../../services/persistence";
import { setWindowAlwaysOnTop, setWindowClickThrough } from "../../services/tauriWindow";
import { nextToast, persistSoon, persistedSnapshot, updateSettings } from "../storeHelpers";
import type { StoreSliceCreator } from "../storeTypes";

export interface ShortcutStatus {
  window: boolean;
  clickThrough: boolean;
  quickAdd: boolean;
  errors: string[];
}

export interface SettingsSlice {
  settings: AppSettings;
  hydrated: boolean;
  firstLaunch: boolean;
  shortcutStatus: ShortcutStatus;
  setListTitle: (title: string) => void;
  setOpacity: (opacity: number) => void;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  setShowCompleted: (value: boolean) => void;
  setCompactMode: (value: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  setClickThrough: (value: boolean) => Promise<void>;
  setLaunchAtLogin: (value: boolean) => Promise<void>;
  setShortcuts: (windowShortcut: string, clickThroughShortcut: string, quickAddShortcut: string) => void;
  setOnboardingCompleted: (value: boolean) => void;
  setRemindersEnabled: (value: boolean) => void;
  setShortcutStatus: (status: ShortcutStatus) => void;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
}

export function createSettingsSlice(initial: PersistedState): StoreSliceCreator<SettingsSlice> {
  return (set, get) => ({
    settings: initial.settings,
    hydrated: false,
    firstLaunch: false,
    shortcutStatus: { window: false, clickThrough: false, quickAdd: false, errors: [] },

    setListTitle: (title) => {
      const clean = title.trim().slice(0, 80) || "工作清单";
      updateSettings(set, get, { listTitle: clean });
    },
    setOpacity: (opacity) => updateSettings(set, get, {
      opacity: Math.min(0.95, Math.max(0.35, opacity)),
    }),
    setShowCompleted: (showCompleted) => updateSettings(set, get, { showCompleted }),
    setCompactMode: (compactMode) => updateSettings(set, get, { compactMode }),
    setTheme: (theme) => updateSettings(set, get, { theme }),
    setShortcuts: (toggleWindowShortcut, toggleClickThroughShortcut, quickAddShortcut) =>
      updateSettings(set, get, {
        toggleWindowShortcut,
        toggleClickThroughShortcut,
        quickAddShortcut,
      }),
    setOnboardingCompleted: (onboardingCompleted) => updateSettings(set, get, { onboardingCompleted }),
    setRemindersEnabled: (remindersEnabled) => updateSettings(set, get, { remindersEnabled }),

    setAlwaysOnTop: async (alwaysOnTop) => {
      const previous = get().settings.alwaysOnTop;
      updateSettings(set, get, { alwaysOnTop });
      try {
        await setWindowAlwaysOnTop(alwaysOnTop);
      } catch {
        updateSettings(set, get, { alwaysOnTop: previous });
        get().showError("无法更新始终置顶状态");
      }
    },

    setClickThrough: async (clickThrough) => {
      if (clickThrough && !get().shortcutStatus.clickThrough) {
        get().showError("穿透快捷键不可用，已阻止进入点击穿透模式");
        return;
      }
      try {
        await setWindowClickThrough(clickThrough);
        updateSettings(set, get, { clickThrough });
      } catch {
        get().showError(clickThrough ? "无法开启点击穿透" : "无法关闭点击穿透，请使用菜单栏重试");
      }
    },

    setLaunchAtLogin: async (launchAtLogin) => {
      try {
        await setLaunchAtLoginEnabled(launchAtLogin);
        updateSettings(set, get, { launchAtLogin });
      } catch {
        get().showError("无法更新开机启动设置");
      }
    },

    setShortcutStatus: (shortcutStatus) => set({ shortcutStatus }),

    hydrate: async () => {
      try {
        const loadedResult = await loadPersistedState();
        const loaded = loadedResult.state;
        let launchAtLogin = loaded.settings.launchAtLogin;
        try {
          launchAtLogin = await readLaunchAtLogin();
        } catch {
          // Keep the persisted value if the OS query is unavailable.
        }
        set({
          tasks: loaded.tasks,
          settings: { ...loaded.settings, clickThrough: false, launchAtLogin },
          sync: loaded.sync,
          syncRuntime: {
            status: loaded.settings.syncEnabled ? "idle" : "disabled",
            tokenConfigured: false,
            warnings: [],
          },
          hydrated: true,
          firstLaunch: loadedResult.isFirstLaunch,
          historyPast: [],
          historyFuture: [],
        });
        if (loadedResult.isFirstLaunch) persistSoon(get);
      } catch {
        set({
          hydrated: true,
          firstLaunch: true,
          toast: nextToast("本地数据读取失败，已使用默认清单"),
        });
      }
    },

    persist: async () => {
      await flushPersist(persistedSnapshot(get()));
    },
  });
}
