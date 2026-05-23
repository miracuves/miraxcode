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
