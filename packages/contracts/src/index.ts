import { z } from "zod";

export const SYNC_API_VERSION = 2 as const;
export const MINIMUM_DESKTOP_VERSION = "0.3.0" as const;

export const taskStatusSchema = z.enum(["todo", "doing", "blocked", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskPrioritySchema = z.enum(["none", "low", "medium", "high"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const syncTaskSchema = z.object({
  id: z.string().trim().min(1).max(128),
  text: z.string().trim().min(1).max(4_000),
  status: taskStatusSchema,
  priority: taskPrioritySchema.default("none"),
  order: z.number().int().min(0),
  parentId: z.string().trim().min(1).max(128).optional(),
  blockedReason: z.string().trim().min(1).max(1_000).optional(),
  dueDate: calendarDateSchema.optional(),
  dueTime: localTimeSchema.optional(),
  reminderAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  remoteRecordId: z.string().trim().min(1).optional(),
  remoteUpdatedAt: isoDateTimeSchema.optional(),
}).superRefine((task, context) => {
  if (task.dueTime && !task.dueDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dueTime"], message: "dueTime requires dueDate" });
  }
  if (task.status === "blocked" && !task.blockedReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["blockedReason"], message: "blocked tasks require a reason" });
  }
});
export type SyncTask = z.infer<typeof syncTaskSchema>;

const operationBase = z.object({
  operationId: z.string().trim().min(1).max(128),
});

const createTaskInputSchema = z.object({
  id: z.string().trim().min(1).max(128),
  text: z.string().trim().min(1).max(4_000),
  status: taskStatusSchema,
  priority: taskPrioritySchema.default("none"),
  order: z.number().int().min(0),
  parentId: z.string().trim().min(1).max(128).optional(),
  blockedReason: z.string().trim().min(1).max(1_000).optional(),
  dueDate: calendarDateSchema.optional(),
  dueTime: localTimeSchema.optional(),
  reminderAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema.optional(),
  updatedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
}).superRefine((task, context) => {
  if (task.dueTime && !task.dueDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dueTime"], message: "dueTime requires dueDate" });
  }
  if (task.status === "blocked" && !task.blockedReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["blockedReason"], message: "blocked tasks require a reason" });
  }
});

export const taskPatchSchema = z.object({
  text: z.string().trim().min(1).max(4_000).optional(),
  status: taskStatusSchema.optional(),
  blockedReason: z.string().trim().min(1).max(1_000).nullable().optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: calendarDateSchema.nullable().optional(),
  dueTime: localTimeSchema.nullable().optional(),
  reminderAt: isoDateTimeSchema.nullable().optional(),
}).refine((changes) => Object.keys(changes).length > 0, "patch changes cannot be empty");
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;

export const syncMutationSchema = z.discriminatedUnion("type", [
  operationBase.extend({ type: z.literal("create"), task: createTaskInputSchema }),
  operationBase.extend({
    type: z.literal("patch"),
    taskId: z.string().trim().min(1).max(128),
    changes: taskPatchSchema,
  }),
  operationBase.extend({
    type: z.literal("reorder"),
    items: z.array(z.object({
      taskId: z.string().trim().min(1).max(128),
      order: z.number().int().min(0),
    })).min(1).max(500),
  }),
  operationBase.extend({ type: z.literal("archive"), taskId: z.string().trim().min(1).max(128) }),
  operationBase.extend({ type: z.literal("restore"), taskId: z.string().trim().min(1).max(128) }),
]);
export type SyncMutation = z.infer<typeof syncMutationSchema>;

export const mutationRequestSchema = z.object({
  baseVersion: z.string().trim().min(1).optional(),
  operations: z.array(syncMutationSchema).min(1).max(500),
});
export type MutationRequest = z.infer<typeof mutationRequestSchema>;

export const syncWarningSchema = z.object({
  code: z.enum(["multiple_doing", "orphan_subtask"]),
  message: z.string(),
  taskIds: z.array(z.string()),
});
export type SyncWarning = z.infer<typeof syncWarningSchema>;

export const taskSnapshotSchema = z.object({
  version: z.string(),
  tasks: z.array(syncTaskSchema),
  warnings: z.array(syncWarningSchema),
});
export type TaskSnapshot = z.infer<typeof taskSnapshotSchema>;

export const readinessSchema = z.object({
  status: z.literal("ok"),
  syncConfigured: z.boolean(),
  gatewayVersion: z.string(),
  syncApiVersion: z.literal(SYNC_API_VERSION),
});
export type Readiness = z.infer<typeof readinessSchema>;
