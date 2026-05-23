/**
 * Virtual OS desktop shell — icons, dock, header, model selects (Wave 13).
 */
import { esc } from './utils.js';

export const SYSTEM_ICON_FINDER = '__system_finder__';
export const SYSTEM_ICON_SETTINGS = '__system_settings__';
export const SYSTEM_ICON_TRASH = '__system_trash__';

function folderSvg() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#69b7ff" d="M6 18.5c0-4 3.2-7.2 7.2-7.2h12.5c2 0 3.5.6 5 2.1l3.1 3.1h17c4 0 7.2 3.2 7.2 7.2v2.1H6v-7.3Z"/><path fill="#4aa3ff" d="M6 24.5h52v22.3c0 4-3.2 7.2-7.2 7.2H13.2c-4 0-7.2-3.2-7.2-7.2V24.5Z"/><path fill="rgba(255,255,255,.34)" d="M10 25h44v3H10z"/></svg>`;
}

function fileSvg() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#f7fbff" d="M15 5h24l13 13v36.5A4.5 4.5 0 0 1 47.5 59h-33a4.5 4.5 0 0 1-4.5-4.5v-45A4.5 4.5 0 0 1 15 5Z"/><path fill="#d8e8f7" d="M39 5v12.5c0 2.5 2 4.5 4.5 4.5H52L39 5Z"/><path fill="#58c7e8" d="M20 32h24v4H20zm0 9h24v4H20zm0 9h15v4H20z"/></svg>`;
}

function finderSvg() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="57" rx="21" ry="4.5" fill="#000000" opacity=".34"/>
      <rect x="8" y="9" width="48" height="44" rx="8" fill="#162337"/>
      <path d="M16 9h32a8 8 0 0 1 8 8v4H8v-4a8 8 0 0 1 8-8Z" fill="#c7d0da"/>
      <path d="M16 9h32a8 8 0 0 1 7.2 4.5H8.8A8 8 0 0 1 16 9Z" fill="#f7f9fb" opacity=".72"/>
      <rect x="11" y="19" width="42" height="31" rx="5" fill="#0a0f18"/>
      <path d="M12 19h40v7H12z" fill="#253145"/>
      <circle cx="17" cy="15" r="1.7" fill="#ff5f57"/><circle cx="22.5" cy="15" r="1.7" fill="#ffbd2e"/><circle cx="28" cy="15" r="1.7" fill="#28c840"/>
      <rect x="16" y="28" width="32" height="4" rx="2" fill="#dbe8f3" opacity=".9"/>
      <rect x="16" y="35" width="25" height="3.1" rx="1.55" fill="#8fa4ba" opacity=".78"/>
      <rect x="16" y="41" width="29" height="3.1" rx="1.55" fill="#61758a" opacity=".72"/>
      <path d="M12 49c8-2.1 21-2.1 40-1" stroke="#ffffff" stroke-width="1.1" opacity=".16" stroke-linecap="round"/>
      <path d="M11 11.5h40" stroke="#ffffff" stroke-width="1.2" opacity=".7" stroke-linecap="round"/>
    </svg>`;
}

function settingsSvg() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="58" rx="20" ry="4.2" fill="#000000" opacity=".36"/>
      <path d="m37 6.5 2.3 7.2c1.3.4 2.6.9 3.8 1.6l6.8-3.5 6.4 6.4-3.5 6.8c.7 1.2 1.2 2.5 1.6 3.8l7.2 2.3v9.1l-7.2 2.3c-.4 1.3-.9 2.6-1.6 3.8l3.5 6.8-6.4 6.4-6.8-3.5c-1.2.7-2.5 1.2-3.8 1.6L37 64.8h-9.1l-2.3-7.2a22 22 0 0 1-3.8-1.6L15 59.5l-6.4-6.4 3.5-6.8a22 22 0 0 1-1.6-3.8l-7.2-2.3v-9.1l7.2-2.3c.4-1.3.9-2.6 1.6-3.8l-3.5-6.8 6.4-6.4 6.8 3.5c1.2-.7 2.5-1.2 3.8-1.6l2.3-7.2H37Z" fill="#c7ced7"/>
      <path d="m36.4 8.5 2.1 6.5c1.5.4 3 1 4.3 1.8l6.2-3.2 5.1 5.1-3.2 6.2c.8 1.3 1.4 2.8 1.8 4.3l6.5 2.1v7.2l-6.5 2.1a20 20 0 0 1-1.8 4.3l3.2 6.2-5.1 5.1-6.2-3.2a20 20 0 0 1-4.3 1.8l-2.1 6.5h-7.2L27.1 55a20 20 0 0 1-4.3-1.8l-6.2 3.2-5.1-5.1 3.2-6.2a20 20 0 0 1-1.8-4.3l-6.5-2.1v-7.2l6.5-2.1c.4-1.5 1-3 1.8-4.3l-3.2-6.2 5.1-5.1 6.2 3.2c1.3-.8 2.8-1.4 4.3-1.8l2.1-6.5h7.2Z" fill="#87919d"/>
      <path d="M18 15.4 15.4 18M49.5 18.3l-3-2.8M56.6 35H52M12 35H7.4M22.7 54.3l1.7-3.8M41.8 50.5l1.8 3.8" stroke="#ffffff" stroke-width="1.4" opacity=".44" stroke-linecap="round"/>
      <circle cx="32.4" cy="34.9" r="15.2" fill="#59636f"/>
      <circle cx="32.4" cy="34.9" r="9.1" fill="#1e2630"/>
      <circle cx="28" cy="28.5" r="10" fill="#ffffff" opacity=".2"/>
      <path d="M21.5 24c5.1-6 14.5-7.3 21-2.2" stroke="#ffffff" stroke-width="1.6" opacity=".36" stroke-linecap="round"/>
    </svg>`;
}

function trashSvg(full = false) {
  const contents = full
    ? `<path d="M21 33h22l-2.2 18H23.2L21 33Z" fill="#9ec3e9" opacity=".52"/><path d="M25 39h14M26 44h11" stroke="#577ca9" stroke-width="2" stroke-linecap="round" opacity=".78"/>`
    : '';
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="58" rx="18.5" ry="4.2" fill="#000000" opacity=".34"/>
      <path d="M17.5 20.5h29L43.2 55H20.8L17.5 20.5Z" fill="#c8d1da"/>
      <path d="M21.2 23h21.6L40.4 52H23.6L21.2 23Z" fill="#f8fbff" opacity=".36"/>
      <path d="M32 20.5h14.5L43.2 55H32Z" fill="#6f7b87" opacity=".42"/>
      ${contents}
      <path d="M16 20.5h32M24.4 20.5l2.5-7h10.2l2.5 7" fill="none" stroke="#3d4650" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M26.8 27.5 28 49M37.2 27.5 36 49" stroke="#65707c" stroke-width="2.3" stroke-linecap="round"/>
      <path d="M21.7 21.8h20.6" stroke="#ffffff" stroke-width="1.4" opacity=".78" stroke-linecap="round"/>
      <path d="M23.4 25c1.6 8.8 1.8 17.1.8 25.8" stroke="#ffffff" stroke-width="1.2" opacity=".25" stroke-linecap="round"/>
    </svg>`;
}

/** @param {(id: string) => HTMLElement|null} $ */
export function clampDesktopPosition($, pos) {
  const desktop = $('voidDesktop');
  const maxX = Math.max(8, (desktop?.clientWidth || window.innerWidth || 640) - 98);
  const maxY = Math.max(8, (desktop?.clientHeight || window.innerHeight || 480) - 96);
  return {
    x: Math.max(8, Math.min(maxX, Number(pos?.x) || 8)),
    y: Math.max(8, Math.min(maxY, Number(pos?.y) || 8)),
  };
}

/**
 * @param {object} ctx
 */
export function createVoidDesktopApi(ctx) {
  const {
    $,
    nowIso,
    log,
    state,
    ROOT_ID,
    TRASH_ID,
    getSelectedId,
    setSelectedId,
    getSelectedSystemIconId,
    setSelectedSystemIconId,
    getForceEditMode,
    getItem,
    childrenOf,
    visibleProjectFiles,
    trashedProjectFiles,
    saveProject,
    rebuildPaths,
    canMoveToParent,
    moveItemToParent,
    getDragItem,
    getDragOrigin,
    hasDragType,
    getDragOffset,
    setDragOffset,
    deleteItemDirect,
    openFinderTool,
    openVoidSettings,
    openTrash,
    openFolder,
    openEditor,
    selectItem,
    handleUpload,
    renderAll,
  } = ctx;

  const clamp = (pos) => clampDesktopPosition($, pos);

  function fileIcon(item) {
    if (item.type === 'folder') return 'folder';
    const ext = item.name.split('.').pop().toLowerCase();
    if (/^(html|css|js|ts|tsx|jsx|json|md|py|sql|env|yml|yaml)$/.test(ext)) return ext;
    return 'file';
  }

  function renderModelSelect() {
    const src = document.getElementById('model');
    const selects = [$('voidGodModelSelect'), $('voidChatModelSelect')].filter(Boolean);
    if (!src || !selects.length) return;
    const options = Array.from(src.options)
      .map(o => `<option value="${esc(o.value)}"${o.disabled ? ' disabled' : ''}>${esc(o.textContent)}</option>`)
      .join('');
    selects.forEach(sel => {
      const current = sel.value || src.value;
      sel.innerHTML = options || '<option value="">No agent models available</option>';
      if (current) sel.value = current;
      if (!sel.value && src.value) sel.value = src.value;
    });
  }

  function availableModelOptions() {
    const src = document.getElementById('model');
    return Array.from(src?.options || [])
      .map(o => ({ value: o.value, label: o.textContent || o.value, disabled: o.disabled || !o.value }))
      .filter(o => !o.disabled && o.value && !/^[-—]/.test(o.label));
  }

  function modelStrengthScore(opt, role = 'worker') {
    const text = `${opt.value} ${opt.label}`.toLowerCase();
    let score = 0;
    const add = (rx, n) => { if (rx.test(text)) score += n; };
    add(/qwen.*(480b|235b|230b|coder|max|plus)|qwen3.*(235b|230b|30b|coder)|qwq/i, 170);
    add(/480b|235b|230b|405b/i, 120);
    add(/405b|480b|235b|230b|120b|70b|large|pro|r1|deepseek|qwen3 coder|gpt oss 120|nemotron 3 super|maverick|hermes/i, 80);
    add(/llama.*70b|deepseek.*llama.*70b/i, -35);
    add(/32b|30b|26b|17b|scout|versatile/i, 38);
    add(/8b|9b|12b|20b|flash|instant|lite|nano|small/i, -12);
    add(/embedding|rerank|moderation|vision|image|tts|whisper/i, -1000);
    if (opt.value.startsWith('cloud:')) score += role === 'god' ? 18 : 10;
    if (/gemini.*pro|openrouter|samba|cerebras|groq|minimax|glm|nvidia/i.test(text)) score += 12;
    return score;
  }

  function isSmallModelOption(opt) {
    const text = `${opt?.value || ''} ${opt?.label || ''}`.toLowerCase();
    if (/embedding|rerank|moderation|vision|image|tts|whisper/i.test(text)) return true;
    if (/llama.*70b|deepseek.*llama.*70b/i.test(text)) return true;
    return /(?:^|[^0-9])(8b|9b|12b|17b|20b|26b|30b|32b)(?:[^0-9]|$)|flash|instant|lite|nano|small|mini|scout|versatile/i.test(text);
  }

  function isLargeFallbackModel(opt, role = 'worker') {
    if (!opt?.value || isSmallModelOption(opt)) return false;
    const text = `${opt.value} ${opt.label}`.toLowerCase();
    return modelStrengthScore(opt, role) >= 90 ||
      /qwen.*(480b|235b|230b|coder|max|plus)|480b|235b|230b|405b|120b|gpt[-_\s]*oss[-_\s]*120|deepseek.*r1|gemini.*pro/i.test(text);
  }

  function autoAssignModels() {
    const opts = availableModelOptions();
    if (!opts.length) {
      log('No model options available to auto assign.', 'warn');
      return;
    }
    const largeOpts = opts.filter(o => isLargeFallbackModel(o, 'god'));
    if (!largeOpts.length) {
      log('No large God Agent model is available; refusing to auto-route to small models.', 'warn');
      return;
    }
    const godPick = largeOpts.slice().sort((a, b) => modelStrengthScore(b, 'god') - modelStrengthScore(a, 'god'))[0];
    if ($('voidGodModelSelect')) $('voidGodModelSelect').value = godPick.value;
    log(`God Agent assigned ${godPick.label}`, 'ok');
  }

  function chooseWorkerModel() {
    const opts = availableModelOptions();
    if (!opts.length) return $('voidGodModelSelect')?.value || '';
    const largeOpts = opts.filter(o => isLargeFallbackModel(o, 'worker'));
    if (!largeOpts.length) {
      log('No large worker model is available; refusing to auto-route to small models.', 'warn');
      return '';
    }
    const godValue = $('voidGodModelSelect')?.value || '';
    return largeOpts
      .slice()
      .sort((a, b) => {
        const aScore = modelStrengthScore(a, 'worker') + (a.value === godValue ? -6 : 0);
        const bScore = modelStrengthScore(b, 'worker') + (b.value === godValue ? -6 : 0);
        return bScore - aScore;
      })[0]?.value || godValue;
  }

  function defaultSystemIconPosition(index) {
    return { x: 26 + index * 92, y: 30 };
  }

  function systemIconPosition(id, index = 0) {
    return state.activeProject?.systemIconPositions?.[id] || defaultSystemIconPosition(index);
  }

  function systemDesktopIcons() {
    const trashCount = trashedProjectFiles().filter(f => f.trashRoot).length;
    return [
      { id: SYSTEM_ICON_FINDER, name: 'Finder', glyph: finderSvg(), action: openFinderTool },
      { id: SYSTEM_ICON_SETTINGS, name: 'Settings', glyph: settingsSvg(), action: openVoidSettings },
      { id: SYSTEM_ICON_TRASH, name: trashCount ? `Trash (${trashCount})` : 'Trash', glyph: trashSvg(trashCount > 0), action: openTrash },
    ].map((icon, index) => ({ ...icon, ...systemIconPosition(icon.id, index) }));
  }

  function setSystemIconDrag(e, iconId) {
    e.dataTransfer.setData('application/x-void-system-icon', iconId);
    e.dataTransfer.setData('application/x-void-drag-origin', 'desktop');
    setDragOffset(e, e.currentTarget);
    e.dataTransfer.effectAllowed = 'move';
  }

  function getSystemIconDrag(e) {
    return e.dataTransfer.getData('application/x-void-system-icon') || '';
  }

  async function moveSystemIcon(iconId, desktopPosition) {
    if (!state.activeProject || ![SYSTEM_ICON_FINDER, SYSTEM_ICON_SETTINGS, SYSTEM_ICON_TRASH].includes(iconId)) return false;
    state.activeProject.systemIconPositions = state.activeProject.systemIconPositions || {};
    state.activeProject.systemIconPositions[iconId] = clamp(desktopPosition);
    await saveProject();
    setSelectedSystemIconId(iconId);
    setSelectedId('');
    return true;
  }

  function setupDesktopIconDrag(el, onDropFn) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const desktop = $('voidDesktop');
      const box = desktop.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startL = parseFloat(el.style.left) || 0;
      const startT = parseFloat(el.style.top) || 0;
      let moved = false;

      function onMove(me) {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        moved = true;
        el.classList.add('void-icon-dragging');
        el.style.left = Math.max(8, Math.min(box.width - 88, startL + dx)) + 'px';
        el.style.top = Math.max(8, Math.min(box.height - 88, startT + dy)) + 'px';
      }

      async function onUp(ue) {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.classList.remove('void-icon-dragging');
        if (!moved) return;
        el._didDrag = true;
        const finalX = parseFloat(el.style.left) || startL;
        const finalY = parseFloat(el.style.top) || startT;
        el.style.pointerEvents = 'none';
        const under = document.elementFromPoint(ue.clientX, ue.clientY);
        el.style.pointerEvents = '';
        await onDropFn(under, finalX, finalY);
      }

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    });
  }

  function selectSystemIcon(id) {
    setSelectedSystemIconId(id);
    setSelectedId('');
    renderAll();
  }

  function clearDesktopSelection() {
    if (!getSelectedId() && !getSelectedSystemIconId()) return;
    setSelectedId('');
    setSelectedSystemIconId('');
    renderAll();
  }

  function renderDock() {
    const dlBtn = $('voidDownloadFolderBtn');
    if (!dlBtn) return;
    const sel = getSelectedId() ? getItem(getSelectedId()) : null;
    const inTrash = state.activeFolderId === TRASH_ID || !!getItem(state.activeFolderId)?.deletedAt;
    const isFolder = sel?.type === 'folder' && !sel.deletedAt;
    dlBtn.disabled = !isFolder;
    dlBtn.title = isFolder
      ? `Download "${sel.name}" as ZIP`
      : 'Select a folder to download it as ZIP';
    const deleteBtn = $('voidDeleteSelectedBtn');
    if (deleteBtn) {
      deleteBtn.textContent = sel?.deletedAt ? 'Delete Forever' : 'Delete';
      deleteBtn.title = sel?.deletedAt ? 'Permanently delete selected item' : 'Move selected file or folder to Trash';
    }
    const deleteAllBtn = $('voidDeleteAllBtn');
    if (deleteAllBtn) {
      deleteAllBtn.textContent = inTrash ? 'Empty Trash' : 'Delete All';
      deleteAllBtn.title = inTrash ? 'Permanently delete every item in Trash' : 'Move all files and folders to Trash';
    }
    ['voidCreateFileBtn', 'voidCreateFolderBtn', 'voidUploadFolderBtn'].forEach(id => {
      const btn = $(id);
      if (btn) btn.disabled = inTrash;
    });
  }

  function renderEditMode() {
    const btn = $('voidEditModeBtn');
    if (!btn) return;
    const selectedId = getSelectedId();
    const forceEditMode = getForceEditMode();
    const target = selectedId ? getItem(selectedId) : (state.activeFolderId !== ROOT_ID ? getItem(state.activeFolderId) : null);
    btn.classList.toggle('active', forceEditMode);
    btn.textContent = forceEditMode ? 'Editing' : 'Edit';
    btn.title = forceEditMode
      ? target
        ? `Edit Mode on: sending context for /${target.path}`
        : 'Edit Mode on: sending existing project context'
      : 'Turn on to send existing project context for edits';
  }

  function updateVoidClock() {
    const clock = $('voidClock');
    if (clock) {
      clock.textContent = new Date()
        .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
        .toUpperCase();
    }
  }

  function renderHeader() {
    const activeItems = visibleProjectFiles();
    const fileCount = activeItems.filter(f => f.type === 'file').length;
    const folderCount = activeItems.filter(f => f.type === 'folder').length;
    const stats = $('voidDesktopStats');
    if (stats) {
      stats.textContent = fileCount || folderCount
        ? `${fileCount} file${fileCount !== 1 ? 's' : ''} · ${folderCount} folder${folderCount !== 1 ? 's' : ''}`
        : '';
    }
    const folder = state.activeFolderId === ROOT_ID || state.activeFolderId === TRASH_ID ? null : getItem(state.activeFolderId);
    const pathEl = $('voidPath');
    if (pathEl) pathEl.textContent = state.activeFolderId === TRASH_ID ? '/Trash' : '/' + (folder?.path || '');
    updateVoidClock();
  }

  function renderDesktop() {
    const host = $('voidDesktop');
    if (!host) return;
    const selectedId = getSelectedId();
    const selectedSystemIconId = getSelectedSystemIconId();
    const visibleItems = childrenOf(ROOT_ID);
    $('voidEmptyDesktop').style.display = 'none';
    host.querySelectorAll('.void-desktop-icon').forEach(n => n.remove());
    systemDesktopIcons().forEach(icon => {
      const el = document.createElement('button');
      el.className = `void-desktop-icon system ${selectedSystemIconId === icon.id ? 'selected' : ''}`;
      el.style.left = `${icon.x}px`;
      el.style.top = `${icon.y}px`;
      el.dataset.systemIcon = icon.id;
      el.innerHTML = `<span class="void-file-glyph system">${icon.glyph}</span><b>${esc(icon.name)}</b>`;
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (el._didDrag) { el._didDrag = false; return; }
        selectSystemIcon(icon.id);
      });
      el.addEventListener('dblclick', icon.action);
      setupDesktopIconDrag(el, async (under, finalX, finalY) => {
        if (await moveSystemIcon(icon.id, { x: finalX, y: finalY })) renderAll();
      });
      if (icon.id === SYSTEM_ICON_TRASH) {
        el.addEventListener('dragover', e => {
          const dragged = getDragItem(e);
          if (dragged && !dragged.deletedAt) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('drop-target');
          }
        });
        el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
        el.addEventListener('drop', async e => {
          const dragged = getDragItem(e);
          if (!dragged || dragged.deletedAt) return;
          e.preventDefault();
          e.stopPropagation();
          el.classList.remove('drop-target');
          await deleteItemDirect(dragged.id);
          log(`Moved ${dragged.name} to Trash`, 'warn');
          renderAll();
        });
      }
      host.appendChild(el);
    });
    visibleItems.forEach((item, index) => {
      const pos = item.desktopPosition || { x: 26 + (index % 4) * 92, y: 132 + Math.floor(index / 4) * 96 };
      const el = document.createElement('button');
      el.className = `void-desktop-icon ${selectedId === item.id ? 'selected' : ''}`;
      el.style.left = `${Math.max(8, pos.x)}px`;
      el.style.top = `${Math.max(8, pos.y)}px`;
      el.dataset.id = item.id;
      el.innerHTML = `<span class="void-file-glyph ${esc(fileIcon(item))}">${item.type === 'folder' ? folderSvg() : fileSvg()}</span><b>${esc(item.name)}</b>`;
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (el._didDrag) { el._didDrag = false; return; }
        selectItem(item.id);
      });
      el.addEventListener('dblclick', () => item.type === 'folder' ? openFolder(item.id) : openEditor(item.id));
      setupDesktopIconDrag(el, async (under, finalX, finalY) => {
        const trashEl = under?.closest(`[data-system-icon="${SYSTEM_ICON_TRASH}"]`);
        if (trashEl) {
          await deleteItemDirect(item.id);
          log(`Moved ${item.name} to Trash`, 'warn');
          renderAll();
          return;
        }
        const folderBtn = under?.closest('[data-id]');
        if (folderBtn && folderBtn !== el) {
          const target = getItem(folderBtn.dataset.id);
          if (target?.type === 'folder' && canMoveToParent(item, target.id)) {
            if (await moveItemToParent(item.id, target.id)) {
              state.activeFolderId = target.id;
              log(`Moved ${item.name} into /${target.path}`, 'ok');
              renderAll();
              return;
            }
          }
        }
        item.desktopPosition = clamp({ x: finalX, y: finalY });
        item.updatedAt = nowIso();
        rebuildPaths();
        await saveProject();
        renderAll();
      });
      if (item.type === 'folder') {
        el.addEventListener('dragover', e => {
          const dragged = getDragItem(e);
          if (getDragOrigin(e) === 'desktop') return;
          if (hasDragType(e, 'Files') || (dragged && dragged.id !== item.id && canMoveToParent(dragged, item.id))) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = hasDragType(e, 'Files') ? 'copy' : 'move';
            el.classList.add('drop-target');
          }
        });
        el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
        el.addEventListener('drop', async e => {
          if (e.dataTransfer.files?.length) {
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('drop-target');
            state.activeFolderId = item.id;
            await handleUpload(e.dataTransfer.files, false, item.id);
            return;
          }
          const dragged = getDragItem(e);
          if (getDragOrigin(e) === 'desktop') return;
          if (!dragged || dragged.id === item.id) return;
          e.preventDefault();
          e.stopPropagation();
          el.classList.remove('drop-target');
          if (await moveItemToParent(dragged.id, item.id)) {
            state.activeFolderId = item.id;
            log(`Moved ${dragged.name} into /${getItem(item.id)?.path || item.name}`, 'ok');
            renderAll();
          }
        });
      }
      host.appendChild(el);
    });
  }

  return {
    clampDesktopPosition: clamp,
    renderHeader,
    renderModelSelect,
    renderDesktop,
    renderDock,
    renderEditMode,
    updateVoidClock,
    selectSystemIcon,
    clearDesktopSelection,
    setSystemIconDrag,
    getSystemIconDrag,
    moveSystemIcon,
    availableModelOptions,
    modelStrengthScore,
    isSmallModelOption,
    isLargeFallbackModel,
    autoAssignModels,
    chooseWorkerModel,
  };
}
