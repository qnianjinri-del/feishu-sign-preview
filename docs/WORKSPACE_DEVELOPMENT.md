# 工作区开发

## 要求

- Node.js 22+
- pnpm 11.9（通过 Corepack）
- Rust stable，含 `rustfmt`、`clippy`
- macOS 13.5+（构建桌面安装包）

## 命令

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:gateway
pnpm dev:desktop
pnpm doctor
pnpm verify
```

`pnpm verify` 统一执行 TypeScript 检查、ESLint、覆盖率门禁、三包构建、高危依赖审计、Rust fmt/check/test/clippy。覆盖率要求语句/函数/行 80%，分支 70%。

工作区依赖只通过根 `pnpm-lock.yaml` 管理。不要在子目录生成锁文件。共享同步结构放在 `packages/contracts`，前后端不得复制 schema。

## 目录边界

- React 不直连飞书；网络访问经 Tauri Rust 命令。
- UI 不直接访问 Tauri Store；持久化经 `services/persistence.ts`。
- Zustand 的任务、设置、同步接口分属 `stores/slices`，业务规则优先放纯函数。
- 网关 `/`、`/editor`、回调和预览 URL 保持兼容。
