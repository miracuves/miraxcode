/**
 * Model-aware context compactor — keeps essential state for long Coder/chat sessions.
 * Deterministic extraction + optional LLM summary into a persistent working-state ledger.
 */
(function () {
  "use strict";

  const LEDGER_PREFIX = "[WORKING_STATE — compacted session memory; treat as ground truth for continuation]\n";

  const PROFILES = [
    { re: /claude-(opus|sonnet|haiku-4|4)|claude-3-7|claude-3-5/i, ctx: 200_000, out: 16_000, tail: 28 },
    { re: /gpt-4o|gpt-4-turbo|o1|o3|chatgpt-4/i, ctx: 128_000, out: 16_000, tail: 24 },
    { re: /gemini-2\.5-pro|gemini-1\.5-pro/i, ctx: 1_000_000, out: 16_000, tail: 32, practical: 256_000 },
    { re: /gemini-2\.5|gemini-2\.0|gemini/i, ctx: 128_000, out: 12_000, tail: 24 },
    { re: /405b|253b|235b|120b|kimi-k2|deepseek-v3|llama-4/i, ctx: 128_000, out: 12_000, tail: 24 },
    { re: /70b|72b|nemotron.*70|qwen3-72/i, ctx: 64_000, out: 8_192, tail: 20 },
    { re: /32b|40b|qwq|qwen3-30/i, ctx: 32_768, out: 8_192, tail: 18 },
    { re: /8b|7b|3b|mini|flash-lite|instant|small|tiny/i, ctx: 8_192, out: 4_096, tail: 12 },
  ];

  const DEFAULT_PROFILE = { ctx: 32_768, out: 8_192, tail: 20, practical: null };

  const COMPACTION_PREF_KEY = "hc_compaction_model";

  /**
   * Compaction models — free tiers + MiniMax / GLM (licensed keys).
   * Auto mode picks the first entry whose provider has a key (top = recommended).
   */
  const COMPACT_CANDIDATES = [
    { value: "cloud:groq:llama-3.1-8b-instant", provider: "groq", label: "Groq Llama 3.1 8B (free, fastest)", tier: "free" },
    { value: "cloud:gemini:gemini-2.0-flash-lite", provider: "gemini", label: "Gemini 2.0 Flash Lite (free)", tier: "free" },
    { value: "cloud:cerebras:llama3.1-8b", provider: "cerebras", label: "Cerebras Llama 3.1 8B (free)", tier: "free" },
    { value: "cloud:minimax:MiniMax-M2.1", provider: "minimax", label: "MiniMax M2.1 (plan)", tier: "licensed" },
    { value: "cloud:glm:GLM-4.5-air", provider: "glm", label: "GLM 4.5 Air (Coding Plan)", tier: "licensed" },
    { value: "cloud:glm:GLM-5-Turbo", provider: "glm", label: "GLM 5 Turbo (Coding Plan)", tier: "licensed" },
    { value: "cloud:minimax:MiniMax-M2.7", provider: "minimax", label: "MiniMax M2.7 (plan)", tier: "licensed" },
    { value: "cloud:groq:llama-3.3-70b-versatile", provider: "groq", label: "Groq Llama 3.3 70B (free)", tier: "free" },
    { value: "cloud:openrouter:meta-llama/llama-3.3-70b-instruct:free", provider: "openrouter", label: "OpenRouter Llama 3.3 70B (free)", tier: "free" },
    { value: "cloud:openrouter:qwen/qwen3-30b-a3b:free", provider: "openrouter", label: "OpenRouter Qwen3 30B (free)", tier: "free" },
    { value: "cloud:nvidia:meta/llama-3.1-8b-instruct", provider: "nvidia", label: "NVIDIA Llama 3.1 8B (free)", tier: "free" },
    { value: "cloud:gemini:gemini-2.0-flash", provider: "gemini", label: "Gemini 2.0 Flash (free)", tier: "free" },
    { value: "cloud:gemini:gemini-2.5-flash", provider: "gemini", label: "Gemini 2.5 Flash (free)", tier: "free" },
    { value: "cloud:glm:GLM-4.7", provider: "glm", label: "GLM 4.7 (Coding Plan)", tier: "licensed" },
    { value: "cloud:cerebras:llama-3.3-70b", provider: "cerebras", label: "Cerebras Llama 3.3 70B (free)", tier: "free" },
    { value: "cloud:samba:Meta-Llama-3.3-70B-Instruct", provider: "samba", label: "SambaNova Llama 3.3 70B (free)", tier: "free" },
  ];

  let _inflightCompact = null;

  function parseModel(val) {
    if (window._H?.parseCloudModel) return window._H.parseCloudModel(val || "");
    if (!val || !String(val).startsWith("cloud:")) return { provider: "", modelId: String(val || "") };
    const parts = String(val).split(":");
    return { provider: parts[1] || "", modelId: parts.slice(2).join(":") };
  }

  function getModelProfile(modelValue) {
    const { provider, modelId } = parseModel(modelValue);
    const hay = `${provider} ${modelId} ${modelValue || ""}`;
    for (const p of PROFILES) {
      if (p.re.test(hay)) {
        const ctx = p.practical || p.ctx;
        const usable = Math.max(4096, ctx - p.out);
        return {
          provider,
          modelId,
          modelValue: modelValue || "",
          contextTokens: ctx,
          outputReserve: p.out,
          usableTokens: usable,
          compactThreshold: Math.floor(usable * 0.72),
          verbatimTail: p.tail,
          toolResultMax: ctx >= 100_000 ? 2400 : ctx >= 32_000 ? 1600 : 900,
          label: modelId || modelValue || "default",
        };
      }
    }
    const usable = DEFAULT_PROFILE.ctx - DEFAULT_PROFILE.out;
    return {
      provider,
      modelId,
      modelValue: modelValue || "",
      contextTokens: DEFAULT_PROFILE.ctx,
      outputReserve: DEFAULT_PROFILE.out,
      usableTokens: usable,
      compactThreshold: Math.floor(usable * 0.72),
      verbatimTail: DEFAULT_PROFILE.tail,
      toolResultMax: 1200,
      label: modelId || "default",
    };
  }

  function messageChars(m) {
    if (!m) return 0;
    let n = String(m.content || "").length;
    if (m.tool_calls?.length) {
      n += JSON.stringify(m.tool_calls).length;
    }
    if (m.role === "tool") n += String(m.name || "").length + 40;
    return n;
  }

  function estimateMessagesTokens(messages) {
    if (!Array.isArray(messages) || !messages.length) return 0;
    const chars = messages.reduce((s, m) => s + messageChars(m), 0);
    return Math.max(1, Math.ceil(chars / 3.6) + messages.length * 12);
  }

  function trimToolMessage(m, maxLen) {
    if (!m || m.role !== "tool" || typeof m.content !== "string") return m;
    if (m.content.length <= maxLen) return m;
    return {
      ...m,
      content: m.content.slice(0, maxLen) + "\n…[tool output truncated for context budget]",
    };
  }

  function trimAllTools(messages, maxLen) {
    return messages.map(m => trimToolMessage(m, maxLen));
  }

  function splitSafe(messages, verbatimTail) {
    const systemMsg = messages[0]?.role === "system" ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : messages.slice();
    let tailStart = Math.max(0, rest.length - verbatimTail);
    while (tailStart > 0 && rest[tailStart]?.role === "tool") tailStart++;
    while (tailStart > 0 && rest[tailStart - 1]?.role === "assistant" &&
           Array.isArray(rest[tailStart - 1]?.tool_calls)) tailStart--;
    return {
      systemMsg,
      middle: rest.slice(0, tailStart),
      tail: rest.slice(tailStart),
    };
  }

  function extractEssentials(messages) {
    const files = new Set();
    const commands = [];
    const errors = [];
    const userGoals = [];
    const decisions = [];

    for (const m of messages) {
      if (m.role === "user" && m.content) {
        const line = String(m.content).split("\n")[0].slice(0, 240);
        if (line.length > 8) userGoals.push(line);
      }
      if (m.role === "assistant" && m.content && !m.tool_calls?.length) {
        const t = String(m.content).trim();
        if (t.length > 20 && t.length < 500) decisions.push(t.slice(0, 200));
      }
      if (m.role === "tool" || (m.role === "assistant" && m.tool_calls)) {
        const blob = typeof m.content === "string" ? m.content : JSON.stringify(m.content || "");
        const name = m.name || (m.tool_calls?.[0]?.function?.name) || "";
        if (/error|failed|exception|denied|blocked/i.test(blob)) {
          errors.push(`${name}: ${blob.slice(0, 160)}`);
        }
        try {
          const j = JSON.parse(blob);
          if (j.path) files.add(j.path);
          if (j.file) files.add(j.file);
        } catch {}
        const pathMatch = blob.match(/(?:\/[\w.-]+)+\.[a-z]{1,6}/gi);
        if (pathMatch) pathMatch.slice(0, 8).forEach(p => files.add(p));
        if (name === "write_file" || name === "patch_file" || name === "read_file") {
          try {
            const args = m.tool_calls?.[0]?.function?.arguments;
            const a = typeof args === "string" ? JSON.parse(args) : args;
            if (a?.path) files.add(a.path);
          } catch {}
        }
        if (name === "shell_run" && blob.length < 300) commands.push(blob.slice(0, 120));
      }
    }

    return {
      userGoals: userGoals.slice(-6),
      files: Array.from(files).slice(-40),
      commands: commands.slice(-8),
      errors: errors.slice(-10),
      decisions: decisions.slice(-6),
      messageCount: messages.length,
    };
  }

  function formatEssentialsBlock(essentials, ledger) {
    const parts = [];
    if (ledger) parts.push(ledger.trim());
    const e = essentials;
    if (e.userGoals.length) {
      parts.push("### User goals (recent)\n" + e.userGoals.map(g => `- ${g}`).join("\n"));
    }
    if (e.files.length) {
      parts.push("### Files touched\n" + e.files.map(f => `- ${f}`).join("\n"));
    }
    if (e.commands.length) {
      parts.push("### Shell (recent)\n" + e.commands.map(c => `- ${c}`).join("\n"));
    }
    if (e.decisions.length) {
      parts.push("### Decisions / outcomes\n" + e.decisions.map(d => `- ${d}`).join("\n"));
    }
    if (e.errors.length) {
      parts.push("### Errors to respect\n" + e.errors.map(x => `- ${x}`).join("\n"));
    }
    if (!parts.length) return ledger || "";
    const body = parts.join("\n\n");
    return ledger ? body : LEDGER_PREFIX + body;
  }

  function hasProviderKey(provider) {
    const key = window._H?.getProviderKey?.(provider);
    return !!(key && String(key).trim());
  }

  function isProviderAvailable(provider) {
    if (!hasProviderKey(provider)) return false;
    if (window.HC?.providerUsage?.isRateLimited?.(provider)) return false;
    return true;
  }

  function getCompactionPreference() {
    try {
      const raw = localStorage.getItem(COMPACTION_PREF_KEY);
      if (raw) return raw;
      const atelier = JSON.parse(localStorage.getItem("atelier") || "{}");
      return atelier.compactionModel || "auto";
    } catch {
      return "auto";
    }
  }

  function setCompactionPreference(value) {
    const v = value || "auto";
    try {
      localStorage.setItem(COMPACTION_PREF_KEY, v);
      const atelier = JSON.parse(localStorage.getItem("atelier") || "{}");
      atelier.compactionModel = v;
      localStorage.setItem("atelier", JSON.stringify(atelier));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent("hc-compaction-pref-changed", { detail: { value: v } }));
    } catch {}
  }

  function findCandidate(value) {
    return COMPACT_CANDIDATES.find(c => c.value === value) || null;
  }

  /** User setting or auto — first available candidate with a key. */
  function pickCompactModel() {
    const pref = getCompactionPreference();
    if (pref && pref !== "auto") {
      const chosen = findCandidate(pref);
      if (chosen && isProviderAvailable(chosen.provider)) return chosen;
    }
    for (const cand of COMPACT_CANDIDATES) {
      if (isProviderAvailable(cand.provider)) return cand;
    }
    return null;
  }

  function getResolvedCompactionLabel() {
    const pref = getCompactionPreference();
    const picked = pickCompactModel();
    if (!picked) return "Compaction: no key";
    if (pref === "auto") return `Compact: Auto → ${picked.label.split(" (")[0]}`;
    return `Compact: ${picked.label.split(" (")[0]}`;
  }

  async function llmCompact(middleMessages, essentials, opts) {
    const H = window._H;
    if (!H?.agentTurnOpenAI) return null;

    const picked = pickCompactModel();
    if (!picked) {
      console.info("[ContextCompactor] No free compaction provider with API key — using deterministic ledger only.");
      return null;
    }

    opts.onStatus?.(`Compacting via ${picked.label}…`);
    const { provider, modelId } = parseModel(picked.value);
    const transcript = middleMessages
      .map(m => {
        const role = m.role || "?";
        let body = typeof m.content === "string" ? m.content : JSON.stringify(m.content || "");
        if (m.tool_calls?.length) {
          body += "\n[tool_calls: " + m.tool_calls.map(t => t.function?.name).filter(Boolean).join(", ") + "]";
        }
        return `${role.toUpperCase()}: ${body.slice(0, 1200)}`;
      })
      .join("\n\n---\n\n")
      .slice(0, 24_000);

    const prompt = `You are a context compactor for a coding agent. Summarize the conversation segment below into a dense WORKING_STATE the model can use to continue without re-reading full history.

REQUIRED sections (use these exact headings):
## Goal
## Completed
## Files & modules
## Key decisions
## Open issues / next steps
## Do not repeat

Rules:
- Preserve exact file paths, function names, error messages, and user constraints.
- Include what was tried and what failed.
- Omit pleasantries and duplicate tool noise.
- Under 900 words.

Deterministic pre-scan:
${JSON.stringify(essentials, null, 0).slice(0, 4000)}

Transcript:
${transcript}`;

    const messages = [
      { role: "system", content: "Output only the WORKING_STATE markdown. No preamble." },
      { role: "user", content: prompt },
    ];

    try {
      const turn = await H.agentTurnOpenAI({
        provider,
        model: modelId,
        messages,
        tools: [],
        temperature: 0.1,
        signal: opts.signal,
      });
      const text = (turn?.content || "").trim();
      if (text.length < 80) return null;
      return LEDGER_PREFIX + text;
    } catch (e) {
      console.warn("[ContextCompactor] LLM compact failed:", e);
      return null;
    }
  }

  function shouldCompact(messages, profile, ledger) {
    const est = estimateMessagesTokens(messages);
    const threshold = profile.compactThreshold;
    if (est <= threshold) return false;
    if (ledger && est < threshold * 1.12) return false;
    return true;
  }

  async function compact(messages, opts = {}) {
    const profile = opts.profile || getModelProfile(opts.modelValue);
    const ledgerIn = opts.ledger || "";

    if (!shouldCompact(messages, profile, ledgerIn)) {
      return {
        messages: trimAllTools(messages, profile.toolResultMax),
        ledger: ledgerIn,
        compacted: false,
      };
    }

    const verbatimTail = opts.verbatimTail ?? profile.verbatimTail;
    const { systemMsg, middle, tail } = splitSafe(messages, verbatimTail);

    if (!middle.length) {
      return { messages: trimAllTools(messages, profile.toolResultMax), ledger: ledgerIn, compacted: false };
    }

    const essentials = extractEssentials(messages);
    let ledger = ledgerIn;

    opts.onStatus?.("Compacting context for model…");
    const llmLedger = await llmCompact(middle, essentials, opts);
    if (llmLedger) ledger = llmLedger;
    else ledger = formatEssentialsBlock(essentials, ledger) || formatEssentialsBlock(essentials, "");
    opts.onLedgerUpdate?.(ledger);

    const sysContent = (systemMsg?.content || "") +
      (ledger ? `\n\n${ledger}` : "");

    const compactUser = {
      role: "user",
      content:
        "[Context note: Earlier turns were compacted to fit the model window. " +
        "Continue from WORKING_STATE above and the recent messages below — do not restart the task.]",
    };

    const out = [];
    if (systemMsg || sysContent) {
      out.push({ role: "system", content: sysContent.trim() });
    } else if (ledger) {
      out.push({ role: "system", content: ledger });
    }
    out.push(compactUser);
    out.push(...trimAllTools(tail, profile.toolResultMax));

    return { messages: out, ledger, compacted: true, tokens: estimateMessagesTokens(out) };
  }

  async function prepareForApi(messages, opts = {}) {
    if (!Array.isArray(messages) || !messages.length) return messages;

    const profile = getModelProfile(opts.modelValue);
    let trimmed = trimAllTools(messages, profile.toolResultMax);
    const est = estimateMessagesTokens(trimmed);

    if (est <= profile.compactThreshold) {
      return trimmed;
    }

    const key = opts.cacheKey || "default";
    if (_inflightCompact?.key === key) return _inflightCompact.promise;

    const promise = compact(trimmed, { ...opts, profile }).then(r => r.messages);
    _inflightCompact = { key, promise };
    try {
      return await promise;
    } finally {
      if (_inflightCompact?.promise === promise) _inflightCompact = null;
    }
  }

  function usageRatio(messages, modelValue) {
    const profile = getModelProfile(modelValue);
    const est = estimateMessagesTokens(messages);
    return {
      estimated: est,
      max: profile.usableTokens,
      threshold: profile.compactThreshold,
      pct: Math.min(100, Math.round((est / profile.usableTokens) * 100)),
      profile,
    };
  }

  window.HC = window.HC || {};
  HC.contextCompactor = {
    getModelProfile,
    estimateMessagesTokens,
    extractEssentials,
    formatEssentialsBlock,
    shouldCompact,
    compact,
    prepareForApi,
    usageRatio,
    trimAllTools,
    pickCompactModel,
    getCompactionPreference,
    setCompactionPreference,
    getResolvedCompactionLabel,
    findCandidate,
    hasProviderKey,
    isProviderAvailable,
    COMPACT_CANDIDATES,
    COMPACTION_PREF_KEY,
  };
})();
