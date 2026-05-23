import { $, setRouterChip } from './dom-utils.js';
import { startStatsPolling } from './stats-poll.js';

/**
 * Coder mode DOM mount/destroy and one-time event wiring.
 * Handlers are supplied via `hooks` (filled before first mount).
 */
export function createDomWiringApi(ctx) {
  const {
    sharedState,
    modelRef,
    sessionsKey: SESSIONS_KEY,
    hooks,
    getTabMgr,
    initFirstTab,
    syncProjectLabel,
    syncCoderGuardToggles,
    refreshCoderSkills,
    refreshGraphifyForProject,
    restoreCoderState,
    initCoderPowerFeatures,
    getConversationMsgs,
    renderConversation,
    renderTabBar,
    renderFileChangePills,
    syncTerminalPrompt,
    updateCoderContextChip,
    abortActiveRun,
    incRunGeneration,
    getPowerWired,
    setPowerWired,
    getEditorPane,
    setEditorPane,
    getIdeCtx,
    setIdeCtx,
    getLspDiagUnsub,
    setLspDiagUnsub,
    setActiveContentEl,
    listenerRefs,
    clearStatsPolling,
  } = ctx;

  let mounted = false;
  let _domWired = false;

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

    if (runBtn)            runBtn.addEventListener('click', () => hooks.startRun?.());
    if (stopBtn)           stopBtn.addEventListener('click', () => hooks.stopRun?.());
    if (backBtn)           backBtn.addEventListener('click', () => hooks.goBack?.());
    if (clearBtn)          clearBtn.addEventListener('click', () => hooks.clearChat?.());
    if (leftAddFileBtn)    leftAddFileBtn.addEventListener('click', () => hooks.openFile?.());
    if (leftAddFolderBtn)  leftAddFolderBtn.addEventListener('click', () => hooks.openProject?.());
    if (clearFilesBtn)     clearFilesBtn.addEventListener('click', () => hooks.clearFilesPanel?.());
    if (auditBtn)          auditBtn.addEventListener('click', () => hooks.showAuditLog?.());
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
        hooks.renderCdrTrace?.();
      });
      tracePanel.addEventListener('click', e => e.stopPropagation());
    }
    if (traceClear) traceClear.addEventListener('click', () => hooks.cdrTraceReset?.('Trace cleared'));
    listenerRefs.onTraceDocClick = () => $('cdrTracePanel')?.classList.remove('open');
    document.addEventListener('click', listenerRefs.onTraceDocClick);
    if (exportBtn)         exportBtn.addEventListener('click', () => hooks.exportChat?.());
    if (sessionsClearAll)  sessionsClearAll.addEventListener('click', async () => {
      try { localStorage.removeItem(SESSIONS_KEY); } catch {}
      hooks.renderSessions?.();
    });
    if (sessionsSearchEl)  sessionsSearchEl.addEventListener('input', () => hooks.renderSessions?.(sessionsSearchEl.value));

    const yoloEl = $('cdrYoloMode');
    const bypassEl = $('cdrBypassPerms');
    const skillsChip = $('cdrSkillsChip');
    if (yoloEl) {
      yoloEl.addEventListener('change', () => {
        HC?.guard?.setYoloMode?.(yoloEl.checked);
        syncCoderGuardToggles();
        hooks.refreshSystemPromptInConversation?.();
      });
    }
    if (bypassEl) {
      bypassEl.addEventListener('change', () => {
        if (yoloEl?.checked) return;
        HC?.guard?.setBypassPermissions?.(bypassEl.checked);
        syncCoderGuardToggles();
        hooks.refreshSystemPromptInConversation?.();
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
        hooks.onCoderModelChanged?.(mainModel.options[mainModel.selectedIndex]?.text || 'Auto', false);
      });
    }

    const termInput = $('cdrTerminalInput');
    const termClear = $('cdrTerminalClear');
    if (termInput) termInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { hooks.onTerminalKey?.(e); return; }
      if (hooks.navigateTermHistory?.(e, termInput)) return;
    });
    if (termClear) termClear.addEventListener('click', () => hooks.clearTerminal?.());

    const sessionsClearBtn = $('cdrSessionsClearBtn');
    if (sessionsClearBtn) sessionsClearBtn.addEventListener('click', () => {
      try { localStorage.removeItem(SESSIONS_KEY); } catch {}
      hooks.renderSessions?.();
    });

    const overlayClose = $('cdrChangeOverlayClose');
    if (overlayClose) overlayClose.addEventListener('click', () => hooks.closeChangeOverlay?.());
    const overlay = $('cdrChangeOverlay');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) hooks.closeChangeOverlay?.(); });

    const tabAddBtn = document.getElementById('cdrTabAdd');
    if (tabAddBtn) tabAddBtn.addEventListener('click', () => hooks.onTabNew?.());

    listenerRefs.onCoderKeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && document.getElementById('coder-mode-wrap')?.style.display !== 'none') {
        if (document.body.classList.contains('coder-mode')) {
          e.preventDefault();
          hooks.onTabNew?.();
        }
      }
    };
    document.addEventListener('keydown', listenerRefs.onCoderKeydown);

    hooks.renderSessions?.();
    hooks.initExplorerContextMenu?.();
    hooks.wireChangeRowDelegation?.();

    document.querySelectorAll('.cdr-welcome-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        if (!prompt || !taskInput) return;
        taskInput.value = prompt;
        hooks.autoResize?.(taskInput);
        taskInput.focus();
      });
    });

    document.querySelectorAll('.cdr-agent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cdr-agent-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        hooks.setAgentCount?.(parseInt(btn.dataset.agents, 10) || 1);
      });
    });

    listenerRefs.onCoderReviewKeys = (e) => {
      if (!document.body.classList.contains('coder-mode')) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'Enter' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        hooks.acceptAllPendingChanges?.();
        return;
      }
      if (e.key.toLowerCase() === 'y' && e.shiftKey && !e.altKey) {
        const row = document.querySelector('.cdr-change-row.pending');
        if (!row) return;
        e.preventDefault();
        hooks.acceptFirstPendingChange?.();
      }
    };
    document.addEventListener('keydown', listenerRefs.onCoderReviewKeys);

    if (taskInput) {
      taskInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); hooks.startRun?.(); }
      });
      taskInput.addEventListener('input', () => hooks.autoResize?.(taskInput));
    }

    hooks.populateModelPicker?.();
    window.CdrComposerAttachments?.mount?.({
      getTab: () => getTabMgr().active(),
      onChange: () => getTabMgr().save(),
    });
    listenerRefs.onModelsUpdated = () => hooks.populateModelPicker?.();
    document.addEventListener('miraxcode:models-updated', listenerRefs.onModelsUpdated);
    const modelPicker = $('cdrModelPicker');
    if (modelPicker) {
      modelPicker.addEventListener('change', () => {
        modelRef.current = modelPicker.value || null;
        hooks.applyCoderModelToUi?.(true);
      });
    }
    startStatsPolling();
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    const tabMgr = getTabMgr();
    const loaded = tabMgr.load();
    if (!loaded) initFirstTab();
    wireDom();
    window.CdrComposerAttachments?.loadFromTab?.(tabMgr.active());
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
    const msgs = getConversationMsgs();
    if (msgs.length) renderConversation();
    hooks.flushPendingStaged?.();
    renderTabBar();
    renderFileChangePills();
    syncTerminalPrompt();
    updateCoderContextChip(msgs);
  }

  function remount() {
    hooks.populateModelPicker?.();
    hooks.renderSessions?.();
    hooks.flushPendingStaged?.();
    renderTabBar();
  }

  function destroy() {
    mounted = false;
    incRunGeneration();
    abortActiveRun('Coder unmounted');
    clearStatsPolling?.();
    if (listenerRefs.onTraceDocClick) {
      document.removeEventListener('click', listenerRefs.onTraceDocClick);
      listenerRefs.onTraceDocClick = null;
    }
    if (listenerRefs.onCoderKeydown) {
      document.removeEventListener('keydown', listenerRefs.onCoderKeydown);
      listenerRefs.onCoderKeydown = null;
    }
    if (listenerRefs.onSymbolKeydown) {
      document.removeEventListener('keydown', listenerRefs.onSymbolKeydown);
      listenerRefs.onSymbolKeydown = null;
    }
    if (listenerRefs.onModelsUpdated) {
      document.removeEventListener('miraxcode:models-updated', listenerRefs.onModelsUpdated);
      listenerRefs.onModelsUpdated = null;
    }
    _domWired = false;
    setPowerWired(false);
    const pane = $('cdrEditorPane');
    if (pane) pane._wired = false;
    const unsub = getLspDiagUnsub();
    unsub?.();
    setLspDiagUnsub(null);
    setIdeCtx(null);
    window.CdrMarkdown?.terminate?.();
    getEditorPane()?.dispose?.();
    setEditorPane(null);
    setActiveContentEl(null);
  }

  return { mount, destroy, remount, wireDom };
}
