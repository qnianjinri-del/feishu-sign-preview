# FloatList 故障处理

## `Connection refused`

默认地址 `http://127.0.0.1:3000` 要求本机网关正在运行：

```bash
curl http://127.0.0.1:3000/health/ready
pnpm doctor
```

只用本地清单时关闭同步即可，不会产生网络请求。

## 网关版本不兼容或 HTTP 426

FloatList 0.3 只使用同步 API v2，必须搭配网关 2.0。先升级网关并确认 `/health/ready` 返回 `syncApiVersion: 2`，再安装桌面端。

## 向导提示网关未配置

`syncConfigured=false` 表示飞书凭据、表格标识或 `FLOATLIST_CLIENT_TOKEN` 缺失。补齐服务端 `.env` 并重启；桌面端只填写 Client token。

## 提醒未授权或没有弹出

提醒时间仍会保存。前往“系统设置 → 通知 → FloatList”允许通知，再在 FloatList“设置 → 系统提醒”点击“重新检查”或“发送测试通知”。完成、删除或修改任务会取消并重建对应的待触发提醒；过去时间不会补发。

## 截止日期相差一天

确认网关 `FLOATLIST_TIME_ZONE` 与团队使用时区一致，例如 `Asia/Shanghai`。重新启动网关并运行 `pnpm doctor`。飞书日期字段必须是 type 5，截止时刻必须是文本字段。

## 无人改飞书却提示冲突

确认桌面端为 0.3、网关为 2.0。v2 摘要只包含稳定业务字段，不包含飞书记录 ID、更新时间或本地派生字段；正文、状态、顺序、父子关系、卡点、优先级和日期提醒的真实变化仍会触发冲突。

## 子任务出现在签名或重复成行

签名只读取根任务。子任务存于父行 JSON，多子任务时“子状态”仅显示正在做的一项。旧物理子行请先运行迁移检查：

```bash
pnpm --filter @floatlist/gateway migrate:subtasks -- --check
```

## 应用无法打开

v0.3.0 为 ad-hoc 签名且未公证。在 Finder 右键 FloatList 选择“打开”，或在“系统设置 → 隐私与安全性”允许。请只从本仓库 Release 下载并校验 `SHA256SUMS`。

## 快捷键无响应

设置页会显示占用或注册失败。选择互不重复的组合。穿透恢复快捷键不可用时，FloatList 会拒绝开启点击穿透。

## Store 损坏

应用会备份为 `floatlist.corrupt-<timestamp>.json` 后使用默认清单。可从先前导出的 JSON 恢复。
