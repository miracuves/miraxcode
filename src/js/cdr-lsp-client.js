// cdr-lsp-client.js — external LSP (rust-analyzer, pyright, tsserver)
(function () {
  'use strict';

  const SERVER_CANDIDATES = {
    rust: [
      { cmd: 'rust-analyzer', args: [] },
    ],
    typescript: [
      { cmd: 'typescript-language-server', args: ['--stdio'] },
      { cmd: 'tsls', args: ['--stdio'] },
    ],
    javascript: [
      { cmd: 'typescript-language-server', args: ['--stdio'] },
    ],
    python: [
      { cmd: 'pyright-langserver', args: ['--stdio'] },
      { cmd: 'pyright', args: ['--server'] },
    ],
  };

  function pathToUri(p) {
    if (!p) return '';
    if (p.startsWith('file://')) return p;
    const norm = p.replace(/\\/g, '/');
    return norm.startsWith('/') ? 'file://' + norm : 'file:///' + norm;
  }

  function uriToPath(uri) {
    if (!uri) return '';
    return decodeURIComponent(uri.replace(/^file:\/\//, '').replace(/^\/([A-Za-z]:)/, '$1'));
  }

  async function invoke(cmd, args) {
    if (!window.HC?.isTauri) return null;
    return window.HC.invoke(cmd, args);
  }

  async function which(bin) {
    try {
      const r = await invoke('shell_run', {
        command: 'sh',
        args: ['-c', `command -v ${bin} 2>/dev/null || which ${bin} 2>/dev/null`],
        cwd: null,
      });
      const line = (r?.stdout || '').trim().split('\n')[0];
      return line || null;
    } catch (_) {
      return null;
    }
  }

  async function resolveServer(lang) {
    const list = SERVER_CANDIDATES[lang] || [];
    for (const s of list) {
      const path = await which(s.cmd);
      if (path) return { command: path, args: s.args.slice() };
    }
    return null;
  }

  function detectLanguages(projectRoot, treeHint) {
    const langs = new Set();
    const walk = (nodes) => {
      if (!nodes) return;
      for (const n of nodes) {
        const p = (n.path || n.name || '').toLowerCase();
        if (p.endsWith('cargo.toml')) langs.add('rust');
        if (p.endsWith('package.json')) langs.add('typescript');
        if (p.endsWith('tsconfig.json')) langs.add('typescript');
        if (p.endsWith('requirements.txt') || p.endsWith('pyproject.toml')) langs.add('python');
        if (p.endsWith('.py')) langs.add('python');
        if (p.endsWith('.rs')) langs.add('rust');
        if (p.endsWith('.ts') || p.endsWith('.tsx')) langs.add('typescript');
        if (p.endsWith('.js') || p.endsWith('.jsx')) langs.add('javascript');
        if (n.children) walk(n.children);
      }
    };
    walk(treeHint);
    if (!langs.size && projectRoot) {
      const r = (projectRoot || '').toLowerCase();
      if (r.includes('cargo')) langs.add('rust');
    }
    return [...langs];
  }

  const CdrLspClient = {
    sessions: {},
    projectRoot: null,
    openVersions: new Map(),

    async startForProject(projectRoot, treeHint) {
      this.stopAll();
      this.projectRoot = projectRoot;
      if (!window.HC?.isTauri || !projectRoot) return [];
      const langs = detectLanguages(projectRoot, treeHint);
      const started = [];
      for (const lang of langs) {
        const srv = await resolveServer(lang);
        if (!srv) continue;
        try {
          const res = await invoke('lsp_start', {
            language: lang,
            command: srv.command,
            args: srv.args,
            cwd: projectRoot,
          });
          if (!res?.session_id) continue;
          await this._initialize(res.session_id, projectRoot);
          this.sessions[lang] = res.session_id;
          started.push(lang);
        } catch (e) {
          console.warn('[LSP]', lang, e);
        }
      }
      return started;
    },

    async _initialize(sessionId, root) {
      const rootUri = pathToUri(root);
      const caps = {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: true },
          completion: { dynamicRegistration: false },
          hover: { dynamicRegistration: false },
          definition: { dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: true },
        },
      };
      const init = await invoke('lsp_request', {
        session_id: sessionId,
        method: 'initialize',
        params: {
          processId: null,
          rootUri,
          rootPath: root,
          capabilities: caps,
          trace: 'off',
        },
      });
      const serverCaps = init?.result?.capabilities || {};
      await invoke('lsp_notify', {
        session_id: sessionId,
        method: 'initialized',
        params: {},
      });
      this._serverCaps = this._serverCaps || {};
      this._serverCaps[sessionId] = serverCaps;
    },

    sessionForPath(filePath) {
      const ext = (filePath || '').split('.').pop()?.toLowerCase();
      if (ext === 'rs') return this.sessions.rust;
      if (ext === 'py') return this.sessions.python;
      if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
        return this.sessions.typescript || this.sessions.javascript;
      }
      return null;
    },

    async didOpen(filePath, text, languageId) {
      const sid = this.sessionForPath(filePath);
      if (!sid) return;
      const ver = (this.openVersions.get(filePath) || 0) + 1;
      this.openVersions.set(filePath, ver);
      const lang =
        languageId ||
        (filePath.endsWith('.rs')
          ? 'rust'
          : filePath.endsWith('.py')
            ? 'python'
            : 'typescript');
      await invoke('lsp_notify', {
        session_id: sid,
        method: 'textDocument/didOpen',
        params: {
          textDocument: {
            uri: pathToUri(filePath),
            languageId: lang,
            version: ver,
            text: text || '',
          },
        },
      });
    },

    async didChange(filePath, text) {
      const sid = this.sessionForPath(filePath);
      if (!sid) return;
      const ver = (this.openVersions.get(filePath) || 0) + 1;
      this.openVersions.set(filePath, ver);
      await invoke('lsp_notify', {
        session_id: sid,
        method: 'textDocument/didChange',
        params: {
          textDocument: { uri: pathToUri(filePath), version: ver },
          contentChanges: [{ text: text || '' }],
        },
      });
    },

    async completion(filePath, line, character) {
      const sid = this.sessionForPath(filePath);
      if (!sid) return [];
      try {
        const res = await invoke('lsp_request', {
          session_id: sid,
          method: 'textDocument/completion',
          params: {
            textDocument: { uri: pathToUri(filePath) },
            position: { line: Math.max(0, line - 1), character: Math.max(0, character - 1) },
          },
        });
        const r = res?.result;
        const list = Array.isArray(r) ? r : (r?.items || []);
        return list.filter(Boolean);
      } catch (_) {
        return [];
      }
    },

    async hover(filePath, line, character) {
      const sid = this.sessionForPath(filePath);
      if (!sid) return null;
      try {
        const res = await invoke('lsp_request', {
          session_id: sid,
          method: 'textDocument/hover',
          params: {
            textDocument: { uri: pathToUri(filePath) },
            position: { line: Math.max(0, line - 1), character: Math.max(0, character - 1) },
          },
        });
        const h = res?.result;
        if (!h) return null;
        const contents = h.contents;
        if (typeof contents === 'string') return contents;
        if (Array.isArray(contents)) {
          return contents.map((c) => (typeof c === 'string' ? c : c?.value || '')).join('\n');
        }
        return contents?.value || null;
      } catch (_) {
        return null;
      }
    },

    async definition(filePath, line, character) {
      const sid = this.sessionForPath(filePath);
      if (!sid) return null;
      try {
        const res = await invoke('lsp_request', {
          session_id: sid,
          method: 'textDocument/definition',
          params: {
            textDocument: { uri: pathToUri(filePath) },
            position: { line: Math.max(0, line - 1), character: Math.max(0, character - 1) },
          },
        });
        const r = res?.result;
        if (!r) return null;
        const loc = Array.isArray(r) ? r[0] : r;
        if (!loc?.uri) return null;
        return {
          path: uriToPath(loc.uri),
          line: (loc.range?.start?.line ?? 0) + 1,
          column: (loc.range?.start?.character ?? 0) + 1,
        };
      } catch (_) {
        return null;
      }
    },

    parsePublishDiagnostics(diags) {
      if (!Array.isArray(diags)) return [];
      return diags.map((d) => ({
        severity:
          d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : d.severity === 3 ? 'info' : 'hint',
        message: d.message || '',
        line: (d.range?.start?.line ?? 0) + 1,
        column: (d.range?.start?.character ?? 0) + 1,
        source: 'lsp',
      }));
    },

    stopAll() {
      const ids = new Set(Object.values(this.sessions));
      this.sessions = {};
      this.openVersions.clear();
      ids.forEach((id) => {
        invoke('lsp_stop', { session_id: id }).catch(() => {});
      });
    },

    mountDiagnosticsListener(onDiagnostics) {
      if (!window.HC?.isTauri) return () => {};
      const listen = window.__TAURI__?.event?.listen;
      if (!listen) return () => {};
      let unlisten = null;
      listen('lsp-diagnostics', (ev) => {
        const p = ev.payload || {};
        const path = uriToPath(p.uri);
        const items = this.parsePublishDiagnostics(p.diagnostics);
        if (path && items.length && typeof onDiagnostics === 'function') {
          onDiagnostics(path, items);
        }
      }).then((fn) => { unlisten = fn; }).catch(() => {});
      return () => { if (typeof unlisten === 'function') unlisten(); };
    },
  };

  window.CdrLspClient = CdrLspClient;
})();
