import { invoke } from "@tauri-apps/api/core";
import type { SyncMutation, SyncTask, SyncWarning, TaskSnapshot } from "../types/sync";
import { isTauriRuntime } from "./runtime";

interface SyncHttpResponse {
  status: number;
  etag?: string;
  body?: unknown;
}

export interface SyncProbeResult {
  status: number;
  syncConfigured: boolean;
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

function isIsoString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseSyncTask(value: unknown): SyncTask | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.text !== "string"
    || !["todo", "doing", "blocked", "done"].includes(String(value.status))
    || typeof value.order !== "number") return null;
  return {
    id: value.id,
    text: value.text,
    status: value.status as SyncTask["status"],
    order: Math.max(0, Math.trunc(value.order)),
    ...(typeof value.parentId === "string" && value.parentId ? { parentId: value.parentId } : {}),
    ...(typeof value.blockedReason === "string" && value.blockedReason ? { blockedReason: value.blockedReason } : {}),
    ...(isIsoString(value.createdAt) ? { createdAt: value.createdAt } : {}),
    ...(isIsoString(value.updatedAt) ? { updatedAt: value.updatedAt } : {}),
    ...(isIsoString(value.completedAt) ? { completedAt: value.completedAt } : {}),
    ...(typeof value.remoteRecordId === "string" && value.remoteRecordId
      ? { remoteRecordId: value.remoteRecordId }
      : {}),
    ...(isIsoString(value.remoteUpdatedAt) ? { remoteUpdatedAt: value.remoteUpdatedAt } : {}),
  };
}

function parseWarning(value: unknown): SyncWarning | null {
  if (!isRecord(value)
    || (value.code !== "multiple_doing" && value.code !== "orphan_subtask")
    || typeof value.message !== "string"
    || !Array.isArray(value.taskIds)) return null;
  return {
    code: value.code,
    message: value.message,
    taskIds: value.taskIds.filter((id): id is string => typeof id === "string"),
  };
}

function parseSnapshot(value: unknown): TaskSnapshot {
  if (!isRecord(value) || typeof value.version !== "string" || !Array.isArray(value.tasks)) {
    throw new SyncClientError("同步服务返回的快照格式无效", "remote");
  }
  const tasks = value.tasks.map(parseSyncTask);
  if (tasks.some((task) => !task)) {
    throw new SyncClientError("同步服务返回了无效任务", "remote");
  }
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map(parseWarning).filter((warning): warning is SyncWarning => Boolean(warning))
    : [];
  return { version: value.version, tasks: tasks as SyncTask[], warnings };
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
  const result = await call<SyncProbeResult>("sync_probe_service", { serviceUrl });
  if (result.status !== 200) throw new SyncClientError(`同步服务健康检查返回 ${result.status}`, "remote");
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
