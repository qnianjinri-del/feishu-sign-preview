# 安全说明

## 凭据

飞书 App ID、App Secret、多维表格标识和同步 Client Token 只能放在本机或部署环境的 `.env` 中。仓库只提供不含真实值的 `.env.example`。

桌面端不会保存飞书 App Secret；同步 Client Token 通过 macOS 钥匙串保存，不进入 JSON 导出或 Tauri Store。

如果你发现仓库中存在真实凭据，请立即撤销或轮换该凭据，并通过 GitHub Security Advisory 私下报告，不要创建包含凭据的公开 Issue。

## 网络边界

桌面 WebView 不直接访问飞书开放平台。正式同步服务必须使用 HTTPS；只有 `localhost`、`127.0.0.1` 和 `::1` 可使用 HTTP。
