# Wave 16 — Super-module split (messages, systems, forge)

## Messages (`app/ui/messages/`)

| Module | Role |
|--------|------|
| `presets.js` | Static prompt strings |
| `render.js` | `createMessagesRenderApi` — chat UI, markdown, presets chips |
| `turn.js` | `createMessagesTurnApi` — `runAssistantTurn`, regenerate |
| `impl.js` | Composes render + turn |

## Systems (`modes/systems/`)

| Module | Role |
|--------|------|
| `domain-config.js` | `detectDomain`, `DOMAIN_CONFIG`, `inferNameFromDesc` |
| `render.js` | `createSystemsRenderApi` — full ERP preview UI (~1.4k lines) |
| `system-maker.js` | Generation, spec normalize, wire, mount (orchestrator) |

State for render uses a `st` getter/setter bridge so the orchestrator keeps existing `let` variables.

## Forge (`modes/forge/`)

| Module | Role |
|--------|------|
| `agents-routing.js` | Model scoring, provider cooldowns, `autoAssignForgeModels` |
| `constants.js`, `plan.js` | Wave 15 |
| `forge-mode.js` | Viewport (Three.js), `runGodAgent`, wire (~3.5k lines) |

Removed duplicate plan helpers from `forge-mode.js` (now imported from `plan.js` only).

## Tests

`tests/modes-modules-smoke.test.mjs` — domain detection, routing scores, factory exports.

## Wave 17 (next)

- `forge/viewport.js` — Three.js scene + CAD selection
- `forge/agents-run.js` — `runGodAgent` pipeline
- `forge/projects.js` — project save/load UI
- `systems/spec-normalize.js` — `normalizeSpec` + entity builders
- `systems/generate.js` — AI generation pipeline
