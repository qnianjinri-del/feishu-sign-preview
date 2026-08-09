# 贡献指南

感谢你愿意参与 FloatList。仓库采用统一 pnpm 工作区：`apps/desktop` 是 Tauri macOS 应用，`apps/gateway` 是飞书同步网关，`packages/contracts` 保存共享协议。

## 开发环境

- Node.js 22 或更高版本
- pnpm 11（整个工作区）
- Rust stable
- macOS 13.5 或更高版本（运行和打包桌面端）

## 安装与开发

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:gateway
# 另一个终端
pnpm dev:desktop
```

纯本地桌面开发无需配置飞书。网关开发者可复制 `.env.example`，然后运行 `pnpm doctor` 做只读诊断；实际创建多维表格字段仍需显式运行 `pnpm setup:bitable`。

## 提交前验证

```bash
pnpm verify
```

`verify` 会统一执行 TypeScript 检查、ESLint、覆盖率门禁、三个包的构建、高危依赖审计，以及 Rust fmt/check/test/clippy。只调试某一层时可使用 workspace filter：

```bash
pnpm --filter @floatlist/desktop test
pnpm --filter @floatlist/gateway test
pnpm --filter @floatlist/contracts test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

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
- 不要提交 `node_modules`、`dist`、`coverage`、`apps/desktop/src-tauri/target`、`.app` 或 `.dmg`。
- 新增业务行为时请同时增加自动化测试。
