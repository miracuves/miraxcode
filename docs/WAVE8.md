# Wave 8 — IDE-grade polish

## Goals

1. **Trim `bootstrap.js`** to wiring: DOM refs, factory init order, thin event glue, `window._H`.
2. **Extract shell utilities** (dialogs, settings persistence, backend sync, boot chrome).
3. **Add smoke tests** for pure `app/` modules (memory, routing, moonshot, MCP prefs).
4. **Document boundaries** for `code-mode.js` and `virtual-os.js` (next wave).

## New modules

| Module | Responsibility |
|--------|----------------|
| `ui/dialogs.js` | Themed alert / confirm / prompt |
| `core/settings-runtime.js` | `readSavedSettings`, `createSaveSettings`, keychain hydrate |
| `core/backend-sync.js` | Optional Hash UI server secret pull/push |
| `core/boot-bridge.js` | `window._H`, command palette, selection toolbar, shortcuts |

## Tests

| File | Covers |
|------|--------|
| `tests/app-modules-smoke.test.mjs` | Moonshot keys, routing classify, memory recall, settings parse |

## Init order (unchanged logic)

`dialogs` → `SAVED` + apply form → `projects` → `memory` → keychain → `backend sync` → cloud stack → … → `boot-bridge` at end of `boot()`.

## Wave 9 (planned)

- `code-mode.js` → `modes/code/` slice (Monaco bridge, CDR agent)
- `virtual-os.js` → `modes/virtual-os/` slice
- Optional TypeScript on `app/` only (incremental)
