/**
 * Smoke tests for pure app/ modules (no DOM bundle required).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSavedSettings, SETTINGS_KEY } from '../src/js/app/core/settings-runtime.js';
import { isKimiCodeKey } from '../src/js/app/providers/moonshot.js';
import { mcpSafeToolName } from '../src/js/app/features/mcp.js';
import { createRoutingApi } from '../src/js/app/features/routing.js';
import { createMemoryApi, MEM_KEY } from '../src/js/app/core/memory.js';
import { state } from '../src/js/app/core/state.js';

const storage = {};
const localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
};
globalThis.localStorage = localStorage;

test('readSavedSettings returns object for valid JSON', () => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ host: 'http://127.0.0.1:11434', temp: '0.5' }));
  const s = readSavedSettings();
  assert.equal(s.host, 'http://127.0.0.1:11434');
  assert.equal(s.temp, '0.5');
});

test('readSavedSettings returns {} for invalid JSON', () => {
  localStorage.setItem(SETTINGS_KEY, 'not-json{{{');
  assert.deepEqual(readSavedSettings(), {});
});

test('isKimiCodeKey detects sk-ki prefix', () => {
  assert.equal(isKimiCodeKey('sk-ki-abc'), true);
  assert.equal(isKimiCodeKey('SK-KI-xyz'), true);
  assert.equal(isKimiCodeKey('sk-or-v1'), false);
  assert.equal(isKimiCodeKey(''), false);
});

test('mcpSafeToolName sanitizes server and tool names', () => {
  const name = mcpSafeToolName('my-server!', 'tool.name');
  assert.match(name, /^mcp_my_server__tool_name$/);
});

test('routing classifyMessage picks code route for fenced blocks', () => {
  const routing = createRoutingApi({
    tavilyKeyEl: { value: '' },
    googleKeyEl: { value: '' },
    googleCxEl: { value: '' },
    rewriterEl: null,
    privacyLocalEl: { checked: false },
    nvidiaKeyEl: { value: '' },
    autoRouterEl: { checked: true },
    backendSyncTokenEl: { value: '' },
    makeSignal: () => ({}),
    backendAuthHeaders: () => ({}),
    getBackendAuthRequired: () => false,
    getBackendFetchProxyAvailable: () => false,
    addToRAG: () => {},
  });
  const r = routing.classifyMessage('please fix this:\n```js\nconst x=1\n```', false);
  assert.equal(r.route, 'dell');
  assert.equal(r.reason, 'code-related');
});

test('memory memAdd and memRecall return matching facts', () => {
  localStorage.removeItem(MEM_KEY);
  state.currentProjectId = 'default';
  const currentProject = () => ({ id: 'default', name: 'Default', memoryMode: 'personal' });
  const { memAdd, memRecall } = createMemoryApi({
    uid: () => 'id1',
    currentProject,
    DEFAULT_PROJECT_ID: 'default',
  });
  memAdd('color', 'blue');
  const recalled = memRecall('color', 5);
  assert.ok(recalled.length >= 1);
  assert.equal(recalled[0].value, 'blue');
});
