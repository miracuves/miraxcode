import { safeHost } from '../core/utils.js';

export const RAG_KEY = 'hashgpt_rag';

export function createRagApi(deps) {
  const { getRagEnabled, renderAgentsList } = deps;

const RAG_MAX_BYTES = 6_500_000; // ~6.5 MB char budget — embeddings add ~1.5 KB per chunk
const RAG_MAX_CONTEXT = 3;       // chunks injected per query
const RAG_CHUNK_MAX = 600;       // max chars stored per chunk
const RAG_VECTOR_MIN_SIM = 0.32; // cosine-sim threshold for vector hits

// ── Local embeddings (transformers.js) ────────────────────────────────
// Lazy-load all-MiniLM-L6-v2 (~22 MB) on first embed call. Stays in
// memory after that. Browser-only, no API key, no network at query time.
let _embedderPromise = null;
async function getEmbedder() {
  if (_embedderPromise) return _embedderPromise;
  _embedderPromise = (async () => {
    const mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm");
    try { mod.env.allowLocalModels = false; mod.env.useBrowserCache = true; } catch {}
    return await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  })();
  return _embedderPromise;
}
async function embedText(text) {
  const t = String(text || "").trim().slice(0, 1000);
  if (!t) return null;
  try {
    const embedder = await getEmbedder();
    const out = await embedder(t, { pooling: "mean", normalize: true });
    return Array.from(out.data);
  } catch (e) {
    console.warn("[embed] failed:", e?.message || e);
    return null;
  }
}
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  // Vectors are L2-normalized at extraction time, so cosine = dot product.
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

const STOP_WORDS = new Set("a an the and or but in on at to of for is are was were be been being have has had do does did will would could should may might shall can this that these those with from by into out up as it its if not no so i we you he she they their them our my your his her its what which who when where how all just also only more over than then".split(" "));

function ragExtractKeywords(text) {
  return [...new Set(
    (text || "").toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )];
}

function ragScore(queryKw, chunk) {
  if (!queryKw.length || !chunk.keywords?.length) return 0;
  const cSet = new Set(chunk.keywords);
  const titleKw = new Set(ragExtractKeywords(chunk.title || ""));
  let score = 0, totalWeight = 0;
  for (const w of queryKw) {
    // Word length proxies IDF: longer terms are rarer and more informative
    const weight = Math.log(2 + w.length);
    totalWeight += weight;
    if (cSet.has(w)) score += weight * (titleKw.has(w) ? 1.6 : 1.0);
  }
  return totalWeight > 0 ? score / totalWeight : 0;
}

function loadRAG() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RAG_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }
  catch { return []; }
}

function saveRAG(store) {
  try {
    let s = JSON.stringify(store);
    // Trim oldest entries if over size cap
    while (s.length > RAG_MAX_BYTES && store.length > 0) {
      store.shift();
      s = JSON.stringify(store);
    }
    localStorage.setItem(RAG_KEY, s);
  } catch {}
  updateRagCount();
}

function updateRagCount() {
  const n = loadRAG().length;
  const el = document.getElementById("ragCount");
  if (el) el.textContent = n;
  const tog = document.getElementById("ragToggle");
  if (tog) tog.classList.toggle("on", getRagEnabled());
}

function _ragLocalAdd(title, text, source) {
  if (!getRagEnabled()) return;
  if (!text || text.trim().length < 40) return;
  const store = loadRAG();
  const key = `${source}::${(title || "").slice(0, 80)}`;
  if (store.some(c => c.key === key)) return;
  const chunk = text.slice(0, RAG_CHUNK_MAX);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    key,
    title: (title || "").slice(0, 120),
    text: chunk,
    source: source || "unknown",
    keywords: ragExtractKeywords(chunk),
    addedAt: Date.now(),
  };
  store.push(entry);
  saveRAG(store);
  // Async embed + patch — so ingestion never blocks UI even on first run
  // when the 22 MB embedding model is still downloading.
  embedText(`${entry.title}. ${chunk}`).then(vec => {
    if (!vec) return;
    const cur = loadRAG();
    const i = cur.findIndex(c => c.key === entry.key);
    if (i >= 0) { cur[i].vec = vec; saveRAG(cur); }
  }).catch(() => {});
}

function queryRAG(text, topK = RAG_MAX_CONTEXT) {
  if (!getRagEnabled()) return [];
  const store = loadRAG();
  if (!store.length) return [];
  const queryKw = ragExtractKeywords(text);
  if (!queryKw.length) return [];
  return store
    .map(c => ({ ...c, _score: ragScore(queryKw, c) }))
    .filter(c => c._score > 0.14)
    .sort((a, b) => b._score - a._score)
    .slice(0, topK);
}

// Vector retrieval — semantic search via cosine similarity. Runs in
// parallel with keyword retrieval and the two are merged, so chunks
// ingested before embeddings existed still surface via keywords.
async function queryRAGVector(text, topK = RAG_MAX_CONTEXT) {
  if (!getRagEnabled()) return [];
  const store = loadRAG();
  const withVec = store.filter(c => Array.isArray(c.vec) && c.vec.length);
  if (!withVec.length) return [];
  // First call may need to download the 22 MB model. Race against a
  // generous timeout so we never block a user query for >2 s — keyword
  // search will carry that turn, vector takes over once warm.
  const qVec = await Promise.race([
    embedText(text),
    new Promise(r => setTimeout(() => r(null), 2000))
  ]);
  if (!qVec) return [];
  return withVec
    .map(c => ({ ...c, _score: cosineSim(qVec, c.vec) }))
    .filter(c => c._score >= RAG_VECTOR_MIN_SIM)
    .sort((a, b) => b._score - a._score)
    .slice(0, topK);
}

// RAG card events are wired per-render inside renderAgentsList()

// ========= Local RAG (persistent 5 GB SQLite on the local host) =========
// Endpoints added to /opt/hashgpt/helper.py:
//   POST /rag/add   { title, text, source }
//   POST /rag/query { query, limit }  → { results: [{title,text,source,score}] }
//   GET  /rag/stats                   → { count, size_mb }
//   POST /rag/clear

function dellRagBase() {
  // Use the sensor helper port (9999) on whichever host Ollama is using
  return safeHost().replace(":11434", ":9999");
}

// Use AbortSignal.timeout when available (Chrome 103+, Safari 16+, FF 100+).
// It is GC-safe — no dangling setTimeout on successful requests.
// Falls back to the old AbortController pattern on older engines.
const makeSignal = (ms) => window.MiraXcodeRuntime.makeSignal(ms);

async function ragDellAdd(title, text, source) {
  if (!getRagEnabled()) return;
  try {
    await fetch(`${dellRagBase()}/rag/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: (title||"").slice(0,200), text: text.slice(0,2000), source: source||"" }),
      signal: makeSignal(4000),
    });
  } catch {}
}

async function ragDellQuery(query, limit = 3) {
  try {
    const r = await fetch(`${dellRagBase()}/rag/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
      signal: makeSignal(4000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || []).map(c => ({ title: c.title, text: c.text, source: c.source }));
  } catch { return []; }
}

async function ragDellStats() {
  try {
    const r = await fetch(`${dellRagBase()}/rag/stats`, { signal: makeSignal(3000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function ragDellClear() {
  try {
    await fetch(`${dellRagBase()}/rag/clear`, { method: "POST", signal: makeSignal(4000) });
    renderAgentsList();
  } catch {}
}

function addToRAG(title, text, source) {
  _ragLocalAdd(title, text, source);
  ragDellAdd(title, text, source);
}

// Hybrid retrieval: vector (semantic) + keyword (lexical) + server.
// Vector goes first — it catches paraphrases and synonyms that keyword
// misses ("CEO" ↔ "chief executive"). Keyword fills in exact-match cases
// (rare names, codes, IDs) where embeddings can be fuzzy.
const _queryRAGLocal = queryRAG;
async function queryRAGMerged(text) {
  if (!getRagEnabled()) return [];
  const [macVec, dell] = await Promise.all([
    queryRAGVector(text, RAG_MAX_CONTEXT).catch(() => []),
    ragDellQuery(text, RAG_MAX_CONTEXT).catch(() => [])
  ]);
  const macKw = _queryRAGLocal(text);
  const seen = new Set();
  const out = [];
  const dedupKey = c => (c.title || "").trim().toLowerCase() + "|" + (c.text || "").slice(0, 80);
  const push = (arr) => {
    for (const c of arr) {
      const k = dedupKey(c);
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    }
  };
  push(macVec);   // semantic matches first
  push(macKw);    // exact-token fallbacks
  push(dell);     // server-side knowledge base
  return out.slice(0, RAG_MAX_CONTEXT + 2);
}


  return {
    loadRAG,
    saveRAG,
    updateRagCount,
    addToRAG,
    queryRAGMerged,
    ragDellStats,
    ragDellClear,
    embedText,
  };
}
