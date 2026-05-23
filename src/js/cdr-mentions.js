// cdr-mentions.js — @file / @folder autocomplete for Coder composer
(function () {
  'use strict';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function attach(input, opts) {
    if (!input) return () => {};
    const getRoot = opts.getProjectRoot || (() => null);
    const listFiles = opts.listFiles || (async () => []);
    let menu = null;
    let activeIdx = 0;
    let items = [];

    function closeMenu() {
      if (menu) {
        menu.remove();
        menu = null;
      }
      items = [];
      activeIdx = 0;
    }

    function insertMention(rel) {
      const v = input.value;
      const pos = input.selectionStart ?? v.length;
      const before = v.slice(0, pos);
      const m = before.match(/@([^\s@]*)$/);
      if (!m) return;
      const start = pos - m[0].length;
      const mention = '@' + rel + ' ';
      input.value = v.slice(0, start) + mention + v.slice(pos);
      const caret = start + mention.length;
      input.setSelectionRange(caret, caret);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      closeMenu();
      input.focus();
      if (typeof opts.onPick === 'function') {
        try { opts.onPick(rel); } catch (e) { console.warn('[CdrMentions] onPick failed:', e); }
      }
    }

    function renderMenu(filter) {
      closeMenu();
      const q = (filter || '').toLowerCase();
      const matched = items.filter(p => !q || p.toLowerCase().includes(q)).slice(0, 24);
      if (!matched.length) return;
      menu = document.createElement('div');
      menu.className = 'cdr-mention-menu';
      menu.innerHTML = matched.map((p, i) =>
        `<button type="button" class="cdr-mention-item${i === 0 ? ' active' : ''}" data-idx="${i}" data-path="${esc(p)}">${esc(p)}</button>`
      ).join('');
      const rect = input.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
      menu.style.width = Math.min(420, rect.width) + 'px';
      document.body.appendChild(menu);
      menu.querySelectorAll('.cdr-mention-item').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          insertMention(btn.dataset.path);
        });
      });
    }

    async function refreshItems() {
      const root = getRoot();
      if (!root) {
        items = [];
        return;
      }
      try {
        items = await listFiles(root);
      } catch {
        items = [];
      }
    }

    input.addEventListener('input', async () => {
      const v = input.value;
      const pos = input.selectionStart ?? v.length;
      const before = v.slice(0, pos);
      const m = before.match(/@([^\s@]*)$/);
      if (!m) {
        closeMenu();
        return;
      }
      if (!items.length) await refreshItems();
      renderMenu(m[1]);
    });

    input.addEventListener('keydown', (e) => {
      if (!menu) return;
      const buttons = [...menu.querySelectorAll('.cdr-mention-item')];
      if (!buttons.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % buttons.length;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + buttons.length) % buttons.length;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (menu) {
          e.preventDefault();
          const btn = buttons[activeIdx];
          if (btn) insertMention(btn.dataset.path);
        }
        return;
      } else if (e.key === 'Escape') {
        closeMenu();
        return;
      } else {
        return;
      }
      buttons.forEach((b, i) => b.classList.toggle('active', i === activeIdx));
    });

    input.addEventListener('blur', () => setTimeout(closeMenu, 120));

    return closeMenu;
  }

  window.CdrMentions = { attach };
})();
