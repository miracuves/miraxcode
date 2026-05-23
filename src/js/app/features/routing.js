import { safeHost } from '../core/utils.js';

/**
 * Auto-router heuristics + web/research search tools (Tavily, Google CSE, Wikipedia, PubMed).
 */
export function createRoutingApi(deps) {
  const {
    tavilyKeyEl,
    googleKeyEl,
    googleCxEl,
    rewriterEl,
    privacyLocalEl,
    nvidiaKeyEl,
    autoRouterEl,
    backendSyncTokenEl,
    makeSignal,
    backendAuthHeaders,
    getBackendAuthRequired,
    getBackendFetchProxyAvailable,
    addToRAG,
  } = deps;

  const ROUTE_DEFS = {
    dell: { backend: 'dell', useSearch: false, label: 'Local', icon: '⌂', cls: '' },
    dellSearch: { backend: 'dell', useSearch: true, label: 'Local + web', icon: '⌂', cls: 'search' },
    dellPubmed: { backend: 'dell', useSearch: 'pubmed', label: 'Local + PubMed', icon: '⌂', cls: 'search' },
    nvidia: { backend: 'nvidia', useSearch: false, label: 'NVIDIA cloud', icon: '☁', cls: 'cloud' },
    nvidiaSearch: { backend: 'nvidia', useSearch: true, label: 'NVIDIA + web', icon: '☁', cls: 'cloud search' },
  };

  let routeOverride = null;

  function clearRouteOverride() {
    routeOverride = null;
  }

  function setRouteOverride(route) {
    routeOverride = route;
  }

  function getRouteOverride() {
    return routeOverride;
  }

  function canUseCloud() {
    if (privacyLocalEl.checked) return false;
    return !!(nvidiaKeyEl.value || '').trim();
  }

  function canUseSearch() {
    return !!(tavilyKeyEl.value || '').trim() || !!(googleKeyEl.value || '').trim();
  }

  function classifyMessage(text, hasAttachments) {
    const t = (text || '').toLowerCase();
    const hasCodeBlock = /```/.test(text || '');
    const codeWords = /\b(function|class|const |let |var |refactor|debug|stack ?trace|exception|null pointer|segfault|compile|typescript|python|node\.js|react|next\.js|tailwind|sql|regex|api endpoint|docker|kubernetes)\b/.test(t);
    const recencyWords = /\b(today|yesterday|tonight|this week|latest|current(ly)?|right now|just (released|announced|launched)|news|breaking|202[5-9]|recent(ly)?|update[ds]?)\b/.test(t);
    const newsWords = /\b(who won|score|election|stock price|weather|forecast|exchange rate|trending)\b/.test(t);
    const factWords = /\b(when (is|was|did|will)|what year|how (old|tall|big|much) is|capital of|president of|ceo of|population of|distance (from|to))\b/.test(t);
    const medicalWords = /\b(clinical|trial|placebo|cohort|meta-?analysis|pubmed|peer[- ]?reviewed|mg\/kg|in vitro|in vivo|systematic review|patient(s)?|diagnos(is|ed)|symptom(s)?|treatment|therapy|drug|medication|dose|dosage|side effect|prognosis|pathology|biomarker|gene expression)\b/.test(t);
    const reasoningWords = /\b(prove|proof|derivation|step[- ]by[- ]step|reason about|think through|theorem|integral|derivative)\b/.test(t);

    if (hasCodeBlock || codeWords) return { route: 'dell', reason: 'code-related' };
    if (medicalWords) return { route: 'dellPubmed', reason: 'medical/scientific' };
    if (recencyWords || newsWords || factWords) {
      const cloudOk = canUseCloud();
      return {
        route: cloudOk ? 'nvidiaSearch' : 'dellSearch',
        reason: cloudOk ? 'needs current info' : 'needs current info (local-only mode)',
      };
    }
    if (reasoningWords && canUseCloud()) return { route: 'nvidia', reason: 'reasoning-heavy' };
    return { route: 'dell', reason: 'general (default)' };
  }

  function currentRoute(text, hasAttachments) {
    if (!autoRouterEl?.checked) return null;
    if (routeOverride) {
      const def = ROUTE_DEFS[routeOverride.route];
      if (privacyLocalEl.checked && def?.backend === 'nvidia') {
        routeOverride = null;
        return { route: 'dell', reason: 'local-only mode', manual: false };
      }
      return routeOverride;
    }
    const c = classifyMessage(text, hasAttachments);
    return { ...c, manual: false };
  }

  async function wikipediaSearch(query, limit = 3) {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${limit}&utf8=1`;
      const r = await fetch(searchUrl, { referrerPolicy: 'no-referrer' });
      if (!r.ok) return [];
      const data = await r.json();
      const titles = (data.query?.search || []).map((s) => s.title);
      if (!titles.length) return [];
      const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(titles.join('|'))}&format=json&origin=*`;
      const e = await fetch(extractUrl, { referrerPolicy: 'no-referrer' });
      const ed = await e.json();
      const pages = Object.values(ed.query?.pages || {});
      return pages
        .map((p) => ({
          title: p.title,
          snippet: (p.extract || '').slice(0, 400),
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent((p.title || '').replace(/ /g, '_'))}`,
        }))
        .filter((x) => x.snippet);
    } catch {
      return [];
    }
  }

  let _cachedTz = '';

  async function getCurrentDateString() {
    if (!_cachedTz) {
      _cachedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `Today is ${dateStr}. Current time: ${timeStr} (${_cachedTz}).`;
  }

  async function tavilySearch(query, limit = 5) {
    const key = (tavilyKeyEl.value || '').trim();
    if (!key) return null;
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query,
          search_depth: 'basic',
          include_answer: true,
          max_results: limit,
        }),
        signal: makeSignal(12000),
      });
      if (!r.ok) return null;
      const data = await r.json();
      return {
        answer: data.answer || '',
        results: (data.results || []).map((it) => ({
          title: it.title || '',
          snippet: (it.content || '').slice(0, 400),
          url: it.url || '',
          score: it.score ?? null,
        })),
      };
    } catch {
      return null;
    }
  }

  async function googleSearch(query, limit = 5) {
    const key = googleKeyEl.value.trim();
    const cx = googleCxEl.value.trim();
    if (!key || !cx) return null;
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${limit}`;
      const r = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!r.ok) return null;
      const data = await r.json();
      return (data.items || []).map((it) => ({
        title: it.title,
        snippet: it.snippet || '',
        url: it.link,
      }));
    } catch {
      return null;
    }
  }

  function isSafeExternalUrl(raw) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username !== '' || parsed.password !== '') return false;
    const h = parsed.hostname.toLowerCase();
    if (h === 'localhost' || h === '0.0.0.0') return false;
    if (/^127\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^192\.168\./.test(h)) return false;
    if (/^169\.254\./.test(h)) return false;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
    if (h === 'metadata.google.internal' || h === 'metadata.goog') return false;
    if (h === '::1' || h === '[::1]' || h.startsWith('[::1')) return false;
    if (h.startsWith('[fe80:') || h.startsWith('[fe80::')) return false;
    if (/^\[f[cd][0-9a-f:/]/i.test(h)) return false;
    if (/^::ffff:127\./i.test(h)) return false;
    return true;
  }

  const isAllowedFetchUrl = isSafeExternalUrl;

  async function fetchUrl(url) {
    if (!isSafeExternalUrl(url)) return null;
    const stripForAgent = (text) =>
      String(text || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);

    async function viaServerProxy() {
      try {
        const r = await fetch('/api/backend/fetch-url', {
          method: 'POST',
          referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json', ...backendAuthHeaders() },
          body: JSON.stringify({ url }),
          signal: makeSignal(12000),
        });
        if (!r.ok) return null;
        const j = await r.json().catch(() => null);
        if (j && j.ok && typeof j.text === 'string') return j.text;
        return null;
      } catch {
        return null;
      }
    }

    const backendFetchProxyAvailable = getBackendFetchProxyAvailable();
    const backendAuthRequired = getBackendAuthRequired();

    if (backendFetchProxyAvailable) {
      const hasTok = !!(backendSyncTokenEl?.value || '').trim();
      if (backendAuthRequired && hasTok) {
        const proxied = await viaServerProxy();
        if (proxied != null) return proxied;
        return null;
      }
      if (!backendAuthRequired) {
        const proxied = await viaServerProxy();
        if (proxied != null) return proxied;
      }
      if (backendAuthRequired && !hasTok) {
        console.warn(
          '[fetch_url] Server uses a bearer token — set Backend sync token so fetches use the hardened proxy (blocks rebinding to private IPs).'
        );
        return null;
      }
    }

    try {
      const r = await fetch(url, {
        referrerPolicy: 'no-referrer',
        signal: makeSignal(10000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      return stripForAgent(text);
    } catch {
      return null;
    }
  }

  const fetchUrlContent = fetchUrl;

  function extractUrls(text) {
    const re = /https?:\/\/[^\s)<>"']+/g;
    return (text.match(re) || []).slice(0, 3);
  }

  async function pubmedSearch(query, limit = 5) {
    try {
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=${limit}&sort=CITED+desc`;
      const r = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!r.ok) return [];
      const data = await r.json();
      const results = (data.resultList?.result || [])
        .map((p) => ({
          title: p.title || '',
          authors: p.authorString || '',
          journal: p.journalTitle || p.bookOrReportDetails?.publisher || '',
          year: p.pubYear || '',
          abstract: (p.abstractText || '').slice(0, 500),
          pmid: p.pmid || '',
          doi: p.doi || '',
          source: p.source || '',
          citations: p.citedByCount ?? null,
          isReview: p.pubTypeList?.pubType?.some?.((t) => /review/i.test(t)) || false,
          url: p.pmid
            ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`
            : p.doi
              ? `https://doi.org/${p.doi}`
              : `https://europepmc.org/article/${p.source || 'MED'}/${p.id || ''}`,
        }))
        .filter((x) => x.title && x.abstract);
      return results;
    } catch {
      return [];
    }
  }

  async function rewriteForSearch(userText) {
    const rewriter = (rewriterEl?.value || '').trim();
    if (!rewriter) return null;
    const host = safeHost();
    const prompt =
      `You are a search query rewriter. Convert the user's message into a concise keyword search query suitable for a search engine or research database (PubMed, Wikipedia, Google). Rules:
- Return ONLY the query text. No quotes, no explanation, no prefix.
- Keep it short (3–10 keywords).
- Drop filler words ("what do you think about", "can you tell me", "please").
- Keep proper nouns, drug names, gene names, acronyms, years exactly as written.
- Do not add information the user did not provide.

User message:
${userText}

Search query:`;
    try {
      const r = await fetch(`${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: rewriter,
          prompt,
          stream: false,
          keep_alive: -1,
          options: { temperature: 0.2, num_predict: 60 },
        }),
        signal: makeSignal(8000),
      });
      if (!r.ok) return null;
      const j = await r.json();
      let q = (j.response || '').trim();
      q = q.replace(/^["'`]+|["'`]+$/g, '');
      q = q.replace(/^(search query:|query:)\s*/i, '');
      q = q.split(/\r?\n/)[0].trim();
      if (!q || q.length < 2) return null;
      if (q.length > 200) q = q.slice(0, 200);
      return q;
    } catch {
      return null;
    }
  }

  const rewriteQuery = rewriteForSearch;

  async function runAgentTools(agent, userText, searchQuery = null) {
    if (!agent || !agent.tools?.length) return null;
    const q = (searchQuery && searchQuery.trim()) || userText;
    const pieces = [];
    if (agent.tools.includes('web_search')) {
      const tav = await tavilySearch(q);
      if (tav && (tav.results.length || tav.answer)) {
        const tavParts = [];
        if (tav.answer) tavParts.push(tav.answer);
        if (tav.results.length) {
          tavParts.push(tav.results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n'));
          tav.results.forEach((r) => addToRAG(r.title, r.snippet, `tavily:${r.url}`));
          if (tav.answer) addToRAG('Tavily synthesized answer', tav.answer, `tavily:answer:${q.slice(0, 60)}`);
        }
        pieces.push(tavParts.join('\n\n'));
      } else {
        const results = await googleSearch(q);
        if (results && results.length) {
          results.forEach((r) => addToRAG(r.title, r.snippet, `google:${r.url}`));
          pieces.push(results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n'));
        } else if (!agent.tools.includes('wikipedia')) {
          const wiki = await wikipediaSearch(q);
          if (wiki.length) {
            wiki.forEach((r) => addToRAG(r.title, r.snippet, `wiki:${r.url}`));
            pieces.push(wiki.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n'));
          }
        }
      }
    }
    if (agent.tools.includes('wikipedia')) {
      const wiki = await wikipediaSearch(q);
      if (wiki.length) {
        wiki.forEach((r) => addToRAG(r.title, r.snippet, `wiki:${r.url}`));
        pieces.push(wiki.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n'));
      }
    }
    if (agent.tools.includes('fetch_url')) {
      const urls = extractUrls(userText);
      for (const u of urls) {
        const content = await fetchUrl(u);
        if (content) {
          addToRAG(u, content, `fetch:${u}`);
          pieces.push(`Page (${u}):\n${content}`);
        }
      }
    }
    if (agent.tools.includes('pubmed')) {
      const papers = await pubmedSearch(q);
      if (papers.length) {
        papers.forEach((p) =>
          addToRAG(p.title, `${p.authors} (${p.year}). ${p.abstract}`, `pubmed:${p.pmid || p.doi || p.url}`)
        );
        pieces.push(
          papers
            .map(
              (p, i) =>
                `${i + 1}. ${p.title} (${p.year}${p.pmid ? `, PMID:${p.pmid}` : ''}): ${p.abstract}`
            )
            .join('\n\n')
        );
      }
    }
    if (!pieces.length) return null;
    return `Sources:\n${pieces.join('\n\n')}`;
  }

  return {
    ROUTE_DEFS,
    currentRoute,
    classifyMessage,
    canUseCloud,
    canUseSearch,
    clearRouteOverride,
    setRouteOverride,
    getRouteOverride,
    tavilySearch,
    googleSearch,
    wikipediaSearch,
    pubmedSearch,
    rewriteForSearch,
    rewriteQuery,
    getCurrentDateString,
    isSafeExternalUrl,
    isAllowedFetchUrl,
    fetchUrl,
    fetchUrlContent,
    extractUrls,
    runAgentTools,
  };
}
