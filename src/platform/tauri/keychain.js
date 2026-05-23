// ==============================================================
// platform/tauri/keychain.js — Production API key storage
//
// Primary: macOS Keychain (Rust keychain_store_bundle) — OS-encrypted.
// Cache:   localStorage hc_api_bundle_v2 — fast reads, survives rebuilds.
//
// README "Keychain" claim matches runtime: secrets are written to the OS
// vault on every store(); localStorage is a non-authoritative cache only.
// ==============================================================

(function () {
  'use strict';

  const LS_BUNDLE_KEY = 'hc_api_bundle_v2';
  const LS_MIGRATED   = 'hc_migrated_v2';
  let _warnedKeychainWrite = false;

  function lsGet(k)    { try { return localStorage.getItem(k); }     catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); }         catch {} }

  function parseBundle(raw) {
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function getBundleLocal() {
    return parseBundle(lsGet(LS_BUNDLE_KEY));
  }

  function saveBundleLocal(data) {
    lsSet(LS_BUNDLE_KEY, JSON.stringify(data));
  }

  async function persistToOs(data) {
    if (!HC.isTauri) return true;
    try {
      await HC.invoke('keychain_store_bundle', { bundle: JSON.stringify(data) });
      return true;
    } catch (e) {
      if (!_warnedKeychainWrite) {
        _warnedKeychainWrite = true;
        console.warn('[keychain] OS Keychain store failed; using local cache only:', e);
        window.HcHealth?.capture?.('keychain', 'OS store failed', e?.message || String(e));
      }
      return false;
    }
  }

  async function loadFromOs() {
    if (!HC.isTauri) return null;
    try {
      const json = await HC.invoke('keychain_retrieve_bundle');
      if (!json) return null;
      const parsed = parseBundle(json);
      if (Object.keys(parsed).length) {
        saveBundleLocal(parsed);
        return parsed;
      }
    } catch { /* no bundle */ }
    return null;
  }

  // ── One-time migration from legacy keychain-only bundle ───────
  let _migrationDone = !!lsGet(LS_MIGRATED);
  let _migrationPromise = null;

  async function ensureMigrated() {
    if (_migrationDone) return;
    if (_migrationPromise) return _migrationPromise;
    _migrationPromise = (async () => {
      const os = await loadFromOs();
      const local = getBundleLocal();
      if (os && Object.keys(local).length) {
        const merged = Object.assign({}, os, local);
        saveBundleLocal(merged);
        await persistToOs(merged);
      } else if (!Object.keys(local).length && os) {
        saveBundleLocal(os);
      } else if (Object.keys(local).length && !os) {
        await persistToOs(local);
      }
      lsSet(LS_MIGRATED, '1');
      _migrationDone = true;
    })();
    return _migrationPromise;
  }

  async function getBundle() {
    await ensureMigrated();
    const os = await loadFromOs();
    if (os) return os;
    return getBundleLocal();
  }

  // ── Public API ──────────────────────────────────────────────

  HC.keychain = {
    async store(provider, secret) {
      await ensureMigrated();
      const data = getBundleLocal();
      if (secret) data[provider] = secret;
      else delete data[provider];
      saveBundleLocal(data);
      await persistToOs(data);
    },

    async retrieve(provider) {
      const data = await getBundle();
      return data[provider] || null;
    },

    async delete(provider) {
      return this.store(provider, '');
    },

    async loadAll(providers) {
      const data = await getBundle();
      const result = {};
      for (const p of providers) result[p] = data[p] || '';
      return result;
    },
  };
})();
