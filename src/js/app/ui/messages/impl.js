import {
  LOOK_2026,
  HASH_AI_PROMPT,
  FULLSTACK_PROMPT,
  PRESET_PROMPTS,
  FORGE_ARCHITECT_PROMPT,
} from './presets.js';

export function createMessagesApi(deps) {
  const {
    $, state, escapeHtml, safeHost, uid, parseCloudModel,
    msgs, input, sendBtn, modelEl, tempEl, activeTitle, activeSub, pending, pinned: pinnedInitial,
    tpsBtn, tpsVal,
    setStatus, showError, clearError, saveSettings, saveActiveChatList, persistCurrentChat,
    activeChatList, isCodeMode, isForgeMode, deriveTitle, getActiveAgent, injectionEnabled,
    cloudModelLabel, populateCloudModels, fetchLoadedLocalModels, unloadLocalModels,
    streamChat, runAgentLoop, queryRAGMerged, addToRAG, memAutoExtractFromAssistant,
    beginAgentRun, finishAgentRun, recordAgentEvent, agentToolNames,
    currentRoute, clearRouteOverride, ROUTE_DEFS, tavilySearch, googleSearch, wikipediaSearch, pubmedSearch,
    buildAttachedFileContext, buildOllamaMessages, themedAlert, themedConfirm, HC, HC_CODE,
    renderPending, updateContextIndicator, fileKindIcon, fileCharLabel,
    renderChatList, setTab, newChat, exportConversation,
    updateLastBubble: updateLastBubbleDep,
    flushPendingBubbleUpdate: flushPendingBubbleUpdateDep,
  } = deps;

  let pinned = pinnedInitial;

// Shared preset handler — runs whether the chip was clicked on the
// empty-state splash or on the composer-level chip row mid-conversation.
async function applyPreset(preset, chipEl) {
  input.value = PRESET_PROMPTS[preset] || (chipEl && chipEl.dataset.q) || "";
  input.focus();
  input.dispatchEvent(new Event("input"));
  // Free RAM chip also unloads every currently-loaded model on the local host.
  if (preset === "freeRam") {
    const host = safeHost();
    setStatus("warn", "Freeing RAM on the local host…");
    try {
      const snap = await fetchLoadedLocalModels(host, 5000);
      const names = snap.names;
      await unloadLocalModels(names);
      setStatus("ok", names.length
        ? `RAM freed · unloaded ${names.length} model${names.length === 1 ? "" : "s"} · speed mode prompt ready`
        : `No models were loaded · speed mode prompt ready`);
    } catch (err) {
      console.error("[freeRam] failed:", err);
      setStatus("warn", "Could not reach the local host — speed prompt loaded anyway");
    }
  }
}

// Wire the persistent composer-level chip row once, on startup. The chips
// inside .empty get re-wired each time render() redraws the empty state.
const composerChips = $("composerChips");
if (composerChips) {
  composerChips.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-preset]");
    if (!b) return;
    applyPreset(b.dataset.preset, b);
  });
}

const MAX_RENDER_MSGS = 80;
let _msgsVirtual = null;

function getMsgsVirtual() {
  if (!_msgsVirtual && window.CdrChatVirtual && msgs) {
    _msgsVirtual = new window.CdrChatVirtual(msgs);
  }
  return _msgsVirtual;
}

function render() {
  msgs.innerHTML = "";
  // Toggle the .has-chat class so the composer chips row only appears once
  // the conversation has actually started — keeps the empty splash clean.
  document.getElementById("app").classList.toggle("has-chat", state.messages.length > 0);
  if (state.messages.length === 0) {
    getMsgsVirtual()?.enterLiveMode();
    msgs.innerHTML = `
      <div class="empty">
        <div class="empty-inner">
          <div class="crest-wrap">
            <img src="/assets/logo-mark.png" class="crest-logo-img" draggable="false" alt="MiraXcode"/>
          </div>
          <p>Massive UI . Isolated Intellegence . Agentic<span class="drone-inline"><svg viewBox="0 0 200 120" width="40" height="24" overflow="visible" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="dg-s" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f5d77a"/><stop offset="0.5" stop-color="#c9a96e"/><stop offset="1" stop-color="#8a6a10"/></linearGradient><radialGradient id="dr-s" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="rgba(201,169,110,0.40)"/><stop offset="1" stop-color="rgba(201,169,110,0)"/></radialGradient></defs><line x1="40" y1="40" x2="160" y2="80" stroke="url(#dg-s)" stroke-width="3" stroke-linecap="round"/><line x1="160" y1="40" x2="40" y2="80" stroke="url(#dg-s)" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="40" r="20" fill="url(#dr-s)"/><circle cx="160" cy="40" r="20" fill="url(#dr-s)"/><circle cx="40" cy="80" r="20" fill="url(#dr-s)"/><circle cx="160" cy="80" r="20" fill="url(#dr-s)"/><g><ellipse cx="40" cy="40" rx="15" ry="2" fill="url(#dg-s)" opacity="0.9"/><ellipse cx="40" cy="40" rx="2" ry="15" fill="url(#dg-s)" opacity="0.9"/><animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="0.78s" repeatCount="indefinite"/></g><g><ellipse cx="160" cy="40" rx="15" ry="2" fill="url(#dg-s)" opacity="0.9"/><ellipse cx="160" cy="40" rx="2" ry="15" fill="url(#dg-s)" opacity="0.9"/><animateTransform attributeName="transform" type="rotate" from="0 160 40" to="-360 160 40" dur="0.70s" repeatCount="indefinite"/></g><g><ellipse cx="40" cy="80" rx="15" ry="2" fill="url(#dg-s)" opacity="0.9"/><ellipse cx="40" cy="80" rx="2" ry="15" fill="url(#dg-s)" opacity="0.9"/><animateTransform attributeName="transform" type="rotate" from="0 40 80" to="-360 40 80" dur="0.84s" repeatCount="indefinite"/></g><g><ellipse cx="160" cy="80" rx="15" ry="2" fill="url(#dg-s)" opacity="0.9"/><ellipse cx="160" cy="80" rx="2" ry="15" fill="url(#dg-s)" opacity="0.9"/><animateTransform attributeName="transform" type="rotate" from="0 160 80" to="360 160 80" dur="0.74s" repeatCount="indefinite"/></g><rect x="72" y="46" width="56" height="28" rx="8" fill="rgba(8,10,18,0.95)" stroke="url(#dg-s)" stroke-width="1.5"/><rect x="78" y="52" width="14" height="9" rx="2" fill="url(#dg-s)" opacity="0.8"/><circle cx="118" cy="60" r="2.5" fill="#f5d77a"/><line x1="80" y1="74" x2="75" y2="94" stroke="url(#dg-s)" stroke-width="1.5" stroke-linecap="round"/><line x1="120" y1="74" x2="125" y2="94" stroke="url(#dg-s)" stroke-width="1.5" stroke-linecap="round"/><line x1="75" y1="94" x2="125" y2="94" stroke="url(#dg-s)" stroke-width="1.6" stroke-linecap="round"/><circle cx="100" cy="60" r="1.6" fill="#f5d77a"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.6s" begin="0.3s" repeatCount="indefinite"/></circle></svg></span></p>
          <div class="chips">
            <button data-preset="hashAi">Initialize MiraXcode</button>
            <button data-preset="fullstack">Full Stack website</button>
            <button data-preset="mobile">Mobile App</button>
            <button data-preset="freeRam" title="Unloads all models on the local host to free RAM and preps a speed-mode prompt"><svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" style="vertical-align:-1px"><polyline points="10,2 6,8.5 9.5,8.5 6,14"/></svg> Free RAM · Speed mode</button>
          </div>
        </div>
      </div>`;
    msgs.querySelectorAll(".chips button").forEach(b =>
      b.addEventListener("click", () => applyPreset(b.dataset.preset, b))
    );
    updateContextIndicator();
    return;
  }

  const hidden = Math.max(0, state.messages.length - MAX_RENDER_MSGS);
  const slice = hidden > 0 ? state.messages.slice(-MAX_RENDER_MSGS) : state.messages;
  const startIdx = hidden;

  if (!state.streaming && slice.length > 15 && window.CdrChatVirtual) {
    const v = getMsgsVirtual();
    v.setMessages(
      slice,
      (m, i) => renderMessage(m, startIdx + i),
      { hiddenCount: hidden }
    );
    msgs.scrollTop = msgs.scrollHeight;
    updateContextIndicator();
    requestAnimationFrame(() => {
      renderMermaidDiagrams();
      window.HC_CODE?.afterRender?.();
    });
    return;
  }

  getMsgsVirtual()?.enterLiveMode();
  if (hidden > 0) {
    const note = document.createElement("div");
    note.className = "msg-truncated-note";
    note.textContent = `${hidden} earlier message${hidden === 1 ? "" : "s"} hidden for performance — export chat for full history`;
    msgs.appendChild(note);
  }
  slice.forEach((m, i) => msgs.appendChild(renderMessage(m, startIdx + i)));
  msgs.scrollTop = msgs.scrollHeight;
  updateContextIndicator();
  requestAnimationFrame(() => {
    renderMermaidDiagrams();
    window.HC_CODE?.afterRender?.();
  });
}

function stripReplyPrelude(text) {
  const raw = String(text || "");
  const parts = raw.split(/\n\n(?=[^>])/);
  if (parts.length > 1 && /^Replying to /.test(parts[0])) {
    return parts.slice(1).join("\n\n");
  }
  return raw;
}

function buildReplyWrappedContent(baseText, replyMeta) {
  if (!replyMeta || !state.messages[replyMeta.idx]) return baseText;
  const src = state.messages[replyMeta.idx];
  const quoted = (src.content || "").split("\n").map(l => "> " + l).join("\n");
  const whose = src.role === "assistant" ? "the assistant's earlier reply" : "my earlier message";
  return `Replying to ${whose}:\n${quoted}\n\n${baseText}`;
}

function diffWordsHtml(oldText, newText) {
  const oldWords = String(oldText || "").trim().split(/\s+/).filter(Boolean).slice(0, 260);
  const newWords = String(newText || "").trim().split(/\s+/).filter(Boolean).slice(0, 260);
  if (!oldWords.length && !newWords.length) return "";
  const n = oldWords.length, m = newWords.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldWords[i] === newWords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (oldWords[i] === newWords[j]) {
      out.push(escapeHtml(newWords[j]));
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`<span class="diff-del">${escapeHtml(oldWords[i])}</span>`);
      i++;
    } else {
      out.push(`<span class="diff-add">${escapeHtml(newWords[j])}</span>`);
      j++;
    }
  }
  while (i < n) out.push(`<span class="diff-del">${escapeHtml(oldWords[i++])}</span>`);
  while (j < m) out.push(`<span class="diff-add">${escapeHtml(newWords[j++])}</span>`);
  const truncated = /\s/.test(String(oldText).trim().split(/\s+/).slice(260).join(" ")) ||
    /\s/.test(String(newText).trim().split(/\s+/).slice(260).join(" "));
  return out.join(" ") + (truncated ? ` <span class="diff-add">…</span>` : "");
}

function diffBlockHtml(oldText, newText, live = false) {
  const body = diffWordsHtml(oldText, newText);
  if (!body) return "";
  return `<div class="diff-box"><div class="diff-title">${live ? "Live regenerate diff" : "Regenerate diff"}</div><div class="diff-text">${body}</div></div>`;
}

function cloneMessage(msg) {
  return {
    ...msg,
    images: msg.images ? msg.images.slice() : undefined,
    attachments: msg.attachments ? msg.attachments.map(a => typeof a === "object" ? { ...a } : a) : undefined,
    _imgBase64: msg._imgBase64 ? msg._imgBase64.slice() : undefined,
    replyTo: msg.replyTo ? { ...msg.replyTo } : undefined,
  };
}

function renderMessage(m, idx) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${m.role}`;
  wrap.dataset.idx = idx;
  const av = document.createElement("div");
  av.className = "avatar";
  av.textContent = m.role === "user" ? "You" : "AI";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (m.compare) {
    wrap.classList.add("compare-msg");
    bubble.classList.add("has-actions");
    const paneHtml = (side) => {
      const branch = m.compare[side] || {};
      const status = branch.error ? "error" : branch.done ? "done" : "streaming";
      const body = branch.done || branch.error
        ? formatContent(branch.error ? branch.error : (branch.content || ""))
        : `<div class="typing"><span></span><span></span><span></span></div><pre style="white-space:pre-wrap;margin-top:10px">${escapeHtml(branch.content || "")}</pre>`;
      return `<div class="compare-pane" data-compare-side="${side}">
        <div class="compare-head"><span class="compare-model">${escapeHtml(cloudModelLabel(branch.model) || branch.model || side)}</span><span class="compare-status">${escapeHtml(status)}</span></div>
        <div class="compare-body">${body}</div>
      </div>`;
    };
    bubble.innerHTML = `<div class="compare-grid">${paneHtml("left")}${paneHtml("right")}</div>`;
    if (!(idx === state.messages.length - 1 && state.streaming)) {
      const actions = document.createElement("div");
      actions.className = "msg-actions";
      actions.innerHTML = `
        <button class="msg-action" data-action="copy-msg" title="Copy both comparison replies">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          Copy
        </button>`;
      bubble.appendChild(actions);
    }
    wrap.appendChild(av); wrap.appendChild(bubble);
    return wrap;
  }
  // If this user message was a reply to an earlier one, show a compact
  // quote badge at the top of the bubble (clickable → scrolls to source).
  let displayContent = m.content || "";
  if (m.role === "user" && m.replyTo) {
    const srcRole = m.replyTo.role === "assistant" ? "AI" : "You";
    const srcPreview = m.replyTo.preview || "(empty message)";
    const quote = document.createElement("div");
    quote.className = "reply-quote";
    quote.dataset.target = String(m.replyTo.idx);
    quote.innerHTML = `
      <span class="reply-quote-role">↳ ${srcRole}</span>
      <span class="reply-quote-text">${escapeHtml(srcPreview)}</span>`;
    bubble.appendChild(quote);
    // Strip the auto-generated quoted block from the displayed content so
    // the user's actual message shows clean. We built it as:
    // "Replying to ... :\n> quoted...\n\n<real text>"
    displayContent = stripReplyPrelude(displayContent);
  }
  const isStreamingPlaceholder = m.role === "assistant" && idx === state.messages.length - 1 && state.streaming;
  if (displayContent || !isStreamingPlaceholder) {
    // Use cached HTML for finished messages so formatContent never runs twice
    // for the same message content. Cache is keyed on the message object so
    // it dies automatically when the message is GC'd.
    let html;
    if (!isStreamingPlaceholder) {
      if (!_htmlCache.has(m)) _htmlCache.set(m, formatContent(displayContent));
      html = _htmlCache.get(m);
    } else {
      html = formatContent(displayContent); // streaming — content still changing
    }
    const body = document.createElement("div");
    body.innerHTML = html;
    while (body.firstChild) bubble.appendChild(body.firstChild);
    if (m.role === "assistant" && m.diffFrom && displayContent) {
      bubble.insertAdjacentHTML("beforeend", diffBlockHtml(m.diffFrom, displayContent, isStreamingPlaceholder));
    }
  } else {
    bubble.insertAdjacentHTML("beforeend", `<div class="typing"><span></span><span></span><span></span></div>`);
  }
  if (m.images?.length) {
    m.images.forEach((dataUrl, imgIdx) => {
      const isGenerated = m.role === "assistant"; // user images are inputs; assistant images are generated
      if (isGenerated) {
        const wrap = document.createElement("div");
        wrap.className = "gen-img-wrap";
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "Generated image";
        // Download button
        const dlBtn = document.createElement("button");
        dlBtn.className = "gen-img-dl";
        dlBtn.title = "Download image";
        dlBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Save`;
        dlBtn.addEventListener("click", () => {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `hash-image-${Date.now()}.png`;
          a.click();
        });
        // Copy button
        const cpBtn = document.createElement("button");
        cpBtn.className = "gen-img-copy";
        cpBtn.title = "Copy image to clipboard";
        cpBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy`;
        cpBtn.addEventListener("click", async () => {
          try {
            const res2 = await fetch(dataUrl);
            const blob = await res2.blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            const prev = cpBtn.innerHTML;
            cpBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied`;
            setTimeout(() => { cpBtn.innerHTML = prev; }, 1600);
          } catch { cpBtn.textContent = "n/a"; }
        });
        wrap.appendChild(img);
        wrap.appendChild(cpBtn);
        wrap.appendChild(dlBtn);
        bubble.appendChild(wrap);
      } else {
        const img = document.createElement("img");
        img.src = dataUrl; bubble.appendChild(img);
      }
    });
  }
  if (m.attachments?.length) {
    const at = document.createElement("div");
    at.className = "attachments";
    m.attachments.forEach(a => {
      const s = document.createElement("span");
      s.className = "attachment";
      // `a` is either a plain filename (legacy saved chats) or a rich
      // object { name, kind, pages }. Handle both so old chats still open.
      const name = typeof a === "string" ? a : a.name;
      const kind = typeof a === "string" ? "file" : (a.kind || "file");
      const pages = typeof a === "object" ? a.pages : undefined;
      const chars = typeof a === "object" ? fileCharLabel(a.chars) : "";
      const extra = [pages ? `${pages}p` : "", chars].filter(Boolean).join(" · ");
      s.innerHTML = `${fileKindIcon(kind)} <span>${escapeHtml(name)}${extra ? ` · ${escapeHtml(extra)}` : ""}</span>`;
      at.appendChild(s);
    });
    bubble.appendChild(at);
  }
  // Duration chip — floats at the top-right of every finished assistant reply.
  // Shows the response time when available; falls back to "—" for old chats
  // that were saved before we started persisting durationMs.
  if (m.role === "assistant" && m.content && !(idx === state.messages.length - 1 && state.streaming)) {
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    const label = m.durationMs ? formatDuration(m.durationMs) : "—";
    meta.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <polyline points="12 7 12 12 15.5 14"/>
      </svg>
      <span><b>${escapeHtml(label)}</b></span>`;
    bubble.classList.add("has-meta");
    bubble.appendChild(meta);
  }
  // Message-action row — assistant replies get reply/copy/regenerate.
  if (m.role === "assistant" && m.content && !(idx === state.messages.length - 1 && state.streaming)) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    if (state.replyTo && state.replyTo.idx === idx) actions.classList.add("pinned");
    actions.innerHTML = `
      <button class="msg-action" data-action="reply" title="Reply to this message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        Reply
      </button>
      <button class="msg-action" data-action="copy-msg" title="Copy the full reply">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        Copy
      </button>
      <button class="msg-action" data-action="regenerate" title="Regenerate from the previous prompt">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M20.5 15a9 9 0 0 1-14.13 3.36L1 14"/></svg>
        Regenerate
      </button>`;
    bubble.classList.add("has-actions");
    bubble.appendChild(actions);
  }
  if (m.role === "user" && m.content) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    if (state.editing && state.editing.idx === idx) actions.classList.add("pinned");
    actions.innerHTML = `
      <button class="msg-action" data-action="edit-msg" title="Edit this message and branch from here">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        Edit
      </button>
      <button class="msg-action" data-action="copy-msg" title="Copy this message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        Copy
      </button>`;
    bubble.classList.add("has-actions");
    bubble.appendChild(actions);
  }
  // Highlight the message currently being replied to.
  if (state.replyTo && state.replyTo.idx === idx) wrap.classList.add("reply-target");
  if (state.editing && state.editing.idx === idx) wrap.classList.add("reply-target");
  wrap.appendChild(av); wrap.appendChild(bubble);
  return wrap;
}

// --- Reply-to-message wiring ---
const replyBanner = $("replyBanner");
const replyPreview = $("replyPreview");
const replyLabelRole = $("replyLabelRole");
const replyClose = $("replyClose");
const editBanner = $("editBanner");
const editPreview = $("editPreview");
const editClose = $("editClose");

function setReplyTo(idx) {
  const m = state.messages[idx];
  if (!m) return;
  state.editing = null;
  editBanner.classList.remove("visible");
  if (!state.streaming) sendBtn.textContent = "Send";
  const raw = (m.content || "").replace(/\s+/g, " ").trim();
  const preview = raw.length > 180 ? raw.slice(0, 180) + "…" : raw;
  state.replyTo = { idx, role: m.role, preview };
  replyLabelRole.textContent = m.role === "assistant" ? "AI" : "your message";
  replyPreview.textContent = preview || "(empty message)";
  replyBanner.classList.add("visible");
  input.focus();
  render(); // re-render so the pinned highlight appears
}
function clearReplyTo() {
  state.replyTo = null;
  replyBanner.classList.remove("visible");
  render();
}
function setEditingMessage(idx) {
  const m = state.messages[idx];
  if (!m || m.role !== "user") return;
  state.editing = { idx, original: cloneMessage(m) };
  state.replyTo = null;
  state.pendingImages = [];
  state.pendingFiles = [];
  renderPending();
  replyBanner.classList.remove("visible");
  input.value = stripReplyPrelude(m.content || "");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
  editPreview.textContent = (input.value || "(empty message)").replace(/\s+/g, " ").trim().slice(0, 180) || "(empty message)";
  editBanner.classList.add("visible");
  if (!state.streaming) sendBtn.textContent = "Branch";
  input.focus();
  render();
}
function clearEditingMessage() {
  state.editing = null;
  editBanner.classList.remove("visible");
  if (!state.streaming) sendBtn.textContent = "Send";
  render();
}
replyClose.addEventListener("click", clearReplyTo);
editClose.addEventListener("click", clearEditingMessage);

// Click a reply-quote badge → jump to and briefly flash the source message.
msgs.addEventListener("click", (e) => {
  const q = e.target.closest(".reply-quote");
  if (!q) return;
  const targetIdx = Number(q.dataset.target);
  if (!Number.isFinite(targetIdx)) return;
  const target = msgs.querySelector(`.msg[data-idx="${targetIdx}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("flash"); // retrigger animation
  // Force reflow so the animation actually restarts.
  void target.offsetWidth;
  target.classList.add("flash");
});

// Delegate Reply/Copy clicks on assistant bubbles. Copy-code is handled
// separately further down; keep this listener narrow so they don't conflict.
msgs.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="reply"], [data-action="copy-msg"], [data-action="edit-msg"], [data-action="regenerate"]');
  if (!btn) return;
  const msgEl = btn.closest(".msg");
  if (!msgEl) return;
  const idx = Number(msgEl.dataset.idx);
  if (!Number.isFinite(idx)) return;
  const action = btn.dataset.action;
  if (action === "reply") {
    setReplyTo(idx);
    return;
  }
  if (action === "edit-msg") {
    setEditingMessage(idx);
    return;
  }
  if (action === "regenerate") {
    regenerateFromAssistant(idx);
    return;
  }
  if (action === "copy-msg") {
    const text = state.messages[idx]?.content || "";
    const done = () => {
      const prev = btn.innerHTML;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied`;
      setTimeout(() => { btn.innerHTML = prev; }, 1300);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
    else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); done(); } catch {}
      document.body.removeChild(ta);
    }
  }
});

// Human-friendly duration formatter ("812 ms", "4.3s", "1m 12s").
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function updateLastBubble(...args) {
  return updateLastBubbleDep?.(...args);
}

function flushPendingBubbleUpdate(...args) {
  return flushPendingBubbleUpdateDep?.(...args);
}

function estimateGeneratedTokens(text) {
  if (!text) return 0;
  const compact = String(text).trim();
  if (!compact) return 0;
  return Math.max(1, Math.ceil(compact.length / 3.8));
}

function setTpsDisplay(tps) {
  if (!Number.isFinite(tps) || tps <= 0) return;
  const rounded = Math.max(1, Math.round(tps));
  if (tpsVal) tpsVal.textContent = `${rounded} t/s`;
  if (tpsBtn) {
    tpsBtn.className = "ping-btn tps-btn" +
      (rounded >= 10 ? " tps-fast" : rounded >= 4 ? " tps-mid" : "");
  }
}

function setSplitTpsDisplay(compare) {
  const left = compare?.left?.tps;
  const right = compare?.right?.tps;
  const fmt = (v) => Number.isFinite(v) && v > 0 ? Math.max(1, Math.round(v)) : "…";
  if (tpsVal) tpsVal.textContent = `L${fmt(left)} · R${fmt(right)}`;
  if (tpsBtn) {
    const vals = [left, right].filter(v => Number.isFinite(v) && v > 0);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    tpsBtn.className = "ping-btn tps-btn split-tps streaming" +
      (avg >= 10 ? " tps-fast" : avg >= 4 ? " tps-mid" : "");
    tpsBtn.title = "Tokens per second — left and right split models";
  }
}

// Escape map hoisted out of the replace callback — allocated once, not per call.
/** Only absolute http(s) URLs for markdown links — blocks javascript:, data:, etc. */
function safeMarkdownHref(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username !== "" || u.password !== "") return null;
    return u.href;
  } catch {
    return null;
  }
}
function extractMarkedLinkArgs(args) {
  const first = args[0];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const label = first.tokens?.map(t => t.raw || t.text || "").join("") || first.text || first.href || "";
    return { href: first.href || "", title: first.title || "", text: label };
  }
  return {
    href: first || "",
    title: args[1] || "",
    text: args[2] || first || "",
  };
}
function extractMarkedCodeArgs(args) {
  const first = args[0];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    return { text: first.text || "", lang: first.lang || "" };
  }
  return { text: first || "", lang: args[1] || "" };
}
function decodeHtmlEntities(s) {
  let t = String(s || "");
  if (!t) return "";
  t = t.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
    const c = parseInt(hex, 16);
    return Number.isFinite(c) && c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : _;
  });
  t = t.replace(/&#(\d+);/g, (_, dec) => {
    const c = parseInt(dec, 10);
    return Number.isFinite(c) && c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : _;
  });
  t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
  t = t.replace(/&amp;/g, "&");
  return t;
}
const markdownRenderer = (() => {
  if (!window.marked?.Renderer) return null;
  const renderer = new window.marked.Renderer();
  renderer.link = function(...args) {
    const { href, title, text } = extractMarkedLinkArgs(args);
    const resolved = safeMarkdownHref(href);
    const label = escapeHtml(text || href || "");
    if (!resolved) {
      return `<span class="md-link-blocked" title="Only http(s) links are allowed">${label}</span>`;
    }
    const safeHref = escapeHtml(resolved);
    const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${safeTitle}>${escapeHtml(text || href || "")}</a>`;
  };
  renderer.code = function(...args) {
    const { text, lang } = extractMarkedCodeArgs(args);
    const src = decodeHtmlEntities(text).replace(/\n$/, "");
    const label = (lang || "").trim().split(/\s+/)[0];
    if (label.toLowerCase() === "mermaid") {
      return `<div class="mermaid-wrap"><div class="mermaid">${escapeHtml(src)}</div></div>`;
    }
    let html = escapeHtml(src);
    if (window.hljs) {
      try {
        html = label && window.hljs.getLanguage(label)
          ? window.hljs.highlight(src, { language: label, ignoreIllegals: true }).value
          : window.hljs.highlightAuto(src).value;
      } catch {}
    }
    const langBadge = label ? `<span class="code-lang">${escapeHtml(label)}</span>` : "";
    return `<div class="code-block">${langBadge}<button class="copy-btn" data-action="copy-code">Copy</button><pre><code class="hljs${label ? ` language-${escapeHtml(label)}` : ""}">${html}</code></pre></div>`;
  };
  return renderer;
})();

function fallbackFormatContent(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderMermaidDiagrams() {
  if (!window.mermaid) return;
  try {
    window.mermaid.run({ nodes: msgs.querySelectorAll(".mermaid:not([data-processed='true'])") });
  } catch (err) {
    console.warn("[mermaid] render failed:", err);
  }
}

function formatContent(text) {
  if (!window.marked || !markdownRenderer) return fallbackFormatContent(text);
  const safe = String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  try {
    const raw = `<div class="markdown-body">${window.marked.parse(safe, {
      gfm: true,
      breaks: true,
      silent: true,
      renderer: markdownRenderer,
    })}</div>`;
    // Final pass: strip anything that slipped through (script, iframe, event handlers, javascript: URLs)
    // ADD_ATTR preserves renderer-added attributes DOMPurify strips by default
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(raw, {
        ADD_ATTR: ["target", "rel", "data-action", "data-processed", "data-language"],
        FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "meta", "link", "base"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onkeydown", "onkeyup", "onsubmit", "action", "formaction"],
      });
    }
    return raw;
  } catch {
    return fallbackFormatContent(text);
  }
}

// WeakMap cache: formatContent runs once per finalized message object,
// never again on subsequent render() calls. Entries die with the object.
const _htmlCache = new WeakMap();

// Delegate copy-button clicks inside the messages pane
msgs.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="copy-code"]');
  if (!btn) return;
  const codeEl = btn.parentElement.querySelector("pre code");
  if (!codeEl) return;
  const text = codeEl.textContent;
  const done = () => {
    const old = btn.textContent;
    btn.textContent = "Copied";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = old || "Copy"; btn.classList.remove("copied"); }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); done(); } catch {}
      document.body.removeChild(ta);
    });
  } else {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand("copy"); done(); } catch {}
    document.body.removeChild(ta);
  }
});

// Trim any title down to at most four words for the topbar crumb —
// keeps the header compact while the sidebar list still shows the full title.
function shortTitle(title, maxWords) {
  if (!title) return "";
  const clean = String(title).trim().replace(/\s+/g, " ");
  if (!clean) return "";
  const lim = maxWords || 4;
  const words = clean.split(" ");
  if (words.length <= lim) return clean;
  return words.slice(0, lim).join(" ") + "…";
}
function setActiveTitle(title) {
  const full = title || "";
  activeTitle.textContent = shortTitle(full) || "New Conversation";
  activeTitle.title = full + " — double-click to rename";
}

// Double-click the header title to rename the active chat inline.
activeTitle.addEventListener("dblclick", () => {
  if (!state.currentChatId) return; // nothing to rename
  const chatList = activeChatList();
  const chat = chatList.find(c => c.id === state.currentChatId);
  if (!chat) return;
  const prev = chat.title || "";
  activeTitle.contentEditable = "true";
  activeTitle.textContent = prev;
  activeTitle.focus();
  // Select all
  const range = document.createRange();
  range.selectNodeContents(activeTitle);
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(range);
  function finishRename() {
    activeTitle.contentEditable = "false";
    const newTitle = activeTitle.textContent.trim() || prev;
    chat.title = newTitle;
    saveActiveChatList();
    setActiveTitle(newTitle);
    renderChatList();
  }
  activeTitle.addEventListener("keydown", function kd(e) {
    if (e.key === "Enter") { e.preventDefault(); activeTitle.removeEventListener("keydown", kd); finishRename(); }
    if (e.key === "Escape") { activeTitle.removeEventListener("keydown", kd); activeTitle.contentEditable = "false"; setActiveTitle(prev); }
  });
  activeTitle.addEventListener("blur", function bl() {
    activeTitle.removeEventListener("blur", bl);
    finishRename();
  });
});

function ensureChatIdForCurrentMessages() {
  if (!state.currentChatId) state.currentChatId = uid();
  setActiveTitle(deriveTitle(state.messages));
}

function lastUserMessage(messages) {
  const arr = messages || state.messages;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].role === "user") return arr[i];
  }
  return null;
}

function normalizeUserMessageText(msg) {
  return stripReplyPrelude(msg?.content || "").trim();
}

function prepareEditBranch(idx, newText) {
  const original = state.messages[idx];
  const branched = state.messages.slice(0, idx).map(cloneMessage);
  const replyMeta = original.replyTo ? { ...original.replyTo } : null;
  const content = replyMeta ? buildReplyWrappedContent(newText, replyMeta) : newText;
  const next = cloneMessage(original);
  next.content = content;
  next.replyTo = replyMeta || undefined;
  if (original._modelContent) {
    next._modelContent = original._modelContent.startsWith(original.content || "")
      ? content + original._modelContent.slice((original.content || "").length)
      : content;
  }
  branched.push(next);
  return branched;
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

  return {
    LOOK_2026, HASH_AI_PROMPT, FULLSTACK_PROMPT, PRESET_PROMPTS, FORGE_ARCHITECT_PROMPT,
    applyPreset, render, renderPending, updateContextIndicator, deriveTitle, cloneMessage,
    shortTitle, setActiveTitle, ensureChatIdForCurrentMessages, lastUserMessage,
    normalizeUserMessageText, prepareEditBranch, runAssistantTurn, regenerateFromAssistant,
    stripReplyPrelude, buildReplyWrappedContent, diffBlockHtml, clearReplyTo, clearEditingMessage,
    setReplyTo, setEditingMessage, formatContent, updateLastBubble, flushPendingBubbleUpdate,
    setTpsDisplay, setSplitTpsDisplay, estimateGeneratedTokens,
  };
}
