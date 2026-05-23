use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpServerConfig {
    pub name: String,
    pub source: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Serialize)]
pub struct McpScanResult {
    servers: Vec<McpServerConfig>,
    errors: Vec<String>,
}

fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

fn read_json(path: &PathBuf) -> Option<serde_json::Value> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn extract_servers(
    val: &serde_json::Value,
    source: &str,
) -> Vec<McpServerConfig> {
    let obj = match val.as_object() {
        Some(o) => o,
        None => return vec![],
    };
    let mcp = match obj.get("mcpServers") {
        Some(v) => v,
        None => return vec![],
    };
    let mut out = Vec::new();
    if let Some(servers) = mcp.as_object() {
        for (name, cfg) in servers {
            let transport = if cfg.get("type").and_then(|t| t.as_str()) == Some("sse") || cfg.get("url").is_some() {
                "sse".to_string()
            } else {
                "stdio".to_string()
            };
            let url = cfg.get("url").and_then(|u| u.as_str()).map(|s| s.to_string());
            let command = cfg.get("command").and_then(|c| c.as_str()).map(|s| s.to_string());
            let args = cfg.get("args").and_then(|a| a.as_array()).map(|arr| {
                arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
            });
            let env = cfg.get("env").and_then(|e| e.as_object()).map(|obj| {
                let mut map = HashMap::new();
                for (k, v) in obj {
                    if let Some(val) = v.as_str() {
                        map.insert(k.clone(), val.to_string());
                    }
                }
                map
            });
            out.push(McpServerConfig {
                name: name.clone(),
                source: source.to_string(),
                transport,
                command,
                args,
                url,
                env,
            });
        }
    }
    out
}

#[tauri::command]
pub fn mcp_scan_servers() -> McpScanResult {
    let mut servers = Vec::new();
    let mut errors = Vec::new();
    let home = match home() {
        Some(h) => h,
        None => {
            errors.push("Cannot detect home directory".to_string());
            return McpScanResult { servers, errors };
        }
    };

    let scan_paths: Vec<(PathBuf, &str)> = vec![
        (
            home.join("Library/Application Support/Claude/claude_desktop_config.json"),
            "Claude Desktop",
        ),
        (
            home.join(".cursor/mcp.json"),
            "Cursor",
        ),
        (
            home.join(".vscode/mcp.json"),
            "VS Code",
        ),
        (
            home.join("Library/Application Support/Code/User/settings.json"),
            "VS Code Settings",
        ),
        (
            home.join(".claude/settings.json"),
            "Claude CLI",
        ),
        (
            home.join(".config/claude-code/settings.json"),
            "Claude Code",
        ),
    ];

    for (path, source) in scan_paths {
        if !path.exists() {
            continue;
        }
        match read_json(&path) {
            Some(val) => {
                let found = extract_servers(&val, source);
                servers.extend(found);
            }
            None => {
                errors.push(format!("Cannot parse {}", path.display()));
            }
        }
    }

    let mut seen = std::collections::HashSet::new();
    servers.retain(|s| {
        let key = format!("{}|{}|{:?}", s.name, s.source, s.url);
        seen.insert(key)
    });

    McpScanResult { servers, errors }
}

#[tauri::command]
pub async fn mcp_connect_sse(url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(&format!("{}/tools/list", url.trim_end_matches('/')))
        .header("Content-Type", "application/json")
        .body(r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}"#)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, &body[..body.len().min(500)]));
    }
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Invalid JSON: {} — {}", e, &body[..body.len().min(200)]))?;
    Ok(json)
}

#[tauri::command]
pub async fn mcp_call_tool(url: String, tool_name: String, arguments: serde_json::Value) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    });
    let client = reqwest::Client::new();
    let endpoint = format!("{}/tools/call", url.trim_end_matches('/'));
    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("MCP call failed: {}", e))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, &text[..text.len().min(500)]));
    }
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid JSON: {} — {}", e, &text[..text.len().min(200)]))?;
    Ok(json)
}
