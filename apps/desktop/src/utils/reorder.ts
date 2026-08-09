import type { Task } from "../types/task";

export function normalizeTaskOrder(tasks: Task[]): Task[] {
  const roots = tasks.filter((task) => !task.parentId).sort((left, right) => left.order - right.order);
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const siblings = childrenByParent.get(task.parentId) ?? [];
    siblings.push(task);
    childrenByParent.set(task.parentId, siblings);
  }

  const normalized: Task[] = [];
  roots.forEach((root, rootOrder) => {
    normalized.push(root.order === rootOrder ? root : { ...root, order: rootOrder });
    const children = (childrenByParent.get(root.id) ?? []).sort((left, right) => left.order - right.order);
    children.forEach((child, childOrder) => {
      normalized.push(child.order === childOrder ? child : { ...child, order: childOrder });
    });
  });
  return normalized;
}

export function reorderTasks(tasks: Task[], activeId: string, overId: string): Task[] {
  const ordered = normalizeTaskOrder(tasks);
  const active = ordered.find((task) => task.id === activeId);
  const over = ordered.find((task) => task.id === overId);
  if (!active || !over || active.parentId !== over.parentId) return ordered;
  const siblings = ordered
    .filter((task) => task.parentId === active.parentId)
    .sort((left, right) => left.order - right.order);
  const from = siblings.findIndex((task) => task.id === activeId);
  const to = siblings.findIndex((task) => task.id === overId);
  if (from < 0 || to < 0 || from === to) return ordered;

  const [moving] = siblings.splice(from, 1);
  siblings.splice(to, 0, moving);
  const timestamp = new Date().toISOString();
  const nextOrder = new Map(siblings.map((task, order) => [task.id, order]));
  return normalizeTaskOrder(ordered.map((task) => {
    const order = nextOrder.get(task.id);
    if (order === undefined) return task;
    return task.id === activeId ? { ...task, order, updatedAt: timestamp } : { ...task, order };
  }));
}
