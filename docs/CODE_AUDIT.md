# FloatList v0.3.0 代码审计报告

审计范围：桌面端、Rust 原生层、飞书网关、共享协议、容器、CI 与发布流程。

## 已落实

- 单一 pnpm 工作区和锁文件，Node 22；协议 schema 由 `@floatlist/contracts` 单点维护。
- 同步 API v2、v1 426、旧 outbox 自动转换、稳定字段摘要和幂等创建回归测试。
- 飞书日期 type 5、IANA 时区、优先级与提醒字段；子任务继续嵌入父行。
- macOS 通知权限、系统调度、完成/删除/修改重建；令牌只存 Keychain。
- Docker 以非 root `node` 用户运行；CI 含覆盖率、Rust、Docker 健康检查、审计和历史密钥扫描。
- 发布工作流构建 Apple Silicon 和 Intel 的 ad-hoc 签名 DMG、APP ZIP 与 SHA-256 清单。

## 质量门禁

- TypeScript 5.9，避免 Zod 4、dotenv 17、TypeScript 7 的不兼容迁移。
- Vitest/c8：语句、函数、行 ≥80%，分支 ≥70%。
- `cargo fmt`、`cargo check`、`cargo test`、`cargo clippy -D warnings`。
- `pnpm audit --audit-level=high`；依赖覆盖固定已知高危传递依赖。

## 明确保留风险

- 发布包未使用 Developer ID、未公证，首次启动可能触发 Gatekeeper。
- v0.3 桌面端与 2.0 网关为协同升级，不支持 v1 混用。
- 本期不含自动更新、循环任务、多清单和 Windows/Linux。
