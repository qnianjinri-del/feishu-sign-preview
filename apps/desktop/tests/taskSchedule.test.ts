import { describe, expect, it } from "vitest";
import type { Task } from "../src/types/task";
import { filterTaskGroups } from "../src/utils/taskFilter";
import {
  formatTaskDue,
  isoToLocalInput,
  isTaskOverdue,
  localInputToIso,
  matchesTaskDateFilter,
  parseLocalCalendarDate,
  reminderForPreset,
  taskPriorityMatches,
  validateReminder,
} from "../src/utils/taskSchedule";

const base: Task = {
  id: "task",
  text: "任务",
  status: "todo",
  priority: "none",
  order: 0,
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
  syncState: "synced",
};

describe("task schedule", () => {
  const noon = new Date(2026, 7, 10, 12, 0);

  it("treats date-only tasks as overdue only after the local day ends", () => {
    const task = { ...base, dueDate: "2026-08-10" };
    expect(isTaskOverdue(task, noon)).toBe(false);
    expect(isTaskOverdue(task, new Date(2026, 7, 11, 0, 0))).toBe(true);
  });

  it("uses minute precision when a due time exists", () => {
    const task = { ...base, dueDate: "2026-08-10", dueTime: "11:59" };
    expect(isTaskOverdue(task, noon)).toBe(true);
    expect(formatTaskDue(task, noon)).toBe("今天 11:59");
  });

  it("includes unfinished overdue tasks in today and limits upcoming to seven days", () => {
    expect(matchesTaskDateFilter({ ...base, dueDate: "2026-08-09" }, "today", noon)).toBe(true);
    expect(matchesTaskDateFilter({ ...base, dueDate: "2026-08-16" }, "upcoming", noon)).toBe(true);
    expect(matchesTaskDateFilter({ ...base, dueDate: "2026-08-17" }, "upcoming", noon)).toBe(false);
    expect(matchesTaskDateFilter({ ...base, status: "done", dueDate: "2026-08-09" }, "today", noon)).toBe(false);
  });

  it("keeps the parent context when a dated high-priority child matches", () => {
    const parent = { ...base, id: "parent", text: "父事项" };
    const child = { ...base, id: "child", parentId: "parent", text: "子事项", priority: "high" as const, dueDate: "2026-08-10" };
    const groups = filterTaskGroups([parent, child], {
      mode: "current",
      query: "",
      showCompleted: true,
      todayStart: new Date(2026, 7, 10).getTime(),
      dateFilter: "today",
      priorityFilter: "high",
      now: noon,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.root.id).toBe("parent");
    expect(groups[0]?.children.map((task) => task.id)).toEqual(["child"]);
  });

  it("builds presets and rejects reminders after the deadline", () => {
    expect(reminderForPreset("10m", "2026-08-10", "12:00")).toBe(new Date(2026, 7, 10, 11, 50).toISOString());
    expect(validateReminder(new Date(2026, 7, 10, 12, 1).toISOString(), { dueDate: "2026-08-10", dueTime: "12:00" }))
      .toBe("提醒不能晚于截止时间");
    expect(validateReminder(new Date(2026, 7, 11, 9, 0).toISOString(), {})).toBeUndefined();
  });

  it("handles invalid local input and the remaining display and preset branches", () => {
    expect(parseLocalCalendarDate("2026-02-31", "09:00")).toBeUndefined();
    expect(parseLocalCalendarDate("bad", "09:00")).toBeUndefined();
    expect(localInputToIso("bad")).toBeUndefined();
    expect(isoToLocalInput("bad")).toBe("");
    expect(formatTaskDue({ dueDate: "2026-08-11" }, noon)).toBe("明天");
    expect(formatTaskDue({ dueDate: "2026-08-15" }, noon)).toBe("8/15");
    expect(reminderForPreset("day-0900", "2026-08-10")).toBe(new Date(2026, 7, 10, 9).toISOString());
    expect(reminderForPreset("previous-0900", "2026-08-10")).toBe(new Date(2026, 7, 9, 9).toISOString());
    expect(taskPriorityMatches({ ...base, priority: "low" }, "low")).toBe(true);
    expect(taskPriorityMatches(base, "high")).toBe(false);
  });
});
