// cdr-goto.js — lightweight go-to-definition (symbol index + project grep)
(function () {
  'use strict';

  const DEF_PATTERNS = {
    javascript: [
      /(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=(]/g,
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    ],
    typescript: [
      /(?:function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    ],
    python: [/^(?:async\s+)?def\s+([A-Za-z_][\w]*)/gm, /^class\s+([A-Za-z_][\w]*)/gm],
    rust: [/^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/gm, /^(?:pub\s+)?struct\s+([A-Za-z_][\w]*)/gm],
    go: [/^func\s+(?:\([^)]*\)\s+)?([A-Za-z_][\w]*)/gm, /^type\s+([A-Za-z_][\w]*)/gm],
  };

  function langFromPath(path) {
    const ext = String(path || '').split('.').pop()?.toLowerCase() || '';
    if (['ts', 'tsx'].includes(ext)) return 'typescript';
    if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'javascript';
    if (ext === 'py') return 'python';
    if (ext === 'rs') return 'rust';
    if (ext === 'go') return 'go';
    return '';
  }

  function lineAtIndex(text, index) {
    return text.slice(0, index).split('\n').length;
  }

  function findInText(text, symbol, lang) {
    const patterns = DEF_PATTERNS[lang] || DEF_PATTERNS.javascript;
    for (const pat of patterns) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(text)) !== null) {
        const name = m[1];
        if (name === symbol) {
          return { line: lineAtIndex(text, m.index), col: 1 };
        }
      }
    }
    return null;
  }

  async function findDefinition({ symbol, path, projectRoot, projectSymbols, readFile, grepCode }) {
    const name = String(symbol || '').trim();
    if (!name) return null;

    if (path && readFile) {
      try {
        const text = await readFile(path);
        const loc = findInText(String(text), name, langFromPath(path));
        if (loc) return { path, line: loc.line, col: loc.col };
      } catch {}
    }

    const syms = projectSymbols || {};
    for (const [p, items] of Object.entries(syms)) {
      const hit = (items || []).find(s => s.name === name);
      if (hit) return { path: p, line: hit.line || 1, col: 1 };
    }

    if (projectRoot && grepCode) {
      try {
        const raw = await grepCode(projectRoot, `\\b${name}\\b`, null);
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        for (const line of text.split('\n')) {
          const m = line.match(/^(.+?):(\d+):(.*)$/);
          if (!m) continue;
          const body = m[3];
          if (!new RegExp(`\\b${name}\\b`).test(body)) continue;
          if (/def\s+|fn\s+|function\s+|class\s+|interface\s+|type\s+|struct\s+/.test(body)) {
            return { path: m[1], line: parseInt(m[2], 10) || 1, col: 1 };
          }
        }
      } catch {}
    }
    return null;
  }

  window.CdrGoto = { findDefinition, findInText, langFromPath };
})();
