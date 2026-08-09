# FloatList（悬浮清单）

FloatList 是一款面向 macOS 的本地优先桌面悬浮工作清单。窗口透明、无边框并可始终置顶；默认不联网，也可选择通过自托管同步网关与飞书多维表格双向同步。不包含账号系统或统计 SDK。

## 功能

- 透明毛玻璃悬浮窗口，无系统标题栏，可拖动和缩放
- 任务添加、批量粘贴、编辑、删除、四态切换和拖拽排序
- `待办 / 正在做 / 受阻 / 已完成` 四态；根事项“正在做”唯一，子事项在各自父项内记录推进状态
- 一层子事项、父项完成进度、受阻原因和父子级联删除/撤销
- 已完成根事项当天仍显示，跨到下一天后自动从悬浮框隐藏；飞书历史记录不删除
- `⌘F` 统一搜索筛选当前任务、四态和全部历史，筛选时自动禁用拖拽排序
- 任务右键菜单与可见的“更多”菜单，可快速标记正在做
- 删除/完成等任务操作的撤销与重做
- 标题、透明度、主题、紧凑模式和已完成任务显示设置
- Tauri Store 自动保存，应用重启后恢复任务和设置
- Window State 保存窗口尺寸和位置，显示器变化后自动回到安全区域
- macOS 菜单栏入口、关闭窗口时仅隐藏、全局显示/隐藏快捷键
- 首次使用向导，以及从任意应用唤起并聚焦新增区的全局快捷键
- 点击穿透、开机启动、自定义全局快捷键、JSON 导入/导出
- 可选的飞书多维表格同步：本地乐观更新、离线队列、ETag 增量检查和冲突选择
- 飞书主表只保留父/根事项行；子事项内嵌在父行隐藏字段中，父行“子状态”显示当前推进项
- 同步令牌只保存在 macOS 钥匙串；飞书 App Secret 只存在于服务端
- 深色、浅色和跟随系统主题，支持“减少动态效果”

## 环境要求

- macOS 13.5 或以上，Apple Silicon
- Node.js 20.19+（推荐 22 或 24）
- pnpm 11+
- Rust stable
- Xcode Command Line Tools；发布签名/公证需要完整 Xcode 和 Apple Developer 身份

## 开发

```bash
pnpm install
pnpm tauri dev
```

仅调试 React 界面可运行 `pnpm dev`。浏览器模式使用内存存储，只有 Tauri 模式会使用正式本地 Store 和原生窗口 API。

## 检查与测试

```bash
pnpm lint
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

测试覆盖事项增删改、父子层级、四态切换、搜索历史、快速新增、首次向导、受阻原因、根事项唯一正在做、子状态推进、父项完成约束、撤销、排序、隐藏已完成、同步 mutation/outbox、远端快照与冲突、hydrate、v1–v3 → v4 迁移修复，以及关键 UI 键盘交互。

## 构建 `.app` 和 `.dmg`

```bash
pnpm tauri build
```

默认配置同时构建 `app` 和 `dmg`，产物位于：

```text
src-tauri/target/release/bundle/macos/FloatList.app
src-tauri/target/release/bundle/dmg/FloatList_0.2.0_aarch64.dmg
```

本地未签名构建首次打开时可能受 Gatekeeper 限制。对外分发前请配置 Developer ID Application 证书并执行 Apple 公证；签名凭据不应提交到仓库。

## 默认快捷键

| 快捷键 | 操作 |
| --- | --- |
| `⌘⇧Space` | 全局显示/隐藏窗口 |
| `⌘⇧L` | 全局切换点击穿透 |
| `⌘N` | 新建任务 |
| `⌘⇧N` | 全局唤起并聚焦添加区，可粘贴多行 |
| `⌘F` | 搜索和筛选任务历史 |
| `⌘Z` / `⌘⇧Z` | 撤销 / 重做 |
| `⌘,` | 设置 |
| `Enter` / `F2` | 编辑当前聚焦任务 |
| `Delete` / `Backspace` | 删除明确聚焦的任务行 |
| `⇧F10` / 菜单键 | 打开当前任务操作菜单 |

快捷键可在设置中修改。若点击穿透快捷键注册失败，应用会禁止开启点击穿透，避免窗口无法恢复操作。

## 本地数据与飞书同步

正式数据由 `@tauri-apps/plugin-store` 写入应用数据目录中的 `floatlist.json`。当前 schema 为 v4；旧版 `completed` 布尔值会在加载时迁移为新状态且保留原任务 ID。v4 增加首次向导状态和快速新增快捷键；既有用户升级时不会被强制打断。迁移仍会修复孤立或过深的层级。保存使用 220ms 防抖，正常退出前会主动 flush。无法解析的 Store 文件会先重命名为 `floatlist.corrupt-<timestamp>.json`，再以默认数据启动。

同步默认关闭。启用时，前端只通过 Tauri IPC 调用 Rust 原生客户端，Rust 再访问用户填写的 FloatList 同步服务；WebView 不直接访问飞书，也不持有飞书 App Secret。Client token 只写入 macOS 钥匙串，不进入 JSON 导出、Tauri Store 或前端持久化状态。

首次连接且本地、飞书两边都有事项时，应用不会自动覆盖任何一边，而是要求选择“采用飞书”或“合并本地事项”。断网时本地操作继续可用，变更进入持久化 outbox，恢复连接后按顺序重试。服务端部署和环境变量参见 [仓库根目录 README](../README.md)。

如果同步服务运行在本机 `127.0.0.1:3000`，建议在服务端目录执行 `npm run install:sync-gateway` 安装 macOS 登录启动项。FloatList 自身的“开机启动”只负责启动桌面应用，不会自动启动 Node 同步网关；网关安装脚本会把进程异常退出后的自动拉起和日志记录交给 macOS LaunchAgent。

## 已知限制

- 全屏应用上方能否显示受 macOS Space 和全屏窗口策略限制，不使用私有高风险层级 hack。
- 多显示器安全恢复以窗口至少有 80×60 像素位于任一当前屏幕为准；复杂的显示器热插拔动画期间可能在下一次启动时才完成修正。
- 自定义快捷键使用 Tauri 支持的加号组合格式，例如 `Command+Shift+L`；系统保留或被其他应用占用的组合会注册失败。
- JSON 导出使用 WebView 下载能力；导入会迁移并修复字段，但不合并数据，而是替换当前清单。
- 本地默认同步地址 `http://127.0.0.1:3000` 仅用于开发；非本机地址必须使用 HTTPS。
- 同步网关需要独立运行或私有部署。FloatList 不会在桌面包内启动 Node.js 服务。
- 未签名/未公证的本机构建不适合直接对外分发。

架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，手工验收步骤见 [docs/MANUAL_ACCEPTANCE.md](docs/MANUAL_ACCEPTANCE.md)。
