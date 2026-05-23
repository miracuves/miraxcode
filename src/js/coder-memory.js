/**
 * Coder-scoped session memory (per project root) — separate from global chat memory.
 */
(function () {
  "use strict";

  const CODER_MEM_KEY = "hashui_coder_memory_v1";
  const MAX_FACTS = 400;
  const MAX_PER_PROJECT = 120;

  function projectKey(root) {
    return String(root || "_global").replace(/\/+$/, "");
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(CODER_MEM_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveAll(arr) {
    try {
      while (arr.length > MAX_FACTS) arr.shift();
      localStorage.setItem(CODER_MEM_KEY, JSON.stringify(arr));
    } catch {}
  }

  function loadForProject(root) {
    const pk = projectKey(root);
    return loadAll().filter(f => f.projectKey === pk);
  }

  function add(root, key, value, meta = {}) {
    const k = String(key || "").trim().slice(0, 120);
    const v = String(value || "").trim().slice(0, 2000);
    if (!k || !v) return { ok: false };
    const pk = projectKey(root);
    const arr = loadAll();
    const idx = arr.findIndex(
      f => f.projectKey === pk && f.key.toLowerCase() === k.toLowerCase()
    );
    if (idx >= 0) arr.splice(idx, 1);
    arr.push({
      id: "cm-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      projectKey: pk,
      key: k,
      value: v,
      ts: Date.now(),
      source: meta.source || "coder",
      turn: meta.turn || null,
    });
    const perProj = arr.filter(f => f.projectKey === pk);
    while (perProj.length > MAX_PER_PROJECT) {
      const oldest = perProj.sort((a, b) => a.ts - b.ts)[0];
      const oi = arr.findIndex(f => f.id === oldest.id);
      if (oi >= 0) arr.splice(oi, 1);
      perProj.splice(perProj.indexOf(oldest), 1);
    }
    saveAll(arr);
    return { ok: true, key: k, value: v };
  }

  function tokenize(q) {
    return String(q || "")
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/i)
      .filter(t => t.length >= 2);
  }

  function recall(root, query, limit = 12) {
    const pk = projectKey(root);
    const arr = loadForProject(root);
    if (!arr.length) return [];
    const tokens = tokenize(query);
    if (!tokens.length) {
      return arr.slice(-limit).reverse();
    }
    const scored = arr.map(f => {
      const blob = (f.key + " " + f.value).toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (blob.includes(t)) score += Math.min(8, t.length);
      }
      const ageDays = (Date.now() - f.ts) / 86400000;
      score += ageDays < 14 ? 2 - ageDays * 0.05 : 0;
      return { ...f, _score: score };
    });
    return scored
      .filter(f => f._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  }

  function extractFromUserMessage(root, text) {
    const t = String(text || "").trim();
    if (!t) return [];
    const saved = [];
    const push = (key, value) => {
      const r = add(root, key, value, { source: "extract" });
      if (r.ok) saved.push(r);
    };
    const patterns = [
      [/\bremember\s+(?:that\s+)?([^.;!?\n]{2,200})/i, m => push("note", m[1])],
      [/\balways\s+use\s+([^.;!?\n]{2,120})/i, m => push("convention", m[1])],
      [/\bnever\s+([^.;!?\n]{4,120})/i, m => push("avoid", m[1])],
      [/\bthe\s+entry\s+point\s+is\s+([^\s,.;!?\n]{2,120})/i, m => push("entry_point", m[1])],
      [/\bmain\s+file\s+is\s+([^\s,.;!?\n]{4,200})/i, m => push("main_file", m[1])],
      [/\buse\s+([A-Za-z0-9._/-]{2,80})\s+for\s+([^.;!?\n]{2,120})/i, m => push("uses_" + m[1].replace(/\W+/g, "_"), m[2])],
      [/(?:^|\s)(src\/[^\s,;]+\.[a-z]{1,6})/gi, null],
    ];
    for (const [re, fn] of patterns) {
      if (!fn) {
        let m;
        while ((m = re.exec(t)) !== null) push("mentioned_file", m[1]);
        continue;
      }
      const m = t.match(re);
      if (m) try { fn(m); } catch {}
    }
    return saved;
  }

  function extractFromAssistant(root, text) {
    const t = String(text || "").trim();
    if (!t || t.length > 6000) return [];
    const saved = [];
    const push = (key, value) => {
      const r = add(root, key, value, { source: "assistant" });
      if (r.ok) saved.push(r);
    };
    const done = t.match(/\b(?:created|updated|fixed|refactored)\s+([^\s,]+\.[a-z]{1,6})/gi);
    if (done) {
      for (const line of done.slice(0, 6)) {
        const m = line.match(/([^\s,]+\.[a-z]{1,6})$/i);
        if (m) push("changed_file", m[1]);
      }
    }
    const decision = t.match(/\b(?:decided|approach|architecture)\s*[:\-—]\s*([^.\n]{8,200})/i);
    if (decision) push("decision", decision[1]);
    return saved;
  }

  function formatForPrompt(root, query) {
    const facts = recall(root, query, 14);
    if (!facts.length) return "";
    const lines = facts.map(
      f => `- ${f.key}: ${String(f.value).slice(0, 220)}`
    );
    return (
      `Coder session memory (${facts.length} facts for this project):\n` +
      lines.join("\n") +
      "\n"
    );
  }

  function mergeGlobalRecall(query, limit = 6) {
    try {
      return window._H?.memRecall?.(query, limit) || [];
    } catch {
      return [];
    }
  }

  function formatMergedForPrompt(root, query) {
    const coderBlock = formatForPrompt(root, query);
    const global = mergeGlobalRecall(query, 8);
    const gLines = global.length
      ? global.map(f => `- ${f.key}: ${String(f.value).slice(0, 160)}`).join("\n")
      : "";
    let out = "";
    if (coderBlock) out += coderBlock;
    if (gLines) out += `Global memory:\n${gLines}\n`;
    return out;
  }

  window.HC = window.HC || {};
  HC.coderMemory = {
    projectKey,
    add,
    recall,
    extractFromUserMessage,
    extractFromAssistant,
    formatForPrompt,
    formatMergedForPrompt,
    loadForProject,
  };
})();
