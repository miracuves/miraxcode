/**
 * Real-time LLM API key usage tracking (local counters + provider APIs/headers).
 * Loaded before app.js — exposes window.HC.providerUsage
 */
(function () {
  "use strict";

  const STORAGE_KEY = "hc_provider_usage_v1";
  const EVENT_NAME = "hc-usage-updated";

  /** @type {Record<string, { label: string, dashboard?: string, windows: Array<{ id: string, label: string, unit: string, ms?: number, sync?: string }> }>} */
  const PROVIDER_CONFIG = {
    openrouter: {
      label: "OpenRouter",
      dashboard: "https://openrouter.ai/activity",
      windows: [
        { id: "daily", label: "Daily", unit: "requests", sync: "openrouter" },
        { id: "rate", label: "Burst", unit: "req/window", sync: "openrouter" },
        { id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 },
      ],
    },
    minimax: {
      label: "MiniMax",
      dashboard: "https://platform.minimax.io/user-center/basic-information",
      windows: [
        { id: "five_hour", label: "5-hour", unit: "requests", ms: 5 * 3600_000 },
        { id: "weekly", label: "Weekly", unit: "requests", ms: 7 * 24 * 3600_000 },
        { id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 },
      ],
    },
    glm: {
      label: "GLM (Z.AI)",
      dashboard: "https://z.ai/manage-apikey/quota-detail",
      windows: [
        { id: "five_hour", label: "5-hour", unit: "requests", ms: 5 * 3600_000 },
        { id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 },
      ],
    },
    nvidia: {
      label: "NVIDIA NIM",
      dashboard: "https://build.nvidia.com/",
      maxPerMinute: 30,
      windows: [
        { id: "per_minute", label: "Per minute", unit: "requests", ms: 60_000, cap: 30 },
      ],
    },
    groq: {
      label: "Groq",
      dashboard: "https://console.groq.com/settings/usage",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
    gemini: {
      label: "Gemini",
      dashboard: "https://aistudio.google.com/",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
    openai: {
      label: "OpenAI",
      dashboard: "https://platform.openai.com/usage",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
    anthropic: {
      label: "Anthropic",
      dashboard: "https://console.anthropic.com/settings/plans",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
    moonshot: {
      label: "Moonshot (Kimi)",
      dashboard: "https://platform.kimi.ai/",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
    deepseek: {
      label: "DeepSeek",
      dashboard: "https://platform.deepseek.com/",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
    mistral: {
      label: "Mistral",
      dashboard: "https://console.mistral.ai/",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
    cerebras: {
      label: "Cerebras",
      dashboard: "https://cloud.cerebras.ai/",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
    samba: {
      label: "SambaNova",
      dashboard: "https://cloud.sambanova.ai/",
      windows: [{ id: "per_minute", label: "This minute", unit: "requests", ms: 60_000 }],
    },
  };

  /** @type {Record<string, any>} */
  let state = loadState();
  let refreshTimer = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {}
  }

  function ensureProvider(provider) {
    if (!state[provider]) {
      state[provider] = {
        windows: {},
        requestLog: [],
        lastRequestAt: 0,
        lastSyncAt: 0,
        lastError: null,
        totalRequests: 0,
        totalTokens: 0,
      };
    }
    return state[provider];
  }

  function pruneRequestLog(p, now) {
    const cfg = PROVIDER_CONFIG[p];
    if (!cfg) return;
    const maxMs = Math.max(
      7 * 24 * 3600_000,
      ...cfg.windows.map((w) => w.ms || 0).filter(Boolean)
    );
    const cutoff = now - maxMs;
    p.requestLog = (p.requestLog || []).filter((t) => t >= cutoff);
  }

  function countInWindow(p, ms, now) {
    const cutoff = now - ms;
    return (p.requestLog || []).filter((t) => t >= cutoff).length;
  }

  function setWindow(provider, windowId, patch) {
    const p = ensureProvider(provider);
    p.windows[windowId] = { ...(p.windows[windowId] || {}), ...patch, updatedAt: Date.now() };
    saveState();
  }

  function parseIntervalMs(interval) {
    if (!interval || typeof interval !== "string") return null;
    const m = interval.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hour|hours|d|day|days)$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u.startsWith("s")) return n * 1000;
    if (u.startsWith("m")) return n * 60_000;
    if (u.startsWith("h")) return n * 3600_000;
    if (u.startsWith("d")) return n * 86400_000;
    return null;
  }

  function ingestHeaders(provider, headers) {
    if (!headers || typeof headers.get !== "function") return;
    const h = (name) => headers.get(name) || headers.get(name.toLowerCase());

    const pairs = [
      ["x-ratelimit-limit-requests", "x-ratelimit-remaining-requests", "x-ratelimit-reset-requests", "per_minute"],
      ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "per_minute"],
      ["x-ratelimit-limit-tokens", "x-ratelimit-remaining-tokens", "x-ratelimit-reset-tokens", "tokens_per_minute"],
    ];

    for (const [limitH, remainH, resetH, wid] of pairs) {
      const limit = parseNum(h(limitH));
      const remaining = parseNum(h(remainH));
      const reset = parseReset(h(resetH));
      if (limit != null || remaining != null) {
        const used = limit != null && remaining != null ? Math.max(0, limit - remaining) : null;
        setWindow(provider, wid, {
          limit,
          used,
          remaining,
          resetsAt: reset,
          source: "headers",
        });
      }
    }

    const retryAfter = h("retry-after");
    if (retryAfter) {
      const sec = parseNum(retryAfter);
      if (sec != null) {
        setWindow(provider, "retry_after", {
          resetsAt: Date.now() + sec * 1000,
          label: `Retry in ${sec}s`,
          source: "headers",
        });
      }
    }
  }

  function parseNum(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function parseReset(v) {
    if (!v) return null;
    const n = Number(v);
    if (Number.isFinite(n)) {
      return n > 1e12 ? n : n > 1e9 ? n * 1000 : Date.now() + n * 1000;
    }
    const d = Date.parse(v);
    return Number.isFinite(d) ? d : null;
  }

  function getPerMinuteCap(provider) {
    const cfg = PROVIDER_CONFIG[provider];
    if (!cfg) return null;
    if (cfg.maxPerMinute != null) return cfg.maxPerMinute;
    const w = cfg.windows?.find((x) => x.id === "per_minute");
    return w?.cap ?? null;
  }

  function requestsInLastMinute(provider, now = Date.now()) {
    const p = ensureProvider(provider);
    return countInWindow(p, 60_000, now);
  }

  function canProceed(provider) {
    const cap = getPerMinuteCap(provider);
    if (cap == null) return true;
    return requestsInLastMinute(provider) < cap;
  }

  async function waitForCapacity(provider, maxWaitMs = 90_000) {
    const cap = getPerMinuteCap(provider);
    if (cap == null) return;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (canProceed(provider)) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(
      `${PROVIDER_CONFIG[provider]?.label || provider}: capped at ${cap} requests/min (NIM limit 40 RPM — using 30). Wait and retry.`
    );
  }

  function recordRequest(provider, meta = {}) {
    const cfg = PROVIDER_CONFIG[provider];
    if (!cfg) return;
    const now = Date.now();
    const p = ensureProvider(provider);
    p.lastRequestAt = now;
    p.totalRequests = (p.totalRequests || 0) + 1;
    if (meta.tokens) p.totalTokens = (p.totalTokens || 0) + meta.tokens;
    p.requestLog = p.requestLog || [];
    p.requestLog.push(now);
    pruneRequestLog(p, now);

    for (const w of cfg.windows) {
      if (!w.ms) continue;
      const used = countInWindow(p, w.ms, now);
      const cap = w.cap ?? (w.id === "per_minute" ? getPerMinuteCap(provider) : null);
      const prev = p.windows[w.id] || {};
      setWindow(provider, w.id, {
        used,
        limit: cap ?? prev.limit ?? null,
        remaining: (cap ?? prev.limit) != null ? Math.max(0, (cap ?? prev.limit) - used) : null,
        resetsAt: now + w.ms,
        source: prev.source === "api" ? "api+local" : "local",
        unit: w.unit,
      });
    }
    saveState();
  }

  function handleResponse(provider, res) {
    ingestHeaders(provider, res.headers);
    if (res.status === 429) {
      const retry = res.headers?.get?.("retry-after");
      setWindow(provider, "rate_limited", {
        used: null,
        limit: null,
        remaining: 0,
        resetsAt: retry ? Date.now() + parseNum(retry) * 1000 : Date.now() + 60_000,
        source: "429",
        label: "Rate limited",
      });
      saveState();
    }
  }

  async function fetchCloud(provider, url, init) {
    await waitForCapacity(provider);
    const res = await fetch(url, init);
    handleResponse(provider, res);
    return res;
  }

  async function syncOpenRouter(key) {
    const urls = [
      "https://openrouter.ai/api/v1/auth/key",
      "https://openrouter.ai/api/v1/key",
    ];
    let lastErr = null;
    for (const url of urls) {
      try {
        let status = 0;
        let body = "";
        if (window.HC?.isTauri && window.HC?.invoke) {
          const probe = await window.HC.invoke("provider_http_probe_bearer", {
            url,
            bearer: key,
            timeoutMs: 10_000,
          });
          status = probe?.status || 0;
          body = probe?.body_preview || "";
          if (!probe?.ok) {
            lastErr = probe?.error || `HTTP ${status}`;
            continue;
          }
        } else {
          const r = await fetch(url, {
            method: "GET",
            referrerPolicy: "no-referrer",
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout?.(10_000) || undefined,
          });
          status = r.status;
          body = await r.text().catch(() => "");
          if (!r.ok) {
            lastErr = `HTTP ${status}`;
            continue;
          }
        }
        const j = JSON.parse(body || "{}");
        const d = j.data || j;
        const p = ensureProvider("openrouter");
        p.lastSyncAt = Date.now();
        p.lastError = null;

        if (d.limit != null || d.limit_remaining != null) {
          const limit = d.limit;
          const remaining = d.limit_remaining;
          const used =
            limit != null && remaining != null ? Math.max(0, limit - remaining) : d.usage_daily ?? null;
          setWindow("openrouter", "daily", {
            limit,
            used: used ?? d.usage_daily ?? null,
            remaining,
            resetsAt: d.limit_reset ? Date.parse(d.limit_reset) : null,
            source: "api",
            unit: "requests",
          });
        } else if (d.usage_daily != null) {
          setWindow("openrouter", "daily", {
            used: d.usage_daily,
            limit: null,
            remaining: null,
            source: "api",
            unit: "requests",
            note: "Usage reported; limit not exposed for this key",
          });
        }

        if (d.rate_limit) {
          const rl = d.rate_limit;
          const intervalMs = parseIntervalMs(rl.interval);
          setWindow("openrouter", "rate", {
            limit: rl.requests > 0 ? rl.requests : null,
            used: null,
            remaining: rl.requests > 0 ? rl.requests : null,
            resetsAt: intervalMs ? Date.now() + intervalMs : null,
            source: "api",
            unit: `req / ${rl.interval || "window"}`,
            note: rl.note || null,
          });
        }

        if (d.is_free_tier != null) {
          p.isFreeTier = !!d.is_free_tier;
        }
        saveState();
        return { ok: true };
      } catch (e) {
        lastErr = e?.message || String(e);
      }
    }
    const p = ensureProvider("openrouter");
    p.lastError = lastErr;
    p.lastSyncAt = Date.now();
    saveState();
    return { ok: false, error: lastErr };
  }

  async function syncProvider(provider, getKey) {
    const key = (typeof getKey === "function" ? getKey() : getKey || "").trim();
    if (!key) return { ok: false, error: "No API key" };

    if (provider === "openrouter") return syncOpenRouter(key);

    const p = ensureProvider(provider);
    p.lastSyncAt = Date.now();
    p.lastError = null;
    const cfg = PROVIDER_CONFIG[provider];
    if (cfg) {
      const now = Date.now();
      pruneRequestLog(p, now);
      for (const w of cfg.windows) {
        if (!w.ms) continue;
        const used = countInWindow(p, w.ms, now);
        setWindow(provider, w.id, {
          used,
          limit: p.windows[w.id]?.limit ?? null,
          remaining: p.windows[w.id]?.limit != null ? Math.max(0, p.windows[w.id].limit - used) : null,
          resetsAt: now + w.ms,
          source: "local",
        });
      }
    }
    saveState();
    return { ok: true, note: "Tracked locally from app requests" };
  }

  function formatAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 8) return "just now";
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  }

  function formatResetsAt(ts) {
    if (!ts) return "";
    const sec = Math.max(0, Math.ceil((ts - Date.now()) / 1000));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.ceil(sec / 60)}m`;
    if (sec < 86400) return `${Math.ceil(sec / 3600)}h`;
    return `${Math.ceil(sec / 86400)}d`;
  }

  function pct(used, limit) {
    if (limit == null || limit <= 0 || used == null) return null;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function renderUsageHtml(provider) {
    const cfg = PROVIDER_CONFIG[provider];
    const p = state[provider];
    if (!cfg) return "";
    if (!p || !p.lastRequestAt) {
      return `<div class="api-usage-empty">No requests yet — usage updates when you chat.</div>`;
    }

    const lines = [];
    for (const w of cfg.windows) {
      const data = p.windows[w.id];
      if (!data) continue;
      const used = data.used;
      const limit = data.limit;
      const remaining = data.remaining;
      const pcent = pct(used, limit);
      const bar =
        pcent != null
          ? `<span class="api-usage-bar"><span class="api-usage-fill" style="width:${pcent}%"></span></span>`
          : `<span class="api-usage-bar api-usage-bar--indeterminate"><span class="api-usage-fill"></span></span>`;

      let value = "";
      if (limit != null && used != null) value = `${used} / ${limit} ${w.unit}`;
      else if (used != null) value = `${used} ${w.unit} (this window)`;
      else if (remaining != null) value = `${remaining} left`;
      else if (data.note) value = data.note;
      else value = "—";

      const reset = data.resetsAt ? ` · resets ${formatResetsAt(data.resetsAt)}` : "";
      const src = data.source ? ` <span class="api-usage-src">${data.source}</span>` : "";
      const warn = pcent != null && pcent >= 85 ? " api-usage-line--warn" : "";

      lines.push(
        `<div class="api-usage-line${warn}">` +
          `<span class="api-usage-label">${w.label}</span>` +
          `${bar}` +
          `<span class="api-usage-val">${escapeHtml(value)}${reset}${src}</span>` +
        `</div>`
      );
    }

    const limited = p.windows.rate_limited;
    if (limited) {
      lines.push(
        `<div class="api-usage-line api-usage-line--err">` +
          `<span class="api-usage-label">Status</span>` +
          `<span class="api-usage-val">Rate limited — wait ${formatResetsAt(limited.resetsAt)}</span>` +
        `</div>`
      );
    }

    const meta = [];
    if (p.totalRequests) meta.push(`${p.totalRequests} req total`);
    if (p.lastSyncAt) meta.push(`synced ${formatAgo(p.lastSyncAt)}`);
    if (p.lastError) meta.push(`sync: ${p.lastError}`);

    return (
      (lines.length ? lines.join("") : `<div class="api-usage-empty">Local tracking active.</div>`) +
      (meta.length ? `<div class="api-usage-meta">${escapeHtml(meta.join(" · "))}</div>` : "")
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPanel(el, provider) {
    if (!el) return;
    el.dataset.provider = provider;
    el.innerHTML = renderUsageHtml(provider);
  }

  function attachToField(fieldEl, provider, getKey) {
    if (!fieldEl) return;
    let panel = fieldEl.querySelector(".api-usage-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "api-usage-panel";
      fieldEl.appendChild(panel);
    }
    renderPanel(panel, provider);
    panel._provider = provider;
    panel._getKey = getKey;
  }

  function refreshAllPanels(getKeyForProvider) {
    document.querySelectorAll(".api-usage-panel").forEach((panel) => {
      const provider = panel._provider || panel.dataset.provider;
      if (!provider) return;
      renderPanel(panel, provider);
    });
    const syncTargets = ["openrouter", "minimax", "glm", "nvidia"];
    for (const id of syncTargets) {
      const key = getKeyForProvider?.(id);
      if (key) void syncProvider(id, key);
    }
  }

  function startAutoRefresh(getKeyForProvider, intervalMs = 8000) {
    stopAutoRefresh();
    refreshTimer = setInterval(() => refreshAllPanels(getKeyForProvider), intervalMs);
  }

  function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function getSummary(provider) {
    const p = state[provider];
    const cfg = PROVIDER_CONFIG[provider];
    if (!p || !cfg) return null;
    const parts = [];
    for (const w of cfg.windows) {
      const d = p.windows[w.id];
      if (!d || d.used == null) continue;
      if (d.limit != null) parts.push(`${w.label}: ${d.used}/${d.limit}`);
      else parts.push(`${w.label}: ${d.used}`);
    }
    return parts.length ? parts.join(" · ") : null;
  }

  function isRateLimited(provider) {
    const rl = state[provider]?.windows?.rate_limited;
    if (rl && rl.resetsAt && rl.resetsAt > Date.now()) return true;
    const cap = getPerMinuteCap(provider);
    if (cap != null && requestsInLastMinute(provider) >= cap) return true;
    return false;
  }

  window.HC = window.HC || {};
  HC.providerUsage = {
    PROVIDER_CONFIG,
    fetchCloud,
    recordRequest,
    handleResponse,
    syncProvider,
    renderPanel,
    attachToField,
    refreshAllPanels,
    startAutoRefresh,
    stopAutoRefresh,
    getSummary,
    isRateLimited,
    canProceed,
    waitForCapacity,
    getPerMinuteCap,
    getState: () => state,
    EVENT_NAME,
  };
})();
