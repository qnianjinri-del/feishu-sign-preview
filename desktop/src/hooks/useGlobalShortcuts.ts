import { useEffect } from "react";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "../services/shortcuts";
import { toggleWindowVisibility } from "../services/tauriWindow";
import { useTaskStore } from "../stores/taskStore";

export function useGlobalShortcuts(windowShortcut: string, clickThroughShortcut: string): void {
  useEffect(() => {
    let cancelled = false;
    void registerGlobalShortcuts(windowShortcut, clickThroughShortcut, {
      toggleWindow: () => void toggleWindowVisibility(),
      toggleClickThrough: () => {
        const store = useTaskStore.getState();
        void store.setClickThrough(!store.settings.clickThrough);
      },
    }).then((result) => {
      if (!cancelled) useTaskStore.getState().setShortcutStatus(result);
    });

    return () => {
      cancelled = true;
      void unregisterGlobalShortcuts(windowShortcut, clickThroughShortcut);
    };
  }, [clickThroughShortcut, windowShortcut]);
}
