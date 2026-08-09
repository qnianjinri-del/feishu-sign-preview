import { invoke } from "@tauri-apps/api/core";
import {
  MINIMUM_DESKTOP_VERSION,
  SYNC_API_VERSION,
  taskSnapshotSchema,
} from "@floatlist/contracts";
import type { SyncMutation, TaskSnapshot } from "../types/sync";
import { isTauriRuntime } from "./runtime";

interface SyncHttpResponse {
  status: number;
  etag?: string;
  body?: unknown;
}

export interface SyncProbeResult {
  status: number;
  syncConfigured: boolean;
  gatewayVersion: string;
  syncApiVersion: number;
}

export type SyncClientErrorKind = "auth" | "conflict" | "configuration" | "remote" | "transport";

export class SyncClientError extends Error {
  constructor(
    message: string,
    public readonly kind: SyncClientErrorKind,
    public readonly snapshot?: TaskSnapshot,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSnapshot(value: unknown): TaskSnapshot {
  const parsed = taskSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new SyncClientError("同步服务返回的 v2 快照格式无效", "remote");
  return parsed.data;
}

function errorMessage(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : fallback;
}

function ensureNativeRuntime(): void {
  if (!isTauriRuntime()) throw new SyncClientError("同步功能只能在 FloatList 桌面应用中使用", "configuration");
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  ensureNativeRuntime();
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new SyncClientError(typeof error === "string" ? error : "同步服务连接失败", "transport");
  }
}

export async function hasSyncClientToken(): Promise<boolean> {
  return call<boolean>("sync_has_client_token");
}

export async function saveSyncClientToken(token: string): Promise<void> {
  await call<void>("sync_set_client_token", { token });
}

export async function deleteSyncClientToken(): Promise<void> {
  await call<void>("sync_delete_client_token");
}

export async function probeSyncService(serviceUrl: string): Promise<SyncProbeResult> {
  const raw = await call<unknown>("sync_probe_service", { serviceUrl });
  if (!isRecord(raw)
    || typeof raw.status !== "number"
    || typeof raw.syncConfigured !== "boolean"
    || typeof raw.gatewayVersion !== "string"
    || typeof raw.syncApiVersion !== "number") {
    throw new SyncClientError(`同步网关不支持 v${SYNC_API_VERSION}，需要 FloatList 网关 2.0.0 或更高版本`, "configuration");
  }
  const result: SyncProbeResult = {
    status: raw.status,
    syncConfigured: raw.syncConfigured,
    gatewayVersion: raw.gatewayVersion,
    syncApiVersion: raw.syncApiVersion,
  };
  if (result.status !== 200) throw new SyncClientError(`同步服务健康检查返回 ${result.status}`, "remote");
  if (result.syncApiVersion !== SYNC_API_VERSION) {
    throw new SyncClientError(`请同步升级桌面端与网关（最低桌面端 ${MINIMUM_DESKTOP_VERSION}）`, "configuration");
  }
  return result;
}

export async function fetchTaskSnapshot(
  serviceUrl: string,
  version?: string,
): Promise<{ notModified: boolean; snapshot?: TaskSnapshot }> {
  const response = await call<SyncHttpResponse>("sync_fetch_snapshot", {
    serviceUrl,
    etag: version ? `"${version}"` : null,
  });
  if (response.status === 304) return { notModified: true };
  if (response.status === 401) throw new SyncClientError("同步令牌无效", "auth");
  if (response.status === 426) throw new SyncClientError(`同步协议已升级，请使用 FloatList ${MINIMUM_DESKTOP_VERSION} 或更高版本`, "configuration");
  if (response.status === 503) {
    throw new SyncClientError(errorMessage(response.body, "同步服务尚未就绪"), "configuration");
  }
  if (response.status !== 200) {
    throw new SyncClientError(errorMessage(response.body, `同步服务返回 ${response.status}`), "remote");
  }
  return { notModified: false, snapshot: parseSnapshot(response.body) };
}

export async function sendTaskMutations(
  serviceUrl: string,
  baseVersion: string | undefined,
  operations: SyncMutation[],
): Promise<TaskSnapshot> {
  const idempotencyKey = operations[0]?.operationId;
  if (!idempotencyKey) throw new SyncClientError("没有待提交的本地修改", "configuration");
  const response = await call<SyncHttpResponse>("sync_send_mutations", {
    serviceUrl,
    idempotencyKey,
    body: {
      ...(baseVersion ? { baseVersion } : {}),
      operations,
    },
  });
  if (response.status === 401) throw new SyncClientError("同步令牌无效", "auth");
  if (response.status === 426) throw new SyncClientError(`同步协议已升级，请使用 FloatList ${MINIMUM_DESKTOP_VERSION} 或更高版本`, "configuration");
  if (response.status === 409 && isRecord(response.body) && response.body.snapshot) {
    throw new SyncClientError("飞书任务在本地提交前已变化", "conflict", parseSnapshot(response.body.snapshot));
  }
  if (response.status === 422 || response.status === 404) {
    throw new SyncClientError(errorMessage(response.body, "本地修改无法应用到飞书"), "remote");
  }
  if (response.status === 503) {
    throw new SyncClientError(errorMessage(response.body, "同步服务尚未就绪"), "configuration");
  }
  if (response.status !== 200) {
    throw new SyncClientError(errorMessage(response.body, `同步服务返回 ${response.status}`), "remote");
  }
  return parseSnapshot(response.body);
}
