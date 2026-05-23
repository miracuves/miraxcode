// cdr-ide-features.js — Coder IDE extras (search, terminal links, plan mode, etc.)
(function () {
  'use strict';

  const PREFS_KEY = 'miraxcode_coder_ide_prefs';
  const FILE_LINE_RE = /(?:^|\s)([\w./@-]+\.(?:[a-zA-Z0-9]+)):(\d{1,6})(?::(\d{1,6}))?(?:\s|$|[):,])/g;
  const PROBLEM_RE = /([\w./@-]+\.(?:[a-zA-Z0-9]+)):(\d{1,6}):(\d{1,6})?\s*[-:]?\s*(.+)?/;

  function loadPrefs() {
    try {
      return { autoOpenDiff: true, planOnly: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    } catch {
      return { autoOpenDiff: true, planOnly: false };
    }
  }

  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function linkifyTerminalHtml(text) {
    const raw = String(text || '');
    if (!FILE_LINE_RE.test(raw)) return null;
    FILE_LINE_RE.lastIndex = 0;
    let out = '';
    let last = 0;
    let m;
    while ((m = FILE_LINE_RE.exec(raw)) !== null) {
      out += esc(raw.slice(last, m.index));
      const file = m[1];
      const line = m[2];
      const col = m[3] || '';
      out += `<button type="button" class="cdr-term-link" data-file="${esc(file)}" data-line="${esc(line)}" data-col="${esc(col)}">${esc(m[0].trim())}</button>`;
      last = m.index + m[0].length;
    }
    out += esc(raw.slice(last));
    return out;
  }

  function mount(ctx) {
    const prefs = loadPrefs();
    const $ = ctx.$;
    const problems = [];

    function resolvePath(file) {
      const root = (ctx.getProjectRoot?.() || '').replace(/\/$/, '');
      if (!file) return null;
      if (file.startsWith('/')) return file;
      return root ? `${root}/${file}` : file;
    }

    function openLocation(file, line, col) {
      const full = resolvePath(file);
      if (!full) return;
      ctx.setActiveFile?.(full);
      ctx.openEditor?.(full, parseInt(line, 10) || 1, parseInt(col, 10) || 1);
    }

    // ── Terminal click-to-line ───────────────────────────────
    const termBody = $('cdrTerminalBody');
    if (termBody && !termBody.dataset.linkify) {
      termBody.dataset.linkify = '1';
      termBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.cdr-term-link');
        if (!btn) return;
        e.preventDefault();
        openLocation(btn.dataset.file, btn.dataset.line, btn.dataset.col);
      });
    }
    function ingestDiagnosticText(text) {
      const parsed = window.CdrDiagnostics?.parseOutput?.(text) || [];
      if (!parsed.length) {
        const pm = text.match(PROBLEM_RE);
        if (pm) {
          parsed.push({
            file: pm[1],
            line: parseInt(pm[2], 10),
            col: parseInt(pm[3], 10) || 1,
            message: (pm[4] || text).trim().slice(0, 400),
            severity: 'error',
            source: 'terminal',
          });
        }
      }
      if (parsed.length) {
        const merged = window.CdrDiagnostics?.mergeProblems?.(problems, parsed) || parsed;
        problems.length = 0;
        problems.push(...merged);
        renderProblems();
      }
    }

    ctx.reportProblems = (items, opts = {}) => {
      if (opts.replace) problems.length = 0;
      const merged = window.CdrDiagnostics?.mergeProblems?.(problems, items || []) || items || [];
      problems.length = 0;
      problems.push(...merged);
      renderProblems();
    };
    ctx.clearProblems = () => {
      problems.length = 0;
      renderProblems();
    };

    ctx.syncMonacoDiagnostics = (markers) => {
      const keep = problems.filter(p => p.source !== 'monaco-ts');
      const merged = window.CdrDiagnostics?.mergeProblems?.(keep, markers || []) || markers || [];
      problems.length = 0;
      problems.push(...merged);
      renderProblems();
    };

    $('cdrProblemsRunBtn')?.addEventListener('click', async () => {
      const root = ctx.getProjectRoot?.();
      if (!root) {
        window.HC?.guard?.notify?.('Open a project first', 'info');
        return;
      }
      ctx.clearProblems();
      window.HC?.guard?.notify?.('Running project checks…', 'info');
      await window.CdrProjectLint?.runProjectChecks?.(root, (items) => ctx.reportProblems(items));
    });

    ctx.terminalLog = (text, className) => {
      const body = $('cdrTerminalBody');
      if (!body) return;
      const line = document.createElement('div');
      line.className = 'cdr-terminal-line' + (className ? ' ' + className : '');
      const linked = linkifyTerminalHtml(text);
      if (linked) line.innerHTML = linked;
      else line.innerHTML = ctx.ansiToHtml?.(text) || esc(text);
      body.appendChild(line);
      body.scrollTop = body.scrollHeight;
      if (className?.includes('error') || className?.includes('warn') || /\b(error|warning)\b/i.test(text)) {
        ingestDiagnosticText(text);
      }
    };

    function renderProblems() {
      const list = $('cdrProblemsList');
      if (!list) return;
      if (!problems.length) {
        list.innerHTML = '<div class="cdr-git-empty">No problems captured yet</div>';
        return;
      }
      list.innerHTML = problems.slice(-40).reverse().map((p) =>
        `<button type="button" class="cdr-problem-item ${esc(p.severity || 'error')}" data-file="${esc(p.file)}" data-line="${p.line}" data-col="${p.col || 1}">
          <span class="cdr-problem-loc">${esc(p.file)}:${p.line}</span>
          <span class="cdr-problem-msg">${esc(p.message)}</span>
          <span class="cdr-problem-src">${esc(p.source || '')}</span>
        </button>`
      ).join('');
      list.querySelectorAll('.cdr-problem-item').forEach(btn => {
        btn.addEventListener('click', () => {
          openLocation(btn.dataset.file, btn.dataset.line, btn.dataset.col);
        });
      });
    }

    // ── Workspace trust chip ───────────────────────────────────
    function updateTrustChip() {
      const chip = $('cdrTrustChip');
      const root = ctx.getProjectRoot?.();
      if (!chip) return;
      if (!root) {
        chip.hidden = true;
        return;
      }
      chip.hidden = false;
      const name = root.split('/').filter(Boolean).pop() || root;
      chip.textContent = `Trusted · ${name}`;
      chip.title = `Writes confined to:\n${root}\n\nBlocked: /System, /etc, .ssh, destructive shell`;
    }
    ctx.updateTrustChip = updateTrustChip;

    // ── Project search (⌘⇧F) ───────────────────────────────────
    let searchOpen = false;
    const searchPanel = $('cdrSearchPanel');
    const searchInput = $('cdrSearchInput');
    const searchResults = $('cdrSearchResults');

    async function runSearch(q) {
      if (!searchResults) return;
      const root = ctx.getProjectRoot?.();
      if (!root || !q?.trim()) {
        searchResults.innerHTML = '<div class="cdr-git-empty">Enter a search term</div>';
        return;
      }
      searchResults.innerHTML = '<div class="cdr-git-empty">Searching…</div>';
      try {
        const raw = await window.HC?.code?.grepCode?.(root, q.trim(), null);
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        const lines = text.split('\n').filter(l => l.trim()).slice(0, 80);
        if (!lines.length) {
          searchResults.innerHTML = '<div class="cdr-git-empty">No matches</div>';
          return;
        }
        searchResults.innerHTML = lines.map(l => {
          const m = l.match(/^(.+?):(\d+):(.*)$/);
          if (!m) return `<div class="cdr-search-line">${esc(l)}</div>`;
          return `<button type="button" class="cdr-search-hit" data-file="${esc(m[1])}" data-line="${esc(m[2])}">
            <span class="cdr-search-path">${esc(m[1].split('/').pop())}:${m[2]}</span>
            <span class="cdr-search-preview">${esc(m[3].trim().slice(0, 120))}</span>
          </button>`;
        }).join('');
        searchResults.querySelectorAll('.cdr-search-hit').forEach(btn => {
          btn.addEventListener('click', () => openLocation(btn.dataset.file, btn.dataset.line, 1));
        });
      } catch (e) {
        searchResults.innerHTML = `<div class="cdr-git-empty">${esc(e?.message || 'Search failed')}</div>`;
      }
    }

    function toggleSearch(open) {
      searchOpen = open ?? !searchOpen;
      if (searchPanel) searchPanel.hidden = !searchOpen;
      if (searchOpen) searchInput?.focus();
    }

    $('cdrSearchToggle')?.addEventListener('click', () => toggleSearch());
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { toggleSearch(false); return; }
      if (e.key === 'Enter') runSearch(searchInput.value);
    });
    let searchDebounce = 0;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => runSearch(searchInput.value), 320);
    });

    document.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== 'f') return;
      if (!document.body.classList.contains('coder-mode')) return;
      e.preventDefault();
      toggleSearch(true);
    });

    // ── Git commit ───────────────────────────────────────────
    $('cdrGitCommitBtn')?.addEventListener('click', async () => {
      const root = ctx.getProjectRoot?.();
      const msg = $('cdrGitCommitMsg')?.value?.trim();
      if (!root || !msg) {
        window.HC?.guard?.notify?.('Open a repo and enter a commit message', 'info');
        return;
      }
      try {
        await window.HC.invoke('shell_run', {
          command: 'git',
          args: ['add', '-A'],
          cwd: root,
        });
        const r = await window.HC.invoke('shell_run', {
          command: 'git',
          args: ['commit', '-m', msg],
          cwd: root,
        });
        $('cdrGitCommitMsg').value = '';
        ctx.terminalLog?.('git commit: ' + (r?.stdout || 'done').trim(), '');
        ctx.refreshGitStatus?.();
      } catch (e) {
        window.HC?.guard?.notify?.(e?.message || 'Commit failed', 'err');
      }
    });

    // ── IDE prefs toggles ────────────────────────────────────
    const autoDiffEl = $('cdrAutoOpenDiff');
    const planEl = $('cdrPlanOnly');
    if (autoDiffEl) {
      autoDiffEl.checked = prefs.autoOpenDiff !== false;
      autoDiffEl.addEventListener('change', () => {
        prefs.autoOpenDiff = autoDiffEl.checked;
        savePrefs(prefs);
      });
    }
    if (planEl) {
      planEl.checked = !!prefs.planOnly;
      planEl.addEventListener('change', () => {
        prefs.planOnly = planEl.checked;
        savePrefs(prefs);
      });
    }

    ctx.getIdePrefs = () => loadPrefs();
    ctx.shouldAutoOpenDiff = () => loadPrefs().autoOpenDiff !== false;
    ctx.isPlanOnly = () => !!loadPrefs().planOnly;

    // ── @codebase expansion ───────────────────────────────────
    ctx.expandCodebase = async (task) => {
      if (!task.includes('@codebase')) return task;
      const root = ctx.getProjectRoot?.();
      if (!root) return task.replace(/@codebase/g, '').trim();
      let tree = '';
      try {
        const entries = await window.HC.code.listDir(root);
        const names = (entries || [])
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'target')
          .slice(0, 80)
          .map(e => (e.is_dir ? e.name + '/' : e.name));
        tree = names.join('\n');
      } catch {}
      const syms = ctx.getProjectSymbols?.() || {};
      const symLines = Object.entries(syms).slice(0, 12).map(([p, items]) =>
        `${p.split('/').pop()}: ${items.slice(0, 8).map(s => s.name).join(', ')}`
      );
      let ragBlock = '';
      const query = task.replace(/@codebase/g, '').trim() || 'project architecture overview';
      if (window._H?.queryRAGMerged) {
        try {
          const chunks = await window._H.queryRAGMerged(query);
          if (chunks?.length) {
            ragBlock = '\n\nRAG matches (semantic KB):\n' + chunks.map((c, i) =>
              `[${i + 1}] ${c.title || 'chunk'} (${c.source || 'local'})\n${String(c.text || '').slice(0, 600)}`
            ).join('\n\n');
          } else if (!window._H.ragEnabled?.()) {
            ragBlock = '\n\n(RAG is off in Agents tab — enable RAG for semantic @codebase matches)';
          }
        } catch {}
      }
      const block =
        `\n\n--- @codebase (project snapshot) ---\nRoot: ${root}\n\nFiles:\n${tree}\n\nSymbols:\n${symLines.join('\n')}${ragBlock}\n--- end @codebase ---\n`;
      return task.replace(/@codebase/g, '').trim() + block;
    };

    // ── Export changes.json helper ───────────────────────────
    ctx.buildChangesExport = (opts = { fullContent: true }) => {
      const changes = ctx.getFileChanges?.() || [];
      const maxChars = opts.maxChars ?? 2_000_000;
      let used = 0;
      const rows = changes.map(fc => {
        const proposed = String(fc.proposedContent ?? fc.content ?? '');
        const previous = fc.previousContent == null ? null : String(fc.previousContent);
        let propOut = proposed;
        let prevOut = previous;
        if (!opts.fullContent) {
          propOut = proposed.length > 8000 ? proposed.slice(0, 8000) + '\n… (truncated in summary mode)' : proposed;
          prevOut = previous == null ? null : (previous.length > 8000 ? previous.slice(0, 8000) + '\n…' : previous);
        } else {
          used += proposed.length + (previous?.length || 0);
          if (used > maxChars) {
            propOut = proposed.slice(0, Math.max(0, maxChars - used)) + '\n… (export size cap)';
          }
        }
        return {
          path: fc.path,
          kind: fc.kind,
          status: fc.status,
          applied: !!fc.applied,
          tool: fc.tool,
          previousContent: prevOut,
          proposedContent: propOut,
          proposedLength: proposed.length,
          previousLength: previous?.length ?? null,
        };
      });
      return JSON.stringify({
        exportedAt: new Date().toISOString(),
        projectRoot: ctx.getProjectRoot?.() || null,
        fullContent: opts.fullContent !== false,
        changes: rows,
      }, null, 2);
    };

    // ── Streaming bubble helpers ─────────────────────────────
    let streamEl = null;
    ctx.beginStreamBubble = (contentEl) => {
      streamEl = document.createElement('div');
      streamEl.className = 'cdr-msg-text cdr-stream-live';
      contentEl?.appendChild(streamEl);
    };
    ctx.updateStreamBubble = (text) => {
      if (streamEl) {
        streamEl.textContent = text;
        ctx.scrollMessages?.();
      }
    };
    ctx.endStreamBubble = (contentEl, text) => {
      if (streamEl) {
        streamEl.remove();
        streamEl = null;
      }
      ctx.appendTextToBubble?.(contentEl, text);
    };
    ctx.cancelStreamBubble = () => {
      if (streamEl) {
        streamEl.remove();
        streamEl = null;
      }
    };

    // ── Split editor toggle ──────────────────────────────────
    $('cdrEditorSplitBtn')?.addEventListener('click', () => {
      const pane = $('cdrEditorPane');
      const willSplit = pane && !pane.classList.contains('split');
      if (pane) pane.classList.toggle('split');
      const tabsB = $('cdrEditorTabsB');
      if (tabsB) tabsB.hidden = !pane?.classList.contains('split');
      if (willSplit && ctx.editorPane?.activePath) {
        ctx.editorPane.openFileSecondary(ctx.editorPane.activePath).catch(() => {});
      }
      ctx.editorPane?.layout?.();
    });

    updateTrustChip();
    renderProblems();

    return ctx;
  }

  window.CdrIdeFeatures = { mount, loadPrefs, savePrefs };
})();
