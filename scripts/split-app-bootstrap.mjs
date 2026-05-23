/**
 * One-time maintainer script: wires bootstrap.js to ES module imports.
 * Run: node scripts/split-app-bootstrap.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const appDir = path.resolve('src/js/app');
const bootstrapPath = path.join(appDir, 'bootstrap.js');
let src = fs.readFileSync(bootstrapPath, 'utf8');

const asyncMarker = '(async () => {';
const idx = src.indexOf(asyncMarker);
if (idx < 0) throw new Error('bootstrap: async IIFE not found');

const runtime = src.slice(0, idx).trim();
fs.writeFileSync(path.join(appDir, 'runtime.js'), `${runtime}\n`);

// agents-builtin.js
const lines = src.split('\n');
const agentStart = lines.findIndex((l) => l.includes('const BUILTIN_AGENTS = ['));
let agentEnd = -1;
for (let i = agentStart + 1; i < lines.length; i++) {
  if (lines[i].trim() === '];') { agentEnd = i; break; }
}
if (agentStart < 0 || agentEnd < 0) throw new Error('BUILTIN_AGENTS block not found');

let body = src.slice(idx);
body = body.replace(asyncMarker, 'export async function boot() {');
body = body.replace(/\}\)\(\);\s*$/, '}\n');

const importHeader = `import {
  PROVIDER_ICONS,
  BUILTIN_AGENTS,
  PROJECTS_KEY,
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT,
  AGENT_RUNS_KEY,
  BUILTIN_BODY_MODE_CLASSES,
  LAZY_MODE_TABS,
  COMPOSER_CHIPS,
  HOST_PRESETS_KEY,
  BUILTIN_PRESETS,
} from './core/constants.js';
import { state } from './core/state.js';
import {
  uid,
  escapeHtml,
  parseCloudModel,
  headersToObject,
  safeHost,
} from './core/utils.js';
import {
  loadChats,
  saveChats,
  saveCodeChats,
  saveForgeChats,
} from './core/persistence-chats.js';

`;

body = importHeader + body;

const removals = [
  [/  const PROVIDER_ICONS = \{[\s\S]*?  \};\n\n/, ''],
  [/  \/\/ Ready-made agents\n  const BUILTIN_AGENTS = \[[\s\S]*?  \];\n\n/, ''],
  [/  \/\/ ========= State =========\n  const state = \{[\s\S]*?  \};\n\n/, ''],
  [/  const uid = \(\) => Date\.now\(\)[\s\S]*?;\n\n/, ''],
  [/  function safeHost\(\) \{\n    return window\.MiraXcodeRuntime\.getHost\(\);\n  \}\n\n/, ''],
  [
    /  function loadChats\(\) \{[\s\S]*?  function saveForgeChats\(\) \{[\s\S]*?  \}\n/,
    '',
  ],
  [/  const PROJECTS_KEY = "hashui_projects_v1";\n  const DEFAULT_PROJECT_ID[\s\S]*?  \};\n\n/, ''],
  [/  const AGENT_RUNS_KEY = "hashui_agent_runs_v1";\n\n/, ''],
  [
    /  const BUILTIN_BODY_MODE_CLASSES = \[[\s\S]*?\];\n  const LAZY_MODE_TABS = new Set\(\[[\s\S]*?\]\);\n\n/,
    '',
  ],
  [/  const COMPOSER_CHIPS = \{[\s\S]*?  \};\n/, ''],
  [
    /  const HOST_PRESETS_KEY = "hashui_host_presets_v1";\n  const BUILTIN_PRESETS = \[[\s\S]*?  \];\n/,
    '',
  ],
  [/  function headersToObject\(raw\) \{[\s\S]*?  \}\n\n/, ''],
  [
    /  \/\/ Parse "cloud:provider:modelId"[\s\S]*?  function parseCloudModel\(val\) \{[\s\S]*?  \}\n\n/,
    '',
  ],
  [
    /  const _esc = \{[^}]+\};\n  function escapeHtml\(s\) \{ return String\(s\)\.replace\(\/\[&<>"'\]\/g, c => _esc\[c\]\); \}\n/,
    '',
  ],
];

for (const [re, rep] of removals) {
  body = body.replace(re, rep);
}

fs.writeFileSync(bootstrapPath, body);
console.log('split-app-bootstrap: runtime.js, core/agents-builtin.js, patched bootstrap.js');
