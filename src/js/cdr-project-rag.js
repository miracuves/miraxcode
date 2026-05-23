// cdr-project-rag.js — ingest Coder project files into main-app RAG store
(function () {
  'use strict';

  const SKIP_DIRS = new Set([
    'node_modules', 'target', '.git', 'dist', 'build', 'out',
    '.next', 'coverage', 'vendor', '__pycache__', '.tauri',
  ]);
  const CODE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|cs|cpp|c|h|md|json|yaml|yml|toml|css|scss|html|vue|svelte)$/i;

  async function ingestProject(root, opts = {}) {
    const H = window._H;
    if (!H?.addToRAG || !H.ragEnabled?.()) return { ingested: 0, skipped: 'rag_disabled' };
    if (!root || !window.HC?.code?.listDir) return { ingested: 0, skipped: 'no_hc' };

    const maxFiles = opts.maxFiles ?? 48;
    const maxDepth = opts.maxDepth ?? 5;
    let ingested = 0;

    async function walk(dir, depth) {
      if (depth > maxDepth || ingested >= maxFiles) return;
      let entries;
      try {
        entries = await window.HC.code.listDir(dir);
      } catch {
        return;
      }
      for (const e of entries || []) {
        if (ingested >= maxFiles) break;
        const name = e.name || '';
        if (!name || name.startsWith('.')) continue;
        if (SKIP_DIRS.has(name)) continue;
        const p = e.path || `${dir.replace(/\/$/, '')}/${name}`;
        if (e.is_dir) {
          await walk(p, depth + 1);
          continue;
        }
        if (!CODE_RE.test(name)) continue;
        try {
          const raw = await window.HC.code.readFile(p);
          const text = String(raw ?? '').trim();
          if (text.length < 40) continue;
          const rel = p.startsWith(root) ? p.slice(root.length).replace(/^\//, '') : name;
          H.addToRAG(rel || name, text.slice(0, 1200), `coder:${root}:${rel}`);
          ingested++;
        } catch {}
      }
    }

    await walk(root, 0);
    return { ingested, skipped: null };
  }

  window.CdrProjectRag = { ingestProject };
})();
