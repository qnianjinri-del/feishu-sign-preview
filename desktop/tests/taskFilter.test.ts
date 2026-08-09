import { describe, expect, it } from "vitest";
import type { Task } from "../src/types/task";
import { filterTaskGroups, visibleTaskCount } from "../src/utils/taskFilter";

const todayStart = Date.parse("2026-08-09T00:00:00+08:00");
const base = {
  order: 0,
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  syncState: "synced" as const,
};
const tasks: Task[] = [
  { ...base, id: "active", text: "发布新版", status: "doing" },
  { ...base, id: "blocked", text: "申请权限", status: "blocked", blockedReason: "等待管理员审批", order: 1 },
  { ...base, id: "history", text: "昨日完成", status: "done", completedAt: "2026-08-08T10:00:00+08:00", order: 2 },
  { ...base, id: "child-a", parentId: "active", text: "整理发布说明", status: "todo" },
  { ...base, id: "child-b", parentId: "active", text: "上传安装包", status: "done", completedAt: "2026-08-09T01:00:00+08:00", order: 1 },
];

function groups(mode: Parameters<typeof filterTaskGroups>[1]["mode"], query = "", showCompleted = true) {
  return filterTaskGroups(tasks, { mode, query, showCompleted, todayStart });
}

describe("filterTaskGroups", () => {
  it("keeps expired completions out of the current list but exposes them in history", () => {
    expect(groups("current").map(({ root }) => root.id)).toEqual(["active", "blocked"]);
    expect(groups("done").map(({ root }) => root.id)).toContain("history");
    expect(groups("all").map(({ root }) => root.id)).toContain("history");
  });

  it("shows a parent when only one child matches the query", () => {
    const result = groups("current", "发布说明");
    expect(result).toHaveLength(1);
    expect(result[0]?.root.id).toBe("active");
    expect(result[0]?.children.map((task) => task.id)).toEqual(["child-a"]);
  });

  it("searches blocked reasons and filters by status", () => {
    expect(groups("blocked", "管理员").map(({ root }) => root.id)).toEqual(["blocked"]);
    expect(groups("doing").map(({ root }) => root.id)).toEqual(["active"]);
  });

  it("returns contextual children for a matching root and counts visible rows", () => {
    const result = groups("current", "发布新版", false);
    expect(result[0]?.children.map((task) => task.id)).toEqual(["child-a"]);
    expect(visibleTaskCount(result)).toBe(2);
  });
});
