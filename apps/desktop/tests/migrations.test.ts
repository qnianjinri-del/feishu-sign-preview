import { describe, expect, it } from "vitest";
import { migratePersistedState } from "../src/utils/migrations";

describe("migratePersistedState", () => {
  it("creates demo data for empty or damaged input", () => {
    expect(migratePersistedState(undefined).tasks).toHaveLength(3);
    expect(migratePersistedState("{broken").settings.listTitle).toBe("工作清单");
    expect(migratePersistedState(undefined).settings.onboardingCompleted).toBe(false);
  });

  it("migrates the old unversioned shape", () => {
    const state = migratePersistedState({
      tasks: [{ text: "旧任务", completed: true }],
      settings: { listTitle: "旧清单", opacity: 0.5 },
    });
    expect(state.schemaVersion).toBe(5);
    expect(state.tasks[0]).toMatchObject({ text: "旧任务", status: "done", priority: "none", order: 0, syncState: "pending" });
    expect(state.settings).toMatchObject({ listTitle: "旧清单", opacity: 0.5 });
    expect(state.settings.onboardingCompleted).toBe(true);
    expect(state.settings.quickAddShortcut).toBe("Command+Shift+N");
  });

  it("repairs invalid fields and removes invalid tasks", () => {
    const state = migratePersistedState({
      tasks: [{ id: "a", text: "有效", order: 9 }, { id: "b", text: "  " }, { nope: true }],
      settings: { opacity: 10, theme: "blue", showCompleted: "yes" },
    });
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].order).toBe(0);
    expect(state.settings.opacity).toBe(0.95);
    expect(state.settings.theme).toBe("system");
    expect(state.settings.showCompleted).toBe(true);
  });

  it("migrates v4 schedule fields and removes damaged or late values", () => {
    const state = migratePersistedState({
      schemaVersion: 4,
      tasks: [
        {
          id: "valid",
          text: "有效日期",
          priority: "high",
          dueDate: "2026-08-10",
          dueTime: "18:00",
          reminderAt: "2026-08-10T09:00:00.000Z",
        },
        {
          id: "damaged",
          text: "损坏日期",
          priority: "urgent",
          dueDate: "2026-02-31",
          dueTime: "29:99",
          reminderAt: "not-a-date",
        },
        {
          id: "late",
          text: "过晚提醒",
          dueDate: "2026-08-10",
          dueTime: "09:00",
          reminderAt: "2026-08-10T10:00:00.000Z",
        },
      ],
      settings: {},
    });
    expect(state.schemaVersion).toBe(5);
    expect(state.tasks[0]).toMatchObject({ priority: "high", dueDate: "2026-08-10", dueTime: "18:00" });
    expect(state.tasks[1]).toMatchObject({ priority: "none" });
    expect(state.tasks[1]?.dueDate).toBeUndefined();
    expect(state.tasks[2]?.reminderAt).toBeUndefined();
    expect(state.settings.remindersEnabled).toBe(true);
  });

  it("normalizes parseable legacy timestamps to protocol-safe ISO values", () => {
    const state = migratePersistedState({
      schemaVersion: 4,
      tasks: [{
        id: "timestamp",
        text: "旧时区时间",
        dueDate: "2026-08-10",
        dueTime: "18:00",
        createdAt: "2026-08-10T08:00:00+08:00",
        reminderAt: "2026-08-10T09:00:00+08:00",
        remoteUpdatedAt: "2026-08-10T10:00:00+08:00",
      }],
      settings: {},
      sync: { lastSuccessfulSyncAt: "2026-08-10T11:00:00+08:00", outbox: [] },
    });
    expect(state.tasks[0]).toMatchObject({
      createdAt: "2026-08-10T00:00:00.000Z",
      reminderAt: "2026-08-10T01:00:00.000Z",
      remoteUpdatedAt: "2026-08-10T02:00:00.000Z",
    });
    expect(state.sync.lastSuccessfulSyncAt).toBe("2026-08-10T03:00:00.000Z");
  });

  it("preserves a deliberately empty valid task array", () => {
    expect(migratePersistedState({ schemaVersion: 1, tasks: [], settings: {} }).tasks).toEqual([]);
  });

  it("preserves status fields and repairs multiple doing tasks", () => {
    const state = migratePersistedState({
      schemaVersion: 4,
      tasks: [
        { id: "a", text: "第一项", status: "doing", syncState: "synced" },
        { id: "b", text: "第二项", status: "doing", syncState: "error" },
      ],
      settings: {},
    });
    expect(state.tasks.map((task) => task.status)).toEqual(["doing", "todo"]);
    expect(state.tasks.map((task) => task.syncState)).toEqual(["synced", "error"]);
  });

  it("keeps one doing child per parent independently of the single doing root", () => {
    const state = migratePersistedState({
      schemaVersion: 4,
      tasks: [
        { id: "root", text: "主事项", status: "doing", priority: "none", order: 0 },
        { id: "child-a", parentId: "root", text: "第一步", status: "doing", priority: "none", order: 0 },
        { id: "child-b", parentId: "root", text: "第二步", status: "doing", priority: "none", order: 1 },
      ],
      settings: {},
    });
    expect(state.tasks.map((task) => task.status)).toEqual(["doing", "doing", "todo"]);
  });

  it("repairs invalid nesting and preserves blocked reasons", () => {
    const state = migratePersistedState({
      schemaVersion: 4,
      tasks: [
        { id: "root", text: "主事项", status: "todo", priority: "none", order: 0 },
        { id: "child", parentId: "root", text: "子事项", status: "blocked", priority: "none", blockedReason: "等待接口", order: 0 },
        { id: "deep", parentId: "child", text: "孙事项", status: "todo", priority: "none", order: 0 },
        { id: "orphan", parentId: "missing", text: "孤立事项", status: "todo", priority: "none", order: 1 },
      ],
      settings: {},
    });
    expect(state.tasks.find((task) => task.id === "child")).toMatchObject({
      parentId: "root",
      status: "blocked",
      blockedReason: "等待接口",
    });
    expect(state.tasks.find((task) => task.id === "deep")?.parentId).toBeUndefined();
    expect(state.tasks.find((task) => task.id === "orphan")?.parentId).toBeUndefined();
  });

  it("migrates sync settings and converts a valid v1 outbox to v2", () => {
    const state = migratePersistedState({
      schemaVersion: 4,
      tasks: [],
      settings: {
        syncEnabled: true,
        syncServiceUrl: "https://sync.example.com/",
        syncPollIntervalSeconds: 2,
      },
      sync: {
        lastServerVersion: "server-version",
        outbox: [{ operationId: "op-one", type: "set_done", taskId: "task-one" }],
      },
    });
    expect(state.settings).toMatchObject({
      syncEnabled: true,
      syncServiceUrl: "https://sync.example.com/",
      syncPollIntervalSeconds: 5,
    });
    expect(state.sync).toEqual({
      lastServerVersion: "server-version",
      outbox: [{ operationId: "op-one", type: "patch", taskId: "task-one", changes: { status: "done" } }],
    });
  });
});
