// cdr-command-palette.js — ⌘K quick actions (global + Coder)
(function () {
  'use strict';

  let overlay = null;
  let input = null;
  let list = null;
  let commands = [];
  let sel = 0;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'mxCommandPalette';
    overlay.className = 'mx-cmd-palette';
    overlay.innerHTML = `
      <div class="mx-cmd-panel" role="dialog" aria-label="Command palette">
        <input class="mx-cmd-input" type="text" placeholder="Type a command…" autocomplete="off" spellcheck="false"/>
        <div class="mx-cmd-list"></div>
      </div>`;
    document.body.appendChild(overlay);
    input = overlay.querySelector('.mx-cmd-input');
    list = overlay.querySelector('.mx-cmd-list');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    input.addEventListener('input', () => renderList(input.value));
    input.addEventListener('keydown', (e) => {
      const rows = list?.querySelectorAll('.mx-cmd-item') || [];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        sel = Math.min(sel + 1, rows.length - 1);
        highlight(rows);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        sel = Math.max(sel - 1, 0);
        highlight(rows);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered(input.value)[sel];
        if (cmd) run(cmd);
      } else if (e.key === 'Escape') {
        close();
      }
    });
  }

  function highlight(rows) {
    rows.forEach((r, i) => r.classList.toggle('active', i === sel));
  }

  function filtered(q) {
    const s = (q || '').trim().toLowerCase();
    if (!s) return commands;
    return commands.filter(c =>
      c.label.toLowerCase().includes(s) || (c.group || '').toLowerCase().includes(s)
    );
  }

  function renderList(q) {
    const items = filtered(q);
    sel = 0;
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="mx-cmd-empty">No matching commands</div>';
      return;
    }
    list.innerHTML = items.map((c, i) =>
      `<button type="button" class="mx-cmd-item${i === 0 ? ' active' : ''}" data-idx="${i}">
        <span class="mx-cmd-label">${esc(c.label)}</span>
        <span class="mx-cmd-group">${esc(c.group || '')}</span>
      </button>`
    ).join('');
    list.querySelectorAll('.mx-cmd-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = items[parseInt(btn.dataset.idx, 10)];
        if (cmd) run(cmd);
      });
    });
  }

  function run(cmd) {
    close();
    try {
      cmd.run?.();
    } catch (e) {
      console.error('[CommandPalette]', e);
    }
  }

  function open() {
    ensureDom();
    overlay.classList.add('open');
    input.value = '';
    renderList('');
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    overlay?.classList.remove('open');
  }

  function register(cmd) {
    if (!cmd?.id || !cmd?.label) return;
    commands = commands.filter(c => c.id !== cmd.id);
    commands.push(cmd);
    commands.sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.label.localeCompare(b.label));
  }

  function registerMany(arr) {
    (arr || []).forEach(register);
  }

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (overlay?.classList.contains('open')) close();
      else open();
    }
  });

  window.MxCommandPalette = { open, close, register, registerMany };
})();
