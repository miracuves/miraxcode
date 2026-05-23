# MiraXCode — Production operations guide

This document describes how the desktop app is hardened for daily use at scale. There is no MiraXCode cloud backend; reliability is entirely client-side.

## Architecture

| Layer | Responsibility |
|--------|----------------|
| **JS bundle** | `npm run build:js` → `src/js/app.bundle.js` (esbuild; sources in `src/js/app/`) |
| **Tauri / Rust** | FS, shell, LSP, provider HTTP, macOS Keychain, denylist enforcement |
| **Permission guard** | User approval for writes/shell; audit log at `~/.miraxcode/audit.log` |
| **HcStorage** | Bounded `localStorage` with quota recovery |
| **HcHealth** | Local-only error ring buffer (`hc_health_log_v1`) — no telemetry |
| **CI** | `.github/workflows/ci.yml` — `cargo test` + `npm test` on every push |

## API keys

- **Primary:** macOS Keychain via `keychain_store_bundle` (Rust).
- **Cache:** WebKit `localStorage` (`hc_api_bundle_v2`) for fast reads and rebuild survival.
- Keys are **never** written into `atelier` settings JSON.

If Keychain write fails (permissions), the app continues with the local cache and logs a warning once.

## Data limits (automatic)

| Store | Limit |
|--------|--------|
| Main / code / forge chats | 80 chats, 100 messages each, 24k chars per message |
| Chat JSON blob | ~2 MB per bucket (trim + drop oldest on quota) |
| Agent runs | 250 |
| Coder tabs | 120 msgs / tab, 40 file changes |
| RAG store | ~6.5 MB (existing) |

When storage is full, users see an in-app notification with recovery guidance.

## Security

- Path and shell **denylist** enforced in Rust (`src/security/denylist.rs`) with unit tests.
- Shell: substring denylist + permission guard; not a full allowlist (power users need flexibility).
- **YOLO / bypass** modes are explicit opt-in and logged to the audit log.

## Support diagnostics (privacy-preserving)

Ask users to export local health log (no API keys):

```js
// DevTools console in the app
copy(HcHealth.exportText())
```

Or read: `localStorage.getItem('hc_health_log_v1')`.

## Release checklist

1. `npm run build:js`
2. `cargo test && cargo check`
3. `npm test`
4. `npm run tauri build`
4. Smoke: open project, run coder agent, switch tabs mid-run, save settings, restart app
5. Verify Keychain prompt only on first secret save after clean install (expected on macOS)

## Known platform limits

- **macOS Apple Silicon** only in v2.0.0; Windows/Linux planned.
- WebView `localStorage` quota is per-profile (~5–10 MB typical); heavy RAG + chats can approach limits — caps above mitigate this.

## Roadmap (production)

- [ ] E2E tests (Playwright + Tauri driver)
- [ ] Split `app.js` into modules / bundler for maintainability
- [ ] Optional crash export zip (health log + audit tail, user-initiated)
- [ ] Windows/Linux Keychain parity in CI matrix
