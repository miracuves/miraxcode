// cdr-markdown-worker.js — off-thread markdown + sanitize for Coder chat
(function () {
  'use strict';

  let worker = null;
  let seq = 0;
  const pending = new Map();

  function canUseWorker() {
    return typeof Worker !== 'undefined';
  }

  function workerUrl() {
    const blob = new Blob([`
      try {
        importScripts('/js/vendor/marked.min.js', '/js/vendor/purify.min.js');
      } catch (e) {}
      self.onmessage = function (e) {
        const id = e.data.id;
        const text = e.data.text || '';
        let html = '';
        try {
          if (typeof marked !== 'undefined') {
            html = marked.parse(text, { breaks: true, gfm: true });
            if (typeof DOMPurify !== 'undefined') html = DOMPurify.sanitize(html);
          } else {
            html = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
          }
        } catch (err) {
          html = '<span>' + String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>';
        }
        self.postMessage({ id, html });
      };
    `], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  function ensureWorker() {
    if (worker || !canUseWorker()) return worker;
    try {
      worker = new Worker(workerUrl());
      worker.onmessage = (e) => {
        const { id, html } = e.data || {};
        const p = pending.get(id);
        if (p) {
          pending.delete(id);
          p.resolve(html || '');
        }
      };
      worker.onerror = () => {
        worker = null;
        pending.forEach((p) => p.reject(new Error('markdown worker failed')));
        pending.clear();
      };
    } catch {
      worker = null;
    }
    return worker;
  }

  function renderMarkdownAsync(text) {
    const w = ensureWorker();
    if (!w || !text) {
      return Promise.resolve(null);
    }
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, text: String(text) });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          resolve(null);
        }
      }, 8000);
    });
  }

  window.CdrMarkdown = {
    renderAsync: renderMarkdownAsync,
    terminate() {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      pending.clear();
    },
  };
})();
