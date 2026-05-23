# Wave 15 — Module splits + messages ES modules

## Messages (app shell)

Replaced `new Function()` wrapper in `app/ui/messages.js` with real ES modules:

| File | Role |
|------|------|
| `app/ui/messages/presets.js` | `LOOK_2026`, `PRESET_PROMPTS`, Forge/coding preset strings |
| `app/ui/messages/impl.js` | `createMessagesApi(deps)` factory (render, send, presets) |
| `app/ui/messages.js` | Re-exports `createMessagesApi` |

`app/_extract/messages.js` remains as the historical extract source; runtime uses `messages/impl.js`.

## Forge (`modes/forge/`)

| File | Role |
|------|------|
| `constants.js` | Agents, role colors, store keys, provider allowlist |
| `plan.js` | `normalizePlan`, primitive builders, mesh import helpers |

`forge-mode.js` orchestrator imports these; viewport/agents/wire remain in the IIFE for now.

## Systems (`modes/systems/`)

| File | Role |
|------|------|
| `constants.js` | Domain themes, shell options, screen lists, KPI icons |
| `utils.js` | `esc`, `slug`, `fieldType`, storage helpers |

`system-maker.js` still holds generation, render, and wire logic (~4k lines).

## Tests

- `tests/modes-modules-smoke.test.mjs` — import checks for new modules

## Wave 16 (optional)

- `forge/viewport.js`, `forge/agents-run.js` APIs
- `systems/spec-normalize.js`, `systems/render.js`
- Split `messages/impl.js` into render vs turn modules
