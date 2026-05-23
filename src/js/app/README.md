# Main shell (`app/`)

The chat shell was split from the monolithic `app.js` into ES modules bundled with **esbuild**.

## Layout

| Path | Role |
|------|------|
| `index.js` | Entry — loads `runtime.js`, runs `boot()` |
| `runtime.js` | `MiraXcodeRuntime` (Ollama host helpers) |
| `bootstrap.js` | Main UI orchestration (wiring + boot) |
| `providers/cloud-fetch.js` | `cloudFetch`, API keys, usage chip |
| `providers/moonshot.js` | Kimi/Moonshot multi-base API (`fetchMoonshotApi`, `fetchKimiAnthropic`) |
| `providers/nvidia-stream.js` | NVIDIA NIM SSE streaming (`nvidiaStreamChat`) |
| `providers/local-ollama.js` | Host presets, `loadModels`, connection status / errors |
| `providers/cloud-catalog.js` | Cloud model catalog, streaming, compare |
| `providers/agent-turns.js` | Agent tool-calling loops (OpenAI/Gemini/…) |
| `providers/http-native.js` | Tauri native HTTP + SSE |
| `ui/messages.js` | Chat render, presets, send/regenerate |
| `ui/chat-sidebar.js` | Chat list, load/new/delete, export MD/JSON/PDF |
| `ui/agents-panel.js` | Agents list, KB card, agent editor modal |
| `ui/tabs.js` | Tab/mode switching (chats, code, forge, registered modes) |
| `ui/templates.js` | Prompt template library — load/save, modal editor, `{{var}}` fill |
| `ui/composer-extras.js` | Slash command palette, payload preview modal, composer input wiring |
| `ui/settings-shell.js` | Settings overlay — tabs, open/close, usage refresh, compaction select |
| `ui/settings-api-keys.js` | APIs pane — key validation, test buttons, status dots |
| `ui/fallback-panel.js` | Cloud failover toggles (`FALLBACK_PREFS_KEY`, `isFallbackDisabled`) |
| `ui/memory-pane.js` | Memory pane — fact CRUD, radial map, history depth sliders |
| `features/chat-stream.js` | Send, compare, abort, `streamChat`, context indicator, bubble streaming |
| `features/rag.js` | Local + Dell RAG store and query |
| `features/mcp.js` | MCP scan/discover/panel + agent tool bridge |
| `features/swarm.js` | Swarm modes, `ollamaChat`, chat injection |
| `features/routing.js` | Auto-router, Tavily/Google/Wiki/PubMed, URL fetch |
| `features/agent-tools.js` | `AGENT_TOOLS`, tool schemas, `runOneTool`, Pyodide |
| `features/file-ingest.js` | Image/PDF/text ingest, `buildAttachedFileContext`, pending attachments |
| `core/memory.js` | Agent memory (`MEM_KEY`, recall, auto-extract) |
| `core/state.js` | Shared `state` object |
| `core/constants.js` | Icons, keys, composer chips, presets |
| `core/agents-builtin.js` | Built-in agent definitions |
| `core/utils.js` | `escapeHtml`, `parseCloudModel`, `headersToObject`, … |
| `core/persistence-chats.js` | Chat list load/save (HcStorage caps) |
| `core/projects.js` | Projects/workspaces, agent run traces |
| `core/settings-runtime.js` | `readSavedSettings`, keychain hydrate, `saveSettings` factory |
| `core/backend-sync.js` | Optional Node server secret pull/push |
| `core/boot-bridge.js` | `window._H`, selection toolbar, shortcuts, command palette |
| `ui/dialogs.js` | Themed alert / confirm / prompt |

## Build

```bash
npm run build:js      # → src/js/app.bundle.js (+ .map)
npm run watch:js      # rebuild on change
```

`index.html` loads `/js/app.bundle.js` before `code-mode.js` and other modes.

## Adding a module

1. Create `core/your-feature.js` with explicit `export` functions.
2. Import from `bootstrap.js` (or a future `features/` module).
3. Run `npm run build:js` and smoke-test the shell.

## Modularization (waves 2–8)

| Wave | Modules |
|------|---------|
| 2 | `cloud-fetch`, `cloud-catalog`, `agent-turns`, `messages`, `rag` |
| 3 | `memory`, `mcp`, `swarm` |
| 4 | `settings-api-keys`, `routing`, `agent-tools` |
| 5 | `settings-shell`, `memory-pane`, `projects` |
| 6 | `chat-sidebar`, `agents-panel`, `tabs` |
| 7 | `file-ingest`, `templates`, `composer-extras`, `chat-stream`, `moonshot`, `nvidia-stream`, `local-ollama`, `fallback-panel` |
| 8 | `dialogs`, `settings-runtime`, `backend-sync`, `boot-bridge` + `tests/app-modules-smoke.test.mjs` |

See `docs/WAVE8.md` for wave 9 targets (`code-mode.js`, `virtual-os.js`).

`bootstrap.js` wires factories via `create*Api()`. After `createCloudFetchApi()`: **`createMoonshotApi()`** → **`createCloudCatalogApi()`** (moonshot fetchers + `isFallbackDisabled`) → **`createNvidiaStreamApi()`** → **`createLocalOllamaApi()`** (`wireHostPresets()`, then boot calls `loadModels()`) → **`createSettingsApiKeysApi()`**. Init `createProjectsApi()` after `SAVED`, then `createMemoryApi()` (`currentProject`). Call `createChatSidebarApi()` once `chatBelongsToCurrentProject` exists; use `chatWire` and assign `render`, `renderPending`, `setActiveTitle`, `abort`, `renderActiveAgentChip` after `createMessagesApi()`. Pass `renderMemoryPane: () => renderMemoryPane()` into `createSettingsShellApi()` (stub until `createMemoryPaneApi()` runs). Call `createTemplatesApi()` + `wireTemplateEvents(input)` after `createSettingsShellApi()`. Call `createMessagesApi()` then `createChatStreamApi()` (needs `runAssistantTurn` from messages, `buildReplyWrappedContent` / `diffBlockHtml` / `FORGE_ARCHITECT_PROMPT` from messages return). Call `createMemoryPaneApi()` after `updateContextIndicator` from chat-stream. Then `createComposerExtrasApi().wireComposerExtras()` (needs `send`, `abort`, `buildOllamaMessages`, routing/RAG). Stub `streamChat` / `buildOllamaMessages` / bubble helpers with forwarders before `createAgentTurnsApi` and `createMessagesApi`. Declare `let renderAgentsList` before `createRagApi({ renderAgentsList: () => renderAgentsList() })`. Call `createFileIngestApi()` after RAG (`addToRAG`); stub `let renderPending = () => {}` first, then reassign from `createMessagesApi()`. Call `createRoutingApi()` after file ingest; `createAgentToolsApi()` after routing; `createAgentTurnsApi()` after `streamChat`. Call `createMessagesApi()` then `createTabsApi()` (needs `render`, bucket stash/restore), then `createAgentsPanelApi()` (needs `setTab` from tabs). Exports `window._H` for other modes (`setTab`, `safeExitMode`, `registerMode`, `ingestImagesFromList`, `ingestFilesFromList`, …).

## Tests

```bash
npm test   # includes tests/app-modules-smoke.test.mjs (pure app/ factories)
```

Keep `window._H` exports stable — `code-mode.js` and `swarm-maker.js` depend on them.
