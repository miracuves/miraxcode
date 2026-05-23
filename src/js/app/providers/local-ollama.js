import { HOST_PRESETS_KEY, BUILTIN_PRESETS } from '../core/constants.js';
import { safeHost } from '../core/utils.js';

/**
 * Local Ollama host presets, connection status, model list refresh.
 *
 * @param {object} deps
 */
export function createLocalOllamaApi(deps) {
  const {
    $,
    hostEl,
    modelEl,
    statusDot,
    statusText,
    errorSlot,
    escapeHtml,
    safeHost: safeHostFn = safeHost,
    makeSignal,
    saveSettings,
    populateCloudModels,
    ollamaModelName,
    setActiveSub,
    SAVED,
    rewriterEl,
    cloudBadgeEl,
    activeSub,
    CLOUD_MODELS,
  } = deps;

  let loadModelsSeq = 0;

  function loadHostPresets() {
    try {
      return JSON.parse(localStorage.getItem(HOST_PRESETS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveHostPresets(arr) {
    try {
      localStorage.setItem(HOST_PRESETS_KEY, JSON.stringify(arr.slice(0, 30)));
    } catch {}
  }

  function allHostPresets() {
    return [...BUILTIN_PRESETS, ...loadHostPresets().map((p) => ({ ...p, builtin: false }))];
  }

  function renderHostPresetDropdown() {
    const sel = $('hostPreset');
    if (!sel) return;
    const all = allHostPresets();
    const current = (hostEl.value || '').trim();
    sel.innerHTML = '';
    all.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.url;
      opt.textContent = p.label;
      opt.dataset.builtin = p.builtin ? '1' : '0';
      if (p.url === current) opt.selected = true;
      sel.appendChild(opt);
    });
    if (current && !all.some((p) => p.url === current)) {
      const opt = document.createElement('option');
      opt.value = current;
      opt.textContent = '(unsaved) ' + current;
      opt.dataset.builtin = '1';
      opt.selected = true;
      sel.insertBefore(opt, sel.firstChild);
    }
    updateDeleteBtnVisibility();
  }

  function updateDeleteBtnVisibility() {
    const sel = $('hostPreset');
    const del = $('deleteHostBtn');
    if (!sel || !del) return;
    const selected = sel.selectedOptions?.[0];
    del.style.display = selected && selected.dataset.builtin === '0' ? '' : 'none';
  }

  function syncHostPreset() {
    renderHostPresetDropdown();
  }

  function setStatus(kind, text) {
    statusDot.className = 'dot ' + (kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : 'warn');
    statusText.textContent = text;
  }

  function showError(err) {
    const msg = err?.message || String(err || 'Unknown error');
    errorSlot.innerHTML = `<div class="error-banner"><b>Request failed</b><span>${escapeHtml(msg)}</span><button type="button" class="error-close" aria-label="Dismiss request failed message" title="Close">&times;</button></div>`;
  }

  function clearError() {
    errorSlot.innerHTML = '';
  }

  async function loadModels() {
    const seq = ++loadModelsSeq;
    clearError();
    if (!(hostEl.value || '').trim()) {
      setStatus('warn', 'Local Ollama: Off');
      modelEl.innerHTML = '<option value="">— local Ollama disabled —</option>';
      populateCloudModels();
      return;
    }
    setStatus('warn', 'Connecting…');
    try {
      const r = await fetch(`${safeHostFn()}/api/tags`, { cache: 'no-store', signal: makeSignal(5e3) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (seq !== loadModelsSeq) return;
      const models = (data.models || []).map(ollamaModelName).filter(Boolean);
      const current = modelEl.value;
      modelEl.innerHTML = '';
      if (models.length === 0) {
        modelEl.innerHTML = '<option value="">No models — run: ollama pull llama3.2</option>';
        setStatus('warn', 'Connected · no models installed');
      } else {
        models.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          modelEl.appendChild(opt);
        });
        setStatus('ok', `Connected · ${models.length} model${models.length === 1 ? '' : 's'}`);
      }
      populateCloudModels();
      const canSelectModel = (value) =>
        !!value && Array.from(modelEl.options).some((opt) => opt.value === value && !opt.disabled);
      const pick = canSelectModel(current) ? current : canSelectModel(SAVED.model) ? SAVED.model : models[0] || '';
      if (pick) modelEl.value = pick;
      setActiveSub(modelEl.value);
      if (rewriterEl) {
        const rewriterPrev = rewriterEl.value || SAVED.rewriterModel || '';
        rewriterEl.innerHTML = '<option value="">— off — use raw message —</option>';
        models.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          rewriterEl.appendChild(opt);
        });
        if (rewriterPrev && models.includes(rewriterPrev)) rewriterEl.value = rewriterPrev;
      }
      saveSettings();
    } catch (err) {
      if (seq !== loadModelsSeq) return;
      modelEl.innerHTML = '<option value="" disabled>(Local host offline)</option>';
      populateCloudModels();
      const savedModel = SAVED.model || '';
      if (savedModel.startsWith('cloud:')) {
        modelEl.value = savedModel;
        setActiveSub(savedModel);
      } else {
        activeSub.textContent = 'Local host offline';
        if (cloudBadgeEl) cloudBadgeEl.style.display = 'none';
      }
      const hasCloud = CLOUD_MODELS.some((g) => (g.keyEl().value || '').trim());
      setStatus(hasCloud ? 'warn' : 'err', hasCloud ? 'Local host offline · cloud ready' : 'Local host offline');
    }
  }

  function wireHostPresets() {
    hostEl.addEventListener('change', () => {
      syncHostPreset();
      saveSettings();
      loadModels();
    });

    $('hostPreset')?.addEventListener('change', () => {
      const sel = $('hostPreset');
      const labelInput = $('hostLabel');
      const selected = sel.selectedOptions?.[0];
      if (!selected) return;
      hostEl.value = selected.value;
      if (labelInput) labelInput.value = selected.dataset.builtin === '0' ? selected.textContent : '';
      updateDeleteBtnVisibility();
      saveSettings();
      if (!selected.value) {
        setStatus('warn', 'Local Ollama: Off');
        modelEl.innerHTML = '<option value="">— local Ollama disabled —</option>';
        populateCloudModels();
        return;
      }
      loadModels();
    });

    $('saveHostBtn')?.addEventListener('click', () => {
      const url = (hostEl.value || '').trim();
      const label = (($('hostLabel')?.value) || '').trim();
      if (!url) return;
      if (!label) {
        $('hostLabel')?.focus();
        return;
      }
      const presets = loadHostPresets();
      const idx = presets.findIndex((p) => p.url === url);
      if (idx >= 0) presets[idx] = { label, url };
      else presets.unshift({ label, url });
      saveHostPresets(presets);
      if ($('hostLabel')) $('hostLabel').value = '';
      renderHostPresetDropdown();
    });

    $('deleteHostBtn')?.addEventListener('click', () => {
      const sel = $('hostPreset');
      const selected = sel?.selectedOptions?.[0];
      if (!selected || selected.dataset.builtin !== '0') return;
      const url = selected.value;
      const presets = loadHostPresets().filter((p) => p.url !== url);
      saveHostPresets(presets);
      hostEl.value = BUILTIN_PRESETS[0].url;
      renderHostPresetDropdown();
      saveSettings();
      loadModels();
    });

    renderHostPresetDropdown();
  }

  function wireErrorDismiss() {
    errorSlot?.addEventListener('click', (e) => {
      if (e.target.closest('.error-close')) clearError();
    });
  }

  return {
    loadHostPresets,
    saveHostPresets,
    allHostPresets,
    renderHostPresetDropdown,
    syncHostPreset,
    loadModels,
    setStatus,
    showError,
    clearError,
    wireHostPresets,
    wireErrorDismiss,
  };
}
