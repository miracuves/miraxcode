export { BUILTIN_AGENTS } from './agents-builtin.js';

export const PROVIDER_ICONS = {
  groq: `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true"><path d="M7 1.5L8.8 5.5H13L9.5 8.2 10.8 12.5 7 10 3.2 12.5 4.5 8.2 1 5.5H5.2L7 1.5Z" stroke="#F59E0B" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  gemini: `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true"><polygon points="7,1.5 12.5,7 7,12.5 1.5,7" stroke="#4285F4" stroke-width="1.3" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="#4285F4"/></svg>`,
  openrouter: `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="1.5" fill="#8B5CF6"/><circle cx="2" cy="3.5" r="1" fill="#8B5CF6"/><circle cx="12" cy="3.5" r="1" fill="#8B5CF6"/><circle cx="2" cy="10.5" r="1" fill="#8B5CF6"/><circle cx="12" cy="10.5" r="1" fill="#8B5CF6"/><line x1="7" y1="7" x2="2" y2="3.5" stroke="#8B5CF6" stroke-width="1"/><line x1="7" y1="7" x2="12" y2="3.5" stroke="#8B5CF6" stroke-width="1"/><line x1="7" y1="7" x2="2" y2="10.5" stroke="#8B5CF6" stroke-width="1"/><line x1="7" y1="7" x2="12" y2="10.5" stroke="#8B5CF6" stroke-width="1"/></svg>`,
  cerebras: `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="2" stroke="#06B6D4" stroke-width="1.3"/><rect x="4.5" y="4.5" width="5" height="5" rx="1" stroke="#06B6D4" stroke-width="1"/><line x1="4.5" y1="2" x2="4.5" y2="0.5" stroke="#06B6D4" stroke-width="1" stroke-linecap="round"/><line x1="9.5" y1="2" x2="9.5" y2="0.5" stroke="#06B6D4" stroke-width="1" stroke-linecap="round"/><line x1="4.5" y1="12" x2="4.5" y2="13.5" stroke="#06B6D4" stroke-width="1" stroke-linecap="round"/><line x1="9.5" y1="12" x2="9.5" y2="13.5" stroke="#06B6D4" stroke-width="1" stroke-linecap="round"/></svg>`,
  samba: `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true"><path d="M1.5 10Q4 3.5 7 7Q10 10.5 12.5 4" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round"/><path d="M1.5 6.5Q4 0 7 3.5Q10 7 12.5 0.5" stroke="#EF4444" stroke-width="1" stroke-linecap="round" opacity="0.45"/></svg>`,
  nvidia: `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true"><path d="M2 7L5 4V10L2 7Z" fill="#76B900"/><path d="M5 7L8 4V10L5 7Z" fill="#76B900" opacity="0.7"/><path d="M8 7L12 4V10L8 7Z" fill="#76B900" opacity="0.45"/></svg>`,
  minimax: `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="#F97316" stroke-width="1.3"/><path d="M5 5L9 9M9 5L5 9" stroke="#F97316" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  glm: `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="2" stroke="#3B82F6" stroke-width="1.3"/><path d="M5 5L9 7L5 9Z" fill="#3B82F6"/></svg>`,
};

export const PROJECTS_KEY = 'hashui_projects_v1';
export const DEFAULT_PROJECT_ID = 'project_personal';
export const DEFAULT_PROJECT = {
  id: DEFAULT_PROJECT_ID,
  name: 'Personal',
  instructions: '',
  memoryMode: 'default',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const AGENT_RUNS_KEY = 'hashui_agent_runs_v1';

export const BUILTIN_BODY_MODE_CLASSES = [
  'agent-maker-mode',
  'system-maker-mode',
  'forge-studio-mode',
  'virtual-os-mode',
  'coder-mode',
  'finance-mode',
];

export const LAZY_MODE_TABS = new Set([
  'finance',
  'sandbox',
  'agent-maker',
  'systems',
  'forge',
  'virtual-os',
]);

export const COMPOSER_CHIPS = {
  default: [
    { preset: 'hashAi', label: `<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true" style="vertical-align:-1px"><path d="M8 1.5l1.6 4.9L15 8l-5.4 1.6L8 14.5l-1.6-4.9L1 8l5.4-1.6z"/></svg> MiraXcode`, title: 'Prime MiraXcode system rules' },
    { preset: 'fullstack', label: 'Full Stack', title: 'Pro 2026 full-stack website brief' },
    { preset: 'mobile', label: 'Mobile App', title: 'Pro 2026 mobile app brief' },
    { preset: 'freeRam', label: `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" style="vertical-align:-1px"><polyline points="10,2 6,8.5 9.5,8.5 6,14"/></svg> Free RAM`, accent: true, title: 'Unload every model on the local host to free RAM and enable speed mode' },
  ],
  code: [
    { preset: 'fullstack', label: '⌘ Full-stack app', title: 'Scaffold a production full-stack web app' },
    { preset: 'mobile', label: '⌘ Mobile app', title: 'Scaffold a production React Native app' },
    { preset: 'restApi', label: '⌘ REST API + auth', title: 'Build a secured REST API with auth, validation, rate-limit' },
    { preset: 'refactor', label: '⌘ Refactor', title: 'Refactor a pasted file/function for clarity, perf, a11y' },
    { preset: 'explainErr', label: '⌘ Explain error', title: 'Paste an error/stack trace — get cause + fix' },
    { preset: 'writeTests', label: '⌘ Write tests', title: 'Write unit + integration tests for a pasted file' },
    { preset: 'debug', label: '⌘ Debug', title: 'Systematic debug walkthrough of a pasted snippet' },
    { preset: 'optimize', label: '⌘ Optimize', title: 'Improve speed, bundle size, memory, query cost' },
    { preset: 'codeReview', label: '⌘ Code review', title: 'Senior-staff code review of a pasted PR/diff' },
    { preset: 'freeRam', label: `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" style="vertical-align:-1px"><polyline points="10,2 6,8.5 9.5,8.5 6,14"/></svg> Free RAM`, accent: true, title: 'Unload every model on the local host to free RAM and enable speed mode' },
  ],
  forge: [
    { preset: 'forgeScaffold', label: 'Forge scaffold', title: 'Generate the Vite/React/Three.js scaffold and dependency plan' },
    { preset: 'forgeTypes', label: 'Type system', title: 'Write the Forge geometry and swarm TypeScript types first' },
    { preset: 'forgeAgent', label: 'AI protocol', title: 'Design the generate_geometry_plan tool schema and streaming parser' },
    { preset: 'forgeSwarm', label: 'Swarm particles', title: 'Implement Bezier particles, instanced trails, and solidification' },
    { preset: 'forgePhases', label: '7 phases', title: 'Break Forge into the 7 build phases with done criteria' },
    { preset: 'freeRam', label: `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" style="vertical-align:-1px"><polyline points="10,2 6,8.5 9.5,8.5 6,14"/></svg> Free RAM`, accent: true, title: 'Unload every model on the local host to free RAM and enable speed mode' },
  ],
};

export const HOST_PRESETS_KEY = 'hashui_host_presets_v1';
export const BUILTIN_PRESETS = [
  { label: 'Off — disable local Ollama', url: '', builtin: true },
  { label: 'Local (this Mac)', url: 'http://127.0.0.1:11434', builtin: true },
  { label: 'Local (alt: localhost)', url: 'http://localhost:11434', builtin: true },
  { label: 'LAN — common /24', url: 'http://192.168.1.107:11434', builtin: true },
];
