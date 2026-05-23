// cdr-inline-complete.js — AI / heuristic ghost completions for Monaco (Coder editor)
(function () {
  'use strict';

  const DEBOUNCE_MS = 420;
  const MAX_PREFIX = 2400;
  const MAX_SUFFIX = 800;
  const AI_MAX_LINES = 4;

  function enabled() {
    try {
      if (localStorage.getItem('cdrInlineAi') === '0') return false;
    } catch { /* ignore */ }
    return true;
  }

  function pickLocalModel() {
    const cdr = document.getElementById('cdrModelPicker')?.value;
    if (cdr && !cdr.startsWith('cloud:')) return cdr;
    const main = document.getElementById('model')?.value;
    if (main && !main.startsWith('cloud:')) return main;
    return 'llama3.2';
  }

  function sanitizeInsert(text, prefix, suffix) {
    let t = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    t = t.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    if (!t) return null;
    if (t.includes('<CURSOR>')) t = t.split('<CURSOR>')[0];
    const lines = t.split('\n');
    if (lines.length > AI_MAX_LINES) t = lines.slice(0, AI_MAX_LINES).join('\n');
    if (suffix && t.endsWith(suffix.slice(0, Math.min(24, suffix.length)))) {
      t = t.slice(0, -Math.min(24, suffix.length));
    }
    if (!t || t === prefix.slice(-t.length)) return null;
    return t;
  }

  function localSuffixCompletion(model, position) {
    const line = model.getLineContent(position.lineNumber);
    const before = line.slice(0, position.column - 1);
    const wordMatch = before.match(/[\w$.]+$/);
    if (!wordMatch || wordMatch[0].length < 2) return null;
    const word = wordMatch[0];
    const full = model.getValue();
    const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w+', 'g');
    let best = null;
    let m;
    while ((m = re.exec(full))) {
      const cand = m[0].slice(word.length);
      if (cand.length > 0 && cand.length < 48) best = cand;
    }
    if (!best) return null;
    return {
      insertText: best,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column,
        endColumn: position.column,
      },
    };
  }

  async function aiCompletion(model, position, lang, signal) {
    const H = window._H;
    if (!H?.ollamaChat || !enabled()) return null;
    const lineCount = model.getLineCount();
    const startLine = Math.max(1, position.lineNumber - 40);
    const endLine = Math.min(lineCount, position.lineNumber + 12);
    let prefix = '';
    for (let ln = startLine; ln < position.lineNumber; ln++) {
      prefix += model.getLineContent(ln) + '\n';
    }
    prefix += model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    let suffix = model.getLineContent(position.lineNumber).slice(position.column - 1);
    for (let ln = position.lineNumber + 1; ln <= endLine; ln++) {
      suffix += '\n' + model.getLineContent(ln);
    }
    prefix = prefix.slice(-MAX_PREFIX);
    suffix = suffix.slice(0, MAX_SUFFIX);
    const localModel = pickLocalModel();
    try {
      const text = await H.ollamaChat(
        localModel,
        [
          {
            role: 'system',
            content:
              'You are an inline code completion engine. Output ONLY the text to insert at <CURSOR>. ' +
              'No markdown fences, no explanation, no repetition of existing code. At most ' +
              AI_MAX_LINES + ' lines.',
          },
          {
            role: 'user',
            content: '```' + lang + '\n' + prefix + '<CURSOR>' + suffix + '\n```',
          },
        ],
        null,
        signal
      );
      const insert = sanitizeInsert(text, prefix, suffix);
      if (!insert) return null;
      return {
        insertText: insert,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        },
      };
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      return null;
    }
  }

  function attachEditor(editor, opts) {
    if (!editor || !window.monaco?.languages?.registerInlineCompletionsProvider) return () => {};
    const getPath = opts.getPath || (() => null);
    const isDiffMode = opts.isDiffMode || (() => false);
    let timer = null;
    let seq = 0;
    let lastAbort = null;

    const langs = [
      'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'css', 'html',
      'json', 'markdown', 'shell', 'plaintext',
    ];

    const disposables = langs.map((lang) =>
      window.monaco.languages.registerInlineCompletionsProvider(lang, {
        provideInlineCompletions: (model, position, _context, token) =>
          new Promise((resolve) => {
            if (isDiffMode() || !getPath()) {
              resolve({ items: [] });
              return;
            }
            const mySeq = ++seq;
            clearTimeout(timer);
            if (lastAbort) {
              try { lastAbort.abort(); } catch { /* ignore */ }
            }
            timer = setTimeout(async () => {
              if (token.isCancellationRequested || mySeq !== seq) {
                resolve({ items: [] });
                return;
              }
              const ac = new AbortController();
              lastAbort = ac;
              token.onCancellationRequested(() => ac.abort());
              const local = localSuffixCompletion(model, position);
              let item = local;
              if (!item) {
                const ext = (getPath() || '').split('.').pop() || 'txt';
                item = await aiCompletion(model, position, ext, ac.signal);
              }
              if (mySeq !== seq || token.isCancellationRequested) {
                resolve({ items: [] });
                return;
              }
              if (!item?.insertText) {
                resolve({ items: [] });
                return;
              }
              resolve({
                items: [{
                  insertText: item.insertText,
                  range: item.range,
                }],
              });
            }, DEBOUNCE_MS);
          }),
        freeInlineCompletions: () => {},
      })
    );

    return () => disposables.forEach((d) => d?.dispose?.());
  }

  window.CdrInlineComplete = { attachEditor, enabled };
})();
