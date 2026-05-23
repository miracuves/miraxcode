# Mode modules (Wave 9+)

Heavy UI modes live under `modes/` and ship as **esbuild IIFE bundles** (same as `app.bundle.js`).

| Mode | Source | Bundle | Load |
|------|--------|--------|------|
| Main shell | `app/index.js` | `app.bundle.js` | Eager in `index.html` |
| Coder | `modes/code/index.js` | `code-mode.bundle.js` | Eager after app bundle |
| Virtual OS | `modes/virtual-os/index.js` | `virtual-os.bundle.js` | Lazy via `mode-loader.js` |

## Coder (`modes/code/`)

- `install.js` — thin orchestrator (`modelRef`, legacy bridge, register).
- `coder-mode.js` — **CoderMode IIFE** (`createCoderMode`)
- `tabs.js`, `terminal.js`, `explorer.js`, `agent-run.js` — Wave 12 slices
- `chat-ui.js`, `sessions.js`, `dom-wiring.js` — Wave 13 (chat render, sessions, DOM wiring)
- `constants.js`, `dom-utils.js`, `tool-blocks.js`, `router.js`, `legacy-bridge.js`, `stats-poll.js`, `register.js`
- `index.js` — calls `installCodeMode()`.

Depends on `window._H` from the main shell and the `cdr-*` helper scripts loaded before the bundle in `index.html`.

## Virtual OS (`modes/virtual-os/`)

- `void-studio.js` — `VoidStudio` IIFE orchestrator.
- `utils.js`, `zip.js`, `storage.js`, `chat.js` — helpers, ZIP, storage, chat/agent OS.
- `finder.js`, `desktop.js`, `generate.js` — Wave 13 (finder UI, desktop/dock, generate/wire).
- `register.js` — `_registeredModes['virtual-os']`.
- `index.js` — wires register after studio loads.

## Build

```bash
npm run build:js
```

Builds all three bundles.

## Adding a new lazy mode

1. Add `src/js/modes/<name>/index.js`.
2. Add entry to `esbuild.config.mjs`.
3. Register path in `mode-loader.js`.
4. Add `_registeredModes` entry in the mode's `register.js`.
