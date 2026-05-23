// cdr-diff-lines.js — line diff for Coder change review (unified preview)
(function () {
  'use strict';

  function lcsTable(a, b) {
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    return dp;
  }

  function diffLines(before, after) {
    const a = String(before ?? '').split('\n');
    const b = String(after ?? '').split('\n');
    if (!a.length && !b.length) return [];
    const dp = lcsTable(a, b);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        out.push({ type: 'same', text: a[i] });
        i++;
        j++;
      } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) {
        out.push({ type: 'add', text: b[j] });
        j++;
      } else if (i < a.length) {
        out.push({ type: 'del', text: a[i] });
        i++;
      }
    }
    return out;
  }

  function diffStats(rows) {
    let added = 0;
    let removed = 0;
    for (const r of rows) {
      if (r.type === 'add') added++;
      else if (r.type === 'del') removed++;
    }
    return { added, removed };
  }

  function formatDiffHtml(before, after, esc, opts = {}) {
    const escFn = typeof esc === 'function' ? esc : (s) => String(s ?? '');
    const maxLines = opts.maxLines ?? 240;
    const rows = diffLines(before, after);
    const stats = diffStats(rows);
    if (!rows.length) {
      return `<div class="cdr-diff-empty">${escFn('(no changes)')}</div>`;
    }
    let shown = 0;
    let truncated = false;
    const parts = [];
    let lineNo = 1;
    for (const row of rows) {
      if (shown >= maxLines) {
        truncated = true;
        break;
      }
      shown++;
      const cls = row.type === 'add' ? 'diff-add' : row.type === 'del' ? 'diff-del' : 'diff-same';
      const prefix = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ';
      parts.push(
        `<div class="cdr-diff-line ${cls}">` +
        `<span class="diff-linenum">${String(lineNo).padStart(4, ' ')}</span>` +
        `<span class="diff-prefix">${prefix}</span>` +
        `<span class="diff-text">${escFn(row.text)}</span></div>`
      );
      if (row.type !== 'del') lineNo++;
    }
    const summary = `+${stats.added} / −${stats.removed}`;
    const tail = truncated ? `<div class="cdr-diff-truncated">… diff truncated (${summary})</div>` : '';
    return `<div class="cdr-diff-summary">${escFn(summary)}</div>${parts.join('')}${tail}`;
  }

  window.CdrDiffLines = { diffLines, diffStats, formatDiffHtml };
})();
