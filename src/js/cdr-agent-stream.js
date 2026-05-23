// cdr-agent-stream.js — OpenAI-compatible SSE parsing for agent turns (content + tool_calls)
(function () {
  'use strict';

  /** @param {ReadableStream} body */
  async function* readOpenAIAgentSSE(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const chunk = parseSSELine(line);
          if (chunk) yield chunk;
        }
      }
      const tail = parseSSELine(buf);
      if (tail) yield tail;
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  function parseSSELine(line) {
    const s = String(line || '').trim();
    if (!s.startsWith('data:')) return null;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') return null;
    try {
      const evt = JSON.parse(payload);
      const delta = evt.choices?.[0]?.delta;
      if (!delta) return null;
      const out = {};
      if (delta.content) out.content = delta.content;
      if (delta.reasoning_content) out.content = (out.content || '') + delta.reasoning_content;
      if (delta.tool_calls?.length) out.tool_calls = delta.tool_calls;
      return Object.keys(out).length ? out : null;
    } catch {
      return null;
    }
  }

  /** @type {Record<number, { id: string, name: string, arguments: string }>} */
  function mergeToolCallDeltas(acc, deltas) {
    for (const tc of deltas) {
      const i = tc.index ?? 0;
      if (!acc[i]) acc[i] = { id: '', name: '', arguments: '' };
      if (tc.id) acc[i].id = tc.id;
      if (tc.function?.name) acc[i].name += tc.function.name;
      if (tc.function?.arguments != null) acc[i].arguments += String(tc.function.arguments);
    }
    return acc;
  }

  function finalizeToolCalls(acc, safeJsonParse) {
    const parse = safeJsonParse || ((s) => {
      try { return JSON.parse(s); } catch { return {}; }
    });
    const keys = Object.keys(acc).map(Number).sort((a, b) => a - b);
    if (!keys.length) return null;
    const calls = keys.map((i, idx) => {
      const c = acc[i];
      return {
        id: c.id || `call_${Date.now()}_${idx}`,
        name: c.name,
        arguments: parse(c.arguments || '{}'),
      };
    }).filter(c => c.name);
    return calls.length ? calls : null;
  }

  /** @param {ReadableStream} body */
  async function* readAnthropicAgentSSE(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const evt = parseAnthropicSSELine(line);
          if (evt) yield evt;
        }
      }
      const tail = parseAnthropicSSELine(buf);
      if (tail) yield tail;
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  function parseAnthropicSSELine(line) {
    const s = String(line || '').trim();
    if (!s.startsWith('data:')) return null;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  function createAnthropicStreamState() {
    return { content: '', toolBlocks: {} };
  }

  function applyAnthropicStreamEvent(state, evt, onToken) {
    if (!evt?.type) return;
    if (evt.type === 'content_block_delta') {
      const d = evt.delta || {};
      if (d.type === 'text_delta' && d.text) {
        state.content += d.text;
        onToken?.(d.text, state.content);
      }
      if (d.type === 'input_json_delta' && typeof evt.index === 'number') {
        const b = state.toolBlocks[evt.index];
        if (b) b.inputJson += d.partial_json || '';
      }
    }
    if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
      const idx = evt.index;
      state.toolBlocks[idx] = {
        id: evt.content_block.id || `tu_${idx}`,
        name: evt.content_block.name || '',
        inputJson: '',
      };
    }
  }

  function finalizeAnthropicToolCalls(state, safeJsonParse) {
    const parse = safeJsonParse || ((s) => {
      try { return JSON.parse(s); } catch { return {}; }
    });
    const keys = Object.keys(state.toolBlocks).map(Number).sort((a, b) => a - b);
    if (!keys.length) return null;
    const calls = keys.map((i) => {
      const b = state.toolBlocks[i];
      return {
        id: b.id,
        name: b.name,
        arguments: parse(b.inputJson || '{}'),
      };
    }).filter(c => c.name);
    return calls.length ? calls : null;
  }

  /** @param {ReadableStream} body */
  async function* readGeminiAgentSSE(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const parts = parseGeminiSSELine(line);
          if (parts) yield parts;
        }
      }
      const tail = parseGeminiSSELine(buf);
      if (tail) yield tail;
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  function parseGeminiSSELine(line) {
    const s = String(line || '').trim();
    if (!s.startsWith('data:')) return null;
    const payload = s.slice(5).trim();
    if (!payload) return null;
    try {
      const evt = JSON.parse(payload);
      return evt.candidates?.[0]?.content?.parts || null;
    } catch {
      return null;
    }
  }

  window.CdrAgentStream = {
    readOpenAIAgentSSE,
    mergeToolCallDeltas,
    finalizeToolCalls,
    readAnthropicAgentSSE,
    createAnthropicStreamState,
    applyAnthropicStreamEvent,
    finalizeAnthropicToolCalls,
    readGeminiAgentSSE,
  };
})();
