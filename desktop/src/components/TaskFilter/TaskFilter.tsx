import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TaskFilterMode } from "../../utils/taskFilter";

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
  onModeChange: (mode: TaskFilterMode) => void;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}

export function TaskFilter({
  focusSignal,
  mode,
  query,
  resultCount,
  onModeChange,
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
    </section>
  );
}
