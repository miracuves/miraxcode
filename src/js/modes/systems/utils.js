/** Systems mode pure helpers (Wave 15). */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function shadeHex(hex, factor) {
  const h = String(hex || '#000000').replace(/^#/, '');
  if (h.length < 6) return hex;
  const n = parseInt(h.slice(0, 6), 16);
  const r = Math.round(Math.max(0, Math.min(255, ((n >> 16) & 0xff) * (1 - factor))));
  const g = Math.round(Math.max(0, Math.min(255, ((n >> 8) & 0xff) * (1 - factor))));
  const b = Math.round(Math.max(0, Math.min(255, (n & 0xff) * (1 - factor))));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function hexToRgb(hex) {
  const n = parseInt(String(hex || '#000000').replace(/^#/, '').slice(0, 6), 16);
  return `${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff}`;
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function uid(prefix = 'sys') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function nowLabel(ts = Date.now()) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function structuredCloneSafe(obj) {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj || {}));
  }
}

export function slug(raw, fallback = 'item') {
  return String(raw || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
}

export function threeWords(str) {
  return String(str || '').trim().split(/\s+/).slice(0, 3).join(' ');
}

export function titleCase(raw) {
  return String(raw || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fieldType(value, name = '') {
  const n = String(name || '').toLowerCase();
  if (/date|time/.test(n)) return 'date';
  if (/amount|total|price|cost|revenue|salary|qty|quantity|stock|count|score|rate|percent|balance|value/.test(n)) return 'number';
  if (/status|stage|priority|type|category/.test(n)) return 'select';
  if (typeof value === 'number') return 'number';
  return 'text';
}
