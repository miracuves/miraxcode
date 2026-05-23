/**
 * MiraXCode — production error capture (local-only, no telemetry).
 * Ring buffer in localStorage + global handlers for support diagnostics.
 */
(function () {
  'use strict';

  const LOG_KEY = 'hc_health_log_v1';
  const MAX_ENTRIES = 40;

  function readLog() {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function writeLog(entries) {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {}
  }

  function record(entry) {
    const row = {
      ts: new Date().toISOString(),
      ...entry,
    };
    const log = readLog();
    log.unshift(row);
    writeLog(log);
    return row;
  }

  function capture(type, message, detail) {
    record({
      type,
      message: String(message || '').slice(0, 2000),
      detail: detail ? String(detail).slice(0, 4000) : undefined,
      href: typeof location !== 'undefined' ? location.pathname : '',
    });
  }

  window.HcHealth = {
    record,
    capture,
    readLog,
    clearLog() {
      try { localStorage.removeItem(LOG_KEY); } catch {}
    },
    exportText() {
      return readLog()
        .map((e) => `[${e.ts}] ${e.type}: ${e.message}${e.detail ? '\n  ' + e.detail : ''}`)
        .join('\n\n');
    },
  };

  window.addEventListener('error', (ev) => {
    capture('error', ev.message || 'Script error', ev.filename ? `${ev.filename}:${ev.lineno}` : '');
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const msg = reason?.message || reason?.toString?.() || 'Unhandled promise rejection';
    capture('unhandledrejection', msg, reason?.stack);
  });
})();
