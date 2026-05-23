import { state } from './state.js';

export const MEM_KEY = 'hashui_agent_memory_v1';

const MEM_MAX_FACTS = 500;

const MEM_SYNONYMS = [
  ['love', 'loves', 'loved', 'loving', 'like', 'likes', 'liked', 'liking', 'favorite', 'favourite', 'favorites', 'favourites', 'favored', 'prefer', 'prefers', 'preferred', 'preference', 'preferences', 'enjoy', 'enjoys', 'enjoyed', 'fan', 'into', 'adore', 'adores'],
  ['hate', 'hates', 'hated', 'dislike', 'dislikes', 'disliked', 'loathe', 'loathes', 'despise', 'despises'],
  ['animal', 'animals', 'pet', 'pets', 'creature', 'creatures'],
  ['work', 'works', 'working', 'job', 'jobs', 'career', 'employer', 'company', 'employed', 'occupation', 'profession'],
  ['live', 'lives', 'living', 'home', 'city', 'town', 'reside', 'resides', 'based', 'located', 'location', 'address'],
  ['name', 'named', 'called', 'calls'],
  ['birthday', 'birth', 'born', 'dob', 'age'],
  ['family', 'spouse', 'wife', 'husband', 'partner', 'kid', 'kids', 'child', 'children', 'son', 'daughter', 'mom', 'dad', 'mother', 'father', 'brother', 'sister'],
  ['food', 'foods', 'eat', 'eats', 'cuisine', 'meal', 'dish', 'snack'],
  ['drink', 'drinks', 'beverage', 'coffee', 'tea', 'alcohol'],
  ['music', 'song', 'songs', 'band', 'artist', 'genre'],
  ['movie', 'movies', 'film', 'films', 'show', 'shows', 'series'],
  ['color', 'colors', 'colour', 'colours'],
  ['language', 'languages', 'speak', 'speaks', 'spoken'],
  ['project', 'projects', 'building', 'builds', 'working_on'],
  ['deadline', 'deadlines', 'due', 'by', 'ship', 'launch'],
  ['goal', 'goals', 'aim', 'aims', 'plan', 'plans', 'target', 'targets'],
  ['allergy', 'allergies', 'allergic', 'intolerant'],
];

const MEM_SYN_MAP = (() => {
  const m = new Map();
  for (const group of MEM_SYNONYMS) for (const w of group) m.set(w, group);
  return m;
})();

export function createMemoryApi(deps) {
  const { uid, currentProject, DEFAULT_PROJECT_ID } = deps;

  function memLoad() {
    try {
      const raw = localStorage.getItem(MEM_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(f => ({
        id: f.id || uid(),
        key: String(f.key || '').slice(0, 120),
        value: String(f.value || '').slice(0, 1200),
        ts: Number(f.ts) || Date.now(),
        projectId: f.projectId || DEFAULT_PROJECT_ID,
        scope: f.scope || (f.projectId && f.projectId !== DEFAULT_PROJECT_ID ? 'project' : 'personal'),
        confidence: Number.isFinite(f.confidence) ? f.confidence : 1,
        approved: f.approved !== false,
        source: f.source || 'chat',
      })).filter(f => f.key && f.value) : [];
    } catch { return []; }
  }

  function memSave(arr) {
    try {
      while (arr.length > MEM_MAX_FACTS) arr.shift();
      localStorage.setItem(MEM_KEY, JSON.stringify(arr));
    } catch {}
  }

  function memAdd(key, value) {
    const k = String(key || '').trim().slice(0, 120);
    const v = String(value || '').trim().slice(0, 1200);
    if (!k || !v) return { ok: false, error: 'key and value are required' };
    const arr = memLoad();
    const projectOnly = currentProject()?.memoryMode === 'project';
    const projectId = projectOnly ? state.currentProjectId : DEFAULT_PROJECT_ID;
    const existing = arr.findIndex(f => f.key.toLowerCase() === k.toLowerCase() && (f.projectId || DEFAULT_PROJECT_ID) === projectId);
    if (existing >= 0) arr.splice(existing, 1);
    arr.push({ id: uid(), key: k, value: v, ts: Date.now(), projectId, scope: projectOnly ? 'project' : 'personal', confidence: 1, approved: true, source: 'chat' });
    memSave(arr);
    return { ok: true, saved: { key: k, value: v, projectId } };
  }

  function memStem(w) {
    w = w.toLowerCase();
    if (w.length <= 3) return w;
    return w
      .replace(/(?:ing|edly|edness|ies|ied|ily|ment|ness|tion|sion)$/, '')
      .replace(/(?:ed|es|ly|er|or|al)$/, '')
      .replace(/s$/, '');
  }

  function memExpand(token) {
    const base = memStem(token);
    const out = new Set([token, base]);
    const grp = MEM_SYN_MAP.get(token) || MEM_SYN_MAP.get(base);
    if (grp) for (const w of grp) { out.add(w); out.add(memStem(w)); }
    return Array.from(out).filter(t => t.length >= 2);
  }

  function memRecall(query, limit = 6) {
    const projectOnly = currentProject()?.memoryMode === 'project';
    const arr = memLoad().filter(f => {
      const pid = f.projectId || DEFAULT_PROJECT_ID;
      return projectOnly ? pid === state.currentProjectId : (pid === DEFAULT_PROJECT_ID || pid === state.currentProjectId);
    });
    if (!arr.length) return [];
    const q = String(query || '').toLowerCase();
    if (!q) return arr.slice(-limit).reverse();
    const rawTokens = q.split(/[^a-z0-9_]+/i).filter(t => t.length >= 2);
    const expanded = new Map();
    for (const t of rawTokens) {
      for (const e of memExpand(t)) {
        const w = e === t ? t.length : Math.max(2, e.length * 0.7);
        expanded.set(e, Math.max(expanded.get(e) || 0, w));
      }
    }
    const scored = arr.map(f => {
      const blob = (f.key + ' ' + f.value).toLowerCase();
      const blobStem = blob.split(/[^a-z0-9_]+/).map(memStem).join(' ');
      let score = 0;
      for (const [tok, w] of expanded) {
        if (blob.includes(tok) || blobStem.includes(memStem(tok))) score += w;
      }
      const ageDays = (Date.now() - f.ts) / 86400000;
      const recency = 2 - ageDays * 0.05;
      score += ageDays < 7 ? Math.max(0.1, recency) : Math.max(0, recency);
      return { ...f, _score: score };
    });
    return scored.filter(f => f._score > 0).sort((a, b) => b._score - a._score).slice(0, limit);
  }

  function memAutoExtract(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 1200) return [];
    const saved = [];
    const push = (key, value) => {
      const v = String(value || '').trim().replace(/[.!?]+$/, '');
      if (!v || v.length > 200) return;
      memAdd(key, v);
      saved.push({ key, value: v });
    };
    const patterns = [
      [/\bmy\s+name\s+is\s+([A-Za-z][A-Za-z'\- ]{1,40})/i, m => push('name', m[1])],
      [/\bi(?:'m|\s+am)\s+called\s+([A-Za-z][A-Za-z'\- ]{1,40})/i, m => push('name', m[1])],
      [/\bcall\s+me\s+([A-Za-z][A-Za-z'\- ]{1,40})/i, m => push('name', m[1])],
      [/\bthis\s+is\s+([A-Za-z][A-Za-z'\- ]{1,40})\s+speaking/i, m => push('name', m[1])],
      [/\bi\s+(?:love|like|enjoy|adore|prefer|am\s+a\s+fan\s+of)\s+([^,.;!?\n]{2,80})/i, m => push('likes', m[1])],
      [/\bmy\s+favou?rite\s+([a-z ]{2,30}?)\s+(?:is|are)\s+([^,.;!?\n]{2,80})/i, m => push(`favorite_${m[1].trim().replace(/\s+/g, '_')}`, m[2])],
      [/\bi\s+(?:hate|dislike|can'?t\s+stand|loathe|despise)\s+([^,.;!?\n]{2,80})/i, m => push('dislikes', m[1])],
      [/\bi\s+(?:always|usually|tend\s+to)\s+([^,.;!?\n]{4,100})/i, m => push('habits', m[1])],
      [/\bi\s+(?:never|don'?t|do\s+not)\s+([^,.;!?\n]{4,100})/i, m => push('avoids', m[1])],
      [/\bi\s+(?:work|am\s+working)\s+(?:at|for)\s+([^,.;!?\n]{2,80})/i, m => push('employer', m[1])],
      [/\bi(?:'m|\s+am)\s+(?:a|an)\s+([a-z ]{2,40}?)(?:\s+(?:at|for|in)\s+([^,.;!?\n]{2,80}))?/i, m => { push('role', m[1]); if (m[2]) push('employer', m[2]); }],
      [/\bi(?:'m|\s+am)\s+(?:building|making|developing|creating)\s+([^,.;!?\n]{4,120})/i, m => push('current_project', m[1])],
      [/\bi\s+live\s+in\s+([^,.;!?\n]{2,80})/i, m => push('location', m[1])],
      [/\bi(?:'m|\s+am)\s+(?:from|based\s+in)\s+([^,.;!?\n]{2,80})/i, m => push('origin', m[1])],
      [/\bi\s+speak\s+([^,.;!?\n]{2,80})/i, m => push('languages', m[1])],
      [/\bi(?:'m|\s+am)\s+allergic\s+to\s+([^,.;!?\n]{2,80})/i, m => push('allergies', m[1])],
      [/\bmy\s+(birthday|dob)\s+(?:is\s+)?([^,.;!?\n]{2,40})/i, m => push('birthday', m[2])],
      [/\bi(?:'m|\s+am)\s+(\d{1,2})\s+years?\s+old/i, m => push('age', m[1])],
      [/\bmy\s+project\s+(?:is\s+(?:at|in|located\s+at)\s+|root\s+is\s+)([^\s,.;!?\n]{4,200})/i, m => push('project_root', m[1])],
      [/\bworking\s+(?:directory|dir)\s+(?:is\s+)?([^\s,.;!?\n]{4,200})/i, m => push('workdir', m[1])],
      [/\bcheck\s+(?:the\s+)?file\s+(?:at\s+)?([^\s,.;!?\n]{4,200})/i, m => push('recent_file', m[1])],
      [/\bi\s+(?:use|prefer|code\s+in|write\s+in)\s+([A-Za-z0-9+#./\- ]{2,40})\s+(?:for|as|when)/i, m => push('preferred_tech', m[1])],
      [/\bmy\s+stack\s+is\s+([^,.;!?\n]{4,160})/i, m => push('stack', m[1])],
      [/\bremember\s+(?:that\s+)?([^,.;!?\n]{2,160})/i, m => push('note_' + Date.now().toString(36), m[1])],
      [/\bplease\s+(?:remember|note|save)\s+(?:that\s+)?([^,.;!?\n]{2,160})/i, m => push('note_' + Date.now().toString(36), m[1])],
      [/\bana\s+esmi\s+([A-Za-z][A-Za-z'\- ]{1,40})/i, m => push('name', m[1])],
      [/\bismi\s+([A-Za-z][A-Za-z'\- ]{1,40})/i, m => push('name', m[1])],
    ];
    for (const [re, fn] of patterns) {
      const m = t.match(re);
      if (m) try { fn(m); } catch {}
    }
    return saved;
  }

  function memAutoExtractFromAssistant(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 4000) return [];
    const saved = [];
    const push = (key, value) => {
      const v = String(value || '').trim().replace(/[.!?,]+$/, '');
      if (!v || v.length > 200) return;
      memAdd(key, v);
      saved.push({ key, value: v });
    };
    const patterns = [
      [/(?:I'?ll|I\s+will|let\s+me)\s+remember\s+(?:that\s+)?(?:your|you'?re|you\s+are)\s+([^,.;!?\n]{2,160})/i, m => push('note_' + Date.now().toString(36), m[1])],
      [/(?:got\s+it|noted|saved)[\s,.\-—]+(?:your|you'?re)\s+(?:name\s+is\s+)?([A-Za-z][A-Za-z'\- ]{1,40})\b/i, m => push('name', m[1])],
      [/(?:noted|saved|remembered)\s+(?:that\s+)?you\s+(?:work\s+at|are\s+at)\s+([^,.;!?\n]{2,80})/i, m => push('employer', m[1])],
      [/(?:noted|saved)\s+(?:that\s+)?you\s+(?:live\s+in|are\s+in|are\s+from)\s+([^,.;!?\n]{2,80})/i, m => push('location', m[1])],
    ];
    for (const [re, fn] of patterns) {
      const m = t.match(re);
      if (m) try { fn(m); } catch {}
    }
    return saved;
  }

  function memClear() {
    try { localStorage.removeItem(MEM_KEY); } catch {}
  }

  try { window.memAutoExtractFromAssistant = memAutoExtractFromAssistant; } catch {}

  return {
    memLoad,
    memSave,
    memAdd,
    memRecall,
    memAutoExtract,
    memAutoExtractFromAssistant,
    memClear,
  };
}
