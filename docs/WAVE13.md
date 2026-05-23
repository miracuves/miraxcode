# Wave 13 — Thin orchestrators (Coder + Virtual OS)

## Goals

Shrink `coder-mode.js` (~2k lines) and `void-studio.js` (~2.6k lines) by extracting UI wiring and render pipelines.

## Target modules (6-agent pass)

| # | Module | Source sections |
|---|--------|-----------------|
| 1 | `modes/code/chat-ui.js` | Chat rendering, bubbles, virtual scroll (~978–1244) |
| 2 | `modes/code/sessions.js` | Past chats, sessions list, change overlay (~1245–1433) |
| 3 | `modes/code/dom-wiring.js` | `wireDom`, mount/destroy helpers (~508–977) |
| 4 | `modes/virtual-os/finder.js` | Finder tree, file list, breadcrumb, finder bar |
| 5 | `modes/virtual-os/desktop.js` | Desktop icons, dock, header, `renderAll` helpers |
| 6 | `modes/virtual-os/generate.js` | `generate()`, deployment rewrite, `wireEvents` |

Pattern: `export function createXApi(ctx)` + wire from parent IIFE.

## Status

Completed — build + tests green. New modules:

- `modes/code/chat-ui.js`, `sessions.js`, `dom-wiring.js`
- `modes/virtual-os/finder.js`, `desktop.js`, `generate.js`

Orchestrators: `coder-mode.js` ~1.4k lines, `void-studio.js` ~1.8k lines (down from ~2k / ~2.6k).

## Wave 14 (next)

Bundle lazy modes: `forge-mode.js`, `swarm-maker.js`, `finance-mode.js`, `sandbox.js`, `system-maker.js`.
