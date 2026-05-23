/**
 * CoderMode — full-screen IDE agent (Wave 11).
 */
import { $, esc, baseName, setExplorerRootLabel, setRouterChip } from './dom-utils.js';
import { injectAllToolBlocks } from './tool-blocks.js';
import { createAgentRunApi } from './agent-run.js';
import { startStatsPolling } from './stats-poll.js';
import { createTabManager } from './tabs.js';
import { createTerminalApi } from './terminal.js';
import { createExplorerApi } from './explorer.js';

export function createCoderMode(deps) {
  const { sharedState, modelRef, relativeFromRoot } = deps;

  return (() => {
    let mounted            = false;
    let agentCount         = 1;
    const MAX_CONCURRENT   = 2;
    let runAbort           = null;
    let _conversationMsgs  = [];
    let _fileChanges       = [];
    let toolCallCounter    = 0;
    let activeContentEl    = null;
    const cdrTraceEntriesRef    = { current: [] };
    const cdrTraceStartedAtRef  = { current: Date.now() };
    const terminalBusyRef       = { current: false };
    const SESSIONS_KEY     = 'hc-coder-sessions';
    const STATE_KEY        = 'hashui_coder_state';
    const TABS_KEY         = 'miraxcode_coder_tabs';
    let _chatVirtual       = null;
    let _editorPane        = null;
    let _ideCtx            = null;
    let _graphifyContext   = '';
    let _skillsForPrompt   = [];
    let buildTools;
    let sysPrompt;
    let agentLoop;
    let expandTaskMentions;
    let startRun;
    let stopRun;
    let runSingleTurn;
    let runMultiTurn;
    let runAllVote;
    let runChainRefine;

    const {
      terminalPrompt,
      syncTerminalPrompt,
      ansiToHtml,
      terminalLog,
      clearTerminal,
      onTerminalKey,
      navigateTermHistory,
      cdrTraceReset,
      cdrTraceAdd,
      renderCdrTrace,
    } = createTerminalApi({
      sharedState,
      getIdeCtx: () => _ideCtx,
      terminalBusyRef,
      cdrTraceEntriesRef,
      cdrTraceStartedAtRef,
    });
    let _lspDiagUnsub      = null;
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
    const MAX_TAB_MSGS     = 120;
    const MAX_TAB_FC       = 40;

    function setStatus(text, type) {
      const dot = $('cdrStatusDot');
      const txt = $('cdrStatusText');
      if (txt) txt.textContent = text || 'Ready';
      if (dot) dot.className = 'cdr-status-dot' + (type ? ' ' + type : '');
    }

    function activeModelValue() {
      const H = window._H;
      return modelRef.current || H?.selectedModel?.() || '';
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
      if (mp) mp.value = modelRef.current || '';
      const label = mp?.options?.[mp.selectedIndex]?.text || shortModelLabel(modelRef.current);
      onCoderModelChanged(label, fromCoderPicker ?? !!modelRef.current);
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

    let _tabMgr;
    let _initFirstTab;
    let renderTabBar;
    let onTabSwitch;
    let onTabClose;
    let onTabNew;

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
      _tabMgr?.tabs.forEach(t => { t.running = false; });
    }

    function activeFileChanges() {
      return _runFileChanges || _fileChanges;
    }

    function wireTabManager() {
      ({
        _tabMgr,
        renderTabBar,
        onTabSwitch,
        onTabClose,
        onTabNew,
        _initFirstTab,
      } = createTabManager({
        $,
        esc,
        modelRef,
        TABS_KEY,
        MAX_TAB_MSGS,
        MAX_TAB_FC,
        cloneMsgForStorage,
        getConversationMsgs: () => _conversationMsgs,
        setConversationMsgs: (v) => { _conversationMsgs = v; },
        getFileChanges: () => _fileChanges,
        setFileChanges: (v) => { _fileChanges = v; },
        getAgentCount: () => agentCount,
        setAgentCount: (v) => { agentCount = v; },
        getRunAbort: () => runAbort,
        getRunTabId: () => _runTabId,
        abortActiveRun,
        saveCoderState,
        renderConversation,
        renderFileChangePills,
        updatePendingChangesHeader,
        applyCoderModelToUi,
        setStatus,
        saveCurrentSession,
        shortModelLabel,
        clearChatUI,
      }));
    }

    wireTabManager();

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
        if (navigateTermHistory(e, termInput)) return;
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
          modelRef.current = modelPicker.value || null;
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
      dest.value = modelRef.current || src.value || '';
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

    const {
      initExplorerContextMenu,
      openProject,
      openFile,
      clearFilesPanel,
      addAIFileToExplorer,
      renderExplorerTree,
      goToDefinition,
    } = createExplorerApi({
      sharedState,
      relativeFromRoot,
      getConversationMsgs: () => _conversationMsgs,
      getEditorPane: () => _editorPane,
      getIdeCtx: () => _ideCtx,
      setActiveFile,
      syncProjectLabel,
      onTabNew: () => onTabNew(),
      autoResize,
      terminalLog,
      terminalPrompt,
      syncTerminalPrompt,
      getSysPrompt: () => sysPrompt(),
      refreshGraphifyForProject,
      loadGraphifyContextForTask,
      clearGraphifyContext: () => { _graphifyContext = ''; },
      refreshGitStatus,
      saveCoderState,
      setStatus,
    });

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
        model: tab.model ?? modelRef.current ?? null,
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
      modelRef.current = session.model ?? null;
      const tab = _tabMgr.active();
      if (tab) {
        tab.title = session.title || tab.title;
        tab.model = modelRef.current;
        _tabMgr.save();
      }
      populateModelPicker();
      applyCoderModelToUi(!!modelRef.current);
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

    // ── Agent run loop (agent-run.js) ─────────────────────────
    ({
      buildTools,
      sysPrompt,
      agentLoop,
      expandTaskMentions,
      startRun,
      stopRun,
      runSingleTurn,
      runMultiTurn,
      runAllVote,
      runChainRefine,
    } = createAgentRunApi({
      $,
      esc,
      sharedState,
      modelRef,
      conversationMsgs: _conversationMsgs,
      fileChanges: _fileChanges,
      tabMgr: _tabMgr,
      getAgentCount: () => agentCount,
      MAX_CONCURRENT,
      getIdeCtx: () => _ideCtx,
      getGraphifyContext: () => _graphifyContext,
      getSkillsForPrompt: () => _skillsForPrompt,
      getRunAbort: () => runAbort,
      setRunAbort: (v) => { runAbort = v; },
      getRunGeneration: () => _runGeneration,
      bumpRunGeneration: () => ++_runGeneration,
      getRunTabId: () => _runTabId,
      setRunTabId: (v) => { _runTabId = v; },
      getRunFileChanges: () => _runFileChanges,
      setRunFileChanges: (v) => { _runFileChanges = v; },
      getActiveContentEl: () => activeContentEl,
      setActiveContentEl: (v) => { activeContentEl = v; },
      incDomScrollBatch: () => { _domScrollBatch++; },
      decDomScrollBatch: () => { _domScrollBatch--; },
      setStatus,
      cdrTraceAdd,
      cdrTraceReset,
      updateCoderContextChip,
      activeModelValue,
      appendThinking,
      appendToolBlock,
      finalizeToolBlock,
      scrollMessages,
      appendTextToBubble,
      appendUserMsg,
      appendAssistantBubble,
      enterChatLiveMode,
      autoResize,
      loadGraphifyContextForTask,
      renderTabBar,
      saveCoderState,
      enforceThreeWordName,
      addChangeEntry,
      addAIFileToExplorer,
      setChangeRowState,
      terminalLog,
      activeFileChanges,
      abortActiveRun,
      setRouterChip,
    }));


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
}
