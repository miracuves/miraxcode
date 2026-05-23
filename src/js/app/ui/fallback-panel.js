/**
 * Cloud model failover preferences — per-model opt-out stored in localStorage.
 */

export const FALLBACK_PREFS_KEY = 'miraxcode_fallback_prefs';

export function loadFallbackPrefs() {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveFallbackPrefs(prefs) {
  try {
    localStorage.setItem(FALLBACK_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export function isFallbackDisabled(modelValue) {
  const prefs = loadFallbackPrefs();
  return prefs[modelValue] === false;
}

/**
 * @param {object} deps
 */
export function createFallbackPanelApi(deps) {
  const { escapeHtml, CLOUD_MODELS, visibleCloudModels, populateCloudModels } = deps;

  function renderFallbackPanel() {
    const panel = document.getElementById('fallbackPanel');
    if (!panel) return;
    const prefs = loadFallbackPrefs();
    let html = '';
    CLOUD_MODELS.forEach((grp) => {
      const models = visibleCloudModels(grp.models);
      if (!models.length) return;
      html += `<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:600;color:var(--hc-accent);margin-bottom:4px;opacity:0.8">${escapeHtml(grp.group)}</div>`;
      models.forEach((m) => {
        const checked = prefs[m.value] !== false ? 'checked' : '';
        html += `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);padding:2px 0;cursor:pointer"><input type="checkbox" data-fallback-value="${escapeHtml(m.value)}" ${checked} style="accent-color:var(--hc-accent)"/><span>${escapeHtml(m.shortLabel || m.label)}</span></label>`;
      });
      html += `</div>`;
    });
    panel.innerHTML = html || '<div style="font-size:12px;color:var(--muted)">No fallback models configured.</div>';
    panel.querySelectorAll('input[type=checkbox]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const next = loadFallbackPrefs();
        next[cb.dataset.fallbackValue] = cb.checked;
        saveFallbackPrefs(next);
        populateCloudModels();
      });
    });
  }

  function wireFallbackPanel() {
    const fallbackBtn = document.getElementById('fallbackToggleBtn');
    const fallbackPanel = document.getElementById('fallbackPanel');
    const fallbackIcon = document.getElementById('fallbackToggleIcon');
    if (!fallbackBtn || !fallbackPanel) return;
    fallbackBtn.addEventListener('click', () => {
      const open = fallbackPanel.style.display !== 'none';
      fallbackPanel.style.display = open ? 'none' : 'block';
      if (fallbackIcon) fallbackIcon.style.transform = open ? '' : 'rotate(90deg)';
      if (!open) renderFallbackPanel();
    });
  }

  return { renderFallbackPanel, wireFallbackPanel };
}
