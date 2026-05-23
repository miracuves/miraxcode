import { $, esc } from './dom-utils.js';

export const SESSIONS_KEY = 'hc-coder-sessions';
export const MAX_SESSION_MSG_CHARS = 16_000;

/**
 * Past chats list, session restore, change preview overlay, clear chat.
 */
export function createSessionsApi(ctx) {
  const {
    modelRef,
    getTabMgr,
    getConversationMsgs,
    getFileChanges,
    setActiveContentEl,
    shortModelLabel,
    populateModelPicker,
    applyCoderModelToUi,
    renderTabBar,
    renderConversation,
    setStatus,
    clearChatUI,
    updateCoderContextChip,
  } = ctx;

  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch { return []; }
  }

  function saveSessions(sessions) {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 50))); } catch {}
  }

  function clearAllSessions() {
    try { localStorage.removeItem(SESSIONS_KEY); } catch {}
    renderSessions();
  }

  function enforceThreeWordName(raw) {
    const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 3).join(' ') || 'New Chat';
  }

  function saveCurrentSession(forTab) {
    const tabMgr = getTabMgr();
    const tab = forTab || tabMgr?.active();
    if (!tab) return;
    const conversationMsgs = getConversationMsgs();
    const msgs = forTab ? (tab.msgs || []) : conversationMsgs;
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
        if (e.target.closest('.cdr-session-actions')) return;
        const stored = loadSessions();
        if (!stored[idx]) return;
        restoreSession(stored[idx]);
      });
      const rn = item.querySelector('[data-act="rename"]');
      const dl = item.querySelector('[data-act="delete"]');
      if (rn) rn.addEventListener('click', (e) => { e.stopPropagation(); renameSession(idx); });
      if (dl) dl.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('Delete this saved chat?')) deleteSession(idx); });
    });
  }

  const renderSessionsList = renderSessions;

  function restoreSession(session) {
    if (!session?.msgs?.length) return;
    const conversationMsgs = getConversationMsgs();
    const fileChanges = getFileChanges();
    conversationMsgs.length = 0;
    session.msgs.forEach(m => conversationMsgs.push(m));
    fileChanges.length = 0;
    modelRef.current = session.model ?? null;
    const tabMgr = getTabMgr();
    const tab = tabMgr?.active();
    if (tab) {
      tab.title = session.title || tab.title;
      tab.model = modelRef.current;
      tabMgr.save();
    }
    populateModelPicker();
    applyCoderModelToUi(!!modelRef.current);
    renderTabBar();
    renderConversation();
    setStatus('Ready', '');
  }

  function showChangeOverlay(idx) {
    const entry = getFileChanges()[idx];
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
    const conversationMsgs = getConversationMsgs();
    const fileChanges = getFileChanges();
    conversationMsgs.length = 0;
    fileChanges.length = 0;
    setActiveContentEl(null);
    const tab = getTabMgr()?.active();
    if (tab) tab.compactionLedger = '';
    clearChatUI();
    getTabMgr()?.save();
    updateCoderContextChip([]);
  }

  return {
    loadSessions,
    saveSessions,
    clearAllSessions,
    enforceThreeWordName,
    saveCurrentSession,
    deleteSession,
    renameSession,
    renderSessions,
    renderSessionsList,
    restoreSession,
    showChangeOverlay,
    closeChangeOverlay,
    clearChat,
  };
}
