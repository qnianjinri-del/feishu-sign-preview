import dotenv from "dotenv";
import { ZodError, z } from "zod";

import { normalizePublicBaseUrl, resolveHelpUrl } from "./lib/url.js";

dotenv.config();

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
  BITABLE_APP_TOKEN: z.string().default("XLNaboeiCaFzN5sUtMfcVl9Mn8z"),
  BITABLE_TABLE_ID: z.string().default("tbl9MppZ1OXYKapw"),
  BITABLE_VIEW_ID: z.string().default("vewbgk85az"),
  BITABLE_RESULT_FIELD_NAME: z.string().default("任务名"),
  BITABLE_STATUS_FIELD_NAME: z.string().default("任务状态"),
  BITABLE_TARGET_STATUS: z.string().default("在干"),
  BITABLE_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  BITABLE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(1500),
  MAX_TEXT_LENGTH: z.coerce.number().int().min(1).max(500).default(80),
  HANDLER_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(1500),
  DEBUG_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(2000),
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
      bitableTargetStatus: env.BITABLE_TARGET_STATUS,
      bitableCacheTtlSeconds: env.BITABLE_CACHE_TTL_SECONDS,
      bitableRequestTimeoutMs: env.BITABLE_REQUEST_TIMEOUT_MS,
      maxTextLength: env.MAX_TEXT_LENGTH,
      handlerTimeoutMs: env.HANDLER_TIMEOUT_MS,
      debugTimeoutMs: env.DEBUG_TIMEOUT_MS,
      enableCardPreview: env.ENABLE_CARD_PREVIEW,
    } as const;
  } catch (error) {
    throw formatConfigError(error);
  }
}

export const config = loadConfig();

export type AppConfig = typeof config;
