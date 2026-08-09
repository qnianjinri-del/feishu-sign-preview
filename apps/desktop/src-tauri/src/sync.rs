use std::{error::Error, time::Duration};

use reqwest::{
    header::{AUTHORIZATION, CONTENT_TYPE, ETAG, IF_NONE_MATCH},
    redirect::Policy,
    Client, Method, Url,
};
use security_framework::os::macos::keychain::SecKeychain;
use security_framework::os::macos::passwords::find_generic_password;
use serde::Serialize;
use serde_json::Value;

const KEYCHAIN_SERVICE: &str = "com.floatlist.sync";
const KEYCHAIN_ACCOUNT: &str = "client-token";
const MAX_RESPONSE_BYTES: usize = 1_048_576;
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25_300;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncHttpResponse {
    status: u16,
    etag: Option<String>,
    body: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProbeResult {
    status: u16,
    sync_configured: bool,
    gateway_version: String,
    sync_api_version: u64,
}

fn default_keychain() -> Result<SecKeychain, String> {
    SecKeychain::default().map_err(|error| format!("无法打开 macOS 默认钥匙串：{error}"))
}

fn find_client_token() -> Result<Option<String>, String> {
    match find_generic_password(None, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
        Ok((password, _)) => String::from_utf8(password.to_owned())
            .map(Some)
            .map_err(|_| "macOS 钥匙串中的同步令牌不是有效文本".to_string()),
        Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(None),
        Err(error) => Err(format!("无法读取 macOS 钥匙串：{error}")),
    }
}

fn validate_service_url(value: &str) -> Result<Url, String> {
    let clean = value.trim();
    let mut url = Url::parse(clean).map_err(|_| "同步服务地址无效".to_string())?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("同步服务地址不能包含账号、查询参数或片段".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "同步服务地址缺少主机名".to_string())?;
    let local_http = url.scheme() == "http" && matches!(host, "127.0.0.1" | "localhost" | "::1");
    if url.scheme() != "https" && !local_http {
        return Err("同步服务必须使用 HTTPS；本机开发仅允许 localhost".to_string());
    }
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path().trim_end_matches('/'));
        url.set_path(&path);
    }
    Ok(url)
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| format!("无法初始化同步网络客户端：{error}"))
}

fn error_chain(error: &dyn Error) -> String {
    let mut messages = vec![error.to_string()];
    let mut source = error.source();
    while let Some(current) = source {
        let message = current.to_string();
        if messages.last() != Some(&message) {
            messages.push(message);
        }
        source = current.source();
    }
    messages.join(": ")
}

fn read_client_token() -> Result<String, String> {
    match find_client_token()? {
        Some(token) if !token.trim().is_empty() => Ok(token),
        _ => Err("尚未保存同步令牌".to_string()),
    }
}

fn parse_probe_result(status: u16, body: &Value) -> Result<SyncProbeResult, String> {
    if body.get("status").and_then(Value::as_str) != Some("ok") {
        return Err("同步服务健康检查未返回就绪状态".to_string());
    }
    let configured = body
        .get("syncConfigured")
        .and_then(Value::as_bool)
        .ok_or_else(|| "同步服务健康检查格式无效".to_string())?;
    let gateway_version = body
        .get("gatewayVersion")
        .and_then(Value::as_str)
        .ok_or_else(|| "同步网关未声明版本".to_string())?
        .to_string();
    let sync_api_version = body
        .get("syncApiVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "同步网关未声明协议版本".to_string())?;
    Ok(SyncProbeResult {
        status,
        sync_configured: configured,
        gateway_version,
        sync_api_version,
    })
}

async fn run_keychain<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("macOS 钥匙串操作异常结束：{error}"))?
}

async fn send_request(
    service_url: String,
    endpoint: &str,
    method: Method,
    etag: Option<String>,
    idempotency_key: Option<String>,
    body: Option<Value>,
) -> Result<SyncHttpResponse, String> {
    let base = validate_service_url(&service_url)?;
    let url = base
        .join(endpoint)
        .map_err(|_| "无法拼接同步服务接口地址".to_string())?;
    let token = run_keychain(read_client_token).await?;
    let client = http_client()?;
    let mut request = client
        .request(method, url)
        .header(AUTHORIZATION, format!("Bearer {token}"));
    if let Some(value) = etag.filter(|value| !value.trim().is_empty()) {
        request = request.header(IF_NONE_MATCH, value);
    }
    if let Some(value) = idempotency_key.filter(|value| !value.trim().is_empty()) {
        request = request.header("Idempotency-Key", value);
    }
    if let Some(payload) = body {
        request = request
            .header(CONTENT_TYPE, "application/json")
            .json(&payload);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("无法连接同步服务：{}", error_chain(&error)))?;
    let status = response.status().as_u16();
    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    if status == 304 {
        return Ok(SyncHttpResponse {
            status,
            etag,
            body: None,
        });
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("同步服务响应过大".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取同步服务响应失败：{error}"))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("同步服务响应过大".to_string());
    }
    let body = if bytes.is_empty() {
        None
    } else {
        Some(serde_json::from_slice(&bytes).map_err(|_| "同步服务返回了无效 JSON".to_string())?)
    };
    Ok(SyncHttpResponse { status, etag, body })
}

#[tauri::command]
pub async fn sync_has_client_token() -> Result<bool, String> {
    run_keychain(|| Ok(find_client_token()?.is_some_and(|token| !token.trim().is_empty()))).await
}

#[tauri::command]
pub async fn sync_set_client_token(token: String) -> Result<(), String> {
    run_keychain(move || {
        let clean = token.trim();
        if clean.len() < 32 || clean.len() > 512 {
            return Err("同步令牌长度应为 32 到 512 个字符".to_string());
        }
        match find_generic_password(None, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
            Ok((_, mut item)) => item
                .set_password(clean.as_bytes())
                .map_err(|error| format!("无法更新 macOS 钥匙串：{error}")),
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => default_keychain()?
                .add_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, clean.as_bytes())
                .map_err(|error| format!("无法写入 macOS 钥匙串：{error}")),
            Err(error) => Err(format!("无法读取 macOS 钥匙串：{error}")),
        }
    })
    .await
}

#[tauri::command]
pub async fn sync_delete_client_token() -> Result<(), String> {
    run_keychain(
        || match find_generic_password(None, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
            Ok((_, item)) => {
                item.delete();
                Ok(())
            }
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(()),
            Err(error) => Err(format!("无法删除 macOS 钥匙串令牌：{error}")),
        },
    )
    .await
}

#[tauri::command]
pub async fn sync_probe_service(service_url: String) -> Result<SyncProbeResult, String> {
    let base = validate_service_url(&service_url)?;
    let url = base
        .join("health/ready")
        .map_err(|_| "无法拼接同步服务健康检查地址".to_string())?;
    let response = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("无法连接同步服务：{}", error_chain(&error)))?;
    let status = response.status().as_u16();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("同步服务响应过大".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取同步服务响应失败：{error}"))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("同步服务响应过大".to_string());
    }
    let body: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "同步服务健康检查返回了无效 JSON".to_string())?;
    if status != 200 {
        return Err(format!("同步服务健康检查返回 {status}"));
    }
    parse_probe_result(status, &body)
}

#[tauri::command]
pub async fn sync_fetch_snapshot(
    service_url: String,
    etag: Option<String>,
) -> Result<SyncHttpResponse, String> {
    send_request(
        service_url,
        "api/floatlist/v2/tasks",
        Method::GET,
        etag,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn sync_send_mutations(
    service_url: String,
    idempotency_key: String,
    body: Value,
) -> Result<SyncHttpResponse, String> {
    if idempotency_key.trim().is_empty() || idempotency_key.len() > 128 {
        return Err("同步幂等键无效".to_string());
    }
    send_request(
        service_url,
        "api/floatlist/v2/mutations",
        Method::POST,
        None,
        Some(idempotency_key),
        Some(body),
    )
    .await
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{parse_probe_result, validate_service_url};

    #[test]
    fn accepts_https_and_local_development_urls() {
        assert!(validate_service_url("https://sync.example.com").is_ok());
        assert!(validate_service_url("http://127.0.0.1:3000").is_ok());
        assert!(validate_service_url("http://localhost:3000").is_ok());
    }

    #[test]
    fn rejects_insecure_remote_or_credential_urls() {
        assert!(validate_service_url("http://sync.example.com").is_err());
        assert!(validate_service_url("https://user:pass@sync.example.com").is_err());
        assert!(validate_service_url("https://sync.example.com?token=secret").is_err());
    }

    #[test]
    fn parses_probe_configuration_without_accepting_unknown_shapes() {
        let configured = parse_probe_result(
            200,
            &json!({
                "status": "ok",
                "syncConfigured": true,
                "gatewayVersion": "2.0.0",
                "syncApiVersion": 2
            }),
        )
        .unwrap();
        assert_eq!(configured.status, 200);
        assert!(configured.sync_configured);
        assert_eq!(configured.gateway_version, "2.0.0");
        assert_eq!(configured.sync_api_version, 2);
        assert!(parse_probe_result(200, &json!({ "status": "ok" })).is_err());
        assert!(parse_probe_result(
            200,
            &json!({
                "status": "error",
                "syncConfigured": true,
                "gatewayVersion": "2.0.0",
                "syncApiVersion": 2
            })
        )
        .is_err());
    }
}
