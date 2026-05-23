/** Forge model auto-routing helpers (Wave 16). */
import { AGENTS, FORGE_ALLOWED_MODEL_PROVIDERS } from './constants.js';

export function createForgeAgentsRoutingApi(ctx) {
  const { $, log, cooldowns } = ctx;

    function isFreeModel(value, label) {
    return /:free|\bfree\b/.test(`${value || ""} ${label || ""}`.toLowerCase());
  }

  function modelSizeScore(value, label) {
    const s = `${value || ""} ${label || ""}`.toLowerCase();
    let best = 0;
    for (const match of s.matchAll(/(\d+(?:\.\d+)?)\s*b\b/g)) {
      best = Math.max(best, Number(match[1]) || 0);
    }
    if (/gpt[-_\s]?oss.*120|120.*gpt[-_\s]?oss/.test(s)) best = Math.max(best, 120);
    if (/405b|480b|671b/.test(s)) best = Math.max(best, Number((s.match(/(405|480|671)b/) || [0, 0])[1]) || 0);
    return best;
  }

  function modelStrengthScore(value, label, bigTask) {
    const s = `${value || ""} ${label || ""}`.toLowerCase();
    let score = 0;
    const size = modelSizeScore(value, label);
    if (/gpt[-_\s]?oss/.test(s)) score += 95;
    if (/pro|opus|sonnet|gpt-4|gpt-5|o3|o4|r1|v3|405b|235b|120b|70b|large|max|maverick|nemotron|hermes|qwen3|deepseek/.test(s)) score += 70;
    if (size >= 120) score += 52;
    else if (size >= 100) score += 38;
    else if (size >= 70) score += bigTask ? 12 : 18;
    if (size > 0 && size < 70) score -= bigTask ? 18 : 8;
    if (/coder|code|dev|reason|thinking|instruct|chat/.test(s)) score += 18;
    if (/vision|vl|multi/.test(s)) score += 10;
    if (/flash|lite|mini|small|tiny|1b|1.5b|3b|7b|8b|instant/.test(s)) score -= bigTask ? 35 : 12;
    if (isFreeModel(value, label)) score -= bigTask ? 28 : 10;
    if (/local/.test(s)) score -= bigTask ? 12 : 0;
    if (/nvidia|samba|openrouter|gemini|groq|cerebras/.test(s)) score += 8;
    return score;
  }

  function bestModelForProvider(options, bigTask) {
    return [...options].sort((a, b) =>
      modelStrengthScore(b.value, b.label, bigTask) - modelStrengthScore(a.value, a.label, bigTask)
    )[0] || null;
  }

  function providerFromValue(value) {
    return value && value.startsWith("cloud:") ? value.split(":")[1] : "local";
  }

  function providerDisplayName(provider) {
    const name = String(provider || "model").replace(/^sambanova$/i, "SambaNova");
    if (name === "SambaNova") return name;
    return name.replace(/(^|[-_\s])([a-z])/g, (_, sep, c) => `${sep}${c.toUpperCase()}`);
  }

  function forgeProviderCooldown(provider) {
    const key = String(provider || "");
    const entry = FORGE_PROVIDER_COOLDOWNS.get(key);
    if (!entry) return null;
    if (entry.until <= Date.now()) {
      FORGE_PROVIDER_COOLDOWNS.delete(key);
      return null;
    }
    return entry;
  }

  function isForgeRoutingError(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    return /rate.?limit|quota|429|too many|free.?tier|api.?key|unauthori[sz]ed|forbidden|billing|credit|capacity|overloaded|unavailable|service.?unavailable|timed?.?out|timeout|failed to fetch|network|model.{0,16}not.{0,16}found|not configured|invalid key|missing key/.test(msg)
      || err?.name === "AbortError";
  }

  function cooldownMsForForgeError(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (/api.?key|invalid key|missing key|unauthori[sz]ed|forbidden|not configured/.test(msg)) return 10 * 60 * 1000;
    if (/rate.?limit|quota|429|too many|free.?tier|billing|credit/.test(msg)) return 90 * 1000;
    if (/timed?.?out|timeout|capacity|overloaded|unavailable|failed to fetch|network/.test(msg) || err?.name === "AbortError") return 45 * 1000;
    return 0;
  }

  function markForgeProviderFailure(provider, err) {
    if (!provider || !isForgeRoutingError(err)) return;
    const ms = cooldownMsForForgeError(err);
    if (!ms) return;
    const until = Date.now() + ms;
    const existing = forgeProviderCooldown(provider);
    if (existing && existing.until >= until) return;
    const reason = String(err?.message || err || "route failed").replace(/\s+/g, " ").slice(0, 82);
    FORGE_PROVIDER_COOLDOWNS.set(String(provider), { until, reason });
    log("Router", `Cooling down ${providerDisplayName(provider)} for ${Math.ceil(ms / 1000)}s`, "warn", reason);
  }

  function skipCoolingCandidate(candidate, candidates) {
    const healthyExists = candidates.some((route) => route?.provider && !forgeProviderCooldown(route.provider));
    const cooldown = candidate?.provider ? forgeProviderCooldown(candidate.provider) : null;
    if (!healthyExists || !cooldown) return false;
    const seconds = Math.max(1, Math.ceil((cooldown.until - Date.now()) / 1000));
    log("Router", `Skipping ${providerDisplayName(candidate.provider)} route (${seconds}s cooldown)`, "wait", cooldown.reason || "");
    return true;
  }

  function providerModelsForForge(bigTask, options = {}) {
    const includeCooling = !!options.includeCooling;
    const allOpts = Array.from(document.getElementById("model")?.options || [])
      .map((o) => ({ value: o.value, label: o.textContent || o.label || o.value }))
      .filter((o) => {
        const provider = providerFromValue(o.value);
        return o.value && !o.disabled && !o.value.startsWith("─") && (includeCooling || !forgeProviderCooldown(provider));
      });
    const providerOptions = {};
    allOpts.forEach((o) => {
      const provider = providerFromValue(o.value);
      if (!providerOptions[provider]) providerOptions[provider] = [];
      providerOptions[provider].push(o);
    });
    const ranked = Object.entries(providerOptions)
      .map(([provider, options]) => {
        const best = bestModelForProvider(options, bigTask);
        return [provider, best?.value || options[0]?.value || "", best?.label || options[0]?.label || ""];
      })
      .filter(([, value]) => value)
      .sort((a, b) => modelStrengthScore(b[1], b[2], bigTask) - modelStrengthScore(a[1], a[2], bigTask));
    if (!ranked.length && !includeCooling) return providerModelsForForge(bigTask, { includeCooling: true });
    return ranked;
  }

  function autoAssignForgeModels(prompt, force) {
    const providerModels = providerModelsForForge(true);
    const nonFreeProviderModels = providerModels.filter(([, value, label]) => !isFreeModel(value, label));
    if (!providerModels.length) {
      log("Parameter Agent", "No model options available for auto-routing", "warn");
      return;
    }
    const roleProviderPreference = {
      god: ["openrouter", "cerebras", "samba", "gemini", "groq", "local"],
      structure: ["openrouter", "cerebras", "samba", "gemini", "groq", "local"],
      surface: ["gemini", "openrouter", "samba", "groq", "cerebras", "local"],
      detail: ["openrouter", "cerebras", "gemini", "samba", "groq", "local"],
      audit: ["openrouter", "cerebras", "samba", "gemini", "groq", "local"],
    };
    const used = new Set();
    const usedValues = new Set();
    const assigned = [];
    for (const agent of AGENTS) {
      const sel = $(`frgModel_${agent.id}`);
      if (!sel) continue;
      const currentProvider = providerFromValue(sel.value);
      const currentLabel = sel.options[sel.selectedIndex]?.textContent || "";
      const currentCooling = forgeProviderCooldown(currentProvider);
      if (!force && sel.value && !used.has(currentProvider) && !isFreeModel(sel.value, currentLabel) && !currentCooling) {
        used.add(currentProvider);
        usedValues.add(sel.value);
        continue;
      }
      const preferred = roleProviderPreference[agent.id] || roleProviderPreference.god;
      const bigEnough = nonFreeProviderModels.filter(([, value, label]) => modelSizeScore(value, label) >= 120);
      const replacement =
        preferred.map((p) => bigEnough.find(([provider]) => provider === p && !used.has(provider))).find(Boolean) ||
        bigEnough.find(([provider]) => !used.has(provider)) ||
        preferred.map((p) => bigEnough.find(([provider, value]) => provider === p && !usedValues.has(value))).find(Boolean) ||
        bigEnough.find(([, value]) => !usedValues.has(value)) ||
        preferred.map((p) => nonFreeProviderModels.find(([provider]) => provider === p && !used.has(provider))).find(Boolean) ||
        nonFreeProviderModels.find(([provider]) => !used.has(provider)) ||
        preferred.map((p) => nonFreeProviderModels.find(([provider, value]) => provider === p && !usedValues.has(value))).find(Boolean) ||
        nonFreeProviderModels.find(([, value]) => !usedValues.has(value)) ||
        nonFreeProviderModels[0] ||
        preferred.map((p) => providerModels.find(([provider]) => provider === p && !used.has(provider))).find(Boolean) ||
        providerModels.find(([provider]) => !used.has(provider)) ||
        providerModels[0];
      if (replacement && Array.from(sel.options).some((o) => o.value === replacement[1])) {
        sel.value = replacement[1];
        used.add(replacement[0]);
        usedValues.add(replacement[1]);
        assigned.push(`${agent.name} → ${replacement[2] || replacement[1]}`);
      }
    }
    if (assigned.length) {
      log("Parameter Agent", `Auto-assigned ${assigned.length} model route(s)`, "boss");
      assigned.forEach((line) => log("Router", line, "wait"));
    }
  }


  return {
    isFreeModel,
    modelSizeScore,
    modelStrengthScore,
    bestModelForProvider,
    providerFromValue,
    providerDisplayName,
    forgeProviderCooldown,
    isForgeRoutingError,
    cooldownMsForForgeError,
    markForgeProviderFailure,
    skipCoolingCandidate,
    providerModelsForForge,
    autoAssignForgeModels,
  };
}
