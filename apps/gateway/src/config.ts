import dotenv from "dotenv";
import { resolve } from "node:path";
import { ZodError, z } from "zod";

import { normalizePublicBaseUrl, resolveHelpUrl } from "./lib/url.js";

// Workspace commands execute inside apps/gateway. Keep the historical root .env
// working while allowing an app-local file to override it for isolated deployments.
dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config({ path: resolve(process.cwd(), ".env"), override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),
  DEFAULT_JUMP_URL: z.string().optional(),
  DEFAULT_HELP_PATH: z.string().default("/"),
  FEISHU_APP_ID: z.string().optional(),
  FEISHU_APP_SECRET: z.string().optional(),
  FEISHU_VERIFICATION_TOKEN: z.string().optional(),
  FEISHU_ENCRYPT_KEY: z.string().optional(),
  BITABLE_APP_TOKEN: z.string().default(""),
  BITABLE_TABLE_ID: z.string().default(""),
  BITABLE_VIEW_ID: z.string().default(""),
  BITABLE_RESULT_FIELD_NAME: z.string().default("任务名"),
  BITABLE_STATUS_FIELD_NAME: z.string().default("任务状态"),
  BITABLE_SUBTASK_STATUS_FIELD_NAME: z.string().default("子状态"),
  BITABLE_CHILD_STATUS_FIELD_NAME: z.string().default("FloatList子事项状态"),
  BITABLE_SUBTASK_DATA_FIELD_NAME: z.string().default("FloatList子事项数据"),
  BITABLE_SYNC_ID_FIELD_NAME: z.string().default("FloatList同步ID"),
  BITABLE_ORDER_FIELD_NAME: z.string().default("FloatList顺序"),
  BITABLE_ARCHIVED_FIELD_NAME: z.string().default("FloatList归档"),
  BITABLE_PARENT_ID_FIELD_NAME: z.string().default("FloatList父事项ID"),
  BITABLE_BLOCKED_REASON_FIELD_NAME: z.string().default("FloatList受阻原因"),
  BITABLE_DUE_DATE_FIELD_NAME: z.string().default("日期"),
  BITABLE_DUE_TIME_FIELD_NAME: z.string().default("FloatList截止时刻"),
  BITABLE_PRIORITY_FIELD_NAME: z.string().default("优先级"),
  BITABLE_REMINDER_AT_FIELD_NAME: z.string().default("FloatList提醒时间"),
  FLOATLIST_TIME_ZONE: z.string().default("Asia/Shanghai").refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "must be a valid IANA time zone"),
  BITABLE_TARGET_STATUS: z.string().default("在干"),
  BITABLE_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  BITABLE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(1500),
  MAX_TEXT_LENGTH: z.coerce.number().int().min(1).max(500).default(80),
  HANDLER_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(1500),
  DEBUG_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(2000),
  FLOATLIST_CLIENT_TOKEN: z.string().default(""),
  FLOATLIST_SYNC_BODY_LIMIT: z.coerce.number().int().min(1024).max(1_048_576).default(131_072),
  FLOATLIST_IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
  FLOATLIST_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3_600).default(60),
  FLOATLIST_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(120),
  ENABLE_CARD_PREVIEW: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

function formatConfigError(error: unknown): Error {
  if (error instanceof ZodError) {
    const details = error.issues
      .map((issue) => `- ${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("\n");

    return new Error(`Invalid environment configuration:\n${details}`);
  }

  if (error instanceof Error) {
    return new Error(`Invalid environment configuration: ${error.message}`);
  }

  return new Error("Invalid environment configuration.");
}

function loadConfig() {
  try {
    const env = envSchema.parse(process.env);
    const publicBaseUrl = normalizePublicBaseUrl(env.PUBLIC_BASE_URL);
    const helpUrl = resolveHelpUrl(publicBaseUrl, env.DEFAULT_HELP_PATH);

    return {
      nodeEnv: env.NODE_ENV,
      host: env.HOST,
      port: env.PORT,
      publicBaseUrl,
      defaultHelpPath: env.DEFAULT_HELP_PATH,
      defaultJumpUrl: env.DEFAULT_JUMP_URL ?? helpUrl,
      helpUrl,
      feishuAppId: env.FEISHU_APP_ID ?? "",
      feishuAppSecret: env.FEISHU_APP_SECRET ?? "",
      feishuVerificationToken: env.FEISHU_VERIFICATION_TOKEN ?? "",
      feishuEncryptKey: env.FEISHU_ENCRYPT_KEY ?? "",
      bitableAppToken: env.BITABLE_APP_TOKEN,
      bitableTableId: env.BITABLE_TABLE_ID,
      bitableViewId: env.BITABLE_VIEW_ID,
      bitableResultFieldName: env.BITABLE_RESULT_FIELD_NAME,
      bitableStatusFieldName: env.BITABLE_STATUS_FIELD_NAME,
      bitableSubtaskStatusFieldName: env.BITABLE_SUBTASK_STATUS_FIELD_NAME,
      bitableChildStatusFieldName: env.BITABLE_CHILD_STATUS_FIELD_NAME,
      bitableSubtaskDataFieldName: env.BITABLE_SUBTASK_DATA_FIELD_NAME,
      bitableSyncIdFieldName: env.BITABLE_SYNC_ID_FIELD_NAME,
      bitableOrderFieldName: env.BITABLE_ORDER_FIELD_NAME,
      bitableArchivedFieldName: env.BITABLE_ARCHIVED_FIELD_NAME,
      bitableParentIdFieldName: env.BITABLE_PARENT_ID_FIELD_NAME,
      bitableBlockedReasonFieldName: env.BITABLE_BLOCKED_REASON_FIELD_NAME,
      bitableDueDateFieldName: env.BITABLE_DUE_DATE_FIELD_NAME,
      bitableDueTimeFieldName: env.BITABLE_DUE_TIME_FIELD_NAME,
      bitablePriorityFieldName: env.BITABLE_PRIORITY_FIELD_NAME,
      bitableReminderAtFieldName: env.BITABLE_REMINDER_AT_FIELD_NAME,
      floatlistTimeZone: env.FLOATLIST_TIME_ZONE,
      bitableTargetStatus: env.BITABLE_TARGET_STATUS,
      bitableCacheTtlSeconds: env.BITABLE_CACHE_TTL_SECONDS,
      bitableRequestTimeoutMs: env.BITABLE_REQUEST_TIMEOUT_MS,
      maxTextLength: env.MAX_TEXT_LENGTH,
      handlerTimeoutMs: env.HANDLER_TIMEOUT_MS,
      debugTimeoutMs: env.DEBUG_TIMEOUT_MS,
      floatlistClientToken: env.FLOATLIST_CLIENT_TOKEN,
      floatlistSyncBodyLimit: env.FLOATLIST_SYNC_BODY_LIMIT,
      floatlistIdempotencyTtlSeconds: env.FLOATLIST_IDEMPOTENCY_TTL_SECONDS,
      floatlistRateLimitWindowSeconds: env.FLOATLIST_RATE_LIMIT_WINDOW_SECONDS,
      floatlistRateLimitMaxRequests: env.FLOATLIST_RATE_LIMIT_MAX_REQUESTS,
      enableCardPreview: env.ENABLE_CARD_PREVIEW,
    } as const;
  } catch (error) {
    throw formatConfigError(error);
  }
}

export const config = loadConfig();

export type AppConfig = typeof config;
