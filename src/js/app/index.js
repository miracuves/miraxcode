/**
 * HashCortX main shell — esbuild entry.
 * Bundles to src/js/app.bundle.js (IIFE, loaded before mode scripts).
 */
import './runtime.js';
import { boot } from './bootstrap.js';

boot().catch((err) => {
  console.error('[HashCortX] app boot failed:', err);
  window.HcHealth?.capture?.('boot', err?.message || String(err), err?.stack);
});
