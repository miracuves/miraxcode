# Wave 18 — Messages format + forge template plans

## Messages (`app/ui/messages/`)

| Module | Role |
|--------|------|
| `format.js` | `createMessagesFormatApi` — marked/DOMPurify rendering, mermaid, copy-code wiring, WeakMap cache |
| `render.js` | Composes format API; chat list / bubbles / presets |
| `impl.js` | Composes render + turn |

## Forge (`modes/forge/`)

| Module | Role |
|--------|------|
| `plans-templates.js` | Mesh geometry builders, `fallbackPlan`, procedural template plans (knife, spoon, table, phone, …) |
| `agents-run.js` | God-agent pipeline (~1.2k lines); imports templates API for mesh helpers + fallback |
| `plans-samples.js` | Demo/sample plans (logo, rover, house, …) unchanged from Wave 17 |

## Tests

`tests/modes-modules-smoke.test.mjs` — `createMessagesFormatApi`, `createForgePlansTemplatesApi`, knife `fallbackPlan`.
