/** Forge mode shared constants (Wave 15). */
export const ROLE_COLORS = {
  structure: 0x4bd2be,
  surface: 0xf5c97a,
  detail: 0x8fb7ff,
  audit: 0xff8f8f,
};

export const AGENTS = [
  { id: 'god', name: 'Parameter Agent', role: 'one JSON geometry call', color: '#e7fbf7' },
  { id: 'structure', name: 'Structure Agent', role: 'load-bearing / support parts', color: '#9ff4e7' },
  { id: 'surface', name: 'Surface Agent', role: 'silhouette / material panels', color: '#f5c97a' },
  { id: 'detail', name: 'Detail Agent', role: 'handles, bolts, seams, grooves', color: '#8fb7ff' },
  { id: 'audit', name: 'Audit Agent', role: 'clearance / balance / symmetry', color: '#ff8f8f' },
];

export const FLOOR_Y = -1.15;
export const MAX_FORGE_NODES = 96;
export const PROJECT_STORE_KEY = 'hashui_forge_projects';

export const FORGE_REFERENCE_SOURCES = [
  'sketchfab.com',
  'grabcad.com',
  'thingiverse.com',
  'printables.com',
  'cgtrader.com',
  'turbosquid.com',
  'free3d.com',
  'blendswap.com',
  'polyhaven.com',
  'blenderartists.org',
];

export const FORGE_BLOCKED_REFERENCE_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'instagram.com',
  'pinterest.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
];

export const FORGE_ALLOWED_MODEL_PROVIDERS = new Set([
  'groq', 'gemini', 'cerebras', 'samba', 'sambanova', 'openrouter', 'minimax', 'glm', 'nvidia', 'local',
]);
