import { describe, expect, it } from "vitest";
import {
  mutationRequestSchema,
  readinessSchema,
  syncTaskSchema,
  taskPatchSchema,
} from "../src/index.js";

describe("FloatList v2 contracts", () => {
  it("accepts schedule and priority fields", () => {
    const task = syncTaskSchema.parse({
      id: "task-1",
      text: "Prepare release",
      status: "todo",
      priority: "high",
      order: 0,
      dueDate: "2026-08-12",
      dueTime: "18:30",
      reminderAt: "2026-08-12T09:00:00+08:00",
    });
    expect(task.priority).toBe("high");
  });

  it("defaults priority and rejects time without a date", () => {
    expect(syncTaskSchema.parse({ id: "task-1", text: "Task", status: "todo", order: 0 }).priority).toBe("none");
    expect(syncTaskSchema.safeParse({ id: "task-1", text: "Task", status: "todo", order: 0, dueTime: "10:00" }).success).toBe(false);
    expect(syncTaskSchema.safeParse({ id: "task-1", text: "Task", status: "blocked", order: 0 }).success).toBe(false);
    expect(syncTaskSchema.safeParse({ id: "task-1", text: "Task", status: "blocked", blockedReason: "waiting", order: 0 }).success).toBe(true);
  });

  it("requires non-empty patches", () => {
    expect(taskPatchSchema.safeParse({}).success).toBe(false);
    expect(taskPatchSchema.safeParse({ dueDate: null }).success).toBe(true);
  });

  it("parses v2 mutations and readiness", () => {
    expect(mutationRequestSchema.safeParse({
      operations: [{ operationId: "op-1", type: "patch", taskId: "task-1", changes: { priority: "medium" } }],
    }).success).toBe(true);
    expect(mutationRequestSchema.safeParse({
      operations: [{
        operationId: "op-create",
        type: "create",
        task: { id: "task-2", text: "Task", status: "todo", order: 0, dueTime: "10:00" },
      }],
    }).success).toBe(false);
    expect(mutationRequestSchema.safeParse({
      operations: [{
        operationId: "op-blocked",
        type: "create",
        task: { id: "task-2", text: "Task", status: "blocked", order: 0 },
      }],
    }).success).toBe(false);
    for (const operation of [
      { operationId: "reorder", type: "reorder", items: [{ taskId: "task-1", order: 0 }] },
      { operationId: "archive", type: "archive", taskId: "task-1" },
      { operationId: "restore", type: "restore", taskId: "task-1" },
    ]) {
      expect(mutationRequestSchema.safeParse({ operations: [operation] }).success).toBe(true);
    }
    expect(readinessSchema.parse({ status: "ok", syncConfigured: true, gatewayVersion: "2.0.0", syncApiVersion: 2 }).syncApiVersion).toBe(2);
  });
});
