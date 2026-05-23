/**
 * Virtual OS generate pipeline + DOM event wiring (Wave 13).
 */

export function createVoidGenerateApi(ctx) {
  const {
    $,
    log,
    setStatus,
    safeName,
    visibleProjectFiles,
    getItem,
    descendantIds,
    rebuildPaths,
    saveProject,
    renderAll,
    getSelectedId,
    getActiveFolderId,
    getForceEditMode,
    wantsEditContext,
    shouldCreateSeparateProject,
    tryApplyWorkspaceInstruction,
    initVoidChatApi,
    getAgentOSMode,
    getRunAbort,
    setRunAbort,
  } = ctx;

  let _lastWorkedModel = null;

  function availableModelOptions() {
    const src = document.getElementById("model");
    return Array.from(src?.options || [])
      .map(o => ({ value: o.value, label: o.textContent || o.value, disabled: o.disabled || !o.value }))
      .filter(o => !o.disabled && o.value && !/^[-—]/.test(o.label));
  }

  function modelStrengthScore(opt, role = "worker") {
    const text = `${opt.value} ${opt.label}`.toLowerCase();
    let score = 0;
    const add = (rx, n) => { if (rx.test(text)) score += n; };
    add(/qwen.*(480b|235b|230b|coder|max|plus)|qwen3.*(235b|230b|30b|coder)|qwq/i, 170);
    add(/480b|235b|230b|405b/i, 120);
    add(/405b|480b|235b|230b|120b|70b|large|pro|r1|deepseek|qwen3 coder|gpt oss 120|nemotron 3 super|maverick|hermes/i, 80);
    add(/llama.*70b|deepseek.*llama.*70b/i, -35);
    add(/32b|30b|26b|17b|scout|versatile/i, 38);
    add(/8b|9b|12b|20b|flash|instant|lite|nano|small/i, -12);
    add(/embedding|rerank|moderation|vision|image|tts|whisper/i, -1000);
    if (opt.value.startsWith("cloud:")) score += role === "god" ? 18 : 10;
    if (/gemini.*pro|openrouter|samba|cerebras|groq|minimax|glm|nvidia/i.test(text)) score += 12;
    return score;
  }

  function isSmallModelOption(opt) {
    const text = `${opt?.value || ""} ${opt?.label || ""}`.toLowerCase();
    if (/embedding|rerank|moderation|vision|image|tts|whisper/i.test(text)) return true;
    if (/llama.*70b|deepseek.*llama.*70b/i.test(text)) return true;
    return /(?:^|[^0-9])(8b|9b|12b|17b|20b|26b|30b|32b)(?:[^0-9]|$)|flash|instant|lite|nano|small|mini|scout|versatile/i.test(text);
  }

  function isLargeFallbackModel(opt, role = "worker") {
    if (!opt?.value || isSmallModelOption(opt)) return false;
    const text = `${opt.value} ${opt.label}`.toLowerCase();
    return modelStrengthScore(opt, role) >= 90 ||
      /qwen.*(480b|235b|230b|coder|max|plus)|480b|235b|230b|405b|120b|gpt[-_\s]*oss[-_\s]*120|deepseek.*r1|gemini.*pro/i.test(text);
  }

  function autoAssignModels() {
    const opts = availableModelOptions();
    if (!opts.length) {
      log("No model options available to auto assign.", "warn");
      return;
    }
    const largeOpts = opts.filter(o => isLargeFallbackModel(o, "god"));
    if (!largeOpts.length) {
      log("No large God Agent model is available; refusing to auto-route to small models.", "warn");
      return;
    }
    const godPick = largeOpts.slice().sort((a, b) => modelStrengthScore(b, "god") - modelStrengthScore(a, "god"))[0];
    if ($("voidGodModelSelect")) $("voidGodModelSelect").value = godPick.value;
    log(`God Agent assigned ${godPick.label}`, "ok");
  }

  function chooseWorkerModel() {
    const opts = availableModelOptions();
    if (!opts.length) return $("voidGodModelSelect")?.value || "";
    const largeOpts = opts.filter(o => isLargeFallbackModel(o, "worker"));
    if (!largeOpts.length) {
      log("No large worker model is available; refusing to auto-route to small models.", "warn");
      return "";
    }
    const godValue = $("voidGodModelSelect")?.value || "";
    return largeOpts
      .slice()
      .sort((a, b) => {
        const aScore = modelStrengthScore(a, "worker") + (a.value === godValue ? -6 : 0);
        const bScore = modelStrengthScore(b, "worker") + (b.value === godValue ? -6 : 0);
        return bScore - aScore;
      })[0]?.value || godValue;
  }

  function buildFileContext({
    includeContents = true,
    maxFullFiles = 12,
    maxFullBytes = 6000,
    maxPreviewBytes = 500,
    focusId = "",
  } = {}) {
    const activeItems = visibleProjectFiles();
    if (!activeItems.length) return "(empty project — no files yet)";
    const focusItem = focusId ? getItem(focusId) : null;
    const allowedIds = focusItem && !focusItem.deletedAt ? descendantIds(focusItem.id) : null;
    const contextItems = allowedIds ? activeItems.filter(f => allowedIds.has(f.id)) : activeItems;
    const folders = contextItems.filter(f => f.type === "folder");
    const files   = contextItems.filter(f => f.type === "file");

    const tree = [
      ...folders.map(f => `  📁 /${f.path}/`),
      ...files.map(f => {
        const bytes = new Blob([f.content || ""]).size;
        return `  📄 /${f.path}  (${bytes} B)`;
      })
    ].join("\n");

    if (!includeContents) {
      return `--- Project tree${focusItem ? ` for selected ${focusItem.type}: /${focusItem.path}` : ""} ---\n${tree}\n\n--- File contents ---\n(omitted to keep model request small; request exact existing paths from the tree if editing is needed)`;
    }

    const fileBlocks = files.slice(0, maxFullFiles).map(f => {
      const bytes = new Blob([f.content || ""]).size;
      if (bytes === 0) return `=== FILE: /${f.path} (empty) ===`;
      if (bytes <= maxFullBytes) return `=== FILE: /${f.path} ===\n${f.content}\n=== END FILE ===`;
      const preview = (f.content || "").slice(0, maxPreviewBytes);
      return `=== FILE: /${f.path} (${bytes} B — showing first ${maxPreviewBytes} chars) ===\n${preview}\n... (truncated)\n=== END FILE ===`;
    }).join("\n\n");

    return `--- Project tree${focusItem ? ` for selected ${focusItem.type}: /${focusItem.path}` : ""} ---\n${tree}\n\n--- File contents ---\n${fileBlocks}`;
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

  function buildDynamicImageInstruction(userPrompt) {
    const topic = String(userPrompt || "").slice(0, 140);
    const fallbackSeed = Math.floor(Math.random() * 9000) + 1000;
    return `IMAGES — use Unsplash Source for real, high-quality topic photos (no API key needed).

PRIMARY format (always use this first):
  https://source.unsplash.com/{W}x{H}/?{keyword1},{keyword2}

  Derive keywords directly from the topic "${topic}":
  – pizza/food site        → /?pizza,italian  · /?chef,cooking  · /?restaurant,dining
  – tech/SaaS site         → /?laptop,code    · /?startup,office · /?server,technology
  – fashion/clothing store → /?fashion,model  · /?clothing,style · /?runway,designer
  – fitness/gym app        → /?gym,workout    · /?athlete,sport  · /?fitness,training
  – travel/hotel site      → /?travel,city    · /?hotel,luxury   · /?landscape,destination
  – real estate            → /?house,interior · /?architecture,modern · /?property,home
  – e-commerce/shop        → use the product noun directly, e.g. /?sneakers,shoes

Hard rules:
• Pick keywords directly from the topic — 1-2 concrete nouns that describe the subject.
• Every image must have DIFFERENT keywords to get visual variety.
• Sizes: 1600x900 for hero/banner · 800x600 for cards · 600x400 for thumbnails.
• NEVER use: "cat", "statue", "animal", "kitten", "dog", "placeholder", "lorem", "nature" (unless topic IS nature), or any unrelated term.
• NEVER invent Unsplash photo IDs — only the /?keywords format above.
• Use ≥ 3 distinct images per visual website.

FALLBACK (only if Unsplash Source is unsuitable for the context):
  https://loremflickr.com/{W}/{H}/{k1},{k2}?lock=${fallbackSeed}
  Increment lock by 1 per additional image. Same keyword rules apply.`;
  }

  function buildPrompt(userPrompt, repair = false) {
    const rootFolder = inferProjectName(userPrompt);
    const hasFiles = visibleProjectFiles().some(f => f.type === "file");
    const isEdit = wantsEditContext(userPrompt);
    const isNewBuild = shouldCreateSeparateProject(userPrompt);
    const focusId = getSelectedId() || getActiveFolderId();
    const ctxBlock = repair || isEdit
      ? buildFileContext({
          includeContents: true,
          maxFullFiles: 10,
          maxFullBytes: 4500,
          maxPreviewBytes: 450,
          focusId,
        })
      : "(existing workspace intentionally hidden; this is a new-build prompt, not an edit)";
    return `You are Virtual OS, an AI coding agent with FULL file-system capabilities over a browser-local virtual filesystem.

━━━ OUTPUT FORMAT ━━━
Return complete files in fenced code blocks with the path on the opening fence line:

\`\`\`language folder/path/to/file.ext
full file content here
\`\`\`

━━━ FILE CAPABILITIES ━━━
• CREATE a new file → output it with its new path.
• EDIT / UPDATE an existing file → output it with the SAME path as shown in the project context. The full updated content replaces the old version.
• DELETE a file → the local controller handles deletion commands; do not output a code block for it.
• FIND a file or folder → search the project tree below, then reference it by exact path.
• You can create, read (from context), and fully rewrite ANY file in the project.

━━━ RULES ━━━
- ${hasFiles
  ? isEdit
    ? `EDIT MODE — existing files are present and the user asked for a change. Preserve the existing folder structure. Output ONLY files that need changes, using their exact existing paths from the project context. Do not create a new root folder unless explicitly requested.`
    : isNewBuild
      ? `NEW BUILD MODE — existing files are present, but this is a new build request. Create a separate top-level folder named "${rootFolder}" unless that name already exists; never reuse or overwrite existing project files.`
      : `Existing files are present — keep related additions under the same existing top-level folder. Only create a second root folder if the user asks for a new/separate/different project.`
  : `New project — put EVERY file under ONE top-level folder. Name it "${rootFolder}" (short, lowercase, hyphens OK, NO spaces, NO full sentences, 1–3 words max). Never use the user's prompt text as a path.`}
- Write complete, working file content. No placeholders, lorem ipsum, TODOs, or "rest of file" stubs.
- Every generated project must be ready to run/deploy as written. Do not leave setup chores, missing assets, missing API keys, manual image steps, or comments telling the user what to add later.
- For websites: polished, real UI with actual CSS (not bare HTML). No sample/fake data.
- IMAGES — use the God Agent's chosen Unsplash Source URLs verbatim. Never invent new URLs and never use photo IDs. NEVER use "cat", "statue", "animal", "kitten", or any keyword unrelated to the project topic.
- For visual designs: every <img> and background-image must use an Unsplash Source URL (https://source.unsplash.com/{W}x{H}/?{keywords}) with topic-specific keywords. No placeholders, no empty boxes, no base64 stubs.
- Include at least 3 distinct images for any visual website — each with a different URL and different keywords.
- Design standard: think like an editorial creative director, not a template factory. Every project must have a distinct visual identity: unique color palette, deliberate type hierarchy, original layout composition. No two builds should look the same. Avoid generic hero→features→CTA cookie-cutter layouts.
- For apps: create all required frontend + backend + config files.
- For edits: preserve all unrelated existing code, filenames, folders, assets, and structure. Change only what the user requested.
- For new builds: do not overwrite existing files with common names like index.html, styles.css, app.js, or script.js. Use a new project root.
- Do NOT add README, markdown docs, or test files unless explicitly asked.
- VIRTUAL FILESYSTEM — all files are browser-local only. NEVER include npm install, pip install, cargo build, or any package-manager install step. Write correct package.json / requirements.txt / Cargo.toml content instead; the user runs installs themselves outside Virtual OS.
- Do not claim to run servers or install packages; this stores files only.
- Keep explanation text outside fences to a minimum — mostly just code fences.

━━━ DYNAMIC IMAGE SEARCH ━━━
${buildDynamicImageInstruction(userPrompt)}

━━━ CURRENT PROJECT STATE ━━━
${ctxBlock}

━━━ USER REQUEST ━━━
${userPrompt}`;
  }

  function parseModelValue(value) {
    if (String(value || "").startsWith("cloud:")) {
      const parts = value.split(":");
      return { cloud: true, provider: parts[1], model: parts.slice(2).join(":") };
    }
    return { cloud: false, model: value };
  }

  async function callModelValue(modelValue, messages, signal) {
    const api = window._H || {};
    const value = modelValue || api.selectedModel?.() || document.getElementById("model")?.value || "";
    if (!value) throw new Error("No model selected.");
    const route = parseModelValue(value);
    if (route.cloud) {
      if (route.provider === "gemini") {
        const r = await api.agentTurnGemini({ model: route.model, messages, tools: [], temperature: 0.75, signal });
        return r.content || "";
      }
      const r = await api.agentTurnOpenAI({ provider: route.provider, model: route.model, messages, tools: [], temperature: 0.75, signal });
      return r.content || "";
    }
    const r = await api.agentTurnOllama({ model: route.model, messages, tools: [], temperature: 0.75, signal });
    return r.content || "";
  }

  function fallbackModels(preferredValue, role) {
    const opts = availableModelOptions();
    const seen = new Set();
    const ordered = [];
    const addValue = (value) => {
      const opt = opts.find(o => o.value === value) || { value, label: value };
      if (value && !seen.has(value) && isLargeFallbackModel(opt, role)) {
        seen.add(value);
        ordered.push(opt);
      }
    };
    addValue(preferredValue);
    opts
      .slice()
      .filter(o => isLargeFallbackModel(o, role))
      .sort((a, b) => modelStrengthScore(b, role) - modelStrengthScore(a, role))
      .forEach(o => addValue(o.value));
    return ordered.slice(0, 6);
  }

  function isRouteFailure(err) {
    const msg = String(err?.message || err || "");
    return /rate|limit|quota|413|429|503|502|504|timeout|busy|overload|temporar|failed|model.*not.*found|missing|key|unsupported|request.*too.*large|too.*large|payload.*large|context.*length/i.test(msg);
  }

  async function callWithFailover(role, preferredValue, messages, signal) {
    const candidates = fallbackModels(preferredValue, role);
    if (!candidates.length) {
      throw new Error(`${role === "god" ? "God Agent" : "Worker Agent"} has no large model route available. Small-model fallback is disabled.`);
    }
    let lastErr = null;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      try {
        log(`${role === "god" ? "God Agent" : "Worker Agent"} using ${c.label}`, i ? "warn" : "run");
        const content = await callModelValue(c.value, messages, signal);
        if (role === "god" && $("voidGodModelSelect")) $("voidGodModelSelect").value = c.value;
        if (role === "worker" && $("voidChatModelSelect")) $("voidChatModelSelect").value = c.value;
        _lastWorkedModel = c.value;
        return content;
      } catch (err) {
        lastErr = err;
        log(`${role === "god" ? "God Agent" : "Worker Agent"} route failed: ${String(err.message || err).slice(0, 150)}`, "warn");
        if (err?.name === "AbortError") throw err;
        if (!isRouteFailure(err)) break;
      }
    }
    throw lastErr || new Error(`${role} route failed`);
  }

  async function runGodAgent(userPrompt, repair, signal) {
    const editMode = wantsEditContext(userPrompt);
    const newBuildMode = shouldCreateSeparateProject(userPrompt);
    const focusId = getSelectedId() || getActiveFolderId();
    const ctxBlock = repair || editMode
      ? buildFileContext({
          includeContents: true,
          maxFullFiles: 8,
          maxFullBytes: 3500,
          maxPreviewBytes: 350,
          focusId,
        })
      : "(existing workspace intentionally hidden; create a new project and do not edit old files)";
    const content = await callWithFailover("god", $("voidGodModelSelect")?.value, [
      {
        role: "system",
        content: `You are Virtual OS God Agent and Creative Director. Your response has TWO sections.

━━━ SECTION 1 — CREATIVE BRIEF ━━━
Think deeply about the specific request. Then define a unique visual identity for this exact project:

Style: [pick one: editorial, neo-brutalist, soft luxury, bold industrial, clean minimal, organic, retro-tech, maximalist, etc. — must fit the topic]
Colors: [3–4 hex values with roles, e.g. "#0f172a primary · #f59e0b accent · #f8fafc bg · #334155 secondary"]
Typography: [two Google Font pairs with roles, e.g. "'Playfair Display', serif for headings · 'DM Sans', sans-serif for body"]
Layout: [describe the specific layout approach: asymmetric two-column, magazine editorial, full-bleed hero with floating cards, mosaic grid, etc.]
Unique Angle: [one sentence on what makes this design NOT a generic template — must be specific to this topic]
Images (use Unsplash Source, topic-specific keywords — DIFFERENT keywords per image):
  [usage]: https://source.unsplash.com/{W}x{H}/?{keyword1},{keyword2}
  [at least 4 image URLs, each with different dimensions and different topic-specific keywords]

━━━ SECTION 2 — EXECUTION BRIEF ━━━
- Mode: ${editMode ? "EDIT existing project" : newBuildMode ? "CREATE a separate new project" : "ADD related files or create project as requested"}.
- List every file to CREATE (new path) or EDIT (existing path). Name each file and describe exactly what it must contain.
- Worker must execute the Creative Brief above — use those exact colors, fonts, layout, and images.
- For edits: confirm each path, describe specific changes. Preserve folder structure and unrelated files.
- For new builds: all files under one top-level folder. Never reuse existing paths.
- Require deploy-ready output: no TODOs, no placeholders, no manual steps for the user.
- Do NOT output code fences — that is the worker's job.
- No README, no docs, no tests unless explicitly requested.

${buildDynamicImageInstruction(userPrompt)}`
      },
      {
        role: "user",
        content: `User request: ${userPrompt}\n\nCurrent project state:\n${ctxBlock}\n\nOutput your Creative Brief first, then the Execution Brief with each file to create or edit.`
      }
    ], signal);
    return content.trim() || userPrompt;
  }

  async function generate(repair = false, promptOverride = null) {
    const chat = initVoidChatApi();
    if (getAgentOSMode() && !repair) return chat.generateAgentOS(promptOverride);
    const prompt = promptOverride ?? $("voidPrompt")?.value?.trim() ?? "";
    if (!prompt) {
      log("Describe a file action or project to build first.", "warn");
      return;
    }
    if (!repair && await tryApplyWorkspaceInstruction(prompt)) return;
    const runAbort = getRunAbort();
    if (runAbort) runAbort.abort();
    const controller = new AbortController();
    setRunAbort(controller);
    setStatus("Running", "running");
    log(repair ? "Repairing project from prompt" : "No file-control command detected; generating project files", "run");
    const stopBtn = $("voidStopBtn");
    if (stopBtn) { stopBtn.classList.add("running"); stopBtn.disabled = false; }
    try {
      const workerBrief = await runGodAgent(prompt, repair, controller.signal);
      const workerModel = chooseWorkerModel();
      const workerLabel = availableModelOptions().find(o => o.value === workerModel)?.label || workerModel || "selected model";
      log(`God Agent assigned one Worker Agent: ${workerLabel}`, "ok");
      const content = await callWithFailover("worker", workerModel, [
        {
          role: "system",
          content: `You are Virtual OS Worker Agent — a full-stack coding agent that writes complete project files.

════ OUTPUT FORMAT — THIS IS THE ONLY ACCEPTABLE FORMAT ════

Every file MUST be wrapped in a fenced code block where the FIRST LINE contains the language AND the file path separated by a space:

\`\`\`html apple-clone/index.html
<!DOCTYPE html>
...
\`\`\`

\`\`\`css apple-clone/styles.css
body { margin: 0; }
\`\`\`

\`\`\`js apple-clone/app.js
console.log("hello");
\`\`\`

CRITICAL RULES:
1. The opening fence line format is EXACTLY:  backtick backtick backtick + language + ONE SPACE + path
2. Do NOT put the path inside the file as a comment. Put it on the opening fence line.
3. Do NOT use a fence like \`\`\`html alone with no path — that will BREAK the system.
4. All files MUST share ONE short root folder (1-3 words, lowercase, hyphens). Example root: apple-clone
5. NEVER name the root folder after the user's prompt text.
6. Write COMPLETE file contents — no "// ... rest of code", no TODO placeholders.
7. If editing existing files, use the exact existing paths from context and preserve unrelated code and folder structure.
8. If creating a new website/app/tool/game while files already exist, use a new top-level folder and do not overwrite existing paths.
9. IMAGES: Use ONLY the Unsplash Source URLs specified in the God Agent's Creative Brief. Construct each URL as https://source.unsplash.com/{W}x{H}/?{keyword1},{keyword2} where keywords match exactly what the image shows. Never reuse the same keywords twice.
10. Visual websites must use at least 3 distinct Unsplash Source images with different keywords and sizes.
11. DESIGN: Execute the God Agent's Creative Brief exactly — use the specified colors, fonts, and layout style. Every project must feel like a bespoke design, not a template. No two builds should look alike.
12. Make the project fully working and ready for deployment. All referenced files must be generated, and there must be no manual steps inside comments or UI.
13. No README or test files unless explicitly requested.

DYNAMIC IMAGE INSTRUCTION:
${buildDynamicImageInstruction(prompt)}`
        },
        { role: "user", content: `${buildPrompt(prompt, repair)}\n\n--- God Agent execution brief ---\n${workerBrief}` }
      ], controller.signal);
      let files = chat.extractFiles(content);
      if (!files.length && content.trim().length > 80) {
        log("Model output had no path-labeled fences — retrying with format reminder…", "warn");
        const retryContent = await callWithFailover("worker", workerModel, [
          {
            role: "system",
            content: `You are a code formatter. The user will give you code that was output WITHOUT file paths on the code fence lines. Your ONLY job is to reformat it so every fence looks like:\n\`\`\`html project-name/index.html\ncontent\n\`\`\`\nDo not change the code. Just add the correct path to every opening fence line. Use a short project folder name (1-3 words, lowercase, hyphens).`
          },
          { role: "user", content: `Reformat this output by adding paths to all code fences:\n\n${content}` }
        ], controller.signal);
        files = chat.extractFiles(retryContent);
      }
      if (!files.length) throw new Error("Model did not produce any code files. Try a different model or rephrase your prompt.");
      if (chat.needsDeploymentRewrite(files, prompt)) {
        log("Model left placeholders/manual steps — retrying for deployment-ready files…", "warn");
        const rewriteContent = await callWithFailover("worker", workerModel, [
          {
            role: "system",
            content: `You are fixing generated project files so they are fully working, deployment-ready, and visually polished. Rewrite the provided files so there are no TODOs, placeholders, missing assets, fake local image filenames, manual setup comments, or instructions telling the user to add/replace/provide anything later. For images, use Unsplash Source URLs with topic-specific keywords: https://source.unsplash.com/{W}x{H}/?{keyword1},{keyword2} — use at least 3 distinct URLs with different keywords and sizes. Elevate naive/basic design into premium responsive production UI. Keep all code complete and return ONLY path-labeled fenced code blocks.\n\n${buildDynamicImageInstruction(prompt)}`
          },
          {
            role: "user",
            content: `Original user request:\n${prompt}\n\nRewrite these files so they are ready for deployment with all images/assets/references already wired:\n\n${chat.dumpFilesForRewrite(files)}`
          }
        ], controller.signal);
        const rewritten = chat.extractFiles(rewriteContent);
        if (rewritten.length) files = rewritten;
      }
      log(`Parsing ${files.length} file(s) from model output…`, "run");
      files.forEach(f => log(`Writing /${f.path}`, "ok"));
      const materialized = chat.materializeGeneratedFiles(files, prompt);
      await saveProject();
      setStatus("Done", "done");
      log(`✓ ${materialized.count} file(s) written to /${materialized.folderName}`, "ok");
      renderAll();
    } catch (err) {
      if (err?.name === "AbortError") log("Generation stopped", "warn");
      else {
        setStatus("Error", "error");
        log(err.message || String(err), "error");
      }
    } finally {
      if (stopBtn) { stopBtn.classList.remove("running"); stopBtn.disabled = true; }
      setRunAbort(null);
      setTimeout(() => setStatus("Idle"), 2000);
    }
  }

  return {
    generate,
    chooseWorkerModel,
    callModelValue,
    callWithFailover,
    autoAssignModels,
    getLastWorkedModel: () => _lastWorkedModel,
    setLastWorkedModel: (v) => { _lastWorkedModel = v; },
  };
}

export function createVoidWireEventsApi(ctx) {
  const {
    $,
    log,
    ROOT_ID,
    initVoidChatApi,
    wireFinderEvents,
    createFile,
    createFolder,
    renderAll,
    renderEditMode,
    toggleForceEditMode,
    initTerminalInteract,
    getTermLines,
    setTermLines,
    getTermHistory,
    getTermHistIdx,
    setTermHistIdx,
    getTermCwd,
    appendTermLine,
    termExec,
    renderTermOutput,
    renderTermPrompt,
    openTerminal,
    getRunAbort,
    abortRun,
    saveWallpaperBlob,
    applyWallpaper,
    setWallpaperMenu,
    deleteWallpaperBlob,
    handleUpload,
    deleteItem,
    deleteAll,
    exportZip,
    closeEditor,
    saveEditor,
    downloadItem,
    getItem,
    getEditingId,
    closeDialog,
    clearDesktopSelection,
    hasDragType,
    getSystemIconDrag,
    moveSystemIcon,
    getDragItem,
    moveItemToParent,
    getDragOffset,
    downloadFolder,
    guessMime,
    setActiveFolderId,
    getSelectedId,
    setMounted,
    getInitialized,
    setInitialized,
    getClockTimer,
    setClockTimer,
    updateVoidClock,
    loadProjects,
    logReady,
    prepareMount,
  } = ctx;

  function wireEvents() {
    $("voidBackBtn")?.addEventListener("click", () => window._H?.setTab?.("chats"));
    $("voidCreateFileBtn")?.addEventListener("click", createFile);
    $("voidCreateFolderBtn")?.addEventListener("click", createFolder);
    $("voidRefreshBtn")?.addEventListener("click", renderAll);
    wireFinderEvents();
    $("voidEditModeBtn")?.addEventListener("click", () => {
      toggleForceEditMode();
      renderEditMode();
    });
    initTerminalInteract();

    const chatInput = $("voidChatInput");
    function resizeChatInput() {
      if (!chatInput) return;
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
    }
    chatInput?.addEventListener("input", resizeChatInput);
    chatInput?.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        initVoidChatApi().sendChatMessage(e.currentTarget.value);
        setTimeout(() => { if (chatInput) { chatInput.style.height = "auto"; } }, 0);
      }
    });
    $("voidChatSend")?.addEventListener("click", () => {
      initVoidChatApi().sendChatMessage($("voidChatInput")?.value || "");
      if (chatInput) chatInput.style.height = "auto";
    });
    $("voidChatModelSelect")?.addEventListener("change", e => {
      const chat = initVoidChatApi();
      chat.setLockedModel(e.currentTarget.value || null);
      log(e.currentTarget.value ? `Virtual OS agent route selected: ${e.currentTarget.selectedOptions?.[0]?.textContent || e.currentTarget.value}` : "Virtual OS agent route reset.", e.currentTarget.value ? "ok" : "warn");
    });

    $("voidTermOpenBtn")?.addEventListener("click", openTerminal);
    $("voidTermClose")?.addEventListener("click", () => {
      $("voidTerminal")?.classList.add("void-term-hidden");
      const btn = $("voidTermOpenBtn");
      if (btn) btn.style.display = "";
    });
    $("voidTermClearBtn")?.addEventListener("click", () => { setTermLines([]); renderTermOutput(); });

    $("voidTermInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        const input = e.currentTarget;
        const cmd   = input.value.trim();
        input.value = "";
        if (!cmd) return;
        const termHistory = getTermHistory();
        termHistory.unshift(cmd);
        if (termHistory.length > 100) termHistory.pop();
        setTermHistIdx(-1);
        const cwd = getTermCwd();
        appendTermLine((cwd === "/" ? "~" : "~" + cwd) + " $ " + cmd, "cmd");
        const result = termExec(cmd);
        if (result === "__clear__") { setTermLines([]); renderTermOutput(); }
        else if (result) appendTermLine(result, "out");
        renderTermPrompt();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const termHistory = getTermHistory();
        let termHistIdx = getTermHistIdx();
        if (termHistIdx < termHistory.length - 1) {
          termHistIdx++;
          setTermHistIdx(termHistIdx);
          e.currentTarget.value = termHistory[termHistIdx] || "";
        }
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        let termHistIdx = getTermHistIdx();
        if (termHistIdx > 0) {
          termHistIdx--;
          setTermHistIdx(termHistIdx);
          e.currentTarget.value = getTermHistory()[termHistIdx] || "";
        } else {
          setTermHistIdx(-1);
          e.currentTarget.value = "";
        }
      }
    });

    $("voidStopBtn")?.addEventListener("click", (e) => {
      if (e.currentTarget.disabled) return;
      let stopped = false;
      if (getRunAbort()) { abortRun(); stopped = true; }
      const chat = initVoidChatApi();
      if (chat.getChatAbort()) { chat.abortChat(); stopped = true; }
      if (stopped) log("Stopped by user", "warn");
    });

    $("voidWallpaperBtn")?.addEventListener("click", e => {
      e.stopPropagation();
      const menu = $("voidWallpaperMenu");
      if (!menu) return;
      setWallpaperMenu(menu.hasAttribute("hidden"));
    });
    $("voidWallpaperUpload")?.addEventListener("click", () => {
      setWallpaperMenu(false);
      $("voidWallpaperInput")?.click();
    });
    $("voidWallpaperReset")?.addEventListener("click", () => {
      setWallpaperMenu(false);
      deleteWallpaperBlob().then(() => applyWallpaper());
      log("Wallpaper reset to default", "ok");
    });
    $("voidWallpaperInput")?.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      saveWallpaperBlob(file).then(() => applyWallpaper());
      log(`Wallpaper set to ${file.name}`, "ok");
      e.target.value = "";
    });
    document.addEventListener("click", e => {
      if (!e.target.closest("#voidWallpaperWrap")) setWallpaperMenu(false);
    });
    $("voidImportBtn")?.addEventListener("click", () => $("voidFileInput")?.click());
    $("voidDeleteSelectedBtn")?.addEventListener("click", () => {
      if (!getSelectedId()) {
        log("Select a file or folder first.", "warn");
        return;
      }
      deleteItem(getSelectedId());
    });
    $("voidUploadFolderBtn")?.addEventListener("click", () => $("voidFolderInput")?.click());
    $("voidDownloadFolderBtn")?.addEventListener("click", () => {
      const sel = getSelectedId() ? getItem(getSelectedId()) : null;
      if (sel?.type === "folder") downloadFolder(sel.id);
    });
    $("voidDeleteAllBtn")?.addEventListener("click", deleteAll);
    $("voidFileInput")?.addEventListener("change", e => handleUpload(e.target.files, false).then(() => { e.target.value = ""; }));
    $("voidFolderInput")?.addEventListener("change", e => handleUpload(e.target.files, true).then(() => { e.target.value = ""; }));
    $("voidExportZipBtn")?.addEventListener("click", exportZip);
    $("voidEditorClose")?.addEventListener("click", closeEditor);
    $("voidEditorSave")?.addEventListener("click", saveEditor);
    $("voidEditorDownload")?.addEventListener("click", () => downloadItem(getItem(getEditingId())));
    $("voidEditor")?.addEventListener("click", e => { if (e.target === $("voidEditor")) closeEditor(); });
    $("voidDialogClose")?.addEventListener("click", () => closeDialog(null));
    $("voidDialogCancel")?.addEventListener("click", () => closeDialog(null));
    $("voidDialogOk")?.addEventListener("click", () => {
      const input = $("voidDialogInput");
      closeDialog(input.style.display === "none" ? true : input.value);
    });
    $("voidDialogInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") closeDialog(e.currentTarget.value);
      if (e.key === "Escape") closeDialog(null);
    });
    $("voidDialog")?.addEventListener("click", e => { if (e.target === $("voidDialog")) closeDialog(null); });

    $("voidTraceToggle")?.addEventListener("click", e => {
      e.stopPropagation();
      const tc = $("voidTraceConsole");
      if (!tc) return;
      if (tc.classList.contains("collapsed")) tc.classList.replace("collapsed", "expanded");
      else tc.classList.replace("expanded", "collapsed");
    });

    $("voidTraceClearBtn")?.addEventListener("click", e => {
      e.stopPropagation();
      const entries = $("voidTraceEntries");
      if (entries) entries.innerHTML = "";
      const summary = $("voidTraceSummary");
      if (summary) summary.textContent = "Cleared";
      const dot = $("voidTraceDot");
      if (dot) dot.className = "void-trace-dot";
    });

    const desktop = $("voidDesktop");
    desktop?.addEventListener("click", e => {
      if (e.target.closest(".void-desktop-icon")) return;
      clearDesktopSelection();
    });
    desktop?.addEventListener("dragover", e => {
      e.preventDefault();
      if (hasDragType(e, "application/x-void-system-icon")) e.dataTransfer.dropEffect = "move";
      else if (hasDragType(e, "Files")) e.dataTransfer.dropEffect = "copy";
      else if (hasDragType(e, "text/plain")) e.dataTransfer.dropEffect = "move";
    });
    desktop?.addEventListener("drop", async e => {
      e.preventDefault();
      const box = desktop.getBoundingClientRect();
      const dragOffset = getDragOffset(e);
      const desktopPosition = {
        x: e.clientX - box.left - dragOffset.x,
        y: e.clientY - box.top - dragOffset.y,
      };
      const systemIconId = getSystemIconDrag(e);
      if (systemIconId) {
        if (await moveSystemIcon(systemIconId, desktopPosition)) renderAll();
        return;
      }
      if (e.dataTransfer.files?.length) {
        await handleUpload(e.dataTransfer.files, false, ROOT_ID);
        return;
      }
      const item = getDragItem(e);
      if (!item) return;
      if (await moveItemToParent(item.id, ROOT_ID, desktopPosition)) {
        setActiveFolderId(ROOT_ID);
        log(`Moved to Virtual OS root`, "ok");
        renderAll();
      }
    });
  }

  async function mount() {
    setMounted(true);
    prepareMount();
    initVoidChatApi().resetSession();
    const term = $("voidTerminal");
    const termBtn = $("voidTermOpenBtn");
    if (term && termBtn) {
      termBtn.style.display = term.classList.contains("void-term-hidden") ? "" : "none";
    }
    if (!getInitialized()) {
      setInitialized(true);
      wireEvents();
    }
    if (!getClockTimer()) {
      setClockTimer(setInterval(updateVoidClock, 1000));
    }
    updateVoidClock();
    try {
      await loadProjects();
      await applyWallpaper();
      renderAll();
      logReady();
    } catch (err) {
      log(err.message || String(err), "error");
    }
  }

  return { wireEvents, mount };
}
