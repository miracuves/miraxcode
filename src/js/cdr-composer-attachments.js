// cdr-composer-attachments.js — drag/drop, paste, and file chips for Coder composer
(function () {
  'use strict';

  const MIME_PATH = 'application/x-miraxcode-path';
  let pendingImages = [];
  let pendingFiles = [];
  let mounted = false;
  let getTab = () => null;
  let onChange = () => {};

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syncToTab() {
    const tab = getTab();
    if (!tab) return;
    tab.pendingImages = pendingImages;
    tab.pendingFiles = pendingFiles;
  }

  function loadFromTab(tab) {
    pendingImages = Array.isArray(tab?.pendingImages) ? tab.pendingImages.slice() : [];
    pendingFiles = Array.isArray(tab?.pendingFiles) ? tab.pendingFiles.slice() : [];
    render();
  }

  function hasPending() {
    return pendingImages.length > 0 || pendingFiles.length > 0;
  }

  function clear() {
    pendingImages = [];
    pendingFiles = [];
    render();
    syncToTab();
    onChange();
  }

  function render() {
    const bar = $('cdrAttachPending');
    if (!bar) return;
    const H = window._H;
    bar.innerHTML = '';
    if (!hasPending()) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    pendingImages.forEach((img, i) => {
      const chip = document.createElement('div');
      chip.className = 'cdr-attach-chip cdr-attach-chip-img';
      chip.innerHTML = `<img src="${img.dataUrl}" alt=""/><span>${escapeHtml(img.name)}</span><button type="button" class="cdr-attach-x" data-kind="img" data-i="${i}" aria-label="Remove">×</button>`;
      bar.appendChild(chip);
    });

    pendingFiles.forEach((f, i) => {
      const chip = document.createElement('div');
      chip.className = 'cdr-attach-chip cdr-attach-chip-file';
      const extra = f.kind === 'pdf' && f.pages ? ` · ${f.pages}p` : '';
      const chars = H?.fileCharLabel?.(f.chars) || '';
      const icon = H?.fileKindIcon?.(f.kind) || '';
      chip.innerHTML = `<span class="cdr-attach-chip-label">${icon} ${escapeHtml(f.name)}${extra}${chars ? ` · ${chars}` : ''}</span><button type="button" class="cdr-attach-x" data-kind="file" data-i="${i}" aria-label="Remove">×</button>`;
      bar.appendChild(chip);
    });

    bar.querySelectorAll('.cdr-attach-x').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.i, 10);
        if (btn.dataset.kind === 'img') pendingImages.splice(idx, 1);
        else pendingFiles.splice(idx, 1);
        render();
        syncToTab();
        onChange();
      });
    });
  }

  async function addFileList(fileList) {
    const H = window._H;
    if (!H || !fileList?.length) return;
    const files = Array.from(fileList).filter(Boolean);
    const imgs = files.filter(f => f.type?.startsWith('image/'));
    const docs = files.filter(f => !f.type?.startsWith('image/'));
    if (imgs.length && H.ingestImagesFromList) {
      pendingImages.push(...(await H.ingestImagesFromList(imgs)));
    }
    if (docs.length && H.ingestFilesFromList) {
      pendingFiles.push(...(await H.ingestFilesFromList(docs, { addToRag: false })));
    }
    render();
    syncToTab();
    onChange();
    HC?.guard?.notify?.(`Attached ${files.length} file${files.length !== 1 ? 's' : ''}`, 'info');
  }

  async function pathToFile(path) {
    if (!path || !HC?.isTauri || !HC?.invoke) return null;
    const name = path.split('/').pop() || 'file';
    const lower = name.toLowerCase();
    const maxBytes = 18 * 1024 * 1024;
    try {
      const res = await HC.invoke('shell_run', {
        command: 'sh',
        args: ['-c', `stat -f%z "${path.replace(/"/g, '\\"')}" 2>/dev/null || stat -c%s "${path.replace(/"/g, '\\"')}" 2>/dev/null`],
        cwd: null,
      });
      const sz = parseInt(String(res?.stdout || '').trim(), 10);
      if (Number.isFinite(sz) && sz > maxBytes) {
        throw new Error(`File too large (${Math.round(sz / 1024 / 1024)} MB, max 18 MB)`);
      }
    } catch { /* stat optional */ }

    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(lower)) {
      const b64res = await HC.invoke('shell_run', {
        command: 'sh',
        args: ['-c', `base64 < "${path.replace(/"/g, '\\"')}"`],
        cwd: null,
      });
      const b64 = String(b64res?.stdout || '').replace(/\s/g, '');
      if (!b64) return null;
      const mime = /\.png$/i.test(lower) ? 'image/png'
        : /\.gif$/i.test(lower) ? 'image/gif'
        : /\.webp$/i.test(lower) ? 'image/webp'
        : 'image/jpeg';
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new File([u8], name, { type: mime });
    }
    if (/\.pdf$/i.test(lower)) {
      const b64res = await HC.invoke('shell_run', {
        command: 'sh',
        args: ['-c', `base64 < "${path.replace(/"/g, '\\"')}"`],
        cwd: null,
      });
      const b64 = String(b64res?.stdout || '').replace(/\s/g, '');
      if (!b64) return null;
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new File([u8], name, { type: 'application/pdf' });
    }
    return null;
  }

  async function addPaths(paths) {
    const H = window._H;
    const fileObjs = [];
    for (const raw of paths) {
      const path = String(raw || '').trim();
      if (!path || path.endsWith('/')) continue;
      const name = path.split('/').pop();
      const blobFile = await pathToFile(path);
      if (blobFile) {
        fileObjs.push(blobFile);
        continue;
      }
      if (!HC?.code?.readFile) continue;
      try {
        const ok = await HC.guard?.request?.('read', path, 'Attach file to Coder message');
        if (ok === false) continue;
        const text = await HC.code.readFile(path);
        if (String(text).startsWith('[Binary file:')) {
          pendingFiles.push({
            name,
            kind: 'binary',
            path,
            chars: 0,
            extracted: false,
            text: String(text),
          });
        } else {
          pendingFiles.push({
            name,
            kind: 'text',
            path,
            chars: text.trim().length,
            extracted: true,
            text: text.slice(0, 200_000),
          });
        }
      } catch (err) {
        console.warn('[cdr-attach] path read failed:', path, err);
        HC?.guard?.notify?.(`Could not attach ${name}: ${err.message || err}`, 'err');
      }
    }
    if (fileObjs.length) await addFileList(fileObjs);
    if (pendingFiles.length) {
      render();
      syncToTab();
      onChange();
    }
  }

  function collectPathsFromDataTransfer(dt) {
    const out = [];
    if (!dt) return out;
    const custom = dt.getData(MIME_PATH);
    if (custom) out.push(custom);
    const plain = dt.getData('text/plain');
    if (plain && (plain.startsWith('/') || plain.match(/^[A-Za-z]:\\/))) out.push(plain.trim());
    return [...new Set(out)];
  }

  function wireDropTarget(el) {
    if (!el || el.dataset.cdrDropWired === '1') return;
    el.dataset.cdrDropWired = '1';

    const inputWrap = $('cdrInputWrap');
    const setDropHighlight = (on) => {
      el.classList.toggle('cdr-drop-active', on);
      if (inputWrap && el !== inputWrap) inputWrap.classList.toggle('cdr-drop-active', on);
    };
    el.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDropHighlight(true);
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setDropHighlight(true);
    });
    el.addEventListener('dragleave', (e) => {
      if (!el.contains(e.relatedTarget)) setDropHighlight(false);
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDropHighlight(false);
      const paths = collectPathsFromDataTransfer(e.dataTransfer);
      const files = Array.from(e.dataTransfer?.files || []);
      if (paths.length) await addPaths(paths);
      if (files.length) await addFileList(files);
    });
  }

  function mount(opts = {}) {
    if (mounted) return;
    mounted = true;
    getTab = opts.getTab || getTab;
    onChange = opts.onChange || onChange;

    const wrap = $('cdrInputWrap');
    const composer = document.querySelector('.cdr-composer');
    const input = $('cdrTaskInput');
    wireDropTarget(wrap);
    wireDropTarget(composer);

    if (input) {
      input.addEventListener('paste', async (e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const imgs = items
          .filter(it => it.type.startsWith('image/'))
          .map(it => it.getAsFile())
          .filter(Boolean);
        const files = items
          .filter(it => it.kind === 'file' && !it.type.startsWith('image/'))
          .map(it => it.getAsFile())
          .filter(Boolean);
        if (!imgs.length && !files.length) return;
        e.preventDefault();
        e.stopPropagation();
        await addFileList([...imgs, ...files]);
      });
    }

    const imgIn = $('cdrAttachImgInput');
    const fileIn = $('cdrAttachFileInput');
    $('cdrAttachImgBtn')?.addEventListener('click', () => imgIn?.click());
    $('cdrAttachFileBtn')?.addEventListener('click', () => fileIn?.click());
    imgIn?.addEventListener('change', (e) => {
      addFileList(e.target.files).finally(() => { imgIn.value = ''; });
    });
    fileIn?.addEventListener('change', (e) => {
      addFileList(e.target.files).finally(() => { fileIn.value = ''; });
    });

    render();
  }

  function getSnapshot() {
    return {
      images: pendingImages.map(i => ({ ...i })),
      files: pendingFiles.map(f => ({ ...f })),
    };
  }

  function buildContextForSend(maxChars = 28000) {
    const H = window._H;
    return H?.buildAttachedFileContext?.(pendingFiles, maxChars) || '';
  }

  function buildUserMessagePayload(text) {
    const fileBlocks = buildContextForSend();
    const content = fileBlocks ? `${text}\n${fileBlocks}` : text;
    const msg = { role: 'user', content };
    if (pendingImages.length) {
      msg.images = pendingImages.map(i => i.base64).filter(Boolean);
    }
    if (pendingFiles.length) {
      msg.attachments = pendingFiles.map(f => ({
        name: f.name,
        kind: f.kind || 'file',
        path: f.path,
        pages: f.pages,
        chars: f.chars,
        extracted: f.extracted,
      }));
    }
    return msg;
  }

  function renderUserAttachmentHtml() {
    if (!hasPending()) return '';
    const parts = [];
    pendingImages.forEach(img => {
      parts.push(`<div class="cdr-user-attach-img"><img src="${img.dataUrl}" alt="${escapeHtml(img.name)}"/></div>`);
    });
    pendingFiles.forEach(f => {
      const extra = f.kind === 'pdf' && f.pages ? ` · ${f.pages}p` : '';
      parts.push(`<div class="cdr-user-attach-file">📎 ${escapeHtml(f.name)}${extra}</div>`);
    });
    return `<div class="cdr-user-attachments">${parts.join('')}</div>`;
  }

  /** Set explorer file rows draggable and emit path payload. */
  function wireExplorerEntry(item, fullPath, isDir) {
    if (!item || isDir) return;
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData(MIME_PATH, fullPath);
      e.dataTransfer.setData('text/plain', fullPath);
      e.dataTransfer.effectAllowed = 'copy';
      item.classList.add('cdr-tree-dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('cdr-tree-dragging'));
  }

  window.CdrComposerAttachments = {
    mount,
    loadFromTab,
    syncToTab,
    clear,
    render,
    hasPending,
    getSnapshot,
    addFileList,
    addPaths,
    buildContextForSend,
    buildUserMessagePayload,
    renderUserAttachmentHtml,
    wireExplorerEntry,
    MIME_PATH,
  };
})();
