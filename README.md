# FloatList

FloatList 是一款本地优先的 macOS 悬浮任务清单：把当前工作放在桌面一角，用父子事项记录推进程度和卡点，并可通过自托管网关同步到飞书多维表格、展示唯一一个根任务“正在做”的个性签名。

[![CI](https://github.com/qnianjinri-del/feishu-sign-preview/actions/workflows/ci.yml/badge.svg)](https://github.com/qnianjinri-del/feishu-sign-preview/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/qnianjinri-del/feishu-sign-preview?display_name=tag)](https://github.com/qnianjinri-del/feishu-sign-preview/releases/latest)

## 下载

| Mac | 安装包 | 备用压缩包 |
| --- | --- | --- |
| Apple Silicon（M1–M4） | `FloatList_0.3.0_aarch64.dmg` | `FloatList_0.3.0_aarch64.app.zip` |
| Intel | `FloatList_0.3.0_x64.dmg` | `FloatList_0.3.0_x64.app.zip` |

前往 [最新 Release](https://github.com/qnianjinri-del/feishu-sign-preview/releases/latest) 下载，并用同页的 `SHA256SUMS` 校验。安装包支持 macOS 13.5+。

v0.3.0 使用 ad-hoc 签名、未使用 Apple Developer ID 且未公证。首次打开若被 Gatekeeper 阻止，请在 Finder 中右键 FloatList 选择“打开”，或前往“系统设置 → 隐私与安全性”允许打开。

## 三步开始

1. 下载与你的 Mac 架构匹配的 DMG，并将 FloatList 拖入“应用程序”。
2. 首次向导选择“仅本地使用”；如已有自托管网关，也可选择连接飞书。
3. 按 `⌘⇧N` 从任意应用唤起新增任务；在事项菜单中设置子事项、截止时间、优先级与系统提醒。

![FloatList 首次使用向导](docs/images/floatlist-main.png)

## 主要能力

- 父任务与一层子任务均支持待办、正在做、受阻、已完成、优先级、截止日期/时刻和原生系统提醒。
- 根任务“正在做”全局唯一；子任务状态只描述推进步骤，不会重复进入签名。
- 状态、日期、优先级和关键词组合筛选；“今天”会包含未完成的逾期事项。
- 已完成根任务隔天从当前清单隐藏，但仍可在“已完成”和“全部历史”找到。
- 提醒在 macOS 系统层调度，应用退出后仍可触发；拒绝权限不会丢失已设置时间。
- 本地防抖持久化、撤销/重做、拖拽排序、批量粘贴和 JSON 导入导出。
- 可选飞书同步：离线 outbox、ETag、幂等重试、显式冲突处理和 macOS 钥匙串令牌。

## 默认快捷键

| 快捷键 | 操作 |
| --- | --- |
| `⌘⇧N` | 全局唤起并新增任务 |
| `⌘⇧Space` | 全局显示/隐藏窗口 |
| `⌘⇧L` | 全局切换点击穿透 |
| `⌘F` | 搜索和组合筛选 |
| `⌘N` | 当前窗口新增任务 |
| `⌘Z` / `⌘⇧Z` | 撤销 / 重做 |
| `⌘,` | 打开设置 |

## 飞书同步

桌面端默认完全离线，不保存 App ID/App Secret，也不直连飞书开放平台。同步需要自行部署网关 2.0；升级时必须先升级网关，再安装 FloatList 0.3。详见[自托管指南](docs/SELF_HOSTING.md)。

## 工作区开发

仓库使用一个 pnpm 工作区和锁文件：

| 路径 | 内容 |
| --- | --- |
| `apps/desktop` | Tauri 2 + React 桌面端（0.3.0） |
| `apps/gateway` | Fastify 飞书同步与签名预览网关（2.0.0） |
| `packages/contracts` | 前后端共享的 Zod v2 协议 |

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:desktop
# 另一个终端：pnpm dev:gateway
pnpm verify
```

更多内容见[工作区开发说明](docs/WORKSPACE_DEVELOPMENT.md)和[贡献指南](CONTRIBUTING.md)。

## 文档

- [用户指南](docs/USER_GUIDE.md)
- [自托管飞书网关](docs/SELF_HOSTING.md)
- [同步协议 v2](docs/SYNC_PROTOCOL_V2.md)
- [故障处理](docs/TROUBLESHOOTING.md)
- [代码审计报告](docs/CODE_AUDIT.md)
- [发布前手工验收](apps/desktop/docs/MANUAL_ACCEPTANCE.md)
- [安全策略](SECURITY.md)

FloatList 不包含账号体系、统计 SDK、广告或无关网络请求。许可证：[MIT](LICENSE)。
