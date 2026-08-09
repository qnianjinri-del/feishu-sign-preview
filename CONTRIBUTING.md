# 贡献指南

感谢你愿意参与 FloatList。仓库根目录是同步网关，`desktop/` 是 Tauri macOS 应用。

## 开发环境

- Node.js 20.19 或更高版本
- npm（同步网关）
- pnpm 11（桌面端）
- Rust stable
- macOS 13.5 或更高版本（运行和打包桌面端）

## 同步网关

```bash
npm install
cp .env.example .env
npm run dev
```

提交前运行（包含高危依赖检查）：

```bash
npm run check
npm test
npm run build
npm run audit
```

## 桌面端

```bash
cd desktop
pnpm install
pnpm tauri dev
```

提交前运行：

```bash
pnpm lint
pnpm test
pnpm build
pnpm audit
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

纯本地环境无需配置飞书。网关开发者可复制 `.env.example`，然后运行 `npm run doctor` 做只读诊断；实际创建多维表格字段仍需显式运行 `npm run setup:bitable`。

## 代码边界

- React 组件只通过 Zustand action 和服务层访问业务能力，不直接读写 Tauri Store。
- WebView 不直接请求飞书；用户配置的同步网关只由 Rust 原生层访问。
- 原生窗口、快捷键、托盘和 Keychain 行为应保持在现有 service/Rust 边界。
- Task ID 必须稳定；排序变更后归一化同级 `order`。
- 新行为同时添加 Vitest/RTL 或 Rust/Node 测试。

## Pull Request

- 从最新 `main` 创建短分支，保持提交主题清晰。
- PR 描述应说明用户影响、失败模式、数据迁移和已运行检查。
- 不要提交生成的 `.app`/`.dmg`；正式产物由 `macOS Release` workflow 构建。
- `v*` 标签会创建公开 Release。版本号必须先在桌面 package、Cargo 和 Tauri 配置中保持一致。

## 安全要求

- 不要提交 `.env`、App Secret、Client Token、签名证书或本机数据。
- 前端组件不得直接访问飞书开放平台；业务网络请求由 Rust 原生层访问用户主动配置的同步服务。
- 不要提交 `node_modules`、`dist`、`coverage`、`desktop/src-tauri/target`、`.app` 或 `.dmg`。
- 新增业务行为时请同时增加自动化测试。
