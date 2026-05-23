# Coder mode polish (Cursor-parity loop)

## Shipped

| Feature | Module | Notes |
|---------|--------|--------|
| Unified line diff in chat review | `cdr-diff-lines.js`, `toggleChangePreview` | `+N / −M` summary, colored add/del lines |
| @-mention → attachment chips | `cdr-mentions.js`, `coder-mode.js` | Picking a file adds composer chip + `@path` text |
| Rehydrate Accept/Reject rows | `rehydrateFileChangeRows`, `chat-ui.js` | Survives tab switch / `renderConversation` |
| Review shortcuts | `dom-wiring.js`, palette | ⌘⇧Enter accept all, ⌘⇧Y first pending, ⌘Enter in diff editor |
| LSP completion + hover | `cdr-lsp-client.js`, `cdr-editor-pane.js` | rust-analyzer, pyright, tsserver when installed |
| Persist `previousContent` in tabs | `tabs.js` | Better diff after reload (12k cap) |

## Keyboard (Coder mode)

| Shortcut | Action |
|----------|--------|
| ⌘⇧Enter | Accept all pending file changes |
| ⌘⇧Y | Accept first pending change |
| ⌘Enter | Accept change (when inline diff editor focused) |
| ⌘K | Command palette (includes accept-all) |

## Optional next (shipped)

| Feature | Module | Notes |
|---------|--------|--------|
| AI inline ghost completions | `cdr-inline-complete.js` | Local Ollama + word heuristic; `localStorage cdrInlineAi=0` disables AI |
| Staged `delete_file` | `cdr-file-stage.js`, `agent-run.js` | Accept deletes file; Reject keeps/restores |
| Legacy `HC_CODE.run` staging | `legacy-bridge.js` | Same staging as Coder; `sharedState.pendingStaged` + Coder ingest on mount |

## Future ideas

- Multi-file review session UI (single scrollable queue across all pending files)
- Cloud-model inline completions (opt-in; local-only by default for latency)
