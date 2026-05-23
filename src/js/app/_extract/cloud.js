async function cloudFetch(provider, url, init) {
  if (HC?.providerUsage?.waitForCapacity) {
    await HC.providerUsage.waitForCapacity(provider);
  }
  const method = (init?.method || "GET").toUpperCase();
  const bodyStr = typeof init?.body === "string" ? init.body : "";
  const accept = (init?.headers?.Accept || init?.headers?.accept || "");
  const isStream =
    accept.includes("event-stream") ||
    (bodyStr.includes("stream") && /"stream"\s*:\s*true/.test(bodyStr));
  if (HC?.isTauri && HC?.invoke) {
    const res = isStream
      ? await nativeHttpStream(url, init)
      : await nativeHttpRequest(url, init);
    HC?.providerUsage?.handleResponse?.(provider, res);
    return res;
  }
  if (HC?.providerUsage?.fetchCloud) return HC.providerUsage.fetchCloud(provider, url, init);
  return fetch(url, init);
}
function cloudRecord(provider, meta) {
  HC?.providerUsage?.recordRequest?.(provider, meta);
  updateCloudUsageChip();
}
function getProviderKey(providerId) {
  const map = {
    groq: groqKeyEl, gemini: geminiKeyEl, openrouter: openRouterKeyEl,
    cerebras: cerebrasKeyEl, samba: sambaKeyEl, openai: openaiKeyEl,
    anthropic: anthropicKeyEl, moonshot: moonshotKeyEl, deepseek: deepseekKeyEl,
    mistral: mistralKeyEl, minimax: minimaxKeyEl, glm: glmKeyEl, nvidia: nvidiaKeyEl,
  };
  const el = map[providerId];
  return (el?.value || "").trim();
}
const cloudUsageChipEl = $("cloudUsageChip");
function updateCloudUsageChip() {
  if (!cloudUsageChipEl || !HC?.providerUsage) return;
  const parsed = parseCloudModel(modelEl?.value || "");
  if (!parsed) {
    cloudUsageChipEl.classList.remove("visible");
    cloudUsageChipEl.textContent = "";
    return;
  }
  const summary = HC.providerUsage.getSummary(parsed.provider);
  if (!summary) {
    cloudUsageChipEl.classList.remove("visible");
    return;
  }
  cloudUsageChipEl.textContent = summary;
  cloudUsageChipEl.classList.add("visible");
  cloudUsageChipEl.title = `${parsed.provider} usage — open Settings → APIs for details`;
  if (HC.providerUsage.isRateLimited(parsed.provider)) {
    cloudUsageChipEl.classList.add("limited");
  } else {
    cloudUsageChipEl.classList.remove("limited");
  }
}

const API_PROVIDERS = [
  { id: "groq",       name: "Groq",        keyId: "groqKey",       testUrl: "https://api.groq.com/openai/v1/models",           auth: "bearer" },
  { id: "gemini",     name: "Gemini",      keyId: "geminiKey",     testUrl: "https://generativelanguage.googleapis.com/v1beta/models?key=", auth: "query" },
  { id: "openai",     name: "OpenAI",      keyId: "openaiKey",     testUrl: "https://api.openai.com/v1/models",               auth: "bearer" },
  { id: "anthropic",  name: "Anthropic",   keyId: "anthropicKey",  testUrl: "https://api.anthropic.com/v1/models",            auth: "bearer" },
  { id: "moonshot",   name: "Moonshot (Kimi)", keyId: "moonshotKey", testUrl: null,                                             auth: "moonshot" },
  { id: "deepseek",   name: "DeepSeek",    keyId: "deepseekKey",   testUrl: "https://api.deepseek.com/v1/models",             auth: "bearer" },
  { id: "mistral",    name: "Mistral",     keyId: "mistralKey",    testUrl: "https://api.mistral.ai/v1/models",               auth: "bearer" },
  { id: "cerebras",   name: "Cerebras",    keyId: "cerebrasKey",   testUrl: "https://api.cerebras.ai/v1/models",              auth: "bearer" },
  { id: "samba",      name: "SambaNova",   keyId: "sambaKey",      testUrl: "https://api.sambanova.ai/v1/models",             auth: "bearer" },
  { id: "openrouter", name: "OpenRouter",  keyId: "openRouterKey", testUrl: "https://openrouter.ai/api/v1/auth/key",          auth: "bearer" },
  { id: "nvidia",     name: "NVIDIA NIM",  keyId: "nvidiaKey",     testUrl: "https://integrate.api.nvidia.com/v1/models",     auth: "bearer" },
  { id: "minimax",    name: "MiniMax",     keyId: "minimaxKey",    testUrl: "https://api.minimax.io/v1/models",                auth: "bearer" },
  { id: "glm",        name: "GLM (Z.AI Coding Plan)", keyId: "glmKey",     testUrl: "https://api.z.ai/api/coding/paas/v4/models",    auth: "bearer" },
];

const API_KEY_VALIDATION_KEY = "atelier_api_validation";
const API_TEST_PROMPT = "Reply with exactly: OK";
const API_TEST_MODEL_OVERRIDE = {
  groq: "llama-3.1-8b-instant",
  gemini: "gemini-2.0-flash-lite",
  openrouter: "openrouter/free",
  cerebras: "llama3.1-8b",
  samba: "Meta-Llama-3.3-70B-Instruct",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
  moonshot: "moonshot-v1-8k",
  deepseek: "deepseek-chat",
  mistral: "mistral-small-latest",
  minimax: "MiniMax-M2.1",
  glm: "GLM-4.5-air",
  nvidia: "meta/llama-3.1-8b-instruct",
};
const OPENROUTER_KEY_PROBE_URLS = [
  "https://openrouter.ai/api/v1/auth/key",
  "https://openrouter.ai/api/v1/key",
];
const OPENROUTER_TEST_MODELS = [
  "openrouter/free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-v4-flash:free",
  "google/gemma-4-26b-a4b-it:free",
];
const API_CHAT_COMPLETION_URLS = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  cerebras: "https://api.cerebras.ai/v1/chat/completions",
  samba: "https://api.sambanova.ai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  minimax: "https://api.minimax.io/v1/chat/completions",
  glm: "https://api.z.ai/api/coding/paas/v4/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
};
const _apiTestInflight = new Map();
const _apiAutoTestTimers = {};

function fingerprintApiKey(key) {
  if (!key) return "";
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${key.length}:${(h >>> 0).toString(16)}`;
}

function readApiKeyValidation() {
  try {
    const raw = localStorage.getItem(API_KEY_VALIDATION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeApiKeyValidation(map) {
  try {
    localStorage.setItem(API_KEY_VALIDATION_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn("[api-test] could not persist validation:", err);
  }
}

function isProviderKeyValidated(providerId, key) {
  const fp = fingerprintApiKey((key || "").trim());
  if (!fp) return false;
  const entry = readApiKeyValidation()[providerId];
  return !!(entry && entry.ok && entry.fp === fp);
}

function markProviderKeyValidated(providerId, key, meta = {}) {
  const fp = fingerprintApiKey((key || "").trim());
  if (!fp) return;
  const all = readApiKeyValidation();
  all[providerId] = { ok: true, fp, at: Date.now(), ...meta };
  writeApiKeyValidation(all);
}

function clearProviderKeyValidated(providerId) {
  const all = readApiKeyValidation();
  if (!all[providerId]) return;
  delete all[providerId];
  writeApiKeyValidation(all);
}

function defaultApiTestModelId(providerId) {
  if (API_TEST_MODEL_OVERRIDE[providerId]) return API_TEST_MODEL_OVERRIDE[providerId];
  const models = typeof CLOUD_FALLBACK !== "undefined" ? CLOUD_FALLBACK[providerId] : null;
  if (!Array.isArray(models)) return null;
  const pick = models.find(m => m && !m.imageGen);
  if (!pick) return null;
  const parts = String(pick.value || "").split(":");
  return parts.length >= 3 ? parts.slice(2).join(":") : null;
}

function setApiKeyDotState(row, state, title) {
  const dot = row?.querySelector?.(".api-key-dot");
  if (!dot) return;
  const base = "api-key-dot";
  dot.className = state ? `${base} ${state}` : base;
  if (title) dot.title = title;
}

function syncApiKeyDotForProvider(provider) {
  const input = $(provider.keyId);
  if (!input) return;
  const row = input.closest(".api-key-row");
  if (!row) return;
  const key = (input.value || "").trim();
  if (!key) {
    setApiKeyDotState(row, "", "No API key");
    return;
  }
  if (isProviderKeyValidated(provider.id, key)) {
    setApiKeyDotState(row, "ok", "Validated — connection and test prompt succeeded");
    return;
  }
  if (_apiTestInflight.has(provider.id)) {
    setApiKeyDotState(row, "testing", "Testing connection and prompt…");
    return;
  }
  setApiKeyDotState(row, "pending", "Key entered — not validated yet");
}

async function httpProbeGet(url, headers = {}, timeoutMs = 12000) {
  if (HC.isTauri) {
    const hdr = {};
    for (const [k, v] of Object.entries(headers)) hdr[k] = String(v);
    return await HC.invoke("provider_http_probe", {
      url,
      method: "GET",
      headers: hdr,
      timeoutMs,
    });
  }
  try {
    const res = await fetch(url, {
      method: "GET",
      referrerPolicy: "no-referrer",
      headers,
      signal: makeSignal(timeoutMs),
    });
    const txt = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
      body_preview: txt.slice(0, 400),
    };
  } catch (e) {
    const msg = e?.message || "Network error";
    return { ok: false, status: 0, error: msg, body_preview: "" };
  }
}

async function httpProbeRequest(url, { method = "GET", headers = {}, body = null, timeoutMs = 30000 } = {}) {
  const m = (method || "GET").toUpperCase();
  if (HC.isTauri) {
    const hdr = {};
    for (const [k, v] of Object.entries(headers)) hdr[k] = String(v);
    const cmd = m === "GET" ? "provider_http_probe" : "provider_http_request";
    return await HC.invoke(cmd, {
      url,
      method: m,
      headers: hdr,
      body: body ?? undefined,
      timeoutMs,
    });
  }
  try {
    const res = await fetch(url, {
      method: m,
      referrerPolicy: "no-referrer",
      headers,
      body: body ?? undefined,
      signal: makeSignal(timeoutMs),
    });
    const txt = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
      body_preview: txt.slice(0, 400),
      body: txt,
    };
  } catch (e) {
    const msg = e?.message || "Network error";
    return { ok: false, status: 0, error: msg, body_preview: "", body: "" };
  }
}

function probeJsonBody(probe) {
  const raw = probe?.body || probe?.body_preview || "";
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function promptProbeSucceeded(probe) {
  if (!probe?.ok) return false;
  const data = probeJsonBody(probe);
  if (!data) return false;
  if (data.error) return false;
  if (data.choices?.[0]?.message) return true;
  if (Array.isArray(data.content) && data.content.length) return true;
  if (data.candidates?.[0]) return true;
  if (data.output_text) return true;
  return false;
}

function parseOpenRouterKeyInfo(probe) {
  const data = probeJsonBody(probe);
  const d = data?.data || data;
  if (!d || typeof d !== "object") return null;
  return {
    label: d.label || null,
    limit: d.limit ?? null,
    remaining: d.limit_remaining ?? null,
    usageDaily: d.usage_daily ?? null,
    rateLimit: d.rate_limit || null,
  };
}

function formatOpenRouterQuotaNote(info) {
  if (!info) return "";
  const parts = [];
  if (info.limit != null && info.remaining != null) {
    parts.push(`daily requests ${info.remaining}/${info.limit} left`);
  } else if (info.usageDaily != null) {
    parts.push(`daily usage ${info.usageDaily}`);
  }
  if (info.rateLimit?.requests) {
    parts.push(`burst ${info.rateLimit.requests} per ${info.rateLimit.interval || "window"}`);
  }
  return parts.length ? parts.join("; ") : "";
}

function openRouterPromptFailureMessage(status, body, keyInfo) {
  const quota = formatOpenRouterQuotaNote(keyInfo);
  const quotaLine = quota ? ` Your key reports: ${quota}.` : "";
  if (status === 429) {
    return `OpenRouter: key is valid but the test model is rate-limited (HTTP 429). This is often the 20 req/min burst limit, not your daily cap — failed tests count too.${quotaLine} Wait ~60s and retry, or check openrouter.ai/activity.`;
  }
  if (status === 402) {
    return `OpenRouter: insufficient credits (HTTP 402). Add credits at openrouter.ai — free models can fail when the account balance is negative.${quotaLine}`;
  }
  if (status === 503 || status === 529) {
    return `OpenRouter: free test models are overloaded (HTTP ${status}). Your key may still be fine — retry in a minute.${quotaLine}`;
  }
  return null;
}

function probeResultToTest(provider, probe) {
  if (probe.ok) return { ok: true };
  const status = probe.status || 0;
  const body = probe.body_preview || "";
  if (status === 401 || status === 403) {
    return { ok: false, error: cloudHttpError(provider.id, status, body) };
  }
  if (status >= 400) {
    return { ok: false, error: cloudHttpError(provider.id, status, body) };
  }
  const err = probe.error || "Network error";
  if (/load failed|failed to fetch|network error/i.test(err)) {
    return {
      ok: false,
      error: `${provider.name}: connection failed ("Load failed"). In the desktop app, chat now uses native HTTP — rebuild/restart MiraXcode, then retry. Also check firewall/VPN and your API key at build.nvidia.com.`,
    };
  }
  return { ok: false, error: `${provider.name}: ${err}` };
}

async function testOpenRouterConnectivity(key) {
  let lastErr = "OpenRouter: could not verify API key.";
  let keyInfo = null;
  for (const url of OPENROUTER_KEY_PROBE_URLS) {
    const probe = await httpProbeGet(url, { Authorization: `Bearer ${key}` }, 12000);
    if (probe.ok) {
      keyInfo = parseOpenRouterKeyInfo(probe);
      const quota = formatOpenRouterQuotaNote(keyInfo);
      const note = quota ? `Connected — ${quota}` : "Connected";
      if (keyInfo?.remaining === 0) {
        return {
          ok: false,
          error: `OpenRouter: daily request limit exhausted (0 remaining).${quota ? ` (${quota})` : ""} Resets per your plan at openrouter.ai/activity.`,
          keyInfo,
        };
      }
      return { ok: true, note, keyInfo };
    }
    lastErr = probeResultToTest({ id: "openrouter", name: "OpenRouter" }, probe).error || lastErr;
    if (probe.status && probe.status !== 401 && probe.status !== 403 && probe.status !== 404) break;
  }
  return { ok: false, error: lastErr };
}

async function testProviderConnectivity(provider, key) {
  if (!key) return { ok: false, error: "No API key entered" };
  if (provider.id === "openrouter") {
    return testOpenRouterConnectivity(key);
  }
  if (provider.auth === "moonshot") {
    const bases = isKimiCodeKey(key) ? KIMI_ANTHROPIC_BASES : orderedMoonshotBases(key).map(b => b.replace(/\/$/, ""));
    const path = isKimiCodeKey(key) ? "/v1/models" : "/models";
    let lastErr = "Moonshot (Kimi) request failed.";
    for (const base of bases) {
      const url = `${base}${path}`;
      const headers = isKimiCodeKey(key)
        ? { Authorization: `Bearer ${key}`, "x-api-key": key, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${key}` };
      const probe = await httpProbeGet(url, headers, 12000);
      if (probe.ok) {
        return { ok: true, note: `Connected via ${base.replace(/^https?:\/\//, "")}` };
      }
      lastErr = probeResultToTest(provider, probe).error || lastErr;
      if (probe.status && probe.status !== 401 && probe.status !== 403 && probe.status !== 404) break;
    }
    return { ok: false, error: lastErr };
  }
  if (!provider.testUrl) return { ok: false, error: "No connectivity endpoint for this provider" };
  const url = provider.auth === "query" ? `${provider.testUrl}${encodeURIComponent(key)}` : provider.testUrl;
  const headers = provider.auth === "bearer" ? { Authorization: `Bearer ${key}` } : {};
  const probe = await httpProbeGet(url, headers, 12000);
  return probeResultToTest(provider, probe);
}

async function testProviderPrompt(provider, key, opts = {}) {
  const modelId = defaultApiTestModelId(provider.id);
  if (!modelId) return { ok: false, error: "No test model configured for this provider" };

  if (provider.id === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: API_TEST_PROMPT }] }],
      generationConfig: { maxOutputTokens: 16, temperature: 0 },
    });
    const probe = await httpProbeRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      timeoutMs: 45000,
    });
    if (!promptProbeSucceeded(probe)) {
      const err = probeResultToTest(provider, probe);
      return { ok: false, error: err.error || "Gemini test prompt failed", model: modelId };
    }
    return { ok: true, model: modelId };
  }

  if (provider.id === "anthropic") {
    const body = JSON.stringify({
      model: modelId,
      max_tokens: 16,
      temperature: 0,
      messages: [{ role: "user", content: API_TEST_PROMPT }],
    });
    const probe = await httpProbeRequest("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body,
      timeoutMs: 45000,
    });
    if (!promptProbeSucceeded(probe)) {
      const err = probeResultToTest(provider, probe);
      return { ok: false, error: err.error || "Anthropic test prompt failed", model: modelId };
    }
    return { ok: true, model: modelId };
  }

  if (provider.id === "moonshot") {
    if (isKimiCodeKey(key)) {
      const body = JSON.stringify(buildKimiAnthropicBody(modelId, [{ role: "user", content: API_TEST_PROMPT }], { maxTokens: 16, temperature: 0 }));
      let lastErr = "Kimi test prompt failed.";
      for (const base of KIMI_ANTHROPIC_BASES) {
        const probe = await httpProbeRequest(`${base}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body,
          timeoutMs: 45000,
        });
        if (promptProbeSucceeded(probe)) return { ok: true, model: modelId };
        lastErr = probeResultToTest(provider, probe).error || lastErr;
        if (probe.status && probe.status !== 401 && probe.status !== 403 && probe.status !== 404) break;
      }
      return { ok: false, error: lastErr, model: modelId };
    }
    const body = JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: API_TEST_PROMPT }],
      max_tokens: 16,
      temperature: 0,
      stream: false,
    });
    let lastErr = "Moonshot test prompt failed.";
    for (const base of orderedMoonshotBases(key).map(b => b.replace(/\/$/, ""))) {
      const probe = await httpProbeRequest(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        timeoutMs: 45000,
      });
      if (promptProbeSucceeded(probe)) return { ok: true, model: modelId };
      lastErr = probeResultToTest(provider, probe).error || lastErr;
      if (probe.status && probe.status !== 401 && probe.status !== 403 && probe.status !== 404) break;
    }
    return { ok: false, error: lastErr, model: modelId };
  }

  const chatUrl = API_CHAT_COMPLETION_URLS[provider.id];
  if (!chatUrl) return { ok: false, error: "No chat endpoint for prompt test" };

  if (provider.id === "openrouter") {
    const models = [...new Set([
      modelId,
      ...OPENROUTER_TEST_MODELS,
      defaultApiTestModelId("openrouter"),
    ].filter(Boolean))];
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://miraxcode.local",
      "X-Title": "MiraXcode",
    };
    let lastErr = "OpenRouter test prompt failed on all free models.";
    let lastStatus = 0;
    for (const mid of models) {
      const body = JSON.stringify({
        model: mid,
        messages: [{ role: "user", content: API_TEST_PROMPT }],
        max_tokens: 16,
        temperature: 0,
        stream: false,
      });
      const probe = await httpProbeRequest(chatUrl, { method: "POST", headers, body, timeoutMs: 45000 });
      if (promptProbeSucceeded(probe)) return { ok: true, model: mid };
      lastStatus = probe.status || 0;
      const custom = openRouterPromptFailureMessage(lastStatus, probe.body_preview || "", opts.keyInfo);
      lastErr = custom || probeResultToTest(provider, probe).error || lastErr;
      if (lastStatus === 401 || lastStatus === 403) {
        return { ok: false, error: lastErr, model: mid };
      }
    }
    return { ok: false, error: lastErr, model: models[0], status: lastStatus };
  }

  const body = JSON.stringify({
    model: modelId,
    messages: [{ role: "user", content: API_TEST_PROMPT }],
    max_tokens: 16,
    temperature: 0,
    stream: false,
  });
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  const probe = await httpProbeRequest(chatUrl, { method: "POST", headers, body, timeoutMs: 45000 });
  if (!promptProbeSucceeded(probe)) {
    const err = probeResultToTest(provider, probe);
    return { ok: false, error: err.error || "Test prompt failed", model: modelId };
  }
  return { ok: true, model: modelId };
}

async function testProviderFull(provider) {
  const key = ($(provider.keyId)?.value || "").trim();
  if (!key) return { ok: false, error: "No API key entered" };
  const conn = await testProviderConnectivity(provider, key);
  if (!conn.ok) return { ok: false, phase: "connection", error: conn.error };
  const prompt = await testProviderPrompt(provider, key, { keyInfo: conn.keyInfo });
  if (!prompt.ok) {
    let err = prompt.error;
    if (provider.id === "openrouter") {
      const custom = openRouterPromptFailureMessage(prompt.status || 0, "", conn.keyInfo);
      if (custom) err = custom;
      else if (conn.keyInfo) {
        const quota = formatOpenRouterQuotaNote(conn.keyInfo);
        if (quota) err = `${err}\n(${quota})`;
      }
    }
    return { ok: false, phase: "prompt", error: err, model: prompt.model };
  }
  markProviderKeyValidated(provider.id, key, { model: prompt.model, note: conn.note || "" });
  return { ok: true, note: conn.note, model: prompt.model };
}

async function testProviderConnection(provider) {
  return testProviderFull(provider);
}

async function runApiKeyTest(provider, { silent = false, btn = null } = {}) {
  if (_apiTestInflight.has(provider.id)) return _apiTestInflight.get(provider.id);
  const input = $(provider.keyId);
  const row = input?.closest?.(".api-key-row");
  const key = (input?.value || "").trim();
  if (!key) {
    if (!silent) showError(new Error(`${provider.name}: No API key entered`));
    setApiKeyDotState(row, "", "No API key");
    return { ok: false, error: "No API key entered" };
  }
  setApiKeyDotState(row, "testing", "Testing connection and prompt…");
  if (btn) { btn.textContent = "…"; btn.disabled = true; }
  const p = testProviderFull(provider).finally(() => {
    _apiTestInflight.delete(provider.id);
    if (btn) { btn.disabled = false; btn.textContent = "Test"; }
  });
  _apiTestInflight.set(provider.id, p);
  const res = await p;
  if (res.ok) {
    setApiKeyDotState(row, "ok", `Validated with ${res.model || "model"} — connection + prompt OK`);
    if (!silent && HC?.providerUsage) {
      const field = input.closest(".field") || input.parentElement;
      await HC.providerUsage.syncProvider(provider.id, () => getProviderKey(provider.id));
      HC.providerUsage.renderPanel(field?.querySelector(".api-usage-panel"), provider.id);
    }
  } else {
    clearProviderKeyValidated(provider.id);
    setApiKeyDotState(row, "err", res.error || "Test failed");
    if (!silent && res.error) showError(new Error(`${provider.name}: ${res.error}`));
  }
  return res;
}

function scheduleApiKeyAutoTest(provider, delayMs = 1600) {
  clearTimeout(_apiAutoTestTimers[provider.id]);
  const input = $(provider.keyId);
  if (!input) return;
  const key = (input.value || "").trim();
  const row = input.closest(".api-key-row");
  if (!key) {
    clearProviderKeyValidated(provider.id);
    setApiKeyDotState(row, "", "No API key");
    return;
  }
  syncApiKeyDotForProvider(provider);
  if (isProviderKeyValidated(provider.id, key)) return;
  _apiAutoTestTimers[provider.id] = setTimeout(() => {
    void runApiKeyTest(provider, { silent: true });
  }, delayMs);
}

function scheduleAllApiKeyAutoTests(staggerMs = 500) {
  API_PROVIDERS.forEach((p, i) => {
    const key = ($(p.keyId)?.value || "").trim();
    if (!key || isProviderKeyValidated(p.id, key)) {
      syncApiKeyDotForProvider(p);
      return;
    }
    scheduleApiKeyAutoTest(p, 400 + i * staggerMs);
  });
}

function wireApiKeyInput(provider, input) {
  if (!input || input.dataset.apiTestWired === "1") return;
  input.dataset.apiTestWired = "1";
  const onKeyChange = () => {
    clearProviderKeyValidated(provider.id);
    syncApiKeyDotForProvider(provider);
    scheduleApiKeyAutoTest(provider, 1800);
  };
  input.addEventListener("input", onKeyChange);
  input.addEventListener("change", onKeyChange);
}

function renderApisPane() {
  for (const p of API_PROVIDERS) {
    const input = $(p.keyId);
    if (!input) continue;
    const field = input.closest(".field") || input.parentElement;
    let row = input.closest(".api-key-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "api-key-row";
      input.parentNode.insertBefore(row, input);
      row.appendChild(input);
      const actions = document.createElement("div");
      actions.className = "api-key-actions";
      const dot = document.createElement("span");
      dot.className = "api-key-dot";
      dot.title = "Key status";
      const btn = document.createElement("button");
      btn.className = "api-key-test";
      btn.type = "button";
      btn.textContent = "Test";
      btn.addEventListener("click", async () => {
        const res = await runApiKeyTest(p, { btn });
        btn.textContent = res.ok ? "OK" : "Fail";
        setTimeout(() => { btn.textContent = "Test"; }, res.ok ? 1200 : 2500);
      });
      actions.appendChild(dot);
      actions.appendChild(btn);
      row.appendChild(actions);
    }
    wireApiKeyInput(p, input);
    syncApiKeyDotForProvider(p);
    if (HC?.providerUsage && field) {
      HC.providerUsage.attachToField(field, p.id, () => getProviderKey(p.id));
    }
  }
  if (HC?.providerUsage) {
    HC.providerUsage.refreshAllPanels(getProviderKey);
    HC.providerUsage.startAutoRefresh(getProviderKey, 8000);
  }
  scheduleAllApiKeyAutoTests();
  populateCompactionModelSelect();
}

function populateCompactionModelSelect() {
  const sel = $("compactionModelSelect");
  const hint = $("compactionResolvedHint");
  const CC = window.HC?.contextCompactor;
  if (!sel || !CC) return;

  const pref = CC.getCompactionPreference?.() || "auto";
  sel.innerHTML = "";

  const autoOpt = document.createElement("option");
  autoOpt.value = "auto";
  autoOpt.textContent = "Auto — best model from your API keys";
  sel.appendChild(autoOpt);

  const free = (CC.COMPACT_CANDIDATES || []).filter(c => c.tier !== "licensed");
  const licensed = (CC.COMPACT_CANDIDATES || []).filter(c => c.tier === "licensed");
  for (const [label, list] of [["Free tier", free], ["MiniMax & GLM (your keys)", licensed]]) {
    if (!list.length) continue;
    const g = document.createElement("optgroup");
    g.label = label;
    for (const c of list) {
      const opt = document.createElement("option");
      opt.value = c.value;
      const hasKey = CC.hasProviderKey?.(c.provider);
      opt.textContent = c.label + (hasKey ? "" : " — no key");
      opt.disabled = !hasKey;
      g.appendChild(opt);
    }
    sel.appendChild(g);
  }

  const canUse = (v) =>
    v === "auto" ||
    (CC.findCandidate?.(v) && CC.isProviderAvailable?.(CC.findCandidate(v).provider));
  sel.value = canUse(pref) ? pref : "auto";
  if (!canUse(pref) && pref !== "auto") CC.setCompactionPreference?.("auto");

  if (hint) hint.textContent = CC.getResolvedCompactionLabel?.() || "";
}

$("compactionModelSelect")?.addEventListener("change", () => {
  const v = $("compactionModelSelect")?.value || "auto";
  HC?.contextCompactor?.setCompactionPreference?.(v);
  populateCompactionModelSelect();
  saveSettings();
});

window.addEventListener("hc-compaction-pref-changed", () => populateCompactionModelSelect());

// ── Memory CRUD UI ─────────────────────────────────────────────────────
// Reads/writes via memLoad / memSave / memAdd / memClear (already defined
// in the agent layer) so the agent and UI share one source of truth.
function fmtRelative(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24); if (d < 30)  return d + "d ago";
  return new Date(ts).toLocaleDateString();
}
function renderMemoryPane() {
  const projectOnly = currentProject()?.memoryMode === "project";
  const all = (typeof memLoad === "function" ? memLoad() : [])
    .filter(f => {
      const pid = f.projectId || DEFAULT_PROJECT_ID;
      return projectOnly ? pid === state.currentProjectId : (pid === DEFAULT_PROJECT_ID || pid === state.currentProjectId);
    })
    .slice().sort((a, b) => b.ts - a.ts);
  const q = ($("memSearchInput")?.value || "").trim().toLowerCase();
  const filtered = q
    ? all.filter(f => (f.key + " " + f.value).toLowerCase().includes(q))
    : all;
  const countEl = $("memCountBadge");
  if (countEl) countEl.textContent = `${all.length} fact${all.length === 1 ? "" : "s"}` + (q ? ` · ${filtered.length} match${filtered.length === 1 ? "" : "es"}` : "");
  const list = $("memList");
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = `<div class="mem-empty">${
      all.length === 0
        ? "No memories yet. The agent will save preferences and details automatically as you chat — or use <b>+ Add</b> to enter one manually."
        : "No facts match your search."
    }</div>`;
    return;
  }
  list.innerHTML = filtered.map(f => `
    <div class="mem-row" data-id="${escapeHtml(f.id)}">
      <div class="mem-key" title="${escapeHtml(f.key)}">${escapeHtml(f.key)}</div>
      <div class="mem-val" data-role="val" title="Click to edit">${escapeHtml(f.value)}</div>
      <div class="mem-actions">
        <button class="mem-edit" title="Edit value" aria-label="Edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
        <button class="mem-del"  title="Delete" aria-label="Delete"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
      </div>
      <div class="mem-time">${fmtRelative(f.ts)}</div>
    </div>
  `).join("");
  // Wire row actions
  list.querySelectorAll(".mem-row").forEach(row => {
    const id = row.dataset.id;
    const valEl = row.querySelector('[data-role="val"]');
    const startEdit = () => {
      valEl.contentEditable = "true";
      valEl.focus();
      // Place caret at end
      const r = document.createRange(); r.selectNodeContents(valEl); r.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    };
    const commitEdit = () => {
      valEl.contentEditable = "false";
      const newVal = valEl.textContent.trim();
      const arr = memLoad();
      const i = arr.findIndex(x => x.id === id);
      if (i >= 0 && newVal && newVal !== arr[i].value) {
        arr[i].value = newVal.slice(0, 1200);
        arr[i].ts = Date.now();
        memSave(arr);
        renderMemoryPane();
      } else if (i >= 0 && !newVal) {
        // Empty value = delete
        arr.splice(i, 1); memSave(arr); renderMemoryPane();
      }
    };
    row.querySelector(".mem-edit").addEventListener("click", startEdit);
    valEl.addEventListener("dblclick", startEdit);
    valEl.addEventListener("blur", commitEdit);
    valEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); valEl.blur(); }
      if (e.key === "Escape") { e.preventDefault(); valEl.textContent = arr_value_for(id); valEl.blur(); }
    });
    row.querySelector(".mem-del").addEventListener("click", async () => {
      const arr = memLoad();
      const i = arr.findIndex(x => x.id === id);
      if (i < 0) return;
      const ok = await themedConfirm(`Delete fact "${arr[i].key}"?`, "Memory");
      if (!ok) return;
      arr.splice(i, 1); memSave(arr); renderMemoryPane();
    });
  });
}
function arr_value_for(id) {
  const f = memLoad().find(x => x.id === id);
  return f ? f.value : "";
}
// Search (live filter)
$("memSearchInput")?.addEventListener("input", () => renderMemoryPane());
// + Add
$("memAddBtn")?.addEventListener("click", async () => {
  const key = await themedPrompt("Fact key (short label, e.g. favorite_animal):", "", "Memory");
  if (!key) return;
  const value = await themedPrompt(`Value for "${key.trim()}":`, "", "Memory");
  if (!value) return;
  memAdd(key, value);
  renderMemoryPane();
});
// Export
$("memExportBtn")?.addEventListener("click", () => {
  const data = JSON.stringify(memLoad(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dt = new Date().toISOString().slice(0, 10);
  a.href = url; a.download = `hashui-memory-${dt}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
// Import
$("memImportBtn")?.addEventListener("click", () => $("memImportFile").click());
$("memImportFile")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error("Not an array");
    const mode = await themedConfirm(
      `Import ${incoming.length} fact(s)?\n\nOK = MERGE (keep current, add new, overwrite same keys)\nCancel = abort.\nTo REPLACE everything, click Clear all first then import.`,
      "Import memory"
    );
    if (!mode) { e.target.value = ""; return; }
    const cur = memLoad();
    const byKey = new Map(cur.map(f => [f.key.toLowerCase(), f]));
    for (const f of incoming) {
      if (!f || !f.key || !f.value) continue;
      byKey.set(String(f.key).toLowerCase(), {
        id: f.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        key: String(f.key).slice(0, 120),
        value: String(f.value).slice(0, 1200),
        ts: f.ts || Date.now(),
        projectId: f.projectId || DEFAULT_PROJECT_ID,
        scope: f.scope || "personal",
        confidence: Number.isFinite(f.confidence) ? f.confidence : 1,
        approved: f.approved !== false,
        source: f.source || "import"
      });
    }
    memSave([...byKey.values()]);
    renderMemoryPane();
  } catch (err) {
    themedAlert("Import failed: " + (err?.message || err), "Memory");
  } finally {
    e.target.value = "";
  }
});
// ── Memory map (radial diagram) ─────────────────────────────────────
// Center node = "You". Categories derived from key prefix (text before
// the first underscore) or from key itself when no underscore. Facts
// sit on the outer ring under their category. Click anything to see
// the full value in the bottom strip.
function memCategoryOf(key) {
  const k = String(key || "").toLowerCase();
  const i = k.indexOf("_");
  if (i > 0) return k.slice(0, i);
  // Common single-token keys → group by theme
  if (/^(name|age|birthday|location|origin|languages|allergies)$/.test(k)) return "identity";
  if (/^(likes|dislikes|preferred|favorite|favourite)$/.test(k)) return "preferences";
  if (/^(employer|role|job|career)$/.test(k)) return "work";
  if (/^note_/.test(k)) return "notes";
  return "other";
}
// ── Map state — persisted positions + view (pan/zoom) ───────────────────
const MEM_MAP_POS_KEY = "hashui_memmap_pos_v1";
const MEM_MAP_VIEW_KEY = "hashui_memmap_view_v1";
function memMapLoadPos() { try { return JSON.parse(localStorage.getItem(MEM_MAP_POS_KEY) || "{}"); } catch { return {}; } }
function memMapSavePos(p) { try { localStorage.setItem(MEM_MAP_POS_KEY, JSON.stringify(p)); } catch {} }
function memMapLoadView() { try { return JSON.parse(localStorage.getItem(MEM_MAP_VIEW_KEY) || "null"); } catch { return null; } }
function memMapSaveView(v) { try { localStorage.setItem(MEM_MAP_VIEW_KEY, JSON.stringify(v)); } catch {} }

// Convert a pointer event into SVG-userspace coords.
function mmSvgPoint(svg, ev) {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const ctm = svg.getScreenCTM();
  return ctm ? pt.matrixTransform(ctm.inverse()) : { x: ev.clientX, y: ev.clientY };
}

let _mmState = null;

function renderMemoryMap() {
  const svg   = document.getElementById("memMapSvg");
  const world = document.getElementById("mmWorld");
  const grid  = document.getElementById("mmGridBg");
  const detail = document.getElementById("memMapDetail");
  if (!svg || !world) return;

  const projectOnly = currentProject()?.memoryMode === "project";
  const facts = (typeof memLoad === "function" ? memLoad() : [])
    .filter(f => {
      const pid = f.projectId || DEFAULT_PROJECT_ID;
      return projectOnly ? pid === state.currentProjectId : (pid === DEFAULT_PROJECT_ID || pid === state.currentProjectId);
    })
    .slice();
  if (!facts.length) {
    world.removeAttribute("transform");
    if (grid) grid.removeAttribute("transform");
    _mmState = null;
    world.innerHTML = `<text x="600" y="400" text-anchor="middle" style="fill:var(--text-dim);font-size:14px;font-family:ui-sans-serif,system-ui,sans-serif">No memories yet — chat with the agent to populate the map.</text>`;
    detail.innerHTML = `<span style="color:var(--text-dim)">Empty memory.</span>`;
    return;
  }
  // Group by category
  const cats = new Map();
  for (const f of facts) {
    const c = memCategoryOf(f.key);
    if (!cats.has(c)) cats.set(c, []);
    cats.get(c).push(f);
  }
  const catList = [...cats.entries()].sort((a, b) => b[1].length - a[1].length);

  // ---- Compute default layout (radial), then override with saved drags ----
  const cx0 = 600, cy0 = 400;
  const innerR = 180, outerR = 330;
  const savedPos = memMapLoadPos();
  const nodes = []; // {id, type, x, y, w, h, label, sub, fact?, parent?}

  nodes.push({ id: "_center", type: "center", x: cx0, y: cy0, w: 110, h: 110, label: "YOU", sub: `${facts.length} fact${facts.length === 1 ? "" : "s"}` });

  catList.forEach(([cat, items], ci) => {
    const angle = (ci / catList.length) * Math.PI * 2 - Math.PI / 2;
    const dx = cx0 + Math.cos(angle) * innerR;
    const dy = cy0 + Math.sin(angle) * innerR;
    const lbl = cat.toUpperCase();
    const w = Math.max(96, lbl.length * 8 + 36);
    nodes.push({ id: "cat:" + cat, type: "cat", x: dx, y: dy, w, h: 32, label: lbl, count: items.length, parent: "_center" });
    // Spread facts on an arc around the category
    const arcSpan = Math.min((Math.PI * 2) / catList.length * 0.95, 1.3);
    items.forEach((f, fi) => {
      const t = items.length === 1 ? 0 : (fi / (items.length - 1)) - 0.5;
      const fa = angle + t * arcSpan;
      const fx = cx0 + Math.cos(fa) * outerR;
      const fy = cy0 + Math.sin(fa) * outerR;
      const keyLabel = f.key.length > 18 ? f.key.slice(0, 17) + "…" : f.key;
      const valLabel = (f.value || "").length > 22 ? f.value.slice(0, 21) + "…" : (f.value || "");
      const w = Math.max(116, Math.min(170, Math.max(keyLabel.length, valLabel.length) * 5.6 + 24));
      nodes.push({ id: "fact:" + f.id, type: "fact", x: fx, y: fy, w, h: 40, label: keyLabel, sub: valLabel, fact: f, parent: "cat:" + cat });
    });
  });
  // Apply saved overrides
  nodes.forEach(n => {
    const p = savedPos[n.id];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { n.x = p.x; n.y = p.y; }
  });

  // ---- Render edges first (they sit beneath nodes) ----
  const edges = [];
  nodes.forEach(n => {
    if (!n.parent) return;
    const p = nodes.find(x => x.id === n.parent);
    if (!p) return;
    edges.push({ from: p, to: n, kind: n.type === "cat" ? "cat" : "fact" });
  });

  const svgEdges = edges.map((e, i) =>
    `<line class="mm-link ${e.kind === "cat" ? "cat" : ""}" data-edge="${i}" x1="${e.from.x.toFixed(1)}" y1="${e.from.y.toFixed(1)}" x2="${e.to.x.toFixed(1)}" y2="${e.to.y.toFixed(1)}"/>`
  ).join("");

  const svgNodes = nodes.map(n => {
    if (n.type === "center") {
      return `<g class="mm-node" data-id="${n.id}" data-type="center" transform="translate(${n.x} ${n.y})">
        <circle class="mm-center-halo" r="74"/>
        <circle class="mm-center-core" r="48"/>
        <text class="mm-center-text" y="-4">${escapeHtml(n.label)}</text>
        <text class="mm-center-sub"  y="13">${escapeHtml(n.sub)}</text>
      </g>`;
    }
    if (n.type === "cat") {
      return `<g class="mm-node" data-id="${escapeHtml(n.id)}" data-type="cat" transform="translate(${n.x} ${n.y})">
        <rect class="mm-cat-bg" x="${-n.w/2}" y="${-n.h/2}" width="${n.w}" height="${n.h}" rx="${n.h/2}"/>
        <text class="mm-cat-text" y="-1">${escapeHtml(n.label)}</text>
        <text class="mm-cat-count" x="${n.w/2 - 14}" y="0">·${n.count}</text>
      </g>`;
    }
    // fact
    return `<g class="mm-node" data-id="${escapeHtml(n.id)}" data-type="fact" transform="translate(${n.x} ${n.y})">
      <rect class="mm-fact-bg" x="${-n.w/2}" y="${-n.h/2}" width="${n.w}" height="${n.h}" rx="10"/>
      <text class="mm-fact-key" y="-7">${escapeHtml(n.label)}</text>
      <text class="mm-fact-val" y="9">${escapeHtml(n.sub)}</text>
    </g>`;
  }).join("");

  world.innerHTML = svgEdges + svgNodes;

  // ---- View transform (pan/zoom) ----
  const savedView = memMapLoadView() || { tx: 0, ty: 0, k: 1 };
  const view = {
    tx: Number.isFinite(savedView.tx) ? savedView.tx : 0,
    ty: Number.isFinite(savedView.ty) ? savedView.ty : 0,
    k: Number.isFinite(savedView.k) ? Math.max(0.25, Math.min(3.5, savedView.k)) : 1
  };
  function applyView() {
    world.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.k})`);
    if (grid) grid.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.k})`);
  }
  applyView();

  // ---- Stash state for handlers (zoom buttons read this) ----
  function fitView(persist = true) {
    if (!nodes.length) return;
    const pad = 120;
    const bounds = nodes.reduce((acc, n) => ({
      minX: Math.min(acc.minX, n.x - n.w / 2),
      minY: Math.min(acc.minY, n.y - n.h / 2),
      maxX: Math.max(acc.maxX, n.x + n.w / 2),
      maxY: Math.max(acc.maxY, n.y + n.h / 2)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const vb = svg.viewBox.baseVal;
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    const k = Math.max(0.45, Math.min(1.6, Math.min((vb.width - pad * 2) / bw, (vb.height - pad * 2) / bh)));
    view.k = k;
    view.tx = vb.x + vb.width / 2 - ((bounds.minX + bounds.maxX) / 2) * k;
    view.ty = vb.y + vb.height / 2 - ((bounds.minY + bounds.maxY) / 2) * k;
    applyView();
    if (persist) memMapSaveView(view);
  }

  _mmState = { svg, world, view, applyView, fitView, nodes, edges, savedPos };

  // ---- Drag a single node ----
  function attachDrag(g) {
    const id = g.getAttribute("data-id");
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    let dragStart = null;
    g.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      g.setPointerCapture(e.pointerId);
      g.classList.add("dragging");
      const pt = mmSvgPoint(svg, e);
      // Convert to world coords
      const wx = (pt.x - view.tx) / view.k;
      const wy = (pt.y - view.ty) / view.k;
      dragStart = { wx, wy, nx: node.x, ny: node.y, moved: false };
    });
    g.addEventListener("pointermove", (e) => {
      if (!dragStart) return;
      const pt = mmSvgPoint(svg, e);
      const wx = (pt.x - view.tx) / view.k;
      const wy = (pt.y - view.ty) / view.k;
      const dx = wx - dragStart.wx;
      const dy = wy - dragStart.wy;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragStart.moved = true;
      node.x = dragStart.nx + dx;
      node.y = dragStart.ny + dy;
      g.setAttribute("transform", `translate(${node.x} ${node.y})`);
      // Update incident edges
      edges.forEach((edge, i) => {
        if (edge.from.id === id || edge.to.id === id) {
          const line = world.querySelector(`line[data-edge="${i}"]`);
          if (!line) return;
          line.setAttribute("x1", edge.from.x.toFixed(1));
          line.setAttribute("y1", edge.from.y.toFixed(1));
          line.setAttribute("x2", edge.to.x.toFixed(1));
          line.setAttribute("y2", edge.to.y.toFixed(1));
        }
      });
    });
    const finish = (e) => {
      if (!dragStart) return;
      g.classList.remove("dragging");
      try { g.releasePointerCapture(e.pointerId); } catch {}
      if (dragStart.moved) {
        savedPos[id] = { x: node.x, y: node.y };
        memMapSavePos(savedPos);
      } else {
        // It was a click — show details
        if (node.type === "fact" && node.fact) {
          world.querySelectorAll(".mm-node").forEach(n => n.classList.remove("active"));
          g.classList.add("active");
          detail.innerHTML = `<span style="color:var(--gold-deep);font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${escapeHtml(node.fact.key)}</span> &nbsp;<span style="color:var(--muted);font-size:10.5px">${fmtRelative(node.fact.ts)}</span><div style="margin-top:4px;color:var(--text)">${escapeHtml(node.fact.value)}</div><div style="margin-top:6px;font-size:10.5px;color:var(--muted)">Double-click the node to edit · drag to reposition</div>`;
        } else if (node.type === "cat") {
          detail.innerHTML = `<span style="color:var(--gold-deep)">Category:</span> ${escapeHtml(node.label)} <span style="color:var(--muted)">— ${node.count} fact(s). Drag to rearrange the cluster.</span>`;
        } else if (node.type === "center") {
          detail.innerHTML = `<span style="color:var(--gold)">YOU</span> — drag categories around to organize, double-click facts to edit.`;
        }
      }
      dragStart = null;
    };
    g.addEventListener("pointerup", finish);
    g.addEventListener("pointercancel", finish);

    // Edit on double-click (facts only)
    g.addEventListener("dblclick", async (e) => {
      if (node.type !== "fact" || !node.fact) return;
      e.stopPropagation();
      const next = await themedPrompt(`Edit "${node.fact.key}":`, node.fact.value, "Memory");
      if (next == null) return;
      const arr = memLoad();
      const i = arr.findIndex(x => x.id === node.fact.id);
      if (i < 0) return;
      if (!next.trim()) { arr.splice(i, 1); }
      else { arr[i].value = next.trim().slice(0, 1200); arr[i].ts = Date.now(); }
      memSave(arr);
      renderMemoryMap();
    });
  }
  world.querySelectorAll(".mm-node").forEach(attachDrag);

  // ---- Pan on background drag ----
  let panStart = null;
  svg.onpointerdown = (e) => {
    if (e.target.closest(".mm-node")) return; // node drag handled by attachDrag
    if (e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("panning");
    panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  };
  svg.onpointermove = (e) => {
    if (!panStart) return;
    const ctm = svg.getScreenCTM();
    const scaleX = ctm ? 1 / ctm.a : 1;
    const scaleY = ctm ? 1 / ctm.d : 1;
    view.tx = panStart.tx + (e.clientX - panStart.x) * scaleX;
    view.ty = panStart.ty + (e.clientY - panStart.y) * scaleY;
    applyView();
  };
  const endPan = (e) => {
    if (!panStart) return;
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    svg.classList.remove("panning");
    panStart = null;
    memMapSaveView(view);
  };
  svg.onpointerup = endPan;
  svg.onpointercancel = endPan;

  // ---- Zoom on wheel (around cursor) ----
  svg.onwheel = (e) => {
    e.preventDefault();
    const pt = mmSvgPoint(svg, e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newK = Math.max(0.25, Math.min(3.5, view.k * factor));
    // Keep cursor anchored: world coord under cursor stays put
    const wx = (pt.x - view.tx) / view.k;
    const wy = (pt.y - view.ty) / view.k;
    view.tx = pt.x - wx * newK;
    view.ty = pt.y - wy * newK;
    view.k = newK;
    applyView();
    memMapSaveView(view);
  };
}

// Zoom buttons + reset positions
function memMapZoom(factor) {
  if (!_mmState) return;
  const { svg, view, applyView } = _mmState;
  const rect = svg.getBoundingClientRect();
  const fakeEv = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  const pt = mmSvgPoint(svg, fakeEv);
  const newK = Math.max(0.25, Math.min(3.5, view.k * factor));
  const wx = (pt.x - view.tx) / view.k;
  const wy = (pt.y - view.ty) / view.k;
  view.tx = pt.x - wx * newK;
  view.ty = pt.y - wy * newK;
  view.k = newK;
  applyView();
  memMapSaveView(view);
}
$("memMapBtn")?.addEventListener("click", () => {
  const ov = $("memMapOverlay");
  if (!ov) return;
  ov.classList.add("open");
  renderMemoryMap();
});
$("memMapClose")?.addEventListener("click", () => $("memMapOverlay")?.classList.remove("open"));
$("memMapOverlay")?.addEventListener("click", (e) => { if (e.target.id === "memMapOverlay") e.currentTarget.classList.remove("open"); });
$("memMapZoomIn")?.addEventListener("click",  () => memMapZoom(1.2));
$("memMapZoomOut")?.addEventListener("click", () => memMapZoom(1 / 1.2));
$("memMapFit")?.addEventListener("click", () => {
  if (!_mmState) return;
  _mmState.fitView();
});
$("memMapReset")?.addEventListener("click", async () => {
  const ok = await themedConfirm("Reset all node positions back to the default radial layout?", "Memory map");
  if (!ok) return;
  try { localStorage.removeItem(MEM_MAP_POS_KEY); } catch {}
  renderMemoryMap();
});

// Clear all
$("memClearBtn")?.addEventListener("click", async () => {
  const n = memLoad().length;
  if (!n) return;
  const ok = await themedConfirm(`Permanently delete all ${n} memories?\n\nThis can't be undone (export first if you want a backup).`, "Memory");
  if (!ok) return;
  memClear();
  renderMemoryPane();
});

// Memory depth — declared here so applyMemoryDepth() can assign it before buildOllamaMessages
// Memory depth — declared here so applyMemoryDepth() can assign it before buildOllamaMessages.
// parseInt with radix 10; guard against NaN (corrupted localStorage → use default 20).
let HISTORY_LIMIT = (v => (Number.isFinite(v) && v >= 0 ? v : 20))(
  parseInt(localStorage.getItem('hashHistoryLimit') ?? '20', 10)
);

// Memory depth — sidebar + settings sliders stay in sync
const historyDepthEl     = $("historyDepth"),     historyValEl     = $("historyVal");
const historyDepthSideEl = $("historyDepthSide"), historyValSideEl = $("historyValSide");

function applyMemoryDepth(val, source) {
  // Clamp: integer 0–40, NaN → 20
  val = Number.isFinite(val) && val >= 0 ? Math.min(40, Math.floor(val)) : 20;
  HISTORY_LIMIT = val;
  const label = val === 0 ? 'Off' : String(val);
  const pct   = (val / 40 * 100).toFixed(1) + '%';
  historyValEl.textContent      = label;
  historyValSideEl.textContent  = label;
  if (source !== 'settings') { historyDepthEl.value = val; }
  historyDepthEl.style.setProperty('--val', pct);       // settings slider uses --val
  if (source !== 'side')     { historyDepthSideEl.value = val; }
  historyDepthSideEl.style.setProperty('--fill', pct);  // sidebar slider uses --fill
  try { localStorage.setItem('hashHistoryLimit', String(val)); } catch {}
  updateContextIndicator();
}

// Initialize sliders from the already-parsed HISTORY_LIMIT (no second localStorage read)
applyMemoryDepth(HISTORY_LIMIT, 'init');

historyDepthEl.addEventListener("input", () =>
  applyMemoryDepth(parseInt(historyDepthEl.value, 10), 'settings'));

historyDepthSideEl.addEventListener("input", () =>
  applyMemoryDepth(parseInt(historyDepthSideEl.value, 10), 'side'));

// Scroll pinning
let pinned = true;
msgs.addEventListener("scroll", () => {
  const dist = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
  pinned = dist < 80;
});

function loadTemplates() {
  try {
    const raw = localStorage.getItem("hashui_templates");
    const parsed = raw ? JSON.parse(raw) : [];
    state.templates = Array.isArray(parsed) ? parsed.filter(t => t && typeof t === "object") : [];
  } catch { state.templates = []; }
  if (!state.templates.length) {
    state.templates = [
      { id: uid(), name: "Translate", body: "Translate this to {{language}}:\n\n{{text}}" },
      { id: uid(), name: "Summarize File", body: "Summarize the attached content for {{audience}}. Focus on {{focus}}." },
    ];
    saveTemplates();
  }
  state.activeTemplateId = state.templates[0]?.id || null;
}

function saveTemplates() {
  try { localStorage.setItem("hashui_templates", JSON.stringify(state.templates)); } catch {}
}

function templateVars(body) {
  return [...new Set((String(body || "").match(/{{\s*[\w.-]+\s*}}/g) || []).map(v => v.replace(/[{}]/g, "").trim()).filter(Boolean))];
}

function activeTemplate() {
  return state.templates.find(t => t.id === state.activeTemplateId) || state.templates[0] || null;
}

function renderTemplates() {
  if (!templateListEl) return;
  templateListEl.innerHTML = "";
  state.templates.forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "template-item" + (t.id === state.activeTemplateId ? " active" : "");
    const vars = templateVars(t.body);
    b.innerHTML = `<div class="template-title">${escapeHtml(t.name || "Untitled")}</div><div class="template-vars">${vars.length ? vars.map(v => "{{" + escapeHtml(v) + "}}").join(" ") : "no variables"}</div>`;
    b.addEventListener("click", () => {
      state.activeTemplateId = t.id;
      templateNameEl.value = t.name || "";
      templateBodyEl.value = t.body || "";
      renderTemplates();
    });
    templateListEl.appendChild(b);
  });
  const t = activeTemplate();
  if (t && !templateNameEl.value && !templateBodyEl.value) {
    templateNameEl.value = t.name || "";
    templateBodyEl.value = t.body || "";
  }
}

function openTemplates() {
  loadTemplates();
  renderTemplates();
  templateOverlay.classList.add("open");
  templateNameEl.focus();
}

function closeTemplates() {
  templateOverlay.classList.remove("open");
}

async function fillTemplate(t) {
  if (!t) return "";
  let body = t.body || "";
  for (const key of templateVars(body)) {
    const val = await themedPrompt(key, "", "Template");
    if (val === null) return "";
    body = body.replace(new RegExp(`{{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*}}`, "g"), val);
  }
  return body;
}

function insertAtComposer(text, replace = false) {
  if (!text) return;
  if (replace) input.value = text;
  else input.value = input.value ? `${input.value.trimEnd()}\n\n${text}` : text;
  input.dispatchEvent(new Event("input"));
  input.focus();
}

loadTemplates();
$("templateClose").addEventListener("click", closeTemplates);
templateOverlay.addEventListener("click", (e) => { if (e.target === templateOverlay) closeTemplates(); });
$("templateNew").addEventListener("click", () => {
  const t = { id: uid(), name: "New Template", body: "" };
  state.templates.unshift(t);
  state.activeTemplateId = t.id;
  templateNameEl.value = t.name;
  templateBodyEl.value = "";
  saveTemplates();
  renderTemplates();
  templateBodyEl.focus();
});
$("templateSave").addEventListener("click", () => {
  let t = activeTemplate();
  if (!t) {
    t = { id: uid(), name: "", body: "" };
    state.templates.unshift(t);
    state.activeTemplateId = t.id;
  }
  t.name = templateNameEl.value.trim() || "Untitled";
  t.body = templateBodyEl.value;
  saveTemplates();
  renderTemplates();
});
$("templateDelete").addEventListener("click", () => {
  const t = activeTemplate();
  if (!t) return;
  state.templates = state.templates.filter(x => x.id !== t.id);
  state.activeTemplateId = state.templates[0]?.id || null;
  saveTemplates();
  templateNameEl.value = activeTemplate()?.name || "";
  templateBodyEl.value = activeTemplate()?.body || "";
  renderTemplates();
});
$("templateUse").addEventListener("click", async () => {
  const t = activeTemplate();
  const text = await fillTemplate(t);
  if (text) {
    insertAtComposer(text);
    closeTemplates();
  }
});

const slashCommands = [
  { name: "/model", desc: "Focus the model picker", run: () => modelEl.focus() },
  { name: "/compare", desc: "Open side-by-side model comparison", run: () => setTab("split") },
  { name: "/clear", desc: "Start a new chat", run: () => newChat() },
  { name: "/system", desc: "Open system prompt settings", run: () => { openSettings(); systemEl.focus(); } },
  { name: "/export", desc: "Export conversation as Markdown", run: () => exportConversation("markdown") },
  { name: "/json", desc: "Export conversation as JSON", run: () => exportConversation("json") },
  { name: "/pdf", desc: "Export conversation as PDF", run: () => exportConversation("pdf") },
  { name: "/temp", desc: "Set temperature, e.g. /temp 0.3", run: (arg) => { const v = parseFloat(arg); if (Number.isFinite(v)) { tempEl.value = Math.max(0, Math.min(2, v)); tempVal.textContent = tempEl.value; updateRangeFill(); saveSettings(); } else tempEl.focus(); } },
  { name: "/privacy", desc: "Toggle local-only privacy mode", run: () => { privacyLocalEl.checked = !privacyLocalEl.checked; privacyLocalEl.dispatchEvent(new Event("change")); } },
  { name: "/inject", desc: "Toggle RAG and web context injection", run: () => { injectionEnabled = !injectionEnabled; applyInjectionState(); } },
  { name: "/templates", desc: "Open prompt template library", run: openTemplates },
  { name: "/template", desc: "Use a saved prompt template", run: async () => { const t = activeTemplate(); const text = await fillTemplate(t); if (text) insertAtComposer(text, true); } },
];

function currentSlashQuery() {
  const val = input.value;
  if (!val.startsWith("/")) return null;
  return val.slice(1).trim().toLowerCase();
}

function filteredSlashCommands() {
  const q = currentSlashQuery();
  if (q == null) return [];
  const cmdPart = q.split(/\s+/)[0] || "";
  return slashCommands.filter(c => c.name.slice(1).includes(cmdPart)).slice(0, 8);
}

function closeSlashPalette() {
  state.slashOpen = false;
  slashPalette.classList.remove("open");
  slashPalette.setAttribute("aria-hidden", "true");
}

function renderSlashPalette() {
  const items = filteredSlashCommands();
  if (!items.length) { closeSlashPalette(); return; }
  state.slashOpen = true;
  state.slashIndex = Math.max(0, Math.min(state.slashIndex, items.length - 1));
  slashPalette.innerHTML = items.map((c, i) => `
    <button type="button" class="slash-item${i === state.slashIndex ? " active" : ""}" data-slash="${escapeHtml(c.name)}">
      <span class="slash-name">${escapeHtml(c.name)}</span>
      <span class="slash-desc">${escapeHtml(c.desc)}</span>
    </button>`).join("");
  const rect = input.getBoundingClientRect();
  slashPalette.style.left = `${Math.max(12, rect.left)}px`;
  slashPalette.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
  slashPalette.classList.add("open");
  slashPalette.setAttribute("aria-hidden", "false");
}

function runSlashCommand(commandName = null) {
  const items = filteredSlashCommands();
  const cmd = commandName ? slashCommands.find(c => c.name === commandName) : items[state.slashIndex];
  if (!cmd) return false;
  const raw = input.value.trim();
  const arg = raw.replace(/^\/\S+\s*/, "");
  input.value = "";
  closeSlashPalette();
  Promise.resolve(cmd.run(arg)).catch(err => {
    console.warn("[slash] command failed:", err);
    themedAlert(err?.message || String(err), "Command");
  });
  input.dispatchEvent(new Event("input"));
  return true;
}

slashPalette.addEventListener("click", (e) => {
  const b = e.target.closest("[data-slash]");
  if (!b) return;
  runSlashCommand(b.dataset.slash);
});

// Textarea auto-grow
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 240) + "px";
  if (state.editing && editPreview) {
    const compact = input.value.replace(/\s+/g, " ").trim();
    editPreview.textContent = compact ? compact.slice(0, 180) : "(empty message)";
  }
  updateContextIndicator();
  if (currentSlashQuery() != null) renderSlashPalette();
  else closeSlashPalette();
});
input.addEventListener("keydown", (e) => {
  if (state.slashOpen) {
    const items = filteredSlashCommands();
    if (e.key === "ArrowDown") { e.preventDefault(); state.slashIndex = (state.slashIndex + 1) % Math.max(1, items.length); renderSlashPalette(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); state.slashIndex = (state.slashIndex - 1 + Math.max(1, items.length)) % Math.max(1, items.length); renderSlashPalette(); return; }
    if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); runSlashCommand(); return; }
    if (e.key === "Escape") { e.preventDefault(); closeSlashPalette(); return; }
  }
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});
sendBtn.addEventListener("click", () => state.streaming ? abort() : send());
$("newChatBtn")?.addEventListener("click", () => newChat());
$("agentsNewChatBtn")?.addEventListener("click", () => newChat());

// ── Preview button — show full payload that would be sent to the model ──
const previewModal = $("previewModal");
const previewBody  = $("previewBody");
const previewMeta  = $("previewMeta");
$("previewClose").addEventListener("click", () => previewModal.classList.remove("open"));
previewModal.addEventListener("click", (e) => { if (e.target === previewModal) previewModal.classList.remove("open"); });

let _previewPayload = null; // last built payload — for copy-JSON

$("previewBtn").addEventListener("click", async () => {
  previewBody.innerHTML = `<div class="preview-loading">Building payload… fetching live context</div>`;
  previewMeta.textContent = "";
  _previewPayload = null;
  previewModal.classList.add("open");

  const text = input.value.trim();
  let toolContext = null;
  const activeAgent = getActiveAgent();
  const route = currentRoute(text, !!(state.pendingImages?.length || state.pendingFiles?.length));
  const routeDef = route?.route ? ROUTE_DEFS[route.route] : null;
  const routeSearchMode = routeDef?.useSearch === true || routeDef?.useSearch === "pubmed";

  try {
    if (activeAgent && activeAgent.tools?.length && routeSearchMode) {
      let searchQuery = null;
      if (rewriterEl?.value) searchQuery = await rewriteForSearch(text);
      toolContext = await runAgentTools(activeAgent, text, searchQuery);
    } else if (route?.route) {
      const def = routeDef;
      if (def?.useSearch === true) {
        const tav = await tavilySearch(text);
        if (tav && (tav.results.length || tav.answer)) {
          const parts = [];
          if (tav.answer) parts.push(tav.answer);
          if (tav.results.length) parts.push(tav.results.map((r,i)=>`${i+1}. ${r.title}: ${r.snippet}`).join("\n"));
          toolContext = `Sources:\n${parts.join("\n\n")}`;
        } else {
          const goog = await googleSearch(text);
          if (goog && goog.length) {
            toolContext = `Sources:\n` + goog.map((r,i)=>`${i+1}. ${r.title}: ${r.snippet}`).join("\n");
          }
        }
      }
    }
  } catch(e) { console.warn("Preview tool fetch failed:", e); }

  // SECURITY: never expose personal knowledge base in preview for cloud/external models
  const _previewIsExternal = modelEl.value.startsWith("cloud:") ||
    !!(route?.route && ROUTE_DEFS[route.route]?.backend === "nvidia");
  const ragChunks = _previewIsExternal ? [] : await queryRAGMerged(text);
  if (ragChunks.length) {
    const ragBlock = `Background:\n` + ragChunks.map((c,i)=>`${i+1}. ${c.title}: ${c.text}`).join("\n\n");
    toolContext = toolContext ? `${toolContext}\n\n${ragBlock}` : ragBlock;
  }

  // Build messages exactly as send() would: pending input must exist before
  // tool/RAG context is injected so context attaches to the current turn.
  const messages = buildOllamaMessages();
  const pendingContent = currentPendingModelContent();
  if (pendingContent || state.pendingImages.length) {
    const pendingEntry = {
      role: "user",
      content: pendingContent || "Describe what you see in this image.",
      _pending: true,
    };
    if (state.pendingImages.length) pendingEntry.images = state.pendingImages.map(i => i.base64);
    messages.push(pendingEntry);
  }
  if (toolContext) {
    const last = messages[messages.length - 1];
    if (last?.role === "user") last.content = `${toolContext}\n\nQuestion: ${last.content}`;
    else messages.splice(messages.length - 1, 0, { role: "system", content: toolContext });
  }

  _previewPayload = messages;

  // ── Stats ──
  const totalChars  = JSON.stringify(messages.map(m => ({ role: m.role, content: m.content }))).length;
  const estTokens   = Math.round(totalChars / 3.8);
  const historyMsgs = messages.filter(m => m.role !== "system" && !m._pending).length;
  const sysMsgs     = messages.filter(m => m.role === "system").length;
  const hasPreviewAttachments = messages.some(m => /\[ATTACHED FILES - use this content when answering\]/.test(m.content || ""));
  const numCtx      = hasPreviewAttachments ? 16384 : (HISTORY_LIMIT > 0 ? 8192 : 4096);

  previewMeta.textContent =
    `${messages.length} msg${messages.length !== 1 ? "s" : ""} · ~${estTokens.toLocaleString()} tokens`;

  // ── Render ──
  let turnCounter = 0;
  const parts = [];

  // Stats bar at top
  parts.push(`<div class="preview-stats">
    <span>Memory: <b>${HISTORY_LIMIT === 0 ? 'Off' : HISTORY_LIMIT + ' turns'}</b></span>
    <span>History: <b>${historyMsgs} msg${historyMsgs !== 1 ? 's' : ''}</b></span>
    <span>System: <b>${sysMsgs}</b></span>
    <span>~Tokens: <b>${estTokens.toLocaleString()}</b></span>
    <span>num_ctx: <b>${numCtx.toLocaleString()}</b></span>
    <span>Model: <b>${cloudModelLabel(modelEl.value) || '—'}</b></span>
  </div>`);

  messages.forEach((m, i) => {
    const isPending = !!m._pending;
    const hasImg    = m.images?.length;
    const imgNote   = hasImg ? `\n\n[+ ${m.images.length} image(s) attached]` : "";

    // Separator before the pending (current) message
    if (isPending && i > 0) {
      parts.push(`<div class="preview-sep">Sending now</div>`);
    }

    let roleDisplay, turnLabel;
    if (m.role === "system") {
      roleDisplay = i === 0 ? "System Prompt" : "Tool / RAG Context";
      turnLabel   = "";
    } else {
      turnCounter++;
      const which = isPending ? "pending" : `turn ${turnCounter}`;
      roleDisplay = m.role === "user"
        ? (isPending ? "You · Pending" : "You")
        : "AI";
      turnLabel   = which;
    }

    parts.push(`<div class="preview-msg role-${m.role}${isPending ? " preview-pending" : ""}">
      <div class="preview-role-label">
        <span>${roleDisplay}${hasImg ? " · 🖼" : ""}</span>
        <span class="preview-turn">${turnLabel}</span>
      </div>${escapeHtml(m.content)}${imgNote}</div>`);
  });

  previewBody.innerHTML = parts.join("");
});

$("previewCopy").addEventListener("click", () => {
  if (!_previewPayload) return;
  const clean = _previewPayload.map(({ _pending, ...m }) => m);
  const json = JSON.stringify(clean, null, 2);
  const done = () => {
    const btn = $("previewCopy");
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy JSON"; }, 1800);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(json).then(done).catch(() => {});
  } else {
    const ta = document.createElement("textarea");
    ta.value = json; document.body.appendChild(ta);
    ta.select(); try { document.execCommand("copy"); done(); } catch {}
    document.body.removeChild(ta);
  }
});

$("refresh").addEventListener("click", loadModels);
$("attachImg").addEventListener("click", () => imgInput.click());
$("attachFile").addEventListener("click", () => txtInput.click());
imgInput.addEventListener("change", (e) => handleImages(e.target.files));
txtInput.addEventListener("change", (e) => handleFiles(e.target.files));

// Drag-drop + paste (main Chats only — Coder composer handles its own drops)
window.addEventListener("dragover", (e) => {
  if (e.target.closest("#coder-mode-wrap")) return;
  e.preventDefault();
});
window.addEventListener("drop", (e) => {
  if (e.target.closest("#coder-mode-wrap")) return;
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files);
  const imgs = files.filter(f => f.type.startsWith("image/"));
  const docs = files.filter(f => !f.type.startsWith("image/"));
  if (imgs.length) handleImages(imgs);
  if (docs.length) handleFiles(docs);
});
window.addEventListener("paste", (e) => {
  if (e.target.closest("#coder-mode-wrap")) return;
  const items = Array.from(e.clipboardData?.items || []);
  const imgs = items.filter(it => it.type.startsWith("image/")).map(it => it.getAsFile()).filter(Boolean);
  if (imgs.length) handleImages(imgs);
});

async function ingestImagesFromList(fileList) {
  const out = [];
  for (const f of fileList) {
    const dataUrl = await compressImage(f, 1280, 0.82);
    const base64 = dataUrl.split(",")[1];
    out.push({ name: f.name, dataUrl, base64 });
  }
  return out;
}

async function handleImages(fileList) {
  state.pendingImages.push(...(await ingestImagesFromList(fileList)));
  renderPending(); imgInput.value = "";
}

// Resize + JPEG-compress an image file before sending to the vision model.
// Full-resolution photos (3–8 MB) cause Ollama to hang; 1280px / 85% is
// more than enough for OCR and visual Q&A at a fraction of the payload.
function compressImage(file, maxPx, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else        { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); readAsDataURL(file).then(resolve); };
    img.src = url;
  });
}
// File uploads — previously any attached PDF was read via `f.text()` which
// returned the raw binary stream (the garbled characters the user saw in
// the chat). Now we route by MIME type:
//   - PDFs     → pdf.js extracts real text, saved under `f.text`
//   - text/*   → read as UTF-8 directly
//   - images   → funneled into the image pipeline instead (ignored here)
//   - anything else → a friendly "[binary file]" placeholder so the AI
//                     doesn't choke on gibberish but the user still sees
//                     the attachment chip.
async function waitForPdfJs(timeoutMs = 6000) {
  if (window.pdfjsLib) return window.pdfjsLib;
  const started = Date.now();
  while (!window.pdfjsLib && Date.now() - started < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  if (!window.pdfjsLib) throw new Error("pdf.js did not finish loading");
  return window.pdfjsLib;
}

async function extractPdfText(file) {
  const pdfjs = await waitForPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const chunks = [];
  const maxPages = Math.min(doc.numPages, 120); // hard cap so huge PDFs don't blow the prompt
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(it => ("str" in it ? it.str : "")).join(" ");
    chunks.push(`--- Page ${i} ---\n${pageText}`);
  }
  const trailing = doc.numPages > maxPages ? `\n\n[… ${doc.numPages - maxPages} more pages truncated …]` : "";
  const text = chunks.join("\n\n").trim();
  if (!text) {
    return {
      text: `[PDF attached: ${file.name} — no selectable text was found. This is probably a scanned/image-only PDF and needs OCR.]`,
      pages: doc.numPages,
      extracted: false,
    };
  }
  return { text: text + trailing, pages: doc.numPages, extracted: true };
}

function looksTextLike(file) {
  if (file.type.startsWith("text/")) return true;
  if (/\.(txt|md|markdown|csv|tsv|log|json|yml|yaml|xml|html|css|js|ts|jsx|tsx|py|rb|go|rs|java|c|h|cpp|sh|toml|ini|env)$/i.test(file.name)) return true;
  return false;
}

function fileCharLabel(chars) {
  const n = Number(chars) || 0;
  if (!n) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k chars` : `${n} chars`;
}

function fileKindIcon(kind) {
  const k = kind || "file";
  if (k === "pdf") {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 15h8"/><path d="M8 18h5"/><path d="M8 11h2"/></svg>`;
  }
  if (k === "binary") {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>`;
}

function buildAttachedFileContext(files, maxChars = 28000) {
  if (!files?.length) return "";
  const perFileBudget = Math.max(1800, Math.floor(maxChars / files.length));
  const sections = files.map((f, i) => {
    const raw = String(f.text || "").trim() || "[No extracted text available for this attachment.]";
    const clipped = raw.length > perFileBudget;
    const text = clipped
      ? raw.slice(0, perFileBudget) + `\n\n[Attachment truncated for context: ${raw.length - perFileBudget} chars omitted.]`
      : raw;
    const meta = [
      `name: ${f.name || `attachment-${i + 1}`}`,
      `kind: ${f.kind || "file"}`,
      f.pages ? `pages: ${f.pages}` : "",
      `extracted_chars: ${raw.length}`,
      clipped ? `sent_chars: ${perFileBudget}` : "",
    ].filter(Boolean).join(", ");
    return `--- Attachment ${i + 1} (${meta}) ---\n${text}`;
  });
  return [
    "",
    "[ATTACHED FILES - use this content when answering]",
    "The user attached the following file text. Treat it as part of the current user message.",
    sections.join("\n\n"),
    "[END ATTACHED FILES]",
  ].join("\n");
}

async function ingestFilesFromList(fileList, { addToRag = true } = {}) {
  const out = [];
  for (const f of fileList) {
    try {
      if (f.type.startsWith("image/")) continue;
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        try {
          const { text, pages, extracted } = await extractPdfText(f);
          const entry = {
            name: f.name, kind: "pdf", pages,
            chars: text.trim().length,
            extracted,
            text: text.slice(0, 400_000),
          };
          out.push(entry);
          if (addToRag) {
            for (let ci = 0; ci < Math.min(text.length, 12000); ci += 1200) {
              addToRAG(f.name, text.slice(ci, ci + 1200), `file:${f.name}:p${Math.floor(ci/1200)}`);
            }
          }
        } catch (err) {
          console.warn("[pdf] extract failed:", err);
          out.push({
            name: f.name, kind: "pdf",
            chars: 0,
            extracted: false,
            text: `[PDF attached: ${f.name} — text extraction failed: ${err.message}]`,
          });
        }
        continue;
      }
      if (looksTextLike(f)) {
        const text = await f.text();
        out.push({
          name: f.name,
          kind: "text",
          chars: text.trim().length,
          extracted: true,
          text: text.slice(0, 200_000),
        });
        if (addToRag) {
          for (let ci = 0; ci < Math.min(text.length, 12000); ci += 1200) {
            addToRAG(f.name, text.slice(ci, ci + 1200), `file:${f.name}:c${Math.floor(ci/1200)}`);
          }
        }
        continue;
      }
      out.push({
        name: f.name, kind: "binary",
        chars: 0,
        extracted: false,
        text: `[Binary file attached: ${f.name} (${Math.round(f.size / 1024)} KB, type ${f.type || "unknown"}) — contents not sent to the model.]`,
      });
    } catch (err) {
      console.warn("[file] failed:", f.name, err);
    }
  }
  return out;
}

async function handleFiles(fileList) {
  const imgs = [];
  const docs = [];
  for (const f of fileList) {
    if (f.type.startsWith("image/")) imgs.push(f);
    else docs.push(f);
  }
  if (imgs.length) await handleImages(imgs);
  state.pendingFiles.push(...(await ingestFilesFromList(docs)));
  renderPending(); txtInput.value = "";
}
const readAsDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});

function renderPending() {
  pending.innerHTML = "";
  state.pendingImages.forEach((img, i) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<img src="${img.dataUrl}"/><span>${escapeHtml(img.name)}</span><span class="x" data-i="${i}" data-kind="img">✕</span>`;
    pending.appendChild(chip);
  });
  state.pendingFiles.forEach((f, i) => {
    const chip = document.createElement("div");
    chip.className = "chip file";
    const extra = f.kind === "pdf" && f.pages ? ` · ${f.pages}p` : "";
    const chars = fileCharLabel(f.chars);
    chip.innerHTML = `<span>${fileKindIcon(f.kind)} ${escapeHtml(f.name)}${extra}${chars ? ` · ${chars}` : ""}</span><span class="x" data-i="${i}" data-kind="file">✕</span>`;
    pending.appendChild(chip);
  });
  pending.querySelectorAll(".x").forEach(el => {
    el.addEventListener("click", () => {
      const i = +el.dataset.i;
      if (el.dataset.kind === "img") state.pendingImages.splice(i, 1);
      else state.pendingFiles.splice(i, 1);
      renderPending();
    });
  });
  updateContextIndicator();
}

// ========= Cloud Models =========
// Direct browser→API calls (no proxy, no server).
// Keys live only in localStorage and are sent exclusively to their
// respective API endpoints over HTTPS. Nothing is ever forwarded to a
// third party or stored server-side.

// Fallback lists used when the provider's /models endpoint can't be reached
// (no key entered, network error, CORS). The live fetcher populates the full
// catalog whenever a key is present and replaces these.
// Each entry has: value (cloud:provider:modelId), label (full, with provider
// suffix for use in compare/workbench), shortLabel (compact, for dropdown options).
const CLOUD_FALLBACK = {
  // Groq — free, ultra-fast inference. IDs are the raw model slugs from console.groq.com/docs/models
  groq: [
    { value: "cloud:groq:openai/gpt-oss-120b",           label: "GPT OSS 120B · Groq",            shortLabel: "GPT OSS 120B" },
    { value: "cloud:groq:openai/gpt-oss-20b",            label: "GPT OSS 20B · Groq",             shortLabel: "GPT OSS 20B (fast)" },
    { value: "cloud:groq:llama-3.3-70b-versatile",       label: "Llama 3.3 70B · Groq",           shortLabel: "Llama 3.3 70B" },
    { value: "cloud:groq:deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B · Groq", shortLabel: "DeepSeek R1 Distill 70B" },
    { value: "cloud:groq:qwen-qwq-32b",                  label: "Qwen QwQ 32B · Groq",            shortLabel: "Qwen QwQ 32B" },
    { value: "cloud:groq:llama-3.1-8b-instant",          label: "Llama 3.1 8B · Groq",            shortLabel: "Llama 3.1 8B (fast)" },
  ],
  // Gemini — generous free tier. Stable non-preview model IDs only.
  gemini: [
    { value: "cloud:gemini:gemini-2.5-flash",                          label: "Gemini 2.5 Flash · Google",     shortLabel: "Gemini 2.5 Flash" },
    { value: "cloud:gemini:gemini-2.5-pro",                            label: "Gemini 2.5 Pro · Google",       shortLabel: "Gemini 2.5 Pro" },
    { value: "cloud:gemini:gemini-2.0-flash",                          label: "Gemini 2.0 Flash · Google",     shortLabel: "Gemini 2.0 Flash" },
    { value: "cloud:gemini:gemini-2.0-flash-lite",                     label: "Gemini 2.0 Flash Lite · Google",shortLabel: "Gemini 2.0 Flash Lite (fast)" },
    { value: "cloud:gemini:gemini-2.0-flash-preview-image-generation", label: "Gemini Image Gen · Google",     shortLabel: "Gemini Image Gen ✦", imageGen: true },
  ],
  // OpenRouter — free models (live fetch updates on app start)
  openrouter: [
    { value: "cloud:openrouter:openrouter/owl-alpha",                                  label: "Owl Alpha (free) · OpenRouter",              shortLabel: "Owl Alpha (free)" },
    { value: "cloud:openrouter:openrouter/free",                                       label: "OpenRouter Free Router",                     shortLabel: "Free Router" },
    { value: "cloud:openrouter:openai/gpt-oss-120b:free",                              label: "GPT OSS 120B (free) · OpenRouter",           shortLabel: "GPT OSS 120B (free)" },
    { value: "cloud:openrouter:openai/gpt-oss-20b:free",                               label: "GPT OSS 20B (free) · OpenRouter",            shortLabel: "GPT OSS 20B (free)" },
    { value: "cloud:openrouter:deepseek/deepseek-v4-flash:free",                       label: "DeepSeek V4 Flash (free) · OpenRouter",      shortLabel: "DeepSeek V4 Flash (free)" },
    { value: "cloud:openrouter:deepseek/deepseek-r1:free",                             label: "DeepSeek R1 (free) · OpenRouter",            shortLabel: "DeepSeek R1 (free)" },
    { value: "cloud:openrouter:nvidia/nemotron-3-super-120b-a12b:free",                label: "Nemotron 3 Super 120B (free) · OpenRouter",  shortLabel: "Nemotron Super 120B (free)" },
    { value: "cloud:openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",    label: "Nemotron Omni 30B (free) · OpenRouter",      shortLabel: "Nemotron Omni (free)" },
    { value: "cloud:openrouter:nvidia/nemotron-3-nano-30b-a3b:free",                   label: "Nemotron 3 Nano 30B (free) · OpenRouter",    shortLabel: "Nemotron Nano (free)" },
    { value: "cloud:openrouter:meta-llama/llama-3.3-70b-instruct:free",                label: "Llama 3.3 70B (free) · OpenRouter",          shortLabel: "Llama 3.3 70B (free)" },
    { value: "cloud:openrouter:meta-llama/llama-3.2-3b-instruct:free",                 label: "Llama 3.2 3B (free) · OpenRouter",           shortLabel: "Llama 3.2 3B (free)" },
    { value: "cloud:openrouter:google/gemma-4-31b-it:free",                            label: "Gemma 4 31B (free) · OpenRouter",            shortLabel: "Gemma 4 31B (free)" },
    { value: "cloud:openrouter:google/gemma-4-26b-a4b-it:free",                        label: "Gemma 4 26B (free) · OpenRouter",            shortLabel: "Gemma 4 26B (free)" },
    { value: "cloud:openrouter:qwen/qwen3-next-80b-a3b-instruct:free",                 label: "Qwen3 Next 80B (free) · OpenRouter",         shortLabel: "Qwen3 Next 80B (free)" },
    { value: "cloud:openrouter:qwen/qwen3-coder:free",                                 label: "Qwen3 Coder (free) · OpenRouter",            shortLabel: "Qwen3 Coder (free)" },
    { value: "cloud:openrouter:qwen/qwen3-30b-a3b:free",                               label: "Qwen3 30B (free) · OpenRouter",              shortLabel: "Qwen3 30B (free)" },
    { value: "cloud:openrouter:z-ai/glm-5.1",                                          label: "GLM 5.1 (free) · OpenRouter",                shortLabel: "GLM 5.1 (free)" },
    { value: "cloud:openrouter:z-ai/glm-4.5-air:free",                                 label: "GLM 4.5 Air (free) · OpenRouter",            shortLabel: "GLM 4.5 Air (free)" },
    { value: "cloud:openrouter:minimax/minimax-m2.5:free",                             label: "MiniMax M2.5 (free) · OpenRouter",           shortLabel: "MiniMax M2.5 (free)" },
    { value: "cloud:openrouter:poolside/laguna-m.1:free",                              label: "Laguna M.1 Coder (free) · OpenRouter",       shortLabel: "Laguna M.1 (free)" },
    { value: "cloud:openrouter:poolside/laguna-xs.2:free",                             label: "Laguna XS.2 Coder (free) · OpenRouter",      shortLabel: "Laguna XS.2 (free)" },
    { value: "cloud:openrouter:baidu/cobuddy:free",                                    label: "Baidu CoBuddy (free) · OpenRouter",          shortLabel: "CoBuddy (free)" },
    { value: "cloud:openrouter:arcee-ai/trinity-large-thinking:free",                  label: "Trinity Large Thinking (free) · OpenRouter", shortLabel: "Trinity (free)" },
    { value: "cloud:openrouter:nousresearch/hermes-3-llama-3.1-405b:free",             label: "Hermes 3 405B (free) · OpenRouter",          shortLabel: "Hermes 3 405B (free)" },
  ],
  // Cerebras — confirmed stable model IDs from cerebras.ai/models
  cerebras: [
    { value: "cloud:cerebras:llama-3.3-70b", label: "Llama 3.3 70B · Cerebras",  shortLabel: "Llama 3.3 70B" },
    { value: "cloud:cerebras:llama3.1-8b",   label: "Llama 3.1 8B · Cerebras",   shortLabel: "Llama 3.1 8B (fast)" },
  ],
  // SambaNova — free mega-scale inference. IDs are PascalCase as shown in cloud.sambanova.ai
  samba: [
    { value: "cloud:samba:Llama-4-Maverick-17B-128E-Instruct", label: "Llama 4 Maverick 17B · SambaNova", shortLabel: "Llama 4 Maverick 17B" },
    { value: "cloud:samba:Meta-Llama-3.1-405B-Instruct",       label: "Llama 3.1 405B · SambaNova",      shortLabel: "Llama 3.1 405B" },
    { value: "cloud:samba:Meta-Llama-3.3-70B-Instruct",        label: "Llama 3.3 70B · SambaNova",       shortLabel: "Llama 3.3 70B" },
    { value: "cloud:samba:QwQ-32B",                            label: "Qwen QwQ 32B · SambaNova",        shortLabel: "Qwen QwQ 32B" },
    { value: "cloud:samba:DeepSeek-R1",                        label: "DeepSeek R1 · SambaNova",         shortLabel: "DeepSeek R1" },
    { value: "cloud:samba:DeepSeek-V3-0324",                   label: "DeepSeek V3 · SambaNova",         shortLabel: "DeepSeek V3" },
  ],
  // OpenAI — paid, frontier models
  openai: [
    { value: "cloud:openai:gpt-4o",            label: "GPT-4o · OpenAI",            shortLabel: "GPT-4o" },
    { value: "cloud:openai:gpt-4o-mini",       label: "GPT-4o Mini · OpenAI",       shortLabel: "GPT-4o Mini" },
    { value: "cloud:openai:gpt-4-turbo",       label: "GPT-4 Turbo · OpenAI",       shortLabel: "GPT-4 Turbo" },
    { value: "cloud:openai:o3-mini",           label: "o3 Mini · OpenAI",           shortLabel: "o3 Mini" },
  ],
  // Anthropic Claude — paid, strong reasoning
  anthropic: [
    { value: "cloud:anthropic:claude-sonnet-4-20250514", label: "Claude Sonnet 4 · Anthropic", shortLabel: "Claude Sonnet 4" },
    { value: "cloud:anthropic:claude-opus-4-20250514",   label: "Claude Opus 4 · Anthropic",   shortLabel: "Claude Opus 4" },
    { value: "cloud:anthropic:claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet · Anthropic", shortLabel: "Claude 3.5 Sonnet" },
  ],
  // Moonshot AI (Kimi) — OpenAI-compatible API. The live /models call replaces
  // this list whenever a key is available; keep the fallback on current public IDs.
  moonshot: [
    { value: "cloud:moonshot:kimi-k2.6",                 label: "Kimi K2.6 · Moonshot",              shortLabel: "Kimi K2.6" },
    { value: "cloud:moonshot:kimi-k2.5",                 label: "Kimi K2.5 · Moonshot",              shortLabel: "Kimi K2.5" },
    { value: "cloud:moonshot:kimi-k2-thinking-turbo",    label: "Kimi K2 Thinking Turbo · Moonshot", shortLabel: "Kimi K2 Thinking Turbo" },
    { value: "cloud:moonshot:kimi-k2-thinking",          label: "Kimi K2 Thinking · Moonshot",       shortLabel: "Kimi K2 Thinking" },
    { value: "cloud:moonshot:kimi-k2-turbo-preview",     label: "Kimi K2 Turbo Preview · Moonshot",  shortLabel: "Kimi K2 Turbo" },
    { value: "cloud:moonshot:kimi-k2-0905-preview",      label: "Kimi K2 0905 Preview · Moonshot",   shortLabel: "Kimi K2 0905" },
    { value: "cloud:moonshot:moonshot-v1-128k",          label: "Moonshot v1 128K · Kimi",           shortLabel: "Kimi 128K" },
    { value: "cloud:moonshot:moonshot-v1-32k",           label: "Moonshot v1 32K · Kimi",            shortLabel: "Kimi 32K" },
    { value: "cloud:moonshot:moonshot-v1-8k",            label: "Moonshot v1 8K · Kimi",             shortLabel: "Kimi 8K" },
  ],
  // DeepSeek — strong reasoning, cheap
  deepseek: [
    { value: "cloud:deepseek:deepseek-chat",     label: "DeepSeek V3 · DeepSeek",     shortLabel: "DeepSeek V3" },
    { value: "cloud:deepseek:deepseek-reasoner", label: "DeepSeek R1 · DeepSeek",     shortLabel: "DeepSeek R1" },
  ],
  // Mistral AI — European provider, strong coding
  mistral: [
    { value: "cloud:mistral:mistral-large-latest", label: "Mistral Large · Mistral", shortLabel: "Mistral Large" },
    { value: "cloud:mistral:codestral-latest",     label: "Codestral · Mistral",     shortLabel: "Codestral" },
    { value: "cloud:mistral:mistral-medium-latest", label: "Mistral Medium · Mistral", shortLabel: "Mistral Medium" },
  ],
  // MiniMax — M2.7, M2.1, Text-01
  minimax: [
    { value: "cloud:minimax:MiniMax-M2.7",   label: "MiniMax M2.7 · MiniMax",   shortLabel: "MiniMax M2.7" },
    { value: "cloud:minimax:MiniMax-M2.1",   label: "MiniMax M2.1 · MiniMax",   shortLabel: "MiniMax M2.1" },
    { value: "cloud:minimax:MiniMax-M1",     label: "MiniMax M1 · MiniMax",     shortLabel: "MiniMax M1" },
    { value: "cloud:minimax:MiniMax-Text-01", label: "MiniMax Text 01 · MiniMax", shortLabel: "MiniMax Text 01" },
  ],
  // GLM (Z.AI Coding Plan) — GLM-5.1, GLM-4.7, GLM-4.5-air
  glm: [
    { value: "cloud:glm:GLM-5.1",      label: "GLM 5.1 · Z.AI Coding Plan",  shortLabel: "GLM 5.1" },
    { value: "cloud:glm:GLM-5",        label: "GLM 5 · Z.AI Coding Plan",    shortLabel: "GLM 5" },
    { value: "cloud:glm:GLM-5-Turbo",  label: "GLM 5 Turbo · Z.AI Coding Plan", shortLabel: "GLM 5 Turbo" },
    { value: "cloud:glm:GLM-4.7",      label: "GLM 4.7 · Z.AI Coding Plan",  shortLabel: "GLM 4.7" },
    { value: "cloud:glm:GLM-4.5-air",  label: "GLM 4.5 Air · Z.AI Coding Plan", shortLabel: "GLM 4.5 Air" },
  ],
  // NVIDIA NIM — free big models at build.nvidia.com
  nvidia: [
    { value: "cloud:nvidia:deepseek-ai/deepseek-v4-pro",                    label: "DeepSeek V4 Pro · NVIDIA",               shortLabel: "DeepSeek V4 Pro" },
    { value: "cloud:nvidia:deepseek-ai/deepseek-v4-flash",                   label: "DeepSeek V4 Flash · NVIDIA",             shortLabel: "DeepSeek V4 Flash" },
    { value: "cloud:nvidia:deepseek-ai/deepseek-v3.1-terminus",              label: "DeepSeek V3.1 Terminus · NVIDIA",        shortLabel: "DeepSeek V3.1" },
    { value: "cloud:nvidia:deepseek-ai/deepseek-r1",                         label: "DeepSeek R1 · NVIDIA",                   shortLabel: "DeepSeek R1" },
    { value: "cloud:nvidia:nvidia/llama-3.1-nemotron-ultra-253b-v1",         label: "Nemotron Ultra 253B · NVIDIA",           shortLabel: "Nemotron Ultra 253B" },
    { value: "cloud:nvidia:nvidia/nemotron-3-super-120b-a12b",               label: "Nemotron 3 Super 120B · NVIDIA",         shortLabel: "Nemotron 3 Super 120B" },
    { value: "cloud:nvidia:nvidia/nemotron-3-nano-30b-a3b",                  label: "Nemotron 3 Nano 30B · NVIDIA",           shortLabel: "Nemotron 3 Nano 30B" },
    { value: "cloud:nvidia:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",   label: "Nemotron 3 Nano Omni 30B · NVIDIA",      shortLabel: "Nemotron Omni 30B" },
    { value: "cloud:nvidia:meta/llama-4-maverick-17b-128e-instruct",         label: "Llama 4 Maverick 17B · NVIDIA",          shortLabel: "Llama 4 Maverick" },
    { value: "cloud:nvidia:meta/llama-3.3-70b-instruct",                     label: "Llama 3.3 70B Instruct · NVIDIA",        shortLabel: "Llama 3.3 70B" },
    { value: "cloud:nvidia:meta/llama-3.1-405b-instruct",                    label: "Llama 3.1 405B · NVIDIA",                shortLabel: "Llama 3.1 405B" },
    { value: "cloud:nvidia:meta/llama-3.1-8b-instruct",                      label: "Llama 3.1 8B · NVIDIA",                  shortLabel: "Llama 3.1 8B (fast)" },
    { value: "cloud:nvidia:openai/gpt-oss-120b",                             label: "GPT OSS 120B · NVIDIA",                  shortLabel: "GPT OSS 120B" },
    { value: "cloud:nvidia:openai/gpt-oss-20b",                              label: "GPT OSS 20B · NVIDIA",                   shortLabel: "GPT OSS 20B" },
    { value: "cloud:nvidia:google/gemma-4-31b-it",                           label: "Gemma 4 31B · NVIDIA",                   shortLabel: "Gemma 4 31B" },
    { value: "cloud:nvidia:qwen/qwen2.5-coder-32b-instruct",                 label: "Qwen 2.5 Coder 32B · NVIDIA",            shortLabel: "Qwen Coder 32B" },
    { value: "cloud:nvidia:qwen/qwen3-30b-a3b",                              label: "Qwen3 30B · NVIDIA",                     shortLabel: "Qwen3 30B" },
    { value: "cloud:nvidia:moonshotai/kimi-k2.6",                            label: "Kimi K2.6 · NVIDIA",                     shortLabel: "Kimi K2.6" },
    { value: "cloud:nvidia:mistralai/mistral-medium-3.5-128b",               label: "Mistral Medium 3.5 128B · NVIDIA",       shortLabel: "Mistral Medium 3.5" },
    { value: "cloud:nvidia:minimaxai/minimax-m2.7",                          label: "MiniMax M2.7 · NVIDIA",                  shortLabel: "MiniMax M2.7" },
    { value: "cloud:nvidia:z-ai/glm-5.1",                                    label: "GLM 5.1 · NVIDIA",                       shortLabel: "GLM 5.1" },
    { value: "cloud:nvidia:01-ai/yi-large",                                  label: "Yi Large · NVIDIA",                      shortLabel: "Yi Large" },
    { value: "cloud:nvidia:snowflake/arctic",                                label: "Snowflake Arctic · NVIDIA",              shortLabel: "Arctic" },
    { value: "cloud:nvidia:microsoft/phi-4",                                 label: "Phi-4 · NVIDIA",                         shortLabel: "Phi-4" },
    { value: "cloud:nvidia:nvidia/llama-3.1-nemotron-70b-instruct",          label: "Nemotron 70B · NVIDIA",                  shortLabel: "Nemotron 70B" },
  ],
};

// In-memory cache of fetched model lists (cleared on reload).
// Keyed by provider; invalidated when the API key changes.
const _cloudModelCache      = { groq: null, gemini: null, openrouter: null, cerebras: null, samba: null, openai: null, anthropic: null, moonshot: null, deepseek: null, mistral: null, minimax: null, glm: null, nvidia: null };
const _cloudModelKeyAtFetch = { groq: "",   gemini: "",   openrouter: "",   cerebras: "",   samba: "",   openai: "",   anthropic: "",   moonshot: "",   deepseek: "",   mistral: "",   minimax: "",   glm: "",   nvidia: "" };
const _cloudFetchInflight   = { groq: null, gemini: null, openrouter: null, cerebras: null, samba: null, openai: null, anthropic: null, moonshot: null, deepseek: null, mistral: null, minimax: null, glm: null, nvidia: null };
let _cloudModelsFetchedOnce = false;

// Pretty-print a raw model id into a label.
// "llama-3.3-70b-versatile"  → "Llama 3.3 70B Versatile"
// "openai/gpt-oss-120b:free" → "GPT OSS 120B (free)" with provider suffix added later
function prettifyModelId(id) {
  if (!id) return "";
  let core = id.split("/").pop().replace(/:free$/i, "");

  // Replace separators — but protect digit.digit (version numbers like 3.1, 2.5)
  core = core
    .replace(/[-_]/g, " ")
    .replace(/(\d)\.(\d)/g, "$1\x00$2")   // shield "3.1", "2.5" etc.
    .replace(/\./g, " ")
    .replace(/\x00/g, ".")                  // restore shielded dots
    .replace(/\s+/g, " ").trim();

  // Token-level casing
  const ALWAYS_UPPER = new Set(["gpt", "oss", "llm", "api", "rag", "sql"]);
  const CUSTOM_CASE  = { deepseek: "DeepSeek", qwq: "QwQ", llava: "LLaVA", nvidia: "NVIDIA" };

  core = core.split(" ").filter(Boolean).map(tok => {
    const lo = tok.toLowerCase();
    if (CUSTOM_CASE[lo])  return CUSTOM_CASE[lo];
    if (ALWAYS_UPPER.has(lo)) return tok.toUpperCase();
    // Parameter-count suffix: "8b" → "8B", "70b" → "70B", "405b" → "405B"
    if (/^\d+(\.\d+)?[bkmtBKMT]$/i.test(tok))
      return tok.slice(0, -1) + tok.slice(-1).toUpperCase();
    // MoE spec like "a22b" → "A22B"
    if (/^[a-zA-Z]\d+[bkmtBKMT]$/i.test(tok))
      return tok.charAt(0).toUpperCase() + tok.slice(1, -1) + tok.slice(-1).toUpperCase();
    // Pure number or version number → keep as-is
    if (/^[\d.]+$/.test(tok)) return tok;
    // Default title case
    return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
  }).join(" ");

  return /:free$/i.test(id.split("/").pop()) ? `${core} (free)` : core;
}

function isExcludedCloudModel(model) {
  const haystack = [
    model?.value,
    model?.id,
    model?.name,
    model?.label,
    model?.shortLabel,
  ].filter(Boolean).join(" ").toLowerCase();
  return /baidu|qianfan|cobuddy/.test(haystack);
}

function visibleCloudModels(models) {
  return (models || []).filter(m => !isExcludedCloudModel(m));
}

/** Merge live API list with curated fallback (dedupe by value). */
function mergeCloudLists(primary, secondary) {
  const seen = new Set();
  const out = [];
  for (const m of [...(primary || []), ...(secondary || [])]) {
    if (!m?.value || seen.has(m.value)) continue;
    seen.add(m.value);
    out.push(m);
  }
  return out.sort((a, b) =>
    String(a.shortLabel || a.label).localeCompare(String(b.shortLabel || b.label))
  );
}

/** True when an NVIDIA catalog id is not a chat-completion model. */
function isNvidiaNonChatModelId(id) {
  const low = String(id || "").toLowerCase();
  return /embed|retrieval|rerank|nemoguard|safety-guard|content-safety|jailbreak|moderation|image-gen|vision-only|cosmos|riva-translate|riva-|usdcode|translate|asr|tts|stt|canary|parakeet|whisper|speech|guard-detect|compute/.test(low);
}

function sortMoonshotModelIds(ids) {
  const preferred = [
    "kimi-k2.6",
    "kimi-k2.5",
    "kimi-k2-thinking-turbo",
    "kimi-k2-thinking",
    "kimi-k2-turbo-preview",
    "kimi-k2-0905-preview",
    "kimi-k2-0711-preview",
    "moonshot-v1-128k",
    "moonshot-v1-32k",
    "moonshot-v1-8k",
  ];
  return (ids || []).slice().sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    const ar = ai === -1 ? 999 : ai;
    const br = bi === -1 ? 999 : bi;
    return ar - br || String(a).localeCompare(String(b));
  });
}

async function fetchGroqModels(apiKey) {
  const r = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`Groq /models ${r.status}`);
  const j = await r.json();
  const list = (j.data || [])
    .filter(m => m.active !== false && (m.object === "model" || !m.object))
    .map(m => m.id)
    .filter(id => !/whisper|tts|guard|embed|orpheus|allam|speech|safeguard|prompt-guard|compound/i.test(id))
    .sort();
  return list.map(id => ({
    value: `cloud:groq:${id}`,
    label: `${prettifyModelId(id)} · Groq`,
    shortLabel: prettifyModelId(id),
  }));
}

async function fetchGeminiModels(apiKey) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
  );
  if (!r.ok) throw new Error(`Gemini /models ${r.status}`);
  const j = await r.json();
  // Only Gemini 2.x models are on the free tier; 1.x is deprecated.
  // Exclude non-chat models. Preserve imageGen flag for image-generation variants.
  const ids = (j.models || [])
    .filter(m => Array.isArray(m.supportedGenerationMethods) &&
                 m.supportedGenerationMethods.includes("generateContent"))
    .map(m => String(m.name || "").replace(/^models\//, ""))
    .filter(id => id &&
      /^gemini-2\./i.test(id) &&
      !/embedding|aqa|tts|deep-research|veo|learnlm|exp-/i.test(id))
    .sort();
  // Text models first, image-gen models last
  const textIds  = ids.filter(id => !/image-generation/i.test(id));
  const imageIds = ids.filter(id => /image-generation/i.test(id));
  return [
    ...textIds.map(id => ({
      value: `cloud:gemini:${id}`,
      label: `${prettifyModelId(id)} · Google`,
      shortLabel: prettifyModelId(id),
    })),
    ...imageIds.map(id => ({
      value: `cloud:gemini:${id}`,
      label: `${prettifyModelId(id)} · Google`,
      shortLabel: `${prettifyModelId(id)} ✦`,
      imageGen: true,
    })),
  ];
}

async function fetchOpenRouterModels(apiKey) {
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const r = await fetch("https://openrouter.ai/api/v1/models", { headers });
  if (!r.ok) throw new Error(`OpenRouter /models ${r.status}`);
  const j = await r.json();
  const list = (j.data || [])
    .filter(m => {
      const p = m.pricing || {};
      const isFreeModel = (p.prompt === "0" && p.completion === "0") || /:free$/i.test(m.id);
      const isText = m.architecture?.output_modalities?.includes("text");
      const isChat = m.architecture?.input_modalities?.includes("text");
      const excluded = /embedding|moderation|rerank|ocr|tts|whisper|venice/i.test(m.id);
      return isFreeModel && isText && isChat && !excluded && m.id.includes("/");
    })
    .filter(m => !isExcludedCloudModel(m))
    .sort((a, b) => a.id.localeCompare(b.id));
  return list.map(m => ({
    value: `cloud:openrouter:${m.id}`,
    label: `${(m.name || m.id).replace(/\s*\(free\)\s*$/i, "")} (free) · OpenRouter`,
    shortLabel: `${(m.name || m.id).replace(/\s*\(free\)\s*$/i, "")} (free)`,
  }));
}

async function fetchCerebrasModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.cerebras;
  const r = await fetch("https://api.cerebras.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`Cerebras /models ${r.status}`);
  const j = await r.json();
  const list = (j.data || [])
    .map(m => m.id)
    .filter(id => id && !/embedding|guard|tts|whisper|vision|glm|zai/i.test(id))
    .sort();
  if (!list.length) return CLOUD_FALLBACK.cerebras;
  return list.map(id => ({
    value: `cloud:cerebras:${id}`,
    label: `${prettifyModelId(id)} · Cerebras`,
    shortLabel: prettifyModelId(id),
  }));
}

async function fetchSambaModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.samba;
  const r = await fetch("https://api.sambanova.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`SambaNova /models ${r.status}`);
  const j = await r.json();
  const list = (j.data || [])
    .map(m => m.id)
    .filter(id => id && !/embedding|guard|tts|audio/i.test(id))
    .sort();
  if (!list.length) return CLOUD_FALLBACK.samba;
  return list.map(id => ({
    value: `cloud:samba:${id}`,
    label: `${prettifyModelId(id)} · SambaNova`,
    shortLabel: prettifyModelId(id),
  }));
}

async function fetchOpenAIModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.openai;
  const r = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`OpenAI /models ${r.status}`);
  const j = await r.json();
  const list = (j.data || [])
    .map(m => m.id)
    .filter(id => id && /^gpt-|^[oO][0-9]/.test(id) && !/embedding|tts|whisper|dall|moderation|instruct/i.test(id))
    .sort();
  if (!list.length) return CLOUD_FALLBACK.openai;
  return list.map(id => ({
    value: `cloud:openai:${id}`,
    label: `${prettifyModelId(id)} · OpenAI`,
    shortLabel: prettifyModelId(id),
  }));
}

async function fetchAnthropicModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.anthropic;
  // Anthropic does not expose a public /models endpoint as of mid-2025.
  // We return the fallback list; users can still enter custom model IDs manually.
  return CLOUD_FALLBACK.anthropic;
}

async function fetchMoonshotModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.moonshot;
  const { res } = await fetchMoonshotApi("/models", apiKey, () => ({
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  }));
  const j = await res.json();
  const list = sortMoonshotModelIds((j.data || [])
    .map(m => m.id)
    .filter(id => id && !/embedding|tts|image/i.test(id))
  );
  if (!list.length) return CLOUD_FALLBACK.moonshot;
  return list.map(id => ({
    value: `cloud:moonshot:${id}`,
    label: `${prettifyModelId(id)} · Kimi`,
    shortLabel: prettifyModelId(id),
  }));
}

async function fetchDeepSeekModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.deepseek;
  const r = await fetch("https://api.deepseek.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`DeepSeek /models ${r.status}`);
  const j = await r.json();
  const list = (j.data || [])
    .map(m => m.id)
    .filter(id => id && !/embedding|image/i.test(id))
    .sort();
  if (!list.length) return CLOUD_FALLBACK.deepseek;
  return list.map(id => ({
    value: `cloud:deepseek:${id}`,
    label: `${prettifyModelId(id)} · DeepSeek`,
    shortLabel: prettifyModelId(id),
  }));
}

async function fetchMistralModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.mistral;
  const r = await fetch("https://api.mistral.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`Mistral /models ${r.status}`);
  const j = await r.json();
  const list = (j.data || [])
    .map(m => m.id)
    .filter(id => id && !/embed/i.test(id))
    .sort();
  if (!list.length) return CLOUD_FALLBACK.mistral;
  return list.map(id => ({
    value: `cloud:mistral:${id}`,
    label: `${prettifyModelId(id)} · Mistral`,
    shortLabel: prettifyModelId(id),
  }));
}

async function fetchMinimaxModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.minimax;
  const r = await fetch("https://api.minimax.io/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`MiniMax /models ${r.status}`);
  const j = await r.json();
  const list = (j.data || [])
    .map(m => m.id)
    .filter(id => id && !/embedding|tts|voice|audio|video|image|music/i.test(id))
    .sort();
  if (!list.length) return CLOUD_FALLBACK.minimax;
  return list.map(id => ({
    value: `cloud:minimax:${id}`,
    label: `${prettifyModelId(id)} · MiniMax`,
    shortLabel: prettifyModelId(id),
  }));
}

async function fetchGLMModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.glm;
  try {
    const r = await fetch("https://api.z.ai/api/coding/paas/v4/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) throw new Error(`GLM /models ${r.status}`);
    const j = await r.json();
    const list = (j.data || [])
      .map(m => m.id)
      .filter(id => id && !/embedding|tts|cogview|cogvideo|codegeex|emohaa/i.test(id))
      .sort();
    if (!list.length) return CLOUD_FALLBACK.glm;
    return list.map(id => ({
      value: `cloud:glm:${id}`,
      label: `${prettifyModelId(id)} · Z.AI Coding Plan`,
      shortLabel: prettifyModelId(id),
    }));
  } catch {
    return CLOUD_FALLBACK.glm;
  }
}

async function fetchNvidiaModels(apiKey) {
  if (!apiKey) return CLOUD_FALLBACK.nvidia;
  try {
    let j;
    if (HC?.isTauri && HC?.invoke) {
      const probe = await HC.invoke("provider_http_probe_bearer", {
        url: "https://integrate.api.nvidia.com/v1/models",
        bearer: apiKey,
        timeoutMs: 20_000,
      });
      if (!probe?.ok) throw new Error(probe?.error || probe?.body_preview || `NVIDIA /models ${probe?.status || ""}`);
      j = JSON.parse(probe.body || probe.body_preview || "{}");
    } else {
      const r = await fetch("https://integrate.api.nvidia.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) throw new Error(`NVIDIA /models ${r.status}`);
      j = await r.json();
    }
    if (j.has_more) {
      console.warn("[cloud] NVIDIA /models reports has_more — catalog may be incomplete until pagination is added.");
    }
    const list = (j.data || [])
      .map(m => m.id)
      .filter(id => id && /\//.test(id) && !isNvidiaNonChatModelId(id))
      .sort();
    if (!list.length) return CLOUD_FALLBACK.nvidia;
    const live = list.map(id => ({
      value: `cloud:nvidia:${id}`,
      label: `${prettifyModelId(id)} · NVIDIA`,
      shortLabel: prettifyModelId(id),
    }));
    return mergeCloudLists(live, CLOUD_FALLBACK.nvidia);
  } catch {
    return CLOUD_FALLBACK.nvidia;
  }
}

const CLOUD_FETCHERS = {
  groq: fetchGroqModels,
  gemini: fetchGeminiModels,
  openrouter: fetchOpenRouterModels,
  cerebras: fetchCerebrasModels,
  samba: fetchSambaModels,
  openai: fetchOpenAIModels,
  anthropic: fetchAnthropicModels,
  moonshot: fetchMoonshotModels,
  deepseek: fetchDeepSeekModels,
  mistral: fetchMistralModels,
  minimax: fetchMinimaxModels,
  glm: fetchGLMModels,
  nvidia: fetchNvidiaModels,
};

// Load + cache the live model list for one provider. Returns the fallback
// list on any error so the UI never shows an empty cloud group.
async function loadCloudModelsFor(provider, keyEl) {
  const apiKey = (keyEl?.value || "").trim();
  // OpenRouter doesn't strictly require a key for /models; everything else does.
  if (!apiKey && provider !== "openrouter") {
    return CLOUD_FALLBACK[provider] || [];
  }
  if (_cloudModelCache[provider] && _cloudModelKeyAtFetch[provider] === apiKey) {
    return _cloudModelCache[provider];
  }
  if (_cloudFetchInflight[provider]) return _cloudFetchInflight[provider];
  const fetcher = CLOUD_FETCHERS[provider];
  if (!fetcher) return CLOUD_FALLBACK[provider] || [];
  const p = (async () => {
    try {
      const models = visibleCloudModels(await fetcher(apiKey));
      if (Array.isArray(models) && models.length) {
        _cloudModelCache[provider] = models;
        _cloudModelKeyAtFetch[provider] = apiKey;
        return models;
      }
      return CLOUD_FALLBACK[provider] || [];
    } catch (err) {
      console.warn(`[cloud] ${provider} fetch failed:`, err);
      return CLOUD_FALLBACK[provider] || [];
    } finally {
      _cloudFetchInflight[provider] = null;
    }
  })();
  _cloudFetchInflight[provider] = p;
  return p;
}

const CLOUD_MODELS = [
  { group: "Groq  —  Free · Fast Inference",    keyEl: () => groqKeyEl,       provider: "groq",       models: CLOUD_FALLBACK.groq.slice() },
  { group: "Google Gemini  —  Free",            keyEl: () => geminiKeyEl,     provider: "gemini",     models: CLOUD_FALLBACK.gemini.slice() },
  { group: "OpenAI  —  Paid · Frontier",        keyEl: () => openaiKeyEl,     provider: "openai",     models: CLOUD_FALLBACK.openai.slice() },
  { group: "Anthropic Claude  —  Paid · Strong Reasoning", keyEl: () => anthropicKeyEl, provider: "anthropic", models: CLOUD_FALLBACK.anthropic.slice() },
  { group: "Moonshot (Kimi)  —  Paid · 256K Context", keyEl: () => moonshotKeyEl, provider: "moonshot", models: CLOUD_FALLBACK.moonshot.slice() },
  { group: "DeepSeek  —  Paid · Reasoning",     keyEl: () => deepseekKeyEl,   provider: "deepseek",   models: CLOUD_FALLBACK.deepseek.slice() },
  { group: "Mistral AI  —  Paid · European",    keyEl: () => mistralKeyEl,    provider: "mistral",    models: CLOUD_FALLBACK.mistral.slice() },
  { group: "Cerebras  —  Free · Ultra-Fast",    keyEl: () => cerebrasKeyEl,   provider: "cerebras",   models: CLOUD_FALLBACK.cerebras.slice() },
  { group: "SambaNova  —  Free · Mega-Scale",   keyEl: () => sambaKeyEl,      provider: "samba",      models: CLOUD_FALLBACK.samba.slice() },
  { group: "OpenRouter  —  Free Models",        keyEl: () => openRouterKeyEl, provider: "openrouter", models: CLOUD_FALLBACK.openrouter.slice() },
  { group: "MiniMax  —  M2.7 · M2.1 · Text-01", keyEl: () => minimaxKeyEl,    provider: "minimax",    models: CLOUD_FALLBACK.minimax.slice() },
  { group: "GLM (Z.AI)  —  Coding Plan · GLM-5.1 · GLM-4.7", keyEl: () => glmKeyEl, provider: "glm", models: CLOUD_FALLBACK.glm.slice() },
  { group: "NVIDIA NIM  —  Free · Llama · Nemotron · DeepSeek", keyEl: () => nvidiaKeyEl, provider: "nvidia", models: CLOUD_FALLBACK.nvidia.slice() },
];

// True when the selected cloud model generates images instead of text.
function isImageGenModel(val) {
  if (!val) return false;
  for (const grp of CLOUD_MODELS) {
    const m = grp.models.find(x => x.value === val);
    if (m) return !!m.imageGen;
  }
  return false;
}

function seedSavedModelDropdown() {
  const savedModel = SAVED.model || "";
  if (!savedModel || isExcludedCloudModel({ value: savedModel, label: savedModel, shortLabel: savedModel })) {
    modelEl.innerHTML = `<option value="" disabled selected>Loading models…</option>`;
    setActiveSub("");
    return;
  }
  modelEl.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = savedModel;
  opt.textContent = cloudModelLabel(savedModel) || savedModel;
  modelEl.appendChild(opt);
  modelEl.value = savedModel;
  setActiveSub(savedModel);
  populateCloudModels();
}

// Return a human-readable label for a model value (cloud or local)
function cloudModelLabel(val) {
  if (!val) return "";
  if (isExcludedCloudModel({ value: val, label: val, shortLabel: val })) return "";
  if (!val.startsWith("cloud:")) return val;
  for (const grp of CLOUD_MODELS) {
    const m = grp.models.find(x => x.value === val);
    if (m) return m.label;
  }
  const { provider, modelId } = parseCloudModel(val);
  return `${modelId} · ${provider}`;
}

// ── Model tier system for quality-aware failover ────────────────
const MODEL_TIER = {
  frontier: 300, // GPT-4o, Claude 4, Gemini 2.5 Pro, Kimi K1.5, DeepSeek-V3, Llama-4-Maverick, 405B+
  strong:   200, // GPT-4, Claude 3.5, Gemini Pro, 120B–235B, Qwen3-235B
  capable:  100, // 70B class: Llama-3.3, Qwen3-72B, Nemotron-70B
  moderate:  50, // 32B–40B: DeepSeek-R1-Distill, Qwen2.5-32B
  small:      0, // < 32B: flash, lite, mini, 8B, 3B
};

function getModelTier(value, label) {
  const s = `${value || ""} ${label || ""}`.toLowerCase();
  const sizeMatch = s.match(/(\d+)(?:\.\d+)?\s*([bkmt])/i);
  const sizeUnit = sizeMatch?.[2]?.toLowerCase();
  const sizeNum = sizeMatch ? (sizeUnit === 't' ? parseFloat(sizeMatch[1]) * 1000 : parseFloat(sizeMatch[1])) : 0;
  // Explicit tier detection by model family
  if (/gpt-4o|claude-4|gemini-2\.5-pro|kimi-k(?:1\.5|2(?:\.|-))|deepseek-v3|llama-4-maverick|405b|253b|235b|120b/i.test(s)) return MODEL_TIER.frontier;
  if (/gpt-4|claude-3\.5|gemini-pro|qwen3-235|120b|70b|maverick|nemotron-ultra/i.test(s)) return MODEL_TIER.strong;
  if (/70b|llama-3\.3|qwen3-72|nemotron-70/i.test(s)) return MODEL_TIER.capable;
  if (/32b|40b|deepseek-r1-distill|qwen2\.5-32/i.test(s)) return MODEL_TIER.moderate;
  if (/8b|7b|3b|mini|flash|lite|instant|small|tiny/i.test(s)) return MODEL_TIER.small;
  return sizeNum >= 120 ? MODEL_TIER.frontier : sizeNum >= 70 ? MODEL_TIER.capable : sizeNum >= 32 ? MODEL_TIER.moderate : MODEL_TIER.small;
}

// Build a flat list of all currently-available cloud models with their keys set.
function getAvailableCloudModels() {
  const available = [];
  for (const grp of CLOUD_MODELS) {
    const key = (grp.keyEl().value || "").trim();
    if (!key) continue;
    for (const m of grp.models) {
      available.push({ ...m, provider: grp.provider, tier: getModelTier(m.value, m.label) });
    }
  }
  return available;
}

// Pick the best failover model when `currentModel` fails.
// Prefers same or higher tier, then falls back one tier at a time.
// Returns null if nothing usable is available.
function getBestFailoverModel(currentModel, excludeSet = new Set()) {
  const currentTier = getModelTier(currentModel, cloudModelLabel(currentModel));
  const available = getAvailableCloudModels()
    .filter(m => !excludeSet.has(m.value) && m.value !== currentModel);
  if (!available.length) return null;

  // Sort by tier desc, then by whether provider is free-tier preferred
  const FREE_PREFERRED = { groq: 1, gemini: 1, cerebras: 1, samba: 1, openrouter: 1 };
  available.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    return (FREE_PREFERRED[b.provider] || 0) - (FREE_PREFERRED[a.provider] || 0);
  });

  // Try same tier or higher first
  const sameOrBetter = available.find(m => m.tier >= currentTier);
  if (sameOrBetter) return sameOrBetter;
  // Then one tier down
  const oneDown = available.find(m => m.tier >= currentTier - 50);
  if (oneDown) return oneDown;
  // Finally anything available
  return available[0];
}

function ollamaModelName(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  return entry.name || entry.model || entry.id || "";
}

function rememberLocalModels(names) {
  trackedLocalModels.clear();
  (names || []).forEach(name => {
    if (name && !String(name).startsWith("cloud:")) trackedLocalModels.add(String(name));
  });
}

function trackLocalModel(name) {
  if (name && !String(name).startsWith("cloud:")) trackedLocalModels.add(String(name));
}

function untrackLocalModel(name) {
  if (name) trackedLocalModels.delete(String(name));
}

function getTrackedLocalModels() {
  const names = Array.from(trackedLocalModels);
  const selected = modelEl.value || "";
  if (selected && !selected.startsWith("cloud:") && !names.includes(selected)) names.push(selected);
  return names;
}

async function fetchLoadedLocalModels(host, timeoutMs = 4000) {
  const r = await fetch(`${host}/api/ps`, { cache: "no-store", signal: makeSignal(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const loaded = Array.isArray(data.models) ? data.models
               : Array.isArray(data.processes) ? data.processes
               : Array.isArray(data) ? data : [];
  const names = loaded.map(m => m.model || m.name).filter(Boolean);
  return { loaded, names };
}

async function unloadLocalModels(names, { keepalive = false } = {}) {
  const host = safeHost();
  const uniq = [...new Set((names || []).filter(name => name && !String(name).startsWith("cloud:")))];
  for (const modelName of uniq) {
    const payload = JSON.stringify({ model: modelName, keep_alive: 0 });
    if (keepalive) {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`${host}/api/generate`, new Blob([payload], { type: "application/json" }));
        } else {
          fetch(`${host}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {}
      continue;
    }
    try {
      await fetch(`${host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      untrackLocalModel(modelName);
    } catch {}
  }
}

function updateCloudModelVisualState() {
  const privacyOn = !!privacyLocalEl.checked;
  const hasCloudModels = !!modelEl.querySelector('optgroup[data-cloud]');
  sideModelWrap.classList.toggle("cloud-dim", privacyOn && hasCloudModels);
  modelEl.dataset.privacyLocal = privacyOn ? "1" : "0";

  modelEl.querySelectorAll('optgroup[data-cloud]').forEach(group => {
    const baseLabel = group.dataset.baseLabel || group.label || "Cloud Models";
    group.label = privacyOn ? `${baseLabel} [dimmed: privacy local-only]` : baseLabel;
    group.style.color = privacyOn ? "rgba(120, 180, 250, 0.46)" : "";
  });

  modelEl.querySelectorAll('option[data-cloud-option="1"]').forEach(opt => {
    if (!opt.dataset.baseLabel) opt.dataset.baseLabel = opt.textContent || opt.value;
    opt.textContent = privacyOn ? `   ${opt.dataset.baseLabel} · privacy locked` : opt.dataset.baseLabel;
    opt.style.color = privacyOn ? "rgba(120, 180, 250, 0.46)" : "";
    opt.disabled = false;
  });
}

// Rebuild the cloud optgroups in the model dropdown.
// Called on page load (inside loadModels) and whenever a key changes.
// Providers without an API key are hidden entirely (no optgroup shown).
function populateCloudModels() {
  // Remove stale cloud optgroups first
  modelEl.querySelectorAll("optgroup[data-cloud]").forEach(g => g.remove());
  // Orphan cloud options (e.g. from a bad clone) show as a second unindented duplicate list
  modelEl.querySelectorAll('option[data-cloud-option="1"]').forEach(o => {
    if (o.parentElement === modelEl) o.remove();
  });
  modelEl.querySelectorAll('option[data-separator="1"]').forEach(o => o.remove());
  const hasAnyCloudKey = CLOUD_MODELS.some(grp => !!(grp.keyEl().value || "").trim());
  if (hasAnyCloudKey) {
    const separator = document.createElement("option");
    separator.disabled = true;
    separator.value = "";
    separator.dataset.separator = "1";
    separator.textContent = "\u2500\u2500 Local models above \u2500\u2500 Cloud models below \u2500\u2500";
    modelEl.appendChild(separator);
  }
  CLOUD_MODELS.forEach(grp => {
    const hasKey = !!(grp.keyEl().value || "").trim();
    // Skip providers without a key entirely — clean dropdown, no clutter
    if (!hasKey) return;
    const group = document.createElement("optgroup");
    group.dataset.cloud = "1";
    group.dataset.provider = grp.provider;
    group.dataset.baseLabel = grp.group;
    group.dataset.missingKey = "0";
    group.label = grp.group;
    visibleCloudModels(grp.models).filter(m => !isFallbackDisabled(m.value)).forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.value;
      opt.dataset.cloudOption = "1";
      opt.dataset.baseLabel = m.shortLabel || m.label;
      opt.dataset.missingKey = "0";
      opt.textContent = m.shortLabel || m.label;
      group.appendChild(opt);
    });
    modelEl.appendChild(group);
  });
  updateCloudModelVisualState();
  syncCompareModelOptions();
  updateCloudUsageChip();
  try {
    window.dispatchEvent(new CustomEvent('miraxcode:models-updated'));
  } catch {}
  // Kick off live fetches only once on app boot.
  // Each provider only fetches if a key is present (or is keyless like OpenRouter).
  // Results are cached by key so repeat calls are cheap.
  if (!_cloudModelsFetchedOnce) {
    _cloudModelsFetchedOnce = true;
    refreshCloudModelsFromAPIs();
    initMcpOnBoot();
  }
}

async function initMcpOnBoot() {
  try {
    await scanMcpServers();
    const prefs = loadMcpPrefs();
    const enabledServers = (_mcpServersCache || []).filter(s => prefs[s.name] !== false && s.url);
    for (const srv of enabledServers) {
      await discoverMcpTools(srv.name, srv.url);
    }
    collectMcpToolDefinitions();
  } catch (e) {
    console.warn("[MCP] boot init failed:", e);
  }
}

// Rebuild one provider's optgroup in-place with live model data, preserving selection.
function _replaceProviderOptgroup(grp) {
  const sel = modelEl.value;
  const hasKey = !!(grp.keyEl().value || "").trim();
  const existing = modelEl.querySelector(`optgroup[data-cloud][data-provider='${grp.provider}']`);
  // If key was removed, remove the optgroup entirely
  if (!hasKey) {
    if (existing) existing.remove();
    // Also remove separator if no cloud keys remain
    const hasAnyCloudKey = CLOUD_MODELS.some(g => !!(g.keyEl().value || "").trim());
    if (!hasAnyCloudKey) {
      modelEl.querySelectorAll('option[data-separator="1"]').forEach(o => o.remove());
    }
    if (sel && Array.from(modelEl.options).some(o => o.value === sel)) modelEl.value = sel;
    return;
  }
  // Key present — build/replace optgroup
  const newGrp = document.createElement("optgroup");
  newGrp.dataset.cloud = "1";
  newGrp.dataset.provider = grp.provider;
  newGrp.dataset.baseLabel = grp.group;
  newGrp.dataset.missingKey = "0";
  newGrp.label = grp.group;
  grp.models.forEach(m => {
    if (isExcludedCloudModel(m)) return;
    if (isFallbackDisabled(m.value)) return;
    const opt = document.createElement("option");
    opt.value = m.value;
    opt.dataset.cloudOption = "1";
    opt.dataset.baseLabel = m.shortLabel || m.label;
    opt.dataset.missingKey = "0";
    opt.textContent = m.shortLabel || m.label;
    newGrp.appendChild(opt);
  });
  // Ensure separator exists before first cloud group
  const hasAnyCloudKey = CLOUD_MODELS.some(g => !!(g.keyEl().value || "").trim());
  if (hasAnyCloudKey && !modelEl.querySelector('option[data-separator="1"]')) {
    const separator = document.createElement("option");
    separator.disabled = true;
    separator.value = "";
    separator.dataset.separator = "1";
    separator.textContent = "\u2500\u2500 Local models above \u2500\u2500 Cloud models below \u2500\u2500";
    // Insert before first cloud optgroup, or at end if none
    const firstCloud = modelEl.querySelector('optgroup[data-cloud]');
    if (firstCloud) modelEl.insertBefore(separator, firstCloud);
    else modelEl.appendChild(separator);
  }
  if (existing) existing.replaceWith(newGrp);
  else modelEl.appendChild(newGrp);
  if (sel && Array.from(modelEl.options).some(o => o.value === sel)) modelEl.value = sel;
}

// Refetch one provider after key add/change (boot uses refreshCloudModelsFromAPIs for all).
async function refreshCloudProvider(provider) {
  const grp = CLOUD_MODELS.find(g => g.provider === provider);
  if (!grp) return;
  const apiKey = (grp.keyEl().value || "").trim();
  if (!apiKey && provider !== "openrouter") {
    grp.models = (CLOUD_FALLBACK[provider] || []).slice();
    _replaceProviderOptgroup(grp);
    try { window.dispatchEvent(new CustomEvent("miraxcode:models-updated")); } catch {}
    return;
  }
  _cloudModelCache[provider] = null;
  _cloudModelKeyAtFetch[provider] = "";
  try {
    const live = await loadCloudModelsFor(provider, grp.keyEl());
    if (!Array.isArray(live) || !live.length) return;
    grp.models = live;
    _replaceProviderOptgroup(grp);
    updateCloudModelVisualState();
    syncCompareModelOptions();
    try { window.dispatchEvent(new CustomEvent("miraxcode:models-updated")); } catch {}
  } catch (e) {
    console.warn(`[cloud] ${provider} refresh failed:`, e.message);
  }
}

// Fetch live model list for every provider that has a key (or is keyless like OpenRouter).
// Safe to call repeatedly — loadCloudModelsFor caches by key and deduplicates inflight fetches.
async function refreshCloudModelsFromAPIs() {
  await Promise.all(CLOUD_MODELS.map(async (grp) => {
    try {
      const live = await loadCloudModelsFor(grp.provider, grp.keyEl());
      if (!Array.isArray(live) || !live.length) return;
      const before = grp.models.map(m => m.value).join("|");
      const after  = live.map(m => m.value).join("|");
      if (before === after) return;
      grp.models = live;
      _replaceProviderOptgroup(grp);
    } catch (e) {
      console.warn(`[cloud] ${grp.provider} live fetch failed:`, e.message);
    }
  }));
  updateCloudModelVisualState();
  syncCompareModelOptions();
  try {
    window.dispatchEvent(new CustomEvent('miraxcode:models-updated'));
  } catch {}
}

function syncCompareModelOptions() {
  if (!compareModelEl || !modelEl) return;
  const previous = compareModelEl.value || localStorage.getItem("hashui_compare_model") || "";
  compareModelEl.innerHTML = "";
  Array.from(modelEl.children).forEach(child => {
    compareModelEl.appendChild(child.cloneNode(true));
  });
  Array.from(compareModelEl.querySelectorAll("option")).forEach(opt => {
    if (opt.dataset.separator === "1") opt.remove();
    else if (opt.value === modelEl.value && Array.from(compareModelEl.options).some(o => o.value && o.value !== modelEl.value && !o.disabled)) {
      opt.disabled = true;
    }
  });
  const available = Array.from(compareModelEl.options).find(o => o.value && !o.disabled && o.value !== modelEl.value) ||
    Array.from(compareModelEl.options).find(o => o.value && !o.disabled);
  if (previous && Array.from(compareModelEl.options).some(o => o.value === previous && !o.disabled)) compareModelEl.value = previous;
  else if (available) compareModelEl.value = available.value;
}

function setCompareMode(on) {
  state.compareMode = !!on;
  compareBar?.classList.toggle("visible", state.compareMode);
  try { localStorage.setItem("hashui_compare_mode", state.compareMode ? "1" : "0"); } catch {}
  syncCompareModelOptions();
  input.focus();
}

// Shared SSE parser for OpenAI-compatible streams (Groq, OpenRouter)
async function* parseOpenAISSE(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  function parseLine(line) {
    const s = line.trim();
    if (!s.startsWith("data:")) return null;
    const payload = s.slice(5).trim();
    if (!payload || payload === "[DONE]") return null;
    try {
      const evt = JSON.parse(payload);
      return evt.choices?.[0]?.delta?.content || null;
    } catch {
      return null;
    }
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const delta = parseLine(line);
        if (delta) yield delta;
      }
    }
    const delta = parseLine(buf);
    if (delta) yield delta;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

// Route a streaming chat request to the right cloud API.
// Images are stripped — all free cloud tiers are text-only.
// Keys are read from the DOM (localStorage-backed) at call time, never cached.
// Human-readable error messages for common cloud API HTTP status codes.
// `retryAfter` is the value of the Retry-After header (seconds) when present.
function cloudHttpError(provider, status, body, retryAfter) {
  const PROVIDER_LABELS = {
    groq: "Groq", gemini: "Google Gemini", openrouter: "OpenRouter",
    cerebras: "Cerebras", samba: "SambaNova",
    openai: "OpenAI", anthropic: "Anthropic", moonshot: "Moonshot (Kimi)",
    deepseek: "DeepSeek", mistral: "Mistral AI",
  };
  const providerLabel = PROVIDER_LABELS[provider] || provider;
  const hints = {
    groq:        { key: "console.groq.com → API Keys",            quota: "console.groq.com → Usage" },
    gemini:      { key: "aistudio.google.com → Get API key",      quota: "ai.google.dev/gemini-api/docs/quota" },
    openrouter:  { key: "openrouter.ai → Keys",                   quota: "openrouter.ai/activity (daily + burst limits)" },
    cerebras:    { key: "cloud.cerebras.ai → API Keys (free)",    quota: "cloud.cerebras.ai → Usage" },
    samba:       { key: "cloud.sambanova.ai → API Keys (free)",   quota: "cloud.sambanova.ai → Usage" },
    openai:      { key: "platform.openai.com → API Keys",         quota: "platform.openai.com/usage" },
    anthropic:   { key: "console.anthropic.com → API Keys",       quota: "console.anthropic.com/settings/plans" },
    moonshot:    { key: "platform.kimi.ai or platform.kimi.com → API Keys", quota: "platform.kimi.ai / platform.kimi.com" },
    deepseek:    { key: "platform.deepseek.com → API Keys",       quota: "platform.deepseek.com" },
    mistral:     { key: "console.mistral.ai → API Keys",          quota: "console.mistral.ai" },
    minimax:     { key: "platform.minimax.io → API Keys",         quota: "platform.minimax.io/user-center/basic-information" },
    glm:         { key: "z.ai → API Keys",                        quota: "z.ai/manage-apikey/quota-detail" },
    nvidia:      { key: "build.nvidia.com → API Keys",            quota: "build.nvidia.com" },
  }[provider] || { key: "provider dashboard", quota: "provider dashboard" };
  if (status === 402 && provider === "openrouter") {
    return `${providerLabel} needs credits (HTTP 402). A negative balance can block even free models — add credits at openrouter.ai/credits.\nCheck usage: ${hints.quota}`;
  }
  if (status === 429) {
    const wait = retryAfter ? ` Try again in ${retryAfter}s.` : " Wait ~60s and try again, or switch to a different model.";
    const orNote = provider === "openrouter"
      ? " OpenRouter also enforces a separate burst limit (~20 req/min) in addition to your daily cap."
      : "";
    return `${providerLabel} rate limit — quota or burst exceeded (failed requests count too).${orNote}${wait}\nCheck usage: ${hints.quota}`;
  }
  if (status === 401 || status === 403) {
    const serverDetail = (body || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const detailLine = serverDetail ? `\nServer said: ${serverDetail}` : "";
    return `${providerLabel} rejected the API key (HTTP ${status}). Check it was generated on the matching platform — ${hints.key} — and that API access is enabled on your project.${detailLine}`;
  }
  if (status === 404) {
    return `${providerLabel} model not found.\nThe model may have been renamed or retired.`;
  }
  if (status === 503 || status === 529) {
    return `${providerLabel} is overloaded right now. Try again in a few seconds.`;
  }
  if (status >= 500) {
    return `${providerLabel} server error (${status}). Try again shortly.`;
  }
  const detail = (body || "").slice(0, 120);
  return `${providerLabel} error ${status}${detail ? ": " + detail : ""}`;
}

// Image generation via Gemini (Nano Banana = gemini-3.1-flash-image-preview).
// Non-streaming — returns { text, images: ["data:image/png;base64,..."] }.
// The response modality is TEXT + IMAGE so any caption/description text is
// also returned alongside the generated image.
async function generateCloudImage(modelId, messages, signal) {
  const key = (geminiKeyEl.value || "").trim();
  if (!key) throw new Error("Google AI Studio key missing.\nAdd it in Settings → Cloud Models — free at aistudio.google.com");
  const textMessages = messages.map(m => ({ role: m.role, content: m.content || "" }));
  const systemMsg = textMessages.find(m => m.role === "system");
  const geminiContents = textMessages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role === "assistant" ? "model" : "user",
                 parts: [{ text: m.content }] }));
  const body = {
    contents: geminiContents,
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
  };
  const res = await cloudFetch("gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
    { method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const retry = res.headers.get("Retry-After");
    throw new Error(cloudHttpError("gemini", res.status, txt, retry));
  }
  const data = await res.json();
  cloudRecord("gemini", { model: modelId });
  const parts = data.candidates?.[0]?.content?.parts || [];
  let text = "";
  const images = [];
  for (const part of parts) {
    if (part.text) text += part.text;
    if (part.inlineData) {
      const mime = part.inlineData.mimeType || "image/png";
      images.push(`data:${mime};base64,${part.inlineData.data}`);
    }
  }
  if (!images.length) throw new Error("Gemini returned no image. Try rephrasing your prompt.");
  return { text: text.trim(), images };
}

// Convert Ollama-format messages (images: [base64...]) to OpenAI vision format.
function toOpenAIVision(messages) {
  return messages.map(m => {
    if (!m.images?.length) return { role: m.role, content: m.content || "" };
    return {
      role: m.role,
      content: [
        { type: "text", text: m.content || "Describe what you see." },
        ...m.images.map(b64 => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } })),
      ],
    };
  });
}

async function streamCloudModel(provider, modelId, messages, temperature, onToken, signal) {
  const temp = typeof temperature === "number" ? temperature : 0.7;
  // Text-only fallback (for providers that don't support vision)
  const textMessages = messages.map(m => ({ role: m.role, content: m.content || "" }));
  const hasImages = messages.some(m => m.images?.length);

  if (provider === "groq") {
    const key = (groqKeyEl.value || "").trim();
    if (!key) throw new Error("Groq API key missing.\nAdd it in Settings → Cloud Models — free at console.groq.com");
    // Vision models accept image_url content blocks; text-only models get plain strings
    const groqMessages = (hasImages && /vision/i.test(modelId)) ? toOpenAIVision(messages) : textMessages;
    const res = await cloudFetch("groq", "https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: groqMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("groq", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("groq", { model: modelId });

  } else if (provider === "gemini") {
    const key = (geminiKeyEl.value || "").trim();
    if (!key) throw new Error("Google AI Studio key missing.\nAdd it in Settings → Cloud Models — free at aistudio.google.com");
    const systemMsg = messages.find(m => m.role === "system");
    // Build Gemini parts — supports both text and inlineData images
    const geminiContents = messages
      .filter(m => m.role !== "system")
      .map(m => {
        const parts = [];
        if (m.content) parts.push({ text: m.content });
        if (m.images?.length) m.images.forEach(b64 => parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } }));
        return { role: m.role === "assistant" ? "model" : "user", parts: parts.length ? parts : [{ text: "" }] };
      });
    const body = {
      contents: geminiContents,
      generationConfig: { temperature: temp },
      ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    };
    const res = await cloudFetch("gemini",
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
      { method: "POST", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }
    );
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("gemini", res.status, txt, res.headers.get("Retry-After"))); }
    const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = "";
    const parseGeminiLine = (line) => {
      const s = line.trim(); if (!s.startsWith("data:")) return;
      const payload = s.slice(5).trim(); if (!payload) return;
      try {
        const evt = JSON.parse(payload);
        // Collect text from all parts (Gemini can return multiple text parts)
        const parts = evt.candidates?.[0]?.content?.parts || [];
        parts.forEach(p => { if (p.text) onToken(p.text); });
      } catch {}
    };
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || ""; for (const line of lines) parseGeminiLine(line); }
      parseGeminiLine(buf);
    } finally { try { reader.releaseLock(); } catch {} }
    cloudRecord("gemini", { model: modelId });

  } else if (provider === "openrouter") {
    const key = (openRouterKeyEl.value || "").trim();
    if (!key) throw new Error("OpenRouter API key missing.\nAdd it in Settings → Cloud Models — free at openrouter.ai");
    // OpenRouter supports OpenAI vision format
    const orMessages = hasImages ? toOpenAIVision(messages) : textMessages;
    const res = await cloudFetch("openrouter", "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "HTTP-Referer": "https://miraxcode.local", "X-Title": "MiraXcode" },
      body: JSON.stringify({ model: modelId, messages: orMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("openrouter", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("openrouter", { model: modelId });

  } else if (provider === "cerebras") {
    const key = (cerebrasKeyEl.value || "").trim();
    if (!key) throw new Error("Cerebras API key missing.\nAdd it in Settings → Cloud Models — free at cloud.cerebras.ai");
    const res = await cloudFetch("cerebras", "https://api.cerebras.ai/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: textMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("cerebras", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("cerebras", { model: modelId });

  } else if (provider === "samba") {
    const key = (sambaKeyEl.value || "").trim();
    if (!key) throw new Error("SambaNova API key missing.\nAdd it in Settings → Cloud Models — free at cloud.sambanova.ai");
    const res = await cloudFetch("samba", "https://api.sambanova.ai/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: textMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("samba", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("samba", { model: modelId });

  } else if (provider === "openai") {
    const key = (openaiKeyEl.value || "").trim();
    if (!key) throw new Error("OpenAI API key missing.\nAdd it in Settings → APIs");
    const oaMessages = hasImages ? toOpenAIVision(messages) : textMessages;
    const res = await cloudFetch("openai", "https://api.openai.com/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: oaMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("openai", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("openai", { model: modelId });

  } else if (provider === "anthropic") {
    const key = (anthropicKeyEl.value || "").trim();
    if (!key) throw new Error("Anthropic API key missing.\nAdd it in Settings → APIs");
    const systemMsg = messages.find(m => m.role === "system");
    const anthropicMessages = messages
      .filter(m => m.role !== "system")
      .map(m => {
        const content = [];
        if (m.content) content.push({ type: "text", text: m.content });
        if (m.images?.length) m.images.forEach(b64 => content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } }));
        return { role: m.role, content: content.length ? content : [{ type: "text", text: "" }] };
      });
    const body = {
      model: modelId,
      messages: anthropicMessages,
      max_tokens: 4096,
      stream: true,
      ...(systemMsg ? { system: systemMsg.content } : {}),
    };
    if (typeof temperature === "number") body.temperature = temperature;
    const res = await cloudFetch("anthropic", "https://api.anthropic.com/v1/messages", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("anthropic", res.status, txt, res.headers.get("Retry-After"))); }
    // Anthropic SSE format is similar to OpenAI but uses event: content_block_delta
    const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = "";
    const parseAnthropicLine = (line) => {
      const s = line.trim(); if (!s.startsWith("data:")) return;
      const payload = s.slice(5).trim(); if (!payload || payload === "[DONE]") return;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "content_block_delta" && evt.delta?.text) onToken(evt.delta.text);
      } catch {}
    };
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || ""; for (const line of lines) parseAnthropicLine(line); }
      parseAnthropicLine(buf);
    } finally { try { reader.releaseLock(); } catch {} }
    cloudRecord("anthropic", { model: modelId });

  } else if (provider === "moonshot") {
    const key = (moonshotKeyEl.value || "").trim();
    if (!key) throw new Error("Moonshot API key missing.\nAdd it in Settings → APIs");

    // sk-ki keys are from the new Kimi for Code platform (kimi.com) — they only
    // accept the Anthropic-compatible protocol at api.moonshot.{ai,cn}/anthropic.
    if (isKimiCodeKey(key)) {
      const body = buildKimiAnthropicBody(modelId, textMessages, { temperature: temp, stream: true });
      const { res } = await fetchKimiAnthropic("/v1/messages", key, () => ({
        method: "POST", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
        signal,
      }));
      if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("moonshot", res.status, txt, res.headers.get("Retry-After"))); }
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = "";
      const parseLine = (line) => {
        const s = line.trim(); if (!s.startsWith("data:")) return;
        const payload = s.slice(5).trim(); if (!payload || payload === "[DONE]") return;
        try { const evt = JSON.parse(payload); if (evt.type === "content_block_delta" && evt.delta?.text) onToken(evt.delta.text); } catch {}
      };
      try {
        while (true) { const { value, done } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || ""; for (const line of lines) parseLine(line); }
        parseLine(buf);
      } finally { try { reader.releaseLock(); } catch {} }
      cloudRecord("moonshot", { model: modelId });
    } else {
      // Legacy sk-... keys from platform.moonshot.ai/.cn use OpenAI-compatible API
      const { res } = await fetchMoonshotApi("/chat/completions", key, () => ({
        method: "POST", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: modelId, messages: textMessages, temperature: temp, stream: true }),
        signal,
      }));
      if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("moonshot", res.status, txt, res.headers.get("Retry-After"))); }
      for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
      cloudRecord("moonshot", { model: modelId });
    }

  } else if (provider === "deepseek") {
    const key = (deepseekKeyEl.value || "").trim();
    if (!key) throw new Error("DeepSeek API key missing.\nAdd it in Settings → APIs");
    const res = await cloudFetch("deepseek", "https://api.deepseek.com/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: textMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("deepseek", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("deepseek", { model: modelId });

  } else if (provider === "mistral") {
    const key = (mistralKeyEl.value || "").trim();
    if (!key) throw new Error("Mistral API key missing.\nAdd it in Settings → APIs");
    const res = await cloudFetch("mistral", "https://api.mistral.ai/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: textMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("mistral", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("mistral", { model: modelId });

  } else if (provider === "minimax") {
    const key = (minimaxKeyEl.value || "").trim();
    if (!key) throw new Error("MiniMax API key missing.\nAdd it in Settings → APIs");
    const res = await cloudFetch("minimax", "https://api.minimax.io/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: textMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("minimax", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("minimax", { model: modelId });

  } else if (provider === "glm") {
    const key = (glmKeyEl.value || "").trim();
    if (!key) throw new Error("GLM API key missing.\nAdd it in Settings → APIs");
    const res = await cloudFetch("glm", "https://api.z.ai/api/coding/paas/v4/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: textMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("glm", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("glm", { model: modelId });

  } else if (provider === "nvidia") {
    const key = (nvidiaKeyEl.value || "").trim();
    if (!key) throw new Error("NVIDIA API key missing.\nAdd it in Settings → APIs");
    const res = await cloudFetch("nvidia", "https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "Accept": "text/event-stream" },
      body: JSON.stringify({ model: modelId, messages: textMessages, temperature: temp, stream: true }),
      signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(cloudHttpError("nvidia", res.status, txt, res.headers.get("Retry-After"))); }
    for await (const delta of parseOpenAISSE(res.body)) onToken(delta);
    cloudRecord("nvidia", { model: modelId });

  } else {
    throw new Error(`Unknown cloud provider: ${provider}`);
  }
}

let loadModelsSeq = 0;
async function loadModels() {
  const seq = ++loadModelsSeq;
  clearError();
  // "Off" — user picked the "Off" preset (empty URL). Skip the ping entirely.
  if (!(hostEl.value || "").trim()) {
    setStatus("warn", "Local Ollama: Off");
    modelEl.innerHTML = `<option value="">— local Ollama disabled —</option>`;
    populateCloudModels();
    return;
  }
  setStatus("warn", "Connecting…");
  try {
    const r = await fetch(`${safeHost()}/api/tags`, { cache: "no-store", signal: makeSignal(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (seq !== loadModelsSeq) return;
    const models = (data.models || []).map(ollamaModelName).filter(Boolean);
    const current = modelEl.value;
    modelEl.innerHTML = "";
    if (models.length === 0) {
      modelEl.innerHTML = `<option value="">No models — run: ollama pull llama3.2</option>`;
      setStatus("warn", "Connected · no models installed");
    } else {
      models.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m; opt.textContent = m;
        modelEl.appendChild(opt);
      });
      setStatus("ok", `Connected · ${models.length} model${models.length === 1 ? "" : "s"}`);
    }
    // Add cloud model optgroups below local models
    populateCloudModels();
    const canSelectModel = (value) =>
      !!value && Array.from(modelEl.options).some(opt => opt.value === value && !opt.disabled);
    const pick = canSelectModel(current) ? current :
                 canSelectModel(SAVED.model) ? SAVED.model :
                 (models[0] || "");
    if (pick) modelEl.value = pick;
    setActiveSub(modelEl.value);

    // Query rewriter dropdown removed from Settings UI — population skipped when element absent
    if (rewriterEl) {
      const rewriterPrev = rewriterEl.value || SAVED.rewriterModel || "";
      rewriterEl.innerHTML = `<option value="">— off — use raw message —</option>`;
      models.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m; opt.textContent = m;
        rewriterEl.appendChild(opt);
      });
      if (rewriterPrev && models.includes(rewriterPrev)) rewriterEl.value = rewriterPrev;
    }

    saveSettings();
  } catch (err) {
    if (seq !== loadModelsSeq) return;
    // Local host offline — show cloud models so the user can still chat
    modelEl.innerHTML = `<option value="" disabled>(Local host offline)</option>`;
    populateCloudModels();
    // Restore a saved cloud model selection if any
    const savedModel = SAVED.model || "";
    if (savedModel.startsWith("cloud:")) {
      modelEl.value = savedModel;
      setActiveSub(savedModel);
    } else {
      activeSub.textContent = "Local host offline";
      if (cloudBadgeEl) cloudBadgeEl.style.display = "none";
    }
    const hasCloud = CLOUD_MODELS.some(g => (g.keyEl().value || "").trim());
    setStatus(hasCloud ? "warn" : "err", hasCloud ? "Local host offline · cloud ready" : "Local host offline");
  }
}

function setStatus(kind, text) {
  statusDot.className = "dot " + (kind === "ok" ? "ok" : kind === "err" ? "err" : "warn");
  statusText.textContent = text;
}

function showError(err) {
  const msg = err?.message || String(err || "Unknown error");
  errorSlot.innerHTML = `<div class="error-banner"><b>Request failed</b><span>${escapeHtml(msg)}</span><button type="button" class="error-close" aria-label="Dismiss request failed message" title="Close">&times;</button></div>`;
}
function clearError() { errorSlot.innerHTML = ""; }
errorSlot?.addEventListener("click", (e) => {
  if (e.target.closest(".error-close")) clearError();
});

