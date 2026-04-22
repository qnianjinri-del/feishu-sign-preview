import { z } from "zod";

export const previewDebugQuerySchema = z.object({
  url: z.string().url().optional(),
  t: z.string().optional(),
  k: z.string().optional(),
  u: z.string().optional(),
  slot: z.string().optional(),
  ks: z.string().optional(),
});

export const rootQuerySchema = z.object({
  t: z.string().optional(),
  k: z.string().optional(),
  u: z.string().optional(),
  slot: z.string().optional(),
  ks: z.string().optional(),
});

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
