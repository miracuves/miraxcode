const _esc = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => _esc[c]);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function safeHost() {
  return window.MiraXcodeRuntime.getHost();
}

export function headersToObject(raw) {
  const hdr = {};
  if (!raw) return hdr;
  if (raw instanceof Headers) {
    raw.forEach((v, k) => { hdr[k] = v; });
  } else {
    for (const [k, v] of Object.entries(raw)) hdr[k] = String(v);
  }
  return hdr;
}

/** Parse "cloud:provider:modelId" — modelId may contain colons. */
export function parseCloudModel(val) {
  if (!val || !val.startsWith('cloud:')) return { provider: '', modelId: '' };
  const parts = val.split(':');
  return { provider: parts[1] || '', modelId: parts.slice(2).join(':') };
}
