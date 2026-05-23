/** DOM helpers shared by Coder mode */

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function baseName(path) {
  return String(path || '').split('/').filter(Boolean).pop() || String(path || '');
}

export function relativeFromRoot(path, projectRoot) {
  const raw = String(path || '');
  const root = String(projectRoot || '').replace(/\/$/, '');
  return root && raw.startsWith(root + '/') ? raw.slice(root.length + 1) : raw;
}

export function setExplorerRootLabel(path) {
  const rootEl = $('cdrExplorerRoot');
  if (!rootEl) return;
  if (!path) {
    rootEl.textContent = 'No project open';
    rootEl.title = '';
    return;
  }
  rootEl.innerHTML = `<strong>${esc(baseName(path))}</strong><span>${esc(path)}</span>`;
  rootEl.title = path;
}

export function setRouterChip(label, tooltip) {
  const chip = document.getElementById('cdrRouterChip');
  if (chip) {
    chip.textContent = label || 'Auto';
    chip.title = tooltip || '';
    chip.style.display = label ? '' : 'none';
  }
}
