# 贡献指南

感谢你愿意参与 FloatList 任务模式个签助手。

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

提交前运行：

```bash
npm run check
npm test
npm run build
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
cargo check --manifest-path src-tauri/Cargo.toml
```

## 安全要求

- 不要提交 `.env`、App Secret、Client Token、签名证书或本机数据。
- 前端组件不得直接访问飞书开放平台；业务网络请求由 Rust 原生层访问用户主动配置的同步服务。
- 不要提交 `node_modules`、`dist`、`coverage`、`desktop/src-tauri/target`、`.app` 或 `.dmg`。
- 新增业务行为时请同时增加自动化测试。
