import { describe, expect, it } from "vitest";
import { migratePersistedState } from "../src/utils/migrations";

describe("migratePersistedState", () => {
  it("creates demo data for empty or damaged input", () => {
    expect(migratePersistedState(undefined).tasks).toHaveLength(3);
    expect(migratePersistedState("{broken").settings.listTitle).toBe("工作清单");
  });

  it("migrates the old unversioned shape", () => {
    const state = migratePersistedState({
      tasks: [{ text: "旧任务", completed: true }],
      settings: { listTitle: "旧清单", opacity: 0.5 },
    });
    expect(state.schemaVersion).toBe(3);
    expect(state.tasks[0]).toMatchObject({ text: "旧任务", status: "done", order: 0, syncState: "pending" });
    expect(state.settings).toMatchObject({ listTitle: "旧清单", opacity: 0.5 });
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

  it("preserves a deliberately empty valid task array", () => {
    expect(migratePersistedState({ schemaVersion: 1, tasks: [], settings: {} }).tasks).toEqual([]);
  });

  it("preserves status fields and repairs multiple doing tasks", () => {
    const state = migratePersistedState({
      schemaVersion: 3,
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
      schemaVersion: 3,
      tasks: [
        { id: "root", text: "主事项", status: "doing", order: 0 },
        { id: "child-a", parentId: "root", text: "第一步", status: "doing", order: 0 },
        { id: "child-b", parentId: "root", text: "第二步", status: "doing", order: 1 },
      ],
      settings: {},
    });
    expect(state.tasks.map((task) => task.status)).toEqual(["doing", "doing", "todo"]);
  });

  it("repairs invalid nesting and preserves blocked reasons", () => {
    const state = migratePersistedState({
      schemaVersion: 3,
      tasks: [
        { id: "root", text: "主事项", status: "todo", order: 0 },
        { id: "child", parentId: "root", text: "子事项", status: "blocked", blockedReason: "等待接口", order: 0 },
        { id: "deep", parentId: "child", text: "孙事项", status: "todo", order: 0 },
        { id: "orphan", parentId: "missing", text: "孤立事项", status: "todo", order: 1 },
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

  it("migrates sync settings and preserves a valid outbox", () => {
    const state = migratePersistedState({
      schemaVersion: 3,
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
      outbox: [{ operationId: "op-one", type: "set_done", taskId: "task-one" }],
    });
  });
});
