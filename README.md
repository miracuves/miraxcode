<div align="center">

# MiraXCode

**Local-first AI workspace · Eleven modes · Multi-provider · Zero telemetry**

[Repository](https://github.com/miracuves/miraxcode) · [Issues](https://github.com/miracuves/miraxcode/issues) · [Discussions](https://github.com/miracuves/miraxcode/discussions)

![License: MIT](https://img.shields.io/badge/license-MIT-39ff81.svg)
![Platform: macOS](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon-39ff81.svg)
![Version: 2.0.0](https://img.shields.io/badge/version-2.0.0-39ff81.svg)

</div>

![MiraXCode main interface](https://github.com/user-attachments/assets/120dfafa-a778-4758-8314-83dc41752a28)

---

## What is MiraXCode?

**MiraXCode** is a local-first, open-source AI desktop application that combines a multi-provider chat workspace, an autonomous coding IDE, multi-agent swarms, specialist agents, financial analysis, security scanning, 3D planning, and a virtual project desktop — in one native app built with **Tauri v2**, **Rust**, and a modular **JavaScript** shell.

API keys live in the **OS keychain** (never in git or plaintext config). There is **no MiraXCode cloud backend**, no telemetry, no accounts, and no subscriptions. With **Ollama**, the app runs fully offline. With cloud providers, requests go **directly** from your machine to the provider you chose.

MiraXCode is a free, MIT-licensed alternative to tools like Cursor, Claude Code, Continue, Aider, and Cline — with a broader built-in mode set and explicit local-first guarantees.

---

## Key facts

| | |
|---|---|
| **Type** | Native AI desktop application |
| **Platform** | macOS Apple Silicon (Windows/Linux planned) |
| **License** | MIT |
| **Version** | v2.0.0 |
| **Stack** | Tauri v2 · Rust · ES modules (esbuild) · Monaco · macOS Keychain |
| **AI providers** | Anthropic · OpenAI · Google · Groq · Cerebras · SambaNova · DeepSeek · Moonshot/Kimi · Mistral · OpenRouter · NVIDIA NIM · Ollama (local) |
| **Modes** | 11 specialized workspaces |
| **Pre-built agents** | 9 specialists + custom Agent Maker |
| **Telemetry** | None |
| **Backend** | None required (optional local Node sync for dev) |

---

## Why MiraXCode

- **Truly local-first** — No product cloud, no analytics pipeline, no mandatory sign-in.
- **Multi-provider BYOK** — Configure many providers side-by-side; cloud failover and swarm routing when a model fails or rate-limits.
- **One app, eleven modes** — Chat, code, swarms, research, finance, security, 3D, ERP prototypes, virtual OS — without juggling separate products.
- **OS-grade secrets** — Keychain-backed API storage; settings JSON strips key material on save. See [docs/PRODUCTION.md](docs/PRODUCTION.md).
- **Modular, testable shell** — Main UI split into `src/js/app/` factories (esbuild bundle) with smoke tests and CI.
- **Open source** — Inspect, fork, and ship your own build under MIT.

---

## Screenshots

![Code mode with file explorer and agent chat](https://github.com/user-attachments/assets/00a538b5-bf12-4a24-aa23-3bc3a191840a)

![Agent Swarm orchestration](https://github.com/user-attachments/assets/a07931d6-6e4c-4221-9ab2-cb3668fc70e2)

![Finance AI analysis studio](https://github.com/user-attachments/assets/5e2cdc5c-854a-4331-a786-97a6337f0121)

![3D Forge spatial planning](https://github.com/user-attachments/assets/305cd8ef-d77f-4f52-9bbb-c0c0ede2ac75)

---

## The 11 modes

| # | Mode | What it does |
|---|---|---|
| 1 | **Chats** | Multi-provider chat with projects, attachments, slash commands, templates, exports (MD/JSON), and capped local persistence |
| 2 | **Agents** | Nine built-in specialists + custom agents via Agent Maker |
| 3 | **Code (MiraXCode Coder)** | IDE-style coding agent: Monaco editor, file tree, LSP client, diagnostics, project RAG, command palette, staged reads, shell tools |
| 4 | **Split** | Side-by-side comparison of two models on the same prompt |
| 5 | **3D Forge** | Architecture-first 3D planning (structured spatial plans) |
| 6 | **Finance AI** | Bank statements, CSV/PDF/XLSX — KPIs and charts grounded in uploaded data |
| 7 | **Sandbox** | Swarm-based security scan for suspicious patterns in code or AI output |
| 8 | **ERP / Systems Builder** | Interactive prototypes (forms, tables, dashboards) from workflow descriptions |
| 9 | **Agent Swarm** | Multi-agent pipelines with voting/chain modes and provider failover |
| 10 | **Virtual OS** | Simulated desktop where an agent creates and organizes project files |
| 11 | **Agent Maker** | No-code custom agents (name, icon, system prompt, tool sets) |

Mode reference: [MODES_GUIDE.txt](MODES_GUIDE.txt) (also branded MiraXCode in-repo).

---

## Built-in agents

Personal Assistant · Quick Assistant · Research Agent · Deep Research · Senior Engineer · Page Analyzer · PubMed Agent · Drug Interaction · ATS CV Auditor — plus user-defined agents from Agent Maker.

Source-grounded constraints apply in research, PubMed, drug-interaction, and finance flows (no fabricated citations or numbers).

---

## Platform features (v2.0)

### Chat shell (`src/js/app/`)

- **esbuild modular shell** — 40+ modules: providers, features, UI, core wiring via `create*Api()` factories
- **Projects / workspaces** — Per-project chats, instructions, memory mode, agent run traces
- **Agent memory** — Fact store with synonym recall and auto-extract from conversation
- **RAG** — Local knowledge base + optional project ingest (`CdrProjectRag`)
- **MCP** — Server scan, tool discovery, prefs panel, OpenAI-compatible tool bridge
- **Auto-router** — Heuristic routing (code / medical / news / reasoning) with Tavily, Google CSE, Wikipedia, PubMed, URL fetch
- **Chat stream** — Streaming bubbles, compare mode, abort, context window indicator, compaction preference
- **File ingest** — Images, PDFs, text attachments with composer context
- **Templates & slash palette** — Prompt library with `{{var}}` fill-in
- **Settings** — Key validation probes, usage chips, privacy-local toggle, optional backend secret sync (dev)
- **UI polish** — Themed dialogs, selection toolbar (quote/explain/fix), global shortcuts, command palette

### Providers

- **Cloud catalog** — OpenAI, Gemini, Anthropic, Groq, OpenRouter, and more via unified `cloud:` model IDs
- **Moonshot / Kimi** — Multi-base failover (`sk-ki…` Anthropic-compatible routes)
- **NVIDIA NIM** — Dedicated SSE streaming path
- **Ollama** — Local models, host presets, model unload / free-RAM preset
- **Native HTTP** — Tauri-side requests and SSE where available
- **Failover panel** — Per-provider cloud fallback preferences

### Coder / IDE (`code-mode.js` + `cdr-*`)

- **Monaco** editor (bundled vendor)
- **LSP client**, diagnostics parser (TS/rust/etc.)
- **Virtualized chat**, command palette, goto, mentions
- **Project lint**, staged file reads, file-stage workflow
- **Coder memory & skills**, Graphify integration hooks
- **Agent stream** bridge to main shell `window._H`

### Security & reliability (Rust + JS)

- **Permission guard** — Denylist/allowlist before FS and shell from agents
- **Audit log** — Append-only local log of guarded actions
- **Keychain commands** — Rust-backed secret storage
- **HcStorage** — Trimmed chat/message persistence caps
- **HcHealth** — Local error capture only (no remote reporting)

### Quality

- **CI** — `.github/workflows/ci.yml` (build + tests)
- **Tests** — `hc-storage`, `cdr-diagnostics`, `app-modules-smoke` (routing, memory, settings, MCP names, Kimi keys)

---

## Supported AI providers

### Cloud (bring your own API key)

| Provider | Notes |
|---|---|
| **Anthropic** | Claude family |
| **OpenAI** | GPT family |
| **Google** | Gemini |
| **Groq** | Fast Llama/Mixtral inference |
| **Cerebras** | Ultra-fast inference |
| **SambaNova** | Hosted open models |
| **DeepSeek** | V3, R1 |
| **Moonshot** | Kimi (multi-base + code keys) |
| **Mistral** | Mistral family |
| **OpenRouter** | Meta-provider gateway |
| **NVIDIA NIM** | Cloud inference (when key configured) |

### Local

| Provider | Notes |
|---|---|
| **Ollama** | Any local model; no API key; air-gapped capable |

Keys are stored in the **macOS Keychain** (Tauri). They are not written to the repository and are cleared from `localStorage` settings on save.

---

## Install

### macOS (Apple Silicon)

1. Download the latest **MiraXcode** DMG from [Releases](https://github.com/miracuves/miraxcode/releases) when published
2. Open the DMG and drag **MiraXcode** to `/Applications`
3. On first launch with an unsigned build: right-click → **Open** → **Open**
4. **Settings → Providers** — add API keys, or use Ollama only

```bash
# Unsigned build quarantine workaround
xattr -dr com.apple.quarantine /Applications/MiraXcode.app
```

---

## Build from source

```bash
git clone https://github.com/miracuves/miraxcode.git
cd miraxcode
npm install
npm run build:js    # bundle src/js/app → app.bundle.js
npm run tauri dev
```

Release build:

```bash
npm run tauri build
```

Tests:

```bash
npm test
```

### Requirements

- macOS (primary), Node 18+, Rust (`rustup`), Xcode Command Line Tools

### Project layout (high level)

```
miraxcode/
├── src/                 # Frontend (HTML, CSS, JS modes)
│   └── js/app/          # Modular main shell (esbuild entry)
├── src-tauri/           # Rust commands, security, keychain
├── docs/                # Architecture, production, wave notes
└── tests/               # Node test runner smoke/unit tests
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [src/js/app/README.md](src/js/app/README.md)

---

## Privacy and security

- **No product backend** — AI traffic goes only to providers you configure
- **No telemetry** — No usage analytics or remote crash pipeline
- **Keychain-first secrets** — See [SECURITY.md](SECURITY.md)
- **Permission guard + audit log** — Gated filesystem/shell for coding agents
- **Air-gapped path** — Full offline use with Ollama

---

## How MiraXCode compares

| | MiraXCode | Cursor | Claude Code | Continue | Aider | Cline |
|---|---|---|---|---|---|---|
| Type | Native desktop | VS Code fork | CLI | IDE extension | Terminal | VS Code ext |
| License | MIT | Proprietary | Proprietary | Apache 2.0 | Apache 2.0 | Apache 2.0 |
| Local-first product cloud | No | No | No | N/A | Yes | Yes |
| OS Keychain for keys | Yes | No | Partial | No | No | No |
| Many cloud providers | Yes | Limited | Anthropic-focused | Yes | Yes | Yes |
| Ollama / local | Yes | Limited | No | Yes | Yes | Yes |
| Multi-agent swarms | Yes | No | No | No | No | No |
| Non-coding modes | 11 | No | No | No | No | No |
| Built-in specialist agents | 9+ | — | — | — | — | — |
| Telemetry | None | Yes | Opt-out | Opt-in | None | None |

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Shift + N` | New chat |
| `Cmd/Ctrl + Shift + C` | Toggle Coder mode |
| `Cmd/Ctrl + K` | Focus model picker |

Command palette entries register when `MxCommandPalette` is loaded.

---

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tauri layout, phases, directory map |
| [docs/PRODUCTION.md](docs/PRODUCTION.md) | Storage caps, health, keychain behavior |
| [docs/WAVE8.md](docs/WAVE8.md) | Shell modularization notes |
| [SECURITY.md](SECURITY.md) | Guard, audit log, threat model |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup and conventions |
| [src/js/app/README.md](src/js/app/README.md) | Module map and init order |

---

## Roadmap

- Signed macOS builds and GitHub Releases on [miracuves/miraxcode](https://github.com/miracuves/miraxcode)
- Intel macOS, Windows, and Linux targets
- Further split of `code-mode.js` and `virtual-os.js` into `modes/`
- Optional TypeScript on `app/` modules
- Expanded Permission Guard coverage in Virtual OS / 3D Forge

Feature requests: [GitHub Issues](https://github.com/miracuves/miraxcode/issues).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributions that respect local-first principles (no mandatory cloud, no telemetry) are especially welcome.

---

## License

MIT — see [LICENSE](LICENSE). Copyright **Miracuves**.

---

<div align="center">

**MiraXCode**

Local-first · Multi-provider · Agent swarms · Open source

[github.com/miracuves/miraxcode](https://github.com/miracuves/miraxcode)

</div>
