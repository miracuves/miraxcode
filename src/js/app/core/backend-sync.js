/**
 * Optional sync with local Hash UI Node server (`/api/backend/*`).
 */

export function createBackendSyncApi(deps) {
  const {
    backendSecretsStatusEl,
    backendSyncTokenEl,
    keyEls,
    backendAuthHeaders,
  } = deps;

  let backendSecretsReachable = false;
  let backendAuthRequired = false;
  let backendFetchProxyAvailable = false;

  function getBackendAuthRequired() {
    return backendAuthRequired;
  }

  function getBackendFetchProxyAvailable() {
    return backendFetchProxyAvailable;
  }

  function isBackendReachable() {
    return backendSecretsReachable;
  }

  function applyServerSecretIfPresent(el, v) {
    if (!el || typeof v !== 'string' || !v) return;
    el.value = v;
  }

  async function pullBackendSecrets() {
    const line = (s) => { if (backendSecretsStatusEl) backendSecretsStatusEl.textContent = s; };
    backendSecretsReachable = false;
    backendAuthRequired = false;
    backendFetchProxyAvailable = false;
    try {
      const h = await fetch('/api/backend/health', { cache: 'no-store' });
      if (!h.ok) throw new Error('health_' + h.status);
      const health = await h.json().catch(() => ({}));
      backendAuthRequired = !!health.authRequired;
      backendFetchProxyAvailable = !!health.fetchUrlProxy;
      const rs = await fetch('/api/backend/secrets', {
        cache: 'no-store',
        headers: { ...backendAuthHeaders() },
      });
      if (!rs.ok) {
        if (rs.status === 401) {
          line(
            'Backend is running but requires a sync token — copy the bearer from the server file ' +
              (health.dataDir ? `${health.dataDir}/api-bearer.txt` : 'data/api-bearer.txt') +
              ' (also printed in the terminal when the server first created it) into Settings → Backend sync token. ' +
              'For open local dev only, restart the server with HASH_UI_OPEN_API=1.',
          );
          return;
        }
        throw new Error('secrets_' + rs.status);
      }
      const sec = await rs.json();
      if (typeof sec !== 'object' || !sec) throw new Error('bad_secrets');
      for (const [id, el] of Object.entries(keyEls)) {
        if (sec[id]) applyServerSecretIfPresent(el, sec[id]);
      }
      backendSecretsReachable = true;
      line(
        health.hasSecretsFile
          ? 'Backend: connected — non-empty API keys from the server were merged into this form (see data/secrets.json on the machine running node server.js).'
          : 'Backend: connected — server has no key file yet; saving Settings will create data/secrets.json.',
      );
    } catch {
      const port = (typeof location !== 'undefined' && location.port) ? location.port : '3000';
      line(
        `Backend: not syncing (open this UI via http://localhost:${port} with node server.js running, or ignore — keys stay in this browser only).`,
      );
    }
  }

  async function pushBackendSecretsQuietly() {
    if (!backendSecretsReachable) return;
    try {
      const body = {};
      for (const [id, el] of Object.entries(keyEls)) {
        body[id] = el?.value || '';
      }
      const r = await fetch('/api/backend/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...backendAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        console.warn('[backend] POST /api/backend/secrets failed:', r.status);
        if (r.status === 401 && backendSecretsStatusEl) {
          backendSecretsStatusEl.textContent =
            'Backend: save rejected (401) — paste the bearer from data/api-bearer.txt (or HASH_UI_API_TOKEN) into Backend sync token, or use HASH_UI_OPEN_API=1 on the server.';
        }
      }
    } catch (e) {
      console.warn('[backend] POST secrets:', e);
    }
  }

  return {
    pullBackendSecrets,
    pushBackendSecretsQuietly,
    getBackendAuthRequired,
    getBackendFetchProxyAvailable,
    isBackendReachable,
  };
}
