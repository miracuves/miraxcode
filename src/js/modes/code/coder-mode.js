/**
 * CoderMode — full-screen IDE agent (Wave 11).
 */
import { $, esc, baseName, setExplorerRootLabel, setRouterChip } from './dom-utils.js';
import { injectAllToolBlocks } from './tool-blocks.js';
import { createAgentRunApi } from './agent-run.js';
import { createTabManager } from './tabs.js';
import { createTerminalApi } from './terminal.js';
import { createExplorerApi } from './explorer.js';
import { createSessionsApi, SESSIONS_KEY, MAX_SESSION_MSG_CHARS } from './sessions.js';
import { createChatUiApi } from './chat-ui.js';
import { createDomWiringApi } from './dom-wiring.js';
import { stopStatsPolling } from './stats-poll.js';

export function createCoderMode(deps) {
  const { sharedState, modelRef, relativeFromRoot } = deps;

  return (() => {
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
    const STATE_KEY        = 'hashui_coder_state';
    const TABS_KEY         = 'miraxcode_coder_tabs';
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
    let _powerWired        = false;
    const domListenerRefs  = {
      onTraceDocClick: null,
      onCoderKeydown: null,
      onSymbolKeydown: null,
      onModelsUpdated: null,
    };
    const domHooks         = {};
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
    let getChatVirtual;
    let enterChatLiveMode;
    let scrollMessages;
    let renderMarkdown;
    let renderConversation;
    let appendUserMsg;
    let appendAssistantBubble;
    let appendThinking;
    let appendToolBlock;
    let finalizeToolBlock;
    let appendTextToBubble;
    let clearChatUI;
    let saveCurrentSession;
    let renderSessions;
    let clearChat;
    let showChangeOverlay;
    let closeChangeOverlay;
    let enforceThreeWordName;
    let clearAllSessions;
    let _afterRenderConversation = () => {};

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
          onAcceptPendingChange: (path) => acceptPendingChangeForPath(path),
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
      domListenerRefs.onSymbolKeydown = (e) => {
        if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== 'o') return;
        if (!document.body.classList.contains('coder-mode')) return;
        e.preventDefault();
        const inp = $('cdrSymbolFilter');
        if (inp) { inp.focus(); inp.select(); }
        else HC?.guard?.notify?.('Open a project to scan symbols first', 'info');
      };
      document.addEventListener('keydown', domListenerRefs.onSymbolKeydown);
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
          onPick: (rel) => {
            const root = sharedState.projectRoot;
            if (!root || rel.endsWith('/')) return;
            const abs = `${root.replace(/\/$/, '')}/${rel}`;
            window.CdrComposerAttachments?.addPaths?.([abs]);
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
          { id: 'cdr-accept-all', group: 'Coder', label: 'Accept all pending file changes (⌘⇧Enter)', run: () => acceptAllPendingChanges(activeContentEl) },
          { id: 'cdr-accept-first', group: 'Coder', label: 'Accept first pending file change', run: () => {
            const row = document.querySelector('.cdr-change-row.pending');
            if (row) setChangeRowState(row, 'accepted');
          }},
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

    ({
      getChatVirtual,
      enterChatLiveMode,
      scrollMessages,
      renderMarkdown,
      renderConversation,
      appendUserMsg,
      appendAssistantBubble,
      appendThinking,
      appendToolBlock,
      finalizeToolBlock,
      appendTextToBubble,
      clearChatUI,
      buildUserMsgElement,
      buildAssistantMsgElement,
    } = createChatUiApi({
      getConversationMsgs: () => _conversationMsgs,
      getDomScrollBatch: () => _domScrollBatch,
      setActiveContentEl: (v) => { activeContentEl = v; },
      setStatus,
      autoResize,
      getRunAbort: () => runAbort,
      setRunAbort: (v) => { runAbort = v; },
      getRunGeneration: () => _runGeneration,
      bumpRunGeneration: () => ++_runGeneration,
      getRunTabId: () => _runTabId,
      setRunTabId: (v) => { _runTabId = v; },
      getRunFileChanges: () => _runFileChanges,
      setRunFileChanges: (v) => { _runFileChanges = v; },
      getFileChanges: () => _fileChanges,
      getTabMgr: () => _tabMgr,
      renderTabBar: () => renderTabBar?.(),
      getRunSingleTurn: () => runSingleTurn,
      abortActiveRun,
      incToolCallCounter: () => ++toolCallCounter,
      onAfterRenderConversation: () => _afterRenderConversation(),
    }));

    ({
      saveCurrentSession,
      renderSessions,
      clearChat,
      showChangeOverlay,
      closeChangeOverlay,
      enforceThreeWordName,
      clearAllSessions,
    } = createSessionsApi({
      modelRef,
      getTabMgr: () => _tabMgr,
      getConversationMsgs: () => _conversationMsgs,
      getFileChanges: () => _fileChanges,
      setActiveContentEl: (v) => { activeContentEl = v; },
      shortModelLabel,
      populateModelPicker,
      applyCoderModelToUi,
      renderTabBar: () => renderTabBar?.(),
      renderConversation,
      setStatus,
      clearChatUI,
      updateCoderContextChip,
    }));

    wireTabManager();

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

    async function acceptPendingChangeForPath(path) {
      if (!path) return;
      const rows = [...document.querySelectorAll('.cdr-change-row.pending')];
      const row = rows.find((r) => {
        const idx = parseInt(r.dataset.changeIdx, 10);
        const entry = _fileChanges[idx];
        return entry?.path === path;
      });
      if (row) await setChangeRowState(row, 'accepted');
    }

    function ingestStagedEntry(entry) {
      if (!entry || entry.status !== 'pending' || !entry.path) return;
      if (_fileChanges.some((e) => e.path === entry.path && e.status === 'pending')) return;
      addChangeEntry(entry.name, entry.path, entry.kind, entry.content, entry);
      if (entry.path && _editorPane) {
        _editorPane.syncPendingChanges(_fileChanges);
      }
    }

    function flushPendingStagedFromShared() {
      const pending = sharedState.pendingStaged;
      if (!Array.isArray(pending) || !pending.length) return;
      const batch = pending.splice(0, pending.length);
      for (const entry of batch) {
        if (entry?.status === 'pending') ingestStagedEntry(entry);
      }
      _tabMgr?.save?.();
    }

    function changeRowStats(entry) {
      if (entry?.kind === 'delete') {
        const prev = entry?.previousContent ?? '';
        const lines = prev ? (String(prev).match(/\n/g) || []).length + 1 : 0;
        return lines ? `−${lines} lines` : 'delete';
      }
      const proposed = entry?.proposedContent ?? entry?.content ?? '';
      const prev = entry?.previousContent ?? '';
      if (window.CdrDiffLines?.diffStats) {
        const rows = window.CdrDiffLines.diffLines(prev, proposed);
        const { added, removed } = window.CdrDiffLines.diffStats(rows);
        if (added || removed) return `+${added} −${removed}`;
      }
      const lineCount = proposed ? (String(proposed).match(/\n/g) || []).length + 1 : 0;
      return lineCount ? `+${lineCount} lines` : '';
    }

    function createChangeRowElement(entry, idx) {
      const row = document.createElement('div');
      const state = entry.status || 'pending';
      row.className = `cdr-change-row ${state}`;
      row.dataset.changeIdx = String(idx);
      row.innerHTML = `
        ${CHANGE_SVG.file}
        <span class="cdr-change-file">${esc(entry.name || entry.path)}</span>
        <span class="cdr-change-stats">${esc(changeRowStats(entry))}</span>
        <div class="cdr-change-actions">
          <button type="button" class="cdr-change-btn primary cdr-change-accept">${CHANGE_SVG.accept} Accept</button>
          <button type="button" class="cdr-change-btn danger cdr-change-reject">${CHANGE_SVG.reject} Reject</button>
          <button type="button" class="cdr-change-btn cdr-change-view">${CHANGE_SVG.view} View</button>
        </div>`;
      return row;
    }

    function rehydrateFileChangeRows() {
      if (!_fileChanges.length) return;
      let target = activeContentEl;
      if (!target) {
        target = $('cdrMessages')?.querySelector('.cdr-msg.assistant:last-of-type .cdr-msg-content');
      }
      if (!target) return;
      const wrap = getChangesWrap(target);
      if (!wrap) return;
      const existing = new Set(
        [...wrap.querySelectorAll('.cdr-change-row')].map((r) => r.dataset.changeIdx)
      );
      for (let idx = 0; idx < _fileChanges.length; idx++) {
        if (existing.has(String(idx))) continue;
        const entry = _fileChanges[idx];
        if (!entry) continue;
        wrap.appendChild(createChangeRowElement(entry, idx));
      }
      updateChangesBatchBar(target);
    }
    _afterRenderConversation = rehydrateFileChangeRows;

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
            await window.CdrFileStage.applyEntry(
              entry,
              (p, c, r) => HC.code.writeFile(p, c, r),
              (p, r) => HC.code.deleteFile(p, r)
            );
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
        const before = entry.previousContent ?? '';
        const after = entry.proposedContent ?? entry.content ?? '';
        const diffBody = window.CdrDiffLines?.formatDiffHtml
          ? window.CdrDiffLines.formatDiffHtml(before, after, esc, { maxLines: 240 })
          : esc(after);
        preview.innerHTML = `
          <div class="cdr-diff-header">
            <span>${esc(entry.name || entry.path)}</span>
            <span style="color:var(--cdr-text-muted)">${esc(changeRowStats(entry))}</span>
          </div>
          <div class="cdr-diff-body">${diffBody}</div>`;
        row.after(preview);
      }
      const open = preview.style.display !== 'block';
      preview.style.display = open ? 'block' : 'none';
      preview.classList.toggle('open', open);
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
      const row = createChangeRowElement(entry, idx);
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

    Object.assign(domHooks, {
      startRun,
      stopRun,
      goBack,
      clearChat,
      openFile,
      openProject,
      clearFilesPanel,
      showAuditLog,
      exportChat,
      renderSessions,
      refreshSystemPromptInConversation,
      onCoderModelChanged,
      onTerminalKey,
      navigateTermHistory,
      clearTerminal,
      closeChangeOverlay,
      onTabNew,
      autoResize,
      initExplorerContextMenu,
      wireChangeRowDelegation,
      populateModelPicker,
      applyCoderModelToUi,
      cdrTraceReset,
      renderCdrTrace,
      setAgentCount: (n) => { agentCount = n; },
      acceptAllPendingChanges: () => acceptAllPendingChanges(activeContentEl),
      acceptFirstPendingChange: () => {
        const row = document.querySelector('.cdr-change-row.pending');
        if (row) setChangeRowState(row, 'accepted');
      },
      flushPendingStaged: () => flushPendingStagedFromShared(),
    });

    const { mount, destroy, remount } = createDomWiringApi({
      sharedState,
      modelRef,
      sessionsKey: SESSIONS_KEY,
      hooks: domHooks,
      getTabMgr: () => _tabMgr,
      initFirstTab: _initFirstTab,
      syncProjectLabel,
      syncCoderGuardToggles,
      refreshCoderSkills,
      refreshGraphifyForProject,
      restoreCoderState,
      initCoderPowerFeatures,
      getConversationMsgs: () => _conversationMsgs,
      renderConversation,
      renderTabBar,
      renderFileChangePills,
      syncTerminalPrompt,
      updateCoderContextChip,
      abortActiveRun,
      incRunGeneration: () => { _runGeneration++; },
      getPowerWired: () => _powerWired,
      setPowerWired: (v) => { _powerWired = v; },
      getEditorPane: () => _editorPane,
      setEditorPane: (v) => { _editorPane = v; },
      getIdeCtx: () => _ideCtx,
      setIdeCtx: (v) => { _ideCtx = v; },
      getLspDiagUnsub: () => _lspDiagUnsub,
      setLspDiagUnsub: (v) => { _lspDiagUnsub = v; },
      setActiveContentEl: (v) => { activeContentEl = v; },
      listenerRefs: domListenerRefs,
      clearStatsPolling: stopStatsPolling,
    });

    return { mount, destroy, remount, ingestStagedEntry, flushPendingStagedFromShared };
  })();
}
