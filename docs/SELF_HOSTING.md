# 自托管 FloatList 飞书同步网关

同步网关负责保存飞书密钥、读写多维表格，并为桌面端提供经过 Client token 认证的任务 API。桌面端不会直接访问飞书开放平台。

## 1. 准备飞书应用与权限

创建企业自建应用并为其开通多维表格读写能力。当前实现需要能够读取、创建和更新多维表格记录及字段，例如 `bitable:app`；应用还必须被加入目标多维表格的“文档应用”并设置为可管理。

如需飞书个性签名链接预览，还要添加“链接预览”能力、订阅 `url.preview.get`、设置回调地址并发布应用版本。URL 规则需要匹配实际部署域名，例如 `sign.example.com/**`。

## 2. 配置多维表格

表格至少需要现有的任务名和任务状态字段。任务状态为单选，选项建议为 `待办 / 在干 / 受阻 / 已完成`。

```bash
cp .env.example .env
# 填写本机 .env 后先做只读检查
npm ci
npm run doctor
npm run setup:bitable:check
# 确认结果后再显式创建缺失字段
npm run setup:bitable
```

`doctor` 和 `setup:bitable:check` 不写入字段或记录，也不会打印密钥。`setup:bitable` 会幂等创建以下缺失字段：

| 默认字段 | 类型 | 用途 |
| --- | --- | --- |
| `任务名` | 单行文本 | 根事项正文 |
| `任务状态` | 单选 | 根事项四态和签名来源 |
| `子状态` | 单行文本 | 多子项时仅显示正在推进的子项 |
| `FloatList子事项数据` | 单行文本 | 父行中保存完整子事项 JSON，建议隐藏 |
| `FloatList同步ID` | 单行文本 | 跨端稳定 ID |
| `FloatList顺序` | 数字 | 同级排序 |
| `FloatList归档` | 复选框 | 软删除 |
| `FloatList父事项ID` | 单行文本 | 兼容迁移的一层父子关系 |
| `FloatList受阻原因` | 多行文本 | 当前卡点 |

旧版本若曾创建子事项物理行，先执行 `npm run migrate:subtasks -- --check`，确认后再执行 `npm run migrate:subtasks`。

## 3. 必要环境变量

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=请仅保存在服务端
BITABLE_APP_TOKEN=bascn_xxx
BITABLE_TABLE_ID=tbl_xxx
FLOATLIST_CLIENT_TOKEN=至少32字符的独立随机值
PUBLIC_BASE_URL=https://sign.example.com
```

Client token 不要复用 App Secret。完整可调参数和默认字段名见 [`.env.example`](../.env.example)。

## 4. 启动网关

开发模式：

```bash
npm run dev
curl http://127.0.0.1:3000/health/live
curl http://127.0.0.1:3000/health/ready
```

macOS 本机长期运行：

```bash
npm run install:sync-gateway
```

日志位于 `~/Library/Logs/FloatList/sync-gateway.log`。取消自动启动使用 `npm run uninstall:sync-gateway`。

Docker：

```bash
docker compose up --build -d
docker compose ps
```

非本机部署必须使用 HTTPS。桌面端拒绝远程 HTTP、带账号密码、query 或 fragment 的服务地址，并且不会跟随重定向。

## 5. 连接桌面端

1. 打开 FloatList 设置并点击“运行连接向导”。
2. 填写网关根地址，例如 `https://sync.example.com`。
3. 健康检查通过后填写同一个 `FLOATLIST_CLIENT_TOKEN`。
4. 首次两端都有数据时，选择“采用飞书”或“合并本地事项”。

Client token 只写入 macOS 钥匙串的 `com.floatlist.sync / client-token`，不会进入 JSON 导出或 FloatList Store。

## API 摘要

- `GET /health/live`：进程存活检查。
- `GET /health/ready`：同步配置状态，不需要认证。
- `GET /api/floatlist/v1/tasks`：权威任务快照，支持 ETag。
- `POST /api/floatlist/v1/mutations`：提交幂等任务变更，需要 `Idempotency-Key`。
- `GET /editor`：飞书签名链接编辑器。
- `POST /api/handler`：飞书链接预览回调。

任务快照版本只由正文、状态、顺序、父子关系和受阻原因决定；飞书记录 ID 或更新时间自动变化不会制造虚假冲突。
