import { useCallback, useEffect, useState } from "react";
import { FloatingPanel } from "../components/FloatingPanel/FloatingPanel";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useBitableSync } from "../hooks/useBitableSync";
import { useSystemIntegration } from "../hooks/useSystemIntegration";
import { useTheme } from "../hooks/useTheme";
import { useWindowState } from "../hooks/useWindowState";
import { useTaskStore } from "../stores/taskStore";

export default function App() {
  const [focusSignal, setFocusSignal] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useTaskStore((state) => state.settings);
  const hydrated = useTaskStore((state) => state.hydrated);
  const firstLaunch = useTaskStore((state) => state.firstLaunch);
  const hydrate = useTaskStore((state) => state.hydrate);
  const persist = useTaskStore((state) => state.persist);
  const undo = useTaskStore((state) => state.undo);
  const redo = useTaskStore((state) => state.redo);
  const requestAdd = useCallback(() => setFocusSignal((signal) => signal + 1), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useTheme(settings.theme);
  useBitableSync();
  useGlobalShortcuts(settings.toggleWindowShortcut, settings.toggleClickThroughShortcut);
  useWindowState(hydrated, firstLaunch);
  useSystemIntegration(
    requestAdd,
    openSettings,
    settings.alwaysOnTop,
    settings.clickThrough,
    settings.launchAtLogin,
  );

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditor = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      if (event.metaKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        requestAdd();
      } else if (event.metaKey && event.key === ",") {
        event.preventDefault();
        openSettings();
      } else if (event.metaKey && event.key.toLowerCase() === "z" && !inEditor) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSettings, redo, requestAdd, undo]);

  useEffect(() => {
    const onBeforeUnload = () => { void persist(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [persist]);

  if (!hydrated) return <div className="startup-shell" aria-label="正在加载 FloatList" />;

  return (
    <FloatingPanel
      focusSignal={focusSignal}
      settingsOpen={settingsOpen}
      onRequestAdd={requestAdd}
      onOpenSettings={openSettings}
      onCloseSettings={closeSettings}
    />
  );
}
