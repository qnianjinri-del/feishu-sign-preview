import { AlertCircle, Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { useTaskStore } from "../../stores/taskStore";

interface HeaderProps {
  completed: number;
  total: number;
}

export function Header({ completed, total }: HeaderProps) {
  const title = useTaskStore((state) => state.settings.listTitle);
  const doingTask = useTaskStore((state) => state.tasks.find((task) => !task.parentId && task.status === "doing"));
  const blockedCount = useTaskStore((state) => state.tasks.filter((task) => task.status === "blocked").length);
  const syncEnabled = useTaskStore((state) => state.settings.syncEnabled);
  const syncStatus = useTaskStore((state) => state.syncRuntime.status);
  const pendingCount = useTaskStore((state) => state.sync.outbox.length);
  const setListTitle = useTaskStore((state) => state.setListTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const save = () => {
    setListTitle(draft);
    setEditing(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) save();
    if (event.key === "Escape") {
      setDraft(title);
      setEditing(false);
    }
  };

  return (
    <header className="list-header">
      <div className="header-copy">
        {editing ? (
          <input
            className="title-input"
            aria-label="清单标题"
            autoFocus
            maxLength={80}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={save}
          />
        ) : (
          <h1
            tabIndex={0}
            title="双击修改标题"
            onDoubleClick={() => {
              setDraft(title);
              setEditing(true);
            }}
          >
            {title}
          </h1>
        )}
        <div className={`current-task${doingTask ? " active" : blockedCount ? " warning" : ""}`} title={doingTask?.text}>
          {doingTask
            ? `正在做：${doingTask.text}`
            : blockedCount
              ? `当前空闲 · ${blockedCount} 项受阻`
              : "当前空闲"}
        </div>
      </div>
      <div className="header-meta">
        {syncEnabled && (
          <span
            className={`sync-indicator status-${syncStatus}`}
            aria-label={pendingCount ? `${pendingCount} 项修改待同步` : `同步状态：${syncStatus}`}
            title={pendingCount ? `${pendingCount} 项修改待同步` : `同步状态：${syncStatus}`}
          >
            {syncStatus === "syncing"
              ? <LoaderCircle size={12} />
              : syncStatus === "offline"
                ? <CloudOff size={12} />
                : syncStatus === "error" || syncStatus === "attention"
                  ? <AlertCircle size={12} />
                  : <Cloud size={12} />}
          </span>
        )}
        <span className="task-count" aria-label={`已完成 ${completed}，共 ${total} 条`}>
          {completed} / {total}
        </span>
      </div>
    </header>
  );
}
