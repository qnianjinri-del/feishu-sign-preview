import { describe, expect, it } from "vitest";
import type { Task } from "../src/types/task";
import { isExpiredCompletedRoot, localDayStart } from "../src/utils/taskVisibility";

function task(patch: Partial<Task> = {}): Task {
  return {
    id: "task",
    text: "任务",
    status: "done",
    order: 0,
    createdAt: "2026-07-22T01:00:00.000Z",
    updatedAt: "2026-07-22T02:00:00.000Z",
    completedAt: "2026-07-22T02:00:00.000Z",
    syncState: "synced",
    ...patch,
  };
}

describe("task visibility", () => {
  const todayStart = localDayStart(new Date(2026, 6, 23, 12).getTime());

  it("expires a completed root after the local day changes", () => {
    expect(isExpiredCompletedRoot(task(), todayStart)).toBe(true);
  });

  it("keeps roots completed today and completed children visible", () => {
    expect(isExpiredCompletedRoot(task({
      completedAt: new Date(2026, 6, 23, 9).toISOString(),
    }), todayStart)).toBe(false);
    expect(isExpiredCompletedRoot(task({ parentId: "parent" }), todayStart)).toBe(false);
  });
});
