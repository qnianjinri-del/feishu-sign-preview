import "./load-env.mjs";

const API_BASE_URL = "https://open.feishu.cn/open-apis";
const checkOnly = process.argv.includes("--check");
let validationFailed = false;

const requiredEnvironment = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "BITABLE_APP_TOKEN",
  "BITABLE_TABLE_ID",
];

for (const name of requiredEnvironment) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required.`);
  }
}

const appToken = process.env.BITABLE_APP_TOKEN.trim();
const tableId = process.env.BITABLE_TABLE_ID.trim();

const fieldDefinitions = [
  { name: process.env.BITABLE_SUBTASK_STATUS_FIELD_NAME || "子状态", type: 1 },
  { name: process.env.BITABLE_CHILD_STATUS_FIELD_NAME || "FloatList子事项状态", type: 1 },
  { name: process.env.BITABLE_SUBTASK_DATA_FIELD_NAME || "FloatList子事项数据", type: 1 },
  { name: process.env.BITABLE_SYNC_ID_FIELD_NAME || "FloatList同步ID", type: 1 },
  { name: process.env.BITABLE_ORDER_FIELD_NAME || "FloatList顺序", type: 2 },
  { name: process.env.BITABLE_ARCHIVED_FIELD_NAME || "FloatList归档", type: 7 },
  { name: process.env.BITABLE_PARENT_ID_FIELD_NAME || "FloatList父事项ID", type: 1 },
  { name: process.env.BITABLE_BLOCKED_REASON_FIELD_NAME || "FloatList受阻原因", type: 1 },
  {
    name: process.env.BITABLE_DUE_DATE_FIELD_NAME || "日期",
    type: 5,
    property: { date_formatter: "yyyy/MM/dd", auto_fill: false },
  },
  { name: process.env.BITABLE_DUE_TIME_FIELD_NAME || "FloatList截止时刻", type: 1 },
  {
    name: process.env.BITABLE_PRIORITY_FIELD_NAME || "优先级",
    type: 3,
    property: { options: [{ name: "高" }, { name: "中" }, { name: "低" }] },
  },
  {
    name: process.env.BITABLE_REMINDER_AT_FIELD_NAME || "FloatList提醒时间",
    type: 5,
    property: { date_formatter: "yyyy-MM-dd HH:mm", auto_fill: false },
  },
];

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok || payload?.code !== 0) {
    const code = payload?.code ?? response.status;
    const message = payload?.msg || payload?.message || response.statusText;
    throw new Error(`Feishu API returned code ${code}: ${message}`);
  }
  return payload;
}

const tokenResponse = await fetch(`${API_BASE_URL}/auth/v3/tenant_access_token/internal`, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    app_id: process.env.FEISHU_APP_ID.trim(),
    app_secret: process.env.FEISHU_APP_SECRET.trim(),
  }),
});
const tokenPayload = await readJson(tokenResponse);
const tenantAccessToken = tokenPayload.tenant_access_token;
if (!tenantAccessToken) throw new Error("Feishu token response did not include tenant_access_token.");

const fieldsUrl = `${API_BASE_URL}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`;
const headers = {
  Authorization: `Bearer ${tenantAccessToken}`,
  "Content-Type": "application/json; charset=utf-8",
};

const listPayload = await readJson(await fetch(`${fieldsUrl}?page_size=100`, { headers }));
const currentFields = Array.isArray(listPayload?.data?.items) ? listPayload.data.items : [];

const expectedStatuses = ["待办", process.env.BITABLE_TARGET_STATUS || "在干", "受阻", "已完成"];
const statusFieldName = process.env.BITABLE_STATUS_FIELD_NAME || "任务状态";
const statusField = currentFields.find((field) => field?.field_name === statusFieldName);
if (!statusField) throw new Error(`Required status field ${statusFieldName} was not found.`);
if (statusField.type !== 3) {
  throw new Error(`Status field ${statusFieldName} must be a single-select field (type 3).`);
}
const statusOptions = Array.isArray(statusField?.property?.options)
  ? statusField.property.options.map((option) => option?.name).filter(Boolean)
  : [];
const missingStatuses = expectedStatuses.filter((status) => !statusOptions.includes(status));
if (missingStatuses.length) {
  process.stdout.write(`${statusFieldName} options still needed: ${missingStatuses.join(" / ")}\n`);
  if (checkOnly) {
    validationFailed = true;
  } else {
    await readJson(await fetch(`${fieldsUrl}/${encodeURIComponent(statusField.field_id)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        field_name: statusFieldName,
        type: 3,
        property: {
          options: [
            ...statusOptions.map((name) => ({ name })),
            ...missingStatuses.map((name) => ({ name })),
          ],
        },
      }),
    }));
    process.stdout.write(`${statusFieldName} options: updated\n`);
  }
} else {
  process.stdout.write(`${statusFieldName} options: ready\n`);
}

for (const definition of fieldDefinitions) {
  const existing = currentFields.find((field) => field?.field_name === definition.name);
  if (existing) {
    if (existing.type !== definition.type) {
      throw new Error(
        `Field ${definition.name} already exists with type ${existing.type}; expected ${definition.type}.`,
      );
    }
    if (definition.type === 3 && definition.property?.options) {
      const optionNames = Array.isArray(existing.property?.options)
        ? existing.property.options.map((option) => option?.name).filter(Boolean)
        : [];
      const missing = definition.property.options.filter((option) => !optionNames.includes(option.name));
      if (missing.length) {
        if (checkOnly) {
          process.stdout.write(`missing options: ${definition.name} -> ${missing.map((option) => option.name).join(" / ")}\n`);
          validationFailed = true;
        } else {
          await readJson(await fetch(`${fieldsUrl}/${encodeURIComponent(existing.field_id)}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              field_name: definition.name,
              type: definition.type,
              property: { options: [...optionNames.map((name) => ({ name })), ...missing] },
            }),
          }));
          process.stdout.write(`updated options: ${definition.name}\n`);
        }
      }
    }
    process.stdout.write(`kept: ${definition.name}\n`);
    continue;
  }

  if (checkOnly) {
    process.stdout.write(`missing: ${definition.name}\n`);
    validationFailed = true;
    continue;
  }

  try {
    await readJson(
      await fetch(fieldsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          field_name: definition.name,
          type: definition.type,
          ...(definition.property ? { property: definition.property } : {}),
        }),
      }),
    );
  } catch (error) {
    throw new Error(`Could not create field ${definition.name}.`, { cause: error });
  }
  process.stdout.write(`created: ${definition.name}\n`);
}

if (validationFailed) process.exitCode = 1;
