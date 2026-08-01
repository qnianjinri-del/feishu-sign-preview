import { randomUUID } from "node:crypto";

import { config } from "../config.js";
import type { SyncTask, TaskStatus } from "../types/task-sync.js";
import type { RepositoryTask, TaskPatch, TaskRepository } from "./task-repository.js";

interface ResponseLike {
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
  statusText: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<ResponseLike>;

interface BitableTaskRepositoryOptions {
  apiBaseUrl?: string;
  appId?: string;
  appSecret?: string;
  appToken?: string;
  archivedFieldName?: string;
  blockedReasonFieldName?: string;
  childStatusFieldName?: string;
  fetchFn?: FetchLike;
  orderFieldName?: string;
  parentIdFieldName?: string;
  requestTimeoutMs?: number;
  resultFieldName?: string;
  statusFieldName?: string;
  subtaskDataFieldName?: string;
  subtaskStatusFieldName?: string;
  syncIdFieldName?: string;
  tableId?: string;
  targetStatus?: string;
}

interface TokenCacheEntry {
  expiresAt: number;
  token: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getData(payload: unknown): Record<string, unknown> | undefined {
  return isRecord(payload) && isRecord(payload.data) ? payload.data : undefined;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value.map(normalizeText).filter((item): item is string => Boolean(item)).join(" ").trim();
    return text || undefined;
  }
  if (isRecord(value)) {
    for (const key of ["text", "name", "value"]) {
      const text = normalizeText(value[key]);
      if (text) return text;
    }
  }
  return undefined;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value === "true" || value === "是" || value === "1";
}

function normalizeOrder(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function normalizeRemoteTime(value: unknown): string | undefined {
  const milliseconds = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(milliseconds)) return undefined;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isRemoteStatus(value: string | undefined, targetStatus: string): boolean {
  return value === "待办" || value === targetStatus || value === "受阻" || value === "已完成";
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "doing" || value === "blocked" || value === "done";
}

function optionalIso(value: unknown): string | undefined {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function parseEmbeddedSubtasks(
  value: unknown,
  parentId: string,
  parentRecordId: string,
  remoteUpdatedAt?: string,
): RepositoryTask[] {
  const raw = normalizeText(value);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (!isRecord(item)) return [];
      const id = normalizeText(item.id);
      const text = normalizeText(item.text);
      if (!id || !text || !isTaskStatus(item.status)) return [];
      const blockedReason = normalizeText(item.blockedReason);
      const createdAt = optionalIso(item.createdAt);
      const updatedAt = optionalIso(item.updatedAt);
      const completedAt = optionalIso(item.completedAt);
      return [{
        id,
        text,
        status: item.status,
        order: normalizeOrder(item.order, index),
        archived: normalizeBoolean(item.archived),
        parentId,
        remoteRecordId: parentRecordId,
        ...(item.status === "blocked" && blockedReason ? { blockedReason } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(updatedAt ? { updatedAt } : {}),
        ...(item.status === "done" && completedAt ? { completedAt } : {}),
        ...(remoteUpdatedAt ? { remoteUpdatedAt } : {}),
      }];
    });
  } catch {
    return [];
  }
}

function serializeEmbeddedSubtasks(tasks: RepositoryTask[]): string {
  return JSON.stringify(tasks.map((task) => ({
    id: task.id,
    text: task.text,
    status: task.status,
    order: task.order,
    archived: task.archived,
    parentId: task.parentId,
    ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
    ...(task.createdAt ? { createdAt: task.createdAt } : {}),
    ...(task.updatedAt ? { updatedAt: task.updatedAt } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
  })));
}

export class SyncConfigurationError extends Error {}

export class BitableTaskRepository implements TaskRepository {
  private readonly options: Required<BitableTaskRepositoryOptions>;
  private readonly embeddedByParentRecordId = new Map<string, RepositoryTask[]>();
  private readonly parentRecordIdBySyncId = new Map<string, string>();
  private tokenCache: TokenCacheEntry | undefined;

  constructor(options: BitableTaskRepositoryOptions = {}) {
    this.options = {
      apiBaseUrl: options.apiBaseUrl ?? "https://open.feishu.cn/open-apis",
      appId: options.appId ?? config.feishuAppId,
      appSecret: options.appSecret ?? config.feishuAppSecret,
      appToken: options.appToken ?? config.bitableAppToken,
      archivedFieldName: options.archivedFieldName ?? config.bitableArchivedFieldName,
      blockedReasonFieldName: options.blockedReasonFieldName ?? config.bitableBlockedReasonFieldName,
      childStatusFieldName: options.childStatusFieldName ?? config.bitableChildStatusFieldName,
      fetchFn: options.fetchFn ?? (globalThis.fetch as FetchLike),
      orderFieldName: options.orderFieldName ?? config.bitableOrderFieldName,
      parentIdFieldName: options.parentIdFieldName ?? config.bitableParentIdFieldName,
      requestTimeoutMs: options.requestTimeoutMs ?? config.bitableRequestTimeoutMs,
      resultFieldName: options.resultFieldName ?? config.bitableResultFieldName,
      statusFieldName: options.statusFieldName ?? config.bitableStatusFieldName,
      subtaskDataFieldName: options.subtaskDataFieldName ?? config.bitableSubtaskDataFieldName,
      subtaskStatusFieldName: options.subtaskStatusFieldName ?? config.bitableSubtaskStatusFieldName,
      syncIdFieldName: options.syncIdFieldName ?? config.bitableSyncIdFieldName,
      tableId: options.tableId ?? config.bitableTableId,
      targetStatus: options.targetStatus ?? config.bitableTargetStatus,
    };
  }

  async listTasks(includeArchived = false): Promise<RepositoryTask[]> {
    this.assertConfigured();
    const token = await this.getTenantAccessToken();
    const records: Array<Record<string, unknown>> = [];
    let pageToken = "";

    do {
      const url = new URL(`${this.recordsUrl()}/search`);
      url.searchParams.set("page_size", "500");
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const body: Record<string, unknown> = {
        field_names: this.fieldNames(),
      };
      const payload = await this.fetchJson(url.toString(), token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = getData(payload);
      if (Array.isArray(data?.items)) {
        records.push(...data.items.filter((item): item is Record<string, unknown> => isRecord(item)));
      }
      pageToken = typeof data?.page_token === "string" && data.has_more === true ? data.page_token : "";
    } while (pageToken);

    const mappedTasks: RepositoryTask[] = [];
    const fieldsByRecordId = new Map<string, Record<string, unknown>>();
    for (const [index, record] of records.entries()) {
      const mapped = await this.mapRecord(record, index, token);
      if (!mapped) continue;
      mappedTasks.push(mapped);
      if (isRecord(record.fields)) fieldsByRecordId.set(mapped.remoteRecordId, record.fields);
    }
    const roots = mappedTasks.filter((task) => !task.parentId);
    this.embeddedByParentRecordId.clear();
    this.parentRecordIdBySyncId.clear();
    const embedded: RepositoryTask[] = [];
    for (const root of roots) {
      this.parentRecordIdBySyncId.set(root.id, root.remoteRecordId);
      const children = parseEmbeddedSubtasks(
        fieldsByRecordId.get(root.remoteRecordId)?.[this.options.subtaskDataFieldName],
        root.id,
        root.remoteRecordId,
        root.remoteUpdatedAt,
      );
      this.embeddedByParentRecordId.set(root.remoteRecordId, children);
      embedded.push(...children);
    }
    const embeddedIds = new Set(embedded.map((task) => task.id));
    const legacyChildren = mappedTasks.filter((task) => task.parentId && !embeddedIds.has(task.id));
    return [...roots, ...embedded, ...legacyChildren]
      .filter((task) => includeArchived || !task.archived);
  }

  async createTask(task: SyncTask): Promise<RepositoryTask> {
    this.assertConfigured();
    const token = await this.getTenantAccessToken();
    if (task.parentId) {
      const parentRecordId = this.parentRecordIdBySyncId.get(task.parentId);
      if (!parentRecordId) throw new Error(`Parent ${task.parentId} was not loaded before creating its subtask.`);
      const now = new Date().toISOString();
      const created: RepositoryTask = {
        ...task,
        archived: false,
        remoteRecordId: parentRecordId,
        createdAt: task.createdAt ?? now,
        updatedAt: task.updatedAt ?? now,
        ...(task.status === "done" ? { completedAt: task.completedAt ?? now } : {}),
      };
      const next = [...(this.embeddedByParentRecordId.get(parentRecordId) ?? []), created];
      await this.writeEmbeddedSubtasks(parentRecordId, next, token);
      this.embeddedByParentRecordId.set(parentRecordId, next);
      return created;
    }
    const payload = await this.fetchJson(this.recordsUrl(), token, {
      method: "POST",
      body: JSON.stringify({ fields: this.toRemoteFields(task, { archived: false }) }),
    });
    const data = getData(payload);
    const record = isRecord(data?.record) ? data.record : undefined;
    const recordId = normalizeText(record?.record_id ?? data?.record_id);
    if (!recordId) throw new Error("Feishu create record response did not include record_id.");
    this.parentRecordIdBySyncId.set(task.id, recordId);
    this.embeddedByParentRecordId.set(recordId, []);
    return { ...task, archived: false, remoteRecordId: recordId };
  }

  async updateTask(task: RepositoryTask, patch: TaskPatch): Promise<void> {
    this.assertConfigured();
    const token = await this.getTenantAccessToken();
    if (task.parentId) {
      if (patch.parentId !== undefined && patch.parentId !== task.parentId) {
        throw new Error("Moving an embedded subtask between parents is not supported.");
      }
      const children = this.embeddedByParentRecordId.get(task.remoteRecordId) ?? [];
      const index = children.findIndex((child) => child.id === task.id);
      if (index < 0) throw new Error(`Embedded subtask ${task.id} was not loaded before update.`);
      const existing = children[index];
      if (!existing) throw new Error(`Embedded subtask ${task.id} was not loaded before update.`);
      const now = new Date().toISOString();
      const status = patch.status ?? task.status;
      const nextTask: RepositoryTask = {
        ...existing,
        ...(patch.text !== undefined ? { text: patch.text } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.order !== undefined ? { order: patch.order } : {}),
        ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
        updatedAt: now,
      };
      if (status === "done") nextTask.completedAt = existing.completedAt ?? now;
      else delete nextTask.completedAt;
      if (status === "blocked") {
        nextTask.blockedReason = patch.blockedReason ?? existing.blockedReason ?? "未记录受阻原因";
      } else {
        delete nextTask.blockedReason;
      }
      const next = children.map((child, childIndex) => childIndex === index ? nextTask : child);
      await this.writeEmbeddedSubtasks(task.remoteRecordId, next, token);
      this.embeddedByParentRecordId.set(task.remoteRecordId, next);
      return;
    }
    const fields: Record<string, unknown> = {};
    if (patch.text !== undefined) fields[this.options.resultFieldName] = patch.text;
    if (patch.status !== undefined || patch.parentId !== undefined) {
      const effectiveParentId = patch.parentId !== undefined ? patch.parentId ?? undefined : task.parentId;
      const effectiveStatus = patch.status ?? task.status;
      if (effectiveParentId) {
        fields[this.options.statusFieldName] = "待办";
        fields[this.options.childStatusFieldName] = this.toRemoteStatus(effectiveStatus);
      } else {
        fields[this.options.statusFieldName] = this.toRemoteStatus(effectiveStatus);
      }
    }
    if (patch.subtaskSummary !== undefined) {
      fields[this.options.subtaskStatusFieldName] = patch.subtaskSummary ?? "";
    }
    if (patch.order !== undefined) fields[this.options.orderFieldName] = patch.order;
    if (patch.archived !== undefined) fields[this.options.archivedFieldName] = patch.archived;
    if (patch.parentId !== undefined) fields[this.options.parentIdFieldName] = patch.parentId ?? "";
    if (patch.blockedReason !== undefined) fields[this.options.blockedReasonFieldName] = patch.blockedReason ?? "";
    if (!Object.keys(fields).length) return;
    await this.fetchJson(`${this.recordsUrl()}/${encodeURIComponent(task.remoteRecordId)}`, token, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  private async mapRecord(
    record: Record<string, unknown>,
    fallbackOrder: number,
    token: string,
  ): Promise<RepositoryTask | undefined> {
    const recordId = normalizeText(record.record_id);
    const fields = isRecord(record.fields) ? record.fields : undefined;
    if (!recordId || !fields) return undefined;
    const parentId = normalizeText(fields[this.options.parentIdFieldName]);
    const mainStatus = normalizeText(fields[this.options.statusFieldName]);
    const subtaskSummary = normalizeText(fields[this.options.subtaskStatusFieldName]);
    const childStatus = normalizeText(fields[this.options.childStatusFieldName]);
    const legacyChildStatus = parentId && !childStatus && isRemoteStatus(subtaskSummary, this.options.targetStatus)
      ? subtaskSummary
      : undefined;
    const status = this.fromRemoteStatus(parentId ? childStatus ?? legacyChildStatus ?? mainStatus : mainStatus);
    const normalizationFields: Record<string, unknown> = {};
    let id = normalizeText(fields[this.options.syncIdFieldName]);
    if (!id) {
      id = randomUUID();
      normalizationFields[this.options.syncIdFieldName] = id;
    }
    if (parentId) {
      const normalizedStatus = this.toRemoteStatus(status);
      if (mainStatus !== "待办") normalizationFields[this.options.statusFieldName] = "待办";
      if (childStatus !== normalizedStatus) normalizationFields[this.options.childStatusFieldName] = normalizedStatus;
      if (subtaskSummary) normalizationFields[this.options.subtaskStatusFieldName] = "";
    }
    if (Object.keys(normalizationFields).length) {
      await this.fetchJson(`${this.recordsUrl()}/${encodeURIComponent(recordId)}`, token, {
        method: "PUT",
        body: JSON.stringify({ fields: normalizationFields }),
      });
    }
    const text = normalizeText(fields[this.options.resultFieldName]);
    if (!text) return undefined;
    const blockedReason = normalizeText(fields[this.options.blockedReasonFieldName]);
    const remoteUpdatedAt = normalizeRemoteTime(record.last_modified_time ?? record.updated_at);
    return {
      id,
      text,
      status,
      order: normalizeOrder(fields[this.options.orderFieldName], fallbackOrder),
      archived: normalizeBoolean(fields[this.options.archivedFieldName]),
      remoteRecordId: recordId,
      ...(parentId ? { parentId } : {}),
      ...(!parentId && subtaskSummary ? { subtaskSummary } : {}),
      ...(status === "blocked" && blockedReason ? { blockedReason } : {}),
      ...(remoteUpdatedAt ? { remoteUpdatedAt } : {}),
    };
  }

  private toRemoteFields(task: SyncTask, extra: { archived: boolean }): Record<string, unknown> {
    const fields: Record<string, unknown> = {
      [this.options.syncIdFieldName]: task.id,
      [this.options.resultFieldName]: task.text,
      [this.options.orderFieldName]: task.order,
      [this.options.archivedFieldName]: extra.archived,
      [this.options.parentIdFieldName]: task.parentId ?? "",
      [this.options.blockedReasonFieldName]: task.status === "blocked" ? task.blockedReason ?? "未记录受阻原因" : "",
      [this.options.subtaskDataFieldName]: "[]",
    };
    if (task.parentId) {
      fields[this.options.statusFieldName] = "待办";
      fields[this.options.childStatusFieldName] = this.toRemoteStatus(task.status);
    } else {
      fields[this.options.statusFieldName] = this.toRemoteStatus(task.status);
    }
    return fields;
  }

  private fromRemoteStatus(value: string | undefined): TaskStatus {
    if (value === this.options.targetStatus) return "doing";
    if (value === "受阻") return "blocked";
    if (value === "已完成") return "done";
    return "todo";
  }

  private toRemoteStatus(status: TaskStatus): string {
    if (status === "doing") return this.options.targetStatus;
    if (status === "blocked") return "受阻";
    if (status === "done") return "已完成";
    return "待办";
  }

  private fieldNames(): string[] {
    return [
      this.options.syncIdFieldName,
      this.options.resultFieldName,
      this.options.statusFieldName,
      this.options.subtaskStatusFieldName,
      this.options.childStatusFieldName,
      this.options.subtaskDataFieldName,
      this.options.orderFieldName,
      this.options.archivedFieldName,
      this.options.parentIdFieldName,
      this.options.blockedReasonFieldName,
    ];
  }

  private recordsUrl(): string {
    return `${this.options.apiBaseUrl}/bitable/v1/apps/${encodeURIComponent(this.options.appToken)}/tables/${encodeURIComponent(this.options.tableId)}/records`;
  }

  private async writeEmbeddedSubtasks(
    parentRecordId: string,
    tasks: RepositoryTask[],
    token: string,
  ): Promise<void> {
    await this.fetchJson(`${this.recordsUrl()}/${encodeURIComponent(parentRecordId)}`, token, {
      method: "PUT",
      body: JSON.stringify({
        fields: {
          [this.options.subtaskDataFieldName]: serializeEmbeddedSubtasks(tasks),
        },
      }),
    });
  }

  private assertConfigured(): void {
    if (!this.options.appId || !this.options.appSecret || !this.options.appToken || !this.options.tableId) {
      throw new SyncConfigurationError("FloatList sync requires Feishu credentials, BITABLE_APP_TOKEN, and BITABLE_TABLE_ID.");
    }
  }

  private async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now) return this.tokenCache.token;
    const payload = await this.fetchJson(`${this.options.apiBaseUrl}/auth/v3/tenant_access_token/internal`, "", {
      method: "POST",
      body: JSON.stringify({ app_id: this.options.appId, app_secret: this.options.appSecret }),
    });
    const data = getData(payload);
    const token = normalizeText(isRecord(payload) ? payload.tenant_access_token : undefined)
      ?? normalizeText(data?.tenant_access_token);
    if (!token) throw new Error("tenant_access_token is missing from Feishu auth response.");
    const expire = isRecord(payload) && typeof payload.expire === "number" ? payload.expire : 7_200;
    this.tokenCache = { token, expiresAt: now + Math.max(60, expire - 60) * 1_000 };
    return token;
  }

  private async fetchJson(url: string, token: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);
    timeout.unref?.();
    try {
      const response = await this.options.fetchFn(url, {
        ...init,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json; charset=utf-8",
        },
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!isRecord(payload)) throw new Error("Feishu API returned a non-object payload.");
      const code = typeof payload.code === "number" ? payload.code : 0;
      if (!response.ok || code !== 0) {
        const message = normalizeText(payload.msg) ?? response.statusText;
        throw new Error(`Feishu API request failed. status=${response.status}, code=${code}, msg=${message}`);
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
