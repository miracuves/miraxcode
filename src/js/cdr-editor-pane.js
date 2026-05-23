// cdr-editor-pane.js — Monaco editor + inline diff for pending Coder changes
(function () {
  'use strict';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function langFromPath(path) {
    const ext = String(path || '').split('.').pop()?.toLowerCase() || '';
    const map = {
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      py: 'python', rs: 'rust', go: 'go', java: 'java', css: 'css', scss: 'scss',
      html: 'html', htm: 'html', json: 'json', md: 'markdown', sh: 'shell', bash: 'shell',
      yml: 'yaml', yaml: 'yaml', xml: 'xml', sql: 'sql', php: 'php', rb: 'ruby',
      swift: 'swift', kt: 'kotlin', cpp: 'cpp', c: 'c', h: 'c', cs: 'csharp',
      vue: 'html', svelte: 'html', toml: 'ini', dockerfile: 'dockerfile',
    };
    return map[ext] || 'plaintext';
  }

  let monacoReady = null;
  let monacoLanguagesReady = null;

  function ensureMonacoLanguages(monaco) {
    if (monacoLanguagesReady) return monacoLanguagesReady;
    monacoLanguagesReady = new Promise((resolve, reject) => {
      if (!window.require) {
        resolve(null);
        return;
      }
      window.require(['vs/language/typescript/tsMode'], (tsMode) => {
        try {
          const ts = monaco.languages.typescript;
          const opts = {
            allowNonTsExtensions: true,
            target: ts.ScriptTarget.ES2020,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            module: ts.ModuleKind.ESNext,
            noEmit: true,
            allowJs: true,
            jsx: ts.JsxEmit.React,
          };
          ts.typescriptDefaults.setCompilerOptions(opts);
          ts.javascriptDefaults.setCompilerOptions(opts);
          const diag = { noSemanticValidation: false, noSyntaxValidation: false };
          tsMode.setupTypeScript({ compilerOptions: opts, diagnosticsOptions: diag });
          tsMode.setupJavaScript({ compilerOptions: opts, diagnosticsOptions: diag });
          resolve(tsMode);
        } catch (e) {
          reject(e);
        }
      }, (err) => {
        console.warn('[CdrEditor] tsMode load failed:', err);
        resolve(null);
      });
    });
    return monacoLanguagesReady;
  }

  function loadMonaco() {
    if (window.monaco?.editor) return Promise.resolve(window.monaco);
    if (monacoReady) return monacoReady;
    monacoReady = new Promise((resolve, reject) => {
      const loader = document.createElement('script');
      loader.src = '/js/vendor/monaco/vs/loader.js';
      loader.onload = () => {
        try {
          window.require.config({ paths: { vs: '/js/vendor/monaco/vs' } });
          window.require(['vs/editor/editor.main'], () => {
            if (!window.monaco?.editor) {
              reject(new Error('Monaco failed to initialize'));
              return;
            }
            window.monaco.editor.defineTheme('miraxcode-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#0d0d0d',
                'editor.foreground': '#e8e8ec',
                'editorLineNumber.foreground': '#5a5a66',
                'editor.selectionBackground': '#264f3d88',
                'editor.inactiveSelectionBackground': '#1a3a2d55',
                'diffEditor.insertedTextBackground': '#2d6a4f44',
                'diffEditor.removedTextBackground': '#9b222244',
                'diffEditor.insertedLineBackground': '#2d6a4f33',
                'diffEditor.removedLineBackground': '#9b222233',
              },
            });
            resolve(window.monaco);
          }, reject);
        } catch (e) {
          reject(e);
        }
      };
      loader.onerror = () => reject(new Error('Monaco loader failed'));
      document.head.appendChild(loader);
    });
    return monacoReady;
  }

  class CdrEditorPane {
    constructor(opts) {
      this.pane = opts.paneEl;
      this.tabsEl = opts.tabsEl;
      this.tabsElB = opts.tabsElB;
      this.onGoToDefinition = opts.onGoToDefinition;
      this.onDiagnosticsChange = opts.onDiagnosticsChange;
      this.hostEl = opts.hostEl;
      this.hostElB = opts.hostElB;
      this.diffHostEl = opts.diffHostEl;
      this.pathEl = opts.pathEl;
      this.badgeEl = opts.badgeEl;
      this.readFile = opts.readFile;
      this.writeFile = opts.writeFile;
      this.onSaved = opts.onSaved;
      this.onAcceptPendingChange = opts.onAcceptPendingChange;
      this.openFiles = new Map();
      this._lspProvidersWired = false;
      this._inlineCompleteDispose = null;
      this.pendingByPath = new Map();
      this.activePath = null;
      this.secondaryPath = null;
      this.secondaryPaths = new Set();
      this.focusedPane = 'primary';
      this._mode = 'none';
      this.editor = null;
      this.editorB = null;
      this.diffEditor = null;
      this._monaco = null;
      this._splitActive = false;
      this._wire();
    }

    _wire() {
      const saveBtn = this.pane?.querySelector?.('[data-cdr-editor-save]');
      const closeBtn = this.pane?.querySelector?.('[data-cdr-editor-close]');
      if (saveBtn) saveBtn.addEventListener('click', () => this.saveActive());
      if (closeBtn) closeBtn.addEventListener('click', () => this.closeActive());
      document.addEventListener('keydown', (e) => {
        if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
        if (!this.activePath || this.pane?.hidden) return;
        if (!document.body.classList.contains('coder-mode')) return;
        e.preventDefault();
        this.saveActive();
      });
    }

    /** Sync pending file-change entries from Coder (_fileChanges). */
    syncPendingChanges(entries) {
      this.pendingByPath.clear();
      for (const fc of entries || []) {
        if (!fc?.path || fc.status !== 'pending') continue;
        this.pendingByPath.set(fc.path, {
          previous: fc.previousContent == null ? null : String(fc.previousContent),
          proposed: String(fc.proposedContent ?? fc.content ?? ''),
          kind: fc.kind || 'write',
        });
      }
      this._updateBadge();
      if (this.activePath && this.pendingByPath.has(this.activePath)) {
        this._openDiffForPath(this.activePath).catch(() => {});
      } else if (this.activePath && this._mode === 'diff') {
        this.openFile(this.activePath).catch(() => {});
      }
    }

    _updateBadge() {
      if (!this.badgeEl) return;
      const n = this.pendingByPath.size;
      if (n > 0) {
        this.badgeEl.hidden = false;
        this.badgeEl.textContent = `Diff · ${n} file${n === 1 ? '' : 's'}`;
        this.badgeEl.title = 'Inline diff: red = removed, green = added';
      } else {
        this.badgeEl.hidden = true;
      }
    }

    _uri(path, suffix) {
      const safe = encodeURI(String(path || '') + (suffix || ''));
      return this._monaco.Uri.parse('file://' + safe);
    }

    _pathFromModel(model) {
      if (!model?.uri) return null;
      let raw = model.uri.fsPath || model.uri.path || '';
      if (!raw && model.uri.toString) {
        raw = decodeURIComponent(model.uri.toString().replace(/^file:\/\//, ''));
      }
      if (!raw) return null;
      const hash = raw.indexOf('#');
      if (hash >= 0) raw = raw.slice(0, hash);
      return raw;
    }

    _wireLspProviders() {
      if (this._lspProvidersWired || !this._monaco || !window.CdrLspClient) return;
      this._lspProvidersWired = true;
      const monaco = this._monaco;
      const langs = ['typescript', 'javascript', 'python', 'rust', 'plaintext'];
      const mapKind = (k) => {
        const n = typeof k === 'number' ? k : 0;
        const keys = Object.keys(monaco.languages.CompletionItemKind);
        return monaco.languages.CompletionItemKind[keys[n]] ?? monaco.languages.CompletionItemKind.Text;
      };
      for (const lang of langs) {
        monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['.', '/', '"', "'", '`', '<', ':', '@'],
          provideCompletionItems: async (model, position) => {
            const path = this._pathFromModel(model);
            if (!path || !window.CdrLspClient.completion) return { suggestions: [] };
            const items = await window.CdrLspClient.completion(
              path,
              position.lineNumber,
              position.column
            );
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };
            const suggestions = (items || []).slice(0, 80).map((item) => {
              const label = typeof item.label === 'string' ? item.label : (item.label?.label || item.insertText || '');
              const insertText = item.insertText || (typeof item.textEdit?.newText === 'string' ? item.textEdit.newText : label);
              return {
                label,
                kind: mapKind(item.kind),
                insertText,
                detail: item.detail || item.labelDetails?.description || '',
                range: item.textEdit?.range
                  ? new monaco.Range(
                    item.textEdit.range.start.line + 1,
                    item.textEdit.range.start.character + 1,
                    item.textEdit.range.end.line + 1,
                    item.textEdit.range.end.character + 1
                  )
                  : range,
              };
            });
            return { suggestions };
          },
        });
        monaco.languages.registerHoverProvider(lang, {
          provideHover: async (model, position) => {
            const path = this._pathFromModel(model);
            if (!path || !window.CdrLspClient.hover) return null;
            const text = await window.CdrLspClient.hover(path, position.lineNumber, position.column);
            if (!text) return null;
            return { contents: [{ value: String(text) }] };
          },
        });
      }
    }

    _wireDiffAcceptAction(ed) {
      if (!ed || ed._cdrAcceptWired || !this._monaco) return;
      ed._cdrAcceptWired = true;
      const KeyMod = this._monaco.KeyMod;
      const KeyCode = this._monaco.KeyCode;
      ed.addAction({
        id: 'cdr-accept-pending-change',
        label: 'Accept pending file change',
        keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 0.5,
        run: () => {
          if (this.activePath && this.pendingByPath.has(this.activePath)) {
            this.onAcceptPendingChange?.(this.activePath);
          }
        },
      });
    }

    _hideHosts() {
      if (this.hostEl) this.hostEl.style.display = 'none';
      if (this.hostElB) this.hostElB.style.display = 'none';
      if (this.diffHostEl) this.diffHostEl.style.display = 'none';
    }

    async _ensureNormalEditor() {
      if (this.editor) return this.editor;
      if (!this.hostEl) throw new Error('Editor host missing');
      this._monaco = await loadMonaco();
      await ensureMonacoLanguages(this._monaco).catch(() => {});
      this._setupMarkerSync();
      this.editor = this._monaco.editor.create(this.hostEl, {
        theme: 'miraxcode-dark',
        language: 'plaintext',
        automaticLayout: true,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        padding: { top: 8, bottom: 8 },
        tabSize: 2,
      });
      this.editor.onDidChangeModelContent(() => {
        if (!this.activePath || this._mode !== 'normal') return;
        const ent = this.openFiles.get(this.activePath);
        if (!ent) return;
        const val = this.editor.getValue();
        ent.dirty = val !== ent.text;
        this._renderTabs();
        if (window.CdrLspClient?.sessionForPath?.(this.activePath)) {
          clearTimeout(this._lspChangeTimer);
          this._lspChangeTimer = setTimeout(() => {
            window.CdrLspClient.didChange(this.activePath, val);
          }, 400);
        }
      });
      this._wireGoToDefinition(this.editor);
      this._wireLspProviders();
      this._wireInlineCompletions();
      return this.editor;
    }

    _wireInlineCompletions() {
      if (this._inlineCompleteDispose || !window.CdrInlineComplete?.attachEditor) return;
      this._inlineCompleteDispose = window.CdrInlineComplete.attachEditor(this.editor, {
        getPath: () => this.activePath,
        isDiffMode: () => this._mode === 'diff',
      });
    }

    _setupMarkerSync() {
      if (this._markerSyncWired || !this._monaco) return;
      this._markerSyncWired = true;
      this._monaco.editor.onDidChangeMarkers(() => {
        this.onDiagnosticsChange?.(this._collectMonacoMarkers());
      });
    }

    _collectMonacoMarkers() {
      if (!this._monaco) return [];
      const out = [];
      const paths = new Set([this.activePath, this.secondaryPath].filter(Boolean));
      for (const p of paths) {
        const uri = this._uri(p);
        const markers = this._monaco.editor.getModelMarkers({ resource: uri });
        for (const m of markers) {
          const sev = m.severity === this._monaco.MarkerSeverity.Error ? 'error'
            : m.severity === this._monaco.MarkerSeverity.Warning ? 'warning'
            : 'info';
          out.push({
            file: p,
            line: m.startLineNumber,
            col: m.startColumn,
            message: m.message,
            severity: sev,
            source: 'monaco-ts',
          });
        }
      }
      return out;
    }

    _wireGoToDefinition(editor) {
      if (!editor || !this._monaco || editor._cdrGotoWired) return;
      editor._cdrGotoWired = true;
      const KeyMod = this._monaco.KeyMod;
      const KeyCode = this._monaco.KeyCode;
      editor.addAction({
        id: 'cdr-goto-definition',
        label: 'Go to Definition',
        keybindings: [KeyMod.CtrlCmd | KeyCode.F12],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: async (ed) => {
          const pos = ed.getPosition();
          const model = ed.getModel();
          const word = model?.getWordAtPosition?.(pos);
          const symbol = word?.word;
          const path = this.focusedPane === 'secondary' ? this.secondaryPath : this.activePath;
          if (!symbol || !path) return;
          try {
            await ed.getAction('editor.action.revealDefinition')?.run();
            return;
          } catch {}
          this.onGoToDefinition?.(symbol, path);
        },
      });
    }

    async _ensureDiffEditor() {
      if (this.diffEditor) return this.diffEditor;
      if (!this.diffHostEl) throw new Error('Diff host missing');
      this._monaco = await loadMonaco();
      this.diffEditor = this._monaco.editor.createDiffEditor(this.diffHostEl, {
        theme: 'miraxcode-dark',
        renderSideBySide: false,
        automaticLayout: true,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        readOnly: true,
        originalEditable: false,
        renderOverviewRuler: true,
      });
      return this.diffEditor;
    }

    async _openDiffForPath(path) {
      const pending = this.pendingByPath.get(path);
      if (!pending) return this.openFile(path);

      this._mode = 'diff';
      this.activePath = path;
      this.show();
      if (this.pathEl) {
        this.pathEl.textContent = path + ' · reviewing change';
      }

      const ed = await this._ensureDiffEditor();
      this._hideHosts();
      if (this.diffHostEl) this.diffHostEl.style.display = 'block';
      requestAnimationFrame(() => ed.layout());

      const lang = langFromPath(path);
      const originalText = pending.previous === null ? '' : String(pending.previous);
      const modifiedText = String(pending.proposed ?? '');

      const origUri = this._uri(path, '#original');
      const modUri = this._uri(path, '#modified');
      let origModel = this._monaco.editor.getModel(origUri);
      let modModel = this._monaco.editor.getModel(modUri);
      if (!origModel) {
        origModel = this._monaco.editor.createModel(originalText, lang, origUri);
      } else {
        origModel.setValue(originalText);
      }
      if (!modModel) {
        modModel = this._monaco.editor.createModel(modifiedText, lang, modUri);
      } else {
        modModel.setValue(modifiedText);
      }
      ed.setModel({ original: origModel, modified: modModel });
      this._wireDiffAcceptAction(ed.getModifiedEditor?.());
      this._renderTabs();
    }

    layout() {
      requestAnimationFrame(() => {
        this.editor?.layout?.();
        this.editorB?.layout?.();
        this.diffEditor?.layout?.();
      });
    }

    show() {
      if (this.pane) this.pane.hidden = false;
      this.layout();
    }

    goToLine(line, col) {
      const ln = Math.max(1, parseInt(line, 10) || 1);
      const cl = Math.max(1, parseInt(col, 10) || 1);
      const ed = this._mode === 'normal' ? this.editor : this.diffEditor?.getModifiedEditor?.();
      if (!ed) return;
      ed.revealLineInCenter(ln);
      ed.setPosition({ lineNumber: ln, column: cl });
      ed.focus();
    }

    hide() {
      if (this.pane) this.pane.hidden = true;
    }

    async openFile(path, line, col) {
      if (!path || !this.readFile) return;

      if (this.pendingByPath.has(path)) {
        await this._openDiffForPath(path);
        if (line) this.goToLine(line, col);
        return;
      }

      this._mode = 'normal';
      let ent = this.openFiles.get(path);
      if (!ent) {
        const text = await this.readFile(path);
        ent = { path, text: String(text ?? ''), dirty: false };
        this.openFiles.set(path, ent);
      }
      this.activePath = path;
      this.show();

      const ed = await this._ensureNormalEditor();
      this._hideHosts();
      if (this.hostEl) this.hostEl.style.display = 'block';
      requestAnimationFrame(() => ed.layout());

      const lang = langFromPath(path);
      const uri = this._uri(path);
      let model = this._monaco.editor.getModel(uri);
      if (!model) {
        model = this._monaco.editor.createModel(ent.text, lang, uri);
      } else {
        model.setValue(ent.text);
      }
      ed.setModel(model);
      if (this.pathEl) this.pathEl.textContent = path;
      this._renderTabs();
      window.CdrLspClient?.didOpen?.(path, ent.text, lang);
      if (line) this.goToLine(line, col);
    }

    async openFileSecondary(path) {
      if (!path || !this.readFile || !this.hostElB) return;
      this._splitActive = true;
      this.secondaryPath = path;
      this.secondaryPaths.add(path);
      this.focusedPane = 'secondary';
      if (this.pane) this.pane.classList.add('split');
      const tabsB = this.tabsElB;
      if (tabsB) tabsB.hidden = false;
      const text = await this.readFile(path);
      const ed = await this._ensureNormalEditorB();
      this._hideHosts();
      if (this.hostEl) this.hostEl.style.display = 'block';
      if (this.hostElB) this.hostElB.style.display = 'block';
      const lang = langFromPath(path);
      const uri = this._uri(path, '#secondary');
      let model = this._monaco.editor.getModel(uri);
      if (!model) model = this._monaco.editor.createModel(String(text ?? ''), lang, uri);
      else model.setValue(String(text ?? ''));
      ed.setModel(model);
      this._wireGoToDefinition(ed);
      this._renderTabs();
      this.layout();
    }

    async _ensureNormalEditorB() {
      if (this.editorB) return this.editorB;
      if (!this.hostElB) return null;
      this._monaco = this._monaco || await loadMonaco();
      this.editorB = this._monaco.editor.create(this.hostElB, {
        theme: 'miraxcode-dark',
        language: 'plaintext',
        automaticLayout: true,
        fontSize: 12,
        minimap: { enabled: false },
        readOnly: true,
      });
      return this.editorB;
    }

    _renderTabButtons(tabsEl, paths, activePath, onClick) {
      if (!tabsEl) return;
      const list = [...paths];
      if (!list.length) {
        tabsEl.innerHTML = '<span class="cdr-editor-tab-empty">—</span>';
        return;
      }
      tabsEl.innerHTML = list.map(p => {
        const name = p.split('/').pop() || p;
        const active = p === activePath ? ' active' : '';
        const ent = this.openFiles.get(p);
        const dirty = ent?.dirty ? ' *' : '';
        const pending = this.pendingByPath.has(p) ? ' pending-diff' : '';
        return `<button type="button" class="cdr-editor-tab${active}${pending}" data-path="${esc(p)}" title="${esc(p)}">${esc(name)}${dirty}</button>`;
      }).join('');
      tabsEl.querySelectorAll('.cdr-editor-tab').forEach(btn => {
        btn.addEventListener('click', (e) => onClick(btn.dataset.path, e));
      });
    }

    _renderTabs() {
      const paths = new Set([...this.openFiles.keys(), ...this.pendingByPath.keys()]);
      this._renderTabButtons(this.tabsEl, paths, this.activePath, (path, e) => {
        if (e?.altKey && this.hostElB) {
          this.openFileSecondary(path).catch(() => {});
          return;
        }
        this.focusedPane = 'primary';
        this.openFile(path).catch(() => {});
      });
      this._renderTabButtons(this.tabsElB, this.secondaryPaths, this.secondaryPath, (path) => {
        this.focusedPane = 'secondary';
        this.openFileSecondary(path).catch(() => {});
      });
    }

    getValue() {
      if (this._mode === 'diff') {
        const mod = this.diffEditor?.getModel?.()?.modified;
        return mod?.getValue?.() ?? '';
      }
      return this.editor?.getValue?.() ?? '';
    }

    async saveActive() {
      if (!this.activePath || !this.writeFile) return;
      const content = this.getValue();
      await this.writeFile(this.activePath, content, 'Manual save from editor');
      const ent = this.openFiles.get(this.activePath) || {
        path: this.activePath,
        text: content,
        dirty: false,
      };
      ent.text = content;
      ent.dirty = false;
      this.openFiles.set(this.activePath, ent);
      if (this._mode === 'normal' && this.editor) {
        const uri = this._uri(this.activePath);
        const model = this._monaco.editor.getModel(uri);
        if (model) model.setValue(content);
      }
      this._renderTabs();
      this.onSaved?.(this.activePath);
    }

    closeActive() {
      if (!this.activePath) return;
      const path = this.activePath;
      this.openFiles.delete(path);
      try {
        for (const suffix of ['', '#original', '#modified']) {
          const uri = this._uri(path, suffix);
          const model = this._monaco?.editor?.getModel(uri);
          if (model) model.dispose();
        }
      } catch {}
      const next = [...new Set([...this.openFiles.keys(), ...this.pendingByPath.keys()])].pop();
      if (next) this.openFile(next);
      else {
        this.activePath = null;
        this._mode = 'none';
        this.hide();
        if (this.editor) this.editor.setModel(null);
        if (this.diffEditor) this.diffEditor.setModel(null);
      }
    }

    dispose() {
      try { this._inlineCompleteDispose?.(); } catch {}
      this._inlineCompleteDispose = null;
      try { this.editor?.dispose?.(); } catch {}
      try { this.diffEditor?.dispose?.(); } catch {}
      this.editor = null;
      this.diffEditor = null;
    }
  }

  window.CdrEditorPane = CdrEditorPane;
})();
