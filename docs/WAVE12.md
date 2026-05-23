# Wave 12 — Mode slice extraction (6-agent pass)

## Goals

Split remaining monoliths using `create*Api(ctx)` factories (same pattern as Wave 10 router and Wave 11 `coder-mode.js`).

## Completed in this wave

| Agent / slice | Module | Status |
|---------------|--------|--------|
| Tabs | `modes/code/tabs.js` | `createTabManager` + `tabHooks` wiring |
| Terminal | `modes/code/terminal.js` | `createTerminalApi` (ANSI, trace, shell) |
| Void storage | `modes/virtual-os/storage.js` | `createVoidStorage` + `state` bag in void-studio |

## In progress

| Slice | Target module |
|-------|----------------|
| Explorer | `modes/code/explorer.js` |
| Agent run | `modes/code/agent-run.js` |
| Void chat | `modes/virtual-os/chat.js` |

## Wiring pattern

```javascript
const tabHooks = {};
const { _tabMgr, renderTabBar, ... } = createTabManager({ ..., hooks: tabHooks });
// ... define functions ...
Object.assign(tabHooks, { abortActiveRun, renderConversation, ... });
```

## Verify

```bash
npm run build:js
npm test
```
