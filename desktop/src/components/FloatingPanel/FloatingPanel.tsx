import type { CSSProperties } from "react";
import { useTodayStart } from "../../hooks/useTodayStart";
import { useTaskStore } from "../../stores/taskStore";
import { isExpiredCompletedRoot } from "../../utils/taskVisibility";
import { AddTask } from "../AddTask/AddTask";
import { Header } from "../Header/Header";
import { Settings } from "../Settings/Settings";
import { TaskList } from "../TaskList/TaskList";
import { Toolbar } from "../Toolbar/Toolbar";
import { UndoToast } from "../UndoToast/UndoToast";

interface FloatingPanelProps {
  focusSignal: number;
  settingsOpen: boolean;
  onRequestAdd: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
}

export function FloatingPanel({ focusSignal, settingsOpen, onRequestAdd, onOpenSettings, onCloseSettings }: FloatingPanelProps) {
  const tasks = useTaskStore((state) => state.tasks);
  const settings = useTaskStore((state) => state.settings);
  const todayStart = useTodayStart();
  const rootTasks = tasks.filter((task) => !task.parentId && !isExpiredCompletedRoot(task, todayStart));
  const completed = rootTasks.reduce((count, task) => count + Number(task.status === "done"), 0);
  const style = { "--panel-alpha": settings.opacity } as CSSProperties;

  return (
    <main
      className={`floating-panel${settings.compactMode ? " compact-mode" : ""}${settings.opacity < 0.5 ? " high-contrast" : ""}`}
      style={style}
    >
      <Toolbar onOpenSettings={onOpenSettings} />
      <Header completed={completed} total={rootTasks.length} />
      <section className="list-scroll">
        <TaskList onAdd={onRequestAdd} />
      </section>
      <AddTask key={focusSignal} focusSignal={focusSignal} />
      <UndoToast />
      {settingsOpen && <Settings onClose={onCloseSettings} />}
      {settings.clickThrough && <div className="click-through-badge">点击穿透已开启 · ⌘⇧L 退出</div>}
    </main>
  );
}
