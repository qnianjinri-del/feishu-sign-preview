# FloatList

FloatList 是一款本地优先的 macOS 悬浮任务清单，也可以通过自托管网关把任务同步到飞书多维表格，并将唯一一个根任务“正在做”展示为飞书个性签名。

[![CI](https://github.com/qnianjinri-del/feishu-sign-preview/actions/workflows/ci.yml/badge.svg)](https://github.com/qnianjinri-del/feishu-sign-preview/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/qnianjinri-del/feishu-sign-preview?display_name=tag)](https://github.com/qnianjinri-del/feishu-sign-preview/releases/latest)

## 下载与开始使用

1. 从 [最新 Release](https://github.com/qnianjinri-del/feishu-sign-preview/releases/latest) 下载 `FloatList_0.2.0_aarch64.dmg`。
2. 将 FloatList 拖入“应用程序”并启动。
3. 首次向导中选择“仅本地使用”，或者连接已经部署好的同步网关。

当前安装包支持 Apple Silicon 和 macOS 13.5+。v0.2.0 使用 ad-hoc 签名、未经过 Apple 公证；首次打开若被 Gatekeeper 阻止，请在 Finder 中右键 FloatList 选择“打开”，或前往“系统设置 → 隐私与安全性”允许打开。下载后可使用 Release 中的 `SHA256SUMS` 校验文件完整性。

## 主要能力

- 透明、始终置顶、可缩放的轻量悬浮窗口，支持菜单栏和开机启动。
- 待办、正在做、受阻、已完成四态，一层子事项、卡点说明和完成进度。
- 根任务“正在做”全局唯一；子事项状态只描述推进步骤，不会重复进入签名。
- `⌘F` 统一搜索筛选，可查找隔天从悬浮框隐藏的已完成历史。
- `⌘⇧N` 可从任何应用唤起 FloatList 并直接新增任务。
- 本地防抖持久化、撤销/重做、拖拽排序、批量粘贴和 JSON 导入导出。
- 可选飞书同步：离线队列、ETag 增量读取、幂等重试和显式冲突选择。
- Client token 只存 macOS 钥匙串；桌面 WebView 不持有飞书 App Secret，也不直连飞书。

## 默认快捷键

| 快捷键 | 操作 |
| --- | --- |
| `⌘⇧N` | 全局唤起并新增任务 |
| `⌘⇧Space` | 全局显示/隐藏窗口 |
| `⌘⇧L` | 全局切换点击穿透 |
| `⌘F` | 搜索和筛选 |
| `⌘N` | 当前窗口新增任务 |
| `⌘Z` / `⌘⇧Z` | 撤销 / 重做 |
| `⌘,` | 打开设置 |

全局快捷键可以在设置中修改。点击穿透恢复快捷键注册失败时，应用会拒绝开启穿透，避免窗口无法操作。

## 可选的飞书同步

桌面端默认完全离线。需要同步时，先按照 [自托管指南](docs/SELF_HOSTING.md) 配置 Fastify 网关和飞书多维表格，再从 FloatList 的连接向导填写网关地址与独立 Client token。

仓库结构：

| 位置 | 作用 |
| --- | --- |
| 根目录 | Fastify 同步网关与飞书链接预览/个签服务 |
| [`desktop/`](desktop/) | Tauri 2、React、Zustand 实现的 macOS 应用 |

## 本地开发

```bash
# 同步网关
npm ci
cp .env.example .env
npm run doctor
npm run dev

# 桌面端（另一个终端）
cd desktop
pnpm install --frozen-lockfile
pnpm tauri dev
```

完整质量检查：

```bash
npm run check && npm test && npm run build && npm run audit
cd desktop
pnpm lint && pnpm test && pnpm build && pnpm audit
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## 文档

- [自托管飞书网关](docs/SELF_HOSTING.md)
- [常见问题与故障处理](docs/TROUBLESHOOTING.md)
- [桌面端开发与构建](desktop/README.md)
- [系统架构与安全边界](desktop/docs/ARCHITECTURE.md)
- [发布前手工验收](desktop/docs/MANUAL_ACCEPTANCE.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)

## 隐私与安全

FloatList 不包含账号体系、统计 SDK 或广告。请勿提交 `.env`、飞书 App Secret、Client token、本机数据、签名证书或构建产物。发现安全问题请按照 [SECURITY.md](SECURITY.md) 私下报告。

许可证：[MIT](LICENSE)
