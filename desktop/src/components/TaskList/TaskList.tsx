import { Fragment, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTodayStart } from "../../hooks/useTodayStart";
import { useTaskStore } from "../../stores/taskStore";
import { isExpiredCompletedRoot } from "../../utils/taskVisibility";
import { EmptyState } from "../EmptyState/EmptyState";
import { TaskDragPreview, TaskItem } from "../TaskItem/TaskItem";

interface TaskListProps {
  onAdd: () => void;
}

export function TaskList({ onAdd }: TaskListProps) {
  const tasks = useTaskStore((state) => state.tasks);
  const showCompleted = useTaskStore((state) => state.settings.showCompleted);
  const reorderTasks = useTaskStore((state) => state.reorderTasks);
  const todayStart = useTodayStart();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const groups = useMemo(() => {
    const roots = tasks
      .filter((task) => !task.parentId && !isExpiredCompletedRoot(task, todayStart))
      .sort((left, right) => left.order - right.order);
    return roots
      .filter((root) => showCompleted || root.status !== "done")
      .map((root) => {
        const allChildren = tasks
          .filter((task) => task.parentId === root.id)
          .sort((left, right) => left.order - right.order);
        return {
          root,
          children: allChildren.filter((child) => showCompleted || child.status !== "done"),
          progress: {
            total: allChildren.length,
            done: allChildren.filter((child) => child.status === "done").length,
            blocked: allChildren.filter((child) => child.status === "blocked").length,
          },
        };
      });
  }, [showCompleted, tasks, todayStart]);
  const activeTask = activeId ? tasks.find((task) => task.id === activeId) : undefined;

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (over && active.id !== over.id) reorderTasks(String(active.id), String(over.id));
  };

  if (!tasks.length) return <EmptyState onAdd={onAdd} />;
  if (!groups.length) {
    return (
      <div className="empty-state compact-empty">
        <strong>今天的任务已清空</strong>
        <span>历史完成事项仍保留在飞书多维表格</span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={groups.map(({ root }) => root.id)} strategy={verticalListSortingStrategy}>
        <ul className="task-list" aria-label="任务列表">
          {groups.map(({ root, children, progress }) => (
            <Fragment key={root.id}>
              <TaskItem task={root} subtaskProgress={progress} />
              <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
                {children.map((child) => <TaskItem key={child.id} task={child} isSubtask />)}
              </SortableContext>
            </Fragment>
          ))}
        </ul>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
        {activeTask ? <TaskDragPreview task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
