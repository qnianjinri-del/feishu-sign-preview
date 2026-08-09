# 自托管 FloatList 飞书同步网关

网关 2.0 保存飞书密钥、读写多维表格，并向 FloatList 0.3 提供经过 Client token 认证的同步 API。桌面端不直连飞书。

> 升级顺序：先部署网关 2.0，再安装桌面端 0.3。旧 v1 API 会返回 HTTP 426，避免新旧协议混写。

## 1. 飞书应用

创建企业自建应用，开通多维表格读取、创建、更新和字段管理权限；应用还必须被加入目标多维表格的“文档应用”并设为可管理。如需个性签名链接预览，再添加链接预览能力、订阅 `url.preview.get` 并发布应用版本。

## 2. 安装与检查字段

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm doctor
pnpm setup:bitable:check  # 只读
pnpm setup:bitable        # 显式创建缺失字段
```

`doctor` 和 `setup:bitable:check` 不写飞书、不显示密钥。默认字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `任务名` | 单行文本 | 根任务正文 |
| `任务状态` | 单选 | 根任务四态和签名来源 |
| `子状态` | 单行文本 | 多子任务时仅显示正在做的子任务 |
| `FloatList子事项数据` | 单行文本 | 父行中的完整子任务 JSON |
| `FloatList同步ID` | 单行文本 | 稳定 ID |
| `FloatList顺序` | 数字 | 同级顺序 |
| `FloatList归档` | 复选框 | 软删除 |
| `FloatList父事项ID` | 单行文本 | 旧物理子行迁移兼容 |
| `FloatList受阻原因` | 多行文本 | 卡点 |
| `日期` | 日期（type 5） | 截止日期 |
| `FloatList截止时刻` | 单行文本 | `HH:mm` |
| `优先级` | 单选 | 高 / 中 / 低，空为无 |
| `FloatList提醒时间` | 日期时间 | ISO 提醒时间 |

根任务写可见列；子任务继续写在父行 JSON 中，不产生重复表格行。日期转换使用 `FLOATLIST_TIME_ZONE`（默认 `Asia/Shanghai`）。

旧版存在物理子行时：

```bash
pnpm --filter @floatlist/gateway migrate:subtasks -- --check
pnpm --filter @floatlist/gateway migrate:subtasks
```

## 3. 最小环境变量

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=仅服务端保存
BITABLE_APP_TOKEN=bascn_xxx
BITABLE_TABLE_ID=tbl_xxx
FLOATLIST_CLIENT_TOKEN=至少32字符的独立随机值
PUBLIC_BASE_URL=https://sign.example.com
FLOATLIST_TIME_ZONE=Asia/Shanghai
```

不要复用 App Secret 作为 Client token。完整配置见 [`.env.example`](../.env.example)。

## 4. 启动

```bash
pnpm dev:gateway
curl http://127.0.0.1:3000/health/live
curl http://127.0.0.1:3000/health/ready
```

Docker：

```bash
docker compose up --build -d
docker compose ps
```

非本机部署必须使用 HTTPS；桌面端拒绝远程 HTTP、凭据 URL、query、fragment 和重定向。

## 5. 连接桌面端

在设置中运行连接向导，输入网关根地址和同一个 `FLOATLIST_CLIENT_TOKEN`。令牌只进入 macOS 钥匙串 `com.floatlist.sync / client-token`，不会进入 Store 或 JSON 导出。

## 接口

- `GET /health/live`
- `GET /health/ready`：含 `gatewayVersion=2.0.0` 和 `syncApiVersion=2`
- `GET /api/floatlist/v2/tasks`
- `POST /api/floatlist/v2/mutations`
- `/api/floatlist/v1/*`：HTTP 426
- `GET /editor`、`POST /api/handler`：保持兼容

完整格式见[同步协议 v2](SYNC_PROTOCOL_V2.md)。
