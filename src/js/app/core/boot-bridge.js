/**
 * End-of-boot shell: selection toolbar, shortcuts, `window._H`, command palette.
 */

export function initSelectionToolbar(deps) {
  const { input, send, isCodeMode } = deps;
  const toolbar = document.getElementById('selectionToolbar');
  const btnCopy = document.getElementById('stb-copy');
  const btnQuote = document.getElementById('stb-quote');
  const btnExplain = document.getElementById('stb-explain');
  const btnFix = document.getElementById('stb-fix');
  if (!toolbar) return;

  function getSelectedText() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    return sel.toString().trim();
  }

  function isInsideBubble(node) {
    while (node) {
      if (node.classList?.contains('bubble')) return true;
      node = node.parentNode;
    }
    return false;
  }

  function hideToolbar() {
    toolbar.classList.remove('visible');
  }

  function showToolbar() {
    const sel = window.getSelection();
    const text = getSelectedText();
    if (!text || sel.rangeCount === 0) { hideToolbar(); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) { hideToolbar(); return; }
    if (!isInsideBubble(range.commonAncestorContainer)) { hideToolbar(); return; }
    if (btnFix) btnFix.style.display = document.body.classList.contains('coder-mode') ? '' : 'none';
    toolbar.classList.add('visible');
    const tbRect = toolbar.getBoundingClientRect();
    let left = rect.left + (rect.width / 2) - (tbRect.width / 2);
    let top = rect.top - tbRect.height - 10;
    if (left < 8) left = 8;
    if (left + tbRect.width > window.innerWidth - 8) left = window.innerWidth - tbRect.width - 8;
    if (top < 8) top = rect.bottom + 10;
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  document.addEventListener('mouseup', () => {
    requestAnimationFrame(() => {
      if (getSelectedText()) showToolbar();
      else hideToolbar();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideToolbar(); window.getSelection()?.removeAllRanges(); }
  });
  document.addEventListener('mousedown', (e) => {
    if (!toolbar.contains(e.target)) hideToolbar();
  });

  btnCopy?.addEventListener('click', () => {
    const text = getSelectedText();
    if (text) navigator.clipboard.writeText(text).catch(() => {});
    hideToolbar();
  });

  btnQuote?.addEventListener('click', () => {
    const text = getSelectedText();
    if (text) {
      const quote = text.split('\n').map((l) => `> ${l}`).join('\n');
      input.value = (input.value ? `${input.value}\n\n` : '') + `${quote}\n\n`;
      input.focus();
    }
    hideToolbar();
  });

  btnExplain?.addEventListener('click', () => {
    const text = getSelectedText();
    if (text) {
      input.value = `Explain this:\n\n${text}`;
      input.focus();
      send();
    }
    hideToolbar();
  });

  btnFix?.addEventListener('click', () => {
    const text = getSelectedText();
    if (text) {
      input.value = `Fix or improve this code:\n\n\`\`\`\n${text}\n\`\`\``;
      input.focus();
      send();
    }
    hideToolbar();
  });
}

export function initGlobalShortcuts(deps) {
  const { state, setTab, newChat, modelEl, isCodeMode } = deps;
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (isCodeMode()) setTab(state._preCoderTab || 'chats');
      else setTab('code');
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      newChat();
      return;
    }
    if (e.key.toLowerCase() === 'k' && !e.shiftKey) {
      e.preventDefault();
      modelEl?.focus();
    }
  });
}

export function buildWindowH(api) {
  window._H = api;
}

export function initGlobalCommandPalette(deps) {
  const {
    newChat,
    exportConversation,
    setTab,
    applyPreset,
  } = deps;
  if (!window.MxCommandPalette) return;
  window.MxCommandPalette.registerMany([
    { id: 'mx-new-chat', group: 'Chat', label: 'New chat', run: () => newChat() },
    { id: 'mx-export-md', group: 'Chat', label: 'Export chat (Markdown)', run: () => exportConversation('markdown') },
    { id: 'mx-export-json', group: 'Chat', label: 'Export chat (JSON)', run: () => exportConversation('json') },
    { id: 'mx-chats', group: 'Modes', label: 'Go to Chats', run: () => setTab('chats') },
    { id: 'mx-coder', group: 'Modes', label: 'Go to Coder mode', run: () => setTab('code') },
    { id: 'mx-forge', group: 'Modes', label: 'Go to 3D Forge', run: () => setTab('forge') },
    { id: 'mx-finance', group: 'Modes', label: 'Go to Finance', run: () => setTab('finance') },
    { id: 'mx-compare', group: 'Modes', label: 'Go to Compare (split)', run: () => setTab('split') },
    { id: 'mx-agents', group: 'Modes', label: 'Go to Agents panel', run: () => setTab('agents') },
    { id: 'mx-free-ram', group: 'System', label: 'Free RAM — unload local models', run: () => applyPreset('freeRam') },
  ]);
}
