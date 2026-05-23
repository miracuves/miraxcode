# Wave 10 — Mode slice extraction

## Goals

1. Split **shared, testable slices** out of `modes/code/install.js` and `modes/virtual-os/void-studio.js`.
2. Hoist **`callWithRouter`** so legacy `HC_CODE.run` and CoderMode share one implementation.
3. Keep **`window.CoderMode`**, **`window.VoidStudio`**, and bundles unchanged for HTML/loader.

## Coder (`modes/code/`)

| Module | Responsibility |
|--------|----------------|
| `constants.js` | Tool row SVG icons |
| `dom-utils.js` | `$`, `esc`, paths, explorer/router chips |
| `tool-blocks.js` | Slim tool rows + `injectAllToolBlocks` |
| `router.js` | `callWithRouter`, `sortChainByQuality` |
| `legacy-bridge.js` | `HC_CODE.run` agent loop |
| `stats-poll.js` | Tauri CPU/RAM/GPU widget |
| `register.js` | `_registeredModes['code']`, boot, `HC_CODE` surface |
| `install.js` | Shared state, model chips, **CoderMode IIFE** (still large) |

## Virtual OS (`modes/virtual-os/`)

| Module | Responsibility |
|--------|----------------|
| `utils.js` | `$`, `esc`, `uid`, `nowIso` |
| `zip.js` | In-browser ZIP export (`makeZip`) |
| `void-studio.js` | VoidStudio IIFE (desktop, finder, agent — still large) |
| `register.js` | `_registeredModes['virtual-os']` |

## Wave 11

See `docs/WAVE11.md` — `coder-mode.js` + thin `install.js`; legacy root scripts are deprecation stubs.

## Wave 12 (planned)

- `tabs.js`, `terminal.js`, `explorer.js`, `agent-run.js` under `modes/code/`
- Void `storage.js`, `finder.js`, `chat.js`

## Verify

```bash
npm run build:js
npm test
```
