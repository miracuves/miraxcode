/** LLM routing for Coder mode (shared by legacy HC_CODE and CoderMode agent loop). */

const _routerStreaks = new Map();

export function sortChainByQuality(chain) {
  const TIER = { frontier: 4, large: 3, medium: 2, small: 1 };
  function tierFor(m) {
    const s = (m.model || '').toLowerCase();
    if (/gpt-4o|claude-(opus|4|5)|gemini-2\.5-pro|kimi-k2|deepseek-v3|llama-4|400b|405b/i.test(s)) return 'frontier';
    if (/70b|72b|sonnet|gemini-2\.5-flash|qwen2\.5/i.test(s)) return 'large';
    if (/8b|9b|13b|34b|haiku|mini|flash-lite|3\.2/i.test(s)) return 'medium';
    return 'small';
  }
  return chain
    .map((m, i) => ({ m, i, t: TIER[tierFor(m)] || 0, fails: _routerStreaks.get(m.label + ':' + m.model) || 0 }))
    .sort((a, b) => {
      if (a.i === 0) return -1;
      if (b.i === 0) return 1;
      if (a.fails >= 3 && b.fails < 3) return 1;
      if (b.fails >= 3 && a.fails < 3) return -1;
      return b.t - a.t;
    })
    .map(x => x.m);
}

function resolveCoderAdapter(rawModel) {
  const H = window._H;
  if (!rawModel) return { kind: 'ollama', model: 'llama3' };
  if (rawModel.startsWith('cloud:') && H?.selectAgentAdapter) {
    return H.selectAgentAdapter(rawModel);
  }
  return { kind: 'ollama', model: rawModel || 'llama3' };
}

export async function callWithRouter(messages, tools, temperature, signal, modelOverride, onToken) {
  const H = window._H;
  if (!H) throw new Error('window._H bridge not available');
  const rawModel = modelOverride || H.selectedModel() || '';
  const adapter = resolveCoderAdapter(rawModel);
  const common = { messages, tools, temperature, signal, onToken };

  if (adapter.kind === 'openai') {
    if (onToken && H.agentTurnOpenAIStream) {
      return H.agentTurnOpenAIStream({ provider: adapter.provider, model: adapter.model, ...common });
    }
    return H.agentTurnOpenAI({ provider: adapter.provider, model: adapter.model, messages, tools, temperature, signal });
  }
  if (adapter.kind === 'gemini') {
    if (onToken && H.agentTurnGeminiStream) {
      return H.agentTurnGeminiStream({ model: adapter.model, ...common });
    }
    return H.agentTurnGemini({ model: adapter.model, messages, tools, temperature, signal });
  }
  if (adapter.kind === 'anthropic') {
    if (onToken && H.agentTurnAnthropicStream) {
      return H.agentTurnAnthropicStream({ model: adapter.model, ...common });
    }
    return H.agentTurnAnthropic({ model: adapter.model, messages, tools, temperature, signal });
  }
  if (onToken && H.agentTurnOllamaStream) {
    return H.agentTurnOllamaStream({ model: adapter.model, ...common });
  }
  return H.agentTurnOllama({ model: adapter.model, messages, tools, temperature, signal });
}
