import { safeHost } from '../core/utils.js';

export function createAgentTurnsApi(deps) {
  const {
    cloudFetch, cloudHttpError, cloudRecord, getProviderKey,
    fetchMoonshotApi, fetchKimiAnthropic, isKimiCodeKey,
    parseCloudModel, nvidiaKeyEl, geminiKeyEl, anthropicKeyEl,
    buildOpenAITools, buildGeminiTools, buildOllamaTools, buildOllamaMessages,
    runOneTool, memRecall, memAutoExtract, memAutoExtractFromAssistant,
    state, modelEl,
    AGENT_MAX_ITERATIONS = 8,
  } = deps;

// -------------------------------------------------------------------------
// Provider adapters — non-streaming single turn returning
//   { content: string|null, tool_calls: [{id, name, arguments}]|null }
// -------------------------------------------------------------------------
async function agentTurnOllama({ model, messages, tools, temperature, signal }) {
  const host = safeHost();
  const r = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages, stream: false, keep_alive: -1,
      tools: tools.length ? tools : undefined,
      options: { temperature, num_ctx: 8192 }
    }),
    signal
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  const data = await r.json();
  const msg = data.message || {};
  const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls.map((c, i) => ({
    id: c.id || `call_${Date.now()}_${i}`,
    name: c.function?.name || c.name,
    // Ollama returns parsed object; cloud APIs return a JSON string. Normalize.
    arguments: typeof c.function?.arguments === "string"
      ? safeJsonParse(c.function.arguments)
      : (c.function?.arguments || c.arguments || {})
  })) : null;
  return { content: msg.content || null, tool_calls: calls && calls.length ? calls : null, raw: msg };
}

async function agentTurnOpenAI({ provider, model, messages, tools, temperature, signal }) {
  let url, headers;
  let moonshotKeyForRequest = "";
  const hasImages = messages.some(m => m.images?.length);
  const textMessages = messages.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      return { role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, name: m.name || '', content: m.content || '' };
    }
    return { role: m.role, content: m.content || '' };
  });
  if (provider === "groq") {
    const key = (groqKeyEl.value || "").trim();
    if (!key) throw new Error("Groq API key missing.");
    url = "https://api.groq.com/openai/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "openrouter") {
    const key = (openRouterKeyEl.value || "").trim();
    if (!key) throw new Error("OpenRouter API key missing.");
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "HTTP-Referer": "https://miraxcode.local", "X-Title": "MiraXcode" };
  } else if (provider === "cerebras") {
    const key = (cerebrasKeyEl.value || "").trim();
    if (!key) throw new Error("Cerebras API key missing.");
    url = "https://api.cerebras.ai/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "samba") {
    const key = (sambaKeyEl.value || "").trim();
    if (!key) throw new Error("SambaNova API key missing.");
    url = "https://api.sambanova.ai/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "openai") {
    const key = (openaiKeyEl.value || "").trim();
    if (!key) throw new Error("OpenAI API key missing.");
    url = "https://api.openai.com/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "moonshot") {
    const key = (moonshotKeyEl.value || "").trim();
    if (!key) throw new Error("Moonshot API key missing.");

    // sk-ki keys (Kimi for Code / kimi.com platform) use the Anthropic protocol.
    // Short-circuit here — convert OpenAI-style payload → Anthropic and return.
    if (isKimiCodeKey(key)) {
      const body = buildKimiAnthropicBody(model, messages, { temperature, maxTokens: 4096 });
      if (tools && tools.length) {
        body.tools = tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters || { type: "object", properties: {} },
        }));
      }
      const { res } = await fetchKimiAnthropic("/v1/messages", key, () => ({
        method: "POST", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
        signal,
      }));
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(cloudHttpError("moonshot", res.status, txt, res.headers.get("Retry-After")));
      }
      const data = await res.json();
      cloudRecord("moonshot", { model, tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) });
      const contentBlocks = data.content || [];
      let text = "";
      const toolCalls = [];
      for (const block of contentBlocks) {
        if (block.type === "text") text += block.text;
        if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, arguments: block.input || {} });
      }
      return {
        content: text || null,
        tool_calls: toolCalls.length ? toolCalls.map(c => ({ id: c.id, function: { name: c.name, arguments: c.arguments } })) : null,
        raw: data,
      };
    }

    moonshotKeyForRequest = key;
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "deepseek") {
    const key = (deepseekKeyEl.value || "").trim();
    if (!key) throw new Error("DeepSeek API key missing.");
    url = "https://api.deepseek.com/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "mistral") {
    const key = (mistralKeyEl.value || "").trim();
    if (!key) throw new Error("Mistral API key missing.");
    url = "https://api.mistral.ai/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "minimax") {
    const key = (minimaxKeyEl.value || "").trim();
    if (!key) throw new Error("MiniMax API key missing.");
    url = "https://api.minimax.io/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "glm") {
    const key = (glmKeyEl.value || "").trim();
    if (!key) throw new Error("GLM API key missing.");
    url = "https://api.z.ai/api/coding/paas/v4/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "nvidia") {
    const key = (nvidiaKeyEl.value || "").trim();
    if (!key) throw new Error("NVIDIA API key missing.");
    url = "https://integrate.api.nvidia.com/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else {
    throw new Error("Unknown provider: " + provider);
  }
  const supportsOpenAIVision =
    provider === "openai" ||
    provider === "openrouter" ||
    provider === "minimax" ||
    (provider === "groq" && /vision/i.test(model));
  if (hasImages && !supportsOpenAIVision) {
    throw new Error(`${provider}:${model} cannot read PDF page images. Select OpenAI, Gemini, Anthropic, OpenRouter vision, NVIDIA vision, or a Groq vision model for image-only PDFs.`);
  }
  const requestMessages = hasImages ? toOpenAIVision(messages) : textMessages;
  const body = {
    model, messages: requestMessages,
    temperature: typeof temperature === "number" ? temperature : 0.7,
    stream: false
  };
  if (tools.length) { body.tools = tools; body.tool_choice = "auto"; }
  let r;
  if (provider === "moonshot") {
    ({ res: r } = await fetchMoonshotApi("/chat/completions", moonshotKeyForRequest, () => ({
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    })));
  } else {
    r = await cloudFetch(provider, url, { method: "POST", referrerPolicy: "no-referrer", headers, body: JSON.stringify(body), signal });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(cloudHttpError(provider, r.status, txt, r.headers.get("Retry-After")));
  }
  const data = await r.json();
  cloudRecord(provider, { model, tokens: data.usage?.total_tokens });
  const msg = data.choices?.[0]?.message || {};
  const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls.map((c, i) => ({
    id: c.id || `call_${Date.now()}_${i}`,
    name: c.function?.name,
    arguments: typeof c.function?.arguments === "string"
      ? safeJsonParse(c.function.arguments)
      : (c.function?.arguments || {})
  })) : null;
  return { content: msg.content || null, tool_calls: calls && calls.length ? calls : null, raw: msg };
}

/** Provider-specific flags for OpenAI-compatible streaming (e.g. GLM tool_stream). */
function applyOpenAIStreamExtras(body, provider, tools) {
  if (tools?.length && provider === "glm") {
    body.tool_stream = true;
  }
  return body;
}

function isGlmStreamDecodeError(text) {
  return /Stream read failed|decoding response body|error decoding/i.test(String(text || ""));
}

async function agentTurnOpenAIStream({ provider, model, messages, tools, temperature, signal, onToken }) {
  const CAS = window.CdrAgentStream;
  if (!CAS?.readOpenAIAgentSSE) {
    const turn = await agentTurnOpenAI({ provider, model, messages, tools, temperature, signal });
    if (turn.content && onToken) onToken(turn.content, turn.content);
    return turn;
  }
  // GLM + tools: Z.AI streaming often breaks mid-body (HTTP 200 + decode error). Non-stream is reliable.
  if (provider === "glm" && tools?.length) {
    const turn = await agentTurnOpenAI({ provider, model, messages, tools, temperature, signal });
    if (turn.content && onToken) onToken(turn.content, turn.content);
    return turn;
  }
  let url, headers;
  let moonshotKeyForRequest = "";
  const hasImages = messages.some(m => m.images?.length);
  const textMessages = messages.map(m => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      return { role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, name: m.name || '', content: m.content || '' };
    }
    return { role: m.role, content: m.content || '' };
  });
  if (provider === "groq") {
    const key = (groqKeyEl.value || "").trim();
    if (!key) throw new Error("Groq API key missing.");
    url = "https://api.groq.com/openai/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "openrouter") {
    const key = (openRouterKeyEl.value || "").trim();
    if (!key) throw new Error("OpenRouter API key missing.");
    url = "https://openrouter.ai/api/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "HTTP-Referer": "https://miraxcode.local", "X-Title": "MiraXcode" };
  } else if (provider === "cerebras") {
    const key = (cerebrasKeyEl.value || "").trim();
    if (!key) throw new Error("Cerebras API key missing.");
    url = "https://api.cerebras.ai/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "samba") {
    const key = (sambaKeyEl.value || "").trim();
    if (!key) throw new Error("SambaNova API key missing.");
    url = "https://api.sambanova.ai/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "openai") {
    const key = (openaiKeyEl.value || "").trim();
    if (!key) throw new Error("OpenAI API key missing.");
    url = "https://api.openai.com/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "moonshot") {
    const key = (moonshotKeyEl.value || "").trim();
    if (!key) throw new Error("Moonshot API key missing.");
    if (isKimiCodeKey(key)) {
      const turn = await agentTurnOpenAI({ provider, model, messages, tools, temperature, signal });
      if (turn.content && onToken) onToken(turn.content, turn.content);
      return turn;
    }
    moonshotKeyForRequest = key;
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "deepseek") {
    const key = (deepseekKeyEl.value || "").trim();
    if (!key) throw new Error("DeepSeek API key missing.");
    url = "https://api.deepseek.com/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "mistral") {
    const key = (mistralKeyEl.value || "").trim();
    if (!key) throw new Error("Mistral API key missing.");
    url = "https://api.mistral.ai/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "minimax") {
    const key = (minimaxKeyEl.value || "").trim();
    if (!key) throw new Error("MiniMax API key missing.");
    url = "https://api.minimax.io/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else if (provider === "glm") {
    const key = (glmKeyEl.value || "").trim();
    if (!key) throw new Error("GLM API key missing.");
    url = "https://api.z.ai/api/coding/paas/v4/chat/completions";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "Accept": "text/event-stream",
      "Accept-Language": "en-US,en",
    };
  } else if (provider === "nvidia") {
    const key = (nvidiaKeyEl.value || "").trim();
    if (!key) throw new Error("NVIDIA API key missing.");
    url = "https://integrate.api.nvidia.com/v1/chat/completions";
    headers = { "Content-Type": "application/json", "Authorization": `Bearer ${key}` };
  } else {
    throw new Error("Unknown provider: " + provider);
  }
  const supportsOpenAIVision =
    provider === "openai" ||
    provider === "openrouter" ||
    provider === "minimax" ||
    (provider === "groq" && /vision/i.test(model));
  if (hasImages && !supportsOpenAIVision) {
    throw new Error(`${provider}:${model} cannot read PDF page images. Select OpenAI, Gemini, Anthropic, OpenRouter vision, NVIDIA vision, or a Groq vision model for image-only PDFs.`);
  }
  const requestMessages = hasImages ? toOpenAIVision(messages) : textMessages;
  const body = {
    model,
    messages: requestMessages,
    temperature: typeof temperature === "number" ? temperature : 0.7,
    stream: true,
  };
  if (tools.length) { body.tools = tools; body.tool_choice = "auto"; }
  applyOpenAIStreamExtras(body, provider, tools);
  let r;
  if (provider === "moonshot") {
    ({ res: r } = await fetchMoonshotApi("/chat/completions", moonshotKeyForRequest, () => ({
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    })));
  } else {
    r = await cloudFetch(provider, url, { method: "POST", referrerPolicy: "no-referrer", headers, body: JSON.stringify(body), signal });
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    if (provider === "glm" && isGlmStreamDecodeError(txt)) {
      console.warn("[glm] native stream failed, retrying non-stream:", txt.slice(0, 120));
      const fallback = await agentTurnOpenAI({ provider, model, messages, tools, temperature, signal });
      if (fallback.content && onToken) onToken(fallback.content, fallback.content);
      return fallback;
    }
    throw new Error(cloudHttpError(provider, r.status, txt, r.headers.get("Retry-After")));
  }
  if (!r.body) {
    const txt = await r.text().catch(() => "");
    if (provider === "glm" && isGlmStreamDecodeError(txt)) {
      const fallback = await agentTurnOpenAI({ provider, model, messages, tools, temperature, signal });
      if (fallback.content && onToken) onToken(fallback.content, fallback.content);
      return fallback;
    }
    throw new Error(txt || `${provider} returned an empty stream body`);
  }
  let content = "";
  const toolAcc = {};
  try {
    for await (const chunk of CAS.readOpenAIAgentSSE(r.body)) {
      if (chunk.content) {
        content += chunk.content;
        onToken?.(chunk.content, content);
      }
      if (chunk.tool_calls) CAS.mergeToolCallDeltas(toolAcc, chunk.tool_calls);
    }
  } catch (streamErr) {
    const msg = streamErr?.message || String(streamErr);
    if (provider === "glm" && isGlmStreamDecodeError(msg)) {
      console.warn("[glm] SSE read failed, retrying non-stream:", msg.slice(0, 120));
      const fallback = await agentTurnOpenAI({ provider, model, messages, tools, temperature, signal });
      if (fallback.content && onToken) onToken(fallback.content, fallback.content);
      return fallback;
    }
    throw streamErr;
  }
  cloudRecord(provider, { model });
  const calls = CAS.finalizeToolCalls(toolAcc, safeJsonParse);
  return { content: content || null, tool_calls: calls, raw: null };
}

async function agentTurnOllamaStream({ model, messages, tools, temperature, signal, onToken }) {
  const host = safeHost();
  const r = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      keep_alive: -1,
      tools: tools.length ? tools : undefined,
      options: { temperature, num_ctx: 8192 },
    }),
    signal,
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let content = "";
  let finalToolCalls = null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const msg = obj.message || {};
          if (msg.content) {
            content += msg.content;
            onToken?.(msg.content, content);
          }
          if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
            finalToolCalls = msg.tool_calls.map((c, i) => ({
              id: c.id || `call_${Date.now()}_${i}`,
              name: c.function?.name || c.name,
              arguments: typeof c.function?.arguments === "string"
                ? safeJsonParse(c.function.arguments)
                : (c.function?.arguments || c.arguments || {}),
            }));
          }
        } catch {}
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return {
    content: content || null,
    tool_calls: finalToolCalls?.length ? finalToolCalls : null,
    raw: null,
  };
}

async function agentTurnGeminiStream({ model, messages, tools, temperature, signal, onToken }) {
  const CAS = window.CdrAgentStream;
  const key = (geminiKeyEl.value || "").trim();
  if (!key) throw new Error("Google AI Studio key missing.");
  const systemMsg = messages.find(m => m.role === "system");
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: m.name, response: safeJsonParse(m.content) || { text: String(m.content) } } }]
      });
      continue;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      contents.push({
        role: "model",
        parts: m.tool_calls.map(c => ({
          functionCall: {
            name: c.function?.name || c.name,
            args: typeof c.function?.arguments === "string"
              ? safeJsonParse(c.function.arguments)
              : (c.arguments || c.function?.arguments || {})
          }
        }))
      });
      continue;
    }
    const parts = [];
    if (m.content) parts.push({ text: m.content });
    if (m.images?.length) m.images.forEach(b64 => parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } }));
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: parts.length ? parts : [{ text: "" }],
    });
  }
  const body = {
    contents,
    generationConfig: { temperature: typeof temperature === "number" ? temperature : 0.7 },
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    ...(tools.length ? { tools } : {}),
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const res = await cloudFetch("gemini", url, {
    method: "POST",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(cloudHttpError("gemini", res.status, txt, res.headers.get("Retry-After")));
  }
  let content = "";
  const calls = [];
  const readGemini = CAS?.readGeminiAgentSSE;
  if (readGemini) {
    for await (const parts of readGemini(res.body)) {
      for (const p of parts) {
        if (p.text) {
          content += p.text;
          onToken?.(p.text, content);
        }
        if (p.functionCall) {
          calls.push({
            id: `call_${Date.now()}_${calls.length}`,
            name: p.functionCall.name,
            arguments: p.functionCall.args || {},
          });
        }
      }
    }
  } else {
    const turn = await agentTurnGemini({ model, messages, tools, temperature, signal });
    if (turn.content && onToken) onToken(turn.content, turn.content);
    return turn;
  }
  cloudRecord("gemini", { model });
  return {
    content: content || null,
    tool_calls: calls.length ? calls : null,
    raw: null,
  };
}

async function agentTurnAnthropicStream({ model, messages, tools, temperature, signal, onToken }) {
  const CAS = window.CdrAgentStream;
  const key = (anthropicKeyEl.value || "").trim();
  if (!key) throw new Error("Anthropic API key missing.");
  const systemMsg = messages.find(m => m.role === "system");
  const anthropicMessages = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      anthropicMessages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: String(m.content) }]
      });
      continue;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const content = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.tool_calls) {
        content.push({
          type: "tool_use",
          id: c.id || `tu_${Date.now()}`,
          name: c.function?.name || c.name,
          input: typeof c.function?.arguments === "string" ? safeJsonParse(c.function.arguments) : (c.function?.arguments || c.arguments || {})
        });
      }
      anthropicMessages.push({ role: "assistant", content });
      continue;
    }
    const content = [];
    if (m.content) content.push({ type: "text", text: m.content });
    if (m.images?.length) m.images.forEach(b64 => content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } }));
    anthropicMessages.push({ role: m.role === "assistant" ? "assistant" : "user", content: content.length ? content : [{ type: "text", text: "" }] });
  }
  const body = {
    model,
    messages: anthropicMessages,
    max_tokens: 4096,
    stream: true,
    ...(systemMsg ? { system: systemMsg.content } : {}),
    ...(typeof temperature === "number" ? { temperature } : {}),
  };
  if (tools.length) {
    body.tools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters || { type: "object", properties: {} },
    }));
  }
  const res = await cloudFetch("anthropic", "https://api.anthropic.com/v1/messages", {
    method: "POST",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(cloudHttpError("anthropic", res.status, txt, res.headers.get("Retry-After")));
  }
  if (!CAS?.readAnthropicAgentSSE) {
    const turn = await agentTurnAnthropic({ model, messages, tools, temperature, signal });
    if (turn.content && onToken) onToken(turn.content, turn.content);
    return turn;
  }
  const state = CAS.createAnthropicStreamState();
  for await (const evt of CAS.readAnthropicAgentSSE(res.body)) {
    CAS.applyAnthropicStreamEvent(state, evt, onToken);
  }
  cloudRecord("anthropic", { model });
  const toolCalls = CAS.finalizeAnthropicToolCalls(state, safeJsonParse);
  return {
    content: state.content || null,
    tool_calls: toolCalls?.length ? toolCalls.map(c => ({ id: c.id, function: { name: c.name, arguments: c.arguments } })) : null,
    raw: null,
  };
}

async function agentTurnAnthropic({ model, messages, tools, temperature, signal }) {
  const key = (anthropicKeyEl.value || "").trim();
  if (!key) throw new Error("Anthropic API key missing.");
  const systemMsg = messages.find(m => m.role === "system");
  // Convert OpenAI-style messages to Anthropic format
  const anthropicMessages = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      anthropicMessages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id, content: String(m.content) }]
      });
      continue;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const content = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.tool_calls) {
        content.push({
          type: "tool_use",
          id: c.id || `tu_${Date.now()}`,
          name: c.function?.name || c.name,
          input: typeof c.function?.arguments === "string" ? safeJsonParse(c.function.arguments) : (c.function?.arguments || c.arguments || {})
        });
      }
      anthropicMessages.push({ role: "assistant", content });
      continue;
    }
    const content = [];
    if (m.content) content.push({ type: "text", text: m.content });
    if (m.images?.length) m.images.forEach(b64 => content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } }));
    anthropicMessages.push({ role: m.role === "assistant" ? "assistant" : "user", content });
  }
  const body = {
    model,
    messages: anthropicMessages,
    max_tokens: 4096,
    ...(systemMsg ? { system: systemMsg.content } : {}),
    ...(typeof temperature === "number" ? { temperature } : {}),
  };
  if (tools.length) {
    body.tools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters || { type: "object", properties: {} }
    }));
  }
  const r = await cloudFetch("anthropic", "https://api.anthropic.com/v1/messages", {
    method: "POST", referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(cloudHttpError("anthropic", r.status, txt, r.headers.get("Retry-After")));
  }
  const data = await r.json();
  cloudRecord("anthropic", { model, tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) });
  const contentBlocks = data.content || [];
  let text = "";
  const toolCalls = [];
  for (const block of contentBlocks) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input || {}
      });
    }
  }
  return {
    content: text || null,
    tool_calls: toolCalls.length ? toolCalls.map(c => ({ id: c.id, function: { name: c.name, arguments: c.arguments } })) : null,
    raw: data
  };
}

async function agentTurnGemini({ model, messages, tools, temperature, signal }) {
  const key = (geminiKeyEl.value || "").trim();
  if (!key) throw new Error("Google AI Studio key missing.");
  // Translate OpenAI-style messages → Gemini contents.
  const systemMsg = messages.find(m => m.role === "system");
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: m.name, response: safeJsonParse(m.content) || { text: String(m.content) } } }]
      });
      continue;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      contents.push({
        role: "model",
        // appendAssistantToolCallTurn stores args as { function: { name, arguments: "json-string" } }
        // Gemini needs args as a plain object, so we parse the string here.
        parts: m.tool_calls.map(c => ({
          functionCall: {
            name: c.function?.name || c.name,
            args: typeof c.function?.arguments === "string"
              ? safeJsonParse(c.function.arguments)
              : (c.arguments || c.function?.arguments || {})
          }
        }))
      });
      continue;
    }
    const parts = [];
    if (m.content) parts.push({ text: m.content });
    if (m.images?.length) m.images.forEach(b64 => parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } }));
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: parts.length ? parts : [{ text: "" }]
    });
  }
  const body = {
    contents,
    generationConfig: { temperature: typeof temperature === "number" ? temperature : 0.7 },
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    ...(tools.length ? { tools } : {})
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await cloudFetch("gemini", url, { method: "POST", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(cloudHttpError("gemini", r.status, txt, r.headers.get("Retry-After")));
  }
  const data = await r.json();
  cloudRecord("gemini", { model });
  const parts = data.candidates?.[0]?.content?.parts || [];
  let textOut = "";
  const calls = [];
  for (const p of parts) {
    if (p.text) textOut += p.text;
    if (p.functionCall) {
      calls.push({
        id: `call_${Date.now()}_${calls.length}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args || {}
      });
    }
  }
  return { content: textOut || null, tool_calls: calls.length ? calls : null, raw: data };
}

function safeJsonParse(s) {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return {}; }
}

// Pull python source out of one or more ```python``` fences in a model
// reply. Handles the common buggy variants ([wb.save](...) auto-links,
// smart quotes) so we can re-run the code reliably.
function extractPythonFence(text) {
  if (!text) return "";
  const fences = [];
  const re = /```(?:python|py)?\s*\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) fences.push(m[1]);
  if (!fences.length) return "";
  let code = fences.join("\n\n");
  // Markdown auto-link mangling: [wb.save](http://wb.save) → wb.save
  code = code.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Smart quotes → straight quotes
  code = code.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return code.trim();
}

// Pick the right adapter based on the model selector value.
function selectAgentAdapter(modelValue) {
  if (modelValue.startsWith("cloud:")) {
    const { provider, modelId } = parseCloudModel(modelValue);
    if (provider === "gemini") return { kind: "gemini", model: modelId };
    if (provider === "anthropic") return { kind: "anthropic", model: modelId };
    if (provider === "groq" || provider === "openrouter" || provider === "cerebras" || provider === "samba" || provider === "openai" || provider === "moonshot" || provider === "deepseek" || provider === "mistral" || provider === "minimax" || provider === "glm" || provider === "nvidia") {
      return { kind: "openai", provider, model: modelId };
    }
    throw new Error(`Unknown cloud provider for agent mode: ${provider}`);
  }
  return { kind: "ollama", model: modelValue };
}

// Convert message list into the right shape for tool-call appending.
// OpenAI/Ollama use the same shape; Gemini we translate inside its adapter.
function appendAssistantToolCallTurn(messages, content, toolCalls) {
  messages.push({
    role: "assistant",
    content: content || "",
    tool_calls: toolCalls.map(c => ({
      id: c.id,
      type: "function",
      function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) }
    }))
  });
}
function appendToolResult(messages, call, resultStr) {
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    name: call.name,
    content: resultStr
  });
}

// -------------------------------------------------------------------------
// The loop. Builds messages, calls provider, executes tool_calls, repeats.
// Streams status into the assistant bubble. Returns the final text.
// -------------------------------------------------------------------------
async function runAgentLoop({ agent, assistant, signal, onStatus, onFinalToken }) {
  // Lite mode: tiny models (1.5B–3B) can't reliably emit tool_calls and
  // get confused by long system prompts. Skip the tool-calling round-trip
  // entirely and use the streaming fallback with compact memory injection.
  if (agent && agent.lite) {
    return await runAgentLiteFlow({ agent, assistant, signal, onStatus, onFinalToken });
  }
  const modelValue = modelEl.value;
  const adapter = selectAgentAdapter(modelValue);
  // Per-message tool tracker — the renderer reads this off the message
  // object to draw the "tools used" badges below the bubble.
  if (!assistant.toolsUsed) assistant.toolsUsed = [];
  const tracker = assistant.toolsUsed;
  const temperature = (v => Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0.7)(parseFloat(tempEl.value));
  const tools = adapter.kind === "gemini" ? buildGeminiTools(agent) : buildOpenAITools(agent);

  // ---- Build initial message list ----
  const baseMessages = buildOllamaMessages();

  // Inject relevant memories at the top of the system prompt — this is the
  // "real memory" piece. The model gets context from past conversations
  // automatically, even before it calls recall_facts itself.
  const userText = baseMessages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
  // Auto-save common preference/identity statements so memory works even
  // if the model forgets to call remember_fact (small models often do).
  try { memAutoExtract(userText); } catch {}
  const scored = memRecall(userText, 8);
  // Keyword recall misses semantic matches (e.g. "what animal do I love"
  // won't match a saved "likes: cats"). Always merge in the most recent
  // facts so the model has baseline context even when keywords don't overlap.
  const recentTop = memLoad().slice(-12).reverse();
  const seen = new Set(scored.map(f => f.key.toLowerCase()));
  const recalled = scored.slice();
  for (const f of recentTop) {
    if (recalled.length >= 14) break;
    const k = f.key.toLowerCase();
    if (!seen.has(k)) { recalled.push(f); seen.add(k); }
  }
  if (recalled.length) {
    const memBlock = "[INTERNAL MEMORY — do NOT recite, list, or acknowledge this block unless the user explicitly asks what you remember. Use silently as background context only.]\n" +
      recalled.map(f => `- ${f.key}: ${f.value}`).join("\n");
    // Prepend to system message, or insert one if none exists
    const sysIdx = baseMessages.findIndex(m => m.role === "system");
    if (sysIdx >= 0) baseMessages[sysIdx].content = `${baseMessages[sysIdx].content}\n\n${memBlock}`;
    else baseMessages.unshift({ role: "system", content: memBlock });
  }

  let messages = baseMessages;
  if (window.HC?.contextCompactor?.prepareForApi) {
    try {
      messages = await HC.contextCompactor.prepareForApi(baseMessages, {
        modelValue,
        signal,
        onStatus: (t) => { if (t) onStatus?.(t, "thinking"); },
      });
      if (messages.length < baseMessages.length) {
        recordAgentEvent(assistant, "context", "Context compacted for model window");
      }
    } catch (e) {
      console.warn("[Agent] context compact:", e);
      messages = baseMessages;
    }
  }
  let iter = 0;
  let finalText = "";
  let hasNudged = false; // prevent repeated nudges if model keeps returning empty

  while (iter < AGENT_MAX_ITERATIONS) {
    iter++;
    recordAgentEvent(assistant, "thinking", `Step ${iter}`);
    onStatus?.(`Thinking (step ${iter})…`, "thinking");

    let turn;
    try {
      if (adapter.kind === "ollama") {
        turn = await agentTurnOllama({ model: adapter.model, messages, tools, temperature, signal });
      } else if (adapter.kind === "gemini") {
        turn = await agentTurnGemini({ model: adapter.model, messages, tools, temperature, signal });
      } else if (adapter.kind === "anthropic") {
        turn = await agentTurnAnthropic({ model: adapter.model, messages, tools, temperature, signal });
      } else {
        turn = await agentTurnOpenAI({ provider: adapter.provider, model: adapter.model, messages, tools, temperature, signal });
      }
    } catch (e) {
      // If the model rejects tools (older models, some configs), retry once
      // without tools — the agent then runs in legacy "RAG-prefetch" mode.
      const msg = String(e?.message || "");
      if (tools.length && /tool|function/i.test(msg) && iter === 1) {
        onStatus?.("Model doesn't support tools — falling back to context injection", "warn");
        return await runAgentFallback({ agent, assistant, signal, onStatus, onFinalToken });
      }
      throw e;
    }

    if (turn.tool_calls && turn.tool_calls.length) {
      // Persist the assistant's tool-call turn into history
      appendAssistantToolCallTurn(messages, turn.content, turn.tool_calls);
      // Execute each requested tool
      for (const call of turn.tool_calls) {
        if (signal?.aborted) return finalText;
        recordAgentEvent(assistant, "tool_call", call.name, call.arguments || {});
        const resultStr = await runOneTool(call.name, call.arguments, onStatus, tracker);
        recordAgentEvent(assistant, "tool_result", call.name, safeJsonParse(resultStr));
        appendToolResult(messages, call, resultStr);
      }
      // Loop — model sees tool results next iteration
      continue;
    }

    // No tool calls → we have a final answer.
    // ── Auto-execute safety net ──────────────────────────────────────
    // Smaller / weaker tool-calling models sometimes write the code in
    // a markdown fence and pretend they ran it. If the agent has the
    // code interpreter enabled and the reply contains a python fence
    // but no execute_python call happened, run it ourselves and let
    // the model see the real result on the next iteration.
    const candidateText = turn.content || "";
    const hasPythonTool = (agent.tools || []).includes("code_interpreter") || (agent.tools || []).includes("python");
    if (hasPythonTool && candidateText && iter < AGENT_MAX_ITERATIONS) {
      const pyCode = extractPythonFence(candidateText);
      const claimsRan = /\b(downloaded|saved|created|generated|exported)\b/i.test(candidateText) && /\/output\//.test(candidateText + pyCode);
      if (pyCode && (claimsRan || /\/output\//.test(pyCode))) {
        onStatus?.("Model wrote code without calling the tool — auto-executing…", "warn");
        // Synthesize a tool call so history stays consistent
        const synth = {
          id: `call_auto_${Date.now()}`,
          name: "execute_python",
          arguments: { code: pyCode }
        };
        appendAssistantToolCallTurn(messages, candidateText, [synth]);
        const resultStr = await runOneTool("execute_python", synth.arguments, onStatus, tracker);
        appendToolResult(messages, synth, resultStr);
        // Nudge the model to acknowledge what really happened
        messages.push({
          role: "system",
          content: "The Python code in your previous reply was executed automatically. Use the tool result above to write your real answer. If files were generated, mention their actual filenames from the result. Do not show the code again."
        });
        continue;
      }
    }
    // Model returned empty content after running tools — nudge it once to write
    // an acknowledgement so the bubble is never silently blank.
    if (!candidateText && !hasNudged && iter < AGENT_MAX_ITERATIONS && tracker.length) {
      hasNudged = true;
      const nudge = tracker.some(t => t.name === "remember_fact" && t.ok)
        ? "You just saved a fact to memory. Briefly confirm what you saved in one sentence."
        : "You just completed a tool action. Briefly summarize what you did in one sentence.";
      messages.push({ role: "user", content: nudge });
      continue;
    }
    finalText = candidateText;
    recordAgentEvent(assistant, "final", `Final answer · ${finalText.length} chars`);
    break;
  }

  if (iter >= AGENT_MAX_ITERATIONS) {
    onStatus?.("Reached max tool iterations — finalizing", "warn");
    // One more call without tools to force a text answer
    try {
      const closing = adapter.kind === "ollama"
        ? await agentTurnOllama({ model: adapter.model, messages, tools: [], temperature, signal })
        : adapter.kind === "gemini"
        ? await agentTurnGemini({ model: adapter.model, messages, tools: [], temperature, signal })
        : adapter.kind === "anthropic"
        ? await agentTurnAnthropic({ model: adapter.model, messages, tools: [], temperature, signal })
        : await agentTurnOpenAI({ provider: adapter.provider, model: adapter.model, messages, tools: [], temperature, signal });
      finalText = closing.content || finalText || "(no answer)";
    } catch {}
  }

  // If still empty but tools ran, synthesize a fallback so the bubble is never blank.
  if (!finalText && tracker.length) {
    const memSaved = tracker.filter(t => t.name === "remember_fact" && t.ok);
    finalText = memSaved.length
      ? `Saved ${memSaved.length === 1 ? "that" : `${memSaved.length} facts`} to memory.`
      : "Done.";
  }

  // Stream the final text into the bubble so the UX feels live even though
  // the call itself was non-streaming.
  if (finalText) typewriterIntoBubble(finalText, onFinalToken);
  return finalText;
}

// Lite flow — for small models (1.5B–3B). No tool-calling, no extra
// tool-call round-trips. Just: auto-extract from user msg, inject a
// compact memory block (top 5 most recent, plain "Key: value" lines —
// small models drift on the [INTERNAL MEMORY] framing), then stream.
async function runAgentLiteFlow({ agent, assistant, signal, onStatus, onFinalToken }) {
  if (!assistant.toolsUsed) assistant.toolsUsed = [];
  const userText = buildOllamaMessages().filter(m=>m.role==="user").slice(-1)[0]?.content || "";
  try { memAutoExtract(userText); } catch {}
  let toolContext = null;
  try {
    const scored = memRecall(userText, 4);
    const recent = memLoad().slice(-5).reverse();
    const seen = new Set(scored.map(f => f.key.toLowerCase()));
    const merged = scored.slice();
    for (const f of recent) {
      if (merged.length >= 6) break;
      const k = f.key.toLowerCase();
      if (!seen.has(k)) { merged.push(f); seen.add(k); }
    }
    if (merged.length) {
      toolContext = "Memory:\n" + merged.map(f => `- ${f.key}: ${f.value}`).join("\n");
    }
  } catch {}
  onStatus?.("Generating reply…", "running");
  await streamChat(assistant, toolContext, null);
}

// Legacy fallback for models that genuinely don't speak function-calling.
// We pre-fetch tool context (old runAgentTools), then do a streaming chat.
async function runAgentFallback({ agent, assistant, signal, onStatus, onFinalToken }) {
  onStatus?.("Pre-fetching context…", "running");
  const userText = buildOllamaMessages().filter(m=>m.role==="user").slice(-1)[0]?.content || "";
  try { memAutoExtract(userText); } catch {}
  let toolContext = null;
  try {
    let q = null;
    if (rewriterEl?.value) q = await rewriteForSearch(userText);
    toolContext = await runAgentTools(agent, userText, q);
  } catch {}
  // Inject memories into context for non-tool-calling models too
  try {
    const scored = memRecall(userText, 8);
    const recentTop = memLoad().slice(-12).reverse();
    const seen = new Set(scored.map(f => f.key.toLowerCase()));
    const recalled = scored.slice();
    for (const f of recentTop) {
      if (recalled.length >= 14) break;
      const k = f.key.toLowerCase();
      if (!seen.has(k)) { recalled.push(f); seen.add(k); }
    }
    if (recalled.length) {
      const memBlock = "[INTERNAL MEMORY — do NOT recite or list unless the user explicitly asks what you remember. Use silently as background.]\n" +
        recalled.map(f => `- ${f.key}: ${f.value}`).join("\n");
      toolContext = toolContext ? `${memBlock}\n\n${toolContext}` : memBlock;
    }
  } catch {}
  onStatus?.("Generating reply…", "running");
  await streamChat(assistant, toolContext, null);
}

// Animated typewriter — writes the final non-streamed answer into the bubble
// at ~120 chars/s so the UI still feels alive after the agent loop returns.
function typewriterIntoBubble(text, onToken) {
  if (!text) return;
  // For very long answers, skip the animation past 2000 chars.
  const FAST_CUTOFF = 2000;
  if (text.length > FAST_CUTOFF) {
    onToken?.(text);
    return;
  }
  let i = 0;
  const STEP = 8; // chars per tick
  const tick = () => {
    const slice = text.slice(i, i + STEP);
    if (!slice) return;
    onToken?.(slice);
    i += STEP;
    if (i < text.length) requestAnimationFrame(tick);
  };
  tick();
}


  return {
    agentTurnOllama,
    agentTurnOpenAI,
    agentTurnOpenAIStream,
    agentTurnOllamaStream,
    agentTurnGeminiStream,
    agentTurnAnthropicStream,
    agentTurnAnthropic,
    agentTurnGemini,
    safeJsonParse,
    extractPythonFence,
    selectAgentAdapter,
    appendAssistantToolCallTurn,
    appendToolResult,
    runAgentLoop,
    runAgentLiteFlow,
    runAgentFallback,
    typewriterIntoBubble,
  };
}
