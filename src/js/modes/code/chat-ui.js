import { $, esc, setRouterChip } from './dom-utils.js';
import { TOOL_ICONS, TOOL_ICON_DEFAULT } from './constants.js';

/**
 * Coder chat panel: virtual scroll, bubbles, tool blocks, welcome screen.
 */
export function createChatUiApi(ctx) {
  const {
    getConversationMsgs,
    getDomScrollBatch,
    setActiveContentEl,
    setStatus,
    autoResize,
    getRunAbort,
    setRunAbort,
    getRunGeneration,
    bumpRunGeneration,
    getRunTabId,
    setRunTabId,
    getRunFileChanges,
    setRunFileChanges,
    getFileChanges,
    getTabMgr,
    renderTabBar,
    getRunSingleTurn,
    abortActiveRun,
    incToolCallCounter,
    onAfterRenderConversation,
  } = ctx;

  const MAX_RENDER_MSGS = 80;
  let _chatVirtual = null;
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
    if (getDomScrollBatch() > 0 && !force) return;
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
      const runAbort = getRunAbort();
      if (runAbort) return;
      const conversationMsgs = getConversationMsgs();
      for (let i = conversationMsgs.length - 1; i >= 0; i--) {
        if (conversationMsgs[i].role === 'assistant') { conversationMsgs.splice(i, 1); break; }
      }
      el.remove();
      const runBtn  = $('cdrRunBtn');
      const stopBtn = $('cdrStopBtn');
      if (runBtn)  runBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = '';
      const gen = bumpRunGeneration();
      if (getRunAbort()) abortActiveRun('Regen');
      const ac = new AbortController();
      setRunAbort(ac);
      const tabMgr = getTabMgr();
      setRunTabId(tabMgr?.active()?.id || null);
      setRunFileChanges(getFileChanges());
      const tab = tabMgr?.active();
      if (tab) { tab.running = true; renderTabBar(); }
      try {
        const runSingleTurn = getRunSingleTurn();
        if (runSingleTurn) await runSingleTurn(ac.signal);
      } catch (e) {
        if (e?.name !== 'AbortError') {
          setStatus(e?.message || 'Regen failed', 'err');
          console.error('[CoderMode] regen failed:', e);
        }
      } finally {
        if (gen !== getRunGeneration()) return;
        if (runBtn)  runBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';
        setRunAbort(null);
        setRunTabId(null);
        setRunFileChanges(null);
        setRouterChip('Auto', '');
        const at = tabMgr?.active();
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
    const id = incToolCallCounter();
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

  function clearChatUI() {
    setActiveContentEl(null);
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

  function renderConversation() {
    const msgs = $('cdrMessages');
    if (!msgs) return;
    const conversationMsgs = getConversationMsgs();
    const hidden = Math.max(0, conversationMsgs.length - MAX_RENDER_MSGS);
    const slice = hidden > 0 ? conversationMsgs.slice(-MAX_RENDER_MSGS) : conversationMsgs;
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
      onAfterRenderConversation?.();
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
    onAfterRenderConversation?.();
  }

  return {
    getChatVirtual,
    enterChatLiveMode,
    scrollMessages,
    renderMarkdown,
    buildUserMsgElement,
    buildAssistantMsgElement,
    renderConversation,
    appendUserMsg,
    appendAssistantBubble,
    appendThinking,
    appendToolBlock,
    finalizeToolBlock,
    appendTextToBubble,
    clearChatUI,
  };
}
