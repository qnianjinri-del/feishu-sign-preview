import { describe, expect, it } from "vitest";
import type { Task } from "../src/types/task";
import { normalizeTaskOrder, reorderTasks } from "../src/utils/reorder";

const now = "2026-01-01T00:00:00.000Z";
const task = (id: string, order: number): Task => ({
  id,
  order,
  text: id,
  status: "todo",
  createdAt: now,
  updatedAt: now,
  syncState: "pending",
});

describe("reorderTasks", () => {
  it("moves an item and normalizes every order", () => {
    const result = reorderTasks([task("a", 0), task("b", 1), task("c", 2)], "a", "c");
    expect(result.map(({ id, order }) => [id, order])).toEqual([["b", 0], ["c", 1], ["a", 2]]);
  });

  it("repairs duplicate and sparse order values", () => {
    expect(normalizeTaskOrder([task("c", 8), task("a", 1), task("b", 1)]).map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it("reorders child items only within the same parent", () => {
    const root = task("root", 0);
    const other = task("other", 1);
    const first = { ...task("first", 0), parentId: root.id };
    const second = { ...task("second", 1), parentId: root.id };
    const moved = reorderTasks([root, first, second, other], first.id, second.id);
    expect(moved.filter((item) => item.parentId === root.id).map(({ id, order }) => [id, order])).toEqual([
      ["second", 0],
      ["first", 1],
    ]);
    expect(reorderTasks(moved, first.id, other.id)).toEqual(moved);
  });
});
