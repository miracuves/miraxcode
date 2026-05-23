# Mode modules (Wave 9+)

Heavy UI modes live under `modes/` and ship as **esbuild IIFE bundles** (same as `app.bundle.js`).

| Mode | Source | Bundle | Load |
|------|--------|--------|------|
| Main shell | `app/index.js` | `app.bundle.js` | Eager in `index.html` |
| Coder | `modes/code/index.js` | `code-mode.bundle.js` | Eager after app bundle |
| Virtual OS | `modes/virtual-os/index.js` | `virtual-os.bundle.js` | Lazy via `mode-loader.js` |

## Coder (`modes/code/`)

- `install.js` — full Coder mode (legacy `HC_CODE`, `CoderMode`, registration). Split into smaller files in Wave 10.
- `index.js` — calls `installCodeMode()`.

Depends on `window._H` from the main shell and the `cdr-*` helper scripts loaded before the bundle in `index.html`.

## Virtual OS (`modes/virtual-os/`)

- `void-studio.js` — `VoidStudio` implementation (IndexedDB virtual desktop).
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
