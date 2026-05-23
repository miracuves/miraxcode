/**
 * Sidebar chat list: CRUD, rename, search filter, conversation export.
 */

function stripReplyPrelude(text) {
  const raw = String(text || '');
  const parts = raw.split(/\n\n(?=[^>])/);
  if (parts.length > 1 && /^Replying to /.test(parts[0])) {
    return parts.slice(1).join('\n\n');
  }
  return raw;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

/**
 * @param {object} deps
 */
export function createChatSidebarApi(deps) {
  const {
    state,
    uid,
    escapeHtml,
    saveChats,
    saveCodeChats,
    saveForgeChats,
    chatBelongsToCurrentProject,
    chatsListEl,
    searchInput,
    exportBtn,
    exportMenu,
    modelEl,
    input,
    app,
    $,
    themedAlert,
    saveSettings,
    setActiveSub,
    isNarrow = () => typeof window !== 'undefined' && window.innerWidth < 900,
    wire = {},
  } = deps;

  function setActiveTitle(title) {
    wire.setActiveTitle?.(title);
  }

  const replyBanner = $('replyBanner');
  const editBanner = $('editBanner');

  function isCodeMode() {
    return state.tab === 'code';
  }

  function isForgeMode() {
    return state.tab === 'forge';
  }

  function activeChatList() {
    if (isCodeMode()) return state.codeChats;
    if (isForgeMode()) return state.forgeChats;
    return state.chats;
  }

  function saveActiveChatList() {
    if (isCodeMode()) saveCodeChats();
    else if (isForgeMode()) saveForgeChats();
    else saveChats();
  }

  function deriveTitle(messages) {
    const first = messages.find((m) => m.role === 'user' && m.content);
    if (!first) return 'New chat';
    const words = first.content.trim().replace(/\s+/g, ' ').split(' ');
    return words.length > 3 ? words.slice(0, 3).join(' ') + '…' : words.join(' ');
  }

  function clearComposerBanners() {
    if (replyBanner) replyBanner.classList.remove('visible');
    if (editBanner) editBanner.classList.remove('visible');
  }

  function resetComposerInput() {
    input.value = '';
    input.style.height = 'auto';
    wire.renderPending?.();
  }

  function persistCurrentChat() {
    const nonEmpty = state.messages.some(
      (m) =>
        (m.content && m.content.trim()) ||
        (m.images && m.images.length) ||
        (m.attachments && m.attachments.length)
    );
    if (!nonEmpty) return;

    const chatList = activeChatList();
    if (!state.currentChatId) state.currentChatId = uid();
    let chat = chatList.find((c) => c.id === state.currentChatId);
    const cleanMessages = state.messages
      .filter(
        (m) =>
          !(
            m.role === 'assistant' &&
            m === state.messages[state.messages.length - 1] &&
            state.streaming &&
            !m.content
          )
      )
      .map((m) => ({
        role: m.role,
        content: m.content || '',
        images: m.images ? m.images.slice() : undefined,
        attachments: m.attachments
          ? m.attachments.map((a) => (typeof a === 'object' ? { ...a } : a))
          : undefined,
        _imgBase64: m._imgBase64 ? m._imgBase64.slice() : undefined,
        durationMs: m.durationMs || undefined,
        _modelContent: m._modelContent || undefined,
        replyTo: m.replyTo || undefined,
        diffFrom: m.diffFrom || undefined,
        compare: m.compare ? JSON.parse(JSON.stringify(m.compare)) : undefined,
      }));
    if (!chat) {
      chat = {
        id: state.currentChatId,
        createdAt: Date.now(),
        title: deriveTitle(cleanMessages),
        messages: cleanMessages,
        updatedAt: Date.now(),
        model: modelEl.value,
        agentId: state.activeAgentId,
        projectId: state.currentProjectId,
      };
      chatList.unshift(chat);
    } else {
      chat.messages = cleanMessages;
      chat.updatedAt = Date.now();
      chat.model = modelEl.value || chat.model;
      chat.agentId = state.activeAgentId;
      chat.projectId = chat.projectId || state.currentProjectId;
      if (!chat.title || chat.title === 'New chat') chat.title = deriveTitle(cleanMessages);
      if (isCodeMode()) {
        state.codeChats = [chat, ...state.codeChats.filter((c) => c.id !== chat.id)];
      } else if (isForgeMode()) {
        state.forgeChats = [chat, ...state.forgeChats.filter((c) => c.id !== chat.id)];
      } else {
        state.chats = [chat, ...state.chats.filter((c) => c.id !== chat.id)];
      }
    }
    saveActiveChatList();
    renderChatList();
  }

  function newChat() {
    wire.abort?.();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.messages = [];
    state.currentChatId = null;
    state.pendingImages = [];
    state.pendingFiles = [];
    state.replyTo = null;
    state.editing = null;
    clearComposerBanners();
    resetComposerInput();
    setActiveTitle('New Conversation');
    setActiveSub(modelEl.value);
    wire.render?.();
    renderChatList();
    if (isNarrow()) app.classList.remove('open');
    input.focus();
  }

  function loadChat(id) {
    wire.abort?.();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const chatList = activeChatList();
    const chat = chatList.find((c) => c.id === id);
    if (!chat) return;
    state.currentChatId = id;
    state.messages = (chat.messages || []).map((m) => ({ ...m }));
    state.pendingImages = [];
    state.pendingFiles = [];
    state.replyTo = null;
    state.editing = null;
    clearComposerBanners();
    resetComposerInput();
    setActiveTitle(chat.title || 'Conversation');
    setActiveSub(chat.model || modelEl.value);
    if (chat.agentId !== undefined) {
      state.activeAgentId = chat.agentId;
      saveSettings();
      wire.renderActiveAgentChip?.();
    }
    wire.render?.();
    renderChatList();
    if (isNarrow()) app.classList.remove('open');
  }

  function deleteChat(id) {
    if (isCodeMode()) {
      state.codeChats = state.codeChats.filter((c) => c.id !== id);
      saveCodeChats();
    } else if (isForgeMode()) {
      state.forgeChats = state.forgeChats.filter((c) => c.id !== id);
      saveForgeChats();
    } else {
      state.chats = state.chats.filter((c) => c.id !== id);
      saveChats();
    }
    if (state.currentChatId === id) newChat();
    else renderChatList();
  }

  function renderChatList() {
    const chatList = activeChatList().filter(chatBelongsToCurrentProject);
    const q = (searchInput?.value || '').trim().toLowerCase();
    const filtered = q
      ? chatList.filter(
          (c) =>
            (c.title || '').toLowerCase().includes(q) ||
            (c.messages || []).some((m) => (m.content || '').toLowerCase().includes(q))
        )
      : chatList;

    chatsListEl.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'chats-empty';
      empty.textContent = q
        ? 'No matches.'
        : isCodeMode()
          ? 'No coding sessions in this project yet.'
          : isForgeMode()
            ? 'No 3D Forge sessions in this project yet.'
            : 'No chats in this project yet — start a new one.';
      chatsListEl.appendChild(empty);
      return;
    }
    filtered.forEach((chat) => {
      const row = document.createElement('div');
      row.className = 'chat-item' + (chat.id === state.currentChatId ? ' active' : '');
      const modelLabel = chat.model || '—';
      const ts = chat.createdAt || chat.updatedAt;
      const dateStr = ts
        ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
      row.innerHTML = `
        <span class="title-col">
          <span class="title-txt" title="${escapeHtml(chat.title || 'Untitled')}">${escapeHtml(chat.title || 'Untitled')}</span>
          <span class="model-tag">${escapeHtml(modelLabel)}</span>
        </span>
        ${dateStr ? `<span class="chat-date">${escapeHtml(dateStr)}</span>` : ''}
        <span class="ren" data-id="${chat.id}" title="Rename" tabindex="0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
        </span>
        <span class="del" data-id="${chat.id}" title="Delete" tabindex="0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </span>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.del') || e.target.closest('.ren')) return;
        loadChat(chat.id);
      });
      row.querySelector('.del').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
      });
      row.querySelector('.ren').addEventListener('click', (e) => {
        e.stopPropagation();
        const titleSpan = row.querySelector('.title-txt');
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.className = 'rename-input';
        renameInput.value = chat.title || '';
        renameInput.maxLength = 80;
        titleSpan.replaceWith(renameInput);
        renameInput.focus();
        renameInput.select();
        function commitRename() {
          const newTitle = renameInput.value.trim() || chat.title || 'Untitled';
          const list = activeChatList();
          const c = list.find((x) => x.id === chat.id);
          if (c) {
            c.title = newTitle;
            saveActiveChatList();
          }
          if (state.currentChatId === chat.id) setActiveTitle(newTitle);
          renderChatList();
        }
        renameInput.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            commitRename();
          }
          if (ev.key === 'Escape') renderChatList();
        });
        renameInput.addEventListener('blur', commitRename);
      });
      chatsListEl.appendChild(row);
    });
  }

  function slugifyTitle(title) {
    return (
      (title || 'conversation')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'conversation'
    );
  }

  function currentConversationSnapshot() {
    if (!state.messages.length) return null;
    const chat = activeChatList().find((c) => c.id === state.currentChatId);
    return {
      title: chat?.title || deriveTitle(state.messages) || 'New chat',
      model: modelEl.value || chat?.model || '',
      exportedAt: new Date().toISOString(),
      agentId: state.activeAgentId || null,
      messages: state.messages
        .filter(
          (m) =>
            !(
              state.streaming &&
              m === state.messages[state.messages.length - 1] &&
              m.role === 'assistant' &&
              !m.content
            )
        )
        .map((m) => ({
          role: m.role,
          content: m.content || '',
          replyTo: m.replyTo ? { ...m.replyTo } : undefined,
          attachments: m.attachments
            ? m.attachments.map((a) => (typeof a === 'object' ? { ...a } : a))
            : undefined,
          images: m.images ? m.images.slice() : undefined,
          durationMs: m.durationMs || undefined,
        })),
    };
  }

  function messageMarkdown(m) {
    const head = m.role === 'assistant' ? '## Assistant' : '## You';
    const body =
      m.role === 'user' ? stripReplyPrelude(m.content || '') : m.content || '';
    const parts = [head];
    if (m.replyTo) {
      parts.push(
        `> Replying to ${m.replyTo.role === 'assistant' ? 'assistant' : 'user'}: ${m.replyTo.preview || ''}`
      );
    }
    parts.push(body || '_(empty)_');
    if (m.attachments?.length) {
      parts.push(
        `Attachments: ${m.attachments.map((a) => (typeof a === 'string' ? a : a.name)).join(', ')}`
      );
    }
    if (m.images?.length) {
      parts.push(`Images: ${m.images.length}`);
    }
    return parts.join('\n\n');
  }

  function conversationToMarkdown(snapshot) {
    return [
      `# ${snapshot.title}`,
      snapshot.model ? `Model: \`${snapshot.model}\`` : '',
      `Exported: ${snapshot.exportedAt}`,
      '',
      ...snapshot.messages.map(messageMarkdown),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportConversation(format) {
    const snapshot = currentConversationSnapshot();
    if (!snapshot) {
      await themedAlert('No conversation to export yet.', 'Export');
      return;
    }
    const stem = slugifyTitle(snapshot.title);
    if (format === 'markdown') {
      downloadBlob(
        `${stem}.md`,
        new Blob([conversationToMarkdown(snapshot)], { type: 'text/markdown;charset=utf-8' })
      );
      return;
    }
    if (format === 'json') {
      downloadBlob(
        `${stem}.json`,
        new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' })
      );
      return;
    }
    if (format === 'pdf') {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) {
        await themedAlert('PDF library not loaded. Please restart the app.', 'PDF Export');
        return;
      }

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      const maxW = pageW - margin * 2;
      let y = margin;

      function addWrapped(text, x, startY, opts = {}) {
        const lines = doc.splitTextToSize(text, maxW);
        const lineH = opts.lineHeight || 14;
        const pageH = doc.internal.pageSize.getHeight();
        lines.forEach((line) => {
          if (startY + lineH > pageH - margin) {
            doc.addPage();
            startY = margin;
          }
          doc.text(line, x, startY, opts);
          startY += lineH;
        });
        return startY;
      }

      doc.setFontSize(18);
      doc.setTextColor(26, 18, 8);
      doc.setFont('helvetica', 'bold');
      y = addWrapped(snapshot.title || 'Conversation', margin, y, { lineHeight: 22 });
      y += 4;

      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      doc.setFont('helvetica', 'normal');
      const meta = `Model: ${snapshot.model || '—'}   ·   Exported: ${snapshot.exportedAt || ''}`;
      y = addWrapped(meta, margin, y, { lineHeight: 11 });
      y += 12;

      doc.setDrawColor(201, 169, 110);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 16;

      for (const m of snapshot.messages) {
        const role = m.role === 'assistant' ? 'AI' : 'You';
        const isAi = m.role === 'assistant';

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(isAi ? 122 : 26, isAi ? 78 : 58, isAi ? 16 : 92);
        const dur = m.durationMs ? `  (${formatDuration(m.durationMs)})` : '';
        y = addWrapped(role.toUpperCase() + dur, margin, y, { lineHeight: 11 });
        y += 4;

        let body =
          m.role === 'user' ? stripReplyPrelude(m.content || '') : m.content || '';
        body = body
          .replace(/```[\s\S]*?```/g, (match) =>
            match.replace(/```\w*\n?/g, '').replace(/```/g, '')
          )
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/#{1,6}\s+/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/>\s+/g, '')
          .replace(/\n{3,}/g, '\n\n');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(17, 17, 17);
        y = addWrapped(body, margin, y, { lineHeight: 13 });

        if (m.attachments?.length) {
          doc.setFontSize(8);
          doc.setTextColor(119, 119, 119);
          const attText =
            '📎 ' + m.attachments.map((a) => (typeof a === 'string' ? a : a.name)).join(', ');
          y = addWrapped(attText, margin, y, { lineHeight: 10 });
        }

        y += 14;

        if (y > doc.internal.pageSize.getHeight() - margin - 30) {
          doc.addPage();
          y = margin;
        }
      }

      doc.save(`${stem}.pdf`);
    }
  }

  function toggleExportMenu(force) {
    const open = force === undefined ? !exportMenu.classList.contains('open') : force;
    if (open && exportBtn) {
      const rect = exportBtn.getBoundingClientRect();
      exportMenu.style.setProperty('position', 'fixed', 'important');
      exportMenu.style.setProperty('top', rect.bottom + 8 + 'px', 'important');
      exportMenu.style.setProperty('right', window.innerWidth - rect.right + 'px', 'important');
      exportMenu.style.setProperty('left', 'auto', 'important');
      exportMenu.style.setProperty('z-index', '99999', 'important');
    } else {
      exportMenu.style.removeProperty('position');
      exportMenu.style.removeProperty('top');
      exportMenu.style.removeProperty('right');
      exportMenu.style.removeProperty('left');
      exportMenu.style.removeProperty('z-index');
    }
    exportMenu.classList.toggle('open', open);
    exportMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  exportBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExportMenu();
  });
  exportMenu?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-export]');
    if (!b) return;
    toggleExportMenu(false);
    exportConversation(b.dataset.export);
  });
  document.addEventListener('click', (e) => {
    if (!exportMenu?.classList.contains('open')) return;
    if (e.target.closest('.export-wrap')) return;
    toggleExportMenu(false);
  });

  return {
    isCodeMode,
    isForgeMode,
    activeChatList,
    saveActiveChatList,
    deriveTitle,
    persistCurrentChat,
    newChat,
    loadChat,
    deleteChat,
    renderChatList,
    exportConversation,
    toggleExportMenu,
  };
}
