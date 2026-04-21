# 飞书个性签名 / 自定义链接预览服务

一个可私有部署的 Feishu / 飞书链接预览服务，用来复刻 `l.garyyang.work` 这类“图标 + 文本 + 点击跳转”的个性签名玩法，并在现有 `slot` 扩展位上接入飞书多维表格数据。

这版已经内置一个轻量自助编辑器：`/editor`。

- 你可以自己输入外显文案、图标 key、点击跳转地址
- 你可以切换到 `slot=current_task` 模式
- 如果没有设置 `u`，点击签名时会自动跳回设置页，方便继续修改

## 功能范围

- 基于飞书链接预览回调 `url.preview.get`
- 支持 `t`、`k`、`u` 三个核心参数
- 支持 `slot=current_task`
- 支持 `POST /api/handler` 飞书回调入口
- 支持 `GET /` 落地说明页
- 支持 `GET /editor` 自助设置页
- 支持 `GET /api/debug/preview` 本地调试预览载荷
- 支持 Docker / Docker Compose 私有部署

## 参数说明

- `t`：要展示的文字内容。未传或传空字符串时，回退为单个空格 `" "`
- `k`：飞书图片 `image_key`。未传时使用飞书默认链接图标
- `u`：点击跳转地址。未传或非法时，默认跳到 `/editor`
- `slot`：服务端动态槽位。当前仅实现 `slot=current_task`

优先级保持不变：

- `t` 优先
- `slot` 作为文案兜底

## 自助编辑器

打开：

```text
https://sign.example.com/editor
```

编辑器支持：

- 单链接模式：自己填写外显文案
- 当前任务模式：从多维表格读取“任务状态 = 在干”的第一条记录
- 图标 key 输入
- 点击跳转输入
- 一键填充“当前多维表格地址”作为跳转目标
- 实时预览和签名链接复制

推荐用法：

1. 打开 `/editor`
2. 填外显文案，或者切到“当前任务”模式
3. 如果希望点击后跳到多维表格，点“使用当前多维表格作为跳转”
4. 复制生成的签名链接
5. 粘贴到飞书签名

如果你留空 `u`：

- 飞书里点击签名时，会默认打开当前设置页
- 设置页会带上原来的参数，方便继续修改

## 示例链接

示例中的域名请替换为你自己的部署地址，例如 `https://sign.example.com`。

### 示例 1：纯文字

```text
https://sign.example.com/?t=你好呀~
```

### 示例 2：图片 + 文字

```text
https://sign.example.com/?k=img_v3_xxx&t=你好呀~
```

### 示例 3：图片 + 文字 + 跳转

```text
https://sign.example.com/?k=img_v3_xxx&t=你好呀~&u=https%3A%2F%2Fopen.feishu.cn
```

### 示例 4：读取当前任务

```text
https://sign.example.com/?slot=current_task
```

### 示例 5：当前任务 + 自定义跳转

```text
https://sign.example.com/?slot=current_task&u=https%3A%2F%2Fopen.feishu.cn
```

## 本地启动

1. 复制 `.env.example` 为 `.env`
2. 按需修改这些变量：

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
PUBLIC_BASE_URL=http://127.0.0.1:3000
DEFAULT_JUMP_URL=http://127.0.0.1:3000/
DEFAULT_HELP_PATH=/
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=cli_secret_xxx
FEISHU_VERIFICATION_TOKEN=your_verification_token
FEISHU_ENCRYPT_KEY=
BITABLE_APP_TOKEN=XLNaboeiCaFzN5sUtMfcVl9Mn8z
BITABLE_TABLE_ID=tbl9MppZ1OXYKapw
BITABLE_VIEW_ID=vewbgk85az
BITABLE_RESULT_FIELD_NAME=任务名
BITABLE_STATUS_FIELD_NAME=任务状态
BITABLE_TARGET_STATUS=在干
BITABLE_CACHE_TTL_SECONDS=60
BITABLE_REQUEST_TIMEOUT_MS=1500
MAX_TEXT_LENGTH=80
HANDLER_TIMEOUT_MS=1500
DEBUG_TIMEOUT_MS=2000
```

3. 安装依赖并启动：

```bash
npm install
npm run dev
```

4. 本地验证：

```bash
curl http://127.0.0.1:3000/
curl http://127.0.0.1:3000/editor
curl "http://127.0.0.1:3000/api/debug/preview?t=你好呀~&k=img_v3_xxx&u=https%3A%2F%2Fopen.feishu.cn"
curl "http://127.0.0.1:3000/api/debug/preview?slot=current_task"
```

## Docker 启动

### 默认启动

```bash
docker compose up --build -d
```

### 使用正式配置启动

推荐在项目根目录放置 `.env` 后再执行：

```bash
docker compose up --build -d
```

### 部署验证

1. 查看容器状态：

```bash
docker compose ps
```

2. 查看应用日志：

```bash
docker compose logs -f app
```

3. 检查首页：

```bash
curl http://127.0.0.1:3000/
```

4. 检查编辑器：

```bash
curl http://127.0.0.1:3000/editor
```

5. 检查调试接口：

```bash
curl "http://127.0.0.1:3000/api/debug/preview?t=你好呀~&k=img_v3_xxx&u=https%3A%2F%2Fopen.feishu.cn"
curl "http://127.0.0.1:3000/api/debug/preview?slot=current_task"
```

6. 停止服务：

```bash
docker compose down
```

## 飞书开放平台配置步骤

1. 在飞书开放平台创建企业自建应用
2. 在应用能力里添加“链接预览”
3. 配置 URL 规则
4. 配置事件回调地址
5. 订阅“拉取链接预览数据”
6. 发布正式版本
7. 将可用范围设置为“全部成员”

## 飞书开放平台权限

`slot=current_task` 依赖企业自建应用的 `tenant_access_token` 和多维表格读取能力。至少需要：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- 多维表格 / 记录读取相关权限

按当前联调结果，至少开通以下任意一组 scope：

- `bitable:app:readonly`
- `bitable:app`
- `base:record:retrieve`

如果授权失败，`slot=current_task` 会稳定回退为 `空闲中`，不会让回调崩掉。

## 如何配置链接预览 URL 规则

在“链接预览”能力里配置 URL 规则，规则要命中你实际发给用户的域名。例如：

```text
sign.example.com/**
```

注意：

- 必须和 `PUBLIC_BASE_URL` 使用同一个域名
- 域名变更后建议重新发布一次应用

## 如何配置 `/api/handler` 回调

在飞书应用后台的事件回调地址中填写：

```text
https://sign.example.com/api/handler
```

要求：

- 地址必须可被飞书服务端访问
- 建议使用 HTTPS
- 回调地址必须和实际部署环境一致

## 如何订阅“拉取链接预览数据”

在飞书后台订阅事件时，勾选“拉取链接预览数据”。

这个事件就是本项目处理的 `url.preview.get`。如果没有订阅，飞书不会请求你的 `/api/handler`。

## 为什么必须发布并设置全员可用

链接预览只会对应用可见范围内的成员生效。

如果应用没有发布，或者可用范围只开放给少量测试用户，就会出现：

- 你自己能看到预览，别人看不到
- 某些群里有效，某些群里无效
- 链接能点开，但不显示图标和文案

正式使用前请同时满足：

- 已发布正式版本
- 应用可用范围为全部成员

## 如何在飞书签名中验证效果

### 方式一：用编辑器生成

1. 打开 `https://sign.example.com/editor`
2. 输入外显文案、图标 key、跳转地址
3. 或切换到“当前任务”模式
4. 复制签名链接
5. 粘贴到飞书个人签名

### 方式二：直接手动拼链接

```text
https://sign.example.com/?k=img_v3_xxx&t=你好呀~&u=https%3A%2F%2Fopen.feishu.cn
```

或者：

```text
https://sign.example.com/?slot=current_task
```

预期结果：

- 签名显示图标和文案
- `slot=current_task` 会从多维表格中读取“任务状态 = 在干”的第一条记录
- 如果配置了 `u`，点击后跳到 `u`
- 如果没有配置 `u`，点击后默认回到 `/editor`

## 环境变量说明

### 基础变量

- `NODE_ENV`：运行环境
- `HOST`：监听地址
- `PORT`：监听端口
- `PUBLIC_BASE_URL`：外部访问基地址
- `DEFAULT_JUMP_URL`：兼容保留变量
- `DEFAULT_HELP_PATH`：帮助页路径
- `FEISHU_VERIFICATION_TOKEN`：飞书事件回调校验 token
- `FEISHU_ENCRYPT_KEY`：飞书事件回调加密 key
- `HANDLER_TIMEOUT_MS`：`/api/handler` 超时保护
- `DEBUG_TIMEOUT_MS`：`/api/debug/preview` 超时保护

### 多维表格变量

- `FEISHU_APP_ID`：企业自建应用 App ID
- `FEISHU_APP_SECRET`：企业自建应用 App Secret
- `BITABLE_APP_TOKEN`：多维表格 app token
- `BITABLE_TABLE_ID`：表 ID
- `BITABLE_VIEW_ID`：视图 ID
- `BITABLE_RESULT_FIELD_NAME`：结果字段名，默认 `任务名`
- `BITABLE_STATUS_FIELD_NAME`：状态字段名，默认 `任务状态`
- `BITABLE_TARGET_STATUS`：目标状态值，默认 `在干`
- `BITABLE_CACHE_TTL_SECONDS`：slot 缓存秒数，默认 `60`
- `BITABLE_REQUEST_TIMEOUT_MS`：飞书接口超时，默认 `1500`

## `slot=current_task` 的测试方式

### 本地调试

```bash
curl "http://127.0.0.1:3000/api/debug/preview?slot=current_task"
curl "http://127.0.0.1:3000/api/debug/preview?slot=current_task&u=https%3A%2F%2Fopen.feishu.cn"
curl "http://127.0.0.1:3000/api/debug/preview?t=手动文案&slot=current_task"
```

预期：

- `slot=current_task` 返回多维表格中的当前任务
- `slot=current_task&u=...` 只改变跳转，不改变文案来源
- `t=手动文案&slot=current_task` 时仍以 `t` 为准

### 线上调试

```text
https://feishu-sign-preview.onrender.com/?slot=current_task
https://feishu-sign-preview.onrender.com/?slot=current_task&u=https%3A%2F%2Fopen.feishu.cn
https://feishu-sign-preview.onrender.com/?t=手动文案&slot=current_task
```

## 接口

### `GET /`

服务说明页。

如果访问地址里带了合法 `u` 参数，例如 `/?u=https://open.feishu.cn`，服务会直接 302 跳转到该目标地址。

### `GET /editor`

自助设置页。

支持：

- 外显文案输入
- 图标 key 输入
- 点击跳转输入
- `current_task` 模式切换
- 当前多维表格快捷跳转
- 实时预览
- 签名链接复制

### `POST /api/handler`

飞书链接预览回调入口。

处理逻辑：

- 自动响应 `url_verification` challenge
- 校验 Verification Token
- 当配置了 `FEISHU_ENCRYPT_KEY` 时交给官方 SDK 验签 / 解密
- 解析原始链接中的 `t` / `k` / `u` / `slot`
- `slot=current_task` 时通过 `tenant_access_token + bitable records search` 拉取数据
- 超时或异常时返回稳定的降级预览

### `GET /api/debug/preview`

本地调试入口，不经过飞书即可查看最终返回载荷。

支持两种方式：

```text
/api/debug/preview?url=https%3A%2F%2Fsign.example.com%2F%3Fk%3Dimg_v3_xxx%26t%3Dhello
```

或者：

```text
/api/debug/preview?t=hello&k=img_v3_xxx&u=https%3A%2F%2Fopen.feishu.cn
/api/debug/preview?slot=current_task
```

## 图标制作建议

- 使用透明背景 PNG
- 图形尽量纯白，适配飞书签名样式
- 控制图片体积，避免加载慢
- GIF / APNG 桌面端可动，移动端通常只显示首帧

## 常见错误排查

### 回调未生效

- 检查飞书后台是否真的订阅了“拉取链接预览数据”
- 检查回调地址是否填写成 `/api/handler`
- 检查服务是否可以从公网访问
- 检查应用是否已经发布

### 预览不显示

- 检查链接是否命中你注册的 URL 规则
- 检查应用可用范围是否为全部成员
- 检查签名里粘贴的是完整链接
- 查看 `docker compose logs -f app` 或本地日志，确认是否收到 `url.preview.get`

### 跳转异常

- 检查 `u` 是否是完整的 `http` 或 `https` 地址
- `javascript:`、内网地址、`localhost` 会被主动拦截
- 如果没有配置 `u`，现在会默认跳到 `/editor`

### 参数为空

- `t=` 为空时会被当作未传，最终显示单个空格
- `k=` 为空时回退到默认链接图标
- `u=` 为空时默认跳到设置页

### 图片不显示

- 检查 `k` 是否是有效的飞书 `image_key`
- 建议使用透明背景、纯白主体
- GIF / APNG 在移动端通常只显示首帧

### `slot=current_task` 一直显示“空闲中”

- 检查 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 是否正确
- 检查应用是否已开通 `bitable:app:readonly`、`bitable:app` 或 `base:record:retrieve`
- 检查 `BITABLE_APP_TOKEN`、`BITABLE_TABLE_ID`、`BITABLE_VIEW_ID` 是否与目标表一致
- 检查字段名是否与表头完全一致：`任务名`、`任务状态`
- 检查视图内是否确实存在一条 `任务状态 = 在干` 的记录

## 测试

运行自动化测试：

```bash
npm test
```

当前覆盖包括：

- `t/k/u` 参数解析
- 空参数默认空格
- 非法 `u` 回退到设置页
- `url_verification` challenge 返回
- 根路径合法跳转
- `/editor` 页面返回
- `t` 对 `slot` 的优先级
- `BitableDataProvider` 命中记录
- `BitableDataProvider` 无匹配返回
- `BitableDataProvider` 异常回退
- `BitableDataProvider` 缓存命中

## 目录结构

```text
.
├── src
│   ├── app.ts
│   ├── config.ts
│   ├── routes
│   │   ├── debug.ts
│   │   ├── editor.ts
│   │   ├── handler.ts
│   │   └── index.ts
│   ├── services
│   │   ├── bitable-data-provider.ts
│   │   ├── data-provider.ts
│   │   ├── icon-service.ts
│   │   ├── preview-service.ts
│   │   ├── slot-service.ts
│   │   └── variable-service.ts
│   ├── lib
│   │   ├── async.ts
│   │   ├── feishu.ts
│   │   ├── logger.ts
│   │   └── url.ts
│   ├── types
│   │   └── index.ts
│   └── utils
│       ├── text.ts
│       └── validation.ts
├── test
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```
