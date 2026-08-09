import { useMemo, useState, type CSSProperties } from "react";
import { useTodayStart } from "../../hooks/useTodayStart";
import { useTaskStore } from "../../stores/taskStore";
import { isExpiredCompletedRoot } from "../../utils/taskVisibility";
import { filterTaskGroups, visibleTaskCount, type TaskFilterMode } from "../../utils/taskFilter";
import type { TaskDateFilter, TaskPriorityFilter } from "../../utils/taskSchedule";
import { AddTask } from "../AddTask/AddTask";
import { Header } from "../Header/Header";
import { Settings } from "../Settings/Settings";
import { TaskList } from "../TaskList/TaskList";
import { TaskFilter } from "../TaskFilter/TaskFilter";
import { Toolbar } from "../Toolbar/Toolbar";
import { UndoToast } from "../UndoToast/UndoToast";

interface FloatingPanelProps {
  focusSignal: number;
  searchSignal: number;
  filterOpen: boolean;
  settingsOpen: boolean;
  onRequestAdd: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onRunOnboarding: () => void;
  onFilterOpenChange: (open: boolean) => void;
}

export function FloatingPanel({ focusSignal, searchSignal, filterOpen, settingsOpen, onRequestAdd, onOpenSettings, onCloseSettings, onRunOnboarding, onFilterOpenChange }: FloatingPanelProps) {
  const tasks = useTaskStore((state) => state.tasks);
  const settings = useTaskStore((state) => state.settings);
  const todayStart = useTodayStart();
  const [filterMode, setFilterMode] = useState<TaskFilterMode>("current");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<TaskDateFilter>("any");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriorityFilter>("any");
  const rootTasks = tasks.filter((task) => !task.parentId && !isExpiredCompletedRoot(task, todayStart));
  const completed = rootTasks.reduce((count, task) => count + Number(task.status === "done"), 0);
  const style = { "--panel-alpha": settings.opacity } as CSSProperties;
  const resultCount = useMemo(() => visibleTaskCount(filterTaskGroups(tasks, {
    mode: filterMode,
    query,
    showCompleted: settings.showCompleted,
    todayStart,
    dateFilter,
    priorityFilter,
  })), [dateFilter, filterMode, priorityFilter, query, settings.showCompleted, tasks, todayStart]);

  const resetFilters = () => {
    setQuery("");
    setFilterMode("current");
    setDateFilter("any");
    setPriorityFilter("any");
  };

  return (
    <main
      className={`floating-panel${settings.compactMode ? " compact-mode" : ""}${settings.opacity < 0.5 ? " high-contrast" : ""}`}
      style={style}
    >
      <Toolbar
        onOpenSettings={onOpenSettings}
        filterOpen={filterOpen}
        onToggleFilter={() => {
          if (filterOpen) {
            resetFilters();
          }
          onFilterOpenChange(!filterOpen);
        }}
      />
      <Header completed={completed} total={rootTasks.length} />
      <div className="list-area">
        {filterOpen && (
          <TaskFilter
            focusSignal={searchSignal}
            mode={filterMode}
            query={query}
            resultCount={resultCount}
            dateFilter={dateFilter}
            priorityFilter={priorityFilter}
            onModeChange={setFilterMode}
            onDateFilterChange={setDateFilter}
            onPriorityFilterChange={setPriorityFilter}
            onQueryChange={setQuery}
            onClose={() => {
              resetFilters();
              onFilterOpenChange(false);
            }}
          />
        )}
        <section className="list-scroll">
          <TaskList
            onAdd={onRequestAdd}
            filterMode={filterMode}
            query={query}
            dateFilter={dateFilter}
            priorityFilter={priorityFilter}
          />
        </section>
      </div>
      <AddTask key={focusSignal} focusSignal={focusSignal} />
      <UndoToast />
      {settingsOpen && <Settings onClose={onCloseSettings} onRunOnboarding={onRunOnboarding} />}
      {settings.clickThrough && <div className="click-through-badge">点击穿透已开启 · ⌘⇧L 退出</div>}
    </main>
  );
}
