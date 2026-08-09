# FloatList 故障处理

## 设置中显示 `Connection refused`

桌面应用默认连接 `http://127.0.0.1:3000`，这要求同步网关正在同一台 Mac 上运行。执行：

```bash
curl http://127.0.0.1:3000/health/ready
npm run doctor
```

若需要网关登录后自动启动，运行 `npm run install:sync-gateway`。只用本地清单时可以直接关闭同步。

## 向导提示网关未配置

`/health/ready` 可访问但 `syncConfigured=false`，说明 App ID、App Secret、表格标识或 `FLOATLIST_CLIENT_TOKEN` 至少有一项缺失。补齐服务端 `.env` 并重启网关；不要把这些值填进桌面应用，桌面端只需要独立 Client token。

## 提示同步令牌无效

确认桌面端填写的值与网关的 `FLOATLIST_CLIENT_TOKEN` 完全一致且长度为 32–512 字符。可在设置的高级同步区域移除钥匙串令牌，再重新运行连接向导。

## 无人修改飞书却出现冲突

升级桌面应用和网关到 v0.2.0 对应版本。旧版会把飞书自动回填的记录时间计入 ETag；新版只使用任务业务字段计算版本。真实的双端修改仍会要求选择，避免静默覆盖。

## 子事项“正在做”出现在签名或根状态

最新版只允许根事项状态驱动签名。子事项会保存在父行隐藏 JSON 中，多子项时父行“子状态”只显示正在做的子项。旧表格存在子事项物理行时，先运行：

```bash
npm run migrate:subtasks -- --check
npm run migrate:subtasks
```

## 下载的应用无法打开

v0.2.0 为 ad-hoc 签名、未公证版本。在 Finder 中右键 FloatList 选择“打开”，或前往“系统设置 → 隐私与安全性”允许打开。只从本仓库 Release 下载，并用 `SHA256SUMS` 校验。

## 快捷键没有反应

系统保留组合或其他应用占用时，设置页会显示注册失败。为三项全局操作选择互不重复的组合。若穿透恢复快捷键不可用，FloatList 会主动阻止开启点击穿透。

## 数据文件损坏

应用会把无法解析的 Store 重命名为 `floatlist.corrupt-<timestamp>.json` 后使用默认清单启动。可以从最近导出的 FloatList JSON 恢复；导入会替换当前清单，请先备份。
