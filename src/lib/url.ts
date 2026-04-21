import { normalizeOptionalParam } from "../utils/text.js";
import type { PreviewParamsInput } from "../types/index.js";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

function isNumericPortion(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !isNumericPortion(part))) {
    return false;
  }

  const octets = parts.map((part) => Number(part));
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    BLOCKED_HOSTS.has(normalized) ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".lan") ||
    (!normalized.includes(".") && !normalized.includes(":")) ||
    isBlockedIpv4(normalized) ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

export function parsePreviewParamsFromUrl(rawUrl: string): PreviewParamsInput {
  const parsed = new URL(rawUrl);
  return {
    t: normalizeOptionalParam(parsed.searchParams.get("t")),
    k: normalizeOptionalParam(parsed.searchParams.get("k")),
    u: normalizeOptionalParam(parsed.searchParams.get("u")),
    slot: normalizeOptionalParam(parsed.searchParams.get("slot")),
  };
}

export function buildSourceUrlFromParams(baseUrl: string, input: PreviewParamsInput): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(input)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function buildEditorUrl(baseUrl: string, input: PreviewParamsInput): string {
  const url = new URL("/editor", `${baseUrl}/`);
  for (const [key, value] of Object.entries(input)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function buildBitableAppUrl(baseUrl: string, appToken: string, tableId: string, viewId: string): string {
  const origin = new URL(baseUrl);
  const host = origin.hostname.includes("feishu") ? origin.origin : "https://feishu.cn";
  const url = new URL(`/base/${appToken}`, host);
  url.searchParams.set("table", tableId);
  url.searchParams.set("view", viewId);
  return url.toString();
}

export function toMultiUrl(url: string) {
  return {
    copy_url: url,
    ios: url,
    android: url,
    pc: url,
    web: url,
  };
}

export function normalizePublicBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("PUBLIC_BASE_URL must use http or https.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function resolveHelpUrl(baseUrl: string, helpPath: string): string {
  return new URL(helpPath, `${baseUrl}/`).toString();
}

export function isSafeRedirectUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return false;
  }

  return !isBlockedHostname(url.hostname);
}

export function normalizeJumpUrl(candidate: string | undefined, fallbackUrl: string): string {
  if (!candidate) {
    return fallbackUrl;
  }

  return isSafeRedirectUrl(candidate) ? candidate : fallbackUrl;
}
