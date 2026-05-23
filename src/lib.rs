// ==============================================================
// MiraXcode — Rust library entry point
// ==============================================================

mod commands;
mod security;

use commands::{
    audit::{audit_log_append, audit_log_read},
    fs::{fs_delete_file, fs_fuzzy_find, fs_grep, fs_list_dir, fs_read_file, fs_search_files, fs_write_file},
    keychain::{keychain_delete, keychain_retrieve, keychain_store, keychain_store_bundle, keychain_retrieve_bundle},
    shell::{shell_run, shell_run_stream},
    lsp::{lsp_notify, lsp_request, lsp_start, lsp_stop, LspManager},
    mcp::{mcp_scan_servers, mcp_connect_sse, mcp_call_tool},
    stats::system_stats,
    provider_probe::{provider_http_probe, provider_http_probe_bearer, provider_http_request, provider_http_stream},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(LspManager::default())
        .invoke_handler(tauri::generate_handler![
            // Phase 6 — Keychain (bundle = one prompt for all keys)
            keychain_store,
            keychain_retrieve,
            keychain_delete,
            keychain_store_bundle,
            keychain_retrieve_bundle,
            // Phase 3 — Audit log
            audit_log_append,
            audit_log_read,
            // Phase 4 — Filesystem
            fs_read_file,
            fs_write_file,
            fs_list_dir,
            fs_delete_file,
            fs_search_files,
            fs_fuzzy_find,
            fs_grep,
            // Phase 4 — Shell
            shell_run,
            shell_run_stream,
            lsp_start,
            lsp_request,
            lsp_notify,
            lsp_stop,
            // MCP — Model Context Protocol
            mcp_scan_servers,
            mcp_connect_sse,
            mcp_call_tool,
            system_stats,
            provider_http_probe,
            provider_http_probe_bearer,
            provider_http_request,
            provider_http_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MiraXcode");
}
