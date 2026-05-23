import { $, esc, baseName, setExplorerRootLabel, setRouterChip, relativeFromRoot as relFromRoot } from './dom-utils.js';
import { injectAllToolBlocks } from './tool-blocks.js';
import { callWithRouter } from './router.js';
import { createLegacyBridge } from './legacy-bridge.js';
import { registerCodeMode, scheduleCoderBoot, initSharedDom } from './register.js';
import { startStatsPolling } from './stats-poll.js';

export function installCodeMode() {
// MiraXCode Coder mode — Wave 10 (modes/code/install.js)

  // ── Shared state ───────────────────────────────────────────
  const sharedState = { projectRoot: null, activeFile: null, homeDir: null };
  let _skillsForPrompt = [];
  let _graphifyContext = '';
  /** Active Coder tab model id — module scope so context chip helpers can read it. */
  let coderModel = null;

  function relativeFromRoot(path) {
    return relFromRoot(path, sharedState.projectRoot);
  }

    function setStatus(text, cls) {
      const dot = document.getElementById('cdrStatusDot');
      const txt = document.getElementById('cdrStatusText');
      if (txt) txt.textContent = text || 'Ready';
      if (dot) {
        dot.className = 'cdr-status-dot';
        if (cls === 'thinking') dot.classList.add('thinking');
        else if (cls === 'err') dot.classList.add('err');
      }
    }

    function activeModelValue() {
      const H = window._H;
      return coderModel || H?.selectedModel?.() || '';
    }

    function shortModelLabel(val) {
      if (!val) return 'Auto';
      const mp = $('cdrModelPicker');
      if (mp) {
        for (const opt of mp.options) {
          if (opt.value === val) return opt.textContent || val;
        }
      }
      if (val.startsWith('cloud:')) {
        const parts = val.split(':');
        const id = parts.slice(2).join(':');
        return id.split('/').pop() || id || val;
      }
      return val.split('/').pop() || val;
    }

    function applyCoderModelToUi(fromCoderPicker) {
      const mp = $('cdrModelPicker');
      if (mp) mp.value = coderModel || '';
      const label = mp?.options?.[mp.selectedIndex]?.text || shortModelLabel(coderModel);
      onCoderModelChanged(label, fromCoderPicker ?? !!coderModel);
    }

    function updateCoderContextChip(msgs) {
      const chip = $('cdrCtxChip');
      if (!chip || !HC?.contextCompactor?.usageRatio) return;
      const u = HC.contextCompactor.usageRatio(msgs || _conversationMsgs, activeModelValue());
      chip.textContent = `Ctx ${u.pct}%`;
      const compactLine = HC.contextCompactor.getResolvedCompactionLabel?.() || "";
      chip.title =
        `~${u.estimated.toLocaleString()} / ${u.max.toLocaleString()} tokens (${u.profile.label}) · compacts at ${u.threshold.toLocaleString()}\n` +
        compactLine +
        '\nChange in Settings → APIs → Context compaction';
      chip.classList.toggle('warn', u.pct >= 70 && u.pct < 88);
      chip.classList.toggle('hot', u.pct >= 88);
    }

  // ══════════════════════════════════════════════════════════════
  // CoderMode — Full-screen chat agent overlay (Claude Code style)
  // ══════════════════════════════════════════════════════════════
  const CoderMode = (() => {
    let mounted            = false;
    let agentCount         = 1;
    const MAX_CONCURRENT   = 2;
    let runAbort           = null;
    let _conversationMsgs  = [];
    let _fileChanges       = [];
    let toolCallCounter    = 0;
    let activeContentEl    = null;
    let cdrTraceEntries    = [];
    let cdrTraceStartedAt  = Date.now();
    const SESSIONS_KEY     = 'hc-coder-sessions';
    const STATE_KEY        = 'hashui_coder_state';
    const TABS_KEY         = 'miraxcode_coder_tabs';
    let _chatVirtual       = null;
    let _editorPane        = null;
    let _ideCtx            = null;
    let _lspDiagUnsub      = null;
    let _symbolFilter      = '';
    let _symbolKindFilter  = '';
    let _domScrollBatch    = 0;
    let _runGeneration     = 0;
    let _runTabId          = null;
    /** File-change array pinned to the tab that started the current run. */
    let _runFileChanges    = null;
    let _domWired          = false;
    let _powerWired        = false;
    let _onTraceDocClick   = null;
    let _onCoderKeydown    = null;
    let _onSymbolKeydown   = null;
    let _onModelsUpdated   = null;
    let _terminalBusy      = false;
    const MAX_TAB_MSGS     = 120;
    const MAX_TAB_FC       = 40;

    function cloneMsgForStorage(m) {
      const out = { role: m.role };
      if (typeof m.content === 'string') {
        out.content = m.content.slice(0, MAX_SESSION_MSG_CHARS);
      } else if (m.content != null) {
        out.content = m.content;
      }
      if (m.tool_calls) out.tool_calls = m.tool_calls;
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
      if (m.name) out.name = m.name;
      return out;
    }

    function normalizeTab(tab) {
      if (!tab || typeof tab !== 'object') return null;
      return {
        id: tab.id || _tabMgr.newId(),
        title: tab.title || 'Session',
        msgs: Array.isArray(tab.msgs) ? tab.msgs : [],
        fc: Array.isArray(tab.fc) ? tab.fc : [],
        model: tab.model ?? null,
        pendingImages: Array.isArray(tab.pendingImages) ? tab.pendingImages : [],
        pendingFiles: Array.isArray(tab.pendingFiles) ? tab.pendingFiles : [],
        agentCount: tab.agentCount || 1,
        running: false,
        compactionLedger: tab.compactionLedger || '',
      };
    }

    function abortActiveRun(reason) {
      if (!runAbort) return;
      try { runAbort.abort(reason || 'Run interrupted'); } catch {}
      runAbort = null;
      _runTabId = null;
      _runFileChanges = null;
      const runBtn = $('cdrRunBtn');
      const stopBtn = $('cdrStopBtn');
      if (runBtn) runBtn.style.display = '';
      if (stopBtn) stopBtn.style.display = 'none';
      _tabMgr.tabs.forEach(t => { t.running = false; });
    }

    function activeFileChanges() {
      return _runFileChanges || _fileChanges;
    }

    // ── Tabbed Sessions ──────────────────────────────────────
    const _tabMgr = {
      tabs: [],
      activeId: null,
      _uid: 0,
      newId() { return 'tab-' + Date.now() + '-' + (++this._uid); },
      create(title) {
        const tab = {
          id: this.newId(),
          title: title || 'New Session',
          msgs: [],
          fc: [],
          model: null,
          pendingImages: [],
          pendingFiles: [],
          agentCount: 1,
          running: false,
          compactionLedger: "",
        };
        this.tabs.push(tab);
        return tab;
      },
      active() { return this.tabs.find(t => t.id === this.activeId) || this.tabs[0]; },
      switchTo(id) {
        const prev = this.active();
        if (prev && prev.id !== id) {
          prev.msgs = _conversationMsgs;
          prev.fc = _fileChanges;
          prev.model = coderModel;
          window.CdrComposerAttachments?.syncToTab?.();
          prev.pendingImages = window.CdrComposerAttachments?.getSnapshot?.().images || [];
          prev.pendingFiles = window.CdrComposerAttachments?.getSnapshot?.().files || [];
          prev.agentCount = agentCount;
          prev.running = false;
        }
        const tab = this.tabs.find(t => t.id === id);
        if (!tab) return null;
        this.activeId = id;
        _conversationMsgs = tab.msgs || [];
        _fileChanges = tab.fc || [];
        coderModel = tab.model;
        window.CdrComposerAttachments?.loadFromTab?.(tab);
        agentCount = tab.agentCount || 1;
        this.save();
        return tab;
      },
      close(id) {
        const idx = this.tabs.findIndex(t => t.id === id);
        if (idx < 0) return;
        if (this.tabs.length <= 1) {
          this.tabs[0].msgs = [];
          this.tabs[0].fc = [];
          this.tabs[0].title = 'New Session';
          this.tabs[0].running = false;
          _conversationMsgs = this.tabs[0].msgs;
          _fileChanges = this.tabs[0].fc;
          return;
        }
        const wasActive = this.activeId === id;
        this.tabs.splice(idx, 1);
        if (wasActive) {
          const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
          this.activeId = next.id;
          _conversationMsgs = next.msgs;
          _fileChanges = next.fc;
          coderModel = next.model;
          window.CdrComposerAttachments?.loadFromTab?.(next);
          agentCount = next.agentCount || 1;
        }
        this.save();
      },
      syncFromVars() {
        const tab = this.active();
        if (tab) {
          tab.msgs = _conversationMsgs;
          tab.fc = _fileChanges;
          tab.model = coderModel;
          window.CdrComposerAttachments?.syncToTab?.();
          tab.pendingImages = window.CdrComposerAttachments?.getSnapshot?.().images || [];
          tab.pendingFiles = window.CdrComposerAttachments?.getSnapshot?.().files || [];
          tab.agentCount = agentCount;
          tab.running = !!runAbort;
        }
      },
      save() {
        this.syncFromVars();
        try {
          const tabs = this.tabs.map(t => ({
            ...t,
            running: false,
            msgs: (t.msgs || []).slice(-MAX_TAB_MSGS).map(cloneMsgForStorage),
            fc: (t.fc || []).slice(-MAX_TAB_FC).map(fc => ({
              name: fc.name,
              path: fc.path,
              kind: fc.kind,
              status: fc.status,
              applied: fc.applied,
              content: typeof fc.content === 'string' ? fc.content.slice(0, 12_000) : fc.content,
              proposedContent: typeof fc.proposedContent === 'string' ? fc.proposedContent.slice(0, 12_000) : fc.proposedContent,
            })),
          }));
          localStorage.setItem(TABS_KEY, JSON.stringify({ v: 1, tabs, activeId: this.activeId }));
        } catch (e) {
          console.warn('[CoderMode] tab save failed:', e);
        }
      },
      load() {
        try {
          const raw = localStorage.getItem(TABS_KEY);
          if (!raw) return false;
          const data = JSON.parse(raw);
          if (!data || !Array.isArray(data.tabs) || !data.tabs.length) return false;
          this.tabs = data.tabs.map(normalizeTab).filter(Boolean);
          this.activeId = data.activeId || this.tabs[0]?.id;
          if (!this.tabs.find(t => t.id === this.activeId)) this.activeId = this.tabs[0]?.id;
          const active = this.active();
          if (active) {
            _conversationMsgs = active.msgs;
            _fileChanges = active.fc;
            coderModel = active.model;
            window.CdrComposerAttachments?.loadFromTab?.(active);
            agentCount = active.agentCount || 1;
          }
          return true;
        } catch (e) {
          console.warn('[CoderMode] tab load failed:', e);
          return false;
        }
      },
    };

    function _initFirstTab() {
      if (!_tabMgr.tabs.length) {
        const tab = _tabMgr.create('Session 1');
        _tabMgr.activeId = tab.id;
        _conversationMsgs = tab.msgs;
        _fileChanges = tab.fc;
      }
    }

    // _conversationMsgs and _fileChanges are the working vars.
    // On tab switch, _tabMgr.switchTo() reassigns them to the target tab's arrays.
    // Since arrays are by-reference, .push() mutations flow back to the tab automatically.

    // ── Tab bar rendering ────────────────────────────────────
    function renderTabBar() {
      const scroll = document.getElementById('cdrTabsScroll');
      if (!scroll) return;
      _tabMgr.syncFromVars();
      scroll.innerHTML = '';
      _tabMgr.tabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = 'cdr-tab' + (tab.id === _tabMgr.activeId ? ' active' : '');
        el.dataset.tabId = tab.id;
        const dotClass = tab.running ? 'cdr-tab-dot running' : 'cdr-tab-dot';
        const modelTag = tab.model ? shortModelLabel(tab.model) : '';
        const modelHtml = modelTag && modelTag !== 'Auto'
          ? `<span class="cdr-tab-model" title="${esc(modelTag)}">${esc(modelTag.length > 14 ? modelTag.slice(0, 12) + '…' : modelTag)}</span>`
          : '';
        el.title = modelTag && modelTag !== 'Auto' ? `${tab.title} · ${modelTag}` : tab.title;
        el.innerHTML = `<span class="${dotClass}"></span><span class="cdr-tab-title">${esc(tab.title)}</span>${modelHtml}<span class="cdr-tab-close" data-close="${tab.id}">&times;</span>`;
        el.addEventListener('click', (e) => {
          if (e.target.classList.contains('cdr-tab-close')) {
            e.stopPropagation();
            onTabClose(e.target.dataset.close);
            return;
          }
          onTabSwitch(tab.id);
        });
        scroll.appendChild(el);
      });
    }

    function onTabSwitch(id) {
      if (id === _tabMgr.activeId) return;
      if (runAbort) abortActiveRun('Tab switched');
      saveCoderState();
      const tab = _tabMgr.switchTo(id);
      if (!tab) return;
      renderConversation();
      renderTabBar();
      renderFileChangePills();
      updatePendingChangesHeader();
      applyCoderModelToUi(!!coderModel);
      setStatus('Ready', '');
    }

    function onTabClose(id) {
      const tab = _tabMgr.tabs.find(t => t.id === id);
      if (!tab) return;
      if (tab.msgs.length && !window.confirm('Close "' + tab.title + '"? Chat history will be saved to sessions.')) return;
      if (runAbort && tab.id === _runTabId) abortActiveRun('Tab closed');
      saveCurrentSession(tab);
      _tabMgr.close(id);
      renderConversation();
      renderTabBar();
      renderFileChangePills();
      setStatus('Ready', '');
    }

    function onTabNew() {
      saveCoderState();
      saveCurrentSession();
      const tab = _tabMgr.create('Session ' + (_tabMgr.tabs.length + 1));
      _tabMgr.switchTo(tab.id);
      clearChatUI();
      renderTabBar();
    }

    async function refreshGitStatus() {
      const list = $('cdrGitList');
      const root = sharedState.projectRoot;
      if (!list) return;
      if (!root || !HC?.invoke) {
        list.innerHTML = '<div class="cdr-git-empty">Open a project folder</div>';
        return;
      }
      try {
        const r = await HC.invoke('shell_run', {
          command: 'git',
          args: ['status', '--porcelain'],
          cwd: root,
        });
        const lines = String(r?.stdout || '').trim().split('\n').filter(Boolean);
        if (!lines.length) {
          list.innerHTML = '<div class="cdr-git-empty">Working tree clean</div>';
          return;
        }
        const base = root.replace(/\/$/, '');
        list.innerHTML = lines.map(line => {
          const st = esc(line.slice(0, 2));
          const file = line.slice(3).trim();
          const full = file.startsWith('/') ? file : `${base}/${file}`;
          return `<button type="button" class="cdr-git-item" data-path="${esc(full)}"><span class="cdr-git-st">${st}</span>${esc(file)}</button>`;
        }).join('');
        list.querySelectorAll('.cdr-git-item').forEach(btn => {
          btn.addEventListener('click', () => {
            setActiveFile(btn.dataset.path);
            _editorPane?.openFile(btn.dataset.path).catch(() => {});
          });
        });
      } catch {
        list.innerHTML = '<div class="cdr-git-empty">Not a git repository</div>';
      }
    }

    function initCoderPowerFeatures() {
      if (_powerWired) return;
      _powerWired = true;
      getChatVirtual();
      if (window.CdrEditorPane && !$('cdrEditorPane')?._wired) {
        _editorPane = new window.CdrEditorPane({
          paneEl: $('cdrEditorPane'),
          tabsEl: $('cdrEditorTabs'),
          tabsElB: $('cdrEditorTabsB'),
          hostEl: $('cdrEditorMonaco'),
          hostElB: $('cdrEditorMonacoB'),
          diffHostEl: $('cdrEditorDiff'),
          badgeEl: $('cdrEditorDiffBadge'),
          pathEl: $('cdrEditorPath'),
          readFile: (p) => HC.code.readFile(p),
          writeFile: (p, c, r) => HC.code.writeFile(p, c, r),
          onSaved: () => refreshGitStatus(),
          onGoToDefinition: (symbol, path) => goToDefinition(symbol, path),
        });
        $('cdrEditorPane')._wired = true;
        _editorPane.syncPendingChanges(_fileChanges);
        window.CdrStagedRead?.syncFromChanges?.(_fileChanges);
      }
      if (window.CdrIdeFeatures) {
        _ideCtx = window.CdrIdeFeatures.mount({
          $,
          ansiToHtml,
          getProjectRoot: () => sharedState.projectRoot,
          getFileChanges: () => _fileChanges,
          getProjectSymbols: () => sharedState.projectSymbols,
          setActiveFile,
          openEditor: (p, line, col) => _editorPane?.openFile(p, line, col),
          scrollMessages,
          appendTextToBubble,
          refreshGitStatus,
          editorPane: _editorPane,
        });
        if (_editorPane) {
          _editorPane.onDiagnosticsChange = (markers) => _ideCtx?.syncMonacoDiagnostics?.(markers);
        }
        _lspDiagUnsub?.();
        _lspDiagUnsub = window.CdrLspClient?.mountDiagnosticsListener?.((path, items) => {
          const mapped = (items || []).map((d) => ({
            file: path,
            line: d.line,
            col: d.column,
            message: d.message,
            severity: d.severity,
            source: 'lsp',
          }));
          if (mapped.length) _ideCtx?.reportProblems?.(mapped);
        });
      }
      $('cdrPendingChip')?.addEventListener('click', scrollToFirstPendingChange);
      $('cdrSearchOpenBtn')?.addEventListener('click', () => {
        const panel = $('cdrSearchPanel');
        if (panel) { panel.hidden = false; $('cdrSearchInput')?.focus(); }
      });
      $('cdrGitRefresh')?.addEventListener('click', () => refreshGitStatus());
      _onSymbolKeydown = (e) => {
        if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== 'o') return;
        if (!document.body.classList.contains('coder-mode')) return;
        e.preventDefault();
        const inp = $('cdrSymbolFilter');
        if (inp) { inp.focus(); inp.select(); }
        else HC?.guard?.notify?.('Open a project to scan symbols first', 'info');
      };
      document.addEventListener('keydown', _onSymbolKeydown);
      if (window.CdrMentions) {
        window.CdrMentions.attach($('cdrTaskInput'), {
          getProjectRoot: () => sharedState.projectRoot,
          listFiles: async (root) => {
            const out = [];
            async function walk(dir, depth) {
              if (out.length >= 400 || depth > 4) return;
              let entries;
              try { entries = await HC.code.listDir(dir); } catch { return; }
              for (const e of entries) {
                if (['node_modules', 'target', '.git', 'dist'].includes(e.name)) continue;
                if (e.name.startsWith('.') && e.name !== '.env') continue;
                const p = e.path || `${dir.replace(/\/$/, '')}/${e.name}`;
                const rel = relativeFromRoot(p);
                if (e.is_dir) {
                  out.push(rel + '/');
                  await walk(p, depth + 1);
                } else {
                  out.push(rel);
                }
                if (out.length >= 400) break;
              }
            }
            await walk(root, 0);
            return out;
          },
        });
      }
      if (window.MxCommandPalette) {
        window.MxCommandPalette.registerMany([
          { id: 'cdr-new-chat', group: 'Coder', label: 'New Coder chat', run: () => onTabNew() },
          { id: 'cdr-run', group: 'Coder', label: 'Run Coder task', run: () => startRun() },
          { id: 'cdr-stop', group: 'Coder', label: 'Stop Coder run', run: () => stopRun() },
          { id: 'cdr-open-folder', group: 'Coder', label: 'Open project folder', run: () => openProject() },
          { id: 'cdr-git-refresh', group: 'Coder', label: 'Refresh git status', run: () => refreshGitStatus() },
          { id: 'cdr-accept-all', group: 'Coder', label: 'Accept all pending file changes', run: () => acceptAllPendingChanges(activeContentEl) },
          { id: 'cdr-pending-jump', group: 'Coder', label: 'Jump to pending file changes', run: () => scrollToFirstPendingChange() },
          { id: 'cdr-search', group: 'Coder', label: 'Search in project (⌘⇧F)', run: () => {
            const panel = $('cdrSearchPanel');
            if (panel) { panel.hidden = false; $('cdrSearchInput')?.focus(); }
          }},
          { id: 'cdr-export-changes', group: 'Coder', label: 'Export changes audit (JSON)', run: () => {
            const out = _ideCtx?.buildChangesExport?.({ fullContent: true }) || '{"changes":[]}';
            const proj = (sharedState.projectRoot || 'session').split('/').pop() || 'session';
            const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            downloadBlob(out, 'application/json', `miraxcode-${proj}-changes-${ts}.json`);
          }},
          { id: 'cdr-toggle-plan', group: 'Coder', label: 'Toggle plan-only mode', run: () => {
            const el = $('cdrPlanOnly');
            if (el) { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
          }},
          { id: 'cdr-symbol-filter', group: 'Coder', label: 'Focus symbol filter', run: () => {
            $('cdrSymbolFilter')?.focus();
            $('cdrSymbolFilter')?.select();
          }},
        ]);
      }
      refreshGitStatus();
    }

    function clearChatUI() {
      activeContentEl = null;
      enterChatLiveMode();
      const msgs = $('cdrMessages');
      if (msgs) {
        msgs.innerHTML = `<div class="cdr-welcome">
          <div class="cdr-welcome-hero">
            <img src="/assets/logo-mark.png" class="cdr-welcome-mark" draggable="false" alt=""/>
            <div class="cdr-welcome-copy">
              <h1 class="cdr-welcome-title">Coder Mode</h1>
              <p class="cdr-welcome-sub">Surgical AI tasks · auto-routed · local-first</p>
            </div>
          </div>
          <div class="cdr-welcome-chips">
            <span class="cdr-welcome-chip" data-prompt="List all files in the project and give me a quick overview of the codebase structure">Explore codebase</span>
            <span class="cdr-welcome-chip" data-prompt="Find all TODO and FIXME comments in the project">Find TODOs</span>
            <span class="cdr-welcome-chip" data-prompt="Check for any obvious bugs or issues in the main source files">Debug &amp; audit</span>
            <span class="cdr-welcome-chip" data-prompt="Write unit tests for the core functionality">Write tests</span>
          </div>
        </div>`;
        msgs.querySelectorAll('.cdr-welcome-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            const ti = $('cdrTaskInput');
            if (!ti || !chip.dataset.prompt) return;
            ti.value = chip.dataset.prompt;
            autoResize(ti);
            ti.focus();
          });
        });
      }
      setStatus('Ready', '');
      setRouterChip('Auto', '');
    }

    function updatePendingChangesHeader() {
      const chip = $('cdrPendingChip');
      if (!chip) return;
      const pending = _fileChanges.filter(fc => fc.status === 'pending').length;
      const applied = _fileChanges.filter(fc => fc.status === 'accepted').length;
      if (pending > 0) {
        chip.hidden = false;
        chip.classList.add('hot');
        chip.textContent = `${pending} pending`;
        chip.title = 'Click to jump to pending file changes';
      } else if (applied > 0) {
        chip.hidden = false;
        chip.classList.remove('hot');
        chip.textContent = `${applied} applied`;
        chip.title = 'All staged changes reviewed — Revert available on accepted rows';
      } else {
        chip.hidden = true;
        chip.classList.remove('hot');
      }
      _editorPane?.syncPendingChanges?.(_fileChanges);
      window.CdrStagedRead?.syncFromChanges?.(_fileChanges);
    }

    function scrollToFirstPendingChange() {
      const row = document.querySelector('.cdr-change-row.pending');
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('cdr-change-flash');
        setTimeout(() => row.classList.remove('cdr-change-flash'), 1400);
        const idx = parseInt(row.dataset.changeIdx, 10);
        const entry = _fileChanges[idx];
        if (entry?.path && _editorPane) {
          setActiveFile(entry.path);
          _editorPane.openFile(entry.path).catch(() => {});
        }
        return;
      }
      HC?.guard?.notify?.('No pending changes in the current view', 'info');
    }

    function renderFileChangePills() {
      const el = $('cdrChangePills');
      if (!el) return;
      el.innerHTML = '';
      const pending = _fileChanges.filter(fc => fc.status === 'pending').length;
      if (pending > 1) {
        const batch = document.createElement('button');
        batch.type = 'button';
        batch.className = 'cdr-change-pill batch';
        batch.textContent = `Accept all (${pending})`;
        batch.addEventListener('click', () => acceptAllPendingChanges(activeContentEl));
        el.appendChild(batch);
      }
      _fileChanges.forEach((fc, i) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'cdr-change-pill ' + (fc.kind || 'write') + (fc.status === 'accepted' ? ' done' : fc.status === 'rejected' ? ' skip' : '');
        pill.textContent = fc.name || fc.path || 'change';
        pill.title = (fc.status || 'pending') + (fc.path ? ' · ' + fc.path : '');
        pill.addEventListener('click', () => {
          showChangeOverlay(i);
          if (fc.path && _editorPane) {
            setActiveFile(fc.path);
            _editorPane.openFile(fc.path).catch(() => {});
          }
        });
        el.appendChild(pill);
      });
      updatePendingChangesHeader();
    }

    // ── State persistence ─────────────────────────────────────
    function saveCoderState() {
      _tabMgr.save();
      try {
        const state = {
          projectRoot: sharedState.projectRoot,
          homeDir: sharedState.homeDir,
          activeFile: sharedState.activeFile,
          ts: Date.now(),
        };
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
      } catch {}
    }
    function restoreCoderState() {
      try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return;
        const state = JSON.parse(raw);
        if (!state) return;
        if (state.projectRoot) {
          sharedState.projectRoot = state.projectRoot;
          sharedState.homeDir = state.homeDir || sharedState.homeDir;
          sharedState.activeFile = state.activeFile || null;
          syncProjectLabel();
          HC?.guard?.setProjectRoot?.(state.projectRoot);
          setExplorerRootLabel(state.projectRoot);
          renderExplorerTree(state.projectRoot).catch(() => {});
        }
      } catch (e) { console.warn('[CoderMode] restore state failed:', e); }
    }
    function clearCoderState() {
      try { localStorage.removeItem(STATE_KEY); } catch {}
    }

    // ── Mount / destroy ───────────────────────────────────────
    function mount() {
      if (mounted) return;
      mounted = true;
      // Init tabs: restore or create first
      const loaded = _tabMgr.load();
      if (!loaded) _initFirstTab();
      wireDom();
      window.CdrComposerAttachments?.loadFromTab?.(_tabMgr.active());
      syncProjectLabel();
      setRouterChip('Auto', '');
      if (sharedState.projectRoot) {
        HC?.guard?.setProjectRoot?.(sharedState.projectRoot);
        if (HC?.code) HC.code.getProjectRoot = () => sharedState.projectRoot;
      }
      syncCoderGuardToggles();
      refreshCoderSkills();
      refreshGraphifyForProject();
      if (HC?.isTauri && !sharedState.homeDir) {
        HC.invoke('shell_run', { command: 'sh', args: ['-c', 'echo $HOME'], cwd: null })
          .then(r => {
            if (r?.stdout?.trim()) {
              sharedState.homeDir = r.stdout.trim();
              refreshCoderSkills();
            }
          })
          .catch(() => {});
      }
      restoreCoderState();
      initCoderPowerFeatures();
      // Restore active tab conversation
      if (_conversationMsgs.length) renderConversation();
      renderTabBar();
      renderFileChangePills();
      syncTerminalPrompt();
      updateCoderContextChip(_conversationMsgs);
    }

    function remount() {
      populateModelPicker();
      renderSessions();
      renderTabBar();
    }

    function destroy() {
      mounted = false;
      _runGeneration++;
      abortActiveRun('Coder unmounted');
      if (_statsInterval) {
        clearInterval(_statsInterval);
        _statsInterval = null;
      }
      if (_onTraceDocClick) {
        document.removeEventListener('click', _onTraceDocClick);
        _onTraceDocClick = null;
      }
      if (_onCoderKeydown) {
        document.removeEventListener('keydown', _onCoderKeydown);
        _onCoderKeydown = null;
      }
      if (_onSymbolKeydown) {
        document.removeEventListener('keydown', _onSymbolKeydown);
        _onSymbolKeydown = null;
      }
      if (_onModelsUpdated) {
        document.removeEventListener('miraxcode:models-updated', _onModelsUpdated);
        _onModelsUpdated = null;
      }
      _domWired = false;
      _powerWired = false;
      const pane = $('cdrEditorPane');
      if (pane) pane._wired = false;
      _lspDiagUnsub?.();
      _lspDiagUnsub = null;
      _ideCtx = null;
      window.CdrMarkdown?.terminate?.();
      _editorPane?.dispose?.();
      _editorPane = null;
      activeContentEl = null;
    }

    function syncCoderGuardToggles() {
      const prefs = HC?.guard?.getPrefs?.() || {};
      const yoloEl = $('cdrYoloMode');
      const bypassEl = $('cdrBypassPerms');
      if (yoloEl) yoloEl.checked = !!prefs.yoloMode;
      if (bypassEl) {
        bypassEl.checked = !!prefs.bypassPermissions;
        bypassEl.disabled = !!prefs.yoloMode;
        bypassEl.title = prefs.yoloMode
          ? 'YOLO enables bypass automatically'
          : 'Bypass permission prompts for tools and shell';
      }
    }

    function refreshSystemPromptInConversation() {
      if (_conversationMsgs.length && _conversationMsgs[0]?.role === 'system') {
        _conversationMsgs[0].content = sysPrompt();
      }
    }

    function updateGraphChip(ready, nodesHint) {
      const chip = $('cdrGraphChip');
      if (!chip) return;
      if (!sharedState.projectRoot) {
        chip.textContent = 'Graph —';
        chip.title = 'Open a project to build Graphify map';
        return;
      }
      chip.textContent = ready ? (nodesHint || 'Graph ✓') : 'Graph …';
      chip.title = ready
        ? `Graphify: ${HC.coderGraphify?.reportPath?.(sharedState.projectRoot) || 'graphify-out/'}`
        : 'Click to build Graphify knowledge graph';
    }

    async function refreshGraphifyForProject({ force = false } = {}) {
      const root = sharedState.projectRoot;
      if (!root) {
        _graphifyContext = '';
        updateGraphChip(false);
        return;
      }
      updateGraphChip(false);
      const onStatus = (t) => { if (t) setStatus(t, 'thinking'); };
      const ok = await HC?.coderGraphify?.ensureGraph?.(root, onStatus, { force });
      if (ok) {
        const report = await HC.coderGraphify.loadReportExcerpt(root);
        const m = report.match(/(\d+)\s+nodes/i);
        updateGraphChip(true, m ? `Graph ${m[1]}` : 'Graph ✓');
      } else {
        updateGraphChip(false);
      }
      refreshSystemPromptInConversation();
      setStatus('Ready', '');
    }

    async function loadGraphifyContextForTask(task) {
      const root = sharedState.projectRoot;
      if (!root || !HC?.coderGraphify?.contextForTask) {
        _graphifyContext = '';
        return '';
      }
      _graphifyContext = await HC.coderGraphify.contextForTask(root, task, (t) => {
        if (t) setStatus(t, 'thinking');
      });
      setStatus('Ready', '');
      return _graphifyContext;
    }

    function onCoderModelChanged(label, fromCoderPicker) {
      _tabMgr.syncFromVars();
      const short = label.length > 28 ? label.slice(0, 26) + '…' : label;
      setRouterChip(short, fromCoderPicker ? 'Coder model' : 'Following main model picker');
      const turns = _conversationMsgs.filter(m => m.role === 'user').length;
      if (_conversationMsgs.length && _conversationMsgs[0]?.role === 'system') {
        const continuity =
          `\n[Session continuity: ${turns} user turn(s) in this tab — full message history is preserved. ` +
          `Active model: ${label}. Continue from prior context; do not restart the task.]`;
        _conversationMsgs[0].content = sysPrompt() + continuity;
      }
      _tabMgr.save();
      updateCoderContextChip(_conversationMsgs);
      if (turns > 0) {
        HC?.guard?.notify?.(`Model → ${short} (conversation kept)`, 'info');
      }
    }

    async function refreshCoderSkills({ force = false } = {}) {
      const chip = $('cdrSkillsChip');
      let home = sharedState.homeDir || '';
      if (!home && HC?.isTauri) {
        try {
          const r = await HC.invoke('shell_run', { command: 'sh', args: ['-c', 'echo $HOME'], cwd: null });
          if (r?.stdout?.trim()) {
            sharedState.homeDir = r.stdout.trim();
            home = sharedState.homeDir;
          }
        } catch {}
      }
      if (!home) {
        _skillsForPrompt = HC?.coderSkills?.getCached?.() || [];
        if (chip) chip.textContent = _skillsForPrompt.length ? `Skills ${_skillsForPrompt.length}` : 'Skills …';
        return;
      }
      if (chip && force) chip.textContent = 'Skills …';
      try {
        const skills = await HC?.coderSkills?.discoverInstalledSkills?.(home, { force });
        _skillsForPrompt = skills || [];
        if (chip) {
          chip.textContent = `Skills ${_skillsForPrompt.length}`;
          chip.title = _skillsForPrompt.length
            ? _skillsForPrompt.slice(0, 24).map(s => `${s.name} (${s.source})`).join('\n')
            : 'No skills found — click to rescan';
        }
        refreshSystemPromptInConversation();
      } catch (e) {
        console.warn('[CoderMode] skills scan failed:', e);
        if (chip) chip.textContent = 'Skills err';
      }
    }

    // ── DOM wiring ────────────────────────────────────────────
    function wireDom() {
      if (_domWired) return;
      _domWired = true;
      const runBtn            = $('cdrRunBtn');
      const stopBtn           = $('cdrStopBtn');
      const backBtn           = $('cdrBackBtn');
      const auditBtn          = $('cdrAuditBtn');
      const resetPermsBtn     = $('cdrResetPermsBtn');
      const exportBtn         = $('cdrExportBtn');
      const clearBtn          = $('cdrClearChatBtn');
      const taskInput         = $('cdrTaskInput');
      const leftAddFileBtn    = $('cdrLeftAddFileBtn');
      const leftAddFolderBtn  = $('cdrLeftAddFolderBtn');
      const clearFilesBtn     = $('cdrClearFilesBtn');
      const sessionsClearAll  = $('cdrSessionsClearAllBtn');
      const sessionsSearchEl  = $('cdrSessionsSearch');

      if (runBtn)            runBtn.addEventListener('click', startRun);
      if (stopBtn)           stopBtn.addEventListener('click', stopRun);
      if (backBtn)           backBtn.addEventListener('click', goBack);
      if (clearBtn)          clearBtn.addEventListener('click', clearChat);
      if (leftAddFileBtn)    leftAddFileBtn.addEventListener('click', openFile);
      if (leftAddFolderBtn)  leftAddFolderBtn.addEventListener('click', openProject);
      if (clearFilesBtn)     clearFilesBtn.addEventListener('click', clearFilesPanel);
      if (auditBtn)          auditBtn.addEventListener('click', showAuditLog);
      if (resetPermsBtn)     resetPermsBtn.addEventListener('click', () => {
        if (!window.confirm('Revoke all session permissions you granted this session? The agent will ask again before any write or shell operation.')) return;
        HC.guard.clearSession?.();
      });

      const traceBtn   = $('cdrTraceBtn');
      const tracePanel = $('cdrTracePanel');
      const traceClear = $('cdrTraceClear');
      if (traceBtn && tracePanel) {
        traceBtn.addEventListener('click', e => {
          e.stopPropagation();
          tracePanel.classList.toggle('open');
          renderCdrTrace();
        });
        tracePanel.addEventListener('click', e => e.stopPropagation());
      }
      if (traceClear) traceClear.addEventListener('click', () => cdrTraceReset('Trace cleared'));
      _onTraceDocClick = () => $('cdrTracePanel')?.classList.remove('open');
      document.addEventListener('click', _onTraceDocClick);
      if (exportBtn)         exportBtn.addEventListener('click', exportChat);
      if (sessionsClearAll)  sessionsClearAll.addEventListener('click', async () => {
        try { localStorage.removeItem(SESSIONS_KEY); } catch {}
        renderSessions();
      });
      if (sessionsSearchEl)  sessionsSearchEl.addEventListener('input', () => renderSessions(sessionsSearchEl.value));

      const yoloEl = $('cdrYoloMode');
      const bypassEl = $('cdrBypassPerms');
      const skillsChip = $('cdrSkillsChip');
      if (yoloEl) {
        yoloEl.addEventListener('change', () => {
          HC?.guard?.setYoloMode?.(yoloEl.checked);
          syncCoderGuardToggles();
          refreshSystemPromptInConversation();
        });
      }
      if (bypassEl) {
        bypassEl.addEventListener('change', () => {
          if (yoloEl?.checked) return;
          HC?.guard?.setBypassPermissions?.(bypassEl.checked);
          syncCoderGuardToggles();
          refreshSystemPromptInConversation();
        });
      }
      if (skillsChip) {
        skillsChip.addEventListener('click', () => {
          refreshCoderSkills({ force: true });
        });
      }
      const graphChip = $('cdrGraphChip');
      if (graphChip) {
        graphChip.addEventListener('click', () => {
          if (!sharedState.projectRoot) {
            HC?.guard?.notify?.('Open a project folder first', 'info');
            return;
          }
          refreshGraphifyForProject({ force: true });
        });
      }

      const mainModel = document.getElementById('model');
      if (mainModel) {
        mainModel.addEventListener('change', () => {
          const mp = $('cdrModelPicker');
          if (!mp || mp.value) return;
          onCoderModelChanged(mainModel.options[mainModel.selectedIndex]?.text || 'Auto', false);
        });
      }

      // Terminal wiring
      const termInput = $('cdrTerminalInput');
      const termClear = $('cdrTerminalClear');
      if (termInput) termInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { onTerminalKey(e); return; }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (_termHistIdx > 0) { _termHistIdx--; termInput.value = _termHistory[_termHistIdx] || ''; }
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (_termHistIdx < _termHistory.length - 1) { _termHistIdx++; termInput.value = _termHistory[_termHistIdx] || ''; }
          else { _termHistIdx = _termHistory.length; termInput.value = ''; }
          return;
        }
      });
      if (termClear) termClear.addEventListener('click', clearTerminal);

      const sessionsClearBtn = $('cdrSessionsClearBtn');
      if (sessionsClearBtn) sessionsClearBtn.addEventListener('click', () => {
        try { localStorage.removeItem(SESSIONS_KEY); } catch {}
        renderSessions();
      });

      const overlayClose = $('cdrChangeOverlayClose');
      if (overlayClose) overlayClose.addEventListener('click', closeChangeOverlay);
      const overlay = $('cdrChangeOverlay');
      if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeChangeOverlay(); });

      // Tab bar wiring
      const tabAddBtn = document.getElementById('cdrTabAdd');
      if (tabAddBtn) tabAddBtn.addEventListener('click', onTabNew);

      // Ctrl+T for new tab
      _onCoderKeydown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 't' && document.getElementById('coder-mode-wrap')?.style.display !== 'none') {
          if (document.body.classList.contains('coder-mode')) {
            e.preventDefault();
            onTabNew();
          }
        }
      };
      document.addEventListener('keydown', _onCoderKeydown);

      renderSessions();
      initExplorerContextMenu();
      wireChangeRowDelegation();

      // Quick-action chips on welcome screen
      document.querySelectorAll('.cdr-welcome-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const prompt = chip.dataset.prompt;
          if (!prompt || !taskInput) return;
          taskInput.value = prompt;
          autoResize(taskInput);
          taskInput.focus();
        });
      });

      document.querySelectorAll('.cdr-agent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.cdr-agent-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          agentCount = parseInt(btn.dataset.agents, 10) || 1;
        });
      });

      if (taskInput) {
        taskInput.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startRun(); }
        });
        taskInput.addEventListener('input', () => autoResize(taskInput));
      }

      populateModelPicker();
      window.CdrComposerAttachments?.mount?.({
        getTab: () => _tabMgr.active(),
        onChange: () => _tabMgr.save(),
      });
      _onModelsUpdated = () => populateModelPicker();
      document.addEventListener('miraxcode:models-updated', _onModelsUpdated);
      const modelPicker = $('cdrModelPicker');
      if (modelPicker) {
        modelPicker.addEventListener('change', () => {
          coderModel = modelPicker.value || null;
          applyCoderModelToUi(true);
        });
      }
      startStatsPolling();
    }

    // Models known to reliably support structured tool/function calling.
    // Providers not listed here are excluded from the coder mode picker.
    function populateModelPicker() {
      const src = document.getElementById('model');
      const dest = $('cdrModelPicker');
      if (!src || !dest) return;
      dest.innerHTML = '';
      const autoOpt = document.createElement('option');
      autoOpt.value = '';
      autoOpt.textContent = 'Auto (follow main picker)';
      dest.appendChild(autoOpt);
      // Only clone direct children of #model. querySelectorAll('optgroup, option')
      // also matches options inside optgroups, which duplicates every cloud model twice
      // (once indented under the group label, once flush left as orphan options).
      Array.from(src.children).forEach(node => {
        if (node.tagName === 'OPTGROUP') {
          const group = document.createElement('optgroup');
          group.label = node.label;
          if (node.dataset.cloud) group.dataset.cloud = node.dataset.cloud;
          if (node.dataset.provider) group.dataset.provider = node.dataset.provider;
          Array.from(node.children).forEach(opt => {
            if (opt.tagName === 'OPTION') group.appendChild(opt.cloneNode(true));
          });
          if (group.childElementCount) dest.appendChild(group);
        } else if (node.tagName === 'OPTION') {
          dest.appendChild(node.cloneNode(true));
        }
      });
      dest.value = coderModel || src.value || '';
    }

    function autoResize(el) {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 320) + 'px';
    }


    function goBack() {
      const H = window._H;
      const prev = H?.state?._preCoderTab || 'chats';
      H?.setTab?.(prev);
    }

    function syncProjectLabel() {
      const sub = $('cdrProjectSub');
      if (!sub) return;
      const root = sharedState.projectRoot;
      sub.textContent = root ? root.split('/').slice(-1)[0] : 'No project open';
      sub.title = root || '';
      _ideCtx?.updateTrustChip?.();
    }

    function setActiveFile(path) {
      sharedState.activeFile = path;
      const sub = $('cdrProjectSub');
      if (sub && path) {
        sub.textContent = path.split('/').slice(-1)[0] || path;
        sub.title = path;
      }
    }

    // ── Explorer context menu (Cursor-style) ───────────────────
    let _explorerCtxTarget = null;
    let _explorerCtxMenu = null;

    function explorerCtxMenuEl() {
      if (_explorerCtxMenu) return _explorerCtxMenu;
      const menu = document.createElement('div');
      menu.id = 'cdrExplorerCtxMenu';
      menu.className = 'cdr-ctx-menu';
      menu.setAttribute('role', 'menu');
      menu.hidden = true;
      document.body.appendChild(menu);
      menu.addEventListener('click', e => e.stopPropagation());
      menu.addEventListener('contextmenu', e => e.stopPropagation());
      _explorerCtxMenu = menu;
      document.addEventListener('click', () => hideExplorerContextMenu());
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') hideExplorerContextMenu();
      });
      window.addEventListener('blur', () => hideExplorerContextMenu());
      window.addEventListener('resize', () => hideExplorerContextMenu());
      return menu;
    }

    function hideExplorerContextMenu() {
      const menu = _explorerCtxMenu;
      if (!menu) return;
      menu.classList.remove('open');
      menu.hidden = true;
      menu.innerHTML = '';
      _explorerCtxTarget = null;
    }

    function ctxMenuItem(label, { shortcut, danger, disabled, onClick } = {}) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cdr-ctx-item' + (danger ? ' danger' : '');
      btn.setAttribute('role', 'menuitem');
      btn.disabled = !!disabled;
      const span = document.createElement('span');
      span.textContent = label;
      btn.appendChild(span);
      if (shortcut) {
        const sc = document.createElement('span');
        sc.className = 'cdr-ctx-shortcut';
        sc.textContent = shortcut;
        btn.appendChild(sc);
      }
      if (!disabled && onClick) {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          hideExplorerContextMenu();
          void onClick();
        });
      }
      return btn;
    }

    function ctxMenuSep() {
      const sep = document.createElement('div');
      sep.className = 'cdr-ctx-sep';
      sep.setAttribute('role', 'separator');
      return sep;
    }

    function copyClipboard(text) {
      const t = String(text || '');
      if (!t) return;
      navigator.clipboard?.writeText(t)?.catch(() => {});
    }

    function shellEscapePath(p) {
      return String(p || '').replace(/'/g, "'\\''");
    }

    async function revealInFinder(path) {
      if (!path || !HC?.isTauri) return;
      try {
        if (window.__TAURI__?.opener?.revealItemInDir) {
          await window.__TAURI__.opener.revealItemInDir(path);
          return;
        }
      } catch {}
      await HC.invoke('shell_run', { command: 'open', args: ['-R', path], cwd: null });
    }

    async function openPathExternal(path) {
      if (!path || !HC?.isTauri) return;
      try {
        if (window.__TAURI__?.opener?.openPath) {
          await window.__TAURI__.opener.openPath(path);
          return;
        }
      } catch {}
      await HC.invoke('shell_run', { command: 'open', args: [path], cwd: null });
    }

    function focusIntegratedTerminal() {
      const panel = $('cdrTerminalPanel');
      const input = $('cdrTerminalInput');
      if (panel) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      input?.focus();
      return input;
    }

    async function openInIntegratedTerminal(path, isDir) {
      const cwd = isDir ? path : (path.replace(/\/[^/]+$/, '') || path);
      const input = focusIntegratedTerminal();
      if (!cwd) return;
      const cmd = `cd '${shellEscapePath(cwd)}' && pwd`;
      if (input) {
        input.value = `cd '${shellEscapePath(cwd)}'`;
        input.focus();
      }
      if (!HC?.isTauri) {
        terminalLog('Terminal requires Tauri backend.', 'cdr-terminal-error');
        return;
      }
      terminalLog(`${terminalPrompt()} ${cmd}`, 'cdr-terminal-prompt');
      try {
        const result = await HC.invoke('shell_run', {
          command: 'sh',
          args: ['-c', cmd],
          cwd: sharedState.projectRoot || undefined,
        });
        if (result?.stdout) result.stdout.split('\n').forEach(l => { if (l) terminalLog(l); });
        if (result?.stderr) result.stderr.split('\n').forEach(l => { if (l) terminalLog(l, 'cdr-terminal-error'); });
      } catch (err) {
        terminalLog(String(err?.message || err), 'cdr-terminal-error');
      }
    }

    function appendFileToComposer(path, { newSession = false, isDir = false } = {}) {
      if (newSession) onTabNew();
      const ti = $('cdrTaskInput');
      if (!ti) return;
      const rel = relativeFromRoot(path);
      const block = isDir
        ? `\n\n[Folder context: \`${rel}\`]\nFull path: ${path}\nPlease explore this folder and summarize its structure.\n`
        : `\n\n[File context: \`${rel}\`]\nFull path: ${path}\nPlease read this file and use it in your response.\n`;
      ti.value = (ti.value.trim() ? ti.value.trim() + '\n' : '') + block;
      autoResize(ti);
      ti.focus();
      setActiveFile(path);
      document.querySelectorAll('.cdr-tree-entry').forEach(el => {
        el.classList.toggle('active', el.dataset.path === path);
      });
      HC?.guard?.notify?.(`Added ${rel} to Coder chat`, 'info');
    }

    async function copyFileContents(path) {
      if (!HC?.code?.readFile) return;
      try {
        const content = await HC.code.readFile(path);
        copyClipboard(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
        HC?.guard?.notify?.('File contents copied', 'info');
      } catch (e) {
        HC?.guard?.notify?.(String(e?.message || e), 'err');
      }
    }

    async function renameExplorerPath(path, isDir) {
      const base = path.split('/').filter(Boolean).pop() || path;
      const next = window.prompt(isDir ? 'Rename folder to:' : 'Rename file to:', base);
      if (!next || next === base) return;
      if (next.includes('/') || next.includes('\\')) {
        HC?.guard?.notify?.('Name cannot contain path separators', 'err');
        return;
      }
      const parent = path.replace(/\/[^/]+$/, '') || '/';
      const dest = `${parent}/${next}`;
      const ok = await HC.guard.request('write', path, `Rename to ${next}`);
      if (!ok) return;
      try {
        await HC.invoke('shell_run', { command: 'mv', args: [path, dest], cwd: null });
        HC?.guard?.notify?.('Renamed', 'info');
        if (sharedState.projectRoot) await renderExplorerTree(sharedState.projectRoot);
        if (sharedState.activeFile === path) setActiveFile(dest);
      } catch (e) {
        HC?.guard?.notify?.(String(e?.message || e), 'err');
      }
    }

    async function deleteExplorerPath(path, isDir) {
      const label = isDir ? 'folder' : 'file';
      if (!window.confirm(`Delete this ${label}?\n\n${path}\n\nThis cannot be undone.`)) return;
      const ok = await HC.guard.request('delete', path, `Delete ${label}`);
      if (!ok) return;
      try {
        if (isDir) {
          await HC.invoke('shell_run', { command: 'rm', args: ['-rf', path], cwd: null });
        } else {
          await HC.code.deleteFile(path, `Delete ${label}`);
        }
        HC?.guard?.notify?.('Deleted', 'info');
        if (sharedState.activeFile === path) sharedState.activeFile = null;
        if (sharedState.projectRoot) await renderExplorerTree(sharedState.projectRoot);
      } catch (e) {
        HC?.guard?.notify?.(String(e?.message || e), 'err');
      }
    }

    function toggleDirEntry(entryEl) {
      entryEl?.click();
    }

    function showExplorerContextMenu(event, entryEl) {
      const path = entryEl?.dataset?.path;
      if (!path) return;
      event.preventDefault();
      event.stopPropagation();
      const isDir = entryEl.dataset.isDir === '1' || entryEl.classList.contains('dir');
      _explorerCtxTarget = { path, isDir, el: entryEl };
      const menu = explorerCtxMenuEl();
      menu.innerHTML = '';

      if (isDir) {
        menu.appendChild(ctxMenuItem('Expand / Collapse', { onClick: () => toggleDirEntry(entryEl) }));
      } else {
        menu.appendChild(ctxMenuItem('Open', { onClick: () => {
          document.querySelectorAll('.cdr-tree-entry').forEach(el => el.classList.remove('active'));
          entryEl.classList.add('active');
          setActiveFile(path);
          void openPathExternal(path);
        } }));
      }

      menu.appendChild(ctxMenuSep());
      menu.appendChild(ctxMenuItem('Reveal in Finder', {
        shortcut: '⌥⌘R',
        disabled: !HC?.isTauri,
        onClick: () => revealInFinder(path),
      }));
      menu.appendChild(ctxMenuItem('Open in Integrated Terminal', {
        disabled: !HC?.isTauri,
        onClick: () => openInIntegratedTerminal(path, isDir),
      }));

      menu.appendChild(ctxMenuSep());
      menu.appendChild(ctxMenuItem('Add to Coder Chat', {
        onClick: () => appendFileToComposer(path, { newSession: false, isDir }),
      }));
      menu.appendChild(ctxMenuItem('Add to New Coder Session', {
        onClick: () => appendFileToComposer(path, { newSession: true, isDir }),
      }));

      menu.appendChild(ctxMenuSep());
      menu.appendChild(ctxMenuItem('Copy Path', {
        shortcut: '⌥⌘C',
        onClick: () => { copyClipboard(path); HC?.guard?.notify?.('Path copied', 'info'); },
      }));
      menu.appendChild(ctxMenuItem('Copy Relative Path', {
        shortcut: '⌥⇧⌘C',
        onClick: () => {
          copyClipboard(relativeFromRoot(path));
          HC?.guard?.notify?.('Relative path copied', 'info');
        },
      }));
      if (!isDir) {
        menu.appendChild(ctxMenuItem('Copy File Contents', {
          shortcut: '⌘C',
          disabled: !HC?.isTauri,
          onClick: () => copyFileContents(path),
        }));
      }

      menu.appendChild(ctxMenuSep());
      menu.appendChild(ctxMenuItem('Rename…', {
        disabled: !HC?.isTauri,
        onClick: () => renameExplorerPath(path, isDir),
      }));
      menu.appendChild(ctxMenuItem('Delete', {
        shortcut: '⌘⌫',
        danger: true,
        disabled: !HC?.isTauri,
        onClick: () => deleteExplorerPath(path, isDir),
      }));

      menu.hidden = false;
      menu.classList.add('open');
      const pad = 8;
      const mw = menu.offsetWidth || 248;
      const mh = menu.offsetHeight || 200;
      let x = event.clientX;
      let y = event.clientY;
      if (x + mw > window.innerWidth - pad) x = window.innerWidth - mw - pad;
      if (y + mh > window.innerHeight - pad) y = window.innerHeight - mh - pad;
      menu.style.left = `${Math.max(pad, x)}px`;
      menu.style.top = `${Math.max(pad, y)}px`;
    }

    function initExplorerContextMenu() {
      const body = $('cdrExplorerBody');
      if (!body || body.dataset.ctxWired === '1') return;
      body.dataset.ctxWired = '1';
      body.addEventListener('contextmenu', e => {
        const entry = e.target.closest('.cdr-tree-entry[data-path]');
        if (!entry) return;
        showExplorerContextMenu(e, entry);
      });
    }

    // ── Explorer ──────────────────────────────────────────────
    function toggleExplorer() {
      const sidebar = $('cdrSidebar');
      const body = $('cdrBody');
      if (!sidebar) return;
      const opening = !sidebar.classList.contains('open');
      sidebar.classList.toggle('open', opening);
      if (body) body.classList.toggle('has-sidebar', opening);
      if (opening && sharedState.projectRoot) {
        renderExplorerTree(sharedState.projectRoot);
      }
    }

    // Open native file/folder pickers. Order of preference:
    //   1. Tauri 2 plugin-dialog (requires dialog:default in capabilities + new build)
    //   2. macOS AppleScript fallback via shell_run (works in EVERY build)
    //   3. Web showDirectoryPicker / showOpenFilePicker (browser dev mode)
    //
    // CRITICAL: distinguish between "plugin errored" (fall back) and
    // "user pressed Cancel" (return null IMMEDIATELY, do NOT reopen picker).
    async function pickFolder() {
      if (window.HC?.isTauri && window.HC?.invoke) {
        // 1) Tauri plugin-dialog
        let pluginAvailable = true;
        try {
          const folder = await window.HC.invoke('plugin:dialog|open', {
            options: { directory: true, multiple: false, title: 'Open Project Folder' }
          });
          // Success path — user either picked or cancelled. Both end here.
          return (typeof folder === 'string' && folder) ? folder : null;
        } catch (e) {
          // Genuine plugin failure (e.g. capability missing). Fall through.
          pluginAvailable = false;
          console.warn('[CoderMode] dialog plugin unavailable, using AppleScript fallback:', e?.message || e);
        }
        // 2) AppleScript fallback
        if (!pluginAvailable) {
          try {
            const out = await window.HC.invoke('shell_run', {
              command: 'osascript',
              args: ['-e', 'POSIX path of (choose folder with prompt "Open Project Folder")']
            });
            // osascript exits non-zero on user cancel → check `code` and stdout
            if (out?.code === 0) {
              const stdout = (out?.stdout || '').trim();
              return stdout ? stdout.replace(/\/$/, '') : null;
            }
            // Non-zero exit = user cancelled or osascript failed → return null
            return null;
          } catch (e) { console.warn('[CoderMode] osascript folder:', e); return null; }
        }
        return null;
      }
      // 3) Web fallback
      if (window.showDirectoryPicker) {
        try { const dirHandle = await window.showDirectoryPicker(); return dirHandle.name; }
        catch { return null; }
      }
      return null;
    }

    async function pickFile() {
      if (window.HC?.isTauri && window.HC?.invoke) {
        let pluginAvailable = true;
        try {
          const file = await window.HC.invoke('plugin:dialog|open', {
            options: { multiple: false, title: 'Open File' }
          });
          return (typeof file === 'string' && file) ? file : null;
        } catch (e) {
          pluginAvailable = false;
          console.warn('[CoderMode] dialog plugin unavailable, using AppleScript fallback:', e?.message || e);
        }
        if (!pluginAvailable) {
          try {
            const out = await window.HC.invoke('shell_run', {
              command: 'osascript',
              args: ['-e', 'POSIX path of (choose file with prompt "Open File")']
            });
            if (out?.code === 0) {
              const stdout = (out?.stdout || '').trim();
              return stdout || null;
            }
            return null;
          } catch (e) { console.warn('[CoderMode] osascript file:', e); return null; }
        }
        return null;
      }
      if (window.showOpenFilePicker) {
        try { const [fh] = await window.showOpenFilePicker(); return fh.name; }
        catch { return null; }
      }
      return null;
    }

    async function openProject() {
      const folder = await pickFolder();
      if (!folder || typeof folder !== 'string') return;
      sharedState.projectRoot = folder;
      HC?.guard?.setProjectRoot?.(folder);
      if (HC?.code) HC.code.getProjectRoot = () => sharedState.projectRoot;
      void refreshGraphifyForProject({ force: false });
      // Keep system prompt current so the model always sees the real project root.
      if (_conversationMsgs.length && _conversationMsgs[0]?.role === 'system') {
        _conversationMsgs[0].content = sysPrompt();
      } else if (!_conversationMsgs.length) {
        _graphifyContext = '';
        void (async () => {
          await loadGraphifyContextForTask('project structure overview');
          if (!_conversationMsgs.length) {
            _conversationMsgs.push({ role: 'system', content: sysPrompt() });
          }
        })();
      }
      syncProjectLabel();
      syncTerminalPrompt();
      setExplorerRootLabel(folder);
      await renderExplorerTree(folder);
      refreshGitStatus();
      _ideCtx?.updateTrustChip?.();
      scanProjectSymbols(folder);
      void ingestProjectRag(folder);
      void runProjectLintChecks(folder);
      try {
        const top = await HC.code.listDir(folder);
        const hint = (top || []).map((e) => ({ path: e.name, name: e.name }));
        const langs = await window.CdrLspClient?.startForProject?.(folder, hint);
        if (langs?.length) {
          HC?.guard?.notify?.(`LSP: ${langs.join(', ')}`, 'ok');
        }
      } catch (e) {
        console.warn('[CoderMode] LSP start:', e);
      }
      const sidebar = $('cdrSidebar');
      const body = $('cdrBody');
      if (sidebar) sidebar.classList.add('open');
      if (body) body.classList.add('has-sidebar');
      saveCoderState();
    }

    async function openFile() {
      const file = await pickFile();
      if (!file || typeof file !== 'string') return;
      setActiveFile(file);
      const ti = $('cdrTaskInput');
      if (ti && !ti.value.trim()) ti.value = `Read and summarize: ${file}`;
    }

    // ── AI session files — auto-add any file the AI creates/modifies to the left panel
    const _aiSessionFiles = new Set();
    function clearFilesPanel() {
      _aiSessionFiles.clear();
      sharedState.projectRoot = null;
      sharedState.activeFile = null;
      sharedState.projectSymbols = {};
      window.CdrLspClient?.stopAll?.();
      HC?.guard?.clearProjectRoot?.();
      syncProjectLabel();
      syncTerminalPrompt();
      setExplorerRootLabel(null);
      const body = $('cdrExplorerBody');
      if (body) body.innerHTML = '<div class="cdr-tree-empty">Open a project or file to start.</div>';
      saveCoderState();
      setStatus('Files cleared', 'ok');
    }

    function addAIFileToExplorer(filePath, kind) {
      if (!filePath || typeof filePath !== 'string') return;
      if (_aiSessionFiles.has(filePath)) return;
      _aiSessionFiles.add(filePath);
      const body = $('cdrExplorerBody');
      if (!body) return;
      // Find or create the "Session files" section at the top of the tree
      let section = document.getElementById('cdrAISessionSection');
      if (!section) {
        section = document.createElement('div');
        section.id = 'cdrAISessionSection';
        section.className = 'cdr-ai-session-section';
        section.innerHTML = `
          <div class="cdr-ai-session-hd">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>
            <span>SESSION FILES</span>
          </div>
          <div class="cdr-ai-session-list" id="cdrAISessionList"></div>`;
        body.prepend(section);
      }
      const list = document.getElementById('cdrAISessionList');
      if (!list) return;
      // Clear empty-state placeholder if present
      const empty = body.querySelector('.cdr-tree-empty');
      if (empty) empty.remove();
      const row = document.createElement('div');
      row.className = 'cdr-tree-entry cdr-ai-file' + (kind === 'delete' ? ' deleted' : '');
      const name = baseName(filePath);
      const displayPath = relativeFromRoot(filePath);
      const icon = kind === 'delete'
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
      row.innerHTML = `${icon}<span class="cdr-tree-text"><span class="cdr-tree-name">${esc(name)}</span><span class="cdr-tree-path">${esc(displayPath)}</span></span>`;
      row.title = filePath;
      row.dataset.path = filePath;
      row.dataset.isDir = '0';
      row.addEventListener('click', () => {
        setActiveFile(filePath);
        const ti = $('cdrTaskInput');
        if (ti && !ti.value.trim()) ti.value = `Review changes in: ${filePath}`;
      });
      list.appendChild(row);
    }

    async function renderExplorerTree(dir, parentEl, depth) {
      if (!window.HC?.isTauri) return;
      const container = parentEl || $('cdrExplorerBody');
      if (!container) return;
      if (!parentEl) container.innerHTML = '<div class="cdr-tree-empty">Loading…</div>';
      try {
        // Use HC.code.listDir so the guard can log the access in the audit trail.
        // The permission dialog is suppressed because the user explicitly opened this
        // project folder, so the guard treats it as session-trusted.
        const entries = await HC.code.listDir(dir);
        if (!parentEl) container.innerHTML = '';
        if (!entries?.length) {
          if (!parentEl) container.innerHTML = '<div class="cdr-tree-empty">Empty directory</div>';
          return;
        }
        const sorted = [...entries].sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        for (const entry of sorted) {
          if (entry.name.startsWith('.') && !entry.name.match(/^\.env/)) continue;
          const item = document.createElement('div');
          item.className = 'cdr-tree-entry' + (entry.is_dir ? ' dir' : '');
          item.style.paddingLeft = `${7 + (depth || 0) * 12}px`;
          const fullPath = entry.path || `${dir.endsWith('/') ? dir : dir + '/'}${entry.name}`;
          const en = esc(entry.name);
          item.dataset.path = fullPath;
          item.dataset.isDir = entry.is_dir ? '1' : '0';
          item.innerHTML = entry.is_dir
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span class="cdr-tree-name">${en}</span>`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg><span class="cdr-tree-name">${en}</span>`;
          item.title = fullPath;
          window.CdrComposerAttachments?.wireExplorerEntry?.(item, fullPath, entry.is_dir);
          item.addEventListener('click', async e => {
            e.stopPropagation();
            if (entry.is_dir) {
              const existing = item.nextElementSibling;
              if (existing?.classList.contains('cdr-tree-subtree')) {
                existing.remove(); item.classList.remove('open');
              } else {
                item.classList.add('open');
                const sub = document.createElement('div');
                sub.className = 'cdr-tree-subtree';
                item.after(sub);
                await renderExplorerTree(fullPath, sub, (depth || 0) + 1);
              }
            } else {
              document.querySelectorAll('.cdr-tree-entry').forEach(el => el.classList.remove('active'));
              item.classList.add('active');
              setActiveFile(fullPath);
              _editorPane?.openFile(fullPath).catch(() => {});
              const ti = $('cdrTaskInput');
              if (ti && !ti.value.trim()) ti.value = `Read and summarize: ${fullPath}`;
            }
          });
          container.appendChild(item);
        }
      } catch (e) {
        if (!parentEl) container.innerHTML = `<div class="cdr-tree-empty">Error: ${esc(String(e?.message || e))}</div>`;
      }
    }

    // ── Project symbol index ──────────────────────────────────
    const SYMBOL_PATTERNS = {
      js:  /(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)|(?:export\s+(?:default\s+)?)?class\s+(\w+)/g,
      ts:  /(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)|(?:export\s+(?:default\s+)?)?class\s+(\w+)/g,
      py:  /^(?:async\s+)?def\s+(\w+)|^class\s+(\w+)/gm,
      rs:  /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)|(?:pub\s+)?struct\s+(\w+)|(?:pub\s+)?enum\s+(\w+)|(?:pub\s+)?trait\s+(\w+)|impl(?:\s+<[^>]+>)?\s+(?:\w+\s+for\s+)?(\w+)/g,
      go:  /^func\s+(?:\([^)]+\)\s+)?(\w+)|^type\s+(\w+)/gm,
      java:/(?:public|private|protected)\s+(?:static\s+)?(?:<[^>]+>\s+)?\w+(?:<[^>]+>)?(?:\[\])?\s+(\w+)\s*\(|^\s*(?:public\s+)?class\s+(\w+)/gm,
      c:   /^\s*(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{/gm,
      cpp: /^\s*(?:\w+(?:\s*::\s*\w+)?\s+)+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{|^\s*class\s+(\w+)/gm,
      rb:  /^(?:def\s+(?:self\.)?(\w+)|class\s+(\w+)|module\s+(\w+))/gm,
    };
    const SYMBOL_EXT_MAP = {
      js:'js', ts:'ts', tsx:'ts', jsx:'js',
      py:'py', rs:'rs', go:'go',
      java:'java', c:'c', cpp:'cpp', h:'c', hpp:'cpp',
      rb:'rb', rake:'rb',
    };

    async function scanProjectSymbols(root) {
      if (!window.HC?.isTauri || !root) return;
      const symbols = {}; // path → [{name, kind}]
      try {
        const entries = await HC.code.listDir(root);
        if (!entries) return;
        const files = entries.filter(e => !e.is_dir && !e.name.startsWith('.') && !e.name.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|ttf|eot|mp3|mp4|pdf|zip|tar|gz|bin|exe|dll|so|dylib)$/i));
        for (const f of files) {
          const ext = f.name.split('.').pop()?.toLowerCase() || '';
          const lang = SYMBOL_EXT_MAP[ext];
          if (!lang) continue;
          try {
            const content = await HC.code.readFile(f.path);
            const text = typeof content === 'string' ? content : JSON.stringify(content);
            const pat = SYMBOL_PATTERNS[lang];
            if (!pat) continue;
            pat.lastIndex = 0;
            const matches = [];
            let m;
            while ((m = pat.exec(text)) !== null) {
              const name = m[1] || m[2] || m[3] || m[4] || m[5];
              if (name && name.length < 80 && !name.match(/^(if|else|for|while|switch|catch|return|throw|try|new|this|self|super)$/)) {
                const line = text.slice(0, m.index).split('\n').length;
                const kind = m[0].includes('class') ? 'class' : m[0].includes('struct') ? 'struct' : m[0].includes('enum') ? 'enum' : m[0].includes('interface') ? 'interface' : m[0].includes('trait') ? 'trait' : m[0].includes('type') ? 'type' : 'fn';
                matches.push({ name, kind, line });
              }
            }
            if (matches.length) symbols[f.path] = matches.slice(0, 30);
          } catch {}
        }
      } catch (e) { console.warn('[CoderMode] scan symbols:', e); }
      sharedState.projectSymbols = symbols;
      renderSymbolTree();
    }

    async function ingestProjectRag(folder) {
      try {
        const r = await window.CdrProjectRag?.ingestProject?.(folder);
        if (r?.ingested > 0) {
          HC?.guard?.notify?.(`Indexed ${r.ingested} project files for RAG (@codebase)`, 'info');
        } else if (r?.skipped === 'rag_disabled') {
          HC?.guard?.notify?.('Enable RAG in Agents tab to index this project', 'info');
        }
      } catch (e) {
        console.warn('[CoderMode] RAG ingest:', e);
      }
    }

    async function runProjectLintChecks(folder) {
      if (!_ideCtx?.reportProblems) return;
      try {
        await window.CdrProjectLint?.runProjectChecks?.(folder, (items) => {
          if (items?.length) _ideCtx.reportProblems(items);
        });
      } catch (e) {
        console.warn('[CoderMode] project lint:', e);
      }
    }

    async function goToDefinition(symbol, fromPath) {
      if (fromPath && window.CdrLspClient?.sessionForPath?.(fromPath)) {
        const line = _editorPane?.editor?.getPosition?.()?.lineNumber || 1;
        const col = _editorPane?.editor?.getPosition?.()?.column || 1;
        const lspLoc = await window.CdrLspClient.definition(fromPath, line, col);
        if (lspLoc?.path) {
          setActiveFile(lspLoc.path);
          _editorPane?.openFile(lspLoc.path, lspLoc.line, lspLoc.column).catch(() => {});
          return;
        }
      }
      if (!window.CdrGoto?.findDefinition) return;
      const loc = await window.CdrGoto.findDefinition({
        symbol,
        path: fromPath,
        projectRoot: sharedState.projectRoot,
        projectSymbols: sharedState.projectSymbols,
        readFile: (p) => HC.code.readFile(p),
        grepCode: (dir, pat, ext) => HC.code.grepCode(dir, pat, ext),
      });
      if (!loc?.path) {
        HC?.guard?.notify?.(`No definition found for "${symbol}"`, 'info');
        return;
      }
      setActiveFile(loc.path);
      _editorPane?.openFile(loc.path, loc.line, loc.col).catch(() => {});
    }

    function symbolMatchesFilter(s, fileName, q) {
      if (_symbolKindFilter && s.kind !== _symbolKindFilter) return false;
      if (!q) return true;
      const hay = `${s.name} ${s.kind} ${fileName}`.toLowerCase();
      return hay.includes(q);
    }

    function renderSymbolTree() {
      const container = $('cdrExplorerBody');
      if (!container) return;
      const syms = sharedState.projectSymbols || {};
      let section = container.querySelector('.cdr-symbols-section');
      if (!Object.keys(syms).length) {
        section?.remove();
        return;
      }
      const q = _symbolFilter.trim().toLowerCase();
      if (!section) {
        section = document.createElement('div');
        section.className = 'cdr-symbols-section';
        section.innerHTML = `
          <div class="cdr-symbol-filter-bar">
            <div class="cdr-sidebar-title">Symbols</div>
            <input type="search" class="cdr-symbol-filter-input" id="cdrSymbolFilter" placeholder="Filter symbols…" spellcheck="false" autocomplete="off"/>
            <div class="cdr-symbol-kinds" id="cdrSymbolKinds">
              <button type="button" class="cdr-symbol-kind active" data-kind="">all</button>
              <button type="button" class="cdr-symbol-kind" data-kind="fn">fn</button>
              <button type="button" class="cdr-symbol-kind" data-kind="class">class</button>
              <button type="button" class="cdr-symbol-kind" data-kind="type">type</button>
              <button type="button" class="cdr-symbol-kind" data-kind="interface">iface</button>
            </div>
          </div>
          <div class="cdr-symbol-list" id="cdrSymbolList"></div>`;
        container.appendChild(section);
        const filterInput = section.querySelector('#cdrSymbolFilter');
        filterInput?.addEventListener('input', () => {
          _symbolFilter = filterInput.value;
          renderSymbolTree();
        });
        section.querySelector('#cdrSymbolKinds')?.addEventListener('click', (e) => {
          const btn = e.target.closest('.cdr-symbol-kind');
          if (!btn) return;
          _symbolKindFilter = btn.dataset.kind || '';
          section.querySelectorAll('.cdr-symbol-kind').forEach(b =>
            b.classList.toggle('active', b === btn)
          );
          renderSymbolTree();
        });
      }
      const filterInput = section.querySelector('#cdrSymbolFilter');
      if (filterInput && filterInput.value !== _symbolFilter) filterInput.value = _symbolFilter;
      const listRoot = section.querySelector('#cdrSymbolList');
      if (!listRoot) return;
      listRoot.innerHTML = '';
      let total = 0;
      for (const [path, items] of Object.entries(syms)) {
        const fileName = path.split('/').pop();
        const filtered = items.filter(s => symbolMatchesFilter(s, fileName, q));
        if (!filtered.length) continue;
        total += filtered.length;
        const fileDiv = document.createElement('div');
        fileDiv.className = 'cdr-symbol-file';
        fileDiv.innerHTML = `<div class="cdr-symbol-file-name">${esc(fileName)}</div>`;
        const list = document.createElement('div');
        list.className = 'cdr-symbol-entries';
        for (const s of filtered) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'cdr-tree-entry cdr-symbol-entry';
          const kindColor = { class:'var(--cdr-gold)', struct:'var(--cdr-gold)', enum:'var(--cdr-gold)', interface:'var(--cdr-gold)', trait:'var(--cdr-violet)', type:'var(--cdr-violet)', fn:'var(--cdr-cyan)' }[s.kind] || 'var(--cdr-text-dim)';
          el.innerHTML = `<span class="cdr-symbol-kind-tag" style="color:${kindColor}">${esc(s.kind)}</span><span class="cdr-symbol-name">${esc(s.name)}</span><span class="cdr-symbol-line">:${s.line}</span>`;
          el.title = `Go to ${s.kind} ${s.name} at line ${s.line}`;
          el.addEventListener('click', () => {
            setActiveFile(path);
            _editorPane?.openFile(path, s.line, 1).catch(() => {});
          });
          list.appendChild(el);
        }
        fileDiv.appendChild(list);
        listRoot.appendChild(fileDiv);
      }
      if (!total) {
        listRoot.innerHTML = '<div class="cdr-git-empty">No symbols match filter</div>';
      }
    }

    // ── Status helpers ────────────────────────────────────────
    function setStatus(text, type) {
      const dot  = $('cdrStatusDot');
      const txt  = $('cdrStatusText');
      if (dot) dot.className = 'cdr-status-dot' + (type ? ' ' + type : '');
      if (txt) txt.textContent = text || 'Ready';
    }

    // ── Chat rendering ────────────────────────────────────────
    const MAX_RENDER_MSGS = 80;
    const MAX_SESSION_MSG_CHARS = 16_000;
    let _scrollRaf = 0;

    function getChatVirtual() {
      if (!_chatVirtual && window.CdrChatVirtual) {
        const el = $('cdrMessages');
        if (el) _chatVirtual = new window.CdrChatVirtual(el);
      }
      return _chatVirtual;
    }

    function enterChatLiveMode() {
      getChatVirtual()?.enterLiveMode();
    }

    function scrollMessages(force = false) {
      if (_domScrollBatch > 0 && !force) return;
      const v = getChatVirtual();
      if (v && !v.isLiveMode()) {
        v.scrollToBottom(force);
        return;
      }
      const el = $('cdrMessages');
      if (!el) return;
      if (force) {
        if (_scrollRaf) cancelAnimationFrame(_scrollRaf);
        _scrollRaf = 0;
        el.scrollTop = el.scrollHeight;
        return;
      }
      if (_scrollRaf) return;
      _scrollRaf = requestAnimationFrame(() => {
        _scrollRaf = 0;
        el.scrollTop = el.scrollHeight;
      });
    }

    function renderMarkdown(text) {
      if (!text) return '';
      if (window.marked) {
        try {
          const html = window.marked.parse(text, { breaks: true, gfm: true });
          if (window.DOMPurify) return window.DOMPurify.sanitize(html);
          // DOMPurify not available — fall through to safe plain-text render
        } catch {}
      }
      return esc(text).replace(/\n/g, '<br>');
    }

    function scheduleMarkdownHtml(el, text) {
      if (!el || !text || !window.CdrMarkdown?.renderAsync) return;
      window.CdrMarkdown.renderAsync(text).then(html => {
        if (html) el.innerHTML = html;
      }).catch(() => {});
    }

    function buildUserMsgElement(text, attachHtml) {
      const el = document.createElement('div');
      el.className = 'cdr-msg user';
      const svgCopy = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      const att = attachHtml || '';
      el.innerHTML = `
        ${att}
        <div class="cdr-user-bubble">${esc(text)}</div>
        <div class="cdr-msg-actions">
          <button class="cdr-action-btn cdr-act-copy">${svgCopy} copy</button>
        </div>`;
      el.querySelector('.cdr-act-copy').addEventListener('click', function () {
        navigator.clipboard.writeText(text).then(() => {
          this.classList.add('flash');
          setTimeout(() => this.classList.remove('flash'), 1200);
        }).catch(() => {});
      });
      return el;
    }

    function buildAssistantMsgElement(roleLabel, text) {
      const el = document.createElement('div');
      el.className = 'cdr-msg assistant';
      const svgCopy = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      el.innerHTML = `
        <div class="cdr-msg-role">${esc(roleLabel || 'MiraXCode Coder')}</div>
        <div class="cdr-msg-content"></div>
        <div class="cdr-msg-actions">
          <button class="cdr-action-btn cdr-act-copy">${svgCopy} copy</button>
        </div>`;
      const contentEl = el.querySelector('.cdr-msg-content');
      if (text) {
        const div = document.createElement('div');
        div.className = 'cdr-msg-text';
        const shown = text.length > 48_000 ? text.slice(0, 48_000) + '\n\n… (truncated for display)' : text;
        div.innerHTML = renderMarkdown(shown);
        scheduleMarkdownHtml(div, shown);
        contentEl.appendChild(div);
      }
      el.querySelector('.cdr-act-copy')?.addEventListener('click', function () {
        const txt = contentEl.innerText || contentEl.textContent || '';
        navigator.clipboard.writeText(txt).then(() => {
          this.classList.add('flash');
          setTimeout(() => this.classList.remove('flash'), 1200);
        }).catch(() => {});
      });
      return el;
    }

    function appendUserMsg(text, attachHtml) {
      const msgs = $('cdrMessages');
      if (!msgs) return;
      enterChatLiveMode();
      msgs.querySelector('.cdr-welcome')?.remove();
      const el = buildUserMsgElement(text, attachHtml);
      msgs.appendChild(el);
      scrollMessages();
    }

    function appendAssistantBubble(roleLabel) {
      const msgs = $('cdrMessages');
      if (!msgs) return null;
      enterChatLiveMode();
      msgs.querySelector('.cdr-welcome')?.remove();
      const el = document.createElement('div');
      el.className = 'cdr-msg assistant' + (roleLabel && roleLabel !== 'MiraXCode Coder' ? ' boss' : '');

      const svgCopy  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      const svgReply = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`;
      const svgRegen = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.18"/></svg>`;

      el.innerHTML = `
        <div class="cdr-msg-role">${esc(roleLabel || 'MiraXCode Coder')}</div>
        <div class="cdr-msg-content"></div>
        <div class="cdr-msg-actions">
          <button class="cdr-action-btn cdr-act-copy">${svgCopy} copy</button>
          <button class="cdr-action-btn cdr-act-reply">${svgReply} reply</button>
          <button class="cdr-action-btn cdr-act-regen">${svgRegen} regen</button>
        </div>`;

      const contentEl = el.querySelector('.cdr-msg-content');

      el.querySelector('.cdr-act-copy').addEventListener('click', function () {
        const txt = contentEl.innerText || contentEl.textContent || '';
        navigator.clipboard.writeText(txt).then(() => {
          this.classList.add('flash');
          setTimeout(() => this.classList.remove('flash'), 1200);
        }).catch(() => {});
      });

      el.querySelector('.cdr-act-reply').addEventListener('click', () => {
        const ti = $('cdrTaskInput');
        if (!ti) return;
        const raw = (contentEl.innerText || contentEl.textContent || '').trim().slice(0, 300);
        const quoted = raw.split('\n').map(l => '> ' + l).join('\n');
        ti.value = quoted + '\n\n';
        autoResize(ti);
        ti.focus();
        ti.setSelectionRange(ti.value.length, ti.value.length);
      });

      el.querySelector('.cdr-act-regen').addEventListener('click', async () => {
        if (runAbort) return;
        for (let i = _conversationMsgs.length - 1; i >= 0; i--) {
          if (_conversationMsgs[i].role === 'assistant') { _conversationMsgs.splice(i, 1); break; }
        }
        el.remove();
        const runBtn  = $('cdrRunBtn');
        const stopBtn = $('cdrStopBtn');
        if (runBtn)  runBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = '';
        const gen = ++_runGeneration;
        if (runAbort) abortActiveRun('Regen');
        runAbort = new AbortController();
        _runTabId = _tabMgr.active()?.id || null;
        _runFileChanges = _fileChanges;
        const tab = _tabMgr.active();
        if (tab) { tab.running = true; renderTabBar(); }
        try {
          await runSingleTurn(runAbort.signal);
        } catch (e) {
          if (e?.name !== 'AbortError') {
            setStatus(e?.message || 'Regen failed', 'err');
            console.error('[CoderMode] regen failed:', e);
          }
        } finally {
          if (gen !== _runGeneration) return;
          if (runBtn)  runBtn.style.display = '';
          if (stopBtn) stopBtn.style.display = 'none';
          runAbort = null;
          _runTabId = null;
          _runFileChanges = null;
          setRouterChip('Auto', '');
          const at = _tabMgr.active();
          if (at) { at.running = false; renderTabBar(); }
        }
      });

      msgs.appendChild(el);
      scrollMessages();
      return contentEl;
    }

    function appendThinking(contentEl) {
      if (!contentEl) return null;
      const el = document.createElement('div');
      el.className = 'cdr-thinking';
      el.innerHTML = '<span></span><span></span><span></span>';
      contentEl.appendChild(el);
      scrollMessages();
      return el;
    }

    function appendToolBlock(contentEl, name, args) {
      if (!contentEl) return null;
      const id = ++toolCallCounter;
      const icon = TOOL_ICONS[name] || TOOL_ICON_DEFAULT;
      const argStr = Object.entries(args || {})
        .filter(([, v]) => v && String(v).length < 60)
        .slice(0, 2).map(([k, v]) => `${k}=${String(v).slice(0, 38)}`).join(', ');

      const el = document.createElement('details');
      el.className = 'cdr-tool-call running';
      el.open = true;
      el.dataset.id = String(id);
      el.innerHTML = `
        <summary class="cdr-tool-summary">
          <span class="cdr-tool-icon">${icon}</span>
          <span class="cdr-tool-name">${esc(name)}</span>
          ${argStr ? `<span class="cdr-tool-args">${esc(argStr)}</span>` : ''}
          <span class="cdr-tool-status running">running…</span>
        </summary>
        <div class="cdr-tool-body">
          <div class="cdr-tool-result">Working…</div>
        </div>`;
      contentEl.appendChild(el);
      scrollMessages();
      return el;
    }

    function finalizeToolBlock(el, result, ok, ms) {
      if (!el) return;
      el.classList.remove('running');
      el.classList.add(ok ? 'ok' : 'err');
      el.open = false;
      const status = el.querySelector('.cdr-tool-status');
      if (status) {
        status.className = 'cdr-tool-status ' + (ok ? 'ok' : 'err');
        const svgOk  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        const svgErr = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        status.innerHTML = ok ? `${svgOk} ${ms}ms` : `${svgErr} error`;
      }
      const resultEl = el.querySelector('.cdr-tool-result');
      if (resultEl) {
        resultEl.textContent = (result || '').slice(0, 600) + ((result || '').length > 600 ? '\n…' : '');
      }
      scrollMessages();
    }

    function appendTextToBubble(contentEl, text) {
      if (!contentEl || !text) return;
      const el = document.createElement('div');
      el.className = 'cdr-msg-text';
      el.innerHTML = renderMarkdown(text);
      scheduleMarkdownHtml(el, text);
      contentEl.appendChild(el);
      scrollMessages();
    }

    // ── Sessions (past chats) ─────────────────────────────────
    function loadSessions() {
      try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch { return []; }
    }
    function saveSessions(sessions) {
      try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 50))); } catch {}
    }

    // Cap session names to 3 words max (chat-mode pattern: enforceTwoWordName clone)
    function enforceThreeWordName(raw) {
      const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
      return words.slice(0, 3).join(' ') || 'New Chat';
    }

    function saveCurrentSession(forTab) {
      const tab = forTab || _tabMgr.active();
      if (!tab) return;
      const msgs = forTab ? (tab.msgs || []) : _conversationMsgs;
      const userMsgs = msgs.filter(m => m.role === 'user');
      if (!userMsgs.length) return;
      const title = enforceThreeWordName(userMsgs[0].content);
      const now = new Date();
      const date = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
                   now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const session = {
        id: Date.now(),
        title,
        date,
        model: tab.model ?? coderModel ?? null,
        msgs: msgs.map(m => ({
          role: m.role,
          content: typeof m.content === 'string'
            ? m.content.slice(0, MAX_SESSION_MSG_CHARS)
            : m.content,
        })),
      };
      const sessions = loadSessions();
      sessions.unshift(session);
      saveSessions(sessions);
      renderSessions();
    }

    function deleteSession(idx) {
      const sessions = loadSessions();
      if (!sessions[idx]) return;
      sessions.splice(idx, 1);
      saveSessions(sessions);
      renderSessions($('cdrSessionsSearch')?.value || '');
    }

    function renameSession(idx) {
      const sessions = loadSessions();
      const s = sessions[idx];
      if (!s) return;
      const next = window.prompt('Rename chat (3 words max):', s.title || '');
      if (next == null) return;
      const trimmed = enforceThreeWordName(next);
      if (!trimmed || trimmed === s.title) return;
      s.title = trimmed;
      saveSessions(sessions);
      renderSessions($('cdrSessionsSearch')?.value || '');
    }

    function renderSessions(filter) {
      const list = $('cdrSessionsList');
      if (!list) return;
      const all = loadSessions();
      const q = (filter || '').trim().toLowerCase();
      const sessions = q ? all.filter(s => (s.title || '').toLowerCase().includes(q)) : all;
      if (!sessions.length) {
        list.innerHTML = `<div class="cdr-sessions-empty">${q ? 'No chats match your search.' : 'Past conversations will appear here.'}</div>`;
        return;
      }
      // SVGs (no emoji — terminal-themed icons)
      const editSvg   = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M11 2.2a1.5 1.5 0 0 1 2.1 2.1L5 12.6 2 13.4 2.8 10.4z"/></svg>`;
      const deleteSvg = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M3 5h10M6 5V3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V5M5 5l.7 8a.6.6 0 0 0 .6.5h3.4a.6.6 0 0 0 .6-.5L11 5"/></svg>`;
      list.innerHTML = sessions.map(s => {
        const realIdx = all.indexOf(s);
        const userCount = s.msgs.filter(m => m.role === 'user').length;
        const modelNote = s.model ? shortModelLabel(s.model) : '';
        return `
        <div class="cdr-session-item" data-idx="${realIdx}">
          <div class="cdr-session-row">
            <div class="cdr-session-title">${esc(s.title)}</div>
            <div class="cdr-session-actions">
              <button class="cdr-session-act" data-act="rename" title="Rename chat">${editSvg}</button>
              <button class="cdr-session-act cdr-session-del" data-act="delete" title="Delete chat">${deleteSvg}</button>
            </div>
          </div>
          <div class="cdr-session-meta">${esc(s.date)} &middot; ${userCount} msg${userCount !== 1 ? 's' : ''}${modelNote ? ` &middot; ${esc(modelNote)}` : ''}</div>
        </div>`;
      }).join('');
      list.querySelectorAll('.cdr-session-item').forEach(item => {
        const idx = parseInt(item.dataset.idx, 10);
        item.addEventListener('click', (e) => {
          // Ignore clicks that originated on the action buttons
          if (e.target.closest('.cdr-session-actions')) return;
          const sessions = loadSessions();
          if (!sessions[idx]) return;
          restoreSession(sessions[idx]);
        });
        const rn = item.querySelector('[data-act="rename"]');
        const dl = item.querySelector('[data-act="delete"]');
        if (rn) rn.addEventListener('click', (e) => { e.stopPropagation(); renameSession(idx); });
        if (dl) dl.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('Delete this saved chat?')) deleteSession(idx); });
      });
    }

    function restoreSession(session) {
      if (!session?.msgs?.length) return;
      _conversationMsgs.length = 0;
      session.msgs.forEach(m => _conversationMsgs.push(m));
      _fileChanges.length = 0;
      coderModel = session.model ?? null;
      const tab = _tabMgr.active();
      if (tab) {
        tab.title = session.title || tab.title;
        tab.model = coderModel;
        _tabMgr.save();
      }
      populateModelPicker();
      applyCoderModelToUi(!!coderModel);
      renderTabBar();
      renderConversation();
      setStatus('Ready', '');
    }

    function renderConversation() {
      const msgs = $('cdrMessages');
      if (!msgs) return;
      const hidden = Math.max(0, _conversationMsgs.length - MAX_RENDER_MSGS);
      const slice = hidden > 0 ? _conversationMsgs.slice(-MAX_RENDER_MSGS) : _conversationMsgs;
      const display = slice.filter(m =>
        m.role === 'user' || (m.role === 'assistant' && m.content)
      );
      const v = getChatVirtual();
      if (v && display.length > 12) {
        v.setMessages(display, (m) => {
          if (m.role === 'user') return buildUserMsgElement(m.content);
          return buildAssistantMsgElement('MiraXCode Coder', m.content);
        }, { hiddenCount: hidden });
        scrollMessages(true);
        return;
      }
      enterChatLiveMode();
      msgs.innerHTML = '';
      if (hidden > 0) {
        const note = document.createElement('div');
        note.className = 'cdr-msg-truncated-note';
        note.textContent = `${hidden} earlier message${hidden === 1 ? '' : 's'} hidden for performance — export chat for full history`;
        msgs.appendChild(note);
      }
      for (const m of display) {
        if (m.role === 'user') msgs.appendChild(buildUserMsgElement(m.content));
        else if (m.role === 'assistant') msgs.appendChild(buildAssistantMsgElement('MiraXCode Coder', m.content));
      }
      scrollMessages(true);
    }

    // ── Change overlay ────────────────────────────────────────
    function showChangeOverlay(idx) {
      const entry = _fileChanges[idx];
      if (!entry) return;
      const overlay = $('cdrChangeOverlay');
      const title   = $('cdrChangeOverlayTitle');
      const pre     = $('cdrChangeOverlayPre');
      if (!overlay || !title || !pre) return;
      const kindLabels = { write: 'MODIFIED', create: 'CREATED', delete: 'DELETED' };
      title.textContent = `${kindLabels[entry.kind] || 'CHANGED'} · ${entry.path || entry.name}`;
      pre.textContent   = entry.content || '(empty)';
      overlay.classList.add('open');
    }

    function closeChangeOverlay() {
      $('cdrChangeOverlay')?.classList.remove('open');
    }

    // ── Terminal ──────────────────────────────────────────────
    function terminalPrompt() {
      const root = sharedState.projectRoot;
      return root ? `${baseName(root)} %` : '%';
    }

    function syncTerminalPrompt() {
      const promptEl = $('cdrTerminalPrompt');
      if (promptEl) promptEl.textContent = terminalPrompt();
    }

    // Simple ANSI-to-HTML: covers basic 8 colors + bold/dim/reset
    function ansiToHtml(text) {
      if (!text || !text.includes('\x1b[')) return esc(text);
      const colors = {
        '30': '#6b6b78', '31': '#d98a85', '32': '#5fb88a', '33': '#f5c97a',
        '34': '#6ab4ff', '35': '#c084fc', '36': '#4bd2be', '37': '#e8e8ec',
        '90': '#4a4a55', '91': '#ff8f8f', '92': '#7dd3a8', '93': '#fde68a',
        '94': '#93c5fd', '95': '#d8b4fe', '96': '#99f6e4', '97': '#ffffff',
      };
      let out = '';
      const re = /\x1b\[([0-9;]*)m/g;
      let last = 0;
      let m;
      const stack = [];
      while ((m = re.exec(text)) !== null) {
        out += esc(text.slice(last, m.index));
        const codes = m[1].split(';').filter(Boolean);
        for (const c of codes) {
          if (c === '0') { while (stack.length) out += '</span>'; stack.length = 0; }
          else if (c === '1') { out += '<span style="font-weight:600">'; stack.push('span'); }
          else if (c === '2') { out += '<span style="opacity:0.6">'; stack.push('span'); }
          else if (colors[c]) { out += `<span style="color:${colors[c]}">`; stack.push('span'); }
        }
        last = re.lastIndex;
      }
      out += esc(text.slice(last));
      while (stack.length) out += '</span>';
      return out;
    }

    // ── Execution trace ───────────────────────────────────────
    function cdrTraceReset(reason) {
      cdrTraceStartedAt = Date.now();
      cdrTraceEntries = [];
      cdrTraceAdd('Trace', reason || 'New run', 'wait');
    }

    function cdrTraceAdd(stage, message, status) {
      cdrTraceEntries.push({
        elapsed: Number(((Date.now() - cdrTraceStartedAt) / 1000).toFixed(1)),
        stage: String(stage || ''),
        message: String(message || ''),
        status: status || 'wait',
      });
      if (cdrTraceEntries.length > 300) cdrTraceEntries = cdrTraceEntries.slice(-300);
      renderCdrTrace();
    }

    function renderCdrTrace() {
      const list = $('cdrTraceEntries');
      if (!list) return;
      function icon(s) { return s === 'ok' ? '✓' : s === 'err' ? '!' : s === 'warn' ? '!' : s === 'run' ? '›' : '·'; }
      if (!cdrTraceEntries.length) {
        list.innerHTML = '<div class="cdr-trace-empty">No trace entries yet.</div>';
        return;
      }
      list.innerHTML = cdrTraceEntries.map(e => `<div class="cdr-trace-entry">
  <span class="cdr-trace-time">[${e.elapsed.toFixed(1)}s]</span>
  <span class="cdr-trace-stage ${e.status}">${esc(e.stage)}</span>
  <span class="cdr-trace-icon ${e.status}">${icon(e.status)}</span>
  <span class="cdr-trace-msg ${e.status}">${esc(e.message)}</span>
</div>`).join('');
      list.scrollTop = list.scrollHeight;
    }

    function terminalLog(text, className = '') {
      if (_ideCtx?.terminalLog) {
        _ideCtx.terminalLog(text, className);
        return;
      }
      const body = $('cdrTerminalBody');
      if (!body) return;
      const line = document.createElement('div');
      line.className = 'cdr-terminal-line' + (className ? ' ' + className : '');
      line.innerHTML = ansiToHtml(text);
      body.appendChild(line);
      body.scrollTop = body.scrollHeight;
    }
    function clearTerminal() {
      const body = $('cdrTerminalBody');
      if (body) body.innerHTML = '';
    }
    async function onTerminalKey(e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (_terminalBusy) return;
      const input = $('cdrTerminalInput');
      if (!input) return;
      const cmd = input.value.trim();
      if (!cmd) return;
      input.value = '';
      terminalLog(`${terminalPrompt()} ${cmd}`, 'cdr-terminal-prompt');
      _pushTermHistory(cmd);
      if (!window.HC?.isTauri) {
        terminalLog('Terminal requires Tauri backend.', 'cdr-terminal-error');
        return;
      }
      _terminalBusy = true;
      try {
      // Try streaming first (v1.7), fall back to blocking shell_run
      const ChannelCtor = typeof Channel !== 'undefined' ? Channel : window.__TAURI__?.core?.Channel;
      const useStream = !!ChannelCtor;
      if (useStream) {
        try {
          const channel = new ChannelCtor();
          let exitCode = null;
          let done = false;
          channel.onmessage = (chunk) => {
            if (chunk.kind === 'stdout') terminalLog(chunk.data);
            else if (chunk.kind === 'stderr') terminalLog(chunk.data, 'cdr-terminal-error');
            else if (chunk.kind === 'done') { exitCode = chunk.code; done = true; }
          };
          await HC.invoke('shell_run_stream', { command: 'sh', args: ['-c', cmd], cwd: sharedState.projectRoot || undefined, onChunk: channel });
          for (let i = 0; !done && i < 200; i++) await new Promise(r => setTimeout(r, 25));
          if (exitCode !== 0 && exitCode !== null) {
            terminalLog(`(exit code: ${exitCode})`, 'cdr-terminal-error');
          }
        } catch (err) {
          terminalLog(String(err?.message || err), 'cdr-terminal-error');
        }
      } else {
        try {
          const result = await HC.invoke('shell_run', { command: 'sh', args: ['-c', cmd], cwd: sharedState.projectRoot || undefined });
          if (result?.stdout) result.stdout.split('\n').forEach(l => { if (l || result.stdout.endsWith('\n')) terminalLog(l); });
          if (result?.stderr) result.stderr.split('\n').forEach(l => { if (l) terminalLog(l, 'cdr-terminal-error'); });
          if (result?.code !== 0 && result?.code !== undefined) {
            terminalLog(`(exit code: ${result.code})`, 'cdr-terminal-error');
          }
        } catch (err) {
          terminalLog(String(err?.message || err), 'cdr-terminal-error');
        }
      }
      } finally {
        _terminalBusy = false;
      }
    }

    // Terminal history (up/down arrows)
    const _termHistory = [];
    let _termHistIdx = -1;
    function _pushTermHistory(cmd) {
      if (!cmd) return;
      _termHistory.push(cmd);
      _termHistIdx = _termHistory.length;
      try {
        const saved = JSON.parse(localStorage.getItem('hc_term_history') || '[]');
        saved.push(cmd);
        if (saved.length > 200) saved.shift();
        localStorage.setItem('hc_term_history', JSON.stringify(saved));
      } catch {}
    }
    function _loadTermHistory() {
      try {
        const saved = JSON.parse(localStorage.getItem('hc_term_history') || '[]');
        _termHistory.push(...saved);
        _termHistIdx = _termHistory.length;
      } catch {}
    }
    _loadTermHistory();

    function clearChat() {
      saveCurrentSession();
      _conversationMsgs.length = 0;
      _fileChanges.length = 0;
      activeContentEl = null;
      const tab = _tabMgr.active();
      if (tab) tab.compactionLedger = "";
      clearChatUI();
      _tabMgr.save();
      updateCoderContextChip([]);
    }

    // ── Export — opens a small menu under the Export button with format choices.
    // Formats: txt (plain), code (only fenced code blocks extracted), pdf (rendered).
    function exportChat() {
      if (!_conversationMsgs.length) { alert('No conversation to export.'); return; }
      // If a menu is already open, close it
      const existing = document.getElementById('cdrExportMenu');
      if (existing) { existing.remove(); return; }
      const btn = document.getElementById('cdrExportBtn');
      if (!btn) return;
      const menu = document.createElement('div');
      menu.id = 'cdrExportMenu';
      menu.className = 'cdr-export-menu';
      menu.innerHTML = `
        <button data-fmt="txt" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>
          Plain text (.txt)
        </button>
        <button data-fmt="code" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Code only (.txt)
        </button>
        <button data-fmt="md" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
          Markdown (.md)
        </button>
        <button data-fmt="pdf" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          PDF (.pdf)
        </button>
        <button data-fmt="changes" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Changes audit (.json)
        </button>`;
      document.body.appendChild(menu);
      const rect = btn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = (rect.bottom + 6) + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
      menu.style.zIndex = '99999';
      // Click outside closes
      const closeOnOutside = (e) => {
        if (!menu.contains(e.target) && e.target !== btn) {
          menu.remove();
          document.removeEventListener('click', closeOnOutside, true);
        }
      };
      setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
      // Format handlers
      menu.querySelectorAll('button[data-fmt]').forEach(b => {
        b.addEventListener('click', () => {
          const fmt = b.dataset.fmt;
          menu.remove();
          document.removeEventListener('click', closeOnOutside, true);
          doExport(fmt);
        });
      });
    }

    function doExport(fmt) {
      const ts = Date.now();
      const proj = sharedState.projectRoot ? sharedState.projectRoot.split('/').slice(-1)[0] : 'chat';

      if (fmt === 'txt') {
        const out = buildPlainText();
        downloadBlob(out, 'text/plain', `miraxcode-${proj}-${ts}.txt`);
      } else if (fmt === 'md') {
        const out = buildMarkdown();
        downloadBlob(out, 'text/markdown', `miraxcode-${proj}-${ts}.md`);
      } else if (fmt === 'code') {
        const out = buildCodeOnly();
        if (!out.trim()) { alert('No fenced code blocks found in this conversation.'); return; }
        downloadBlob(out, 'text/plain', `miraxcode-${proj}-code-${ts}.txt`);
      } else if (fmt === 'pdf') {
        exportAsPdf(`miraxcode-${proj}-${ts}.pdf`);
      } else if (fmt === 'changes') {
        const out = _ideCtx?.buildChangesExport?.({ fullContent: true }) || '{"changes":[]}';
        downloadBlob(out, 'application/json', `miraxcode-${proj}-changes-${ts}.json`);
      }
    }

    function buildMarkdown() {
      const lines = [];
      lines.push(`# MiraXcode Coder — Chat Export`);
      lines.push(`Date: ${new Date().toLocaleString()}`);
      if (sharedState.projectRoot) lines.push(`Project: ${sharedState.projectRoot}`);
      lines.push('');
      for (const m of _conversationMsgs) {
        if (m.role === 'system') continue;
        const role = m.role === 'user' ? '## User' : '## Agent';
        lines.push(role); lines.push('');
        lines.push(m.content || ''); lines.push('');
      }
      return lines.join('\n');
    }

    function buildPlainText() {
      const lines = [];
      lines.push(`MiraXcode Coder — Chat Export`);
      lines.push(`Date: ${new Date().toLocaleString()}`);
      if (sharedState.projectRoot) lines.push(`Project: ${sharedState.projectRoot}`);
      lines.push('═'.repeat(60));
      for (const m of _conversationMsgs) {
        if (m.role === 'system') continue;
        lines.push('');
        lines.push((m.role === 'user' ? '>>> USER' : '<<< AGENT') + ' ' + '─'.repeat(40));
        lines.push(m.content || '');
      }
      return lines.join('\n');
    }

    function buildCodeOnly() {
      const out = [];
      const fence = /```(\w*)\n([\s\S]*?)```/g;
      let n = 0;
      for (const m of _conversationMsgs) {
        if (!m.content || m.role === 'system') continue;
        let match;
        while ((match = fence.exec(m.content)) !== null) {
          n++;
          const lang = match[1] || 'text';
          out.push(`/* ── block ${n} · ${lang} ── */`);
          out.push(match[2].trimEnd());
          out.push('');
        }
      }
      return out.join('\n');
    }

    function downloadBlob(content, mime, filename) {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      setStatus(`Exported · ${filename}`, 'ok');
      setTimeout(() => setStatus('Ready', ''), 2400);
    }

    function exportAsPdf(filename) {
      // jsPDF is loaded as window.jspdf.jsPDF (UMD bundle, included in index.html)
      const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
      if (!jsPDFCtor) {
        // No jsPDF available — fall back to opening a printable HTML window
        return exportAsPdfPrintFallback(filename);
      }
      try {
        const pdf = new jsPDFCtor({ unit: 'pt', format: 'a4' });
        const margin = 40;
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const lineH = 12;
        let y = margin;
        const write = (text, opts) => {
          opts = opts || {};
          pdf.setFont(opts.mono ? 'courier' : 'helvetica', opts.bold ? 'bold' : 'normal');
          pdf.setFontSize(opts.size || 9.5);
          pdf.setTextColor(opts.color || '#1a1a1a');
          const split = pdf.splitTextToSize(text || '', pageW - margin * 2);
          for (const line of split) {
            if (y + lineH > pageH - margin) { pdf.addPage(); y = margin; }
            pdf.text(line, margin, y);
            y += lineH;
          }
        };
        write('MiraXcode Coder — Chat Export', { size: 14, bold: true });
        write(new Date().toLocaleString(), { size: 8, color: '#666' });
        if (sharedState.projectRoot) write('Project: ' + sharedState.projectRoot, { size: 8, color: '#666' });
        y += 6;
        for (const m of _conversationMsgs) {
          if (m.role === 'system') continue;
          y += 4;
          write(m.role === 'user' ? '▸ USER' : '◂ AGENT', {
            size: 9, bold: true,
            color: m.role === 'user' ? '#1e7d4a' : '#1d6a99'
          });
          const text = m.content || '';
          // Split fenced code blocks vs prose so we render them mono
          const re = /```(?:\w*\n)?([\s\S]*?)```/g;
          let last = 0, match;
          while ((match = re.exec(text)) !== null) {
            if (match.index > last) write(text.slice(last, match.index).trim());
            write(match[1].replace(/\n$/, ''), { mono: true, size: 8.5, color: '#222' });
            last = match.index + match[0].length;
          }
          if (last < text.length) write(text.slice(last).trim());
        }
        pdf.save(filename);
        setStatus(`Exported · ${filename}`, 'ok');
        setTimeout(() => setStatus('Ready', ''), 2400);
      } catch (e) {
        console.warn('[CoderMode] PDF export error:', e);
        exportAsPdfPrintFallback(filename);
      }
    }

    function exportAsPdfPrintFallback(filename) {
      // Build a styled HTML page and open print dialog — user picks "Save as PDF"
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(filename)}</title>
<style>
body{font:13px/1.55 -apple-system,sans-serif;max-width:780px;margin:32px auto;padding:0 24px;color:#222}
h1{font-size:18px;border-bottom:1px solid #ddd;padding-bottom:8px}
.role{font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-top:18px;margin-bottom:4px}
.user{color:#1e7d4a}.agent{color:#1d6a99}
pre{background:#f4f6f8;border:1px solid #e2e4e8;border-radius:5px;padding:10px;overflow:auto;font:11px/1.45 ui-monospace,Menlo,monospace}
.meta{color:#888;font-size:11px}
</style></head><body>
<h1>MiraXcode Coder — Chat Export</h1>
<div class="meta">${esc(new Date().toLocaleString())}</div>
${sharedState.projectRoot ? `<div class="meta">Project: ${esc(sharedState.projectRoot)}</div>` : ''}
${_conversationMsgs.filter(m => m.role !== 'system').map(m => `
  <div class="role ${m.role === 'user' ? 'user' : 'agent'}">${m.role === 'user' ? '▸ User' : '◂ Agent'}</div>
  <div>${renderMarkdown(m.content || '')}</div>
`).join('')}
<script>setTimeout(()=>window.print(),300)</script>
</body></html>`;
      const w = window.open('', '_blank');
      if (!w) {
        // Pop-up blocked → blob URL workaround
        const blob = new Blob([html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename.replace(/\.pdf$/, '.html');
        a.click();
        setStatus('Saved as HTML — open and Print > Save as PDF', 'ok');
        return;
      }
      w.document.open(); w.document.write(html); w.document.close();
      setStatus('Print dialog opened — choose Save as PDF', 'ok');
      setTimeout(() => setStatus('Ready', ''), 2400);
    }

    const CHANGE_SVG = {
      accept: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      reject: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      view: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
      file: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    };

    function getChangesWrap(contentEl) {
      if (!contentEl) return null;
      let wrap = contentEl.querySelector('.cdr-changes-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'cdr-changes-wrap';
        const bar = document.createElement('div');
        bar.className = 'cdr-changes-batch-bar';
        bar.hidden = true;
        bar.innerHTML = `
          <span class="cdr-changes-batch-count"></span>
          <div class="cdr-changes-batch-actions">
            <button type="button" class="cdr-change-btn primary cdr-changes-accept-all">${CHANGE_SVG.accept} Accept all</button>
            <button type="button" class="cdr-change-btn danger cdr-changes-reject-all">${CHANGE_SVG.reject} Reject all</button>
          </div>`;
        wrap.appendChild(bar);
        contentEl.appendChild(wrap);
      }
      return wrap;
    }

    function updateChangesBatchBar(contentEl) {
      const wrap = contentEl?.querySelector?.('.cdr-changes-wrap');
      const bar = wrap?.querySelector('.cdr-changes-batch-bar');
      if (!bar) return;
      const pending = wrap.querySelectorAll('.cdr-change-row.pending').length;
      const countEl = bar.querySelector('.cdr-changes-batch-count');
      if (countEl) countEl.textContent = pending ? `${pending} pending` : 'All reviewed';
      bar.hidden = wrap.querySelectorAll('.cdr-change-row').length === 0;
      const acceptAll = bar.querySelector('.cdr-changes-accept-all');
      const rejectAll = bar.querySelector('.cdr-changes-reject-all');
      if (acceptAll) acceptAll.disabled = pending === 0;
      if (rejectAll) rejectAll.disabled = pending === 0;
    }

    async function setChangeRowState(row, state) {
      if (!row) return;
      const idx = parseInt(row.dataset.changeIdx, 10);
      const entry = !Number.isNaN(idx) ? _fileChanges[idx] : null;

      if (entry && window.CdrFileStage) {
        if (state === 'accepted' && !entry.applied) {
          try {
            await window.CdrFileStage.applyEntry(entry, (p, c, r) => HC.code.writeFile(p, c, r));
            addAIFileToExplorer(entry.path, entry.kind || 'write');
            HC?.guard?.notify?.('Change applied to disk', 'ok');
          } catch (e) {
            HC?.guard?.notify?.(e?.message || 'Apply failed', 'err');
            return;
          }
        } else if (state === 'rejected') {
          try {
            await window.CdrFileStage.rejectEntry(
              entry,
              (p) => HC.code.readFile(p),
              (p, c, r) => HC.code.writeFile(p, c, r),
              (p, r) => HC.code.deleteFile(p, r)
            );
            HC?.guard?.notify?.(
              entry.applied ? 'Change reverted on disk' : 'Change discarded',
              'info'
            );
          } catch (e) {
            HC?.guard?.notify?.(e?.message || 'Revert failed', 'err');
            return;
          }
        }
        entry.status = state;
      }

      row.classList.remove('pending', 'accepted', 'rejected');
      row.classList.add(state);
      const acceptBtn = row.querySelector('.cdr-change-accept');
      const rejectBtn = row.querySelector('.cdr-change-reject');
      const viewBtn = row.querySelector('.cdr-change-view');
      if (state === 'accepted') {
        if (acceptBtn) { acceptBtn.disabled = true; acceptBtn.innerHTML = `${CHANGE_SVG.accept} Accepted`; }
        if (rejectBtn) {
          rejectBtn.disabled = false;
          rejectBtn.innerHTML = `${CHANGE_SVG.reject} Revert`;
          rejectBtn.title = 'Revert this change on disk';
        }
        if (viewBtn) viewBtn.disabled = false;
      } else if (state === 'rejected') {
        if (rejectBtn) { rejectBtn.disabled = true; rejectBtn.innerHTML = `${CHANGE_SVG.reject} Rejected`; }
        if (acceptBtn) acceptBtn.disabled = true;
        if (viewBtn) viewBtn.disabled = false;
      }
      const contentEl = row.closest('.cdr-msg-content');
      updateChangesBatchBar(contentEl);
      if (entry) entry.status = state;
      renderFileChangePills();
      updatePendingChangesHeader();
      if (entry?.path && _editorPane?.activePath === entry.path) {
        if (entry.status === 'pending') {
          _editorPane.openFile(entry.path).catch(() => {});
        } else {
          _editorPane.openFile(entry.path).catch(() => {});
        }
      }
    }

    async function acceptAllPendingChanges(contentEl) {
      const root = contentEl || activeContentEl;
      if (!root) return;
      const rows = [...root.querySelectorAll('.cdr-change-row.pending')];
      for (const row of rows) await setChangeRowState(row, 'accepted');
      HC?.guard?.notify?.('All changes accepted', 'info');
    }

    async function rejectAllPendingChanges(contentEl) {
      const root = contentEl || activeContentEl;
      if (!root) return;
      const rows = [...root.querySelectorAll('.cdr-change-row.pending, .cdr-change-row.accepted')];
      for (const row of rows) await setChangeRowState(row, 'rejected');
      HC?.guard?.notify?.('All changes rejected or reverted', 'info');
    }

    function toggleChangePreview(row) {
      const idx = parseInt(row?.dataset?.changeIdx, 10);
      const entry = _fileChanges[idx];
      if (!entry) return;
      let preview = row.nextElementSibling;
      if (!preview?.classList?.contains('cdr-diff-preview')) {
        preview = document.createElement('div');
        preview.className = 'cdr-diff-preview';
        preview.style.display = 'none';
        const lineCount = entry.content ? (entry.content.match(/\n/g) || []).length + 1 : 0;
        const body = (entry.content || '').length > 24_000
          ? (entry.content || '').slice(0, 24_000) + '\n\n… (preview truncated)'
          : (entry.content || '');
        preview.innerHTML = `
          <div class="cdr-diff-header">
            <span>${esc(entry.name || entry.path)}</span>
            <span style="color:var(--cdr-text-muted)">${lineCount} lines</span>
          </div>
          <div class="cdr-diff-body"><pre><code>${esc(body)}</code></pre></div>`;
        row.after(preview);
      }
      const open = preview.style.display !== 'block';
      preview.style.display = open ? 'block' : 'none';
      const viewBtn = row.querySelector('.cdr-change-view');
      if (viewBtn) viewBtn.innerHTML = open ? `${CHANGE_SVG.view} Hide` : `${CHANGE_SVG.view} View`;
    }

    function wireChangeRowDelegation() {
      const msgs = $('cdrMessages');
      if (!msgs || msgs.dataset.changeDelegate === '1') return;
      msgs.dataset.changeDelegate = '1';
      msgs.addEventListener('click', e => {
        const row = e.target.closest('.cdr-change-row');
        if (row) {
          if (e.target.closest('.cdr-change-accept')) {
            e.preventDefault();
            setChangeRowState(row, 'accepted');
            return;
          }
          if (e.target.closest('.cdr-change-reject')) {
            e.preventDefault();
            setChangeRowState(row, 'rejected');
            return;
          }
          if (e.target.closest('.cdr-change-view')) {
            e.preventDefault();
            toggleChangePreview(row);
            return;
          }
        }
        const wrap = e.target.closest('.cdr-changes-wrap');
        if (!wrap) return;
        if (e.target.closest('.cdr-changes-accept-all')) {
          e.preventDefault();
          acceptAllPendingChanges(wrap.closest('.cdr-msg-content'));
        } else if (e.target.closest('.cdr-changes-reject-all')) {
          e.preventDefault();
          rejectAllPendingChanges(wrap.closest('.cdr-msg-content'));
        }
      });
    }

    function addChangeEntry(name, path, kind, content, existingEntry) {
      const fc = activeFileChanges();
      const idx = fc.length;
      const stored = typeof content === 'string' && content.length > 80_000
        ? content.slice(0, 80_000) + '\n… (stored truncated)'
        : content;
      const entry = existingEntry || {
        name, path, kind,
        content: stored,
        proposedContent: stored,
        previousContent: null,
        status: 'pending',
        applied: false,
      };
      if (existingEntry) {
        entry.name = entry.name || name;
        entry.path = entry.path || path;
        entry.kind = entry.kind || kind;
        entry.content = entry.content ?? stored;
        entry.proposedContent = entry.proposedContent ?? stored;
      }
      fc.push(entry);
      const target = activeContentEl || $('cdrMessages')?.querySelector('.cdr-msg.assistant:last-of-type .cdr-msg-content');
      if (!target) return;
      const wrap = getChangesWrap(target);
      if (!wrap) return;
      const lineCount = stored ? (String(stored).match(/\n/g) || []).length + 1 : 0;
      const stats = stored ? `+${lineCount} lines` : '';
      const row = document.createElement('div');
      row.className = 'cdr-change-row pending';
      row.dataset.changeIdx = String(idx);
      row.innerHTML = `
        ${CHANGE_SVG.file}
        <span class="cdr-change-file">${esc(name)}</span>
        <span class="cdr-change-stats">${esc(stats)}</span>
        <div class="cdr-change-actions">
          <button type="button" class="cdr-change-btn primary cdr-change-accept">${CHANGE_SVG.accept} Accept</button>
          <button type="button" class="cdr-change-btn danger cdr-change-reject">${CHANGE_SVG.reject} Reject</button>
          <button type="button" class="cdr-change-btn cdr-change-view">${CHANGE_SVG.view} View</button>
        </div>`;
      wrap.appendChild(row);
      updateChangesBatchBar(target);
      renderFileChangePills();
      if (path && (_ideCtx?.shouldAutoOpenDiff?.() !== false)) {
        _editorPane?.openFile(path).catch(() => {});
      }
      scrollMessages();
    }

    // ── Build tools + system ──────────────────────────────────
    function buildTools() {
      if (_ideCtx?.isPlanOnly?.()) return [];
      return (HC?.code?.TOOL_DEFINITIONS || []).map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries(t.parameters).map(([k, v]) =>
                [k, (v && typeof v === 'object' && v.type) ? v : { type: 'string', description: String(v) }]
              )
            ),
            required: Object.keys(t.parameters).filter(k => !['reason', 'cwd', 'file_ext'].includes(k)),
          }
        }
      }));
    }

    function sysPrompt(extra) {
      // ── Surgical system prompt — Claude Code / Codex style ──
      // Terse. No prose. One change at a time. Prefer tool calls over speech.
      const root = sharedState.projectRoot;
      let homeDir = sharedState.homeDir || '';
      if (!homeDir && root) {
        const parts = root.split('/').filter(Boolean);
        if (parts[0] === 'Users' && parts[1]) homeDir = `/Users/${parts[1]}`;
        else if (parts[0] === 'home' && parts[1]) homeDir = `/home/${parts[1]}`;
      }

      const lines = [
        'You are MiraXcode Coder — a precise coding agent.',
      ];
      if (_ideCtx?.isPlanOnly?.()) {
        lines.push(
          'PLAN MODE (active): Do not use tools. Reply with a structured plan only — steps, files, risks, and verification.',
          'Use markdown headings and numbered steps. No file writes until the user disables Plan mode.'
        );
      } else {
        lines.push(
        'Rules:',
        '1. One change at a time. Use tool calls for any file/shell action — do not narrate plans.',
        '2. Replies must be ≤3 short sentences unless the user asks for detail.',
        '3. For code edits, return only the changed region. No surrounding context.',
        '4. Never call tools for greetings or conversational questions — answer in plain text.',
        '5. Blocked paths: /System, /etc, /private, /usr, /bin — refuse without asking.',
        );
      }
      if (root) {
        lines.push(`Project root: ${root}`);
        lines.push(`6. If the project directory is empty or new, immediately start creating files — do NOT explore the filesystem first.`);
        if (sharedState.activeFile) lines.push(`Active file: ${sharedState.activeFile}`);
      } else {
        lines.push(`No project open. Home: ${homeDir || 'unknown'}. Ask user to open a folder for write ops.`);
      }

      const task = _conversationMsgs.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
      try {
        const memBlock = HC?.coderMemory?.formatMergedForPrompt?.(root, task);
        if (memBlock) lines.push(memBlock.trim());
        else if (window._H?.memRecall) {
          const scored = window._H.memRecall(task, 8);
          if (scored?.length) {
            lines.push('Memory (silent context, do not recite):');
            scored.forEach(f => lines.push(`  - ${f.key}: ${String(f.value).slice(0, 160)}`));
          }
        }
      } catch {}

      if (_graphifyContext) {
        lines.push(HC?.coderGraphify?.formatPromptBlock?.(root, _graphifyContext) || _graphifyContext);
      } else if (root && HC?.coderGraphify) {
        lines.push(
          'Graphify: graphify-out/ will be used when available. Call graphify_report or graphify_query before blind repo search.'
        );
      }

      if (HC?.guard?.isYolo?.()) {
        lines.push('YOLO mode: run tools and shell without permission prompts (hard-blocked paths/commands still denied).');
      } else if (HC?.guard?.isBypassPermissions?.()) {
        lines.push('Bypass permissions: approve tool/shell actions without prompts (hard-blocked still denied).');
      }

      const skList = _skillsForPrompt?.length
        ? _skillsForPrompt
        : (HC?.coderSkills?.getCached?.() || []);
      const skBlock = HC?.coderSkills?.formatSkillsForPrompt?.(skList);
      if (skBlock) lines.push(skBlock);

      const richBase = HC?.code?.SYSTEM_PROMPT || '';
      const out = (richBase ? richBase + '\n' : '') + lines.join('\n');
      return out + (extra ? '\n' + extra : '');
    }

    /** Model-aware compaction — preserves WORKING_STATE ledger on the tab. */
    async function prepareMessagesForModel(msgs, signal) {
      const tab = _tabMgr.active();
      const modelValue = activeModelValue();
      if (!HC?.contextCompactor?.prepareForApi) {
        return HC?.contextCompactor?.trimAllTools?.(msgs, 1200) || msgs;
      }
      const prepared = await HC.contextCompactor.prepareForApi(msgs, {
        modelValue,
        signal,
        ledger: tab?.compactionLedger || "",
        cacheKey: tab?.id || "coder",
        onStatus: (t) => { if (t) setStatus(t, 'thinking'); },
        onLedgerUpdate: (ledger) => {
          if (tab) {
            tab.compactionLedger = ledger;
            _tabMgr.save();
          }
        },
      });
      updateCoderContextChip(prepared);
      return prepared;
    }

    // ── Core agent loop — renders inline into a bubble ────────
    async function agentLoop(messages, tools, contentEl, label, signal) {
      const H = window._H;
      const temperature = H?.selectedTemperature ? Math.min(H.selectedTemperature(), 0.35) : 0.15;
      activeContentEl = contentEl;
      const runTabId = _runTabId;
      const yolo = !!HC?.guard?.isYolo?.();
      const MAX_ITER = yolo ? 40 : 16;
      let iter = 0;
      let thinkEl = appendThinking(contentEl);
      let reasoningEl = null; // real-time reasoning display

      try {
      while (iter < MAX_ITER) {
        iter++;

        setStatus(`${label ? label + ' · ' : ''}Thinking…`, 'thinking');
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        // On the final iteration pass a copy with a wrap-up nudge so the model
        // stops calling tools. We use a copy so the nudge never persists into
        // _conversationMsgs on the next user turn.
        // Also compress older turns to keep the prompt small (Claude-Code style).
        const baseMsgs = iter === MAX_ITER
          ? [...messages, { role: 'user', content: 'Stop calling tools now. Write a 2-sentence summary of what was done and any leftover.' }]
          : messages;
        const callMessages = await prepareMessagesForModel(baseMsgs, signal);
        if (callMessages.length < baseMsgs.length) {
          const ctxU = HC?.contextCompactor?.usageRatio?.(callMessages, activeModelValue());
          cdrTraceAdd('Context', `Compacted · ~${ctxU?.estimated || '?'} tok`, 'run');
        }

        cdrTraceAdd('Step', `Iter ${iter}${label ? ' · ' + label : ''} · calling model`, 'run');
        let turn;
        let liveStreamActive = false;
        const onToken = (_delta, full) => {
          if (signal?.aborted || _runTabId !== runTabId) return;
          if (!liveStreamActive) {
            _ideCtx?.beginStreamBubble?.(contentEl);
            liveStreamActive = true;
          }
          _ideCtx?.updateStreamBubble?.(full);
          scrollMessages();
        };
        try {
          turn = await callWithRouter(callMessages, tools, temperature, signal, coderModel, onToken);
        } catch (e) {
          if (liveStreamActive) _ideCtx?.cancelStreamBubble?.();
          thinkEl?.remove(); thinkEl = null;
          reasoningEl?.remove(); reasoningEl = null;
          cdrTraceAdd('Error', e?.message || String(e), 'err');
          // Show error inline in the bubble
          const errDiv = document.createElement('div');
          errDiv.className = 'cdr-msg-text';
          errDiv.style.color = 'var(--cdr-error)';
          errDiv.style.borderLeft = '2px solid var(--cdr-error)';
          errDiv.style.paddingLeft = '10px';
          errDiv.style.margin = '8px 0';
          errDiv.innerHTML = `<b>Error</b><br>${esc(e?.message || String(e))}`;
          contentEl.appendChild(errDiv);
          scrollMessages();
          throw e;
        }
        thinkEl?.remove(); thinkEl = null;

        if (turn.tool_calls?.length) {
          if (liveStreamActive) {
            _ideCtx?.cancelStreamBubble?.();
            liveStreamActive = false;
          }
          if (turn.content) {
            if (!reasoningEl) {
              reasoningEl = document.createElement('div');
              reasoningEl.className = 'cdr-thinking-stream';
              contentEl.appendChild(reasoningEl);
            }
            reasoningEl.innerHTML = `<div class="cdr-thinking-hd">Reasoning</div>${esc(turn.content)}`;
            reasoningEl.classList.remove('empty');
            scrollMessages();
          }
        }

        if (turn.tool_calls?.length) {
          H.appendAssistantToolCallTurn(messages, turn.content, turn.tool_calls); // always append to real history
          _domScrollBatch++;
          try {
          for (const call of turn.tool_calls) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            // Bash preview: show shell_run commands in terminal before executing
            if (call.name === 'shell_run') {
              const cmd = call.arguments?.command || '';
              const args = (call.arguments?.args || []).join(' ');
              const cwd = call.arguments?.cwd || sharedState.projectRoot || '';
              const preview = cwd ? `cd ${cwd} && ${cmd} ${args}` : `${cmd} ${args}`;
              terminalLog('[' + call.name + ' preview] ' + preview, 'cdr-bash-preview');
            }

            const toolEl = appendToolBlock(contentEl, call.name, call.arguments);
            setStatus(`${call.name}…`, 'run');
            const pathHint = call.arguments?.path || call.arguments?.dir || call.arguments?.command || '';
            cdrTraceAdd('Tool', call.name + (pathHint ? ' · ' + String(pathHint).split('/').pop() : ''), 'run');
            const t0 = performance.now();
            let resultStr, ok = true;
            try {
              if ((call.name === 'write_file' || call.name === 'patch_file') && window.CdrFileStage) {
                const staged = await window.CdrFileStage.computeProposed(call, (p) => HC.code.readFile(p));
                const stored = staged.proposedContent.length > 80_000
                  ? staged.proposedContent.slice(0, 80_000) + '\n… (stored truncated)'
                  : staged.proposedContent;
                const entry = {
                  name: baseName(staged.path),
                  path: staged.path,
                  kind: staged.kind,
                  content: stored,
                  proposedContent: staged.proposedContent,
                  previousContent: staged.previousContent,
                  status: 'pending',
                  applied: false,
                  tool: staged.tool,
                };
                const fcRun = activeFileChanges();
                const changeIdx = fcRun.length;
                addChangeEntry(entry.name, entry.path, entry.kind, stored, entry);
                resultStr = window.CdrFileStage.stagedResult(staged.path, staged.proposedContent.length);
                if (yolo && ok) {
                  const entry = fcRun[changeIdx];
                  try {
                    await window.CdrFileStage.applyEntry(entry, (p, c, r) => HC.code.writeFile(p, c, r));
                    addAIFileToExplorer(entry.path, entry.kind || 'write');
                    const row = contentEl?.querySelector(
                      `.cdr-change-row[data-change-idx="${changeIdx}"]`
                    );
                    if (row) await setChangeRowState(row, 'accepted');
                    resultStr = JSON.stringify({
                      ok: true,
                      applied: true,
                      path: entry.path,
                      message: 'YOLO: change written to disk immediately (revert still available).',
                    });
                  } catch (applyErr) {
                    ok = false;
                    resultStr = JSON.stringify({ error: String(applyErr?.message || applyErr) });
                  }
                }
              } else {
                const def = (HC?.code?.TOOL_DEFINITIONS || []).find(t => t.name === call.name);
                if (!def) throw new Error('Unknown tool: ' + call.name);
                const raw = await def.fn(call.arguments || {});
                resultStr = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
              }
            } catch (e) {
              resultStr = JSON.stringify({ error: String(e?.message || e) }); ok = false;
            }
            const ms = Math.round(performance.now() - t0);
            cdrTraceAdd('Tool', call.name + ' · ' + ms + 'ms', ok ? 'ok' : 'err');
            finalizeToolBlock(toolEl, resultStr, ok, ms);
            if (!ok && _ideCtx?.reportProblems && window.CdrDiagnostics?.parseOutput) {
              const parsed = window.CdrDiagnostics.parseOutput(resultStr);
              if (parsed.length) _ideCtx.reportProblems(parsed);
            }

            if (call.name === 'delete_file') {
              const fp = call.arguments?.path || '';
              addChangeEntry(fp.split('/').slice(-1)[0] || fp, fp, 'delete', '(file deleted)');
              if (ok && fp) addAIFileToExplorer(fp, 'delete');
            }
            H.appendToolResult(messages, call, resultStr);
          }
          } finally {
            _domScrollBatch--;
          }
          scrollMessages();
          thinkEl = appendThinking(contentEl);
          continue;
        }

        // Final answer — hide reasoning, show result
        reasoningEl?.remove(); reasoningEl = null;
        const finalText = turn.content || '';
        if (!finalText.trim()) {
          cdrTraceAdd('Done', 'Empty response from model', 'warn');
          appendTextToBubble(contentEl, '*No response from model. Try again or check your model settings.*');
        } else {
          cdrTraceAdd('Done', (label || 'Agent') + ' · ' + finalText.length + ' chars', 'ok');
          if (liveStreamActive) {
            _ideCtx?.endStreamBubble?.(contentEl, finalText);
          } else {
            appendTextToBubble(contentEl, finalText);
          }
        }
        return finalText;
      }
      // Fallback if the model kept calling tools even on the final iteration.
      // Strip any dangling tool turns so the next user message doesn't produce
      // an invalid sequence like [tool, user] which most APIs reject.
      reasoningEl?.remove(); reasoningEl = null;
      while (messages.length && messages[messages.length - 1].role === 'tool') messages.pop();
      while (messages.length && messages[messages.length - 1].role === 'assistant' &&
             Array.isArray(messages[messages.length - 1].tool_calls)) messages.pop();
      cdrTraceAdd('Done', 'Max iterations reached', 'warn');
      if (yolo && !signal?.aborted) {
        messages.push({
          role: 'user',
          content: 'Continue from where you left off. Finish remaining work with tool calls as needed, then summarize.',
        });
        cdrTraceAdd('YOLO', 'Auto-continuing after max iterations', 'run');
        return agentLoop(messages, tools, contentEl, label, signal);
      }
      appendTextToBubble(contentEl, '*Task paused — reply to continue or click regen to retry.*');
      return '';
      } finally {
        if (activeContentEl === contentEl) activeContentEl = null;
      }
    }

    async function expandTaskMentions(task) {
      let t = task;
      if (_ideCtx?.expandCodebase) {
        t = await _ideCtx.expandCodebase(t);
      }
      const root = sharedState.projectRoot;
      if (!root || !t.includes('@')) return t;
      task = t;
      const re = /@([^\s@]+)/g;
      let extra = '';
      let m;
      while ((m = re.exec(task)) !== null) {
        const rel = m[1].replace(/\/$/, '');
        const full = rel.startsWith('/') ? rel : `${root.replace(/\/$/, '')}/${rel}`;
        try {
          const content = await HC.code.readFile(full);
          extra += `\n\n--- @${rel} ---\n${String(content).slice(0, 12_000)}`;
        } catch { /* skip missing paths */ }
      }
      return extra ? task + extra : task;
    }

    // ── Main send ─────────────────────────────────────────────
    async function startRun() {
      const taskInput = $('cdrTaskInput');
      const task = taskInput?.value?.trim();
      const hasAttach = window.CdrComposerAttachments?.hasPending?.();
      if (!task && !hasAttach) { taskInput?.focus(); return; }

      const attachHtml = window.CdrComposerAttachments?.renderUserAttachmentHtml?.() || '';
      const userPayload = window.CdrComposerAttachments?.buildUserMessagePayload?.(task || '(see attached files)') || { role: 'user', content: task || '(see attached files)' };

      // Clear input and resize
      taskInput.value = '';
      autoResize(taskInput);

      enterChatLiveMode();
      // Show user message
      appendUserMsg(task || '(see attached files)', attachHtml);

      // Memory + Graphify context before model call
      try { window._H?.memAutoExtract?.(task); } catch {}
      try { HC?.coderMemory?.extractFromUserMessage?.(sharedState.projectRoot, task); } catch {}
      await loadGraphifyContextForTask(task);

      // Bootstrap conversation on first message
      if (!_conversationMsgs.length) {
        _conversationMsgs.push({ role: 'system', content: sysPrompt() });
      } else if (_conversationMsgs[0]?.role === 'system') {
        _conversationMsgs[0].content = sysPrompt();
      }
      const modelTask = await expandTaskMentions(userPayload.content);
      const userMsg = { ...userPayload, content: modelTask };
      _conversationMsgs.push(userMsg);
      window.CdrComposerAttachments?.clear?.();
      updateCoderContextChip(_conversationMsgs);

      // Update tab title from first user message
      const tab = _tabMgr.active();
      if (tab && (!tab.title || tab.title.startsWith('Session'))) {
        tab.title = enforceThreeWordName(task);
        renderTabBar();
      }

      const runBtn  = $('cdrRunBtn');
      const stopBtn = $('cdrStopBtn');
      if (runBtn)  runBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = '';

      const gen = ++_runGeneration;
      if (runAbort) abortActiveRun('New run');
      runAbort = new AbortController();
      const { signal } = runAbort;
      _runTabId = tab?.id || _tabMgr.activeId || null;
      _runFileChanges = _fileChanges;

      setStatus('Thinking…', 'thinking');
      cdrTraceReset('Run started');

      // Mark tab as running
      if (tab) { tab.running = true; renderTabBar(); }

      try {
        const swarmMode = (document.getElementById('cdrSwarmMode')?.value || 'boss');
        if (agentCount === 1) {
          await runSingleTurn(signal);
        } else if (swarmMode === 'vote') {
          await runAllVote(task, agentCount, signal);
        } else if (swarmMode === 'chain') {
          await runChainRefine(task, agentCount, signal);
        } else {
          await runMultiTurn(task, agentCount, signal);
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          const c = appendAssistantBubble('MiraXCode Coder');
          if (c) appendTextToBubble(c, '*Stopped.*');
          setStatus('Stopped', '');
        } else {
          // Error already shown in bubble by agentLoop, just update status
          setStatus(e?.message || 'Error', 'err');
          console.error('[CoderMode] run failed:', e);
        }
      } finally {
        if (gen !== _runGeneration) return;
        if (runBtn)  runBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';
        runAbort = null;
        _runTabId = null;
        _runFileChanges = null;
        setRouterChip('Auto', '');
        const at = _tabMgr.active();
        if (at) { at.running = false; renderTabBar(); }
      }
    }

    async function runSingleTurn(signal) {
      const tools     = buildTools();
      const contentEl = appendAssistantBubble('MiraXCode Coder');
      const finalText = await agentLoop(_conversationMsgs, tools, contentEl, '', signal);
      if (finalText) {
        _conversationMsgs.push({ role: 'assistant', content: finalText });
        try { window._H?.memAutoExtractFromAssistant?.(finalText); } catch {}
        try { HC?.coderMemory?.extractFromAssistant?.(sharedState.projectRoot, finalText); } catch {}
      }
      saveCoderState();
      setStatus('Ready', '');
    }

    async function runMultiTurn(task, count, signal) {
      const H = window._H;

      // Multi-agent tasks need a project root to be useful — bail early otherwise
      if (!sharedState.projectRoot) {
        const el = appendAssistantBubble('MiraXCode Coder');
        appendTextToBubble(el, 'Multi-agent mode works best with a project open. Click **Open Project** to select your project folder, then try again.');
        setStatus('Ready', '');
        return;
      }

      // Boss: decompose
      const bossEl   = appendAssistantBubble('Boss');
      const thinkEl  = appendThinking(bossEl);
      const planMsgs = [
        { role: 'system', content: `You are a task planner. Split the user's request into exactly ${count - 1} independent coding sub-tasks. Reply ONLY with a valid JSON array:\n[{"id":"1","task":"..."},...]` },
        { role: 'user',   content: `Decompose for ${count - 1} parallel agents: ${task}` }
      ];
      let subTasks;
      try {
        const planTurn = await callWithRouter(planMsgs, [], 0.25, signal, coderModel);
        thinkEl?.remove();
        const m = (planTurn.content || '').match(/\[[\s\S]*?\]/);
        subTasks = m ? JSON.parse(m[0]) : null;
      } catch { thinkEl?.remove(); }

      if (!subTasks?.length) {
        subTasks = Array.from({ length: count - 1 }, (_, i) => ({
          id: String(i + 1), task: `Part ${i + 1}: ${task}`
        }));
      }
      appendTextToBubble(bossEl, `Coordinating **${count - 1} sub-agent${count - 1 > 1 ? 's' : ''}** for this task.`);
      setStatus('Agents running…', 'thinking');

      // Workers — each gets its own bubble and independent message history
      // Run max 2 agents concurrently to avoid overwhelming the app
      cdrTraceAdd('Boss', `Decomposed into ${subTasks.length} sub-task${subTasks.length !== 1 ? 's' : ''}`, 'ok');
      const results = [];
      for (let batch = 0; batch < subTasks.length; batch += MAX_CONCURRENT) {
        if (signal?.aborted) break;
        const batchTasks = subTasks.slice(batch, batch + MAX_CONCURRENT);
        const batchResults = await Promise.all(batchTasks.map(async (st, j) => {
          const idx = batch + j + 2;
          cdrTraceAdd(`Agent ${idx}`, (st.task || task).slice(0, 60), 'run');
          const wEl   = appendAssistantBubble(`Agent ${idx}`);
          const wMsgs = [
            { role: 'system', content: sysPrompt(`You are sub-agent ${idx} of ${count}. Focus only on your assigned task.`) },
            { role: 'user',   content: st.task || task }
          ];
          try {
            const result = await agentLoop(wMsgs, buildTools(), wEl, `Agent ${idx}`, signal);
            cdrTraceAdd(`Agent ${idx}`, 'Finished', 'ok');
            return result;
          } catch (e) {
            cdrTraceAdd(`Agent ${idx}`, e?.message || 'Failed', 'err');
            appendTextToBubble(wEl, `**Error:** ${esc((e.message || '').slice(0, 80))}`);
            return '';
          }
        }));
        results.push(...batchResults);
        setStatus(`Agents ${Math.min(batch + MAX_CONCURRENT, subTasks.length)}/${subTasks.length} done…`, 'thinking');
      }

      // Synthesis — boss combines all agent output into a final answer
      const synthEl   = appendAssistantBubble('Boss — Synthesis');
      const agentSummary = results
        .map((r, i) => `### Agent ${i + 2}\n${(r || '(no output)').slice(0, 1200)}`)
        .join('\n\n');
      const synthMsgs = [
        { role: 'system', content: sysPrompt('You are the synthesis boss. Your job is to combine the sub-agent results into one clear, complete final answer. Do NOT call any tools — write your synthesis directly.') },
        {
          role: 'user',
          content: `Original task: ${task}\n\nProject: ${sharedState.projectRoot}\n\nSub-agent results:\n${agentSummary}\n\nWrite a clear synthesis: what was done, what changed, and what (if anything) still needs attention.`
        }
      ];
      setStatus('Synthesizing…', 'thinking');
      const finalText = await agentLoop(synthMsgs, [], synthEl, 'Boss', signal);
      if (finalText) _conversationMsgs.push({ role: 'assistant', content: finalText });
      saveCoderState();
      setStatus('Ready', '');
    }

    async function runAllVote(task, count, signal) {
      const H = window._H;
      cdrTraceAdd('AllVote', `Sending to ${count} model(s) simultaneously`, 'run');

      const chain = buildRouterChain(coderModel);
      const voterAdapters = chain.slice(0, count);
      if (!voterAdapters.length) {
        const el = appendAssistantBubble('AllVote');
        appendTextToBubble(el, 'No models available. Add API keys in Settings.');
        setStatus('Ready', '');
        return;
      }

      const votes = [];
      for (let batch = 0; batch < voterAdapters.length; batch += MAX_CONCURRENT) {
        if (signal?.aborted) break;
        const batchAdapters = voterAdapters.slice(batch, batch + MAX_CONCURRENT);
        const batchVotes = await Promise.all(batchAdapters.map(async (adapter, j) => {
          const idx = batch + j + 1;
          const label = adapter.label || `Model ${idx}`;
          const vEl = appendAssistantBubble(`Vote ${idx} — ${label}`);
          cdrTraceAdd(label, 'Answering…', 'run');
          setStatus(`Vote ${idx}/${voterAdapters.length}…`, 'thinking');
          try {
            const msgs = [
              { role: 'system', content: sysPrompt('Answer the user request directly and thoroughly.') },
              { role: 'user', content: task }
            ];
            const result = await callWithRouter(msgs, buildTools(), 0.7, signal, adapter.kind === 'ollama' ? adapter.model : null);
            const text = result?.content || '';
            appendTextToBubble(vEl, text);
            cdrTraceAdd(label, 'Done', 'ok');
            return { label, text };
          } catch (e) {
            if (e.name === 'AbortError') throw e;
            cdrTraceAdd(label, e?.message || 'Failed', 'err');
            appendTextToBubble(vEl, `**Error:** ${esc((e.message || '').slice(0, 80))}`);
            return { label, text: '' };
          }
        }));
        votes.push(...batchVotes);
      }

      const judgeEl = appendAssistantBubble('Judge — Best Answer');
      setStatus('Judging…', 'thinking');
      cdrTraceAdd('Judge', 'Picking best answer', 'run');

      const judgePrompt = `Original task: ${task.slice(0, 500)}

${votes.map((v, i) => `### Response ${i + 1} (${v.label}):\n${v.text.slice(0, 1500)}`).join('\n---\n')}

Pick the best response or merge them into one final answer. Provide the complete answer.`;

      const judgeMsgs = [
        { role: 'system', content: sysPrompt('You are a judge. Pick or merge the best response into one clear, complete answer. Write the full answer, not just which one you picked.') },
        { role: 'user', content: judgePrompt }
      ];
      const finalText = await agentLoop(judgeMsgs, [], judgeEl, 'Judge', signal);
      if (finalText) _conversationMsgs.push({ role: 'assistant', content: finalText });
      saveCoderState();
      cdrTraceAdd('Judge', 'Verdict ready', 'ok');
      setStatus('Ready', '');
    }

    async function runChainRefine(task, steps, signal) {
      cdrTraceAdd('Chain', `Starting ${steps}-step refinement`, 'run');

      const chain = buildRouterChain(coderModel);
      const stages = [
        'Write an initial answer',
        'Review and improve — fix errors, add depth',
        'Polish — clearer structure, better formatting',
        'Final pass — concise, complete, well-formatted',
        'Ultimate refinement — production quality output'
      ];

      let current = task;

      for (let i = 0; i < steps; i++) {
        if (signal?.aborted) break;
        const adapter = chain[i % chain.length];
        const label = adapter?.label || `Step ${i + 1}`;
        const stage = stages[i] || 'Improve and refine the previous output';
        const el = appendAssistantBubble(`Step ${i + 1} — ${label}`);
        setStatus(`Chain step ${i + 1}/${steps}…`, 'thinking');
        cdrTraceAdd(label, stage.slice(0, 50), 'run');

        const prompt = i === 0 ? task : `${stage}:\n\n${current.slice(0, 2000)}`;
        const msgs = [
          { role: 'system', content: sysPrompt(`You are step ${i + 1} in a refinement chain. ${stage}.`) },
          { role: 'user', content: prompt }
        ];
        try {
          const result = await callWithRouter(msgs, buildTools(), 0.5, signal, adapter?.kind === 'ollama' ? adapter?.model : null);
          current = result?.content || current;
          appendTextToBubble(el, current);
          cdrTraceAdd(label, 'Done', 'ok');
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          cdrTraceAdd(label, e?.message || 'Failed', 'err');
          appendTextToBubble(el, `**Error:** ${esc((e.message || '').slice(0, 80))}`);
        }
      }

      if (current && current !== task) {
        _conversationMsgs.push({ role: 'assistant', content: current });
      }
      saveCoderState();
      cdrTraceAdd('Chain', 'Complete', 'ok');
      setStatus('Ready', '');
    }

    function stopRun() {
      _runGeneration++;
      abortActiveRun('Stopped');
      setStatus('Stopped', '');
    }

    // ── Audit log ─────────────────────────────────────────────
    async function showAuditLog() {
      const modal = $('hcAuditModal');
      if (!modal) return;
      modal.classList.add('open');
      const body = $('hcAuditBody');
      if (!body) return;
      body.innerHTML = '<div class="hc-audit-empty">Loading…</div>';
      try {
        if (!HC?.isTauri) {
          body.innerHTML = '<div class="hc-audit-empty">Audit log is only available in the desktop app.</div>';
          return;
        }
        const log = await HC.invoke('audit_log_read');
        if (!log?.trim()) {
          body.innerHTML = '<div class="hc-audit-empty">No audit entries yet.</div>';
        } else {
          const pre = document.createElement('pre');
          pre.className = 'hc-audit-log';
          pre.textContent = log;
          body.innerHTML = '';
          body.appendChild(pre);
          pre.scrollTop = pre.scrollHeight;
        }
      } catch (e) {
        body.innerHTML = `<div class="hc-audit-empty">Error: ${esc(String(e?.message || e))}</div>`;
      }
    }

    return { mount, destroy, remount };
  })();

  const { legacyRun } = createLegacyBridge(sharedState);
  registerCodeMode({ CoderMode, legacyRun, sharedState });
  scheduleCoderBoot(initSharedDom);
}
