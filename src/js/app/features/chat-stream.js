/**
 * Chat send/stream — compare mode, Ollama/cloud streaming, context indicator.
 */
import { safeHost } from '../core/utils.js';

export function createChatStreamApi(deps) {
  const {
    state,
    escapeHtml,
    safeHost,
    parseCloudModel,
    uid,
    msgs,
    input,
    sendBtn,
    modelEl,
    compareModelEl,
    tempEl,
    systemEl,
    contextWindowEl,
    contextTextEl,
    contextFillEl,
    pinned,
    tpsBtn,
    tpsVal,
    privacyLocalEl,
    nvidiaKeyEl,
    nvidiaModelEl,
    showError,
    clearError,
    themedAlert,
    themedConfirm,
    buildAttachedFileContext,
    buildReplyWrappedContent,
    ensureChatIdForCurrentMessages,
    lastUserMessage,
    normalizeUserMessageText,
    prepareEditBranch,
    clearReplyTo,
    clearEditingMessage,
    runAssistantTurn,
    render,
    renderPending,
    persistCurrentChat,
    cloudModelLabel,
    streamCloudModel,
    generateCloudImage,
    isImageGenModel,
    getBestFailoverModel,
    nvidiaStreamChat,
    trackLocalModel,
    ROUTE_DEFS,
    getActiveAgent,
    currentProject,
    isForgeMode,
    FORGE_ARCHITECT_PROMPT,
    getHistoryLimit,
    estimateGeneratedTokens,
    setTpsDisplay,
    setSplitTpsDisplay,
    diffBlockHtml,
  } = deps;

    async function sendCompare() {
      if (state.streaming) return;
      const text = input.value.trim();
    if (!text && state.pendingImages.length === 0 && state.pendingFiles.length === 0) return;
    const leftModel = modelEl.value;
    const rightModel = compareModelEl.value;
    if (!leftModel || !rightModel) { await themedAlert("Select two models for comparison first.", "Compare"); return; }
    if (leftModel === rightModel) { await themedAlert("Pick a different second model for comparison.", "Compare"); return; }

    let displayContent = text;
    const fileBlocks = buildAttachedFileContext(state.pendingFiles);
    let replyMeta = null;
    if (state.replyTo && state.messages[state.replyTo.idx]) {
      replyMeta = { idx: state.replyTo.idx, role: state.messages[state.replyTo.idx].role, preview: state.replyTo.preview };
      displayContent = buildReplyWrappedContent(displayContent, replyMeta);
    }
    const userMsg = {
      role: "user",
      content: displayContent,
      _modelContent: fileBlocks ? (displayContent + fileBlocks) : undefined,
      images: state.pendingImages.map(i => i.dataUrl),
      attachments: state.pendingFiles.map(f => ({ name: f.name, kind: f.kind || "file", pages: f.pages, chars: f.chars, extracted: f.extracted })),
      _imgBase64: state.pendingImages.map(i => i.base64),
      ...(replyMeta ? { replyTo: replyMeta } : {}),
    };
    state.messages.push(userMsg);
    ensureChatIdForCurrentMessages();
    const messages = buildOllamaMessages();
    const hasAttachedFileContext = messages.some(m => /\[ATTACHED FILES - use this content when answering\]/.test(m.content || ""));
    const numCtx = hasAttachedFileContext ? 16384 : (getHistoryLimit() > 0 ? 8192 : 4096);
    const compareMsg = {
      role: "assistant",
      content: "",
      startedAt: Date.now(),
      compare: {
        left: { model: leftModel, content: "", done: false, error: "" },
        right: { model: rightModel, content: "", done: false, error: "" },
      },
    };
    state.messages.push(compareMsg);
    state.pendingImages = [];
    state.pendingFiles = [];
    clearReplyTo();
    input.value = ""; input.style.height = "auto";
    renderPending();
    state.streaming = true;
    sendBtn.textContent = "Stop";
    if (tpsBtn) tpsBtn.className = "ping-btn tps-btn split-tps streaming";
    if (tpsVal) tpsVal.textContent = "L… · R…";
    const ctrl = new AbortController();
    state.abort = ctrl;
    render();
    const idx = state.messages.indexOf(compareMsg);
    const temperature = (v => Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0.7)(parseFloat(tempEl.value));
    const runSide = async (side) => {
      const branch = compareMsg.compare[side];
      try {
        await streamWithModelValue({
          modelValue: branch.model,
          messages: messages.map(m => ({ ...m, images: m.images ? m.images.slice() : undefined })),
          signal: ctrl.signal,
          temperature,
          numCtx,
          onStats: (stats) => {
            if (stats?.eval_count && stats?.eval_duration) {
              branch.tps = Math.max(1, Math.round(stats.eval_count / (stats.eval_duration / 1e9)));
              branch.tpsSource = "ollama";
              setSplitTpsDisplay(compareMsg.compare);
            }
          },
          onToken: (delta) => {
            if (!branch.firstTokenAt) branch.firstTokenAt = Date.now();
            branch.content += delta;
            branch.generatedTokens = (branch.generatedTokens || 0) + estimateGeneratedTokens(delta);
            const elapsed = (Date.now() - branch.firstTokenAt) / 1000;
            if (elapsed > 0.35 && !branch.tpsSource) {
              branch.tps = Math.max(1, Math.round((branch.generatedTokens || 0) / elapsed));
              branch.tpsSource = "estimated";
              setSplitTpsDisplay(compareMsg.compare);
            }
            updateComparePane(idx, side, branch);
          },
        });
      } catch (err) {
        if (err.name !== "AbortError") branch.error = err.message || String(err);
      } finally {
        if (!branch.tps && branch.content) {
          const elapsed = ((Date.now()) - (branch.firstTokenAt || compareMsg.startedAt || Date.now())) / 1000;
          if (elapsed > 0) {
            branch.tps = Math.max(1, Math.round((branch.generatedTokens || estimateGeneratedTokens(branch.content)) / elapsed));
            branch.tpsSource = branch.tpsSource || "estimated";
            setSplitTpsDisplay(compareMsg.compare);
          }
        }
        branch.done = true;
        updateComparePane(idx, side, branch);
      }
    };
    await Promise.allSettled([runSide("left"), runSide("right")]);
    compareMsg.completedAt = Date.now();
    compareMsg.durationMs = compareMsg.completedAt - compareMsg.startedAt;
    compareMsg.content = [
      `## ${cloudModelLabel(leftModel) || leftModel}`,
      compareMsg.compare.left.error || compareMsg.compare.left.content || "",
      `## ${cloudModelLabel(rightModel) || rightModel}`,
      compareMsg.compare.right.error || compareMsg.compare.right.content || "",
    ].join("\n\n");
    state.streaming = false;
    sendBtn.textContent = "Send";
    setSplitTpsDisplay(compareMsg.compare);
    if (tpsBtn) tpsBtn.classList.remove("streaming");
    render();
    persistCurrentChat();
  }

  async function send() {
    if (state.streaming) return;
    if (state.compareMode) {
      await sendCompare();
      return;
    }
    // Stop dictation the moment we commit to sending
    const text = input.value.trim();
    const editingSource = state.editing ? state.messages[state.editing.idx] : null;
    const editingHasAssets = !!(editingSource?.images?.length || editingSource?.attachments?.length);
    if (!text && state.pendingImages.length === 0 && state.pendingFiles.length === 0 && !editingHasAssets) return;
    if (!modelEl.value) { await themedAlert("Select a model first.\n• Local: on the local host, run: ollama pull llama3.2\n• Cloud: add a free API key in Settings → Cloud Models.", "Model Required"); return; }

    // Separate what the user sees (their raw typed text + nice attachment
    // chips) from what the model sees (typed text + extracted file content).
    // Previously both were the same, which is why attached PDFs rendered
    // as a wall of raw text in the user's own bubble.
    let displayContent = text;
    const fileBlocks = buildAttachedFileContext(state.pendingFiles);
    let replyMeta = null;
    if (state.replyTo && state.messages[state.replyTo.idx]) {
      replyMeta = { idx: state.replyTo.idx, role: state.messages[state.replyTo.idx].role, preview: state.replyTo.preview };
      displayContent = buildReplyWrappedContent(displayContent, replyMeta);
    }
    const hadAttachments = state.pendingImages.length > 0 || state.pendingFiles.length > 0;
    if (state.editing) {
      const editedIdx = state.editing.idx;
      state.currentChatId = uid();
      state.messages = prepareEditBranch(editedIdx, text);
      state.pendingImages = [];
      state.pendingFiles = [];
      clearReplyTo();
      clearEditingMessage();
    } else {
      const userMsg = {
        role: "user",
        content: displayContent,
        _modelContent: fileBlocks ? (displayContent + fileBlocks) : undefined,
        images: state.pendingImages.map(i => i.dataUrl),
        attachments: state.pendingFiles.map(f => ({
          name: f.name,
          kind: f.kind || "file",
          pages: f.pages,
          chars: f.chars,
          extracted: f.extracted,
        })),
        _imgBase64: state.pendingImages.map(i => i.base64),
        ...(replyMeta ? { replyTo: replyMeta } : {}),
      };
      state.messages.push(userMsg);
      state.pendingImages = [];
      state.pendingFiles = [];
      clearReplyTo();
    }
    input.value = ""; input.style.height = "auto";
    renderPending();

    // Trigger the PCB traces pulse — lines glow, then fade back
    document.body.classList.add("pulse-traces");
    clearTimeout(window._pulseTimer);
    window._pulseTimer = setTimeout(() => document.body.classList.remove("pulse-traces"), 1400);

    const seedMsg = lastUserMessage(state.messages);
    await runAssistantTurn(normalizeUserMessageText(seedMsg), hadAttachments || !!(seedMsg?.images?.length || seedMsg?.attachments?.length));
  }

  function abort() { state.abort?.abort(); }

  async function streamChat(assistant, toolContext = null, route = null) {
    clearError();
    const messages = buildOllamaMessages();
    if (toolContext) {
      // Embed context directly into the last user message — local models
      // trained to say "I can't access the internet" will ignore a separate
      // system message but cannot ignore content in the user turn itself.
      const last = messages[messages.length - 1];
      if (last?.role === "user") {
        last.content = `${toolContext}\n\nQuestion: ${last.content}`;
      } else {
        messages.splice(messages.length - 1, 0, { role: "system", content: toolContext });
      }
    }
    const ctrl = new AbortController();
    state.abort = ctrl;
    const temperature = (v => Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0.7)(parseFloat(tempEl.value));
    const hasAttachedFileContext = messages.some(m => /\[ATTACHED FILES - use this content when answering\]/.test(m.content || ""));
    const numCtx = hasAttachedFileContext ? 16384 : (getHistoryLimit() > 0 ? 8192 : 4096);
    const def = route ? ROUTE_DEFS[route.route] : null;
    const useNvidia = def?.backend === "nvidia";
    const isCloud = modelEl.value.startsWith("cloud:");
    const onCloudToken = (delta) => {
      if (!assistant.firstTokenAt) assistant.firstTokenAt = Date.now();
      assistant.content += delta;
      assistant.generatedTokens = (assistant.generatedTokens || 0) + estimateGeneratedTokens(delta);
      assistant.tpsSource = "estimated";
      const elapsed = (Date.now() - assistant.firstTokenAt) / 1000;
      if (elapsed > 0.35) {
        assistant.tps = Math.max(1, Math.round((assistant.generatedTokens || 0) / elapsed));
        setTpsDisplay(assistant.tps);
      }
      updateLastBubble(assistant.content);
    };

    try {
      if (isCloud) {
        // ── Direct cloud model (user chose from the Cloud Models dropdown) ───
        // Privacy guard: if "Local only" is enabled, confirm before sending to cloud.
        if (privacyLocalEl.checked) {
          const ok = await themedConfirm(
            "⚠️ Privacy: Local only is enabled.\n\n" +
            "You selected a cloud model — this will send your message to an external server.\n\n" +
            "Send anyway?",
            "Privacy Check"
          );
          if (!ok) {
            assistant.content = "_(Blocked by Privacy: Local only)_";
            return;
          }
        }
        let currentModelValue = modelEl.value;
        const triedModels = new Set();
        let failoverCount = 0;
        while (true) {
          const { provider, modelId } = parseCloudModel(currentModelValue);
          if (!provider || !modelId) throw new Error("Invalid cloud model value: " + currentModelValue);
          assistant.model = currentModelValue;
          try {
            if (isImageGenModel(currentModelValue)) {
              assistant.firstTokenAt = Date.now();
              showImageGenLoading();
              const { text, images } = await generateCloudImage(modelId, messages, ctrl.signal);
              assistant.content = text;
              assistant.images = images;
            } else {
              await streamCloudModel(provider, modelId, messages, temperature, onCloudToken, ctrl.signal);
            }
            break; // success
          } catch (err) {
            if (err.name === "AbortError") throw err;
            const msg = err?.message || String(err);
            const isRetriable = /rate limit|overloaded|server error|429|503|529|5\d\d/.test(msg);
            if (!isRetriable) throw err;
            triedModels.add(currentModelValue);
            const fallback = getBestFailoverModel(currentModelValue, triedModels);
            if (!fallback) throw err; // no fallback available — surface original error
            failoverCount++;
            // Brief status in bubble before retrying
            assistant.content = `_(Failover ${failoverCount}: ${cloudModelLabel(currentModelValue)} → ${fallback.shortLabel || fallback.label})_\n\n`;
            updateLastBubble(assistant.content);
            currentModelValue = fallback.value;
          }
        }
      } else if (useNvidia) {
        if (privacyLocalEl.checked) {
          assistant.content = "_(Blocked by Privacy: Local only)_";
          return;
        }
        if (!(nvidiaKeyEl.value || "").trim()) {
          throw new Error("NVIDIA route picked but no API key set in Settings.");
        }
        await nvidiaStreamChat({
          messages,
          model: (nvidiaModelEl?.value) || "meta/llama-3.3-70b-instruct",
          temperature,
          onToken: onCloudToken,
          signal: ctrl.signal,
        });
      } else {
        const host = safeHost();
        trackLocalModel(modelEl.value);
        const res = await fetch(`${host}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelEl.value,
            stream: true,
            keep_alive: -1,
            // Attachments need extra room; otherwise extracted PDF/file text can be truncated before the model reads it.
            options: { temperature, num_ctx: numCtx },
            messages,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const parseOllamaLine = (line) => {
          if (!line.trim()) return;
          try {
            const evt = JSON.parse(line);
            if (evt.message?.content) {
              if (!assistant.firstTokenAt) assistant.firstTokenAt = Date.now();
              assistant.content += evt.message.content;
              updateLastBubble(assistant.content);
            }
            if (evt.done && evt.eval_count && evt.eval_duration) {
              const tps = Math.round(evt.eval_count / (evt.eval_duration / 1e9));
              assistant.tps = tps;
              setTpsDisplay(tps);
            }
          } catch {}
        };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) parseOllamaLine(line);
        }
        parseOllamaLine(buf);
      }
    } catch (err) {
      if (err.name !== "AbortError") showError(err);
    } finally {
      // If the stream completed but produced no content, surface a clear error
      // instead of leaving an empty bubble with no indication of what happened.
      if (!assistant.content && !assistant.images?.length) {
        const last = msgs.querySelector(".msg.assistant:last-of-type .bubble");
        if (last) {
          last.classList.remove("thinking-bubble");
          last.innerHTML = `<span style="color:var(--error,#f87171);font-style:italic;">No response received — check that your model is loaded and your API key is set.</span>`;
        }
        assistant.content = "[No response]";
      }
    }
  }

  // RAF-throttled bubble updater.
  // During streaming we write raw text (textContent) — zero HTML parsing, zero
  // markdown overhead per token. formatContent runs exactly once at the end via
  // the post-stream render() call, so the final view is still fully formatted.
  let _rafPending = false;
  let _rafId = null;
  let _pendingBubbleText = "";
  function writeLastBubbleText() {
    const last = msgs.querySelector(".msg.assistant:last-of-type .bubble");
    if (last) {
      last.classList.remove("thinking-bubble");
      const msg = state.messages[state.messages.length - 1];
      if (msg?.diffFrom) {
        last.innerHTML = `<pre style="white-space:pre-wrap;margin:0;background:transparent;border:0;padding:0">${escapeHtml(_pendingBubbleText)}</pre>${diffBlockHtml(msg.diffFrom, _pendingBubbleText, true)}`;
      } else {
        last.textContent = _pendingBubbleText;   // raw — no escapeHtml, no regex
      }
      if (pinned) msgs.scrollTop = msgs.scrollHeight;
    }
  }
  // Show a spinner in the last assistant bubble while an image is generating.
  // Uses innerHTML with a hardcoded string — no user data interpolated.
  function showImageGenLoading() {
    const last = msgs.querySelector(".msg.assistant:last-of-type .bubble");
    if (last) {
      last.innerHTML = `<div class="gen-img-loading"><div class="spinner"></div>Generating image with Nano Banana…</div>`;
      if (pinned) msgs.scrollTop = msgs.scrollHeight;
    }
  }
  function flushPendingBubbleUpdate() {
    if (_rafId != null) cancelAnimationFrame(_rafId);
    _rafId = null;
    if (_rafPending) {
      _rafPending = false;
      writeLastBubbleText();
    }
    _pendingBubbleText = "";  // clear stale text so it can never bleed onto the next message
  }
  function updateLastBubble(text) {
    _pendingBubbleText = text;
    if (_rafPending) return;          // already scheduled for this frame
    _rafPending = true;
    _rafId = requestAnimationFrame(() => {
      _rafPending = false;
      _rafId = null;
      writeLastBubbleText();
    });
  }

  function updateComparePane(idx, side, branch) {
    const pane = msgs.querySelector(`.msg[data-idx="${idx}"] [data-compare-side="${side}"]`);
    if (!pane) return;
    const status = pane.querySelector(".compare-status");
    const body = pane.querySelector(".compare-body");
    if (status) status.textContent = branch.error ? "error" : branch.done ? "done" : "streaming";
    if (body) body.textContent = branch.error || branch.content || "";
    if (pinned) msgs.scrollTop = msgs.scrollHeight;
  }

  async function streamWithModelValue({ modelValue, messages, onToken, onStats, signal, temperature, numCtx }) {
    if (!modelValue) throw new Error("No model selected.");
    if (modelValue.startsWith("cloud:")) {
      if (privacyLocalEl.checked) throw new Error("Blocked by Privacy: Local only.");
      const { provider, modelId } = parseCloudModel(modelValue);
      if (!provider || !modelId) throw new Error("Invalid cloud model value: " + modelValue);
      if (isImageGenModel(modelValue)) throw new Error("Image generation models are not supported in compare mode.");
      await streamCloudModel(provider, modelId, messages, temperature, onToken, signal);
      return;
    }
    const host = safeHost();
    trackLocalModel(modelValue);
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelValue,
        stream: true,
        keep_alive: -1,
        options: { temperature, num_ctx: numCtx },
        messages,
      }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const parseLine = (line) => {
      if (!line.trim()) return;
      try {
        const evt = JSON.parse(line);
        if (evt.message?.content) onToken(evt.message.content);
        if (evt.done && typeof onStats === "function") onStats(evt);
      } catch {}
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) parseLine(line);
    }
    parseLine(buf);
  }

  // History depth (getHistoryLimit) lives in ui/memory-pane.js; applyMemoryDepth keeps it in sync.
  // 0 = only current user message + system prompt, no history.

  function buildOllamaMessages() {
    const arr = [];
    // Agent's system prompt takes precedence over the Settings one.
    const agent = getActiveAgent();
    const projectInstructions = (currentProject()?.instructions || "").trim();
    const baseSys = (agent && agent.systemPrompt) ? agent.systemPrompt.trim() : systemEl.value.trim();
    const modeSys = isForgeMode() ? FORGE_ARCHITECT_PROMPT : "";
    const sys = [baseSys, modeSys, projectInstructions ? `[PROJECT INSTRUCTIONS]\n${projectInstructions}` : ""].filter(Boolean).join("\n\n");
    if (sys) arr.push({ role: "system", content: sys });

    const all = state.messages;
    // Strip the trailing empty assistant placeholder (the streaming target) so
    // History limit correctly counts only real, completed messages.
    const tail = all[all.length - 1];
    const base = (tail?.role === "assistant" && !tail?.content)
      ? all.slice(0, -1) : all;

    // Grab [last N history messages] + [current user message]. N=0 → current user only.
    const start = Math.max(0, base.length - 1 - getHistoryLimit());
    let lastUserIdx = -1;
    for (let i = base.length - 1; i >= 0; i--) {
      if (base[i].role === "user") { lastUserIdx = i; break; }
    }

    for (let i = start; i < base.length; i++) {
      const m = base[i];
      // Prefer `_modelContent` (has extracted file text) over display-only content.
      const entry = { role: m.role, content: m._modelContent || m.content || "" };
      if (m._imgBase64?.length && i === lastUserIdx) {
        entry.images = m._imgBase64;
        if (!entry.content) entry.content = "Describe what you see in this image.";
      }
      arr.push(entry);
    }
    return arr;
  }

  function compactNumber(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return String(Math.max(0, Math.round(n)));
  }

  function estimatePromptTokens(messages) {
    const chars = JSON.stringify(messages.map(m => ({
      role: m.role,
      content: m.content || "",
      images: m.images ? `[${m.images.length} image(s)]` : undefined,
    }))).length;
    return Math.ceil(chars / 3.8);
  }

  function currentPendingModelContent() {
    const text = input.value.trim();
    const fileBlocks = buildAttachedFileContext(state.pendingFiles);
    if (!text && !fileBlocks && !state.pendingImages.length) return "";
    return fileBlocks ? text + fileBlocks : text;
  }

  function updateContextIndicator() {
    if (!contextWindowEl || !contextTextEl || !contextFillEl) return;
    const messages = buildOllamaMessages();
    const pendingContent = currentPendingModelContent();
    if (pendingContent || state.pendingImages.length) {
      const entry = { role: "user", content: pendingContent || "Describe what you see in this image." };
      if (state.pendingImages.length) entry.images = state.pendingImages.map(i => i.base64);
      messages.push(entry);
    }
    const hasAttachedFileContext = messages.some(m => /\[ATTACHED FILES - use this content when answering\]/.test(m.content || ""));
    const profile = window.HC?.contextCompactor?.getModelProfile?.(modelEl?.value || "") || null;
    const maxTokens = profile
      ? profile.usableTokens
      : (hasAttachedFileContext ? 16384 : (getHistoryLimit() > 0 ? 8192 : 4096));
    const used = window.HC?.contextCompactor?.estimateMessagesTokens?.(messages) || estimatePromptTokens(messages);
    const pct = Math.min(100, Math.round((used / maxTokens) * 100));
    contextTextEl.textContent = `Context ${pct}%`;
    contextFillEl.style.setProperty("--ctx", pct + "%");
    contextWindowEl.classList.toggle("warn", pct >= 70 && pct < 90);
    contextWindowEl.classList.toggle("hot", pct >= 90);
    contextWindowEl.title = `Estimated context: ${compactNumber(used)} / ${compactNumber(maxTokens)} tokens`;
  }

  return {
    send,
    sendCompare,
    abort,
    streamChat,
    streamWithModelValue,
    buildOllamaMessages,
    updateContextIndicator,
    estimatePromptTokens,
    currentPendingModelContent,
    compactNumber,
    writeLastBubbleText,
    showImageGenLoading,
    flushPendingBubbleUpdate,
    updateLastBubble,
    updateComparePane,
  };
}
