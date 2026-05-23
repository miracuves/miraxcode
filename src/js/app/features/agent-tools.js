/**
 * Agent tool registry, provider tool schemas, MCP bridge, and Pyodide loader.
 */

export const AGENT_MAX_ITERATIONS = 8;
export const AGENT_TOOL_TIMEOUT_MS = 20000;

/**
 * @param {{
 *   tavilySearch: (query: string, limit?: number) => Promise<any>,
 *   googleSearch: (query: string, limit?: number) => Promise<any>,
 *   wikipediaSearch: (query: string, limit?: number) => Promise<any[]>,
 *   pubmedSearch: (query: string, limit?: number) => Promise<any[]>,
 *   fetchUrl: (url: string) => Promise<string|null>,
 *   addToRAG: (title: string, text: string, source: string) => void,
 *   memAdd: (key: string, value: string) => any,
 *   memRecall: (query: string, limit?: number) => any[],
 *   collectMcpToolDefinitions: () => any[],
 *   getMcpToolServerMap: () => Record<string, { url: string, rawName: string }>,
 *   callMcpTool: (url: string, name: string, args: object) => Promise<any>,
 * }} deps
 */
export function createAgentToolsApi(deps) {
  const {
    tavilySearch,
    googleSearch,
    wikipediaSearch,
    pubmedSearch,
    fetchUrl,
    addToRAG,
    memAdd,
    memRecall,
    collectMcpToolDefinitions,
    getMcpToolServerMap,
    callMcpTool,
  } = deps;

  const AGENT_TOOLS = {
    web_search: {
      description: "Live web search. Use for current events, prices, versions, anything that may have changed.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Concise search query (3-10 keywords)." } },
        required: ["query"]
      },
      statusLabel: a => `Searching the web: ${(a.query || "").slice(0, 60)}`,
      async execute({ query }) {
        if (!query) return { error: "query is required" };
        const tav = await tavilySearch(query);
        if (tav && (tav.results.length || tav.answer)) {
          tav.results.forEach(r => addToRAG(r.title, r.snippet, `tavily:${r.url}`));
          return {
            answer: tav.answer || null,
            results: tav.results.map(r => ({ title: r.title, snippet: r.snippet, url: r.url }))
          };
        }
        const goog = await googleSearch(query);
        if (goog && goog.length) {
          goog.forEach(r => addToRAG(r.title, r.snippet, `google:${r.url}`));
          return { results: goog.map(r => ({ title: r.title, snippet: r.snippet, url: r.url })) };
        }
        const wiki = await wikipediaSearch(query);
        if (wiki.length) {
          wiki.forEach(r => addToRAG(r.title, r.snippet, `wiki:${r.url}`));
          return { results: wiki.map(r => ({ title: r.title, snippet: r.snippet, url: r.url })), note: "Wikipedia fallback (no Tavily/Google key set)." };
        }
        return { results: [], note: "No results." };
      }
    },
    wikipedia: {
      description: "Wikipedia lookup. Use for definitions and historical/established knowledge.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Topic to look up." } },
        required: ["query"]
      },
      statusLabel: a => `Checking Wikipedia: ${(a.query || "").slice(0, 60)}`,
      async execute({ query }) {
        if (!query) return { error: "query is required" };
        const wiki = await wikipediaSearch(query, 3);
        wiki.forEach(r => addToRAG(r.title, r.snippet, `wiki:${r.url}`));
        return { results: wiki };
      }
    },
    fetch_url: {
      description: "Fetch a public URL and return up to 3000 chars of readable text. Blocks private IPs.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute http(s) URL." } },
        required: ["url"]
      },
      statusLabel: a => `Reading page: ${(a.url || "").slice(0, 60)}`,
      async execute({ url }) {
        if (!url) return { error: "url is required" };
        const text = await fetchUrl(url);
        if (!text) return { error: "Could not fetch (timeout, blocked private IP, or non-text page)." };
        addToRAG(url, text, `fetch:${url}`);
        return { url, text };
      }
    },
    pubmed_search: {
      description: "PubMed / Europe PMC search. Peer-reviewed medical papers with PMID/DOI.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query — drug names, gene names, conditions, etc." },
          limit: { type: "integer", description: "Max results (default 5).", default: 5 }
        },
        required: ["query"]
      },
      statusLabel: a => `Searching PubMed: ${(a.query || "").slice(0, 60)}`,
      async execute({ query, limit }) {
        if (!query) return { error: "query is required" };
        const papers = await pubmedSearch(query, Math.min(10, Math.max(1, limit || 5)));
        papers.forEach(p => addToRAG(p.title, `${p.authors} (${p.year}). ${p.abstract}`, `pubmed:${p.pmid || p.doi || p.url}`));
        return { papers };
      }
    },
    remember_fact: {
      description: "Save a fact to cross-session memory. Call silently for any preference, project, person, deadline. Use stable keys (favorite_animal, employer, location).",
      parameters: {
        type: "object",
        properties: {
          key:   { type: "string", description: "Short label for the fact (e.g. 'preferred_language', 'home_city', 'project_alpha_deadline')." },
          value: { type: "string", description: "The fact itself, in natural language." }
        },
        required: ["key", "value"]
      },
      statusLabel: a => `Saving to memory: ${(a.key || "").slice(0, 50)}`,
      async execute({ key, value }) {
        return memAdd(key, value);
      }
    },
    recall_facts: {
      description: "Search long-term memory. Call before saying 'unknown' if the topic might be saved. Pass keywords, not the full question.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Keywords to search memory for. Empty string returns most recent facts." } }
      },
      statusLabel: a => `Recalling memory: ${(a.query || "(recent)").slice(0, 50)}`,
      async execute({ query }) {
        const facts = memRecall(query || "");
        return { facts: facts.map(f => ({ key: f.key, value: f.value, saved_at: new Date(f.ts).toISOString() })) };
      }
    },
    current_datetime: {
      description: "Current date, time, timezone. Use for 'today', 'now', scheduling.",
      parameters: { type: "object", properties: {} },
      statusLabel: () => "Reading current time",
      async execute() {
        const now = new Date();
        return {
          iso: now.toISOString(),
          local: now.toString(),
          unix_seconds: Math.floor(now.getTime() / 1000),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          weekday: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()]
        };
      }
    },
    calculate: {
      description: "Evaluate math. Supports +-*/%**(), Math.sqrt/sin/cos/log/PI. Use for any arithmetic.",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "Math expression, e.g. '(3.14 * 2**10) / 7' or 'Math.sqrt(2)'." } },
        required: ["expression"]
      },
      statusLabel: a => `Calculating: ${(a.expression || "").slice(0, 60)}`,
      async execute({ expression }) {
        if (!expression) return { error: "expression is required" };
        let cleaned = expression;
        for (let i = 0; i < 5; i++) {
          const next = cleaned.replace(/Math\.(?:PI|E|sqrt|cbrt|abs|floor|ceil|round|min|max|pow|exp|log|log2|log10|sin|cos|tan|asin|acos|atan|atan2)\s*\([^()]*\)/g, "0");
          if (next === cleaned) break;
          cleaned = next;
        }
        if (!/^[\s\d+\-*/%().,]+$/.test(cleaned)) {
          return { error: "expression contains disallowed characters" };
        }
        try {
          // eslint-disable-next-line no-new-func
          const result = Function('"use strict"; return (' + expression + ')')();
          if (typeof result !== "number" || !Number.isFinite(result)) return { error: "result is not a finite number" };
          return { expression, result };
        } catch (e) {
          return { error: String(e?.message || e) };
        }
      }
    },
    execute_python: {
      description: "Run Python (Pyodide). Globals persist across calls. Files saved to /output/ auto-download.\nPre-installed: python-docx, openpyxl, reportlab, pandas, numpy, matplotlib.\nWord: from docx import Document; doc=Document(); doc.add_heading(t); doc.add_paragraph(p); doc.save('/output/x.docx').\nExcel: from openpyxl import Workbook; wb=Workbook(); ws=wb.active; ws.append(row); wb.save('/output/x.xlsx').\nPDF (use platypus, not Canvas.drawString for reports): from reportlab.platypus import SimpleDocTemplate,Table,TableStyle,Paragraph; from reportlab.lib.pagesizes import letter; from reportlab.lib.styles import getSampleStyleSheet; SimpleDocTemplate('/output/x.pdf',pagesize=letter).build([...]).\nNever paste this code in chat — call the tool.",
      parameters: {
        type: "object",
        properties: { code: { type: "string", description: "Python source. Stdout is captured. Files written to /output/<name> are downloaded automatically." } },
        required: ["code"]
      },
      statusLabel: a => `Running Python: ${(a.code || "").split("\n")[0].slice(0, 60)}`,
      async execute({ code }) {
        if (!code) return { error: "code is required" };
        try {
          const py = await getPyodide();
          py.runPython(`
import sys, io as _io
_stdout = _io.StringIO()
_stderr = _io.StringIO()
sys.stdout = _stdout
sys.stderr = _stderr
`);
          let runError = null;
          try {
            await py.runPythonAsync(code);
          } catch (e) {
            runError = String(e?.message || e).split("\n").slice(-12).join("\n");
          }
          const stdout = py.runPython("_stdout.getvalue()") || "";
          const stderr = py.runPython("_stderr.getvalue()") || "";
          py.runPython("sys.stdout = sys.__stdout__\nsys.stderr = sys.__stderr__");
          const files = [];
          try {
            const names = py.FS.readdir("/output").filter(n => n !== "." && n !== "..");
            for (const name of names) {
              const path = "/output/" + name;
              const data = py.FS.readFile(path);
              const blob = new Blob([data]);
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = name;
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 8000);
              files.push({ filename: name, bytes: data.length });
              try { py.FS.unlink(path); } catch {}
            }
          } catch {}
          return {
            stdout: stdout.slice(0, 4000),
            stderr: stderr.slice(0, 2000),
            error: runError,
            files,
            note: files.length
              ? `${files.length} file(s) downloaded to the user's computer: ${files.map(f => f.filename).join(", ")}`
              : "No files written. To export a document for the user, write to /output/<filename>."
          };
        } catch (e) {
          return { error: "Python runtime failed to start: " + String(e?.message || e) };
        }
      }
    }
  };

  let _pyodidePromise = null;
  function getPyodide() {
    if (_pyodidePromise) return _pyodidePromise;
    _pyodidePromise = (async () => {
      if (!window.loadPyodide) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
          s.onload = res;
          s.onerror = () => rej(new Error("Failed to load Pyodide CDN"));
          document.head.appendChild(s);
        });
      }
      const py = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
      await py.loadPackage(["micropip"]);
      const micropip = py.pyimport("micropip");
      try { await micropip.install(["python-docx", "openpyxl", "reportlab"]); } catch (e) { console.warn("micropip install warning:", e); }
      try { py.FS.mkdirTree("/output"); } catch {}
      return py;
    })();
    return _pyodidePromise;
  }

  function agentToolNames(agent) {
    if (!agent || !Array.isArray(agent.tools)) return [];
    const out = new Set();
    for (const t of agent.tools) {
      if (t === "memory") { out.add("remember_fact"); out.add("recall_facts"); }
      else if (t === "datetime") out.add("current_datetime");
      else if (t === "pubmed") out.add("pubmed_search");
      else if (t === "code_interpreter" || t === "python") out.add("execute_python");
      else if (AGENT_TOOLS[t]) out.add(t);
    }
    return [...out];
  }

  function buildOpenAITools(agent) {
    const builtin = agentToolNames(agent).map((name) => ({
      type: "function",
      function: {
        name,
        description: AGENT_TOOLS[name].description,
        parameters: AGENT_TOOLS[name].parameters
      }
    }));
    const mcpTools = collectMcpToolDefinitions();
    return [...builtin, ...mcpTools];
  }

  function buildOllamaTools(agent) {
    return buildOpenAITools(agent);
  }

  function buildGeminiTools(agent) {
    const builtin = agentToolNames(agent).map((name) => ({
      name,
      description: AGENT_TOOLS[name].description,
      parameters: AGENT_TOOLS[name].parameters
    }));
    const mcpDefs = collectMcpToolDefinitions().map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }));
    const all = [...builtin, ...mcpDefs];
    return all.length ? [{ functionDeclarations: all }] : [];
  }

  async function runOneTool(name, args, onStatus, tracker) {
    let t0 = performance.now();
    const mcpMap = getMcpToolServerMap();
    if (mcpMap[name]) {
      t0 = performance.now();
      const mapping = mcpMap[name];
      try {
        if (onStatus) onStatus(`Running MCP: ${name}\u2026`, "running");
        const result = await callMcpTool(mapping.url, mapping.rawName, args || {});
        if (onStatus) onStatus(`${name} \u2713`, "done");
        if (tracker) tracker.push({ name, ok: true, ms: Math.round(performance.now() - t0) });
        return typeof result === "string" ? result : JSON.stringify(result ?? { ok: true });
      } catch (e) {
        if (onStatus) onStatus(`${name} \u2717`, "failed");
        if (tracker) tracker.push({ name, ok: false, ms: Math.round(performance.now() - t0) });
        return JSON.stringify({ error: `MCP ${name}: ${e?.message || e}` });
      }
    }
    const tool = AGENT_TOOLS[name];
    t0 = performance.now();
    if (!tool) {
      if (tracker) tracker.push({ name, ok: false, ms: 0 });
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    try {
      if (onStatus) onStatus(tool.statusLabel?.(args || {}) || `Running ${name}\u2026`, "running");
      const result = await Promise.race([
        Promise.resolve(tool.execute(args || {})),
        new Promise((_, rej) => setTimeout(() => rej(new Error("tool timeout")), AGENT_TOOL_TIMEOUT_MS))
      ]);
      if (onStatus) onStatus(`${name} \u2713`, "done");
      if (tracker) tracker.push({ name, ok: true, ms: Math.round(performance.now() - t0) });
      if (tracker && name === "web_search" && result && typeof result === "object") {
        const sample = (result.results || []).map((r) => r.url || "").join(" ");
        if (sample.includes("tavily")) tracker.push({ name: "tavily", ok: true, ms: 0, derived: true });
        else if (sample.includes("google")) tracker.push({ name: "google", ok: true, ms: 0, derived: true });
        else if (sample.includes("wikipedia")) tracker.push({ name: "wikipedia", ok: true, ms: 0, derived: true });
      }
      return JSON.stringify(result ?? { ok: true });
    } catch (e) {
      if (onStatus) onStatus(`${name} \u2717`, "failed");
      if (tracker) tracker.push({ name, ok: false, ms: Math.round(performance.now() - t0) });
      return JSON.stringify({ error: String(e?.message || e) });
    }
  }

  return {
    AGENT_TOOLS,
    AGENT_MAX_ITERATIONS,
    AGENT_TOOL_TIMEOUT_MS,
    agentToolNames,
    buildOpenAITools,
    buildGeminiTools,
    buildOllamaTools,
    runOneTool,
    getPyodide,
  };
}
