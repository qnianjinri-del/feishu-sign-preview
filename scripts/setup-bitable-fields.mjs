import "dotenv/config";

const API_BASE_URL = "https://open.feishu.cn/open-apis";
const checkOnly = process.argv.includes("--check");

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
    process.stdout.write(`kept: ${definition.name}\n`);
    continue;
  }

  if (checkOnly) {
    process.stdout.write(`missing: ${definition.name}\n`);
    continue;
  }

  try {
    await readJson(
      await fetch(fieldsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ field_name: definition.name, type: definition.type }),
      }),
    );
  } catch (error) {
    throw new Error(`Could not create field ${definition.name}.`, { cause: error });
  }
  process.stdout.write(`created: ${definition.name}\n`);
}
