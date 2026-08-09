import "./load-env.mjs";

import { randomUUID } from "node:crypto";

const API_BASE_URL = "https://open.feishu.cn/open-apis";
const checkOnly = process.argv.includes("--check");

const requiredEnvironment = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "BITABLE_APP_TOKEN",
  "BITABLE_TABLE_ID",
];

for (const name of requiredEnvironment) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required.`);
}

const appToken = process.env.BITABLE_APP_TOKEN.trim();
const tableId = process.env.BITABLE_TABLE_ID.trim();
const resultFieldName = process.env.BITABLE_RESULT_FIELD_NAME || "任务名";
const statusFieldName = process.env.BITABLE_STATUS_FIELD_NAME || "任务状态";
const subtaskStatusFieldName = process.env.BITABLE_SUBTASK_STATUS_FIELD_NAME || "子状态";
const childStatusFieldName = process.env.BITABLE_CHILD_STATUS_FIELD_NAME || "FloatList子事项状态";
const subtaskDataFieldName = process.env.BITABLE_SUBTASK_DATA_FIELD_NAME || "FloatList子事项数据";
const syncIdFieldName = process.env.BITABLE_SYNC_ID_FIELD_NAME || "FloatList同步ID";
const orderFieldName = process.env.BITABLE_ORDER_FIELD_NAME || "FloatList顺序";
const archivedFieldName = process.env.BITABLE_ARCHIVED_FIELD_NAME || "FloatList归档";
const parentIdFieldName = process.env.BITABLE_PARENT_ID_FIELD_NAME || "FloatList父事项ID";
const blockedReasonFieldName = process.env.BITABLE_BLOCKED_REASON_FIELD_NAME || "FloatList受阻原因";
const targetStatus = process.env.BITABLE_TARGET_STATUS || "在干";
const fieldNames = [
  resultFieldName,
  statusFieldName,
  subtaskStatusFieldName,
  childStatusFieldName,
  subtaskDataFieldName,
  syncIdFieldName,
  orderFieldName,
  archivedFieldName,
  parentIdFieldName,
  blockedReasonFieldName,
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(" ").trim();
  if (isRecord(value)) {
    for (const key of ["text", "name", "value"]) {
      const text = normalizeText(value[key]);
      if (text) return text;
    }
  }
  return "";
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value === "true" || value === "是" || value === "1";
}

function normalizeOrder(value, fallback) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function normalizeRemoteTime(value) {
  const milliseconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function fromRemoteStatus(value) {
  if (value === targetStatus) return "doing";
  if (value === "受阻") return "blocked";
  if (value === "已完成") return "done";
  return "todo";
}

function parseEmbedded(value) {
  const text = normalizeText(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    throw new Error(`Field ${subtaskDataFieldName} contains invalid JSON.`);
  }
}

function desiredSummary(children) {
  const active = children
    .filter((child) => !child.archived)
    .sort((left, right) => left.order - right.order);
  const doing = active.find((child) => child.status === "doing");
  if (doing) return doing.text;
  return active.length === 1 ? active[0].text : "";
}

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok || payload?.code !== 0) {
    const code = payload?.code ?? response.status;
    const message = payload?.msg || payload?.message || response.statusText;
    throw new Error(`Feishu API returned code ${code}: ${message}`);
  }
  return payload;
}

const tokenPayload = await readJson(await fetch(`${API_BASE_URL}/auth/v3/tenant_access_token/internal`, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    app_id: process.env.FEISHU_APP_ID.trim(),
    app_secret: process.env.FEISHU_APP_SECRET.trim(),
  }),
}));
const tenantAccessToken = tokenPayload.tenant_access_token;
if (!tenantAccessToken) throw new Error("Feishu token response did not include tenant_access_token.");

const recordsUrl = `${API_BASE_URL}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`;
const headers = {
  Authorization: `Bearer ${tenantAccessToken}`,
  "Content-Type": "application/json; charset=utf-8",
};

async function listRecords() {
  const records = [];
  let pageToken = "";
  do {
    const url = new URL(`${recordsUrl}/search`);
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const payload = await readJson(await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ field_names: fieldNames }),
    }));
    if (Array.isArray(payload?.data?.items)) records.push(...payload.data.items);
    pageToken = payload?.data?.has_more === true && typeof payload?.data?.page_token === "string"
      ? payload.data.page_token
      : "";
  } while (pageToken);
  return records;
}

async function updateRecord(recordId, fields) {
  await readJson(await fetch(`${recordsUrl}/${encodeURIComponent(recordId)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ fields }),
  }));
}

async function deleteRecord(recordId) {
  await readJson(await fetch(`${recordsUrl}/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
    headers,
  }));
}

const before = await listRecords();
const rootsBySyncId = new Map();
const legacyChildren = [];

for (const record of before) {
  if (!isRecord(record) || !isRecord(record.fields)) continue;
  const recordId = normalizeText(record.record_id);
  const syncId = normalizeText(record.fields[syncIdFieldName]);
  const parentId = normalizeText(record.fields[parentIdFieldName]);
  if (!recordId) continue;
  if (parentId) {
    legacyChildren.push({ record, recordId, syncId: syncId || randomUUID(), parentId });
  } else if (syncId) {
    rootsBySyncId.set(syncId, { record, recordId });
  }
}

if (!legacyChildren.length) {
  let embeddedCount = 0;
  let parentCount = 0;
  for (const { record } of rootsBySyncId.values()) {
    const children = parseEmbedded(record.fields[subtaskDataFieldName]);
    if (!children.length) continue;
    embeddedCount += children.length;
    parentCount += 1;
    const expectedSummary = desiredSummary(children);
    const actualSummary = normalizeText(record.fields[subtaskStatusFieldName]);
    if (actualSummary !== expectedSummary) {
      throw new Error(
        `Parent ${normalizeText(record.fields[resultFieldName]) || normalizeText(record.record_id)} has an inconsistent ${subtaskStatusFieldName}.`,
      );
    }
  }
  process.stdout.write(
    `Verified ${embeddedCount} embedded subtasks across ${parentCount} parent rows; no physical subtask rows remain.\n`,
  );
  process.exit(0);
}

const groups = new Map();
for (const child of legacyChildren) {
  const parent = rootsBySyncId.get(child.parentId);
  if (!parent) throw new Error(`Subtask ${child.syncId} references missing parent ${child.parentId}.`);
  const group = groups.get(child.parentId) || { parent, children: [] };
  group.children.push(child);
  groups.set(child.parentId, group);
}

for (const group of groups.values()) {
  parseEmbedded(group.parent.record.fields[subtaskDataFieldName]);
  for (const child of group.children) {
    if (!normalizeText(child.record.fields[resultFieldName])) {
      throw new Error(`Subtask ${child.syncId} has no ${resultFieldName}.`);
    }
  }
}

if (checkOnly) {
  process.stdout.write(
    `Ready to migrate ${legacyChildren.length} physical subtask rows into ${groups.size} parent rows.\n`,
  );
  process.exit(0);
}

const expectedIdsByParentRecordId = new Map();
for (const [parentId, group] of groups) {
  const current = parseEmbedded(group.parent.record.fields[subtaskDataFieldName]);
  const mergedById = new Map(current.map((child) => [normalizeText(child.id), child]).filter(([id]) => id));
  for (const [index, child] of group.children.entries()) {
    const fields = child.record.fields;
    const text = normalizeText(fields[resultFieldName]);
    if (!text) throw new Error(`Subtask ${child.syncId} has no ${resultFieldName}.`);
    const childRemoteStatus = normalizeText(fields[childStatusFieldName])
      || normalizeText(fields[subtaskStatusFieldName])
      || normalizeText(fields[statusFieldName]);
    const status = fromRemoteStatus(childRemoteStatus);
    const blockedReason = normalizeText(fields[blockedReasonFieldName]);
    const updatedAt = normalizeRemoteTime(child.record.last_modified_time ?? child.record.updated_at)
      || new Date().toISOString();
    mergedById.set(child.syncId, {
      id: child.syncId,
      text,
      status,
      order: normalizeOrder(fields[orderFieldName], index),
      archived: normalizeBoolean(fields[archivedFieldName]),
      parentId,
      ...(status === "blocked" && blockedReason ? { blockedReason } : {}),
      createdAt: updatedAt,
      updatedAt,
      ...(status === "done" ? { completedAt: updatedAt } : {}),
    });
  }
  const merged = [...mergedById.values()]
    .filter((child) => normalizeText(child.id) && normalizeText(child.text))
    .sort((left, right) => normalizeOrder(left.order, 0) - normalizeOrder(right.order, 0));
  await updateRecord(group.parent.recordId, {
    [subtaskDataFieldName]: JSON.stringify(merged),
    [subtaskStatusFieldName]: desiredSummary(merged),
  });
  expectedIdsByParentRecordId.set(group.parent.recordId, new Set(group.children.map((child) => child.syncId)));
}

const afterWrite = await listRecords();
const afterWriteByRecordId = new Map(afterWrite
  .filter((record) => isRecord(record) && normalizeText(record.record_id))
  .map((record) => [normalizeText(record.record_id), record]));

for (const [parentRecordId, expectedIds] of expectedIdsByParentRecordId) {
  const parent = afterWriteByRecordId.get(parentRecordId);
  if (!parent || !isRecord(parent.fields)) throw new Error(`Parent record ${parentRecordId} disappeared during verification.`);
  const actualIds = new Set(parseEmbedded(parent.fields[subtaskDataFieldName]).map((child) => normalizeText(child.id)));
  for (const expectedId of expectedIds) {
    if (!actualIds.has(expectedId)) {
      throw new Error(`Subtask ${expectedId} was not verified inside parent ${parentRecordId}; no rows were deleted.`);
    }
  }
}

for (const child of legacyChildren) await deleteRecord(child.recordId);

const afterDelete = await listRecords();
const remainingRecordIds = new Set(afterDelete.map((record) => normalizeText(record?.record_id)));
const undeleted = legacyChildren.filter((child) => remainingRecordIds.has(child.recordId));
if (undeleted.length) throw new Error(`${undeleted.length} physical subtask rows still remain after deletion.`);

process.stdout.write(
  `Migrated and verified ${legacyChildren.length} subtasks into ${groups.size} parent rows; removed ${legacyChildren.length} duplicate physical rows.\n`,
);
