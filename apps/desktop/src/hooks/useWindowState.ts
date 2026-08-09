import { useEffect } from "react";
import { ensureWindowVisible, setWindowAlwaysOnTop, setWindowClickThrough } from "../services/tauriWindow";
import { useTaskStore } from "../stores/taskStore";

export function useWindowState(hydrated: boolean, firstLaunch: boolean): void {
  useEffect(() => {
    if (!hydrated) return;
    const alwaysOnTop = useTaskStore.getState().settings.alwaysOnTop;
    void Promise.all([ensureWindowVisible(firstLaunch), setWindowAlwaysOnTop(alwaysOnTop), setWindowClickThrough(false)]).catch(() => {
      useTaskStore.getState().showError("窗口状态恢复失败，已使用安全位置");
    });
  }, [firstLaunch, hydrated]);
}
