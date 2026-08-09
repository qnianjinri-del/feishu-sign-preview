import { useEffect } from "react";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "../services/shortcuts";
import { showWindow, toggleWindowVisibility } from "../services/tauriWindow";
import { useTaskStore } from "../stores/taskStore";

export function useGlobalShortcuts(
  windowShortcut: string,
  clickThroughShortcut: string,
  quickAddShortcut: string,
  onQuickAdd: () => void,
): void {
  useEffect(() => {
    let cancelled = false;
    void registerGlobalShortcuts(windowShortcut, clickThroughShortcut, quickAddShortcut, {
      toggleWindow: () => void toggleWindowVisibility(),
      toggleClickThrough: () => {
        const store = useTaskStore.getState();
        void store.setClickThrough(!store.settings.clickThrough);
      },
      quickAdd: () => {
        const store = useTaskStore.getState();
        const prepare = store.settings.clickThrough ? store.setClickThrough(false) : Promise.resolve();
        void prepare.then(showWindow).then(onQuickAdd).catch(() => store.showError("无法唤起快速新增"));
      },
    }).then((result) => {
      if (!cancelled) useTaskStore.getState().setShortcutStatus(result);
    });

    return () => {
      cancelled = true;
      void unregisterGlobalShortcuts(windowShortcut, clickThroughShortcut, quickAddShortcut);
    };
  }, [clickThroughShortcut, onQuickAdd, quickAddShortcut, windowShortcut]);
}
