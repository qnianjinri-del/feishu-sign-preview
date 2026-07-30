import { useEffect } from "react";
import { listenForTrayAction, quitApp, syncTrayState } from "../services/tray";
import { showWindow } from "../services/tauriWindow";
import { useTaskStore } from "../stores/taskStore";

export function useSystemIntegration(
  onNewTask: () => void,
  onOpenSettings: () => void,
  alwaysOnTop: boolean,
  clickThrough: boolean,
  launchAtLogin: boolean,
): void {
  useEffect(() => {
    const cleanups = Promise.all([
      listenForTrayAction("new-task", onNewTask),
      listenForTrayAction("open-settings", onOpenSettings),
      listenForTrayAction("toggle-always-on-top", () => {
        const store = useTaskStore.getState();
        void store.setAlwaysOnTop(!store.settings.alwaysOnTop);
      }),
      listenForTrayAction("toggle-click-through", () => {
        const store = useTaskStore.getState();
        void store.setClickThrough(!store.settings.clickThrough);
      }),
      listenForTrayAction("toggle-launch-at-login", () => {
        const store = useTaskStore.getState();
        void store.setLaunchAtLogin(!store.settings.launchAtLogin);
      }),
      listenForTrayAction("quit-requested", () => {
        void useTaskStore.getState().persist().finally(() => quitApp());
      }),
    ]);
    return () => {
      void cleanups.then((unlisten) => unlisten.forEach((cleanup) => cleanup()));
    };
  }, [onNewTask, onOpenSettings]);

  useEffect(() => {
    void syncTrayState({ alwaysOnTop, clickThrough, launchAtLogin }).catch(() => undefined);
  }, [alwaysOnTop, clickThrough, launchAtLogin]);

  useEffect(() => {
    if (!clickThrough) void showWindow().catch(() => undefined);
  }, [clickThrough]);
}
