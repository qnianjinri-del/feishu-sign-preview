import { z } from "zod";

export const taskStatusSchema = z.enum(["todo", "doing", "blocked", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const syncTaskSchema = z.object({
  id: z.string().trim().min(1).max(128),
  text: z.string().trim().min(1).max(4_000),
  status: taskStatusSchema,
  order: z.number().int().min(0),
  parentId: z.string().trim().min(1).max(128).optional(),
  blockedReason: z.string().trim().min(1).max(1_000).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  remoteRecordId: z.string().trim().min(1).optional(),
  remoteUpdatedAt: z.string().datetime().optional(),
});

export type SyncTask = z.infer<typeof syncTaskSchema>;

const operationBase = z.object({
  operationId: z.string().trim().min(1).max(128),
});

const createTaskInputSchema = syncTaskSchema.pick({
  id: true,
  text: true,
  status: true,
  order: true,
  parentId: true,
  blockedReason: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const syncMutationSchema = z.discriminatedUnion("type", [
  operationBase.extend({ type: z.literal("create"), task: createTaskInputSchema.omit({ parentId: true }) }),
  operationBase.extend({ type: z.literal("create_subtask"), task: createTaskInputSchema.required({ parentId: true }) }),
  operationBase.extend({ type: z.literal("update_text"), taskId: z.string().min(1), text: z.string().trim().min(1).max(4_000) }),
  operationBase.extend({ type: z.literal("set_todo"), taskId: z.string().min(1) }),
  operationBase.extend({ type: z.literal("set_doing"), taskId: z.string().min(1) }),
  operationBase.extend({ type: z.literal("set_blocked"), taskId: z.string().min(1), reason: z.string().trim().min(1).max(1_000) }),
  operationBase.extend({ type: z.literal("set_done"), taskId: z.string().min(1) }),
  operationBase.extend({
    type: z.literal("reorder"),
    items: z.array(z.object({ taskId: z.string().min(1), order: z.number().int().min(0) })).min(1).max(500),
  }),
  operationBase.extend({ type: z.literal("archive"), taskId: z.string().min(1) }),
  operationBase.extend({ type: z.literal("restore"), taskId: z.string().min(1) }),
]);

export const mutationRequestSchema = z.object({
  baseVersion: z.string().trim().min(1).optional(),
  operations: z.array(syncMutationSchema).min(1).max(500),
});

export type SyncMutation = z.infer<typeof syncMutationSchema>;
export type MutationRequest = z.infer<typeof mutationRequestSchema>;

export interface SyncWarning {
  code: "multiple_doing" | "orphan_subtask";
  message: string;
  taskIds: string[];
}

export interface TaskSnapshot {
  version: string;
  tasks: SyncTask[];
  warnings: SyncWarning[];
}
