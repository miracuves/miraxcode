// forge-editor.js — Monaco code panel for Forge Studio
(function () {
  'use strict';

  let editor = null;
  let monacoReady = null;
  let currentKey = 'types';
  const virtualFiles = {
    types: {
      name: 'forge/types.ts',
      language: 'typescript',
      value: `// Forge scaffold types — edit and use with Agent\nexport interface ForgeNode {\n  id: string;\n  label: string;\n  kind: 'mesh' | 'light' | 'group';\n}\n\nexport interface ForgePlan {\n  title: string;\n  nodes: ForgeNode[];\n}\n`,
    },
    plan: {
      name: 'forge/plan.json',
      language: 'json',
      value: '{\n  "title": "Untitled scene",\n  "nodes": []\n}\n',
    },
    scene: {
      name: 'forge/scene.ts',
      language: 'typescript',
      value: `// Scene hooks — export for Three.js bridge\nexport function onForgeTick(dt: number): void {\n  // dt in seconds\n}\n`,
    },
  };

  function loadMonaco() {
    if (monacoReady) return monacoReady;
    monacoReady = new Promise((resolve, reject) => {
      if (window.monaco?.editor) {
        resolve(window.monaco);
        return;
      }
      const base = '/js/vendor/monaco/vs';
      window.require = { paths: { vs: base } };
      const s = document.createElement('script');
      s.src = base + '/loader.js';
      s.onload = () => {
        window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
      };
      s.onerror = () => reject(new Error('Monaco loader failed'));
      document.head.appendChild(s);
    });
    return monacoReady;
  }

  const ForgeEditor = {
    visible: false,

    async mount(container) {
      if (!container) return;
      this._container = container;
      const monaco = await loadMonaco();
      if (editor) {
        editor.layout();
        return;
      }
      container.innerHTML = '';
      const tabs = document.createElement('div');
      tabs.className = 'frg-editor-tabs';
      ['types', 'plan', 'scene'].forEach((key) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'frg-editor-tab' + (key === currentKey ? ' active' : '');
        b.textContent = virtualFiles[key].name.split('/').pop();
        b.dataset.key = key;
        b.addEventListener('click', () => this.showFile(key));
        tabs.appendChild(b);
      });
      const mount = document.createElement('div');
      mount.className = 'frg-monaco-mount';
      mount.id = 'frgMonacoMount';
      container.appendChild(tabs);
      container.appendChild(mount);
      const vf = virtualFiles[currentKey];
      editor = monaco.editor.create(mount, {
        value: vf.value,
        language: vf.language,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
      });
      editor.onDidChangeModelContent(() => {
        const k = currentKey;
        virtualFiles[k].value = editor.getValue();
      });
    },

    showFile(key) {
      if (!virtualFiles[key] || !editor) return;
      if (currentKey && editor) virtualFiles[currentKey].value = editor.getValue();
      currentKey = key;
      const vf = virtualFiles[key];
      const model = window.monaco.editor.createModel(vf.value, vf.language);
      editor.setModel(model);
      this._container?.querySelectorAll('.frg-editor-tab').forEach((el) => {
        el.classList.toggle('active', el.dataset.key === key);
      });
    },

    setPlanJson(obj) {
      try {
        virtualFiles.plan.value = JSON.stringify(obj, null, 2);
        if (currentKey === 'plan' && editor) editor.setValue(virtualFiles.plan.value);
      } catch (_) {}
    },

    getVirtualFiles() {
      if (editor) virtualFiles[currentKey].value = editor.getValue();
      return Object.entries(virtualFiles).map(([, v]) => ({
        path: v.name,
        content: v.value,
      }));
    },

    toggle(show) {
      this.visible = show !== undefined ? show : !this.visible;
      const panel = document.getElementById('frgCodePanel');
      const btn = document.getElementById('frgBtnCode');
      const host = document.getElementById('frgCodeEditorHost');
      if (!this._container && host) this._container = host;
      if (panel) {
        panel.hidden = !this.visible;
        panel.classList.toggle('frg-code-open', this.visible);
      }
      if (btn) btn.classList.toggle('active', this.visible);
      if (this.visible && this._container) {
        loadMonaco().then(() => this.mount(this._container));
        setTimeout(() => editor?.layout(), 80);
      }
    },

    destroy() {
      if (editor) {
        editor.dispose();
        editor = null;
      }
      this._container = null;
      this.visible = false;
    },
  };

  window.ForgeEditor = ForgeEditor;
})();
