import { useEffect } from "react";
import { initializeSyncToken, runTaskSync } from "../services/syncCoordinator";
import { useTaskStore } from "../stores/taskStore";

export function useBitableSync(): void {
  const hydrated = useTaskStore((state) => state.hydrated);
  const enabled = useTaskStore((state) => state.settings.syncEnabled);
  const pollIntervalSeconds = useTaskStore((state) => state.settings.syncPollIntervalSeconds);
  const outboxLength = useTaskStore((state) => state.sync.outbox.length);
  const tokenConfigured = useTaskStore((state) => state.syncRuntime.tokenConfigured);

  useEffect(() => {
    if (!hydrated) return;
    void initializeSyncToken().then((configured) => {
      if (configured && useTaskStore.getState().settings.syncEnabled) void runTaskSync();
    });
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !enabled || !tokenConfigured) return;
    if (outboxLength) void runTaskSync();
  }, [enabled, hydrated, outboxLength, tokenConfigured]);

  useEffect(() => {
    if (!hydrated || !enabled || !tokenConfigured) return;
    let timer: number | undefined;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      const delaySeconds = document.visibilityState === "visible" ? pollIntervalSeconds : 60;
      timer = window.setTimeout(async () => {
        await runTaskSync();
        schedule();
      }, delaySeconds * 1_000);
    };
    const onVisibilityChange = () => {
      if (timer) window.clearTimeout(timer);
      if (document.visibilityState === "visible") void runTaskSync();
      schedule();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void runTaskSync();
    schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, hydrated, pollIntervalSeconds, tokenConfigured]);
}
