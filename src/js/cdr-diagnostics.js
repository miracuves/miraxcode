// cdr-diagnostics.js — structured problem parsing for Coder (terminal + build output)
(function () {
  'use strict';

  const GENERIC_RE = /([\w./@-]+\.(?:[a-zA-Z0-9]+)):(\d{1,6})(?::(\d{1,6}))?\s*[-:]?\s*(.+)?/;
  const TSC_RE = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(.+)$/i;
  const ESLINT_RE = /^(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([\w/-]+)$/i;
  const RUST_ARROW_RE = /^\s*-->\s+(.+?):(\d+):(\d+)/;
  const RUST_ERR_RE = /^(error|warning)(?:\[[\w\d]+\])?:\s*(.+)$/i;

  function normSeverity(s) {
    const x = String(s || '').toLowerCase();
    if (x === 'warning' || x === 'warn') return 'warning';
    return 'error';
  }

  function pushProblem(out, seen, p) {
    if (!p?.file) return;
    const key = `${p.file}:${p.line}:${p.col}:${p.message?.slice(0, 60)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      file: p.file,
      line: Math.max(1, parseInt(p.line, 10) || 1),
      col: Math.max(1, parseInt(p.col, 10) || 1),
      message: String(p.message || '').trim().slice(0, 400),
      severity: normSeverity(p.severity),
      source: p.source || 'build',
    });
  }

  function parseRustLines(lines) {
    const out = [];
    const seen = new Set();
    let pendingMsg = '';
    let pendingSev = 'error';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const em = line.match(RUST_ERR_RE);
      if (em) {
        pendingMsg = em[2].trim();
        pendingSev = em[1].toLowerCase();
        continue;
      }
      const arr = line.match(RUST_ARROW_RE);
      if (arr && pendingMsg) {
        pushProblem(out, seen, {
          file: arr[1].trim(),
          line: arr[2],
          col: arr[3],
          message: pendingMsg,
          severity: pendingSev,
          source: 'rustc',
        });
        pendingMsg = '';
      }
    }
    return out;
  }

  function parseTscLines(lines) {
    const out = [];
    const seen = new Set();
    for (const line of lines) {
      const m = line.match(TSC_RE);
      if (!m) continue;
      pushProblem(out, seen, {
        file: m[1].trim(),
        line: m[2],
        col: m[3],
        message: m[5].trim(),
        severity: m[4],
        source: 'tsc',
      });
    }
    return out;
  }

  function parseEslintLines(lines) {
    const out = [];
    const seen = new Set();
    let currentFile = '';
    for (const line of lines) {
      const fm = line.match(/^([^\s].+\.[a-z0-9]+)$/i);
      if (fm && !line.includes('  ')) {
        currentFile = fm[1].trim();
        continue;
      }
      const m = line.match(ESLINT_RE);
      if (m) {
        pushProblem(out, seen, {
          file: currentFile || m[5],
          line: m[1],
          col: m[2],
          message: m[4].trim(),
          severity: m[3],
          source: 'eslint',
        });
        continue;
      }
      const gm = line.match(GENERIC_RE);
      if (gm) {
        pushProblem(out, seen, {
          file: gm[1],
          line: gm[2],
          col: gm[3] || 1,
          message: (gm[4] || line).trim(),
          severity: line.toLowerCase().includes('warning') ? 'warning' : 'error',
          source: 'eslint',
        });
      }
    }
    return out;
  }

  function parseGenericLines(lines) {
    const out = [];
    const seen = new Set();
    for (const line of lines) {
      if (/^\s*-->/.test(line)) continue;
      const m = line.match(GENERIC_RE);
      if (!m) continue;
      pushProblem(out, seen, {
        file: m[1],
        line: m[2],
        col: m[3] || 1,
        message: (m[4] || '').trim(),
        severity: line.toLowerCase().includes('warning') ? 'warning' : 'error',
        source: 'terminal',
      });
    }
    return out;
  }

  function parseOutput(text) {
    const raw = String(text || '');
    if (!raw.trim()) return [];
    const lines = raw.split(/\r?\n/);
    const joined = [
      ...parseRustLines(lines),
      ...parseTscLines(lines),
      ...parseEslintLines(lines),
      ...parseGenericLines(lines),
    ];
    return joined.slice(0, 80);
  }

  function mergeProblems(existing, incoming, max = 80) {
    const seen = new Set();
    const out = [];
    for (const list of [existing, incoming]) {
      for (const p of list || []) {
        const key = `${p.file}:${p.line}:${p.col}:${p.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
    }
    return out.slice(-max);
  }

  window.CdrDiagnostics = { parseOutput, mergeProblems, normSeverity };
})();
