import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TaskFilterMode } from "../../utils/taskFilter";
import type { TaskDateFilter, TaskPriorityFilter } from "../../utils/taskSchedule";

const MODES: Array<{ value: TaskFilterMode; label: string }> = [
  { value: "current", label: "当前" },
  { value: "todo", label: "待办" },
  { value: "doing", label: "正在做" },
  { value: "blocked", label: "受阻" },
  { value: "done", label: "已完成" },
  { value: "all", label: "全部历史" },
];

interface TaskFilterProps {
  focusSignal: number;
  mode: TaskFilterMode;
  query: string;
  resultCount: number;
  dateFilter?: TaskDateFilter;
  priorityFilter?: TaskPriorityFilter;
  onModeChange: (mode: TaskFilterMode) => void;
  onDateFilterChange?: (filter: TaskDateFilter) => void;
  onPriorityFilterChange?: (filter: TaskPriorityFilter) => void;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}

export function TaskFilter({
  focusSignal,
  mode,
  query,
  resultCount,
  dateFilter = "any",
  priorityFilter = "any",
  onModeChange,
  onDateFilterChange = () => undefined,
  onPriorityFilterChange = () => undefined,
  onQueryChange,
  onClose,
}: TaskFilterProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusSignal]);

  return (
    <section className="task-filter" aria-label="搜索和筛选任务">
      <div className="task-search-row">
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          aria-label="搜索任务"
          placeholder="搜索任务或卡点"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            if (query) onQueryChange("");
            else onClose();
          }}
        />
        <span className="filter-result-count">{resultCount} 项</span>
        <button type="button" className="icon-button" aria-label="关闭搜索筛选" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="filter-chips" role="group" aria-label="任务筛选方式">
        {MODES.map((item) => (
          <button
            type="button"
            key={item.value}
            className={mode === item.value ? "active" : ""}
            aria-pressed={mode === item.value}
            onClick={() => onModeChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="filter-selects">
        <label>
          <span>日期</span>
          <select aria-label="按日期筛选" value={dateFilter} onChange={(event) => onDateFilterChange(event.target.value as TaskDateFilter)}>
            <option value="any">不限</option>
            <option value="today">今天</option>
            <option value="upcoming">未来 7 天</option>
            <option value="overdue">已逾期</option>
          </select>
        </label>
        <label>
          <span>优先级</span>
          <select aria-label="按优先级筛选" value={priorityFilter} onChange={(event) => onPriorityFilterChange(event.target.value as TaskPriorityFilter)}>
            <option value="any">不限</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </label>
      </div>
    </section>
  );
}
