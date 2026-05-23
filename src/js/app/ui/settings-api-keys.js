/**
 * Settings → APIs pane: provider key validation, status dots, and test flows.
 */

/**
 * @param {object} deps
 */
export function createSettingsApiKeysApi(deps) {
  const {
    $,
    makeSignal,
    showError,
    getProviderKey,
    cloudHttpError,
    CLOUD_FALLBACK,
    isKimiCodeKey,
    orderedMoonshotBases,
    KIMI_ANTHROPIC_BASES,
    populateCompactionModelSelect = () => {},
  } = deps;

  const buildKimiAnthropicBodyFn =
    typeof buildKimiAnthropicBody === 'function'
      ? buildKimiAnthropicBody
      : globalThis.buildKimiAnthropicBody;

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
      const body = JSON.stringify(buildKimiAnthropicBodyFn(modelId, [{ role: "user", content: API_TEST_PROMPT }], { maxTokens: 16, temperature: 0 }));
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

  function validateProviderKey(providerId, key) {
    return isProviderKeyValidated(providerId, key);
  }

  return {
    API_PROVIDERS,
    API_KEY_VALIDATION_KEY,
    API_TEST_PROMPT,
    API_TEST_MODEL_OVERRIDE,
    httpProbeGet,
    httpProbeRequest,
    validateProviderKey,
    isProviderKeyValidated,
    markProviderKeyValidated,
    clearProviderKeyValidated,
    scheduleAllApiKeyAutoTests,
    scheduleApiKeyAutoTest,
    setApiKeyDotState,
    syncApiKeyDotForProvider,
    renderApisPane,
    renderApiKeysPanel: renderApisPane,
    runApiKeyTest,
    testProviderFull,
    testProviderConnection,
    testProviderConnectivity,
    testProviderPrompt,
  };
}
