import { $, esc, baseName } from './dom-utils.js';

/**
 * Coder integrated terminal, ANSI rendering, and execution trace.
 */
export function createTerminalApi(ctx) {
  const {
    sharedState,
    getIdeCtx,
    terminalBusyRef,
    cdrTraceEntriesRef,
    cdrTraceStartedAtRef,
  } = ctx;

  const _termHistory = [];
  let _termHistIdx = -1;

  function terminalPrompt() {
    const root = sharedState.projectRoot;
    return root ? `${baseName(root)} %` : '%';
  }

  function syncTerminalPrompt() {
    const promptEl = $('cdrTerminalPrompt');
    if (promptEl) promptEl.textContent = terminalPrompt();
  }

  function ansiToHtml(text) {
    if (!text || !text.includes('\x1b[')) return esc(text);
    const colors = {
      '30': '#6b6b78', '31': '#d98a85', '32': '#5fb88a', '33': '#f5c97a',
      '34': '#6ab4ff', '35': '#c084fc', '36': '#4bd2be', '37': '#e8e8ec',
      '90': '#4a4a55', '91': '#ff8f8f', '92': '#7dd3a8', '93': '#fde68a',
      '94': '#93c5fd', '95': '#d8b4fe', '96': '#99f6e4', '97': '#ffffff',
    };
    let out = '';
    const re = /\x1b\[([0-9;]*)m/g;
    let last = 0;
    let m;
    const stack = [];
    while ((m = re.exec(text)) !== null) {
      out += esc(text.slice(last, m.index));
      const codes = m[1].split(';').filter(Boolean);
      for (const c of codes) {
        if (c === '0') { while (stack.length) out += '</span>'; stack.length = 0; }
        else if (c === '1') { out += '<span style="font-weight:600">'; stack.push('span'); }
        else if (c === '2') { out += '<span style="opacity:0.6">'; stack.push('span'); }
        else if (colors[c]) { out += `<span style="color:${colors[c]}">`; stack.push('span'); }
      }
      last = re.lastIndex;
    }
    out += esc(text.slice(last));
    while (stack.length) out += '</span>';
    return out;
  }

  function cdrTraceReset(reason) {
    cdrTraceStartedAtRef.current = Date.now();
    cdrTraceEntriesRef.current = [];
    cdrTraceAdd('Trace', reason || 'New run', 'wait');
  }

  function cdrTraceAdd(stage, message, status) {
    cdrTraceEntriesRef.current.push({
      elapsed: Number(((Date.now() - cdrTraceStartedAtRef.current) / 1000).toFixed(1)),
      stage: String(stage || ''),
      message: String(message || ''),
      status: status || 'wait',
    });
    if (cdrTraceEntriesRef.current.length > 300) {
      cdrTraceEntriesRef.current = cdrTraceEntriesRef.current.slice(-300);
    }
    renderCdrTrace();
  }

  function renderCdrTrace() {
    const list = $('cdrTraceEntries');
    if (!list) return;
    const entries = cdrTraceEntriesRef.current;
    function icon(s) { return s === 'ok' ? '✓' : s === 'err' ? '!' : s === 'warn' ? '!' : s === 'run' ? '›' : '·'; }
    if (!entries.length) {
      list.innerHTML = '<div class="cdr-trace-empty">No trace entries yet.</div>';
      return;
    }
    list.innerHTML = entries.map(e => `<div class="cdr-trace-entry">
  <span class="cdr-trace-time">[${e.elapsed.toFixed(1)}s]</span>
  <span class="cdr-trace-stage ${e.status}">${esc(e.stage)}</span>
  <span class="cdr-trace-icon ${e.status}">${icon(e.status)}</span>
  <span class="cdr-trace-msg ${e.status}">${esc(e.message)}</span>
</div>`).join('');
    list.scrollTop = list.scrollHeight;
  }

  function terminalLog(text, className = '') {
    const ideCtx = getIdeCtx?.();
    if (ideCtx?.terminalLog) {
      ideCtx.terminalLog(text, className);
      return;
    }
    const body = $('cdrTerminalBody');
    if (!body) return;
    const line = document.createElement('div');
    line.className = 'cdr-terminal-line' + (className ? ' ' + className : '');
    line.innerHTML = ansiToHtml(text);
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }

  function clearTerminal() {
    const body = $('cdrTerminalBody');
    if (body) body.innerHTML = '';
  }

  async function onTerminalKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (terminalBusyRef.current) return;
    const input = $('cdrTerminalInput');
    if (!input) return;
    const cmd = input.value.trim();
    if (!cmd) return;
    input.value = '';
    terminalLog(`${terminalPrompt()} ${cmd}`, 'cdr-terminal-prompt');
    _pushTermHistory(cmd);
    if (!window.HC?.isTauri) {
      terminalLog('Terminal requires Tauri backend.', 'cdr-terminal-error');
      return;
    }
    terminalBusyRef.current = true;
    try {
      const ChannelCtor = typeof Channel !== 'undefined' ? Channel : window.__TAURI__?.core?.Channel;
      const useStream = !!ChannelCtor;
      if (useStream) {
        try {
          const channel = new ChannelCtor();
          let exitCode = null;
          let done = false;
          channel.onmessage = (chunk) => {
            if (chunk.kind === 'stdout') terminalLog(chunk.data);
            else if (chunk.kind === 'stderr') terminalLog(chunk.data, 'cdr-terminal-error');
            else if (chunk.kind === 'done') { exitCode = chunk.code; done = true; }
          };
          await HC.invoke('shell_run_stream', { command: 'sh', args: ['-c', cmd], cwd: sharedState.projectRoot || undefined, onChunk: channel });
          for (let i = 0; !done && i < 200; i++) await new Promise(r => setTimeout(r, 25));
          if (exitCode !== 0 && exitCode !== null) {
            terminalLog(`(exit code: ${exitCode})`, 'cdr-terminal-error');
          }
        } catch (err) {
          terminalLog(String(err?.message || err), 'cdr-terminal-error');
        }
      } else {
        try {
          const result = await HC.invoke('shell_run', { command: 'sh', args: ['-c', cmd], cwd: sharedState.projectRoot || undefined });
          if (result?.stdout) result.stdout.split('\n').forEach(l => { if (l || result.stdout.endsWith('\n')) terminalLog(l); });
          if (result?.stderr) result.stderr.split('\n').forEach(l => { if (l) terminalLog(l, 'cdr-terminal-error'); });
          if (result?.code !== 0 && result?.code !== undefined) {
            terminalLog(`(exit code: ${result.code})`, 'cdr-terminal-error');
          }
        } catch (err) {
          terminalLog(String(err?.message || err), 'cdr-terminal-error');
        }
      }
    } finally {
      terminalBusyRef.current = false;
    }
  }

  function _pushTermHistory(cmd) {
    if (!cmd) return;
    _termHistory.push(cmd);
    _termHistIdx = _termHistory.length;
    try {
      const saved = JSON.parse(localStorage.getItem('hc_term_history') || '[]');
      saved.push(cmd);
      if (saved.length > 200) saved.shift();
      localStorage.setItem('hc_term_history', JSON.stringify(saved));
    } catch {}
  }

  function _loadTermHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem('hc_term_history') || '[]');
      _termHistory.push(...saved);
      _termHistIdx = _termHistory.length;
    } catch {}
  }

  function navigateTermHistory(e, termInput) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_termHistIdx > 0) { _termHistIdx--; termInput.value = _termHistory[_termHistIdx] || ''; }
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_termHistIdx < _termHistory.length - 1) { _termHistIdx++; termInput.value = _termHistory[_termHistIdx] || ''; }
      else { _termHistIdx = _termHistory.length; termInput.value = ''; }
      return true;
    }
    return false;
  }

  _loadTermHistory();

  return {
    terminalPrompt,
    syncTerminalPrompt,
    ansiToHtml,
    terminalLog,
    clearTerminal,
    onTerminalKey,
    _pushTermHistory,
    _loadTermHistory,
    navigateTermHistory,
    cdrTraceReset,
    cdrTraceAdd,
    renderCdrTrace,
  };
}
