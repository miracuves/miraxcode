// lsp.rs — JSON-RPC language server bridge (stdio)
use crate::security::denylist;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, State};

const ALLOWED_SERVERS: &[&str] = &[
    "rust-analyzer",
    "pyright-langserver",
    "pyright",
    "typescript-language-server",
    "tsls",
    "gopls",
    "clangd",
    "bash-language-server",
];

#[derive(Default)]
pub struct LspManager {
    sessions: Mutex<HashMap<String, LspSessionHandle>>,
}

struct LspSessionHandle {
    writer: Arc<Mutex<std::process::ChildStdin>>,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Result<Value, String>>>>>,
    next_id: Arc<Mutex<u64>>,
    _child: Arc<Mutex<Child>>,
}

#[derive(Serialize)]
pub struct LspStartResult {
    session_id: String,
    language: String,
    command: String,
}

#[derive(Clone, Serialize)]
pub struct LspDiagnosticPayload {
    pub session_id: String,
    pub uri: String,
    pub diagnostics: Value,
}

fn allowed_command(cmd: &str) -> bool {
    let base = cmd.rsplit('/').next().unwrap_or(cmd);
    ALLOWED_SERVERS.iter().any(|a| base == *a || base.starts_with(&format!("{a}-")))
}

#[tauri::command]
pub fn lsp_start(
    app: AppHandle,
    state: State<'_, LspManager>,
    language: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<LspStartResult, String> {
    if !allowed_command(&command) {
        return Err(format!("LSP server not allowed: {command}"));
    }
    let full = format!("{} {}", command, args.join(" "));
    if denylist::is_command_denied(&full) {
        return Err(format!("LSP command blocked: {command}"));
    }
    if let Some(dir) = &cwd {
        if denylist::is_path_denied(dir) {
            return Err(format!("LSP cwd denied: {dir}"));
        }
    }

    let mut child = Command::new(&command);
    child.args(&args);
    child.stdin(Stdio::piped());
    child.stdout(Stdio::piped());
    child.stderr(Stdio::null());
    if let Some(dir) = &cwd {
        child.current_dir(dir);
    }
    let mut child = child.spawn().map_err(|e| format!("LSP spawn failed: {e}"))?;

    let stdin = child.stdin.take().ok_or("LSP stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("LSP stdout unavailable")?;

    let session_id = format!("lsp_{}_{}", language, chrono_lite_id());
    let writer = Arc::new(Mutex::new(stdin));
    let pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Result<Value, String>>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let next_id = Arc::new(Mutex::new(1u64));
    let sid = session_id.clone();
    let app_handle = app.clone();

    let pending_reader = Arc::clone(&pending);
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            if line.trim().is_empty() {
                continue;
            }
            let msg: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                let tx = {
                    let mut p = pending_reader.lock().unwrap();
                    p.remove(&id)
                };
                if let Some(tx) = tx {
                    let _ = tx.send(Ok(msg));
                }
                continue;
            }
            if msg.get("method").and_then(|m| m.as_str()) == Some("textDocument/publishDiagnostics")
            {
                let params = msg.get("params").cloned().unwrap_or(Value::Null);
                let uri = params
                    .get("uri")
                    .and_then(|u| u.as_str())
                    .unwrap_or("")
                    .to_string();
                let diags = params.get("diagnostics").cloned().unwrap_or(Value::Array(vec![]));
                let _ = app_handle.emit(
                    "lsp-diagnostics",
                    LspDiagnosticPayload {
                        session_id: sid.clone(),
                        uri,
                        diagnostics: diags,
                    },
                );
            }
        }
    });

    let handle = LspSessionHandle {
        writer,
        pending,
        next_id,
        _child: Arc::new(Mutex::new(child)),
    };
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(session_id.clone(), handle);

    Ok(LspStartResult {
        session_id,
        language,
        command,
    })
}

fn chrono_lite_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{ms}")
}

fn write_rpc(
    handle: &LspSessionHandle,
    msg: &Value,
    wait_response: bool,
) -> Result<Option<Value>, String> {
    let id = msg.get("id").and_then(|v| v.as_u64());
    let rx = if wait_response {
        if let Some(id) = id {
            let (tx, rx) = mpsc::channel();
            handle.pending.lock().map_err(|e| e.to_string())?.insert(id, tx);
            Some(rx)
        } else {
            return Err("LSP request missing id".into());
        }
    } else {
        None
    };

    let line = format!("{}\n", msg);
    {
        let mut w = handle.writer.lock().map_err(|e| e.to_string())?;
        w.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())?;
    }

    if let Some(rx) = rx {
        match rx.recv_timeout(std::time::Duration::from_secs(30)) {
            Ok(Ok(v)) => Ok(Some(v)),
            Ok(Err(e)) => Err(e),
            Err(_) => {
                if let Some(id) = id {
                    handle.pending.lock().map_err(|e| e.to_string())?.remove(&id);
                }
                Err("LSP request timed out".into())
            }
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn lsp_request(
    state: State<'_, LspManager>,
    session_id: String,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let handle = {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .ok_or_else(|| format!("LSP session not found: {session_id}"))?
            .clone_session()
    };
    let id = {
        let mut n = handle.next_id.lock().map_err(|e| e.to_string())?;
        let cur = *n;
        *n += 1;
        cur
    };
    let msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });
    write_rpc(&handle, &msg, true)?.ok_or_else(|| "Empty LSP response".to_string())
}

#[tauri::command]
pub fn lsp_notify(
    state: State<'_, LspManager>,
    session_id: String,
    method: String,
    params: Value,
) -> Result<(), String> {
    let handle = {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .ok_or_else(|| format!("LSP session not found: {session_id}"))?
            .clone_session()
    };
    let msg = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params
    });
    write_rpc(&handle, &msg, false)?;
    Ok(())
}

#[tauri::command]
pub fn lsp_stop(state: State<'_, LspManager>, session_id: String) -> Result<(), String> {
    let child = {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        let h = sessions.remove(&session_id).ok_or("Session not found")?;
        h._child
    };
    let mut c = child.lock().map_err(|e| e.to_string())?;
    let _ = c.kill();
    Ok(())
}

impl LspSessionHandle {
    fn clone_session(&self) -> Self {
        LspSessionHandle {
            writer: Arc::clone(&self.writer),
            pending: Arc::clone(&self.pending),
            next_id: Arc::clone(&self.next_id),
            _child: Arc::clone(&self._child),
        }
    }
}
