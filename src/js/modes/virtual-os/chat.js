/**
 * Virtual OS chat + Agent OS loop + fence parsing (Wave 12).
 */
import { esc } from './utils.js';

const AGENT_OS_TOOLS = [
  { name: "fs_list",    params: '{"path":"string (default /)"}',                                              desc: "List directory contents. Shows names, types, and sizes." },
  { name: "fs_read",    params: '{"path":"string","start_line":"number (opt)","end_line":"number (opt)"}',    desc: "Read file content. Use start_line/end_line to read a specific line range of a large file." },
  { name: "fs_write",   params: '{"path":"string","content":"string"}',                                       desc: "Create or fully overwrite a file." },
  { name: "fs_patch",   params: '{"path":"string","search":"string","replace":"string"}',                     desc: "Surgically edit a file — find exact text and replace it. Safer than rewriting the whole file." },
  { name: "fs_mkdir",   params: '{"path":"string"}',                                                          desc: "Create a folder (and all parent folders if needed)." },
  { name: "fs_delete",  params: '{"path":"string"}',                                                          desc: "Delete a file or folder." },
  { name: "fs_move",    params: '{"from":"string","to":"string"}',                                            desc: "Move or rename a file or folder." },
  { name: "fs_grep",    params: '{"pattern":"string","path":"string (opt, default /)"}',                      desc: "Search for a text pattern across files. Returns matches with file path and line number." },
  { name: "terminal_run", params: '{"command":"string"}',                                                     desc: "Run a shell command in the Virtual OS terminal (ls, cat, grep, find, echo, etc.)." },
  { name: "image_search", params: '{"query":"string","count":"number (1-8, default 4)"}',                    desc: "Get real topic-specific image URLs from Unsplash. Call before writing any HTML/CSS that needs photos." },
  { name: "web_search",   params: '{"query":"string"}',                                                        desc: "Search the web for design trends, UI patterns, tech docs. Call this FIRST before building any website." },
  { name: "task_done",  params: '{"summary":"string"}',                                                        desc: "Call this when the task is fully complete." },
];

export function createVoidChatApi(ctx) {
  const {
    $,
    log,
    setStatus,
    ROOT_ID,
    getActiveProject,
    setActiveFolderId,
    setFinderCollapsed,
    visibleProjectFiles,
    rebuildPaths,
    saveProject,
    renderAll,
    addFileByPath,
    guessMime,
    safeName,
    deleteItem,
    normalizeVirtualPath,
    wantsEditContext,
    shouldCreateSeparateProject,
    fmtBytes,
    uid,
    nowIso,
    chooseWorkerModel,
    callModelValue,
    callWithFailover,
    getLastWorkedModel,
    setLastWorkedModel,
    getRunAbort,
    setRunAbort,
    generate,
    termExec,
    appendTermLine,
    openTerminal,
    getTermLines,
    setTermLines,
    renderTermOutput,
    openEditorAtLine,
  } = ctx;

  let chatHistory = [];
  let chatAbort = null;
  let chatLockedModel = null;
  let _sessionChanges = [];
  let _agentWriteCount = 0;

  function agentOSSystemPrompt() {
    return `You are Virtual OS Agent OS — a coding agent with full control over a virtual filesystem.

Call tools by outputting EXACTLY this block (one per response):
<tool_call>
{"name": "TOOL_NAME", "params": {...}}
</tool_call>

AVAILABLE TOOLS:
${AGENT_OS_TOOLS.map(t => `• ${t.name}(${t.params})\n  ${t.desc}`).join("\n")}

DESIGN RESEARCH — for every website / UI task:
① Call web_search FIRST with a design query, e.g. "modern [type] website design 2024", "glassmorphism UI", "bento grid layout".
② Read the results, extract visual style, color palette, typography, and layout patterns.
③ Call image_search for topic-specific photos — never invent image URLs.
④ THEN write the files, applying what you found. No cookie-cutter hero→features→CTA templates.

RULES — READ CAREFULLY:
• ONE tool call per response. Think in one sentence, then call the tool.
• Stay focused on the task. Do NOT explore unrelated files or projects.
• Minimal exploration: list the ONE relevant folder, then act. Do not list every subdirectory before starting.
• Do NOT read a file unless you need its content for the current step.
• Prefer fs_patch for edits — only use fs_write for new files or complete rewrites.
• Use fs_grep to jump directly to code — do not read whole files just to find one function.
• Call task_done as soon as the task is complete. Do not do extra work.

CRITICAL — task_done rules:
✗ NEVER call task_done without having used fs_write or fs_patch at least once (unless the task was purely a search/read)
✗ NEVER say "I'll now write X" and then call task_done instead of writing it
✓ If you described a change, you must execute it before finishing

SPEED — avoid these time-wasting patterns:
✗ Listing /, then every subdirectory, before touching anything
✗ Reading files that are not relevant to the task
✗ Exploring other projects in the workspace
✗ Reading a file you already saw in a previous tool result`;
  }

  function parseAgentToolCall(text) {
    const m = String(text || "").match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  }

  function aosLs(path) {
    const files = visibleProjectFiles();
    const clean = String(path || "/").replace(/^\/+/, "");
    let items;
    if (!clean || clean === "/") {
      items = files.filter(f => f.parentId === ROOT_ID);
      if (!items.length) return "(empty root — no files yet)";
      return items.map(f => f.type === "folder" ? `${f.name}/` : `${f.name}  [${fmtBytes(String(f.content || "").length)}]`).sort().join("\n");
    }
    const folder = files.find(f => f.path === clean && f.type === "folder");
    if (!folder) {
      const file = files.find(f => f.path === clean && f.type === "file");
      if (file) return `${file.name}  [file · ${fmtBytes(String(file.content || "").length)}]`;
      return `Error: not found: /${clean}`;
    }
    items = files.filter(f => f.parentId === folder.id);
    if (!items.length) return "(empty folder)";
    return items.map(f => f.type === "folder" ? `${f.name}/` : `${f.name}  [${fmtBytes(String(f.content || "").length)}]`).sort().join("\n");
  }

  function aosRead(path, startLine, endLine) {
    const clean = String(path || "").replace(/^\/+/, "");
    const item = visibleProjectFiles().find(f => f.path === clean && f.type === "file");
    if (!item) return `Error: file not found: /${clean}`;
    const content = String(item.content || "");
    if (startLine == null && endLine == null) {
      if (content.length > 8000) return content.slice(0, 8000) + `\n\n[truncated — ${content.length - 8000} more bytes; use start_line/end_line to read further]`;
      return content || "(empty file)";
    }
    const lines = content.split("\n");
    const s = Math.max(0, (Number(startLine) || 1) - 1);
    const e = Math.min(lines.length, Number(endLine) || lines.length);
    return lines.slice(s, e).map((l, i) => `${s + i + 1}: ${l}`).join("\n");
  }

  function aosGrep(pattern, searchPath) {
    const files = visibleProjectFiles().filter(f => f.type === "file");
    const root = String(searchPath || "/").replace(/^\/+/, "");
    const scope = root ? files.filter(f => f.path.startsWith(root)) : files;
    const results = [];
    let re;
    try { re = new RegExp(pattern, "gi"); } catch { return `Error: invalid regex: ${pattern}`; }
    for (const file of scope) {
      const lines = String(file.content || "").split("\n");
      lines.forEach((line, i) => {
        re.lastIndex = 0;
        if (re.test(line)) results.push(`/${file.path}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    if (!results.length) return `No matches for "${pattern}"`;
    const shown = results.slice(0, 60);
    if (results.length > 60) shown.push(`… (${results.length - 60} more matches)`);
    return shown.join("\n");
  }

  async function aosPatch(path, search, replace) {
    const clean = String(path || "").replace(/^\/+/, "");
    const item = visibleProjectFiles().find(f => f.path === clean && f.type === "file");
    if (!item) return `Error: file not found: /${clean}. Use fs_read first to verify the path.`;
    let content = String(item.content || "");
    const norm = s => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    let hit = content.indexOf(search);
    if (hit === -1) {
      const nc = norm(content), ns = norm(search);
      if (nc.includes(ns)) {
        content = nc;
        hit = nc.indexOf(ns);
        search = ns;
        replace = norm(replace);
      }
    }
    if (hit === -1) {
      const preview = content.split("\n").slice(0, 12).join("\n");
      return `Error: search text not found in /${clean}.\nFile preview (first 12 lines):\n${preview}\n\nRe-read the file with fs_read and copy the exact text to patch.`;
    }
    item.content = content.slice(0, hit) + replace + content.slice(hit + search.length);
    item.updatedAt = nowIso();
    await saveProject();
    renderAll();
    const lines = replace.split("\n").length;
    return `Patched /${clean} (${lines} line${lines !== 1 ? "s" : ""} written)`;
  }

  async function aosMkdir(path) {
    const activeProject = getActiveProject();
    const clean = String(path || "").replace(/^\/+/, "");
    if (!clean) return "Error: path required";
    const parts = clean.split("/").filter(Boolean);
    let parentId = ROOT_ID;
    for (const part of parts) {
      const existing = activeProject.files.find(f => f.parentId === parentId && f.name === safeName(part) && f.type === "folder");
      if (existing) { parentId = existing.id; continue; }
      const nf = { id: uid("f"), type: "folder", parentId, name: safeName(part), createdAt: nowIso(), updatedAt: nowIso() };
      activeProject.files.push(nf);
      parentId = nf.id;
    }
    rebuildPaths();
    await saveProject();
    renderAll();
    return `Created /${clean}`;
  }

  async function aosDelete(path) {
    const clean = String(path || "").replace(/^\/+/, "");
    const item = visibleProjectFiles().find(f => f.path === clean);
    if (!item) return `Error: not found: /${clean}`;
    await deleteItem(item.id);
    return `Deleted /${clean}`;
  }

  async function aosMove(from, to) {
    const cleanFrom = String(from || "").replace(/^\/+/, "");
    const cleanTo = String(to || "").replace(/^\/+/, "");
    const item = visibleProjectFiles().find(f => f.path === cleanFrom);
    if (!item) return `Error: not found: /${cleanFrom}`;
    const toParts = cleanTo.split("/").filter(Boolean);
    const newName = toParts.pop() || item.name;
    const parentPath = toParts.join("/");
    let newParentId = ROOT_ID;
    if (parentPath) {
      const pf = visibleProjectFiles().find(f => f.path === parentPath && f.type === "folder");
      if (!pf) return `Error: destination folder not found: /${parentPath}`;
      newParentId = pf.id;
    }
    item.name = safeName(newName);
    item.parentId = newParentId;
    item.updatedAt = nowIso();
    rebuildPaths();
    await saveProject();
    renderAll();
    return `Moved /${cleanFrom} → /${cleanTo}`;
  }

  async function executeAgentTool(call) {
    const name = String(call?.name || "");
    const p = call?.params || {};
    try {
      switch (name) {
        case "fs_list":
        case "fs_ls":      return aosLs(p.path);
        case "fs_read":    return aosRead(p.path, p.start_line ?? null, p.end_line ?? null);
        case "fs_grep":    return aosGrep(p.pattern, p.path);
        case "fs_patch": {
          const r = await aosPatch(p.path, String(p.search ?? ""), String(p.replace ?? ""));
          if (!r.startsWith("Error:")) {
            _agentWriteCount++;
            const cleanPatch = String(p.path || "").replace(/^\/+/, "");
            const patchFile = visibleProjectFiles().find(f => f.type === "file" && f.path === cleanPatch);
            if (patchFile) {
              const pre = (patchFile.content || "").indexOf(String(p.replace ?? ""));
              const ln = pre >= 0 ? (patchFile.content.slice(0, pre).split("\n").length) : 1;
              _sessionChanges.push({ path: "/" + cleanPatch, action: "patched", line: ln });
            }
          }
          return r;
        }
        case "fs_mkdir": {
          const r = await aosMkdir(p.path);
          if (!r.startsWith("Error:")) _agentWriteCount++;
          return r;
        }
        case "fs_delete": {
          const r = await aosDelete(p.path);
          if (!r.startsWith("Error:")) _agentWriteCount++;
          return r;
        }
        case "fs_move": {
          const r = await aosMove(p.from, p.to);
          if (!r.startsWith("Error:")) _agentWriteCount++;
          return r;
        }
        case "fs_write": {
          const path = String(p.path || "").replace(/^\/+/, "");
          if (!path) return "Error: path required";
          addFileByPath(path, String(p.content || ""), guessMime(path));
          rebuildPaths();
          await saveProject();
          renderAll();
          _agentWriteCount++;
          _sessionChanges.push({ path: "/" + path, action: "written", line: 1 });
          return `Written /${path} (${String(p.content || "").length} bytes)`;
        }
        case "terminal_run": {
          const cmd = String(p.command || "");
          const result = termExec(cmd);
          appendTermLine(`$ ${cmd}`, "cmd");
          if (result && result !== "__clear__") appendTermLine(result, "out");
          if (result === "__clear__") { setTermLines([]); renderTermOutput(); }
          openTerminal();
          return result === "__clear__" ? "(terminal cleared)" : (result || "(no output)");
        }
        case "image_search": {
          const query = String(p.query || p.keywords || "").trim().replace(/\s+/g, ",");
          const count = Math.min(Math.max(parseInt(p.count) || 4, 1), 8);
          if (!query) return "Error: query is required (e.g. pizza,italian)";
          const sizes = [
            { w: 1600, h: 900,  label: "hero/banner" },
            { w: 800,  h: 600,  label: "card/section" },
            { w: 600,  h: 400,  label: "thumbnail" },
            { w: 1200, h: 800,  label: "feature" },
            { w: 400,  h: 400,  label: "avatar/square" },
            { w: 1400, h: 600,  label: "wide-banner" },
            { w: 800,  h: 800,  label: "square-card" },
            { w: 900,  h: 600,  label: "landscape" },
          ];
          const urls = sizes.slice(0, count).map(s =>
            `https://source.unsplash.com/${s.w}x${s.h}/?${encodeURIComponent(query)} [${s.label}]`
          );
          log(`image_search: ${count} URLs for "${query}"`, "ok");
          return `Image URLs for "${query}":\n${urls.join("\n")}\n\nUse these src values directly in <img> tags or CSS background-image.`;
        }
        case "web_search": {
          const q = String(p.query || "").trim();
          if (!q) return "Error: query is required";
          log(`web_search: "${q}"`, "run");
          try {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const parts = [];
            if (data.Answer) parts.push(`Answer: ${data.Answer}`);
            if (data.AbstractText) parts.push(`${data.Heading || q}:\n${data.AbstractText.slice(0, 500)}`);
            if (Array.isArray(data.RelatedTopics)) {
              for (const t of data.RelatedTopics.slice(0, 6)) {
                if (t.Text) parts.push(`• ${t.Text.slice(0, 200)}`);
              }
            }
            if (!parts.length) return `No instant answers for "${q}". Apply training knowledge on this topic.`;
            log(`web_search: got ${parts.length} result(s)`, "ok");
            return parts.join("\n\n");
          } catch (err) {
            return `Search unavailable (${err.message}). Apply training knowledge: glassmorphism, bento grids, neobrutalism, editorial layouts, dark mode with vibrant accents, bold variable typography.`;
          }
        }
        case "task_done":
          return "__task_done__:" + String(p.summary || "Task complete.");
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err) {
      return `Error: ${err.message || String(err)}`;
    }
  }

  async function runAgentOSLoop(task, signal) {
    const messages = [
      { role: "system", content: agentOSSystemPrompt() },
      { role: "user",   content: task },
    ];
    const MAX_ITER = 28;
    let lockedModel = null;
    let silentDoneCount = 0;
    _agentWriteCount = 0;
    log("Agent OS running…", "run");
    for (let i = 0; i < MAX_ITER; i++) {
      let response;
      if (lockedModel) {
        try {
          response = await callModelValue(lockedModel, messages, signal);
        } catch (err) {
          if (err?.name === "AbortError") throw err;
          log(`Model dropped, re-selecting…`, "warn");
          lockedModel = null;
          response = await callWithFailover("worker", chooseWorkerModel(), messages, signal);
          lockedModel = getLastWorkedModel();
        }
      } else {
        response = await callWithFailover("worker", chooseWorkerModel(), messages, signal);
        lockedModel = getLastWorkedModel();
      }
      const thinking = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
      if (thinking) log(thinking.slice(0, 220), "info");
      messages.push({ role: "assistant", content: response });
      const call = parseAgentToolCall(response);
      if (!call) { log("Agent OS: done.", "ok"); break; }
      log(`→ ${call.name}(${JSON.stringify(call.params || {}).slice(0, 90)})`, "run");
      const result = await executeAgentTool(call);
      if (String(result).startsWith("__task_done__:")) {
        const summary = result.slice("__task_done__:".length);
        if (_agentWriteCount === 0 && silentDoneCount < 2) {
          silentDoneCount++;
          log(`Agent tried to finish without making any changes (attempt ${silentDoneCount}/2). Pushing back…`, "warn");
          messages.push({
            role: "user",
            content: `You called task_done but you have not made any file changes yet. Do not stop — proceed to actually write or patch the files now. Use fs_write or fs_patch to make the changes you described.`,
          });
          continue;
        }
        log(`✓ ${summary}`, "ok");
        if (_agentWriteCount === 0) log("Warning: task completed with no file changes.", "warn");
        break;
      }
      const preview = String(result).slice(0, 600);
      log(`← ${preview}${result.length > 600 ? "…" : ""}`, "ok");
      messages.push({ role: "user", content: `[TOOL RESULT: ${call.name}]\n${result}` });
    }
    renderAll();
    await saveProject();
  }

  async function generateAgentOS(taskOverride = null) {
    const task = taskOverride ?? $("voidPrompt")?.value?.trim() ?? "";
    if (!task) { log("Describe a task for Agent OS.", "warn"); return; }
    const prevAbort = getRunAbort();
    if (prevAbort) prevAbort.abort();
    const abort = new AbortController();
    setRunAbort(abort);
    setStatus("Agent OS", "running");
    const stopBtn = $("voidStopBtn");
    if (stopBtn) { stopBtn.classList.add("running"); stopBtn.disabled = false; }
    try {
      await runAgentOSLoop(task, abort.signal);
      setStatus("Done", "done");
    } catch (err) {
      if (err?.name === "AbortError") log("Agent OS stopped.", "warn");
      else { setStatus("Error", "error"); log(err.message || String(err), "error"); }
    } finally {
      if (stopBtn) { stopBtn.classList.remove("running"); stopBtn.disabled = true; }
      setRunAbort(null);
      setTimeout(() => setStatus("Idle"), 2500);
    }
  }

  function extractFiles(text) {
    const src = text || "";
    const out = [];
    const seen = new Set();

    function add(rawPath, content) {
      const p = normalizeVirtualPath(String(rawPath || "").trim());
      if (!p || !p.includes(".") || /[\n\r]/.test(p) || seen.has(p)) return;
      seen.add(p);
      out.push({ path: p, content: String(content || "").replace(/^\n+|\n+$/g, "") });
    }

    const t1 = /```([A-Za-z0-9_+\-.]*)[ \t]+([^\n`\r]{3,120}?\.[A-Za-z0-9_\-]{1,12})[ \t]*\r?\n([\s\S]*?)```/g;
    let m;
    while ((m = t1.exec(src)) !== null) add(m[2], m[3]);
    if (out.length) return out;

    const t2 = /```[A-Za-z0-9_+\-. ]*\r?\n[ \t]*(?:\/\/[ \t]*|<!--[ \t]*|#[ \t]*|\/\*[ \t]*)?([^\n`\r]{3,120}?\.[A-Za-z0-9_\-]{1,12})(?:[ \t]*-->|[ \t]*\*\/)?[ \t]*\r?\n([\s\S]*?)```/g;
    while ((m = t2.exec(src)) !== null) {
      const cand = m[1].trim();
      if (/^[\w.\-/]+$/.test(cand)) add(cand, m[2]);
    }
    if (out.length) return out;

    const t3 = /(?:^|\r?\n)[ \t]*(?:#{1,6}[ \t]+|\*{1,2}|`)?([^\n`\r*#]{2,120}?\.[A-Za-z0-9_\-]{1,12})(?:`|\*{0,2})?[ \t]*\r?\n[ \t]*```[^\n]*\r?\n([\s\S]*?)```/gm;
    while ((m = t3.exec(src)) !== null) {
      const cand = m[1].trim();
      if (/^[\w.\-/ ]+$/.test(cand) && !/\s{2,}/.test(cand)) add(cand, m[2]);
    }
    if (out.length) return out;

    const extMap = {
      html: "index.html", htm: "index.html", css: "styles.css", scss: "styles.scss",
      js: "app.js", javascript: "app.js", mjs: "app.mjs",
      ts: "app.ts", typescript: "app.ts", jsx: "App.jsx", tsx: "App.tsx",
      py: "main.py", python: "main.py", rb: "main.rb",
      json: "config.json", yaml: "config.yaml", yml: "config.yaml",
      sh: "run.sh", bash: "run.sh", sql: "schema.sql",
      xml: "config.xml", md: "README.md", txt: "notes.txt",
    };
    const counter = {};
    const t4 = /```([A-Za-z0-9_+\-.]*)\r?\n([\s\S]*?)```/g;
    while ((m = t4.exec(src)) !== null) {
      if (!m[2].trim()) continue;
      const lang = (m[1] || "").toLowerCase();
      const base = extMap[lang] || (lang ? `file.${lang}` : "file.txt");
      counter[base] = (counter[base] || 0) + 1;
      const name = counter[base] === 1 ? base : base.replace(/(\.[^.]+)$/, `${counter[base] - 1}$1`);
      add(name, m[2]);
    }

    return out;
  }

  function dumpFilesForRewrite(files) {
    return (files || []).map(f => {
      const content = String(f.content || "");
      return `\`\`\`${(f.path.split(".").pop() || "txt").toLowerCase()} ${f.path}\n${content}\n\`\`\``;
    }).join("\n\n").slice(0, 65000);
  }

  function needsDeploymentRewrite(files, userPrompt) {
    const prompt = String(userPrompt || "").toLowerCase();
    const visualRequest = /\b(website|site|webpage|web page|landing|portfolio|store|shop|gallery|clone|design|hero|image|images|photo|photos|restaurant|hotel|travel|product|brand)\b/.test(prompt);
    const combined = (files || []).map(f => `${f.path}\n${f.content || ""}`).join("\n").toLowerCase();
    const manualOrMissing = /(?:add|replace|insert|upload|provide)\s+(?:your\s+|own\s+)?(?:image|photo|asset|logo|content|api\s*key|key)|(?:todo|fixme)\b|lorem ipsum|your[-_\s]*(?:image|photo|logo|api|key)|image[-_\s]*url|placeholder\.(?:com|svg)|placehold\.co|via\.placeholder|dummy\s+(?:image|photo)|blank\s+image|replace\s+this|add\s+real\s+images/.test(combined);
    const unresolvedImage = /<img[^>]+src=["']\s*(?:#|about:blank|image|images?\/|assets?\/[^"']*\.(?:png|jpe?g|webp|gif|svg))["']|background(?:-image)?:\s*url\(["']?(?:#|image|images?\/|assets?\/[^)"']*\.(?:png|jpe?g|webp|gif|svg))/i.test(combined);
    const imageUrls = combined.match(/https:\/\/[^"'()\s>]+\.(?:png|jpe?g|webp|gif|svg)(?:\?[^"'()\s>]*)?|https:\/\/images\.unsplash\.com\/[^"'()\s>]+/g) || [];
    const tooFewImages = visualRequest && imageUrls.length < 3;
    const basicDesignSignals = visualRequest && /\b(simple|basic)\s+(website|page|site)|<main>\s*<h1|body\s*{\s*(?:font-family|margin)/.test(combined) && combined.length < 9000;
    return manualOrMissing || (visualRequest && unresolvedImage) || tooFewImages || basicDesignSignals;
  }

  function inferProjectName(prompt) {
    const clean = String(prompt).split(/[.!?\n]/)[0]
      .replace(/^(build|make|create|generate|add|edit|update|fix|change|code|write|design|develop|give me|show me)\s+/i, "")
      .replace(/\b(a|an|the|full|fully|simple|basic|complete|working|new|good|great|modern|nice|clean|beautiful|professional|responsive)\b\s*/gi, "")
      .replace(/\s*(html\s*)?(website|web\s*app|webpage|web\s*page|site|page|app|application)\s*$/i, "")
      .replace(/\s+(selling|using|with|for|in|on|by)\s*$/i, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join("-")
      .toLowerCase();
    return safeName(clean || "project");
  }

  function rootFolderExists(name) {
    return visibleProjectFiles().some(item =>
      item.type === "folder" && item.parentId === ROOT_ID && item.name === name
    );
  }

  function uniqueRootFolderName(baseName) {
    const base = safeName(baseName || "project");
    if (!rootFolderExists(base)) return base;
    let i = 2;
    while (rootFolderExists(`${base}-${i}`)) i += 1;
    return `${base}-${i}`;
  }

  function materializeGeneratedFiles(files, userPrompt) {
    if (!files?.length) return { count: 0, folderName: "" };

    const editMode = wantsEditContext(userPrompt);
    const incomingFiles = editMode ? files.map(f => {
      if (String(f.path || "").includes("/")) return f;
      const matches = visibleProjectFiles().filter(item => item.type === "file" && item.name === f.path);
      return matches.length === 1 ? { ...f, path: matches[0].path } : f;
    }) : files;

    const topFolders = [...new Set(incomingFiles
      .map(f => f.path.split("/").filter(Boolean))
      .filter(parts => parts.length > 1)
      .map(parts => parts[0]))];
    const forceNewRoot = shouldCreateSeparateProject(userPrompt);

    let folderName;
    let normalizedFiles;

    if (topFolders.length === 1 && incomingFiles.every(f => f.path.split("/").filter(Boolean)[0] === topFolders[0])) {
      folderName = topFolders[0];
      normalizedFiles = incomingFiles;
    } else {
      folderName = inferProjectName(userPrompt);
      normalizedFiles = incomingFiles.map(f => {
        const parts = f.path.split("/");
        const hasModelRoot = topFolders.includes(parts[0]);
        const relativeParts = hasModelRoot ? parts.slice(1) : parts;
        const relative = relativeParts.filter(Boolean).join("/") || safeName(parts[parts.length - 1] || "file.txt");
        return { ...f, path: `${folderName}/${relative}` };
      });
    }

    if (forceNewRoot) {
      const originalRoot = folderName;
      folderName = uniqueRootFolderName(folderName || inferProjectName(userPrompt));
      normalizedFiles = normalizedFiles.map(f => {
        const parts = f.path.split("/").filter(Boolean);
        const relative = parts[0] === originalRoot ? parts.slice(1).join("/") : parts.join("/");
        return { ...f, path: `${folderName}/${relative || "index.html"}` };
      });
    }

    for (const f of normalizedFiles) {
      addFileByPath(f.path, f.content, guessMime(f.path));
    }
    rebuildPaths();

    const rootFolderItem = visibleProjectFiles().find(
      item => item.type === "folder" && item.name === folderName && item.parentId === ROOT_ID
    );
    if (rootFolderItem) {
      setActiveFolderId(rootFolderItem.id);
      setFinderCollapsed(false);
    }

    return { count: normalizedFiles.length, folderName };
  }

  function voidChatSystemPrompt() {
    let tree = "(empty — no files yet)";
    if (getActiveProject()) {
      const files = visibleProjectFiles();
      const paths = files.map(f => (f.type === "folder" ? "d " : "f ") + f.path);
      tree = paths.slice(0, 80).join("\n");
      if (paths.length > 80) tree += `\n… +${paths.length - 80} more`;
    }
    return `You are MiraXCode Coder — a fast, silent, action-first coding agent inside Virtual OS.

CARDINAL RULES (never break):
- No preamble. Never say "I'll help", "Sure!", "Let me", "Of course". Just act.
- Think silently. Show only results, not reasoning.
- After finishing, reply in 1-2 lines max: what you did, which files changed.
- Never dump raw file content into a reply. Use tools instead.

RESPONSE MODES — pick the right one:

1. <tool_call>{"name":"TOOL","params":{...}}</tool_call>
   For any single operation. Chain calls one at a time; wait for each result.

   FILE TOOLS:
   fs_ls(path) · fs_read(path, start_line?, end_line?) · fs_grep(pattern, path?)
   fs_patch(path, search, replace) · fs_write(path, content)
   fs_mkdir(path) · fs_delete(path) · fs_move(from, to)

   TERMINAL (full shell access):
   terminal_run(command) — run any shell command: ls, cat, grep, find, head, tail, wc, touch, cp, mv, rm, mkdir
   image_search(query, count?) — fetch real topic-specific image URLs for use in code
   web_search(query) — search the web for design trends, UI patterns, tech docs. Call FIRST before building any website.

   ⚠ DESIGN RESEARCH: before building any website or UI, call web_search("modern [type] website design 2024") to get current design trends, then call image_search for photos. Never produce generic templates.
   ⚠ PATCH RULE: always fs_read the file FIRST — copy exact text, then patch.
   ⚠ VIRTUAL FS RULE: NEVER run npm install, pip install, cargo build, brew install, or any package-manager command — the terminal is a JS simulation. Write package.json/requirements.txt instead; the user installs deps outside Virtual OS.
   ⚠ MULTI-FILE RULE: when you edit HTML, ALWAYS check if CSS and JS need updating too.
     - Added a new element? → add its CSS class too.
     - Changed a class name? → update the stylesheet.
     - Added interactivity? → update JS too.
     Never call task_done while related files are inconsistent with your changes.

2. <worker_task>detailed brief</worker_task>
   For large tasks: new multi-file projects, full page rewrites, major refactors.
   Write a complete creative brief so the worker has all context (design, colors, copy, images).

3. Plain text — ONLY for direct questions. 1-2 sentences.

DECISION:
- "fix the nav color" → fs_read CSS → fs_patch
- "add a contact form" → fs_read HTML → fs_patch HTML → fs_read CSS → fs_patch CSS
- "build a full restaurant site" → worker_task
- "run the tests" → terminal_run

Current workspace:
${tree}`;
  }

  function _toolCallLine(name, params) {
    const p = params || {};
    switch (name) {
      case "fs_ls": case "fs_list": return `ls ${p.path || "/"}`;
      case "fs_read":    return `read ${p.path}${p.start_line ? `:${p.start_line}-${p.end_line}` : ""}`;
      case "fs_patch":   return `patch ${p.path}`;
      case "fs_write":   return `write ${p.path}`;
      case "fs_grep":    return `grep "${p.pattern}" ${p.path || ""}`;
      case "fs_mkdir":   return `mkdir ${p.path}`;
      case "fs_delete":  return `rm ${p.path}`;
      case "fs_move":    return `mv ${p.from} → ${p.to}`;
      case "terminal_run": return `$ ${p.command}`;
      default:           return name;
    }
  }

  function _toolResultLine(name, result) {
    if (result.startsWith("Error:") || result.startsWith("Unknown tool")) {
      return `✗ ${result.slice(result.indexOf(":") + 1).trim().split("\n")[0].slice(0, 90)}`;
    }
    switch (name) {
      case "fs_ls": case "fs_list": {
        const n = result.trim().split("\n").filter(Boolean).length;
        return `✓ ${n} item${n !== 1 ? "s" : ""}`;
      }
      case "fs_read":    return `✓ ${result.length} chars`;
      case "fs_patch":   return `✓ ${result}`;
      case "fs_write":   return `✓ ${result}`;
      case "fs_mkdir":   return `✓ ${result}`;
      case "fs_delete":  return `✓ ${result}`;
      case "fs_move":    return `✓ ${result}`;
      case "fs_grep": {
        const n = result.trim().split("\n").filter(Boolean).length;
        return n === 0 ? "✓ no matches" : `✓ ${n} match${n !== 1 ? "es" : ""}`;
      }
      case "terminal_run": return result.startsWith("✗") ? result : `✓ ${result.split("\n")[0].slice(0, 60)}`;
      default: return result.split("\n")[0].slice(0, 80);
    }
  }

  function appendChatBubble(role, content, kind, meta = null) {
    const msgs = $("voidChatMsgs");
    if (!msgs) return null;
    msgs.querySelector(".void-typing-indicator")?.remove();
    const wrap = document.createElement("div");
    wrap.className = "void-chat-bubble void-chat-" + (kind || role);
    if (role === "user") {
      wrap.textContent = content;
    } else if (kind === "tool-call") {
      const line = meta ? _toolCallLine(meta.name, meta.params) : content.slice(0, 80);
      wrap.innerHTML = `<span class="void-chat-tool-badge">${esc(line)}</span>`;
    } else if (kind === "tool-result") {
      const line = meta ? _toolResultLine(meta.name, content) : content.split("\n")[0].slice(0, 80);
      wrap.className = "void-chat-bubble void-chat-tool";
      wrap.innerHTML = `<span class="void-chat-tool-result">${esc(line)}</span>`;
    } else if (kind === "tool") {
      const line = content.split("\n")[0].slice(0, 80);
      wrap.innerHTML = `<span class="void-chat-tool-badge">${esc(line)}</span>`;
    } else if (kind === "worker") {
      const brief = content.length > 55 ? content.slice(0, 55) + "…" : content;
      wrap.innerHTML = `<span class="void-chat-worker-badge">${esc(brief)}</span>`;
    } else {
      const html = esc(content)
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      wrap.innerHTML = html;
    }
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
  }

  function showChatTyping() {
    const msgs = $("voidChatMsgs");
    if (!msgs || msgs.querySelector(".void-typing-indicator")) return;
    const ind = document.createElement("div");
    ind.className = "void-chat-bubble void-chat-assistant void-chat-typing void-typing-indicator";
    ind.innerHTML = `<span class="void-typing-dot"></span><span class="void-typing-dot"></span><span class="void-typing-dot"></span>`;
    msgs.appendChild(ind);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function chatCallModel(messages, signal) {
    if (chatLockedModel) {
      try {
        const r = await callModelValue(chatLockedModel, messages, signal);
        setLastWorkedModel(chatLockedModel);
        return r;
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        chatLockedModel = null;
      }
    }
    const selected = $("voidChatModelSelect")?.value || chooseWorkerModel();
    const result = await callWithFailover("worker", selected, messages, signal);
    chatLockedModel = getLastWorkedModel();
    return result;
  }

  async function processChatResponse(responseText, depth = 0) {
    chatHistory.push({ role: "assistant", content: responseText });
    if (depth > 6) {
      const clean = responseText.replace(/<\/?(?:tool_call|worker_task)>/g, "").trim();
      if (clean) appendChatBubble("assistant", clean);
      return;
    }

    const tagRe = /<(tool_call|worker_task)>([\s\S]*?)<\/\1>/g;
    let lastIndex = 0;
    let match;

    while ((match = tagRe.exec(responseText)) !== null) {
      const before = responseText.slice(lastIndex, match.index).trim();
      if (before) appendChatBubble("assistant", before);

      const tagName = match[1];
      const tagContent = match[2].trim();

      if (tagName === "worker_task") {
        appendChatBubble("assistant", tagContent, "worker");
        log(`MiraXCode Coder → worker: ${tagContent.slice(0, 80)}`, "run");
        try { await generate(false, tagContent); } catch (e) { log(`Worker error: ${e.message}`, "error"); }
        appendChatBubble("assistant", "Done.");
      } else if (tagName === "tool_call") {
        let callObj;
        try { callObj = JSON.parse(tagContent); } catch (e) {}
        if (callObj) {
          appendChatBubble("assistant", tagContent, "tool-call", { name: callObj.name, params: callObj.params });
          showChatTyping();
          const result = await executeAgentTool(callObj);
          appendChatBubble("assistant", result, "tool-result", { name: callObj.name, params: callObj.params });

          if (result.startsWith("Error:") || result.startsWith("Unknown tool")) {
            chatHistory.push({ role: "user", content: `[tool_error for ${callObj.name}]\n${result}` });
            if (depth < 2) {
              const retry = await chatCallModel(
                [{ role: "system", content: voidChatSystemPrompt() }, ...chatHistory],
                chatAbort?.signal
              );
              if (retry) await processChatResponse(retry, depth + 1);
            }
            return;
          }
          chatHistory.push({ role: "user", content: `[tool_result for ${callObj.name}]\n${result}` });
          const followUp = await chatCallModel(
            [{ role: "system", content: voidChatSystemPrompt() }, ...chatHistory],
            chatAbort?.signal
          );
          if (followUp) await processChatResponse(followUp, depth + 1);
          return;
        }
      }

      lastIndex = match.index + match[0].length;
    }

    const tail = responseText.slice(lastIndex).trim();
    if (tail) appendChatBubble("assistant", tail);
  }

  function appendChangesSummary(changes) {
    if (!changes.length) return;
    const msgs = $("voidChatMsgs");
    if (!msgs) return;
    const deduped = [];
    const seen = new Set();
    for (const c of changes) {
      const key = c.path + ":" + c.line;
      if (!seen.has(key)) { seen.add(key); deduped.push(c); }
    }
    const wrap = document.createElement("div");
    wrap.className = "void-chat-bubble void-chat-changes";
    const label = document.createElement("span");
    label.className = "void-changes-label";
    label.textContent = `↳ ${deduped.length} change${deduped.length !== 1 ? "s" : ""}`;
    wrap.appendChild(label);
    for (const c of deduped) {
      const btn = document.createElement("button");
      btn.className = "void-change-ref";
      btn.textContent = `${c.path}:${c.line}`;
      btn.title = c.action;
      btn.addEventListener("click", () => openEditorAtLine(c.path, c.line));
      wrap.appendChild(btn);
    }
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function sendChatMessage(userText) {
    userText = userText.trim();
    if (!userText) return;

    const input = $("voidChatInput");
    const sendBtn = $("voidChatSend");
    if (input) { input.value = ""; input.style.height = "auto"; }

    _sessionChanges = [];

    appendChatBubble("user", userText);
    chatHistory.push({ role: "user", content: userText });
    showChatTyping();

    chatAbort = new AbortController();
    if (sendBtn) sendBtn.disabled = true;
    const stopBtn = $("voidStopBtn");
    if (stopBtn) stopBtn.disabled = false;

    try {
      const messages = [
        { role: "system", content: voidChatSystemPrompt() },
        ...chatHistory,
      ];
      const response = await chatCallModel(messages, chatAbort.signal);
      await processChatResponse(response);
    } catch (err) {
      $("voidChatMsgs")?.querySelector(".void-typing-indicator")?.remove();
      if (err?.name !== "AbortError") {
        appendChatBubble("assistant", `Error: ${err.message || err}`);
      }
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      chatAbort = null;
    }

    if (_sessionChanges.length) appendChangesSummary(_sessionChanges);
    if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);
  }

  return {
    sendChatMessage,
    runAgentOSLoop,
    generateAgentOS,
    extractFiles,
    dumpFilesForRewrite,
    needsDeploymentRewrite,
    materializeGeneratedFiles,
    aosLs,
    aosRead,
    aosGrep,
    aosMkdir,
    aosDelete,
    aosMove,
    getChatAbort: () => chatAbort,
    abortChat: () => chatAbort?.abort(),
    setLockedModel: (model) => {
      chatLockedModel = model || null;
      setLastWorkedModel(chatLockedModel);
    },
    resetSession: () => { chatLockedModel = null; },
  };
}
