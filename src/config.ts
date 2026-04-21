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

    if (env.NODE_ENV === "production" && publicBaseUrl.includes("localhost")) {
      throw new Error("PUBLIC_BASE_URL cannot use localhost in production.");
    }

    if (env.NODE_ENV === "production" && !env.FEISHU_VERIFICATION_TOKEN && !env.FEISHU_ENCRYPT_KEY) {
      throw new Error("Set FEISHU_VERIFICATION_TOKEN or FEISHU_ENCRYPT_KEY before running in production.");
    }

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
