/**
 * Composer extras — slash command palette and payload preview modal.
 */

/**
 * @param {object} deps
 */
export function createComposerExtrasApi(deps) {
  const {
    state,
    $,
    escapeHtml,
    input,
    sendBtn,
    slashPalette,
    previewModal,
    previewBody,
    previewMeta,
    modelEl,
    tempEl,
    tempVal,
    privacyLocalEl,
    rewriterEl,
    themedAlert,
    getActiveAgent,
    currentRoute,
    ROUTE_DEFS,
    tavilySearch,
    googleSearch,
    rewriteForSearch,
    runAgentTools,
    queryRAGMerged,
    buildOllamaMessages,
    currentPendingModelContent,
    getHistoryLimit,
    cloudModelLabel,
    openSettings,
    systemEl,
    openTemplates,
    fillTemplate,
    activeTemplate,
    insertAtComposer,
    setTab,
    newChat,
    exportConversation,
    updateRangeFill,
    saveSettings,
    toggleInjection,
    send,
    abort,
    updateContextIndicator,
    editPreviewEl,
  } = deps;

  let _previewPayload = null;

  const slashCommands = [
    { name: '/model', desc: 'Focus the model picker', run: () => modelEl.focus() },
    { name: '/compare', desc: 'Open side-by-side model comparison', run: () => setTab('split') },
    { name: '/clear', desc: 'Start a new chat', run: () => newChat() },
    { name: '/system', desc: 'Open system prompt settings', run: () => { openSettings(); systemEl.focus(); } },
    { name: '/export', desc: 'Export conversation as Markdown', run: () => exportConversation('markdown') },
    { name: '/json', desc: 'Export conversation as JSON', run: () => exportConversation('json') },
    { name: '/pdf', desc: 'Export conversation as PDF', run: () => exportConversation('pdf') },
    {
      name: '/temp',
      desc: 'Set temperature, e.g. /temp 0.3',
      run: (arg) => {
        const v = parseFloat(arg);
        if (Number.isFinite(v)) {
          tempEl.value = Math.max(0, Math.min(2, v));
          tempVal.textContent = tempEl.value;
          updateRangeFill();
          saveSettings();
        } else tempEl.focus();
      },
    },
    {
      name: '/privacy',
      desc: 'Toggle local-only privacy mode',
      run: () => {
        privacyLocalEl.checked = !privacyLocalEl.checked;
        privacyLocalEl.dispatchEvent(new Event('change'));
      },
    },
    { name: '/inject', desc: 'Toggle RAG and web context injection', run: () => toggleInjection() },
    { name: '/templates', desc: 'Open prompt template library', run: openTemplates },
    {
      name: '/template',
      desc: 'Use a saved prompt template',
      run: async () => {
        const t = activeTemplate();
        const text = await fillTemplate(t);
        if (text) insertAtComposer(text, true, input);
      },
    },
  ];

  function currentSlashQuery() {
    const val = input.value;
    if (!val.startsWith('/')) return null;
    return val.slice(1).trim().toLowerCase();
  }

  function filteredSlashCommands() {
    const q = currentSlashQuery();
    if (q == null) return [];
    const cmdPart = q.split(/\s+/)[0] || '';
    return slashCommands.filter((c) => c.name.slice(1).includes(cmdPart)).slice(0, 8);
  }

  function closeSlashPalette() {
    state.slashOpen = false;
    slashPalette.classList.remove('open');
    slashPalette.setAttribute('aria-hidden', 'true');
  }

  function renderSlashPalette() {
    const items = filteredSlashCommands();
    if (!items.length) {
      closeSlashPalette();
      return;
    }
    state.slashOpen = true;
    state.slashIndex = Math.max(0, Math.min(state.slashIndex, items.length - 1));
    slashPalette.innerHTML = items
      .map(
        (c, i) => `
      <button type="button" class="slash-item${i === state.slashIndex ? ' active' : ''}" data-slash="${escapeHtml(c.name)}">
        <span class="slash-name">${escapeHtml(c.name)}</span>
        <span class="slash-desc">${escapeHtml(c.desc)}</span>
      </button>`,
      )
      .join('');
    const rect = input.getBoundingClientRect();
    slashPalette.style.left = `${Math.max(12, rect.left)}px`;
    slashPalette.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
    slashPalette.classList.add('open');
    slashPalette.setAttribute('aria-hidden', 'false');
  }

  function runSlashCommand(commandName = null) {
    const items = filteredSlashCommands();
    const cmd = commandName ? slashCommands.find((c) => c.name === commandName) : items[state.slashIndex];
    if (!cmd) return false;
    const raw = input.value.trim();
    const arg = raw.replace(/^\/\S+\s*/, '');
    input.value = '';
    closeSlashPalette();
    Promise.resolve(cmd.run(arg)).catch((err) => {
      console.warn('[slash] command failed:', err);
      themedAlert(err?.message || String(err), 'Command');
    });
    input.dispatchEvent(new Event('input'));
    return true;
  }

  async function openPreviewModal() {
    previewBody.innerHTML = `<div class="preview-loading">Building payload… fetching live context</div>`;
    previewMeta.textContent = '';
    _previewPayload = null;
    previewModal.classList.add('open');

    const text = input.value.trim();
    let toolContext = null;
    const activeAgent = getActiveAgent();
    const route = currentRoute(text, !!(state.pendingImages?.length || state.pendingFiles?.length));
    const routeDef = route?.route ? ROUTE_DEFS[route.route] : null;
    const routeSearchMode = routeDef?.useSearch === true || routeDef?.useSearch === 'pubmed';

    try {
      if (activeAgent && activeAgent.tools?.length && routeSearchMode) {
        let searchQuery = null;
        if (rewriterEl?.value) searchQuery = await rewriteForSearch(text);
        toolContext = await runAgentTools(activeAgent, text, searchQuery);
      } else if (route?.route) {
        const def = routeDef;
        if (def?.useSearch === true) {
          const tav = await tavilySearch(text);
          if (tav && (tav.results.length || tav.answer)) {
            const parts = [];
            if (tav.answer) parts.push(tav.answer);
            if (tav.results.length) {
              parts.push(tav.results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n'));
            }
            toolContext = `Sources:\n${parts.join('\n\n')}`;
          } else {
            const goog = await googleSearch(text);
            if (goog && goog.length) {
              toolContext =
                `Sources:\n` + goog.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n');
            }
          }
        }
      }
    } catch (e) {
      console.warn('Preview tool fetch failed:', e);
    }

    const _previewIsExternal =
      modelEl.value.startsWith('cloud:') ||
      !!(route?.route && ROUTE_DEFS[route.route]?.backend === 'nvidia');
    const ragChunks = _previewIsExternal ? [] : await queryRAGMerged(text);
    if (ragChunks.length) {
      const ragBlock =
        `Background:\n` + ragChunks.map((c, i) => `${i + 1}. ${c.title}: ${c.text}`).join('\n\n');
      toolContext = toolContext ? `${toolContext}\n\n${ragBlock}` : ragBlock;
    }

    const messages = buildOllamaMessages();
    const pendingContent = currentPendingModelContent();
    if (pendingContent || state.pendingImages.length) {
      const pendingEntry = {
        role: 'user',
        content: pendingContent || 'Describe what you see in this image.',
        _pending: true,
      };
      if (state.pendingImages.length) {
        pendingEntry.images = state.pendingImages.map((i) => i.base64);
      }
      messages.push(pendingEntry);
    }
    if (toolContext) {
      const last = messages[messages.length - 1];
      if (last?.role === 'user') last.content = `${toolContext}\n\nQuestion: ${last.content}`;
      else messages.splice(messages.length - 1, 0, { role: 'system', content: toolContext });
    }

    _previewPayload = messages;

    const totalChars = JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content }))).length;
    const estTokens = Math.round(totalChars / 3.8);
    const historyMsgs = messages.filter((m) => m.role !== 'system' && !m._pending).length;
    const sysMsgs = messages.filter((m) => m.role === 'system').length;
    const hasPreviewAttachments = messages.some((m) =>
      /\[ATTACHED FILES - use this content when answering\]/.test(m.content || ''),
    );
    const numCtx = hasPreviewAttachments ? 16384 : getHistoryLimit() > 0 ? 8192 : 4096;

    previewMeta.textContent = `${messages.length} msg${messages.length !== 1 ? 's' : ''} · ~${estTokens.toLocaleString()} tokens`;

    let turnCounter = 0;
    const parts = [];

    parts.push(`<div class="preview-stats">
      <span>Memory: <b>${getHistoryLimit() === 0 ? 'Off' : getHistoryLimit() + ' turns'}</b></span>
      <span>History: <b>${historyMsgs} msg${historyMsgs !== 1 ? 's' : ''}</b></span>
      <span>System: <b>${sysMsgs}</b></span>
      <span>~Tokens: <b>${estTokens.toLocaleString()}</b></span>
      <span>num_ctx: <b>${numCtx.toLocaleString()}</b></span>
      <span>Model: <b>${cloudModelLabel(modelEl.value) || '—'}</b></span>
    </div>`);

    messages.forEach((m, i) => {
      const isPending = !!m._pending;
      const hasImg = m.images?.length;
      const imgNote = hasImg ? `\n\n[+ ${m.images.length} image(s) attached]` : '';

      if (isPending && i > 0) {
        parts.push(`<div class="preview-sep">Sending now</div>`);
      }

      let roleDisplay;
      let turnLabel;
      if (m.role === 'system') {
        roleDisplay = i === 0 ? 'System Prompt' : 'Tool / RAG Context';
        turnLabel = '';
      } else {
        turnCounter++;
        const which = isPending ? 'pending' : `turn ${turnCounter}`;
        roleDisplay = m.role === 'user' ? (isPending ? 'You · Pending' : 'You') : 'AI';
        turnLabel = which;
      }

      parts.push(`<div class="preview-msg role-${m.role}${isPending ? ' preview-pending' : ''}">
        <div class="preview-role-label">
          <span>${roleDisplay}${hasImg ? ' · 🖼' : ''}</span>
          <span class="preview-turn">${turnLabel}</span>
        </div>${escapeHtml(m.content)}${imgNote}</div>`);
    });

    previewBody.innerHTML = parts.join('');
  }

  function wireComposerExtras() {
    slashPalette?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-slash]');
      if (!b) return;
      runSlashCommand(b.dataset.slash);
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 240) + 'px';
      if (state.editing && editPreviewEl) {
        const compact = input.value.replace(/\s+/g, ' ').trim();
        editPreviewEl.textContent = compact ? compact.slice(0, 180) : '(empty message)';
      }
      updateContextIndicator?.();
      if (currentSlashQuery() != null) renderSlashPalette();
      else closeSlashPalette();
    });

    input.addEventListener('keydown', (e) => {
      if (state.slashOpen) {
        const items = filteredSlashCommands();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          state.slashIndex = (state.slashIndex + 1) % Math.max(1, items.length);
          renderSlashPalette();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          state.slashIndex = (state.slashIndex - 1 + Math.max(1, items.length)) % Math.max(1, items.length);
          renderSlashPalette();
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          runSlashCommand();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSlashPalette();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    sendBtn?.addEventListener('click', () => (state.streaming ? abort() : send()));
    $('newChatBtn')?.addEventListener('click', () => newChat());
    $('agentsNewChatBtn')?.addEventListener('click', () => newChat());

    $('previewClose')?.addEventListener('click', () => previewModal.classList.remove('open'));
    previewModal?.addEventListener('click', (e) => {
      if (e.target === previewModal) previewModal.classList.remove('open');
    });
    $('previewBtn')?.addEventListener('click', () => openPreviewModal());

    $('previewCopy')?.addEventListener('click', () => {
      if (!_previewPayload) return;
      const clean = _previewPayload.map(({ _pending, ...m }) => m);
      const json = JSON.stringify(clean, null, 2);
      const done = () => {
        const btn = $('previewCopy');
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = 'Copy JSON';
        }, 1800);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(json).then(done).catch(() => {});
      } else {
        const ta = document.createElement('textarea');
        ta.value = json;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          done();
        } catch {}
        document.body.removeChild(ta);
      }
    });
  }

  return {
    currentSlashQuery,
    filteredSlashCommands,
    renderSlashPalette,
    runSlashCommand,
    closeSlashPalette,
    openPreviewModal,
    wireComposerExtras,
  };
}
