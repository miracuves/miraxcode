# Wave 17 — Forge viewport/agents split, systems spec/generate

## Forge (`modes/forge/`)

| Module | Role |
|--------|------|
| `projects.js` | `createForgeProjectsApi` — localStorage projects, save/open/delete |
| `viewport.js` | `createForgeViewportApi` — Three.js scene, CAD selection, import/export |
| `prompts.js` | `createForgePromptsApi` — prompt classification (parametric / anatomical / organic) |
| `plans-samples.js` | `createForgePlansSamplesApi` — built-in sample plans (logo, rover, house, …) |
| `agents-run.js` | `createForgeAgentsRunApi` — `runGodAgent`, LLM plan pipeline, template plans |
| `wire.js` | `createForgeWireApi` — `wireEvents`, `mount`, `destroy` |
| `forge-mode.js` | Orchestrator (~430 lines): `st` bridge, lazy API init, `window.ForgeMode` |

Shared mutable Three.js / project state uses a `st` getter/setter bridge (same pattern as systems render in Wave 16).

## Systems (`modes/systems/`)

| Module | Role |
|--------|------|
| `spec-normalize.js` | `createSystemsSpecApi` — `defaultFields`, `normalizeSpec`, mock row generators |
| `generate.js` | `createSystemsGenerateApi` — prompts, `generateWithModel`, `createSystem`, finance enrichment |
| `system-maker.js` | Orchestrator (~750 lines): storage, trace, render delegate, wire, mount |

## Tests

`tests/modes-modules-smoke.test.mjs` — factory exports, prompt route, sample plan, spec normalize.

## Wave 18 (optional)

- `messages/format.js` — markdown helpers from `render.js`
- Further shrink `agents-run.js` (template plans → `plans-templates.js`)
