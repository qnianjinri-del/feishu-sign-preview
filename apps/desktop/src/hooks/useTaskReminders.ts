import { useEffect } from "react";
import { reconcileTaskReminders } from "../services/notifications";
import { useTaskStore } from "../stores/taskStore";

export function useTaskReminders(): void {
  const hydrated = useTaskStore((state) => state.hydrated);
  const remindersEnabled = useTaskStore((state) => state.settings.remindersEnabled);
  const tasks = useTaskStore((state) => state.tasks);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void reconcileTaskReminders(tasks, remindersEnabled);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [hydrated, remindersEnabled, tasks]);
}
