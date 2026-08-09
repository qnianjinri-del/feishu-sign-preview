# FloatList 同步协议 v2

网关版本：2.0.0；最低桌面端：0.3.0。

## 探测

`GET /health/ready` 无需认证：

```json
{"status":"ok","syncConfigured":true,"gatewayVersion":"2.0.0","syncApiVersion":2}
```

## 认证与快照

`GET /api/floatlist/v2/tasks` 使用 `Authorization: Bearer <client-token>`，支持 `If-None-Match` 和 304。响应保持 `{version,tasks,warnings}`。

`version` 是稳定业务字段的 SHA-256 摘要：`id`、`text`、`status`、`priority`、`order`、`parentId`、`blockedReason`、`dueDate`、`dueTime`、`reminderAt`。远端记录 ID、更新时间、本地时间戳和派生子状态均不参与。

## Mutation

`POST /api/floatlist/v2/mutations` 需要 `Idempotency-Key`，body 含 `baseVersion?` 和 `operations`。操作类型：

- `create`：携带完整任务。
- `patch`：携带 `taskId` 和 `changes`。
- `reorder`：携带同一父级的 `{taskId,order}` 列表。
- `archive` / `restore`：软删除和恢复。

状态唯一性、父任务完成约束、提醒不晚于截止时间均由网关再次校验。版本不匹配返回 409 及最新快照；v1 返回 426。

## 升级与离线

v5 迁移会把 v0.2 outbox 的 `set_*`、`update_text`、`set_blocked` 和 `create_subtask` 转为 v2 mutation。部署必须先升级网关，避免客户端提交到旧协议。
