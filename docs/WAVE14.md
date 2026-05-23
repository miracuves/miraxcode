# Wave 14 — Lazy mode bundles

## Goals

Move remaining lazy-loaded mode scripts into `src/js/modes/` and ship them as esbuild IIFE bundles (same pattern as Virtual OS).

## Migrated modes

| Tab key | Source | Bundle | Global |
|---------|--------|--------|--------|
| `forge` | `modes/forge/` | `forge.bundle.js` | `window.ForgeMode` |
| `agent-maker` | `modes/agent-maker/` | `agent-maker.bundle.js` | `window.SwarmMaker` |
| `finance` | `modes/finance/` | `finance.bundle.js` | `window.FinanceMode` |
| `sandbox` | `modes/sandbox/` | `sandbox.bundle.js` | `window.SandboxMode` |
| `systems` | `modes/systems/` | `systems.bundle.js` | `window.SystemMaker` |

Each mode: main script + `register.js` + `index.js`. Old root paths kept as deprecation stubs.

## Still separate

- `forge-editor.js` — loaded eagerly in `index.html` (Forge editor overlay).

## Wave 15 (optional)

- Split large mode internals (Forge ~3.8k, Systems ~4.2k lines)
- `messages.js` app shell extraction
- More per-module smoke tests
