import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  CloudUpload,
  GripVertical,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskStatus } from "../../types/task";
import { useTaskStore } from "../../stores/taskStore";

interface SubtaskProgress {
  blocked: number;
  done: number;
  total: number;
}

interface TaskItemProps {
  isSubtask?: boolean;
  subtaskProgress?: SubtaskProgress;
  task: Task;
}

interface MenuPosition {
  left: number;
  top: number;
}

const MENU_WIDTH = 200;
const MENU_HEIGHT = 265;

function clampedMenuPosition(left: number, top: number): MenuPosition {
  const viewportWidth = globalThis.window?.innerWidth ?? MENU_WIDTH + 16;
  const viewportHeight = globalThis.window?.innerHeight ?? MENU_HEIGHT + 16;
  return {
    left: Math.max(8, Math.min(left, viewportWidth - MENU_WIDTH - 8)),
    top: Math.max(8, Math.min(top, viewportHeight - MENU_HEIGHT - 8)),
  };
}

function taskStatusText(status: TaskStatus): string {
  if (status === "doing") return "正在做";
  if (status === "blocked") return "受阻";
  if (status === "done") return "已完成";
  return "待办";
}

export const TaskItem = memo(function TaskItem({ task, isSubtask = false, subtaskProgress }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [blocking, setBlocking] = useState(false);
  const [blockDraft, setBlockDraft] = useState(task.blockedReason ?? "");
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleTask = useTaskStore((state) => state.toggleTask);
  const setTaskStatus = useTaskStore((state) => state.setTaskStatus);
  const setTaskBlocked = useTaskStore((state) => state.setTaskBlocked);
  const addSubtask = useTaskStore((state) => state.addSubtask);
  const editTask = useTaskStore((state) => state.editTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const syncEnabled = useTaskStore((state) => state.settings.syncEnabled);
  const showError = useTaskStore((state) => state.showError);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: editing || addingSubtask || blocking,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (!menuPosition) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuPosition(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuPosition(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuPosition]);

  const beginEditing = () => {
    setMenuPosition(null);
    setAddingSubtask(false);
    setBlocking(false);
    setDraft(task.text);
    setEditing(true);
  };
  const save = () => {
    editTask(task.id, draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(task.text);
    setEditing(false);
  };
  const updateStatus = (status: TaskStatus) => {
    setTaskStatus(task.id, status);
    setMenuPosition(null);
  };
  const beginAddingSubtask = () => {
    setMenuPosition(null);
    setBlocking(false);
    setSubtaskDraft("");
    setAddingSubtask(true);
  };
  const saveSubtask = () => {
    if (!addSubtask(task.id, subtaskDraft)) return;
    setSubtaskDraft("");
    setAddingSubtask(false);
  };
  const beginBlocking = () => {
    setMenuPosition(null);
    setAddingSubtask(false);
    setBlockDraft(task.blockedReason ?? "");
    setBlocking(true);
  };
  const saveBlocked = () => {
    if (!blockDraft.trim()) {
      showError("请填写受阻原因");
      return;
    }
    setTaskBlocked(task.id, blockDraft);
    setBlocking(false);
  };
  const remove = () => {
    setMenuPosition(null);
    deleteTask(task.id);
  };
  const openContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (!editing && !addingSubtask && !blocking) {
      setMenuPosition(clampedMenuPosition(event.clientX, event.clientY));
    }
  };
  const openMoreMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition(clampedMenuPosition(rect.right - MENU_WIDTH, rect.bottom + 4));
  };
  const editKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };
  const subtaskKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      saveSubtask();
    } else if (event.key === "Escape") {
      setAddingSubtask(false);
    }
  };
  const blockedKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      saveBlocked();
    } else if (event.key === "Escape") {
      setBlocking(false);
    }
  };
  const rowKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      beginEditing();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteTask(task.id);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setMenuPosition(clampedMenuPosition(rect.right - MENU_WIDTH, rect.top + 8));
    }
  };
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

  const menu = menuPosition && createPortal(
    <div
      ref={menuRef}
      className="task-context-menu"
      role="menu"
      aria-label={`“${task.text}”事项操作`}
      style={menuPosition}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={menuKeyDown}
    >
      <button
        type="button"
        role="menuitem"
        autoFocus={task.status !== "doing"}
        disabled={task.status === "doing"}
        onClick={() => updateStatus("doing")}
      >
        <Play size={14} fill="currentColor" />
        标记为正在做
      </button>
      <button
        type="button"
        role="menuitem"
        autoFocus={task.status === "doing"}
        disabled={task.status === "todo"}
        onClick={() => updateStatus("todo")}
      >
        <Circle size={14} />
        标记为待办
      </button>
      <button type="button" role="menuitem" onClick={beginBlocking}>
        <AlertTriangle size={14} />
        {task.status === "blocked" ? "修改受阻原因" : "标记为受阻"}
      </button>
      <button type="button" role="menuitem" disabled={task.status === "done"} onClick={() => updateStatus("done")}>
        <CheckCircle2 size={14} />
        标记为已完成
      </button>
      <div className="menu-separator" role="separator" />
      {!isSubtask && (
        <button type="button" role="menuitem" onClick={beginAddingSubtask}>
          <ListPlus size={14} />
          添加子事项
        </button>
      )}
      <button type="button" role="menuitem" onClick={beginEditing}>
        <Pencil size={14} />
        编辑事项
      </button>
      <button type="button" role="menuitem" className="danger-text" onClick={remove}>
        <Trash2 size={14} />
        删除事项
      </button>
    </div>,
    document.body,
  );

  return (
    <>
      <li
        ref={setNodeRef}
        style={style}
        className={`task-item status-${task.status}${isSubtask ? " subtask-item" : ""}${isDragging ? " dragging" : ""}`}
        tabIndex={0}
        aria-label={`${isSubtask ? "子事项" : "事项"}：${task.text}，${taskStatusText(task.status)}`}
        onKeyDown={rowKeyDown}
        onContextMenu={openContextMenu}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="icon-button drag-handle"
          aria-label={`拖动调整${isSubtask ? "子事项" : "事项"}顺序`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>
        <button
          type="button"
          className="check-button"
          aria-label={task.status === "done" ? "取消完成事项" : "完成事项"}
          aria-pressed={task.status === "done"}
          onClick={() => toggleTask(task.id)}
        >
          {task.status === "done" && <Check size={13} strokeWidth={3} />}
        </button>
        <div className="task-content">
          {editing ? (
            <textarea
              className="task-editor"
              aria-label="编辑事项"
              autoFocus
              rows={Math.min(4, Math.max(1, draft.split("\n").length))}
              maxLength={4000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={editKeyDown}
              onBlur={save}
            />
          ) : (
            <>
              <div className="task-mainline">
                {task.status === "doing" && <span className="task-status-badge doing">正在做</span>}
                {task.status === "blocked" && <span className="task-status-badge blocked">受阻</span>}
                {syncEnabled && task.syncState !== "synced" && (
                  <span
                    className={`task-sync-state ${task.syncState}`}
                    title={task.syncState === "error" ? "同步失败，将自动重试" : "等待同步"}
                    aria-label={task.syncState === "error" ? "同步失败" : "等待同步"}
                  >
                    {task.syncState === "error" ? <AlertTriangle size={10} /> : <CloudUpload size={10} />}
                  </span>
                )}
                <span className="task-text" onDoubleClick={beginEditing} title={task.text}>
                  {task.text}
                </span>
              </div>
              {task.status === "blocked" && task.blockedReason && (
                <span className="blocked-reason" title={task.blockedReason}>卡点：{task.blockedReason}</span>
              )}
              {subtaskProgress && subtaskProgress.total > 0 && (
                <span className="subtask-progress">
                  {subtaskProgress.done}/{subtaskProgress.total} 子事项已完成
                  {subtaskProgress.blocked > 0 && ` · ${subtaskProgress.blocked} 项受阻`}
                </span>
              )}
              {addingSubtask && (
                <div className="task-detail-editor">
                  <input
                    aria-label="新子事项"
                    autoFocus
                    maxLength={4000}
                    placeholder="写下下一步或具体卡点"
                    value={subtaskDraft}
                    onChange={(event) => setSubtaskDraft(event.target.value)}
                    onKeyDown={subtaskKeyDown}
                  />
                  <button type="button" aria-label="添加子事项" onClick={saveSubtask}><Plus size={13} /></button>
                  <button type="button" aria-label="取消添加子事项" onClick={() => setAddingSubtask(false)}><X size={13} /></button>
                </div>
              )}
              {blocking && (
                <div className="task-detail-editor blocked-editor">
                  <input
                    aria-label="受阻原因"
                    autoFocus
                    maxLength={1000}
                    placeholder="说明在等待什么、卡在哪里"
                    value={blockDraft}
                    onChange={(event) => setBlockDraft(event.target.value)}
                    onKeyDown={blockedKeyDown}
                  />
                  <button type="button" aria-label="保存受阻原因" onClick={saveBlocked}><Check size={13} /></button>
                  <button type="button" aria-label="取消编辑受阻原因" onClick={() => setBlocking(false)}><X size={13} /></button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="task-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="更多事项操作"
            aria-haspopup="menu"
            aria-expanded={Boolean(menuPosition)}
            onClick={openMoreMenu}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </li>
      {menu}
    </>
  );
});

export function TaskDragPreview({ task }: TaskItemProps) {
  return (
    <div className={`task-item drag-preview status-${task.status}${task.parentId ? " subtask-item" : ""}`}>
      <GripVertical size={15} />
      <span className="check-button">{task.status === "done" && <Check size={13} />}</span>
      <div className="task-content">
        <div className="task-mainline">
          {task.status === "doing" && <span className="task-status-badge doing">正在做</span>}
          {task.status === "blocked" && <span className="task-status-badge blocked">受阻</span>}
          <span className="task-text">{task.text}</span>
        </div>
      </div>
    </div>
  );
}
