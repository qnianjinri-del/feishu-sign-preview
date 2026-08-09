import { useEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  ListPlus,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import type { Task, TaskStatus } from "../../types/task";

export interface MenuPosition {
  left: number;
  top: number;
}

interface TaskContextMenuProps {
  isSubtask: boolean;
  position: MenuPosition;
  task: Task;
  onBlock: () => void;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSchedule: () => void;
  onStatus: (status: TaskStatus) => void;
  onSubtask: () => void;
}

export function TaskContextMenu({
  isSubtask,
  position,
  task,
  onBlock,
  onClose,
  onDelete,
  onEdit,
  onSchedule,
  onStatus,
  onSubtask,
}: TaskContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const menuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.key.startsWith("Arrow") && event.key !== "Home" && event.key !== "End") return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowUp"
          ? (current - 1 + items.length) % items.length
          : (current + 1) % items.length;
    items[next]?.focus();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="task-context-menu"
      role="menu"
      aria-label={`“${task.text}”事项操作`}
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={menuKeyDown}
    >
      <button type="button" role="menuitem" autoFocus={task.status !== "doing"} disabled={task.status === "doing"} onClick={() => onStatus("doing")}>
        <Play size={14} fill="currentColor" />
        标记为正在做
      </button>
      <button type="button" role="menuitem" autoFocus={task.status === "doing"} disabled={task.status === "todo"} onClick={() => onStatus("todo")}>
        <Circle size={14} />
        标记为待办
      </button>
      <button type="button" role="menuitem" onClick={onBlock}>
        <AlertTriangle size={14} />
        {task.status === "blocked" ? "修改受阻原因" : "标记为受阻"}
      </button>
      <button type="button" role="menuitem" disabled={task.status === "done"} onClick={() => onStatus("done")}>
        <CheckCircle2 size={14} />
        标记为已完成
      </button>
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" onClick={onSchedule}>
        <CalendarClock size={14} />
        日期与提醒
      </button>
      {!isSubtask && (
        <button type="button" role="menuitem" onClick={onSubtask}>
          <ListPlus size={14} />
          添加子事项
        </button>
      )}
      <button type="button" role="menuitem" onClick={onEdit}>
        <Pencil size={14} />
        编辑事项
      </button>
      <button type="button" role="menuitem" className="danger-text" onClick={onDelete}>
        <Trash2 size={14} />
        删除事项
      </button>
    </div>,
    document.body,
  );
}
