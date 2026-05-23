/**
 * Settings read/write: localStorage (non-secrets) + OS keychain (API keys).
 */

export const SETTINGS_KEY = 'atelier';

export const HC_KEY_PROVIDERS = [
  'groqKey', 'geminiKey', 'openRouterKey', 'cerebrasKey', 'sambaKey',
  'openaiKey', 'anthropicKey', 'moonshotKey', 'deepseekKey', 'mistralKey',
  'googleKey', 'googleCx', 'tavilyKey', 'nvidiaKey',
  'minimaxKey', 'glmKey',
];

export function readSavedSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.warn('[settings] ignoring invalid atelier settings:', err);
    return {};
  }
}

/**
 * @param {object} deps
 */
export function createSaveSettings(deps) {
  const {
    readSaved = readSavedSettings,
    hostEl,
    systemEl,
    tempEl,
    modelEl,
    nvidiaModelEl,
    backendSyncTokenEl,
    autoRouterEl,
    privacyLocalEl,
    ragEnabled,
    getRagEnabled,
    rewriterEl,
    state,
    keyEls,
    pushBackendSecretsQuietly,
    showError,
    compactionSelectEl,
  } = deps;

  return function saveSettings() {
    try {
      const HC = window.HC;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        ...readSaved(),
        host: hostEl.value,
        system: systemEl.value,
        temp: tempEl.value,
        model: modelEl.value,
        nvidiaModel: nvidiaModelEl?.value || '',
        backendSyncToken: backendSyncTokenEl ? backendSyncTokenEl.value : '',
        autoRouter: !!(autoRouterEl?.checked),
        privacyLocal: privacyLocalEl.checked,
        ragEnabled: typeof getRagEnabled === 'function' ? getRagEnabled() : ragEnabled,
        rewriterModel: rewriterEl?.value || '',
        compactionModel: HC?.contextCompactor?.getCompactionPreference?.() || compactionSelectEl?.value || 'auto',
        currentProjectId: state.currentProjectId,
        activeAgentId: state.activeAgentId,
        groqKey: '', geminiKey: '', openRouterKey: '', cerebrasKey: '', sambaKey: '',
        openaiKey: '', anthropicKey: '', moonshotKey: '', deepseekKey: '', mistralKey: '',
        googleKey: '', googleCx: '', tavilyKey: '', nvidiaKey: '',
        minimaxKey: '', glmKey: '',
      }));
      if (window.HC?.keychain) {
        for (const id of HC_KEY_PROVIDERS) {
          const el = keyEls[id];
          if (el) void HC.keychain.store(id, el.value || '');
        }
      }
      void pushBackendSecretsQuietly?.();
    } catch (err) {
      console.warn('[settings] save failed:', err);
      showError?.(err);
    }
  };
}

/**
 * Apply saved settings object to form fields (non-keychain path).
 */
export function applySavedToForm(SAVED, els) {
  const {
    hostEl,
    systemEl,
    tempEl,
    tempVal,
    nvidiaModelEl,
    backendSyncTokenEl,
    autoRouterEl,
    privacyLocalEl,
    privacyLocalSideEl,
    googleKeyEl,
    googleCxEl,
    tavilyKeyEl,
    nvidiaKeyEl,
    groqKeyEl,
    geminiKeyEl,
    openRouterKeyEl,
    cerebrasKeyEl,
    sambaKeyEl,
    openaiKeyEl,
    anthropicKeyEl,
    moonshotKeyEl,
    deepseekKeyEl,
    mistralKeyEl,
    minimaxKeyEl,
    glmKeyEl,
  } = els;

  if (SAVED.host) hostEl.value = SAVED.host;
  if (SAVED.system) systemEl.value = SAVED.system;
  if (SAVED.temp) {
    tempEl.value = SAVED.temp;
    if (tempVal) tempVal.textContent = SAVED.temp;
  }
  if (SAVED.nvidiaModel && nvidiaModelEl) nvidiaModelEl.value = SAVED.nvidiaModel;
  if (SAVED.backendSyncToken && backendSyncTokenEl) backendSyncTokenEl.value = SAVED.backendSyncToken;
  if (autoRouterEl) autoRouterEl.checked = SAVED.autoRouter === true;
  if (privacyLocalEl) privacyLocalEl.checked = SAVED.privacyLocal === true;
  if (privacyLocalSideEl) privacyLocalSideEl.checked = SAVED.privacyLocal === true;

  const keyMap = {
    googleKey: googleKeyEl,
    googleCx: googleCxEl,
    tavilyKey: tavilyKeyEl,
    nvidiaKey: nvidiaKeyEl,
    groqKey: groqKeyEl,
    geminiKey: geminiKeyEl,
    openRouterKey: openRouterKeyEl,
    cerebrasKey: cerebrasKeyEl,
    sambaKey: sambaKeyEl,
    openaiKey: openaiKeyEl,
    anthropicKey: anthropicKeyEl,
    moonshotKey: moonshotKeyEl,
    deepseekKey: deepseekKeyEl,
    mistralKey: mistralKeyEl,
    minimaxKey: minimaxKeyEl,
    glmKey: glmKeyEl,
  };
  for (const [k, el] of Object.entries(keyMap)) {
    if (SAVED[k] && el) el.value = SAVED[k];
  }

  return {
    ragEnabled: SAVED.ragEnabled === true,
    activeAgentId: SAVED.activeAgentId || null,
    compactionModel: SAVED.compactionModel,
  };
}

/**
 * Load API keys from OS keychain into form elements.
 */
export function hydrateKeychain(keyEls, { onDone, onFallback } = {}) {
  if (!window.HC?.keychain) {
    onFallback?.();
    return Promise.resolve();
  }
  return HC.keychain.loadAll(HC_KEY_PROVIDERS).then((keys) => {
    for (const [k, v] of Object.entries(keys)) {
      if (v && keyEls[k]) keyEls[k].value = v;
    }
    onDone?.();
  }).catch(() => {
    onFallback?.();
  });
}
