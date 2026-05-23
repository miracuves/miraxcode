//! HTTP probe for API key tests — bypasses WebView fetch/CSP limits.

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Serialize;
use std::str::FromStr;
use std::time::Duration;
use tauri::ipc::Channel;

#[derive(Debug, Serialize)]
pub struct HttpProbeResult {
    pub ok: bool,
    pub status: u16,
    pub error: Option<String>,
    pub body_preview: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
}

#[tauri::command]
pub async fn provider_http_probe(
    url: String,
    method: Option<String>,
    headers: Option<serde_json::Value>,
    timeout_ms: Option<u64>,
) -> Result<HttpProbeResult, String> {
    let method = method.unwrap_or_else(|| "GET".to_string());
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(12_000).clamp(2_000, 60_000));

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let mut req_headers = HeaderMap::new();
    if let Some(serde_json::Value::Object(map)) = headers {
        for (k, v) in map {
            let val = match v {
                serde_json::Value::String(s) => s,
                other => other.to_string(),
            };
            if val.is_empty() {
                continue;
            }
            let name = HeaderName::from_str(&k).map_err(|e| format!("Invalid header {k}: {e}"))?;
            let value = HeaderValue::from_str(&val).map_err(|e| format!("Invalid header value: {e}"))?;
            req_headers.insert(name, value);
        }
    }

    let req = client
        .request(
            reqwest::Method::from_bytes(method.as_bytes())
                .map_err(|e| format!("Invalid method: {e}"))?,
            &url,
        )
        .headers(req_headers);

    let resp = req.send().await.map_err(|e| format!("Network error: {e}"))?;

    let status = resp.status().as_u16();
    let body = resp
        .text()
        .await
        .unwrap_or_default();
    let preview: String = body.chars().take(400).collect();

    let ok = (200..300).contains(&status);
    let error = if ok {
        None
    } else {
        Some(format!("HTTP {status}"))
    };

    Ok(HttpProbeResult {
        ok,
        status,
        error,
        body_preview: preview,
        body: Some(body),
    })
}

/// Full HTTP request (e.g. non-streaming agent turns) — bypasses WebView fetch.
#[tauri::command]
pub async fn provider_http_request(
    url: String,
    method: Option<String>,
    headers: Option<serde_json::Value>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HttpProbeResult, String> {
    let method = method.unwrap_or_else(|| "POST".to_string());
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(120_000).clamp(3_000, 300_000));

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let mut req_headers = HeaderMap::new();
    if let Some(serde_json::Value::Object(map)) = headers {
        for (k, v) in map {
            let val = match v {
                serde_json::Value::String(s) => s,
                other => other.to_string(),
            };
            if val.is_empty() {
                continue;
            }
            let name = HeaderName::from_str(&k).map_err(|e| format!("Invalid header {k}: {e}"))?;
            let value = HeaderValue::from_str(&val).map_err(|e| format!("Invalid header value: {e}"))?;
            req_headers.insert(name, value);
        }
    }

    let mut req = client
        .request(
            reqwest::Method::from_bytes(method.as_bytes())
                .map_err(|e| format!("Invalid method: {e}"))?,
            &url,
        )
        .headers(req_headers);

    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| format!("Network error: {e}"))?;
    let status = resp.status().as_u16();
    let resp_body = resp.text().await.unwrap_or_default();
    let preview: String = resp_body.chars().take(400).collect();
    let ok = (200..300).contains(&status);

    Ok(HttpProbeResult {
        ok,
        status,
        error: if ok { None } else { Some(format!("HTTP {status}")) },
        body_preview: preview,
        body: Some(resp_body),
    })
}

/// Convenience: set bearer token from a single key string.
#[tauri::command]
pub async fn provider_http_probe_bearer(
    url: String,
    bearer: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HttpProbeResult, String> {
    let mut headers = serde_json::Map::new();
    if let Some(token) = bearer.filter(|s| !s.trim().is_empty()) {
        headers.insert(
            "Authorization".to_string(),
            serde_json::Value::String(format!("Bearer {}", token.trim())),
        );
    }
    provider_http_probe(
        url,
        Some("GET".to_string()),
        Some(serde_json::Value::Object(headers)),
        timeout_ms,
    )
    .await
}

#[derive(Clone, Serialize)]
pub struct HttpStreamChunk {
    pub kind: String,
    pub data: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
}

/// Emit complete UTF-8 from carry buffer (SSE chunks may split multibyte characters).
fn drain_utf8_buffer(buf: &mut Vec<u8>, on_chunk: &Channel<HttpStreamChunk>) {
    loop {
        if buf.is_empty() {
            break;
        }
        match std::str::from_utf8(buf.as_slice()) {
            Ok(s) => {
                if !s.is_empty() {
                    let _ = on_chunk.send(HttpStreamChunk {
                        kind: "data".into(),
                        data: s.to_string(),
                        status: None,
                    });
                }
                buf.clear();
                break;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                if valid > 0 {
                    let piece = String::from_utf8(buf[..valid].to_vec()).unwrap_or_default();
                    if !piece.is_empty() {
                        let _ = on_chunk.send(HttpStreamChunk {
                            kind: "data".into(),
                            data: piece,
                            status: None,
                        });
                    }
                    buf.drain(..valid);
                }
                if let Some(bad_len) = e.error_len() {
                    let skip = bad_len.min(buf.len());
                    buf.drain(..skip);
                } else {
                    break;
                }
            }
        }
    }
}

fn streaming_http_client(timeout: Duration) -> Result<reqwest::Client, String> {
    // Prefer HTTP/1.1 for long-lived SSE — some HTTP/2 stacks drop tool-call streams early.
    reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::limited(3))
        .pool_max_idle_per_host(4)
        .http1_only()
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))
}

fn build_header_map(headers: Option<serde_json::Value>) -> Result<HeaderMap, String> {
    let mut req_headers = HeaderMap::new();
    if let Some(serde_json::Value::Object(map)) = headers {
        for (k, v) in map {
            let val = match v {
                serde_json::Value::String(s) => s,
                other => other.to_string(),
            };
            if val.is_empty() {
                continue;
            }
            let name = HeaderName::from_str(&k).map_err(|e| format!("Invalid header {k}: {e}"))?;
            let value = HeaderValue::from_str(&val).map_err(|e| format!("Invalid header value: {e}"))?;
            req_headers.insert(name, value);
        }
    }
    Ok(req_headers)
}

/// Streaming HTTP (SSE) — bypasses WebView fetch which often fails with "Load failed".
#[tauri::command]
pub async fn provider_http_stream(
    url: String,
    method: Option<String>,
    headers: Option<serde_json::Value>,
    body: Option<String>,
    timeout_ms: Option<u64>,
    on_chunk: Channel<HttpStreamChunk>,
) -> Result<HttpProbeResult, String> {
    let method = method.unwrap_or_else(|| "POST".to_string());
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(120_000).clamp(3_000, 300_000));

    let client = streaming_http_client(timeout)?;

    let req_headers = build_header_map(headers)?;

    let mut req = client
        .request(
            reqwest::Method::from_bytes(method.as_bytes())
                .map_err(|e| format!("Invalid method: {e}"))?,
            &url,
        )
        .headers(req_headers);

    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| format!("Network error: {e}"))?;
    let status = resp.status().as_u16();

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        let preview: String = text.chars().take(400).collect();
        let _ = on_chunk.send(HttpStreamChunk {
            kind: "error".into(),
            data: text.clone(),
            status: Some(status),
        });
        return Ok(HttpProbeResult {
            ok: false,
            status,
            error: Some(format!("HTTP {status}")),
            body_preview: preview,
            body: Some(text),
        });
    }

    let mut stream = resp.bytes_stream();
    let mut utf8_buf: Vec<u8> = Vec::new();
    while let Some(next) = stream.next().await {
        match next {
            Ok(bytes) => {
                if bytes.is_empty() {
                    continue;
                }
                utf8_buf.extend_from_slice(&bytes);
                drain_utf8_buffer(&mut utf8_buf, &on_chunk);
            }
            Err(e) => {
                drain_utf8_buffer(&mut utf8_buf, &on_chunk);
                let msg = format!("Stream read failed: {e}");
                let preview: String = msg.chars().take(400).collect();
                let _ = on_chunk.send(HttpStreamChunk {
                    kind: "error".into(),
                    data: msg.clone(),
                    status: Some(status),
                });
                return Ok(HttpProbeResult {
                    ok: false,
                    status,
                    error: Some(msg),
                    body_preview: preview,
                    body: None,
                });
            }
        }
    }
    drain_utf8_buffer(&mut utf8_buf, &on_chunk);
    let _ = on_chunk.send(HttpStreamChunk {
        kind: "done".into(),
        data: String::new(),
        status: Some(status),
    });

    Ok(HttpProbeResult {
        ok: true,
        status,
        error: None,
        body_preview: String::new(),
        body: None,
    })
}
