# Wave 12 — Mode slice extraction (6-agent pass)

## Goals

Split remaining monoliths using `create*Api(ctx)` factories (same pattern as Wave 10 router and Wave 11 `coder-mode.js`).

## Modules

| Slice | Module | Exports |
|-------|--------|---------|
| Tabs | `modes/code/tabs.js` | `createTabManager` |
| Terminal | `modes/code/terminal.js` | `createTerminalApi` |
| Explorer | `modes/code/explorer.js` | `createExplorerApi` |
| Agent run | `modes/code/agent-run.js` | `createAgentRunApi` |
| Router (add-on) | `modes/code/router.js` | `buildRouterChain` for vote/chain modes |
| Void storage | `modes/virtual-os/storage.js` | `createVoidStorage` |
| Void chat | `modes/virtual-os/chat.js` | `createVoidChatApi` |

`coder-mode.js` and `void-studio.js` remain orchestrators (mount/DOM wiring).

## Verify

```bash
npm run build:js
npm test
```
