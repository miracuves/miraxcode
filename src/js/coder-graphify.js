/**
 * Graphify integration for Coder — https://graphify.net/
 * Auto-builds graphify-out/ via `graphify update` (AST, no LLM) when missing.
 */
(function () {
  "use strict";

  const GRAPH_DIR = "graphify-out";
  const REPORT_MAX = 7000;
  const QUERY_BUDGET = 1800;
  const BUILD_TIMEOUT_MS = 300_000;

  let _ensureInflight = null;
  const _reportCache = new Map();

  function outDir(projectRoot) {
    const root = String(projectRoot || "").replace(/\/+$/, "");
    return root ? `${root}/${GRAPH_DIR}` : GRAPH_DIR;
  }

  function graphJsonPath(projectRoot) {
    return `${outDir(projectRoot)}/graph.json`;
  }

  function reportPath(projectRoot) {
    return `${outDir(projectRoot)}/GRAPH_REPORT.md`;
  }

  async function fileExists(path) {
    if (!path || !HC?.invoke) return false;
    try {
      const r = await HC.invoke("shell_run", {
        command: "sh",
        args: ["-c", `test -f '${String(path).replace(/'/g, "'\\''")}' && echo yes`],
        cwd: null,
      });
      return (r?.stdout || "").includes("yes");
    } catch {
      return false;
    }
  }

  async function readText(path, maxChars = REPORT_MAX) {
    if (!path || !HC?.invoke) return "";
    try {
      const text = await HC.invoke("fs_read_file", { path });
      const s = String(text || "");
      return s.length > maxChars ? s.slice(0, maxChars) + "\n…[truncated]" : s;
    } catch {
      return "";
    }
  }

  async function hasGraph(projectRoot) {
    return fileExists(graphJsonPath(projectRoot));
  }

  async function runShell(cwd, shellCmd, timeoutMs = 120_000) {
    if (!HC?.invoke) throw new Error("Shell not available");
    const r = await HC.invoke("shell_run", {
      command: "sh",
      args: ["-lc", shellCmd],
      cwd: cwd || null,
    });
    const out = [r?.stdout, r?.stderr].filter(Boolean).join("\n").trim();
    const code = r?.code ?? r?.exit_code;
    if (code !== 0 && code != null) {
      throw new Error(out || `Shell failed: ${shellCmd.slice(0, 80)}`);
    }
    return out;
  }

  async function buildGraph(projectRoot, onStatus) {
    const root = String(projectRoot || "").replace(/\/+$/, "");
    if (!root) return false;
    onStatus?.("Building Graphify map (AST)…");
    const t0 = Date.now();
    try {
      await runShell(root, "graphify update .", BUILD_TIMEOUT_MS);
      onStatus?.("Graphify ready");
      _reportCache.delete(root);
      return await hasGraph(root);
    } catch (e) {
      console.warn("[CoderGraphify] build failed:", e);
      onStatus?.("Graphify build failed");
      return false;
    } finally {
      if (Date.now() - t0 > 5000) onStatus?.("");
    }
  }

  async function ensureGraph(projectRoot, onStatus, { force = false } = {}) {
    const root = String(projectRoot || "").replace(/\/+$/, "");
    if (!root) return false;
    if (!force && (await hasGraph(root))) return true;
    if (_ensureInflight) return _ensureInflight;
    _ensureInflight = buildGraph(root, onStatus).finally(() => {
      _ensureInflight = null;
    });
    return _ensureInflight;
  }

  async function loadReportExcerpt(projectRoot) {
    const root = String(projectRoot || "").replace(/\/+$/, "");
    if (!root) return "";
    if (_reportCache.has(root)) return _reportCache.get(root);
    const path = reportPath(root);
    if (!(await fileExists(path))) return "";
    const text = await readText(path, REPORT_MAX);
    _reportCache.set(root, text);
    return text;
  }

  async function queryGraph(projectRoot, question, budget = QUERY_BUDGET) {
    const root = String(projectRoot || "").replace(/\/+$/, "");
    const gPath = graphJsonPath(root);
    if (!(await fileExists(gPath))) {
      return { ok: false, error: "No graph.json — run graphify first" };
    }
    const q = String(question || "").trim().slice(0, 500);
    if (!q) return { ok: false, error: "question required" };
    try {
      const esc = (s) => s.replace(/'/g, "'\\''");
      const out = await runShell(
        root,
        `graphify query '${esc(q)}' --graph '${esc(gPath)}' --budget ${budget}`
      );
      return { ok: true, text: out };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function contextForTask(projectRoot, task, onStatus) {
    const root = String(projectRoot || "").replace(/\/+$/, "");
    if (!root) return "";
    await ensureGraph(root, onStatus);
    const parts = [];
    const report = await loadReportExcerpt(root);
    if (report) {
      parts.push(
        "Graphify project map (graphify-out/GRAPH_REPORT.md excerpt — prefer this over blind grep for architecture):\n" +
          report
      );
    }
    const q = String(task || "").trim().slice(0, 200);
    if (q && (await hasGraph(root))) {
      onStatus?.("Querying Graphify…");
      const qr = await queryGraph(root, q);
      if (qr.ok && qr.text) {
        parts.push("Graphify query for current task:\n" + qr.text.slice(0, QUERY_BUDGET + 200));
      }
      onStatus?.("");
    }
    return parts.join("\n\n");
  }

  function formatPromptBlock(projectRoot, graphContext) {
    if (!graphContext) return "";
    return (
      "GRAPHIFY (https://graphify.net/) — use graphify-out/ before exploring raw files for structure, god nodes, or cross-file links. " +
      "Tools: graphify_query, graphify_report. recall_facts should prefer graphify when available.\n\n" +
      graphContext +
      "\n"
    );
  }

  window.HC = window.HC || {};
  HC.coderGraphify = {
    outDir,
    graphJsonPath,
    reportPath,
    hasGraph,
    ensureGraph,
    buildGraph,
    loadReportExcerpt,
    queryGraph,
    contextForTask,
    formatPromptBlock,
  };
})();
