import { useEffect } from "react";
import { useTaskStore } from "../../stores/taskStore";

export function UndoToast() {
  const toast = useTaskStore((state) => state.toast);
  const undo = useTaskStore((state) => state.undo);
  const dismiss = useTaskStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(dismiss, 4_000);
    return () => window.clearTimeout(timeout);
  }, [dismiss, toast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.undo && (
        <button type="button" onClick={undo}>撤销</button>
      )}
    </div>
  );
}
