/**
 * Moonshot (Kimi) API — multi-base failover for OpenAI-compatible and Anthropic routes.
 */

export const MOONSHOT_API_BASES = [
  'https://api.kimi.com/v1',
  'https://api.kimi.ai/v1',
  'https://api.moonshot.ai/v1',
  'https://api.moonshot.cn/v1',
];

/** Anthropic-compatible bases for Kimi for Code (`sk-ki…` keys). */
export const KIMI_ANTHROPIC_BASES = [
  'https://api.moonshot.ai/anthropic',
  'https://api.moonshot.cn/anthropic',
  'https://api.kimi.com/anthropic',
  'https://api.kimi.ai/anthropic',
];

export function isKimiCodeKey(key) {
  return typeof key === 'string' && key.trim().toLowerCase().startsWith('sk-ki');
}

/**
 * @param {object} deps
 * @param {typeof fetch} deps.cloudFetch
 * @param {(provider: string, status: number, body: string, retryAfter?: string) => string} deps.cloudHttpError
 */
export function createMoonshotApi(deps) {
  const { cloudFetch, cloudHttpError } = deps;
  const _moonshotApiBaseByKey = new Map();

  function orderedMoonshotBases(key) {
    const trimmed = (key || '').trim();
    const cached = _moonshotApiBaseByKey.get(trimmed);
    if (cached) return [cached, ...MOONSHOT_API_BASES.filter((b) => b !== cached)];
    return MOONSHOT_API_BASES;
  }

  async function fetchMoonshotApi(path, key, initFactory) {
    let lastError = null;
    for (const base of orderedMoonshotBases(key)) {
      const root = base.replace(/\/$/, '');
      const fullUrl = `${root}${path.startsWith('/') ? path : `/${path}`}`;
      try {
        const init = typeof initFactory === 'function' ? initFactory(base) : {};
        const res = await cloudFetch('moonshot', fullUrl, { referrerPolicy: 'no-referrer', ...init });
        if (res.ok) {
          _moonshotApiBaseByKey.set((key || '').trim(), base);
          return { res, baseUrl: base };
        }
        const txt = await res.text().catch(() => '');
        const enriched = `${cloudHttpError('moonshot', res.status, txt, res.headers.get('Retry-After'))}\nEndpoint tried: ${fullUrl}`;
        lastError = new Error(enriched);
        if (res.status !== 401 && res.status !== 403 && res.status !== 404) return Promise.reject(lastError);
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        lastError = err;
      }
    }
    throw lastError || new Error('Moonshot (Kimi) request failed.');
  }

  async function fetchKimiAnthropic(path, key, initFactory) {
    let lastError = null;
    for (const base of KIMI_ANTHROPIC_BASES) {
      const fullUrl = `${base}${path}`;
      try {
        const init = typeof initFactory === 'function' ? initFactory(base) : {};
        const res = await cloudFetch('moonshot', fullUrl, { referrerPolicy: 'no-referrer', ...init });
        if (res.ok) return { res, baseUrl: base };
        const txt = await res.text().catch(() => '');
        const enriched = `${cloudHttpError('moonshot', res.status, txt, res.headers.get('Retry-After'))}\nEndpoint tried: ${fullUrl}`;
        lastError = new Error(enriched);
        if (res.status !== 401 && res.status !== 403 && res.status !== 404) return Promise.reject(lastError);
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        lastError = err;
      }
    }
    throw lastError || new Error('Moonshot (Kimi) request failed.');
  }

  return {
    MOONSHOT_API_BASES,
    KIMI_ANTHROPIC_BASES,
    isKimiCodeKey,
    orderedMoonshotBases,
    fetchMoonshotApi,
    fetchKimiAnthropic,
  };
}
