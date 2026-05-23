/**
 * Wave 15 — smoke imports for extracted mode/app modules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENTS, MAX_FORGE_NODES, ROLE_COLORS } from '../src/js/modes/forge/constants.js';
import { normalizePlan, box, vec3 } from '../src/js/modes/forge/plan.js';
import { DOMAIN_BG, VALID_SCREENS, MAX_HISTORY } from '../src/js/modes/systems/constants.js';
import { esc, slug, fieldType } from '../src/js/modes/systems/utils.js';
import { PRESET_PROMPTS, FORGE_ARCHITECT_PROMPT } from '../src/js/app/ui/messages/presets.js';
import { createMessagesRenderApi } from '../src/js/app/ui/messages/render.js';
import { createMessagesTurnApi } from '../src/js/app/ui/messages/turn.js';
import { detectDomain, DOMAIN_CONFIG } from '../src/js/modes/systems/domain-config.js';
import { createForgeAgentsRoutingApi } from '../src/js/modes/forge/agents-routing.js';
import { createSystemsRenderApi } from '../src/js/modes/systems/render.js';
import { createSystemsSpecApi } from '../src/js/modes/systems/spec-normalize.js';
import { createSystemsGenerateApi } from '../src/js/modes/systems/generate.js';
import { createForgeProjectsApi } from '../src/js/modes/forge/projects.js';
import { createForgeViewportApi } from '../src/js/modes/forge/viewport.js';
import { createForgePromptsApi } from '../src/js/modes/forge/prompts.js';
import { createForgePlansSamplesApi } from '../src/js/modes/forge/plans-samples.js';
import { createForgeAgentsRunApi } from '../src/js/modes/forge/agents-run.js';
import { createForgeWireApi } from '../src/js/modes/forge/wire.js';

test('forge constants and plan helpers', () => {
  assert.equal(AGENTS.length, 5);
  assert.ok(ROLE_COLORS.structure);
  assert.equal(MAX_FORGE_NODES, 96);
  const plan = normalizePlan({ nodes: [{ id: 'a', type: 'box', role: 'structure', position: [0, 0, 0] }] });
  assert.equal(plan.nodes.length, 1);
  assert.deepEqual(vec3([1, 2, 3], [0, 0, 0]), [1, 2, 3]);
  const node = box('b1', 'Block', 'structure', [0, 0, 0], [1, 2, 3], '#fff');
  assert.equal(node.type, 'box');
});

test('systems constants and utils', () => {
  assert.ok(DOMAIN_BG.restaurant);
  assert.ok(VALID_SCREENS.includes('dashboard'));
  assert.equal(MAX_HISTORY, 12);
  assert.equal(esc('<b>'), '&lt;b&gt;');
  assert.equal(slug('Hello World'), 'hello_world');
  assert.equal(fieldType(42, 'amount'), 'number');
});

test('message presets export expected keys', () => {
  assert.ok(PRESET_PROMPTS.hashAi);
  assert.ok(PRESET_PROMPTS.forgeScaffold);
  assert.ok(FORGE_ARCHITECT_PROMPT.includes('3D Forge'));
});

test('messages render and turn factories are functions', () => {
  assert.equal(typeof createMessagesRenderApi, 'function');
  assert.equal(typeof createMessagesTurnApi, 'function');
});

test('systems domain-config detects restaurant', () => {
  assert.equal(detectDomain('pizza restaurant POS'), 'restaurant');
  assert.ok(DOMAIN_CONFIG.restaurant?.modules?.length > 0);
});

test('systems render factory exports renderAll', () => {
  assert.equal(typeof createSystemsRenderApi, 'function');
});

test('wave 17 factory modules export create*Api', () => {
  assert.equal(typeof createSystemsSpecApi, 'function');
  assert.equal(typeof createSystemsGenerateApi, 'function');
  assert.equal(typeof createForgeProjectsApi, 'function');
  assert.equal(typeof createForgeViewportApi, 'function');
  assert.equal(typeof createForgePromptsApi, 'function');
  assert.equal(typeof createForgePlansSamplesApi, 'function');
  assert.equal(typeof createForgeAgentsRunApi, 'function');
  assert.equal(typeof createForgeWireApi, 'function');
});

test('forge prompts classify parametric route', () => {
  const api = createForgePromptsApi();
  assert.equal(api.classifyForgePrompt('a wooden chair').route, 'parametric');
});

test('forge sample plans include intro logo', () => {
  const api = createForgePlansSamplesApi({ classifyForgePrompt: () => ({ route: 'parametric' }) });
  const plan = api.hLogoPlan();
  assert.ok(plan.nodes?.length >= 2);
  assert.equal(plan._introLogo, true);
});

test('systems spec normalize builds entities', () => {
  const api = createSystemsSpecApi({ getRuntimeData: () => ({}) });
  const spec = api.normalizeSpec({ name: 'Test', modules: [{ id: 'm1', name: 'Sales', entity: 'orders' }] }, 'sales CRM');
  assert.ok(spec.entities);
  assert.ok(Object.keys(spec.entities).length > 0);
});

test('forge agents routing scores free models lower on big tasks', () => {
  const api = createForgeAgentsRoutingApi({ $: () => null, log: () => {}, cooldowns: new Map() });
  const free = api.modelStrengthScore('cloud:groq:llama-free', 'Llama Free', true);
  const pro = api.modelStrengthScore('cloud:openrouter:anthropic/claude-opus', 'Claude Opus', true);
  assert.ok(pro > free);
});
