import { config } from "../config.js";
import type { PreviewContext } from "../types/index.js";

import type { DataProvider } from "./data-provider.js";

interface ResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<ResponseLike>;

interface LoggerLike {
  info?(message: string, ...args: unknown[]): void;
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

export interface BitableDataProviderOptions {
  appId?: string;
  appSecret?: string;
  appToken?: string;
  tableId?: string;
  viewId?: string;
  resultFieldName?: string;
  statusFieldName?: string;
  orderFieldName?: string;
  parentIdFieldName?: string;
  targetStatus?: string;
  cacheTtlSeconds?: number;
  requestTimeoutMs?: number;
  noMatchValue?: string;
  apiBaseUrl?: string;
  fetchFn?: FetchLike;
  now?: () => number;
  logger?: LoggerLike;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getDataRecord(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  return isRecord(payload.data) ? payload.data : undefined;
}

function normalizeWhitespace(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized === "" ? undefined : normalized;
}

function normalizeFieldValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeFieldValue(item))
      .filter((item): item is string => Boolean(item));

    return parts.length > 0 ? parts.join(" ") : undefined;
  }

  if (isRecord(value)) {
    for (const key of ["text", "name", "full_address", "address", "location", "link", "url", "email"]) {
      const normalized = normalizeFieldValue(value[key]);
      if (normalized) {
        return normalized;
      }
    }

    const nestedParts = Object.values(value)
      .map((item) => normalizeFieldValue(item))
      .filter((item): item is string => Boolean(item));

    return nestedParts.length > 0 ? nestedParts.join(" ") : undefined;
  }

  return undefined;
}

function getItems(payload: unknown): Array<Record<string, unknown>> {
  const data = getDataRecord(payload);
  const items = data?.items;

  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item): item is Record<string, unknown> => isRecord(item));
}

export class BitableDataProvider implements DataProvider {
  private readonly options: Required<Omit<BitableDataProviderOptions, "fetchFn" | "now" | "logger">> & {
    fetchFn: FetchLike;
    now: () => number;
    logger: LoggerLike;
  };

  private cache: CacheEntry | undefined;
  private tokenCache: TokenCacheEntry | undefined;
  private inflight: Promise<string | undefined> | undefined;
  private hasWarnedAboutCredentials = false;

  constructor(options: BitableDataProviderOptions = {}) {
    this.options = {
      appId: options.appId ?? config.feishuAppId,
      appSecret: options.appSecret ?? config.feishuAppSecret,
      appToken: options.appToken ?? config.bitableAppToken,
      tableId: options.tableId ?? config.bitableTableId,
      viewId: options.viewId ?? config.bitableViewId,
      resultFieldName: options.resultFieldName ?? config.bitableResultFieldName,
      statusFieldName: options.statusFieldName ?? config.bitableStatusFieldName,
      orderFieldName: options.orderFieldName ?? config.bitableOrderFieldName,
      parentIdFieldName: options.parentIdFieldName ?? config.bitableParentIdFieldName,
      targetStatus: options.targetStatus ?? config.bitableTargetStatus,
      cacheTtlSeconds: options.cacheTtlSeconds ?? config.bitableCacheTtlSeconds,
      requestTimeoutMs: options.requestTimeoutMs ?? config.bitableRequestTimeoutMs,
      noMatchValue: options.noMatchValue ?? "空闲中",
      apiBaseUrl: options.apiBaseUrl ?? "https://open.feishu.cn/open-apis",
      fetchFn: options.fetchFn ?? (globalThis.fetch as FetchLike),
      now: options.now ?? Date.now,
      logger: options.logger ?? console,
    };
  }

  async getSlotValue(slot: string, _context: PreviewContext): Promise<string | undefined> {
    if (slot !== "current_task") {
      return undefined;
    }

    const now = this.options.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    if (!this.inflight) {
      this.inflight = this.refreshCurrentTask().finally(() => {
        this.inflight = undefined;
      });
    }

    return this.inflight;
  }

  invalidate(): void {
    this.cache = undefined;
  }

  private async refreshCurrentTask(): Promise<string | undefined> {
    if (!this.options.appId || !this.options.appSecret || !this.options.appToken || !this.options.tableId) {
      if (!this.hasWarnedAboutCredentials) {
        this.options.logger.warn?.(
          "[BitableDataProvider] Feishu credentials or Bitable identifiers are missing; slot=current_task will fall back.",
        );
        this.hasWarnedAboutCredentials = true;
      }

      return this.cache?.value ?? this.options.noMatchValue;
    }

    try {
      const tenantAccessToken = await this.getTenantAccessToken();
      const value = await this.fetchCurrentTaskFromBitable(tenantAccessToken);
      this.cache = {
        value,
        expiresAt: this.options.now() + this.options.cacheTtlSeconds * 1000,
      };
      return value;
    } catch (error) {
      this.options.logger.error?.("[BitableDataProvider] Failed to refresh current_task slot.", error);
      return this.cache?.value ?? this.options.noMatchValue;
    }
  }

  private async getTenantAccessToken(): Promise<string> {
    const now = this.options.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now) {
      return this.tokenCache.token;
    }

    const payload = await this.fetchJson(`${this.options.apiBaseUrl}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app_id: this.options.appId,
        app_secret: this.options.appSecret,
      }),
    });
    const data = getDataRecord(payload);

    const token =
      getString((payload as Record<string, unknown>).tenant_access_token) ?? getString(data?.tenant_access_token);

    if (!token) {
      throw new Error("tenant_access_token is missing from Feishu auth response.");
    }

    const expireSecondsRaw = (payload as Record<string, unknown>).expire ?? data?.expire;
    const expireSeconds =
      typeof expireSecondsRaw === "number" && Number.isFinite(expireSecondsRaw) ? expireSecondsRaw : 7200;

    this.tokenCache = {
      token,
      expiresAt: now + Math.max(60, expireSeconds - 60) * 1000,
    };

    return token;
  }

  private async fetchCurrentTaskFromBitable(tenantAccessToken: string): Promise<string> {
    const url = new URL(
      `${this.options.apiBaseUrl}/bitable/v1/apps/${encodeURIComponent(this.options.appToken)}/tables/${encodeURIComponent(this.options.tableId)}/records/search`,
    );
    url.searchParams.set("page_size", "100");

    const body: Record<string, unknown> = {
      field_names: [
        this.options.resultFieldName,
        this.options.statusFieldName,
        this.options.orderFieldName,
        this.options.parentIdFieldName,
      ],
      filter: {
        conjunction: "and",
        conditions: [
          {
            field_name: this.options.statusFieldName,
            operator: "is",
            value: [this.options.targetStatus],
          },
        ],
      },
    };
    if (this.options.viewId) body.view_id = this.options.viewId;

    const payload = await this.fetchJson(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });

    const candidates = getItems(payload).flatMap((item, index) => {
      const fields = isRecord(item.fields) ? item.fields : undefined;
      if (!fields) return [];

      const taskValue = normalizeFieldValue(fields[this.options.resultFieldName]);
      if (!taskValue) return [];
      if (normalizeFieldValue(fields[this.options.parentIdFieldName])) return [];
      const rawOrder = fields[this.options.orderFieldName];
      const order = typeof rawOrder === "number" && Number.isFinite(rawOrder)
        ? rawOrder
        : Number(normalizeFieldValue(rawOrder) ?? index);
      return [{
        text: taskValue,
        order: Number.isFinite(order) ? order : index,
      }];
    }).sort((left, right) => left.order - right.order);

    const current = candidates[0];
    if (!current) return this.options.noMatchValue;
    return current.text;
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);
    timeout.unref?.();

    try {
      const response = await this.options.fetchFn(url, {
        ...init,
        signal: controller.signal,
      });

      const payload = await response.json();
      if (!isRecord(payload)) {
        throw new Error("Feishu API returned a non-object payload.");
      }

      if (!response.ok) {
        const code = typeof payload.code === "number" ? payload.code : "unknown";
        const message = getString(payload.msg) ?? response.statusText;
        throw new Error(
          `Feishu API request failed with ${response.status} ${response.statusText}. code=${code}, msg=${message}`,
        );
      }

      const code = payload.code;
      if (typeof code === "number" && code !== 0) {
        throw new Error(`Feishu API returned code ${code}: ${getString(payload.msg) ?? "unknown error"}.`);
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Feishu API request timed out after ${this.options.requestTimeoutMs}ms.`, { cause: error });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
