# FloatList 架构

## 分层

FloatList 使用单窗口 React 前端和薄 Tauri Rust 宿主。React 负责展示与业务交互；Rust 处理必须由原生层拥有的菜单栏、关闭拦截、进程退出、损坏 Store 文件备份，以及可选同步的 HTTPS 与 macOS 钥匙串边界。

```text
React components
      ↓ actions / selectors
Zustand taskStore
      ↓ typed service calls
Persistence / Sync / Window / Shortcut / Tray / Autostart services
      ↓ Tauri IPC and plugins
Rust host + macOS Keychain / HTTPS
      ↓ optional authenticated API
FloatList Fastify gateway
      ↓ tenant_access_token
Feishu Bitable
```

## 状态管理

`src/stores/taskStore.ts` 保存：

- `tasks` 和 `settings`：唯一业务真相来源
- `historyPast` / `historyFuture`：最多 50 个内存任务快照，用于撤销/重做
- `shortcutStatus`：运行时注册结果，不持久化
- `sync`：服务端版本、持久化 mutation outbox 和上次成功时间
- `syncRuntime`：令牌可用性、连接状态、警告和待选择快照，不持久化
- `toast`：非阻塞反馈，不持久化

组件只调用 store action。事项状态使用 `todo / doing / blocked / done` 枚举；根事项最多一条 `doing`，它决定顶部当前任务与签名。子事项的 `doing` 只表示该父项内的当前推进步骤，不改变根事项或签名；同一父项内只保留一条 `doing` 子事项。`parentId` 只允许一层父子关系，`order` 在每个同级分组内独立归一化。父项只有在全部子项完成后才能完成；子项重新打开或新增子项会自动重开已完成父项。已完成根事项当天仍可见，跨本地日期后只从悬浮框过滤，Store 与飞书记录均不删除。

## 持久化

`src/services/persistence.ts` 是唯一 Store 插件入口：

1. 启动时读取 `floatlist.json` 的 `state` key。
2. `migratePersistedState` 把 v1/v2 数据升级为 v3，校验 schema、裁剪文本、修复重复根 doing 和同父项重复子 doing、孤立/过深层级、时间/同级顺序/设置并忽略无效事项。
3. 修改后在 220ms 防抖窗口结束时 `set + save`。
4. 菜单栏退出先发出 `quit-requested`，React flush 后调用 Rust `quit_app`。
5. Store 打开失败时调用 Rust `backup_corrupt_store` 保存原文件，再尝试以默认数据启动。

点击穿透不跨启动恢复，避免应用以不可交互状态启动。浏览器开发模式仅使用内存替身，不会误用 `localStorage`。

## 同步边界

飞书同步是显式启用的可选能力，并保持本地优先：

1. 任务 action 先提交本地状态和 220ms 防抖持久化。
2. `src/utils/sync.ts` 将前后快照转换为带稳定 `operationId` 的 mutation。
3. `src/services/syncCoordinator.ts` 串行发送最多 500 条 mutation，再以 `If-None-Match` 拉取权威快照。
4. 断网或 5xx 时保留 outbox；版本冲突或首次双边都有数据时进入 `attention`，不静默覆盖。
5. `src/services/bitableSync.ts` 只负责 Tauri IPC 与响应校验，不直接发浏览器网络请求。
6. `src-tauri/src/sync.rs` 通过 macOS Security Framework 访问当前默认钥匙串、校验服务地址，并使用禁止重定向、有限时和 1 MB 响应上限的 Rust HTTP 客户端。

生产地址必须使用 HTTPS；只有 `localhost`、`127.0.0.1` 和 `::1` 可使用 HTTP。URL 不允许携带用户名、密码、query 或 fragment。Client token 存在 macOS 钥匙串的 `com.floatlist.sync / client-token` 条目中；飞书 App ID、App Secret 和表格标识只存在同步网关环境变量中。

服务端以飞书多维表格为权威数据源，负责稳定 ID 回填、根事项唯一“在干”、父行当前子事项摘要、父行隐藏 JSON 中的完整子事项数据、父子约束、软归档、幂等键和单实例写入串行化。飞书主表只创建根事项物理行，子事项由同步层展开为普通 `Task`，因此不会在主表重复占行。桌面端从不直接访问飞书开放平台。

## 窗口层

窗口基础能力由 `tauri.conf.json` 声明：透明、无装饰、可缩放、始终置顶、跨 Space。`plugin-window-state` 负责位置/尺寸保存恢复；前端 `ensureWindowVisible` 会验证窗口是否至少有 80×60 像素仍落在任一当前显示器内，并修复最小尺寸或把窗口移到主屏右上安全区。

Rust 拦截主窗口 `CloseRequested` 并隐藏窗口，只有菜单和应用内“退出 FloatList”会结束进程。macOS 使用 Accessory activation policy 隐藏 Dock 图标。

## 快捷键和点击穿透安全

两个全局快捷键分别独立注册并记录结果。开启点击穿透前，store 会检查恢复快捷键是否注册成功；失败时显示 Toast 并拒绝开启。每次启动迁移都会强制 `clickThrough = false`，且窗口恢复阶段再次调用 `setIgnoreCursorEvents(false)`。

## 性能

- 输入只更新组件本地 state，按 Enter 后才写入 Zustand。
- Store 保存防抖，不在每次键盘输入时写磁盘。
- `TaskItem` 使用 `memo`，回调通过按需 selector 获取。
- dnd-kit 拖拽时保持原项占位并使用轻量 DragOverlay。
- 任务列表滚动容器独立，500 条数据不会扩张原生窗口。
