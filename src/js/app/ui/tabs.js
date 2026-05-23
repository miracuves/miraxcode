/**
 * Tab / mode switching — chat tabs, agents panel, lazy mode loads, fullscreen modes.
 */

import {
  BUILTIN_BODY_MODE_CLASSES,
  LAZY_MODE_TABS,
  COMPOSER_CHIPS,
} from '../core/constants.js';

const BUILTIN_APP_MODE_CLASSES = [
  'canvas-mode',
  'code-mode',
  'forge-mode',
  'split-mode',
  'sandbox-mode',
  'system-maker-mode',
  'agent-maker-mode',
];

/**
 * @param {object} deps
 */
export function createTabsApi(deps) {
  const {
    state,
    $,
    escapeHtml,
    showError,
    persistCurrentChat,
    stashConversationBucket,
    restoreConversationBucket,
    render,
    renderChatList,
    renderAgentsList,
    setCompareMode,
    chatsListEl,
    agentsListEl,
    searchWrap,
    memoryRowEl,
    listLabel,
    activeAgentChip,
  } = deps;

  let activeFullscreenMode = null;
  let modeTransitionToken = 0;

  function registeredModes() {
    return window._registeredModes || {};
  }

  function chatBucketForTab(tab) {
    if (tab === 'code') return 'code';
    if (tab === 'forge') return 'forge';
    return 'normal';
  }

  function modeButtonId(tab, mode) {
    return mode?.btnId || ('tab' + tab.charAt(0).toUpperCase() + tab.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
  }

  function normalizeModeConfig(tab, config = {}) {
    return {
      label: tab,
      btnId: modeButtonId(tab, config),
      bodyClass: null,
      appClass: null,
      fullscreen: true,
      mount: null,
      destroy: null,
      ...config,
    };
  }

  function setActiveTabButton(tab) {
    document.querySelectorAll('.tabs [data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const mode = registeredModes()[tab];
    if (mode?.btnId) $(mode.btnId)?.classList.add('active');
  }

  function clearModeClasses() {
    const appEl = document.getElementById('app');
    const bodyClasses = new Set(BUILTIN_BODY_MODE_CLASSES);
    const appClasses = new Set(BUILTIN_APP_MODE_CLASSES);
    for (const mode of Object.values(registeredModes())) {
      if (mode?.bodyClass) bodyClasses.add(mode.bodyClass);
      if (mode?.appClass) appClasses.add(mode.appClass);
    }
    bodyClasses.forEach((cls) => document.body.classList.remove(cls));
    appClasses.forEach((cls) => appEl?.classList.remove(cls));
    document.body.classList.remove('miraxcode-fullscreen-active');
  }

  function destroyRegisteredModes(exceptTab = null) {
    for (const [id, mode] of Object.entries(registeredModes())) {
      if (id === exceptTab) continue;
      try {
        mode?.destroy?.();
      } catch (err) {
        console.warn(`[MiraXcode] failed to destroy mode "${id}"`, err);
      }
    }
    if (activeFullscreenMode !== exceptTab) activeFullscreenMode = null;
  }

  function leaveFullscreenModes() {
    destroyRegisteredModes(null);
    clearModeClasses();
  }

  function renderComposerChips(which) {
    const chips = COMPOSER_CHIPS[which] || COMPOSER_CHIPS.default;
    const host = $('composerChips');
    if (!host) return;
    host.innerHTML = chips
      .map(
        (c) =>
          `<button data-preset="${escapeHtml(c.preset)}"${c.accent ? ' class="accent"' : ''} title="${escapeHtml(c.title)}">${c.label}</button>`
      )
      .join('');
  }

  function renderCodeBadge(show) {
    let badge = document.getElementById('codeModeBadge');
    const row = document.querySelector('.crumbs .badge-row');
    if (!badge && row) {
      badge = document.createElement('span');
      badge.id = 'codeModeBadge';
      badge.className = 'code-mode-badge';
      badge.textContent = 'CODING MODE';
      row.insertBefore(badge, activeAgentChip || null);
    }
    if (!badge) return;
    badge.style.display = show ? 'inline-flex' : 'none';
    if (row && badge.parentElement !== row) {
      row.insertBefore(badge, activeAgentChip || null);
    }
  }

  function renderForgeBadge(show) {
    let badge = document.getElementById('forgeModeBadge');
    const row = document.querySelector('.crumbs .badge-row');
    if (!badge && row) {
      badge = document.createElement('span');
      badge.id = 'forgeModeBadge';
      badge.className = 'forge-mode-badge';
      badge.textContent = '3D FORGE';
      row.insertBefore(badge, activeAgentChip || null);
    }
    if (!badge) return;
    badge.style.display = show ? 'inline-flex' : 'none';
    if (row && badge.parentElement !== row) {
      row.insertBefore(badge, activeAgentChip || null);
    }
  }

  function resetSharedModeUi(tab) {
    const chatTabs = new Set(['chats', 'code', 'forge', 'split']);
    const showChatSidebar = chatTabs.has(tab);
    setActiveTabButton(tab);
    chatsListEl.style.display = showChatSidebar ? '' : 'none';
    agentsListEl.style.display = 'none';
    searchWrap.style.display = showChatSidebar ? '' : 'none';
    memoryRowEl.style.display = showChatSidebar ? '' : 'none';
    const agentsHeader = document.getElementById('agentsHeader');
    if (agentsHeader) agentsHeader.style.display = 'none';
    if (listLabel) {
      listLabel.style.display = '';
      listLabel.textContent =
        tab === 'code' ? 'Coding' : tab === 'forge' ? '3D Forge' : tab === 'split' ? 'Split' : 'Recent';
    }
    setCompareMode(tab === 'split');
    renderComposerChips(tab === 'code' ? 'code' : tab === 'forge' ? 'forge' : 'default');
    renderCodeBadge(tab === 'code');
    renderForgeBadge(tab === 'forge');
  }

  function safeExitMode() {
    setTab('chats');
  }

  async function activateRegisteredMode(tab, rawMode) {
    const mode = normalizeModeConfig(tab, rawMode);
    const transitionId = ++modeTransitionToken;
    if (state.tab !== tab) state[`_pre${tab}Tab`] = state.tab;
    destroyRegisteredModes(tab);
    clearModeClasses();
    activeFullscreenMode = mode.fullscreen === false ? null : tab;

    state.tab = tab;
    setActiveTabButton(tab);
    chatsListEl.style.display = 'none';
    agentsListEl.style.display = 'none';
    searchWrap.style.display = 'none';
    memoryRowEl.style.display = 'none';
    const agentsHeader = document.getElementById('agentsHeader');
    if (agentsHeader) agentsHeader.style.display = 'none';
    if (listLabel) {
      listLabel.style.display = '';
      listLabel.textContent = mode.label || tab;
    }
    setCompareMode(false);
    renderComposerChips('default');
    renderCodeBadge(false);
    renderForgeBadge(false);

    const appEl = document.getElementById('app');
    if (mode.appClass) appEl?.classList.add(mode.appClass);
    if (mode.bodyClass) document.body.classList.add(mode.bodyClass);
    document.body.classList.toggle('miraxcode-fullscreen-active', mode.fullscreen !== false);

    try {
      if (typeof window.ensureModeScript === 'function') {
        await window.ensureModeScript(tab);
      }
      await Promise.resolve(mode.mount?.());
      if (transitionId !== modeTransitionToken) return;
    } catch (err) {
      if (transitionId !== modeTransitionToken) return;
      console.error(`[MiraXcode] mode "${tab}" failed to mount`, err);
      try {
        mode.destroy?.();
      } catch {}
      leaveFullscreenModes();
      setTab('chats');
      showError(new Error(`${mode.label || tab} failed to open: ${err?.message || err}`));
    }
  }

  function setTab(tab) {
    const registered = registeredModes()[tab];
    if (!registered && LAZY_MODE_TABS.has(tab) && typeof window.ensureModeScript === 'function') {
      void window
        .ensureModeScript(tab)
        .then(() => {
          const reg = registeredModes()[tab];
          if (reg) void activateRegisteredMode(tab, reg);
          else console.warn('[MiraXcode] mode script loaded but not registered:', tab);
        })
        .catch((err) => showError(new Error(`Failed to load ${tab} mode: ${err?.message || err}`)));
      return;
    }
    if (registered) {
      void activateRegisteredMode(tab, registered);
      return;
    }

    modeTransitionToken++;
    const fromFullscreen = !!activeFullscreenMode;
    leaveFullscreenModes();

    if (tab === 'agents') {
      if (state.tab !== 'agents') state._preAgentsTab = state.tab;
      state.tab = 'agents';
      setActiveTabButton('agents');
      chatsListEl.style.display = 'none';
      agentsListEl.style.display = '';
      searchWrap.style.display = 'none';
      memoryRowEl.style.display = 'none';
      const ah = document.getElementById('agentsHeader');
      if (ah) ah.style.display = '';
      if (listLabel) listLabel.style.display = 'none';
      renderAgentsList();
      return;
    }

    const effectiveFrom = fromFullscreen
      ? 'chats'
      : state.tab === 'agents' && state._preAgentsTab
        ? state._preAgentsTab
        : state.tab;
    const fromBucket = chatBucketForTab(effectiveFrom);
    const toBucket = chatBucketForTab(tab);

    if (fromBucket !== toBucket) {
      persistCurrentChat();
      stashConversationBucket(fromBucket);
      restoreConversationBucket(toBucket);
      render();
    }

    state.tab = tab;
    const app = document.getElementById('app');
    app.classList.toggle('code-mode', tab === 'code');
    app.classList.toggle('forge-mode', tab === 'forge');
    app.classList.toggle('split-mode', tab === 'split');
    resetSharedModeUi(tab);
    renderChatList();
  }

  function registerMode(id, config) {
    (window._registeredModes = window._registeredModes || {})[id] = normalizeModeConfig(id, config);
  }

  return {
    setTab,
    safeExitMode,
    registeredModes,
    normalizeModeConfig,
    registerMode,
    activateRegisteredMode,
    renderComposerChips,
    renderCodeBadge,
    renderForgeBadge,
    destroyRegisteredModes,
    leaveFullscreenModes,
    LAZY_MODE_TABS,
  };
}
