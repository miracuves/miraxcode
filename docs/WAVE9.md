# Wave 9 — Mode modularization

## Goals

1. Move **Coder** and **Virtual OS** out of monolithic root `src/js/*.js` into `src/js/modes/`.
2. Bundle each mode with **esbuild** (same pattern as `app.bundle.js`).
3. Keep **`window._H`**, **`window.CoderMode`**, **`window.VoidStudio`**, and **`window._registeredModes`** stable.
4. Document boundaries for the next slices (Monaco bridge, agent loop, Void DB).

## Layout

```
src/js/modes/
  code/
    index.js           # entry → installCodeMode()
    install.js         # full Coder mode (Wave 9 monolith; split in Wave 10)
  virtual-os/
    index.js           # entry → void-studio + register
    void-studio.js     # VoidStudio implementation
    register.js        # _registeredModes["virtual-os"]
```

Legacy `src/js/code-mode.js` and `src/js/virtual-os.js` are deprecation stubs; the app loads bundles only.

## Build outputs

| Entry | Output |
|-------|--------|
| `src/js/app/index.js` | `src/js/app.bundle.js` |
| `src/js/modes/code/index.js` | `src/js/code-mode.bundle.js` |
| `src/js/modes/virtual-os/index.js` | `src/js/virtual-os.bundle.js` |

## HTML / lazy load

- `index.html` loads `code-mode.bundle.js` (eager, after app bundle).
- `mode-loader.js` lazy-loads `virtual-os.bundle.js`.

## Wave 10

See `docs/WAVE10.md` — extracted router, legacy bridge, tool blocks, zip/utils; CoderMode IIFE remains in `install.js`.

## Wave 11 (planned)

- Split CoderMode IIFE into explorer, tabs, agent-run, terminal (`createCoderMode(deps)`).
- Split `void-studio.js` into storage, finder, desktop, chat agent.
