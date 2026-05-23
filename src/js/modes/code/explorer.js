import { $, esc, baseName, setExplorerRootLabel } from './dom-utils.js';

/**
 * Coder file explorer: context menu, project tree, session files, symbol index.
 */
export function createExplorerApi(ctx) {
  const {
    sharedState,
    relativeFromRoot,
    getConversationMsgs,
    getEditorPane,
    getIdeCtx,
    setActiveFile,
    syncProjectLabel,
    onTabNew,
    autoResize,
    terminalLog,
    terminalPrompt,
    syncTerminalPrompt,
    getSysPrompt,
    refreshGraphifyForProject,
    loadGraphifyContextForTask,
    clearGraphifyContext,
    refreshGitStatus,
    saveCoderState,
    setStatus,
    symbolFilters,
  } = ctx;

  let _symbolFilter = symbolFilters?.filter ?? '';
  let _symbolKindFilter = symbolFilters?.kindFilter ?? '';

  // ── Explorer context menu (Cursor-style) ───────────────────
  let _explorerCtxTarget = null;
  let _explorerCtxMenu = null;

  function explorerCtxMenuEl() {
    if (_explorerCtxMenu) return _explorerCtxMenu;
    const menu = document.createElement('div');
    menu.id = 'cdrExplorerCtxMenu';
    menu.className = 'cdr-ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('click', e => e.stopPropagation());
    menu.addEventListener('contextmenu', e => e.stopPropagation());
    _explorerCtxMenu = menu;
    document.addEventListener('click', () => hideExplorerContextMenu());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') hideExplorerContextMenu();
    });
    window.addEventListener('blur', () => hideExplorerContextMenu());
    window.addEventListener('resize', () => hideExplorerContextMenu());
    return menu;
  }

  function hideExplorerContextMenu() {
    const menu = _explorerCtxMenu;
    if (!menu) return;
    menu.classList.remove('open');
    menu.hidden = true;
    menu.innerHTML = '';
    _explorerCtxTarget = null;
  }

  function ctxMenuItem(label, { shortcut, danger, disabled, onClick } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cdr-ctx-item' + (danger ? ' danger' : '');
    btn.setAttribute('role', 'menuitem');
    btn.disabled = !!disabled;
    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
    if (shortcut) {
      const sc = document.createElement('span');
      sc.className = 'cdr-ctx-shortcut';
      sc.textContent = shortcut;
      btn.appendChild(sc);
    }
    if (!disabled && onClick) {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        hideExplorerContextMenu();
        void onClick();
      });
    }
    return btn;
  }

  function ctxMenuSep() {
    const sep = document.createElement('div');
    sep.className = 'cdr-ctx-sep';
    sep.setAttribute('role', 'separator');
    return sep;
  }

  function copyClipboard(text) {
    const t = String(text || '');
    if (!t) return;
    navigator.clipboard?.writeText(t)?.catch(() => {});
  }

  function shellEscapePath(p) {
    return String(p || '').replace(/'/g, "'\\''");
  }

  async function revealInFinder(path) {
    if (!path || !HC?.isTauri) return;
    try {
      if (window.__TAURI__?.opener?.revealItemInDir) {
        await window.__TAURI__.opener.revealItemInDir(path);
        return;
      }
    } catch {}
    await HC.invoke('shell_run', { command: 'open', args: ['-R', path], cwd: null });
  }

  async function openPathExternal(path) {
    if (!path || !HC?.isTauri) return;
    try {
      if (window.__TAURI__?.opener?.openPath) {
        await window.__TAURI__.opener.openPath(path);
        return;
      }
    } catch {}
    await HC.invoke('shell_run', { command: 'open', args: [path], cwd: null });
  }

  function focusIntegratedTerminal() {
    const panel = $('cdrTerminalPanel');
    const input = $('cdrTerminalInput');
    if (panel) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    input?.focus();
    return input;
  }

  async function openInIntegratedTerminal(path, isDir) {
    const cwd = isDir ? path : (path.replace(/\/[^/]+$/, '') || path);
    const input = focusIntegratedTerminal();
    if (!cwd) return;
    const cmd = `cd '${shellEscapePath(cwd)}' && pwd`;
    if (input) {
      input.value = `cd '${shellEscapePath(cwd)}'`;
      input.focus();
    }
    if (!HC?.isTauri) {
      terminalLog('Terminal requires Tauri backend.', 'cdr-terminal-error');
      return;
    }
    terminalLog(`${terminalPrompt()} ${cmd}`, 'cdr-terminal-prompt');
    try {
      const result = await HC.invoke('shell_run', {
        command: 'sh',
        args: ['-c', cmd],
        cwd: sharedState.projectRoot || undefined,
      });
      if (result?.stdout) result.stdout.split('\n').forEach(l => { if (l) terminalLog(l); });
      if (result?.stderr) result.stderr.split('\n').forEach(l => { if (l) terminalLog(l, 'cdr-terminal-error'); });
    } catch (err) {
      terminalLog(String(err?.message || err), 'cdr-terminal-error');
    }
  }

  function appendFileToComposer(path, { newSession = false, isDir = false } = {}) {
    if (newSession) onTabNew();
    const ti = $('cdrTaskInput');
    if (!ti) return;
    const rel = relativeFromRoot(path);
    const block = isDir
      ? `\n\n[Folder context: \`${rel}\`]\nFull path: ${path}\nPlease explore this folder and summarize its structure.\n`
      : `\n\n[File context: \`${rel}\`]\nFull path: ${path}\nPlease read this file and use it in your response.\n`;
    ti.value = (ti.value.trim() ? ti.value.trim() + '\n' : '') + block;
    autoResize(ti);
    ti.focus();
    setActiveFile(path);
    document.querySelectorAll('.cdr-tree-entry').forEach(el => {
      el.classList.toggle('active', el.dataset.path === path);
    });
    HC?.guard?.notify?.(`Added ${rel} to Coder chat`, 'info');
  }

  async function copyFileContents(path) {
    if (!HC?.code?.readFile) return;
    try {
      const content = await HC.code.readFile(path);
      copyClipboard(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
      HC?.guard?.notify?.('File contents copied', 'info');
    } catch (e) {
      HC?.guard?.notify?.(String(e?.message || e), 'err');
    }
  }

  async function renameExplorerPath(path, isDir) {
    const base = path.split('/').filter(Boolean).pop() || path;
    const next = window.prompt(isDir ? 'Rename folder to:' : 'Rename file to:', base);
    if (!next || next === base) return;
    if (next.includes('/') || next.includes('\\')) {
      HC?.guard?.notify?.('Name cannot contain path separators', 'err');
      return;
    }
    const parent = path.replace(/\/[^/]+$/, '') || '/';
    const dest = `${parent}/${next}`;
    const ok = await HC.guard.request('write', path, `Rename to ${next}`);
    if (!ok) return;
    try {
      await HC.invoke('shell_run', { command: 'mv', args: [path, dest], cwd: null });
      HC?.guard?.notify?.('Renamed', 'info');
      if (sharedState.projectRoot) await renderExplorerTree(sharedState.projectRoot);
      if (sharedState.activeFile === path) setActiveFile(dest);
    } catch (e) {
      HC?.guard?.notify?.(String(e?.message || e), 'err');
    }
  }

  async function deleteExplorerPath(path, isDir) {
    const label = isDir ? 'folder' : 'file';
    if (!window.confirm(`Delete this ${label}?\n\n${path}\n\nThis cannot be undone.`)) return;
    const ok = await HC.guard.request('delete', path, `Delete ${label}`);
    if (!ok) return;
    try {
      if (isDir) {
        await HC.invoke('shell_run', { command: 'rm', args: ['-rf', path], cwd: null });
      } else {
        await HC.code.deleteFile(path, `Delete ${label}`);
      }
      HC?.guard?.notify?.('Deleted', 'info');
      if (sharedState.activeFile === path) sharedState.activeFile = null;
      if (sharedState.projectRoot) await renderExplorerTree(sharedState.projectRoot);
    } catch (e) {
      HC?.guard?.notify?.(String(e?.message || e), 'err');
    }
  }

  function toggleDirEntry(entryEl) {
    entryEl?.click();
  }

  function showExplorerContextMenu(event, entryEl) {
    const path = entryEl?.dataset?.path;
    if (!path) return;
    event.preventDefault();
    event.stopPropagation();
    const isDir = entryEl.dataset.isDir === '1' || entryEl.classList.contains('dir');
    _explorerCtxTarget = { path, isDir, el: entryEl };
    const menu = explorerCtxMenuEl();
    menu.innerHTML = '';

    if (isDir) {
      menu.appendChild(ctxMenuItem('Expand / Collapse', { onClick: () => toggleDirEntry(entryEl) }));
    } else {
      menu.appendChild(ctxMenuItem('Open', { onClick: () => {
        document.querySelectorAll('.cdr-tree-entry').forEach(el => el.classList.remove('active'));
        entryEl.classList.add('active');
        setActiveFile(path);
        void openPathExternal(path);
      } }));
    }

    menu.appendChild(ctxMenuSep());
    menu.appendChild(ctxMenuItem('Reveal in Finder', {
      shortcut: '⌥⌘R',
      disabled: !HC?.isTauri,
      onClick: () => revealInFinder(path),
    }));
    menu.appendChild(ctxMenuItem('Open in Integrated Terminal', {
      disabled: !HC?.isTauri,
      onClick: () => openInIntegratedTerminal(path, isDir),
    }));

    menu.appendChild(ctxMenuSep());
    menu.appendChild(ctxMenuItem('Add to Coder Chat', {
      onClick: () => appendFileToComposer(path, { newSession: false, isDir }),
    }));
    menu.appendChild(ctxMenuItem('Add to New Coder Session', {
      onClick: () => appendFileToComposer(path, { newSession: true, isDir }),
    }));

    menu.appendChild(ctxMenuSep());
    menu.appendChild(ctxMenuItem('Copy Path', {
      shortcut: '⌥⌘C',
      onClick: () => { copyClipboard(path); HC?.guard?.notify?.('Path copied', 'info'); },
    }));
    menu.appendChild(ctxMenuItem('Copy Relative Path', {
      shortcut: '⌥⇧⌘C',
      onClick: () => {
        copyClipboard(relativeFromRoot(path));
        HC?.guard?.notify?.('Relative path copied', 'info');
      },
    }));
    if (!isDir) {
      menu.appendChild(ctxMenuItem('Copy File Contents', {
        shortcut: '⌘C',
        disabled: !HC?.isTauri,
        onClick: () => copyFileContents(path),
      }));
    }

    menu.appendChild(ctxMenuSep());
    menu.appendChild(ctxMenuItem('Rename…', {
      disabled: !HC?.isTauri,
      onClick: () => renameExplorerPath(path, isDir),
    }));
    menu.appendChild(ctxMenuItem('Delete', {
      shortcut: '⌘⌫',
      danger: true,
      disabled: !HC?.isTauri,
      onClick: () => deleteExplorerPath(path, isDir),
    }));

    menu.hidden = false;
    menu.classList.add('open');
    const pad = 8;
    const mw = menu.offsetWidth || 248;
    const mh = menu.offsetHeight || 200;
    let x = event.clientX;
    let y = event.clientY;
    if (x + mw > window.innerWidth - pad) x = window.innerWidth - mw - pad;
    if (y + mh > window.innerHeight - pad) y = window.innerHeight - mh - pad;
    menu.style.left = `${Math.max(pad, x)}px`;
    menu.style.top = `${Math.max(pad, y)}px`;
  }

  function initExplorerContextMenu() {
    const body = $('cdrExplorerBody');
    if (!body || body.dataset.ctxWired === '1') return;
    body.dataset.ctxWired = '1';
    body.addEventListener('contextmenu', e => {
      const entry = e.target.closest('.cdr-tree-entry[data-path]');
      if (!entry) return;
      showExplorerContextMenu(e, entry);
    });
  }

  // ── Explorer ──────────────────────────────────────────────
  function toggleExplorer() {
    const sidebar = $('cdrSidebar');
    const body = $('cdrBody');
    if (!sidebar) return;
    const opening = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', opening);
    if (body) body.classList.toggle('has-sidebar', opening);
    if (opening && sharedState.projectRoot) {
      renderExplorerTree(sharedState.projectRoot);
    }
  }

  async function pickFolder() {
    if (window.HC?.isTauri && window.HC?.invoke) {
      let pluginAvailable = true;
      try {
        const folder = await window.HC.invoke('plugin:dialog|open', {
          options: { directory: true, multiple: false, title: 'Open Project Folder' }
        });
        return (typeof folder === 'string' && folder) ? folder : null;
      } catch (e) {
        pluginAvailable = false;
        console.warn('[CoderMode] dialog plugin unavailable, using AppleScript fallback:', e?.message || e);
      }
      if (!pluginAvailable) {
        try {
          const out = await window.HC.invoke('shell_run', {
            command: 'osascript',
            args: ['-e', 'POSIX path of (choose folder with prompt "Open Project Folder")']
          });
          if (out?.code === 0) {
            const stdout = (out?.stdout || '').trim();
            return stdout ? stdout.replace(/\/$/, '') : null;
          }
          return null;
        } catch (e) { console.warn('[CoderMode] osascript folder:', e); return null; }
      }
      return null;
    }
    if (window.showDirectoryPicker) {
      try { const dirHandle = await window.showDirectoryPicker(); return dirHandle.name; }
      catch { return null; }
    }
    return null;
  }

  async function pickFile() {
    if (window.HC?.isTauri && window.HC?.invoke) {
      let pluginAvailable = true;
      try {
        const file = await window.HC.invoke('plugin:dialog|open', {
          options: { multiple: false, title: 'Open File' }
        });
        return (typeof file === 'string' && file) ? file : null;
      } catch (e) {
        pluginAvailable = false;
        console.warn('[CoderMode] dialog plugin unavailable, using AppleScript fallback:', e?.message || e);
      }
      if (!pluginAvailable) {
        try {
          const out = await window.HC.invoke('shell_run', {
            command: 'osascript',
            args: ['-e', 'POSIX path of (choose file with prompt "Open File")']
          });
          if (out?.code === 0) {
            const stdout = (out?.stdout || '').trim();
            return stdout || null;
          }
          return null;
        } catch (e) { console.warn('[CoderMode] osascript file:', e); return null; }
      }
      return null;
    }
    if (window.showOpenFilePicker) {
      try { const [fh] = await window.showOpenFilePicker(); return fh.name; }
      catch { return null; }
    }
    return null;
  }

  async function openProject() {
    const folder = await pickFolder();
    if (!folder || typeof folder !== 'string') return;
    sharedState.projectRoot = folder;
    HC?.guard?.setProjectRoot?.(folder);
    if (HC?.code) HC.code.getProjectRoot = () => sharedState.projectRoot;
    void refreshGraphifyForProject({ force: false });
    const msgs = getConversationMsgs();
    if (msgs.length && msgs[0]?.role === 'system') {
      msgs[0].content = getSysPrompt();
    } else if (!msgs.length) {
      clearGraphifyContext?.();
      void (async () => {
        await loadGraphifyContextForTask('project structure overview');
        const after = getConversationMsgs();
        if (!after.length) {
          after.push({ role: 'system', content: getSysPrompt() });
        }
      })();
    }
    syncProjectLabel();
    syncTerminalPrompt();
    setExplorerRootLabel(folder);
    await renderExplorerTree(folder);
    refreshGitStatus();
    getIdeCtx()?.updateTrustChip?.();
    scanProjectSymbols(folder);
    void ingestProjectRag(folder);
    void runProjectLintChecks(folder);
    try {
      const top = await HC.code.listDir(folder);
      const hint = (top || []).map((e) => ({ path: e.name, name: e.name }));
      const langs = await window.CdrLspClient?.startForProject?.(folder, hint);
      if (langs?.length) {
        HC?.guard?.notify?.(`LSP: ${langs.join(', ')}`, 'ok');
      }
    } catch (e) {
      console.warn('[CoderMode] LSP start:', e);
    }
    const sidebar = $('cdrSidebar');
    const body = $('cdrBody');
    if (sidebar) sidebar.classList.add('open');
    if (body) body.classList.add('has-sidebar');
    saveCoderState();
  }

  async function openFile() {
    const file = await pickFile();
    if (!file || typeof file !== 'string') return;
    setActiveFile(file);
    const ti = $('cdrTaskInput');
    if (ti && !ti.value.trim()) ti.value = `Read and summarize: ${file}`;
  }

  // ── AI session files ───────────────────────────────────────
  const _aiSessionFiles = new Set();

  function clearFilesPanel() {
    _aiSessionFiles.clear();
    sharedState.projectRoot = null;
    sharedState.activeFile = null;
    sharedState.projectSymbols = {};
    window.CdrLspClient?.stopAll?.();
    HC?.guard?.clearProjectRoot?.();
    syncProjectLabel();
    syncTerminalPrompt();
    setExplorerRootLabel(null);
    const body = $('cdrExplorerBody');
    if (body) body.innerHTML = '<div class="cdr-tree-empty">Open a project or file to start.</div>';
    saveCoderState();
    setStatus('Files cleared', 'ok');
  }

  function addAIFileToExplorer(filePath, kind) {
    if (!filePath || typeof filePath !== 'string') return;
    if (_aiSessionFiles.has(filePath)) return;
    _aiSessionFiles.add(filePath);
    const body = $('cdrExplorerBody');
    if (!body) return;
    let section = document.getElementById('cdrAISessionSection');
    if (!section) {
      section = document.createElement('div');
      section.id = 'cdrAISessionSection';
      section.className = 'cdr-ai-session-section';
      section.innerHTML = `
          <div class="cdr-ai-session-hd">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>
            <span>SESSION FILES</span>
          </div>
          <div class="cdr-ai-session-list" id="cdrAISessionList"></div>`;
      body.prepend(section);
    }
    const list = document.getElementById('cdrAISessionList');
    if (!list) return;
    const empty = body.querySelector('.cdr-tree-empty');
    if (empty) empty.remove();
    const row = document.createElement('div');
    row.className = 'cdr-tree-entry cdr-ai-file' + (kind === 'delete' ? ' deleted' : '');
    const name = baseName(filePath);
    const displayPath = relativeFromRoot(filePath);
    const icon = kind === 'delete'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
    row.innerHTML = `${icon}<span class="cdr-tree-text"><span class="cdr-tree-name">${esc(name)}</span><span class="cdr-tree-path">${esc(displayPath)}</span></span>`;
    row.title = filePath;
    row.dataset.path = filePath;
    row.dataset.isDir = '0';
    row.addEventListener('click', () => {
      setActiveFile(filePath);
      const ti = $('cdrTaskInput');
      if (ti && !ti.value.trim()) ti.value = `Review changes in: ${filePath}`;
    });
    list.appendChild(row);
  }

  async function renderExplorerTree(dir, parentEl, depth) {
    if (!window.HC?.isTauri) return;
    const container = parentEl || $('cdrExplorerBody');
    if (!container) return;
    if (!parentEl) container.innerHTML = '<div class="cdr-tree-empty">Loading…</div>';
    try {
      const entries = await HC.code.listDir(dir);
      if (!parentEl) container.innerHTML = '';
      if (!entries?.length) {
        if (!parentEl) container.innerHTML = '<div class="cdr-tree-empty">Empty directory</div>';
        return;
      }
      const sorted = [...entries].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      const editorPane = getEditorPane();
      for (const entry of sorted) {
        if (entry.name.startsWith('.') && !entry.name.match(/^\.env/)) continue;
        const item = document.createElement('div');
        item.className = 'cdr-tree-entry' + (entry.is_dir ? ' dir' : '');
        item.style.paddingLeft = `${7 + (depth || 0) * 12}px`;
        const fullPath = entry.path || `${dir.endsWith('/') ? dir : dir + '/'}${entry.name}`;
        const en = esc(entry.name);
        item.dataset.path = fullPath;
        item.dataset.isDir = entry.is_dir ? '1' : '0';
        item.innerHTML = entry.is_dir
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span class="cdr-tree-name">${en}</span>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg><span class="cdr-tree-name">${en}</span>`;
        item.title = fullPath;
        window.CdrComposerAttachments?.wireExplorerEntry?.(item, fullPath, entry.is_dir);
        item.addEventListener('click', async e => {
          e.stopPropagation();
          if (entry.is_dir) {
            const existing = item.nextElementSibling;
            if (existing?.classList.contains('cdr-tree-subtree')) {
              existing.remove(); item.classList.remove('open');
            } else {
              item.classList.add('open');
              const sub = document.createElement('div');
              sub.className = 'cdr-tree-subtree';
              item.after(sub);
              await renderExplorerTree(fullPath, sub, (depth || 0) + 1);
            }
          } else {
            document.querySelectorAll('.cdr-tree-entry').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            setActiveFile(fullPath);
            editorPane?.openFile(fullPath).catch(() => {});
            const ti = $('cdrTaskInput');
            if (ti && !ti.value.trim()) ti.value = `Read and summarize: ${fullPath}`;
          }
        });
        container.appendChild(item);
      }
    } catch (e) {
      if (!parentEl) container.innerHTML = `<div class="cdr-tree-empty">Error: ${esc(String(e?.message || e))}</div>`;
    }
  }

  // ── Project symbol index ──────────────────────────────────
  const SYMBOL_PATTERNS = {
    js:  /(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)|(?:export\s+(?:default\s+)?)?class\s+(\w+)/g,
    ts:  /(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)|(?:export\s+(?:default\s+)?)?class\s+(\w+)/g,
    py:  /^(?:async\s+)?def\s+(\w+)|^class\s+(\w+)/gm,
    rs:  /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)|(?:pub\s+)?struct\s+(\w+)|(?:pub\s+)?enum\s+(\w+)|(?:pub\s+)?trait\s+(\w+)|impl(?:\s+<[^>]+>)?\s+(?:\w+\s+for\s+)?(\w+)/g,
    go:  /^func\s+(?:\([^)]+\)\s+)?(\w+)|^type\s+(\w+)/gm,
    java:/(?:public|private|protected)\s+(?:static\s+)?(?:<[^>]+>\s+)?\w+(?:<[^>]+>)?(?:\[\])?\s+(\w+)\s*\(|^\s*(?:public\s+)?class\s+(\w+)/gm,
    c:   /^\s*(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{/gm,
    cpp: /^\s*(?:\w+(?:\s*::\s*\w+)?\s+)+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{|^\s*class\s+(\w+)/gm,
    rb:  /^(?:def\s+(?:self\.)?(\w+)|class\s+(\w+)|module\s+(\w+))/gm,
  };
  const SYMBOL_EXT_MAP = {
    js:'js', ts:'ts', tsx:'ts', jsx:'js',
    py:'py', rs:'rs', go:'go',
    java:'java', c:'c', cpp:'cpp', h:'c', hpp:'cpp',
    rb:'rb', rake:'rb',
  };

  async function scanProjectSymbols(root) {
    if (!window.HC?.isTauri || !root) return;
    const symbols = {};
    try {
      const entries = await HC.code.listDir(root);
      if (!entries) return;
      const files = entries.filter(e => !e.is_dir && !e.name.startsWith('.') && !e.name.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|ttf|eot|mp3|mp4|pdf|zip|tar|gz|bin|exe|dll|so|dylib)$/i));
      for (const f of files) {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        const lang = SYMBOL_EXT_MAP[ext];
        if (!lang) continue;
        try {
          const content = await HC.code.readFile(f.path);
          const text = typeof content === 'string' ? content : JSON.stringify(content);
          const pat = SYMBOL_PATTERNS[lang];
          if (!pat) continue;
          pat.lastIndex = 0;
          const matches = [];
          let m;
          while ((m = pat.exec(text)) !== null) {
            const name = m[1] || m[2] || m[3] || m[4] || m[5];
            if (name && name.length < 80 && !name.match(/^(if|else|for|while|switch|catch|return|throw|try|new|this|self|super)$/)) {
              const line = text.slice(0, m.index).split('\n').length;
              const kind = m[0].includes('class') ? 'class' : m[0].includes('struct') ? 'struct' : m[0].includes('enum') ? 'enum' : m[0].includes('interface') ? 'interface' : m[0].includes('trait') ? 'trait' : m[0].includes('type') ? 'type' : 'fn';
              matches.push({ name, kind, line });
            }
          }
          if (matches.length) symbols[f.path] = matches.slice(0, 30);
        } catch {}
      }
    } catch (e) { console.warn('[CoderMode] scan symbols:', e); }
    sharedState.projectSymbols = symbols;
    renderSymbolTree();
  }

  async function ingestProjectRag(folder) {
    try {
      const r = await window.CdrProjectRag?.ingestProject?.(folder);
      if (r?.ingested > 0) {
        HC?.guard?.notify?.(`Indexed ${r.ingested} project files for RAG (@codebase)`, 'info');
      } else if (r?.skipped === 'rag_disabled') {
        HC?.guard?.notify?.('Enable RAG in Agents tab to index this project', 'info');
      }
    } catch (e) {
      console.warn('[CoderMode] RAG ingest:', e);
    }
  }

  async function runProjectLintChecks(folder) {
    const ideCtx = getIdeCtx();
    if (!ideCtx?.reportProblems) return;
    try {
      await window.CdrProjectLint?.runProjectChecks?.(folder, (items) => {
        if (items?.length) ideCtx.reportProblems(items);
      });
    } catch (e) {
      console.warn('[CoderMode] project lint:', e);
    }
  }

  async function goToDefinition(symbol, fromPath) {
    const editorPane = getEditorPane();
    if (fromPath && window.CdrLspClient?.sessionForPath?.(fromPath)) {
      const line = editorPane?.editor?.getPosition?.()?.lineNumber || 1;
      const col = editorPane?.editor?.getPosition?.()?.column || 1;
      const lspLoc = await window.CdrLspClient.definition(fromPath, line, col);
      if (lspLoc?.path) {
        setActiveFile(lspLoc.path);
        editorPane?.openFile(lspLoc.path, lspLoc.line, lspLoc.column).catch(() => {});
        return;
      }
    }
    if (!window.CdrGoto?.findDefinition) return;
    const loc = await window.CdrGoto.findDefinition({
      symbol,
      path: fromPath,
      projectRoot: sharedState.projectRoot,
      projectSymbols: sharedState.projectSymbols,
      readFile: (p) => HC.code.readFile(p),
      grepCode: (dir, pat, ext) => HC.code.grepCode(dir, pat, ext),
    });
    if (!loc?.path) {
      HC?.guard?.notify?.(`No definition found for "${symbol}"`, 'info');
      return;
    }
    setActiveFile(loc.path);
    editorPane?.openFile(loc.path, loc.line, loc.col).catch(() => {});
  }

  function symbolMatchesFilter(s, fileName, q) {
    if (_symbolKindFilter && s.kind !== _symbolKindFilter) return false;
    if (!q) return true;
    const hay = `${s.name} ${s.kind} ${fileName}`.toLowerCase();
    return hay.includes(q);
  }

  function renderSymbolTree() {
    const container = $('cdrExplorerBody');
    if (!container) return;
    const syms = sharedState.projectSymbols || {};
    let section = container.querySelector('.cdr-symbols-section');
    if (!Object.keys(syms).length) {
      section?.remove();
      return;
    }
    const q = _symbolFilter.trim().toLowerCase();
    if (!section) {
      section = document.createElement('div');
      section.className = 'cdr-symbols-section';
      section.innerHTML = `
          <div class="cdr-symbol-filter-bar">
            <div class="cdr-sidebar-title">Symbols</div>
            <input type="search" class="cdr-symbol-filter-input" id="cdrSymbolFilter" placeholder="Filter symbols…" spellcheck="false" autocomplete="off"/>
            <div class="cdr-symbol-kinds" id="cdrSymbolKinds">
              <button type="button" class="cdr-symbol-kind active" data-kind="">all</button>
              <button type="button" class="cdr-symbol-kind" data-kind="fn">fn</button>
              <button type="button" class="cdr-symbol-kind" data-kind="class">class</button>
              <button type="button" class="cdr-symbol-kind" data-kind="type">type</button>
              <button type="button" class="cdr-symbol-kind" data-kind="interface">iface</button>
            </div>
          </div>
          <div class="cdr-symbol-list" id="cdrSymbolList"></div>`;
      container.appendChild(section);
      const filterInput = section.querySelector('#cdrSymbolFilter');
      filterInput?.addEventListener('input', () => {
        _symbolFilter = filterInput.value;
        if (symbolFilters) symbolFilters.filter = _symbolFilter;
        renderSymbolTree();
      });
      section.querySelector('#cdrSymbolKinds')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.cdr-symbol-kind');
        if (!btn) return;
        _symbolKindFilter = btn.dataset.kind || '';
        if (symbolFilters) symbolFilters.kindFilter = _symbolKindFilter;
        section.querySelectorAll('.cdr-symbol-kind').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
        renderSymbolTree();
      });
    }
    const filterInput = section.querySelector('#cdrSymbolFilter');
    if (filterInput && filterInput.value !== _symbolFilter) filterInput.value = _symbolFilter;
    const listRoot = section.querySelector('#cdrSymbolList');
    if (!listRoot) return;
    listRoot.innerHTML = '';
    let total = 0;
    const editorPane = getEditorPane();
    for (const [path, items] of Object.entries(syms)) {
      const fileName = path.split('/').pop();
      const filtered = items.filter(s => symbolMatchesFilter(s, fileName, q));
      if (!filtered.length) continue;
      total += filtered.length;
      const fileDiv = document.createElement('div');
      fileDiv.className = 'cdr-symbol-file';
      fileDiv.innerHTML = `<div class="cdr-symbol-file-name">${esc(fileName)}</div>`;
      const list = document.createElement('div');
      list.className = 'cdr-symbol-entries';
      for (const s of filtered) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cdr-tree-entry cdr-symbol-entry';
        const kindColor = { class:'var(--cdr-gold)', struct:'var(--cdr-gold)', enum:'var(--cdr-gold)', interface:'var(--cdr-gold)', trait:'var(--cdr-violet)', type:'var(--cdr-violet)', fn:'var(--cdr-cyan)' }[s.kind] || 'var(--cdr-text-dim)';
        el.innerHTML = `<span class="cdr-symbol-kind-tag" style="color:${kindColor}">${esc(s.kind)}</span><span class="cdr-symbol-name">${esc(s.name)}</span><span class="cdr-symbol-line">:${s.line}</span>`;
        el.title = `Go to ${s.kind} ${s.name} at line ${s.line}`;
        el.addEventListener('click', () => {
          setActiveFile(path);
          editorPane?.openFile(path, s.line, 1).catch(() => {});
        });
        list.appendChild(el);
      }
      fileDiv.appendChild(list);
      listRoot.appendChild(fileDiv);
    }
    if (!total) {
      listRoot.innerHTML = '<div class="cdr-git-empty">No symbols match filter</div>';
    }
  }

  return {
    initExplorerContextMenu,
    toggleExplorer,
    openProject,
    openFile,
    clearFilesPanel,
    addAIFileToExplorer,
    renderExplorerTree,
    scanProjectSymbols,
    goToDefinition,
    renderSymbolTree,
  };
}
