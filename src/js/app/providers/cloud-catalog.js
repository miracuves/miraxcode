import { parseCloudModel, escapeHtml } from '../core/utils.js';

export function createCloudCatalogApi(deps) {
  const {
    $, modelEl, setActiveSub, SAVED, compareModelEl, compareBar, state,
    groqKeyEl, geminiKeyEl, openRouterKeyEl, cerebrasKeyEl, sambaKeyEl, openaiKeyEl,
    anthropicKeyEl, moonshotKeyEl, deepseekKeyEl, mistralKeyEl, minimaxKeyEl, glmKeyEl, nvidiaKeyEl,
    cloudFetch, cloudRecord, getProviderKey, updateCloudUsageChip, initMcpOnBoot,
    fetchMoonshotApi, fetchKimiAnthropic, isKimiCodeKey, isFallbackDisabled,
  } = deps;

const makeSignal = (ms) => window.MiraXcodeRuntime.makeSignal(ms);

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


  return {
    CLOUD_FALLBACK,
    CLOUD_MODELS,
    prettifyModelId,
    isExcludedCloudModel,
    visibleCloudModels,
    mergeCloudLists,
    fetchGroqModels,
    fetchGeminiModels,
    fetchOpenRouterModels,
    fetchCerebrasModels,
    fetchSambaModels,
    fetchOpenAIModels,
    fetchAnthropicModels,
    fetchMoonshotModels,
    fetchDeepSeekModels,
    fetchMistralModels,
    fetchMinimaxModels,
    fetchGLMModels,
    fetchNvidiaModels,
    loadCloudModelsFor,
    isImageGenModel,
    seedSavedModelDropdown,
    cloudModelLabel,
    getModelTier,
    getAvailableCloudModels,
    getBestFailoverModel,
    ollamaModelName,
    rememberLocalModels,
    trackLocalModel,
    untrackLocalModel,
    getTrackedLocalModels,
    fetchLoadedLocalModels,
    unloadLocalModels,
    updateCloudModelVisualState,
    populateCloudModels,
    initMcpOnBoot,
    refreshCloudProvider,
    refreshCloudModelsFromAPIs,
    syncCompareModelOptions,
    setCompareMode,
    cloudHttpError,
    generateCloudImage,
    toOpenAIVision,
    streamCloudModel,
    parseOpenAISSE,
  };
}
