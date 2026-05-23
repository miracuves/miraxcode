/**
 * Coder mode — tabbed chat sessions (Wave 12).
 */

export function createTabManager(ctx) {
  const {
    $,
    esc,
    modelRef,
    TABS_KEY,
    MAX_TAB_MSGS,
    MAX_TAB_FC,
    cloneMsgForStorage,
    getConversationMsgs,
    setConversationMsgs,
    getFileChanges,
    setFileChanges,
    getAgentCount,
    setAgentCount,
    getRunAbort,
    getRunTabId,
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
  } = ctx;

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
        compactionLedger: '',
      };
      this.tabs.push(tab);
      return tab;
    },
    active() { return this.tabs.find(t => t.id === this.activeId) || this.tabs[0]; },
    switchTo(id) {
      const prev = this.active();
      if (prev && prev.id !== id) {
        prev.msgs = getConversationMsgs();
        prev.fc = getFileChanges();
        prev.model = modelRef.current;
        window.CdrComposerAttachments?.syncToTab?.();
        prev.pendingImages = window.CdrComposerAttachments?.getSnapshot?.().images || [];
        prev.pendingFiles = window.CdrComposerAttachments?.getSnapshot?.().files || [];
        prev.agentCount = getAgentCount();
        prev.running = false;
      }
      const tab = this.tabs.find(t => t.id === id);
      if (!tab) return null;
      this.activeId = id;
      setConversationMsgs(tab.msgs || []);
      setFileChanges(tab.fc || []);
      modelRef.current = tab.model;
      window.CdrComposerAttachments?.loadFromTab?.(tab);
      setAgentCount(tab.agentCount || 1);
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
        setConversationMsgs(this.tabs[0].msgs);
        setFileChanges(this.tabs[0].fc);
        return;
      }
      const wasActive = this.activeId === id;
      this.tabs.splice(idx, 1);
      if (wasActive) {
        const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
        this.activeId = next.id;
        setConversationMsgs(next.msgs);
        setFileChanges(next.fc);
        modelRef.current = next.model;
        window.CdrComposerAttachments?.loadFromTab?.(next);
        setAgentCount(next.agentCount || 1);
      }
      this.save();
    },
    syncFromVars() {
      const tab = this.active();
      if (tab) {
        tab.msgs = getConversationMsgs();
        tab.fc = getFileChanges();
        tab.model = modelRef.current;
        window.CdrComposerAttachments?.syncToTab?.();
        tab.pendingImages = window.CdrComposerAttachments?.getSnapshot?.().images || [];
        tab.pendingFiles = window.CdrComposerAttachments?.getSnapshot?.().files || [];
        tab.agentCount = getAgentCount();
        tab.running = !!getRunAbort();
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
            previousContent: typeof fc.previousContent === 'string' ? fc.previousContent.slice(0, 12_000) : fc.previousContent,
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
          setConversationMsgs(active.msgs);
          setFileChanges(active.fc);
          modelRef.current = active.model;
          window.CdrComposerAttachments?.loadFromTab?.(active);
          setAgentCount(active.agentCount || 1);
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
      setConversationMsgs(tab.msgs);
      setFileChanges(tab.fc);
    }
  }

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
    if (getRunAbort()) abortActiveRun('Tab switched');
    saveCoderState();
    const tab = _tabMgr.switchTo(id);
    if (!tab) return;
    renderConversation();
    renderTabBar();
    renderFileChangePills();
    updatePendingChangesHeader();
    applyCoderModelToUi(!!modelRef.current);
    setStatus('Ready', '');
  }

  function onTabClose(id) {
    const tab = _tabMgr.tabs.find(t => t.id === id);
    if (!tab) return;
    if (tab.msgs.length && !window.confirm('Close "' + tab.title + '"? Chat history will be saved to sessions.')) return;
    if (getRunAbort() && tab.id === getRunTabId()) abortActiveRun('Tab closed');
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

  return {
    _tabMgr,
    renderTabBar,
    onTabSwitch,
    onTabClose,
    onTabNew,
    _initFirstTab,
  };
}
