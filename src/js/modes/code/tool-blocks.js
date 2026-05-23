import { TOOL_ICONS, TOOL_ICON_DEFAULT } from './constants.js';
import { esc } from './dom-utils.js';

export function toolBlockHtml(rec) {
  const { name, args, result, ms, ok } = rec;
  const icon = TOOL_ICONS[name] || TOOL_ICON_DEFAULT;
  const pathArg = args?.path || args?.dir || args?.file || '';
  const resultText = String(result || '');
  const isErr = !ok || resultText.includes('"error"');
  const statusClass = isErr ? 'err' : ok ? 'ok' : '';
  const statusText  = isErr ? 'Failed' : `${ms}ms`;
  const safeId = 'tb_' + Math.random().toString(36).slice(2, 9);
  const argsJson = esc(JSON.stringify(args || {}, null, 2).slice(0, 500));
  const resultPreview = esc(resultText.slice(0, 600)) + (resultText.length > 600 ? '\n…' : '');
  return `
<div class="cdr-tool-row ${statusClass}" data-tool-toggle="${safeId}">
  ${icon}
  <span class="cdr-tool-name">${esc(name)}</span>
  <span class="cdr-tool-target">${esc(pathArg)}</span>
  <span class="cdr-tool-status">${esc(statusText)}</span>
</div>
<div class="cdr-tool-details" id="${safeId}">
  ${argsJson !== '{}' ? `<div style="margin-bottom:6px"><b>Args</b><pre>${argsJson}</pre></div>` : ''}
  <div><b>Result</b><pre>${resultPreview}</pre></div>
</div>`;
}

export function injectAllToolBlocks() {
  const H = window._H;
  if (!H) return;
  const messages = H.state?.messages;
  if (!messages) return;
  document.querySelectorAll('#cdrMessages .cdr-msg.assistant').forEach(wrap => {
    const idx = parseInt(wrap.dataset.idx, 10);
    if (isNaN(idx)) return;
    const msg = messages[idx];
    if (!msg?._toolBlocks?.length) return;
    const bubble = wrap.querySelector('.bubble');
    if (!bubble) return;
    if (bubble.dataset.tbCount === String(msg._toolBlocks.length)) return;
    bubble.dataset.tbCount = String(msg._toolBlocks.length);
    bubble.querySelectorAll('.hc-tool-blocks-wrap').forEach(el => el.remove());
    const wrapper = document.createElement('div');
    wrapper.className = 'hc-tool-blocks-wrap';
    wrapper.innerHTML = msg._toolBlocks.map(toolBlockHtml).join('');
    wrapper.querySelectorAll('.cdr-tool-row[data-tool-toggle]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.toolToggle;
        const details = document.getElementById(id);
        if (details) {
          const isOpen = details.style.display === 'block';
          details.style.display = isOpen ? 'none' : 'block';
          row.classList.toggle('open', !isOpen);
        }
      });
    });
    wrapper.querySelectorAll('.cdr-tool-details').forEach(d => { d.style.display = 'none'; });
    bubble.insertBefore(wrapper, bubble.firstChild);
  });
}
