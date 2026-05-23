# Wave 11 — CoderMode factory + thin install

## Goals

1. Move the **CoderMode IIFE** (~3.6k lines) from `install.js` to `coder-mode.js`.
2. Keep **`install.js`** as a thin orchestrator (shared state, `modelRef`, registration).
3. Fix **model chip helpers** living inside the IIFE (they reference `onCoderModelChanged` and `_conversationMsgs`).
4. Unify duplicate **`setStatus`** implementations in Coder mode.

## Layout (`modes/code/`)

| Module | Responsibility |
|--------|----------------|
| `install.js` | `installCodeMode()` — wires `modelRef`, `createCoderMode`, legacy bridge, register |
| `coder-mode.js` | `createCoderMode({ sharedState, modelRef, relativeFromRoot })` → `{ mount, destroy, remount }` |
| (Wave 10 modules) | `constants`, `dom-utils`, `tool-blocks`, `router`, `legacy-bridge`, `stats-poll`, `register` |

## Wave 12 (planned)

- `tabs.js` — tab manager + tab bar
- `terminal.js` — terminal + ANSI rendering
- `explorer.js` — file tree + context menu
- `agent-run.js` — `startRun`, `agentLoop`, multi-agent modes
- Virtual OS: `storage.js`, `finder.js`, `chat.js`, remove legacy root copies

## Verify

```bash
npm run build:js
npm test
```
