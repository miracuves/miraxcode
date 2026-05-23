import {
  LOOK_2026,
  HASH_AI_PROMPT,
  FULLSTACK_PROMPT,
  PRESET_PROMPTS,
  FORGE_ARCHITECT_PROMPT,
} from './presets.js';

export function createMessagesTurnApi(deps, renderApi) {
  const {
    $, state, escapeHtml, safeHost, uid,
    msgs, input, sendBtn, modelEl, activeTitle,
    tpsBtn, tpsVal,
    setStatus, showError, clearError, persistCurrentChat,
    activeChatList, isCodeMode, injectionEnabled,
    cloudModelLabel,
    streamChat, runAgentLoop, queryRAGMerged, addToRAG, memAutoExtractFromAssistant,
    beginAgentRun, finishAgentRun, recordAgentEvent, agentToolNames,
    currentRoute, clearRouteOverride, ROUTE_DEFS, tavilySearch, googleSearch, wikipediaSearch, pubmedSearch,
    buildAttachedFileContext, buildOllamaMessages, HC, HC_CODE,
    updateLastBubble: updateLastBubbleDep,
    flushPendingBubbleUpdate: flushPendingBubbleUpdateDep,
  } = deps;
  const {
    render, cloneMessage, stripReplyPrelude, buildReplyWrappedContent,
    clearReplyTo, clearEditingMessage, setReplyTo, setEditingMessage,
    ensureChatIdForCurrentMessages, lastUserMessage, normalizeUserMessageText, prepareEditBranch,
    setActiveTitle, deriveTitle, estimateGeneratedTokens, setTpsDisplay, setSplitTpsDisplay,
  } = renderApi;

  let pinned = deps.pinned;

  function updateLastBubble(...args) {
    return updateLastBubbleDep?.(...args);
  }
  function flushPendingBubbleUpdate(...args) {
    return flushPendingBubbleUpdateDep?.(...args);
  }

async function runAssistantTurn(seedText, hadAttachments, opts = {}) {
  ensureChatIdForCurrentMessages();

  const assistant = { role: "assistant", content: "", startedAt: Date.now(), ...(opts.diffFrom ? { diffFrom: opts.diffFrom } : {}) };
  state.messages.push(assistant);
  state.streaming = true;
  sendBtn.textContent = "Stop";
  pinned = true;
  if (tpsBtn) tpsBtn.className = "ping-btn tps-btn streaming";
  if (tpsVal) tpsVal.textContent = "…";
  render();

  const route = currentRoute(seedText, hadAttachments);
  if (route?.manual) clearRouteOverride();

  const last = msgs.querySelector(".msg.assistant:last-of-type .bubble");
  const pulse = (label, sub) => {
    if (!last) return;
    last.classList.add("thinking-bubble");
    last.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>
      <div class="thinking-status-label">${escapeHtml(label)}</div>
      ${sub ? `<div class="thinking-status-sub">${escapeHtml(sub)}</div>` : ""}`;
    if (pinned) requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
  };

  const _selectedIsCloud = modelEl.value.startsWith("cloud:");
  const _selectedIsNvidia = !!(route?.route && ROUTE_DEFS[route.route]?.backend === "nvidia");
  const _isExternalModel  = _selectedIsCloud || _selectedIsNvidia;
  const activeAgent = getActiveAgent();

  // ── Code Mode dispatch — HashCoder agent (Tauri only) ───────────────
  if (isCodeMode() && HC.isTauri && window.HC_CODE) {
    const ctrl = new AbortController();
    state.abort = ctrl;
    try {
      const onStatus = (label) => pulse(label, "HashCoder");
      const onFinalToken = () => { updateLastBubble(assistant.content); };
      await HC_CODE.run(assistant, { signal: ctrl.signal, onStatus, onFinalToken });
    } catch (err) {
      if (err.name !== "AbortError") showError(err);
    }
  }

  // ── Agent-mode dispatch ──────────────────────────────────────────────
  // Agent behaviors (system prompt + tools + memory) ONLY fire when an
  // agent is explicitly selected. Without an agent, this is a plain chat
  // — no auto tools, no auto memory injection. That matches the user's
  // mental model: "agent mode = on" only when I pick one.
  else if (activeAgent && injectionEnabled) {
    const ctrl = new AbortController();
    state.abort = ctrl;
    assistant.runTrace = beginAgentRun(activeAgent, seedText);
    recordAgentEvent(assistant, "start", `Agent ${activeAgent.name} started`, { model: modelEl.value, tools: agentToolNames(activeAgent) });
    try {
      const onStatus = (label, kind) => {
        recordAgentEvent(assistant, kind || "status", label);
        pulse(label, agentToolNames(activeAgent).join(" · "));
      };
      const onFinalToken = (delta) => {
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
      await runAgentLoop({ agent: activeAgent, assistant, signal: ctrl.signal, onStatus, onFinalToken });
    } catch (err) {
      recordAgentEvent(assistant, "error", err?.message || String(err || "Agent failed"));
      if (err.name !== "AbortError") showError(err);
    }
    finishAgentRun(assistant);
    flushPendingBubbleUpdate();
  } else {
    // ── Plain chat / route-based search (no agent selected) ───────────
    let toolContext = null;
    if (injectionEnabled && route?.route) {
      const routeDef = ROUTE_DEFS[route.route];
      try {
        if (routeDef?.useSearch === true) {
          pulse("Searching the web…");
          const tav = await tavilySearch(seedText);
          if (tav && (tav.results.length || tav.answer)) {
            const parts = [];
            if (tav.answer) parts.push(tav.answer);
            if (tav.results.length) {
              parts.push(tav.results.map((r,i)=>`${i+1}. ${r.title}: ${r.snippet}`).join("\n"));
              tav.results.forEach(r => addToRAG(r.title, r.snippet, `tavily:${r.url}`));
              if (tav.answer) addToRAG("Tavily synthesized answer", tav.answer, `tavily:answer:${seedText.slice(0,60)}`);
            }
            toolContext = `Sources:\n${parts.join("\n\n")}`;
          } else {
            const goog = await googleSearch(seedText);
            if (goog && goog.length) {
              goog.forEach(r => addToRAG(r.title, r.snippet, `google:${r.url}`));
              toolContext = `Sources:\n` + goog.map((r,i)=>`${i+1}. ${r.title}: ${r.snippet}`).join("\n");
            } else {
              const wiki = await wikipediaSearch(seedText);
              if (wiki.length) {
                wiki.forEach(r => addToRAG(r.title, r.snippet, `wiki:${r.url}`));
                toolContext = `Sources:\n` + wiki.map((r,i)=>`${i+1}. ${r.title}: ${r.snippet}`).join("\n");
              }
            }
          }
        } else if (routeDef?.useSearch === "pubmed") {
          pulse("Searching PubMed…");
          const papers = await pubmedSearch(seedText);
          if (papers.length) {
            papers.forEach(p => addToRAG(p.title, `${p.authors} (${p.year}). ${p.abstract}`, `pubmed:${p.pmid || p.doi || p.url}`));
            toolContext = `Papers:\n` +
              papers.map((p,i)=>`${i+1}. ${p.title} (${p.year}${p.pmid ? `, PMID:${p.pmid}` : ""}): ${p.abstract}`).join("\n\n");
          }
        }
      } catch (e) { console.warn("Route search failed:", e); }

      if (!_isExternalModel) {
        const ragChunks = await queryRAGMerged(seedText);
        if (ragChunks.length) {
          const ragBlock = `Background:\n` + ragChunks.map((c,i) => `${i+1}. ${c.title}: ${c.text}`).join("\n\n");
          toolContext = toolContext ? `${toolContext}\n\n${ragBlock}` : ragBlock;
        }
      }
    }
    try {
      await streamChat(assistant, toolContext, route);
    } finally {
      flushPendingBubbleUpdate();
    }
  }

  assistant.completedAt = Date.now();
  if (assistant.startedAt) assistant.durationMs = assistant.completedAt - assistant.startedAt;
  if ((assistant.tpsSource === "estimated" || !assistant.tps) && assistant.content) {
    const elapsed = ((assistant.completedAt || Date.now()) - (assistant.firstTokenAt || assistant.startedAt || Date.now())) / 1000;
    if (elapsed > 0) {
      const tokens = assistant.generatedTokens || estimateGeneratedTokens(assistant.content);
      assistant.tps = Math.max(1, Math.round(tokens / elapsed));
      assistant.tpsSource = assistant.tpsSource || "estimated";
      setTpsDisplay(assistant.tps);
    }
  }
  state.streaming = false;
  sendBtn.textContent = "Send";
  if (tpsBtn && !assistant.tps) {
    tpsBtn.className = "ping-btn tps-btn";
    if (tpsVal) tpsVal.textContent = "— t/s";
  }
  // Auto-extract facts from the assistant's final reply (covers "noted, you live in X" etc.)
  try { if (assistant.content) memAutoExtractFromAssistant(assistant.content); } catch {}
  render();
  persistCurrentChat();
  const current = activeChatList().find(c => c.id === state.currentChatId);
  if (current) setActiveTitle(current.title);
}

async function regenerateFromAssistant(idx) {
  if (state.streaming) return;
  const target = state.messages[idx];
  if (!target || target.role !== "assistant") return;
  const base = state.messages.slice(0, idx).map(cloneMessage);
  const user = lastUserMessage(base);
  if (!user) return;
  state.currentChatId = uid();
  state.messages = base;
  state.pendingImages = [];
  state.pendingFiles = [];
  clearReplyTo();
  clearEditingMessage();
  await runAssistantTurn(normalizeUserMessageText(user), !!(user.images?.length || user.attachments?.length), { diffFrom: target.content || "" });
}

  return { runAssistantTurn, regenerateFromAssistant };
}
