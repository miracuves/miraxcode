// MiraXCode Virtual OS — Wave 10
import { $, esc, uid, nowIso } from './utils.js';
import { makeZip } from './zip.js';
import { createVoidStorage, ROOT_ID, TRASH_ID } from './storage.js';
import { createVoidChatApi } from './chat.js';
import { createVoidGenerateApi, createVoidWireEventsApi } from './generate.js';
import { createVoidDesktopApi, clampDesktopPosition as clampDesktopPos } from './desktop.js';


const VoidStudio = (() => {
  const state = {
    dbPromise: null,
    projects: [],
    activeProject: null,
    activeFolderId: ROOT_ID,
  };

  let initialized = false;
  let mounted = false;
  let selectedId = "";
  let editingId = "";
  let runAbort = null;
  let finderCollapsed = true;
  let finderHistory    = [];
  let finderHistoryIdx = -1;
  let finderViewMode   = "list"; // "list" | "grid"
  let forceEditMode    = false;
  let dialogResolve = null;
  let clockTimer = null;
  let selectedSystemIconId = "";
  let agentOSMode   = false;
  let termCwd       = "/";
  let termLines     = [];
  let termHistory   = [];
  let termHistIdx   = -1;
  let voidChatApi = null;
  let voidGenerateApi = null;
  let voidWireEventsApi = null;
  let voidDesktopApi = null;
  let _traceStartTime = Date.now();

  const clampDesktopPosition = (pos) => clampDesktopPos($, pos);

  const _TRACE_ICONS = {
    ok:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>`,
    run:   `<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    warn:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  function log(message, kind = "info") {
    const entries = $("voidTraceEntries");
    if (!entries) return;

    const elapsed = ((Date.now() - _traceStartTime) / 1000).toFixed(1);
    const cssKind  = kind === "error" ? "error" : (kind || "info");
    const icon     = _TRACE_ICONS[cssKind] || _TRACE_ICONS.info;

    const row = document.createElement("div");
    row.className = `void-trace-entry void-te-${cssKind}`;
    row.innerHTML =
      `<span class="te-icon">${icon}</span>` +
      `<span class="te-msg">${esc(message)}</span>` +
      `<span class="te-time">[${elapsed}s]</span>`;
    entries.appendChild(row);
    entries.scrollTop = entries.scrollHeight;

    const summary = $("voidTraceSummary");
    if (summary) summary.textContent = message;

    const dot = $("voidTraceDot");
    if (dot) {
      if (kind === "run")   dot.className = "void-trace-dot running";
      else if (kind === "ok")    dot.className = "void-trace-dot done";
      else if (kind === "error") dot.className = "void-trace-dot error";
    }
  }

  function setStatus(text, kind = "") {
    const el = $("voidRunStatus");
    if (el) {
      el.textContent = text;
      el.className = `void-status ${kind}`;
    }
    // sync trace dot
    const dot = $("voidTraceDot");
    if (dot) {
      if (kind === "running") { dot.className = "void-trace-dot running"; _traceStartTime = Date.now(); }
      else if (kind === "done")  dot.className = "void-trace-dot done";
      else if (kind === "error") dot.className = "void-trace-dot error";
    }
  }

  const {
    loadProjects,
    saveProject,
    safeName,
    normalizeVirtualPath,
    getItem,
    childrenOf,
    visibleProjectFiles,
    trashedProjectFiles,
    descendantIds,
    parentPath,
    writableFolderId,
    rebuildPaths,
    ensureFolderPath,
    addFileByPath,
    findVirtualItem,
    cleanInstructionName,
    trimInstructionTarget,
    moveItemToFolder,
    canMoveToParent,
    moveItemToParent: storageMoveItemToParent,
  } = createVoidStorage({ state, clampDesktopPosition, log });

  async function moveItemToParent(itemId, parentId = ROOT_ID, desktopPosition = null) {
    const item = getItem(itemId);
    const oldParentId = item?.parentId || ROOT_ID;
    const ok = await storageMoveItemToParent(itemId, parentId, desktopPosition);
    if (ok && item) {
      selectedId = item.id;
      if (oldParentId === state.activeFolderId && (parentId || ROOT_ID) !== state.activeFolderId) {
        selectedId = item.id;
      }
    }
    return ok;
  }

  function setDragOffset(e, el) {
    const rect = el?.getBoundingClientRect?.();
    const x = rect ? e.clientX - rect.left : 46;
    const y = rect ? e.clientY - rect.top : 44;
    e.dataTransfer.setData("application/x-void-drag-offset-x", String(Math.max(0, x)));
    e.dataTransfer.setData("application/x-void-drag-offset-y", String(Math.max(0, y)));
  }

  function getDragOffset(e) {
    const x = Number(e.dataTransfer.getData("application/x-void-drag-offset-x"));
    const y = Number(e.dataTransfer.getData("application/x-void-drag-offset-y"));
    return {
      x: Number.isFinite(x) ? x : 46,
      y: Number.isFinite(y) ? y : 44,
    };
  }

  function setDragItem(e, itemId, origin = "finder", el = null) {
    e.dataTransfer.setData("text/plain", itemId);
    e.dataTransfer.setData("application/x-void-drag-origin", origin);
    setDragOffset(e, el || e.currentTarget);
    e.dataTransfer.effectAllowed = "move";
  }

  function getDragItem(e) {
    return getItem(e.dataTransfer.getData("text/plain"));
  }

  function getDragOrigin(e) {
    return e.dataTransfer.getData("application/x-void-drag-origin") || "";
  }

  function hasDragType(e, type) {
    return !!e.dataTransfer.types && Array.from(e.dataTransfer.types).includes(type);
  }

  function acceptItemDrop(e) {
    if (!e.dataTransfer.types || hasDragType(e, "text/plain") || hasDragType(e, "Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = hasDragType(e, "Files") ? "copy" : "move";
    }
  }

  async function tryApplyWorkspaceInstruction(prompt) {
    const text = String(prompt || "").trim();
    const lower = text.toLowerCase();
    if (!text || !state.activeProject) return false;

    let m = text.match(/\b(?:put|move)\b\s+(.+?)\s+\b(?:into|inside|in|to)\b\s+(?:a\s+|the\s+)?folder(?:\s+(?:named|called))?\s+["']?([^"'\n]+?)["']?$/i);
    if (!m) m = text.match(/\b(?:put|move)\b\s+(.+?)\s+\b(?:into|inside|in|to)\b\s+["']?([^"'\n]+?)["']?$/i);
    if (m) {
      const item = findVirtualItem(trimInstructionTarget(m[1]), "file") || findVirtualItem(trimInstructionTarget(m[1]));
      if (!item) {
        log(`Could not find "${trimInstructionTarget(m[1])}" to move. No files were generated.`, "warn");
        return true;
      }
      if (!moveItemToFolder(item, m[2])) {
        log("Move was blocked to protect the virtual folder tree.", "warn");
        return true;
      }
      selectedId = item.id;
      await saveProject();
      log(`Moved ${item.name} into /${getItem(item.parentId)?.path || ""}`, "ok");
      renderAll();
      return true;
    }

    m = text.match(/\brename\b\s+(.+?)\s+\bto\b\s+["']?([^"'\n]+?)["']?$/i);
    if (m) {
      const item = findVirtualItem(trimInstructionTarget(m[1]));
      if (!item) {
        log(`Could not find "${trimInstructionTarget(m[1])}" to rename. No files were generated.`, "warn");
        return true;
      }
      const oldName = item.name;
      item.name = cleanInstructionName(m[2]);
      item.updatedAt = nowIso();
      rebuildPaths();
      selectedId = item.id;
      await saveProject();
      log(`Renamed ${oldName} to ${item.name}`, "ok");
      renderAll();
      return true;
    }

    m = text.match(/\b(?:delete|remove)\b\s+(.+?)$/i);
    if (m && !/\b(app|website|project|page|dashboard|code)\b/i.test(lower)) {
      if (/\ball\b/.test(lower) && /\b(desktop|screen|workspace|file|files|icons|items)\b/.test(lower)) {
        const visible = childrenOf(ROOT_ID);
        const targets = /\bdesktop|screen|workspace|icons|items\b/.test(lower)
          ? visible
          : visible.filter(item => item.type === "file");
        if (!targets.length) {
          log("There is nothing visible on this desktop to delete. No files were generated.", "warn");
          return true;
        }
        await deleteItemsDirect(targets.map(item => item.id));
        log(`Moved ${targets.length} desktop item${targets.length === 1 ? "" : "s"} to Trash`, "ok");
        renderAll();
        return true;
      }
      const item = findVirtualItem(trimInstructionTarget(m[1]));
      if (!item) {
        log(`Could not find "${trimInstructionTarget(m[1])}" to delete. No files were generated.`, "warn");
        return true;
      }
      await deleteItemDirect(item.id);
      log(`Moved ${item.name} to Trash`, "ok");
      renderAll();
      return true;
    }

    m = text.match(/\b(?:create|make|add)\b\s+(?:a\s+)?folder\s+(?:named|called)?\s*["']?([^"'\n]+?)["']?$/i);
    if (m) {
      const folderId = ensureFolderPath(cleanInstructionName(m[1]));
      state.activeFolderId = folderId;
      selectedId = folderId;
      await saveProject();
      log(`Created folder /${getItem(folderId)?.path || ""}`, "ok");
      renderAll();
      return true;
    }

    m = text.match(/\b(?:create|make|add)\b\s+(?:a\s+)?file\s+(?:named|called)?\s*["']?([^"'\n]+?)["']?$/i);
    if (m) {
      const base = state.activeFolderId === ROOT_ID ? "" : parentPath(state.activeFolderId) + "/";
      const item = addFileByPath(base + trimInstructionTarget(m[1]), "", guessMime(m[1]));
      selectedId = item.id;
      await saveProject();
      log(`Created file /${item.path}`, "ok");
      renderAll();
      openEditor(item.id);
      return true;
    }

    return false;
  }

  function renderAll() {
    if (!mounted || !state.activeProject) return;
    const desktop = initVoidDesktopApi();
    desktop.renderHeader();
    desktop.renderModelSelect();
    desktop.renderDesktop();
    renderTree();
    renderFileList();
    renderBreadcrumb();
    renderFinderBar();
    updateNavBtns();
    renderFinderToggle();
    desktop.renderDock();
    desktop.renderEditMode();
  }

  function renderFinderToggle() {
    const wrap = $("virtual-os-wrap");
    if (wrap) wrap.classList.toggle("finder-collapsed", finderCollapsed);
    const btn = $("voidFinderToggleBtn");
    if (btn) {
      btn.textContent = finderCollapsed ? "Show Finder" : "Hide Finder";
      btn.classList.toggle("active", !finderCollapsed);
    }
  }

  function updateNavBtns() {
    const back = $("voidFinderBack");
    const fwd  = $("voidFinderFwd");
    if (back) back.disabled = finderHistoryIdx <= 0;
    if (fwd)  fwd.disabled  = finderHistoryIdx >= finderHistory.length - 1;
  }

  function renderBreadcrumb() {
    const host = $("voidBreadcrumb");
    if (!host) return;
    if (state.activeFolderId === TRASH_ID) {
      host.innerHTML = `<span class="void-bc-item active">Trash</span>`;
      return;
    }
    const segments = [];
    let cur = state.activeFolderId;
    const activeItem = cur && cur !== ROOT_ID ? getItem(cur) : null;
    const rootSegment = activeItem?.deletedAt ? { id: TRASH_ID, name: "Trash" } : { id: ROOT_ID, name: "Virtual OS" };
    while (cur && cur !== ROOT_ID) {
      const item = getItem(cur);
      if (!item) break;
      segments.unshift({ id: cur, name: item.name });
      cur = item.parentId;
    }
    segments.unshift(rootSegment);
    host.innerHTML = segments.map((seg, i) =>
      i < segments.length - 1
        ? `<button class="void-bc-item" data-folder="${esc(seg.id)}">${esc(seg.name)}</button><span class="void-bc-sep">›</span>`
        : `<span class="void-bc-item active">${esc(seg.name)}</span>`
    ).join("");
    host.querySelectorAll("[data-folder]").forEach(btn =>
      btn.addEventListener("click", () => openFolder(btn.dataset.folder))
    );
  }

  function renderFinderBar() {
    const status  = $("voidFinderStatus");
    const actions = $("voidFinderBarActions");
    if (!status || !actions) return;
    const items = childrenOf(state.activeFolderId);
    const sel   = selectedId ? getItem(selectedId) : null;
    if (sel) {
      const sizeStr = sel.type === "file" ? ` · ${formatBytes(byteSize(sel))}` : "";
      status.textContent = `${sel.name} · ${kindLabel(sel)}${sizeStr}`;
      if (sel.deletedAt) {
        actions.innerHTML = `<button class="void-mini-btn" data-act="restore">Restore</button>
           <button class="void-mini-btn danger" data-act="permanent-delete">Delete Forever</button>`;
      } else {
        actions.innerHTML = sel.type === "file"
          ? `<button class="void-mini-btn" data-act="edit">Edit</button>
             <button class="void-mini-btn" data-act="download">Download</button>
             <button class="void-mini-btn" data-act="rename">Rename</button>
             <button class="void-mini-btn danger" data-act="delete">Delete</button>`
          : `<button class="void-mini-btn" data-act="open">Open</button>
             <button class="void-mini-btn" data-act="download-folder">Download ZIP</button>
             <button class="void-mini-btn" data-act="rename">Rename</button>
             <button class="void-mini-btn danger" data-act="delete">Delete</button>`;
      }
      actions.querySelectorAll("[data-act]").forEach(btn =>
        btn.addEventListener("click", () => detailAction(btn.dataset.act))
      );
    } else {
      const trashCount = trashedProjectFiles().filter(f => f.trashRoot).length;
      status.textContent = state.activeFolderId === TRASH_ID
        ? `${trashCount} item${trashCount !== 1 ? "s" : ""} in Trash`
        : `${items.length} item${items.length !== 1 ? "s" : ""}`;
      actions.innerHTML = state.activeFolderId === TRASH_ID && trashCount
        ? `<button class="void-mini-btn danger" data-act="empty-trash">Empty Trash</button>`
        : "";
      actions.querySelectorAll("[data-act]").forEach(btn =>
        btn.addEventListener("click", () => detailAction(btn.dataset.act))
      );
    }
  }

  function initFinderInteract() {
    const finder   = $("voidFinder");
    const titlebar = $("voidFinderTitlebar");
    if (!finder || !titlebar) return;

    const MIN_W = 260, MIN_H = 220;

    // Helper: finder is position:absolute inside #virtual-os-wrap (position:fixed; inset:0)
    // so getBoundingClientRect() left/top are the same as the CSS left/top values.
    function finderRect() { return finder.getBoundingClientRect(); }

    // Set initial size from viewport (call once on mount, and on every window resize)
    function clampFinder() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const hasInlineW = !!finder.style.width;
      const hasInlineH = !!finder.style.height;
      const hasInlineL = !!finder.style.left;
      const hasInlineT = !!finder.style.top;
      // Sensible default: ~680×480, centred in the desktop area (right of chat panel)
      const panelW    = 320;
      const desktopW  = Math.max(400, vw - panelW);
      const defaultW  = Math.min(680, Math.max(MIN_W, Math.round(desktopW * 0.62)));
      const defaultH  = Math.min(480, Math.max(MIN_H, Math.round(vh * 0.58)));
      const defaultL  = Math.round(panelW + (desktopW - defaultW) / 2);
      const defaultT  = Math.round((vh - defaultH) / 2);
      // Read current pixel values (inline style takes priority over CSS sheet)
      const curW = parseFloat(finder.style.width)  || defaultW;
      const curH = parseFloat(finder.style.height) || defaultH;
      const curL = parseFloat(finder.style.left)   || defaultL;
      const curT = parseFloat(finder.style.top)    || defaultT;

      // Never let the window be wider/taller than the viewport
      let w = Math.min(curW, vw - 20);
      let h = Math.min(curH, vh - 20);
      w = Math.max(w, MIN_W);
      h = Math.max(h, MIN_H);

      // Push position so the whole window stays inside viewport
      let l = Math.max(0, Math.min(curL, vw - w));
      let t = Math.max(0, Math.min(curT, vh - h));
      if (!hasInlineW) w = defaultW;
      if (!hasInlineH) h = defaultH;
      if (!hasInlineL) l = defaultL;
      if (!hasInlineT) t = defaultT;

      finder.style.width  = w + "px";
      finder.style.height = h + "px";
      finder.style.left   = l + "px";
      finder.style.top    = t + "px";
    }

    clampFinder();
    window.addEventListener("resize", clampFinder);

    // ── DRAG via Pointer Capture ──────────────────────────────────
    // Using pointerdown + setPointerCapture is the most reliable cross-browser
    // drag approach — no need to listen on document at all.
    titlebar.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      if (e.target.closest("button, a") ||
          e.target.id === "voidFinderClose" ||
          e.target.id === "voidFinderMin"   ||
          e.target.id === "voidFinderZoom") return;
      e.preventDefault();
      titlebar.setPointerCapture(e.pointerId);

      const r  = finderRect();
      const sx = e.clientX, sy = e.clientY;
      const ox = r.left,    oy = r.top;
      const fw = r.width,   fh = r.height;
      finder.style.transition = "none";
      finder.classList.add("vf-dragging");

      function onMove(me) {
        const vw = window.innerWidth, vh = window.innerHeight;
        finder.style.left = Math.max(0, Math.min(vw - fw, ox + me.clientX - sx)) + "px";
        finder.style.top  = Math.max(0, Math.min(vh - fh, oy + me.clientY - sy)) + "px";
      }
      function onUp() {
        finder.style.transition = "";
        finder.classList.remove("vf-dragging");
        titlebar.removeEventListener("pointermove",   onMove);
        titlebar.removeEventListener("pointerup",     onUp);
        titlebar.removeEventListener("pointercancel", onUp);
      }
      titlebar.addEventListener("pointermove",   onMove);
      titlebar.addEventListener("pointerup",     onUp);
      titlebar.addEventListener("pointercancel", onUp);
    });

    // ── RESIZE via Pointer Capture ────────────────────────────────
    finder.querySelectorAll(".vf-resize").forEach(handle => {
      handle.addEventListener("pointerdown", e => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);

        const dir   = handle.dataset.dir;
        const r     = finderRect();
        const origW = r.width,  origH = r.height;
        const origL = r.left,   origT = r.top;
        const sx    = e.clientX, sy   = e.clientY;
        finder.style.transition = "none";

        function onMove(me) {
          const vw = window.innerWidth, vh = window.innerHeight;
          const dx = me.clientX - sx, dy = me.clientY - sy;
          let w = origW, h = origH, l = origL, t = origT;

          if (dir.includes("e")) w = Math.max(MIN_W, Math.min(vw - origL - 4, origW + dx));
          if (dir.includes("s")) h = Math.max(MIN_H, Math.min(vh - origT - 4, origH + dy));
          if (dir.includes("w")) {
            w = Math.max(MIN_W, Math.min(origW + origL, origW - dx));
            l = origL + origW - w;
          }
          if (dir.includes("n")) {
            h = Math.max(MIN_H, Math.min(origH + origT, origH - dy));
            t = origT + origH - h;
          }
          finder.style.width  = w + "px";
          finder.style.height = h + "px";
          finder.style.left   = l + "px";
          finder.style.top    = t + "px";
        }
        function onUp() {
          finder.style.transition = "";
          handle.removeEventListener("pointermove",   onMove);
          handle.removeEventListener("pointerup",     onUp);
          handle.removeEventListener("pointercancel", onUp);
        }
        handle.addEventListener("pointermove",   onMove);
        handle.addEventListener("pointerup",     onUp);
        handle.addEventListener("pointercancel", onUp);
      });
    });
  }

  function byteSize(item) {
    return item?.type === "file" ? new Blob([item.content || ""]).size : 0;
  }

  function itemByteSize(item) {
    if (!item) return 0;
    if (item.type === "file") return byteSize(item);
    const ids = descendantIds(item.id);
    return (state.activeProject?.files || [])
      .filter(f => ids.has(f.id) && f.type === "file" && !!f.deletedAt === !!item.deletedAt)
      .reduce((total, f) => total + byteSize(f), 0);
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return "Zero bytes";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function formatFinderDate(value) {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? `Today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
  }

  function kindLabel(item) {
    if (!item) return "";
    if (item.type === "folder") return "Folder";
    const ext = item.name.split(".").pop().toLowerCase();
    const labels = {
      html: "HTML document",
      htm: "HTML document",
      css: "CSS stylesheet",
      js: "JavaScript file",
      mjs: "JavaScript file",
      json: "JSON document",
      md: "Markdown document",
      svg: "SVG image",
      png: "PNG image",
      jpg: "JPEG image",
      jpeg: "JPEG image",
      webp: "WebP image",
    };
    return labels[ext] || "Document";
  }

  function renderTree() {
    const host = $("voidTree");
    if (!host) return;
    const walk = (parentId, depth) => childrenOf(parentId).filter(f => f.type === "folder").map(folder => {
      const kids = walk(folder.id, depth + 1);
      return `<button class="void-tree-row ${state.activeFolderId === folder.id ? "active" : ""}" data-folder="${esc(folder.id)}" style="padding-left:${10 + depth * 14}px">${folderSvg()}<span>${esc(folder.name)}</span></button>${kids}`;
    }).join("");
    const trashCount = trashedProjectFiles().filter(f => f.trashRoot).length;
    host.innerHTML = `
      <div class="void-tree-section">Favorites</div>
      <button class="void-tree-row ${state.activeFolderId === ROOT_ID ? "active" : ""}" data-folder="${ROOT_ID}">${folderSvg()}<span>Virtual OS</span></button>
      ${walk(ROOT_ID, 1)}
      <div class="void-tree-section">System</div>
      <button class="void-tree-row ${state.activeFolderId === TRASH_ID ? "active" : ""}" data-folder="${TRASH_ID}">${trashSvg(trashCount > 0)}<span>Trash</span><em>${trashCount || ""}</em></button>
      <button class="void-tree-row" data-action="settings">${settingsSvg()}<span>Settings</span></button>`;
    host.querySelector("[data-action='settings']")?.addEventListener("click", openVoidSettings);
    host.querySelectorAll("[data-folder]").forEach(btn => {
      if (btn.dataset.folder !== ROOT_ID && btn.dataset.folder !== TRASH_ID) {
        btn.draggable = true;
        btn.addEventListener("dragstart", e => setDragItem(e, btn.dataset.folder));
      }
      btn.addEventListener("click", () => openFolder(btn.dataset.folder));
      btn.addEventListener("dragover", e => {
        if (btn.dataset.folder === TRASH_ID) {
          const dragged = getDragItem(e);
          if (dragged && !dragged.deletedAt) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            btn.classList.add("drop-target");
          }
          return;
        }
        const dragged = getDragItem(e);
        if (hasDragType(e, "Files") || (dragged && canMoveToParent(dragged, btn.dataset.folder))) {
          e.preventDefault();
          e.dataTransfer.dropEffect = hasDragType(e, "Files") ? "copy" : "move";
          btn.classList.add("drop-target");
        }
      });
      btn.addEventListener("dragleave", () => btn.classList.remove("drop-target"));
      btn.addEventListener("drop", async e => {
        if (btn.dataset.folder === TRASH_ID) {
          const dragged = getDragItem(e);
          if (!dragged || dragged.deletedAt) return;
          e.preventDefault();
          btn.classList.remove("drop-target");
          await deleteItemDirect(dragged.id);
          log(`Moved ${dragged.name} to Trash`, "warn");
          renderAll();
          return;
        }
        if (e.dataTransfer.files?.length) {
          e.preventDefault();
          btn.classList.remove("drop-target");
          const targetId = btn.dataset.folder || ROOT_ID;
          state.activeFolderId = targetId;
          await handleUpload(e.dataTransfer.files, false, targetId);
          return;
        }
        const dragged = getDragItem(e);
        if (!dragged) return;
        e.preventDefault();
        btn.classList.remove("drop-target");
        const targetId = btn.dataset.folder || ROOT_ID;
        if (await moveItemToParent(dragged.id, targetId)) {
          state.activeFolderId = targetId;
          log(targetId === ROOT_ID ? `Moved to Virtual OS root` : `Moved ${dragged.name} into /${getItem(targetId)?.path || ""}`, "ok");
          renderAll();
        }
      });
    });
  }

  function renderFileList() {
    const host = $("voidFileList");
    if (!host) return;
    const items = childrenOf(state.activeFolderId);
    host.classList.toggle("grid", finderViewMode === "grid");
    const rows = items.map(item => `
      <button class="void-file-row ${selectedId === item.id ? "active" : ""} ${item.deletedAt ? "trashed" : ""}" data-id="${esc(item.id)}" draggable="true">
        <span class="void-row-title"><span class="void-row-icon ${item.type === "folder" ? "folder" : ""}">${item.type === "folder" ? folderSvg() : fileSvg()}</span><span class="void-row-name">${esc(item.name)}</span></span>
        <span class="void-row-date">${esc(formatFinderDate(item.updatedAt))}</span>
        <span class="void-row-size">${esc(formatBytes(itemByteSize(item)))}</span>
        <span class="void-row-kind">${esc(kindLabel(item))}</span>
      </button>`).join("");
    if (items.length && finderViewMode === "list") {
      host.innerHTML = `<div class="void-file-head"><span>Name</span><span>Date Modified</span><span>Size</span><span>Kind</span></div>${rows}`;
    } else {
      host.innerHTML = items.length ? rows : `<div class="void-empty-list">${state.activeFolderId === TRASH_ID ? "Trash is empty." : "This folder is empty."}</div>`;
    }
    const folder = state.activeFolderId !== ROOT_ID && state.activeFolderId !== TRASH_ID ? getItem(state.activeFolderId) : null;
    const readOnlyDrop = state.activeFolderId === TRASH_ID || !!folder?.deletedAt;
    host.ondragover = readOnlyDrop ? null : e => acceptItemDrop(e);
    host.ondrop = async e => {
      if (readOnlyDrop) return;
      if (e.target?.closest?.(".void-file-row")) return;
      if (e.dataTransfer.files?.length) {
        e.preventDefault();
        await handleUpload(e.dataTransfer.files, false, state.activeFolderId);
        return;
      }
      const dragged = getDragItem(e);
      if (!dragged) return;
      e.preventDefault();
      if (await moveItemToParent(dragged.id, state.activeFolderId)) {
        log(state.activeFolderId === ROOT_ID ? `Moved to Virtual OS root` : `Moved ${dragged.name} into /${getItem(state.activeFolderId)?.path || ""}`, "ok");
        renderAll();
      }
    };
    host.querySelectorAll("[data-id]").forEach(btn => {
      btn.draggable = true;
      btn.addEventListener("dragstart", e => setDragItem(e, btn.dataset.id));
      btn.addEventListener("click", () => selectItem(btn.dataset.id));
      btn.addEventListener("dblclick", () => {
        const item = getItem(btn.dataset.id);
        if (item?.type === "folder") openFolder(item.id);
        else if (item && !item.deletedAt) openEditor(item.id);
      });
      btn.addEventListener("dragover", e => {
        const target = getItem(btn.dataset.id);
        const dragged = getDragItem(e);
        if (!target?.deletedAt && target?.type === "folder" && (hasDragType(e, "Files") || (dragged && dragged.id !== target.id && canMoveToParent(dragged, target.id)))) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = hasDragType(e, "Files") ? "copy" : "move";
          btn.classList.add("drop-target");
        }
      });
      btn.addEventListener("dragleave", () => btn.classList.remove("drop-target"));
      btn.addEventListener("drop", async e => {
        const target = getItem(btn.dataset.id);
        if (!target?.deletedAt && target?.type === "folder" && e.dataTransfer.files?.length) {
          e.preventDefault();
          e.stopPropagation();
          btn.classList.remove("drop-target");
          state.activeFolderId = target.id;
          await handleUpload(e.dataTransfer.files, false, target.id);
          return;
        }
        const dragged = getDragItem(e);
        if (target?.deletedAt || target?.type !== "folder" || !dragged || dragged.id === target.id) return;
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove("drop-target");
        if (await moveItemToParent(dragged.id, target.id)) {
          state.activeFolderId = target.id;
          log(`Moved ${dragged.name} into /${target.path}`, "ok");
          renderAll();
        }
      });
    });
  }

  function selectItem(id) {
    selectedId = id;
    selectedSystemIconId = "";
    renderAll();
  }

  function openFolder(id) {
    const newId = id || ROOT_ID;
    if (newId !== ROOT_ID && newId !== TRASH_ID) {
      const item = getItem(newId);
      if (!item || item.type !== "folder") return;
    }
    // Trim forward history on new navigation
    finderHistory = finderHistory.slice(0, finderHistoryIdx + 1);
    finderHistory.push(newId);
    finderHistoryIdx = finderHistory.length - 1;
    state.activeFolderId = newId;
    selectedId = newId === ROOT_ID || newId === TRASH_ID ? "" : newId;
    finderCollapsed = false;
    renderAll();
  }

  function detailAction(action) {
    if (action === "empty-trash") {
      emptyTrash();
      return;
    }
    const item = getItem(selectedId);
    if (!item) return;
    if (action === "edit") openEditor(item.id);
    if (action === "download") downloadItem(item);
    if (action === "download-folder") downloadFolder(item.id);
    if (action === "open" && item.type === "folder") openFolder(item.id);
    if (action === "rename") renameItem(item.id);
    if (action === "delete") deleteItem(item.id);
    if (action === "restore") restoreItem(item.id);
    if (action === "permanent-delete") permanentDeleteItem(item.id);
  }

  async function createFile() {
    const raw = await themedPrompt("File name or virtual path", "index.html", "Create File");
    if (!raw) return;
    const parentId = writableFolderId();
    const base = parentId === ROOT_ID ? "" : parentPath(parentId) + "/";
    const item = addFileByPath(base + raw, "", guessMime(raw));
    selectedId = item.id;
    await saveProject();
    renderAll();
    openEditor(item.id);
  }

  async function createFolder() {
    const raw = await themedPrompt("Folder name or virtual path", "src", "Create Folder");
    if (!raw) return;
    const parentId = writableFolderId();
    const base = parentId === ROOT_ID ? "" : parentPath(parentId) + "/";
    const folderId = ensureFolderPath(base + raw);
    const item = getItem(folderId);
    rebuildPaths();
    selectedId = item?.id || "";
    await saveProject();
    renderAll();
  }

  async function renameItem(id) {
    const item = getItem(id);
    if (!item) return;
    const name = await themedPrompt("Rename", item.name, "Rename Item");
    if (!name) return;
    item.name = safeName(name);
    item.updatedAt = nowIso();
    rebuildPaths();
    await saveProject();
    renderAll();
  }

  async function deleteItem(id) {
    const item = getItem(id);
    if (!item) return;
    const name = item.name;
    if (item.deletedAt) {
      await permanentDeleteItem(id);
      return;
    }
    await deleteItemDirect(id);
    log(`Moved ${name} to Trash`, "warn");
    renderAll();
  }

  async function deleteItemDirect(id) {
    await deleteItemsDirect([id]);
  }

  async function deleteItemsDirect(rootIds, { permanent = false } = {}) {
    if (!state.activeProject) return;
    const rootSet = new Set(rootIds.filter(id => getItem(id)));
    const ids = new Set(rootIds.filter(Boolean));
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of state.activeProject.files) {
        if (ids.has(f.parentId) && !ids.has(f.id)) {
          ids.add(f.id);
          changed = true;
        }
      }
    }

    if (permanent) {
      state.activeProject.files = state.activeProject.files.filter(f => !ids.has(f.id));
    } else {
      const deletedAt = nowIso();
      for (const f of state.activeProject.files) {
        if (!ids.has(f.id)) continue;
        const isTrashRoot = rootSet.has(f.id);
        if (!f.deletedAt) {
          f.deletedAt = deletedAt;
          f.trashParentId = f.parentId || ROOT_ID;
          f.trashPath = f.path || f.name;
          f.trashRoot = isTrashRoot;
          f.desktopPosition = null;
        } else {
          f.trashRoot = isTrashRoot;
        }
        f.updatedAt = deletedAt;
      }
    }

    selectedId = "";
    if (ids.has(state.activeFolderId)) state.activeFolderId = permanent ? ROOT_ID : TRASH_ID;
    rebuildPaths();
    await saveProject();
  }

  async function restoreItem(id) {
    const item = getItem(id);
    if (!item?.deletedAt) return;
    const ids = descendantIds(id);
    const restoredAt = nowIso();
    for (const f of state.activeProject.files) {
      if (!ids.has(f.id)) continue;
      delete f.deletedAt;
      delete f.trashParentId;
      delete f.trashPath;
      delete f.trashRoot;
      f.updatedAt = restoredAt;
    }
    for (const f of state.activeProject.files) {
      if (!ids.has(f.id)) continue;
      const parent = f.parentId && f.parentId !== ROOT_ID ? getItem(f.parentId) : null;
      if (f.parentId !== ROOT_ID && (!parent || parent.deletedAt) && !ids.has(f.parentId)) {
        f.parentId = ROOT_ID;
        f.desktopPosition = f.desktopPosition || { x: 26, y: 34 };
      }
    }
    rebuildPaths();
    selectedId = item.id;
    state.activeFolderId = item.type === "folder" ? item.id : (item.parentId || ROOT_ID);
    if (state.activeFolderId !== ROOT_ID && getItem(state.activeFolderId)?.deletedAt) state.activeFolderId = ROOT_ID;
    await saveProject();
    log(`Restored ${item.name}`, "ok");
    renderAll();
  }

  async function permanentDeleteItem(id) {
    const item = getItem(id);
    if (!item) return;
    const name = item.name;
    await deleteItemsDirect([id], { permanent: true });
    log(`${name} deleted forever`, "warn");
    renderAll();
  }

  async function emptyTrash() {
    const count = trashedProjectFiles().length;
    if (!count) {
      log("Trash is empty.", "warn");
      return;
    }
    state.activeProject.files = state.activeProject.files.filter(f => !f.deletedAt);
    selectedId = "";
    state.activeFolderId = ROOT_ID;
    rebuildPaths();
    await saveProject();
    log(`Emptied Trash (${count} item${count === 1 ? "" : "s"})`, "warn");
    renderAll();
  }

  function openEditor(id) {
    const item = getItem(id);
    if (!item || item.type !== "file") return;
    if (item.deletedAt) {
      log("Restore the file from Trash before editing it.", "warn");
      return;
    }
    editingId = id;
    $("voidEditorTitle").textContent = item.name;
    $("voidEditorPath").textContent = "/" + item.path;
    $("voidEditorText").value = item.content || "";
    $("voidEditor").classList.add("open");
    $("voidEditor").setAttribute("aria-hidden", "false");
    setTimeout(() => $("voidEditorText")?.focus(), 0);
  }

  function closeEditor() {
    $("voidEditor").classList.remove("open");
    $("voidEditor").setAttribute("aria-hidden", "true");
    editingId = "";
  }

  function openDialog({ title, message, defaultValue = "", confirmOnly = false, okText = "OK" }) {
    const overlay = $("voidDialog");
    if (!overlay) {
      log("Void dialog is not mounted.", "error");
      return Promise.resolve(confirmOnly ? false : null);
    }
    $("voidDialogTitle").textContent = title || "Virtual OS";
    $("voidDialogSub").textContent = confirmOnly ? "Confirm virtual workspace action" : "Enter virtual workspace value";
    $("voidDialogMessage").textContent = message || "";
    $("voidDialogOk").textContent = okText;
    const input = $("voidDialogInput");
    input.style.display = confirmOnly ? "none" : "";
    input.value = defaultValue || "";
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      if (confirmOnly) $("voidDialogOk")?.focus();
      else {
        input.focus();
        input.select();
      }
    }, 0);
    return new Promise(resolve => {
      dialogResolve = resolve;
    });
  }

  function closeDialog(value) {
    const overlay = $("voidDialog");
    if (overlay) {
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
    }
    const resolve = dialogResolve;
    dialogResolve = null;
    if (resolve) resolve(value);
  }

  function themedPrompt(message, defaultValue, title) {
    return openDialog({ title, message, defaultValue, confirmOnly: false, okText: "Create" });
  }

  function themedConfirm(message, title) {
    return openDialog({ title, message, confirmOnly: true, okText: "Delete" });
  }

  function setFinderCollapsed(next) {
    finderCollapsed = !!next;
    renderFinderToggle();
  }

  function openFinderTool() {
    finderCollapsed = false;
    renderAll();
  }

  function openTrash() {
    openFolder(TRASH_ID);
  }

  function openVoidSettings() {
    const btn = document.getElementById("openSettings");
    if (btn) btn.click();
    else log("Settings panel is not available in this view.", "warn");
  }

  async function finderTrashButtonAction() {
    const item = selectedId ? getItem(selectedId) : null;
    if (!item) {
      openTrash();
      return;
    }
    if (item.deletedAt) await permanentDeleteItem(item.id);
    else await deleteItem(item.id);
  }

  async function saveEditor() {
    const item = getItem(editingId);
    if (!item) return;
    item.content = $("voidEditorText").value;
    item.updatedAt = nowIso();
    await saveProject();
    log(`Saved /${item.path}`, "ok");
    renderAll();
    closeEditor();
  }

  function downloadItem(item) {
    if (!item || item.type !== "file") return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([item.content || ""], { type: item.mime || "text/plain;charset=utf-8" }));
    a.download = item.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function downloadFolder(folderId) {
    if (!state.activeProject || !folderId || folderId === ROOT_ID) return;
    const root = getItem(folderId);
    if (!root || root.deletedAt || root.type !== "folder") return;
    rebuildPaths();
    // collect all descendants recursively
    const allIds = new Set([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of state.activeProject.files) {
        if (allIds.has(f.parentId) && !allIds.has(f.id)) { allIds.add(f.id); changed = true; }
      }
    }
    const entries = [];
    for (const f of state.activeProject.files.filter(item => allIds.has(item.id) && !item.deletedAt)) {
      if (f.type === "folder") entries.push({ name: f.path.replace(/\/?$/, "/"), data: "" });
      else entries.push({ name: f.path, data: f.content || "" });
    }
    if (!entries.length) { log("Folder is empty.", "warn"); return; }
    const blob = makeZip(entries, normalizeVirtualPath);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${root.name}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    log(`Downloaded ${root.name}.zip (${entries.filter(e => !e.name.endsWith("/")).length} files)`, "ok");
  }

  async function deleteAll() {
    if (state.activeFolderId === TRASH_ID || getItem(state.activeFolderId)?.deletedAt) {
      await emptyTrash();
      return;
    }
    const roots = visibleProjectFiles().filter(item => {
      const parent = item.parentId && item.parentId !== ROOT_ID ? getItem(item.parentId) : null;
      return (item.parentId || ROOT_ID) === ROOT_ID || !parent || parent.deletedAt;
    });
    if (!roots.length) { log("Nothing to delete.", "warn"); return; }
    const count = visibleProjectFiles().length;
    await deleteItemsDirect(roots.map(item => item.id));
    selectedId = "";
    state.activeFolderId = TRASH_ID;
    rebuildPaths();
    log(`Moved ${count} item${count === 1 ? "" : "s"} to Trash.`, "warn");
    renderAll();
  }

  async function handleUpload(files, folderMode = false, targetParentId = state.activeFolderId) {
    const list = Array.from(files || []);
    if (!list.length) return;
    const parentId = writableFolderId(targetParentId);
    for (const file of list) {
      const rel = folderMode ? (file.webkitRelativePath || file.name) : file.name;
      const base = parentId === ROOT_ID ? "" : parentPath(parentId) + "/";
      const text = await file.text();
      addFileByPath(base + rel, text, file.type || guessMime(file.name));
    }
    await saveProject();
    log(`Uploaded ${list.length} file(s)`, "ok");
    renderAll();
  }

  function guessMime(name) {
    const ext = String(name).split(".").pop().toLowerCase();
    if (ext === "html") return "text/html";
    if (ext === "css") return "text/css";
    if (ext === "js") return "application/javascript";
    if (ext === "json") return "application/json";
    if (ext === "md") return "text/markdown";
    return "text/plain";
  }

  function isEditRequest(prompt) {
    const text = String(prompt || "").toLowerCase();
    return /\b(edit|update|change|modify|fix|repair|revise|adjust|tweak|improve|refactor|rename|replace|remove)\b/.test(text) ||
      /\b(add|put|insert)\b[\s\S]{0,80}\b(to|into|in|on)\b[\s\S]{0,80}\b(existing|current|this|the)\b/.test(text) ||
      /\b(existing|current|this)\b[\s\S]{0,80}\b(file|folder|project|website|site|app|page)\b/.test(text);
  }

  function wantsEditContext(prompt) {
    return forceEditMode || isEditRequest(prompt);
  }

  function shouldCreateSeparateProject(prompt) {
    if (!visibleProjectFiles().some(f => f.type === "file")) return false;
    if (wantsEditContext(prompt)) return false;
    const text = String(prompt || "").toLowerCase();
    return /\b(new|another|separate|different|fresh)\b/.test(text) ||
      /\b(make|create|build|generate|code|develop|design)\b[\s\S]{0,80}\b(website|site|webpage|web page|web app|app|application|game|tool|dashboard|landing page|portfolio|store|shop)\b/.test(text);
  }

  // ============================================================================
  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  // ============================================================================
  // VIRTUAL TERMINAL — sandboxed shell over the IndexedDB virtual filesystem
  // ============================================================================

  function termResolve(p) {
    if (!p || p === "~") return termCwd;
    if (p === "/") return "/";
    const base = p.startsWith("/") ? "" : termCwd === "/" ? "" : termCwd;
    const raw  = base + "/" + p;
    const parts = raw.split("/").filter(Boolean);
    const out = [];
    for (const part of parts) {
      if (part === "..") out.pop();
      else if (part !== ".") out.push(part);
    }
    return "/" + out.join("/");
  }

  function termFindItem(absPath) {
    if (!absPath || absPath === "/") return { id: ROOT_ID, type: "folder", name: "/" };
    const parts = absPath.replace(/^\//, "").split("/").filter(Boolean);
    const files = visibleProjectFiles();
    let parentId = ROOT_ID;
    let item = null;
    for (const part of parts) {
      item = files.find(f => f.parentId === parentId && f.name === part);
      if (!item) return null;
      parentId = item.id;
    }
    return item;
  }

  function termFindCmd(rootPath, pattern) {
    const files = visibleProjectFiles();
    const cleanRoot = rootPath === "/" ? "" : rootPath.replace(/^\//, "");
    const scope = cleanRoot ? files.filter(f => f.path && f.path.startsWith(cleanRoot)) : files;
    const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    const matches = scope.filter(f => re.test(f.name));
    if (!matches.length) return "(no matches)";
    return matches.map(f => `/${f.path}${f.type === "folder" ? "/" : ""}`).join("\n");
  }

  function termExec(cmd) {
    const cmdStr = String(cmd || "").trim();
    if (!cmdStr) return "";
    const args = cmdStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const argv = args.map(a => a.replace(/^["']|["']$/g, ""));
    const name = argv[0] || "";
    const rest = argv.slice(1);

    switch (name) {
      case "ls": {
        const p = rest[0] ? termResolve(rest[0]) : termCwd;
        return initVoidChatApi().aosLs(p.replace(/^\//, "") || "/");
      }
      case "pwd": return termCwd;
      case "cd": {
        const target = rest[0] ? termResolve(rest[0]) : "/";
        if (target === "/") { termCwd = "/"; renderTermPrompt(); return ""; }
        const item = termFindItem(target);
        if (!item) return `cd: no such file or directory: ${rest[0]}`;
        if (item.type === "file") return `cd: not a directory: ${rest[0]}`;
        termCwd = target;
        renderTermPrompt();
        return "";
      }
      case "cat": {
        if (!rest[0]) return "Usage: cat <file>";
        return initVoidChatApi().aosRead(termResolve(rest[0]).replace(/^\//, ""), null, null);
      }
      case "find": {
        const nameIdx = rest.indexOf("-name");
        const pattern = nameIdx >= 0 ? (rest[nameIdx + 1] || "*") : "*";
        const searchRoot = rest[0] && !rest[0].startsWith("-") ? termResolve(rest[0]) : termCwd;
        return termFindCmd(searchRoot, pattern);
      }
      case "grep": {
        if (rest.length < 2) return "Usage: grep <pattern> <path>";
        return initVoidChatApi().aosGrep(rest[0], termResolve(rest[1]).replace(/^\//, ""));
      }
      case "echo": return rest.join(" ");
      case "clear": return "__clear__";
      case "touch": {
        if (!rest[0]) return "Usage: touch <file>";
        const tp = termResolve(rest[0]).replace(/^\//, "");
        const existing = termFindItem("/" + tp);
        if (!existing) { addFileByPath(tp, "", guessMime(tp)); rebuildPaths(); saveProject(); renderAll(); }
        return "";
      }
      case "cp": {
        if (rest.length < 2) return "Usage: cp <src> <dst>";
        const src = termFindItem(termResolve(rest[0]));
        if (!src || src.type !== "file") return `cp: ${rest[0]}: no such file`;
        const dst = termResolve(rest[1]).replace(/^\//, "");
        addFileByPath(dst, src.content || "", guessMime(dst));
        rebuildPaths(); saveProject(); renderAll();
        return "";
      }
      case "head": {
        const nIdx = rest.indexOf("-n");
        const n = nIdx >= 0 ? (parseInt(rest[nIdx + 1]) || 10) : 10;
        const fp = rest.find(a => !a.startsWith("-") && a !== String(n));
        if (!fp) return "Usage: head [-n N] <file>";
        const c = initVoidChatApi().aosRead(termResolve(fp).replace(/^\//, ""), 1, n);
        return c;
      }
      case "tail": {
        const nIdx = rest.indexOf("-n");
        const n = nIdx >= 0 ? (parseInt(rest[nIdx + 1]) || 10) : 10;
        const fp = rest.find(a => !a.startsWith("-") && a !== String(n));
        if (!fp) return "Usage: tail [-n N] <file>";
        const item = termFindItem(termResolve(fp));
        if (!item || item.type !== "file") return `tail: ${fp}: no such file`;
        const lines = (item.content || "").split("\n");
        return lines.slice(-n).join("\n");
      }
      case "wc": {
        const fp = rest.find(a => !a.startsWith("-"));
        if (!fp) return "Usage: wc [-l] <file>";
        const item = termFindItem(termResolve(fp));
        if (!item || item.type !== "file") return `wc: ${fp}: no such file`;
        const lines = (item.content || "").split("\n").length;
        const words = (item.content || "").split(/\s+/).filter(Boolean).length;
        const bytes = (item.content || "").length;
        if (rest.includes("-l")) return `${lines} ${fp}`;
        return `${lines} ${words} ${bytes} ${fp}`;
      }
      case "mkdir": {
        const p = rest.find(a => !a.startsWith("-")) || "";
        if (!p) return "Usage: mkdir <path>";
        initVoidChatApi().aosMkdir(termResolve(p).replace(/^\//, ""));
        return "";
      }
      case "rm": {
        if (!rest[0]) return "Usage: rm <file>";
        const target = rest.find(a => !a.startsWith("-"));
        if (!target) return "Usage: rm <file>";
        const rmItem = termFindItem(termResolve(target));
        if (!rmItem) return `rm: ${target}: no such file`;
        initVoidChatApi().aosDelete(rmItem.path);
        return "";
      }
      case "mv": {
        if (rest.length < 2) return "Usage: mv <src> <dst>";
        initVoidChatApi().aosMove(termResolve(rest[0]).replace(/^\//, ""), termResolve(rest[1]).replace(/^\//, ""));
        return "";
      }
      case "help": return "Commands: ls, cd, pwd, cat, find, grep, echo, touch, cp, mv, rm, mkdir, head, tail, wc, clear, help";
      default: return `${name}: command not found (try 'help')`;
    }
  }

  function appendTermLine(text, kind = "out") {
    termLines.push({ text: String(text), kind });
    if (termLines.length > 600) termLines.shift();
    renderTermOutput();
  }

  function renderTermOutput() {
    const el = $("voidTermOutput");
    if (!el) return;
    el.innerHTML = termLines.map(l => {
      const cls = l.kind === "cmd" ? "void-term-cmd" : l.kind === "err" ? "void-term-err" : "void-term-out";
      return `<div class="${cls}">${esc(l.text)}</div>`;
    }).join("");
    el.scrollTop = el.scrollHeight;
  }

  function renderTermPrompt() {
    const el = $("voidTermPrompt");
    if (el) el.textContent = (termCwd === "/" ? "~" : "~" + termCwd) + " $ ";
  }

  function openTerminal() {
    const t = $("voidTerminal");
    if (t) { t.classList.remove("void-term-hidden"); $("voidTermInput")?.focus(); }
    const btn = $("voidTermOpenBtn");
    if (btn) btn.style.display = "none";
  }

  function initTerminalInteract() {
    const term     = $("voidTerminal");
    const titlebar = $("voidTerminalTitlebar");
    if (!term || !titlebar) return;
    const MIN_W = 320, MIN_H = 200;
    function clamp() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const hasW = !!term.style.width, hasH = !!term.style.height;
      const hasL = !!term.style.left,  hasT = !!term.style.top;
      const dw = Math.min(720, Math.max(MIN_W, Math.round(vw * 0.52)));
      const dh = Math.min(420, Math.max(MIN_H, Math.round(vh * 0.40)));
      const dl = Math.round((vw - dw) / 2);
      const dt = Math.round((vh - dh) / 2);
      const w = Math.max(MIN_W, Math.min(parseFloat(term.style.width) || dw, vw - 8));
      const h = Math.max(MIN_H, Math.min(parseFloat(term.style.height) || dh, vh - 8));
      const l = Math.max(0, Math.min(parseFloat(term.style.left) || dl, vw - w));
      const t2 = Math.max(0, Math.min(parseFloat(term.style.top) || dt, vh - h));
      if (!hasW) term.style.width  = w + "px";
      if (!hasH) term.style.height = h + "px";
      if (!hasL) term.style.left   = l + "px";
      if (!hasT) term.style.top    = t2 + "px";
      term.style.width  = (hasW ? Math.max(MIN_W, Math.min(parseFloat(term.style.width), vw - 8)) : w) + "px";
      term.style.height = (hasH ? Math.max(MIN_H, Math.min(parseFloat(term.style.height), vh - 8)) : h) + "px";
    }
    clamp();
    window.addEventListener("resize", clamp);
    titlebar.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest("button, a, span[id]")) return;
      e.preventDefault();
      titlebar.setPointerCapture(e.pointerId);
      const r = term.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY, ox = r.left, oy = r.top, fw = r.width, fh = r.height;
      term.style.transition = "none";
      const mv = me => {
        const vw = window.innerWidth, vh = window.innerHeight;
        term.style.left = Math.max(0, Math.min(vw - fw, ox + me.clientX - sx)) + "px";
        term.style.top  = Math.max(0, Math.min(vh - fh, oy + me.clientY - sy)) + "px";
      };
      const up = () => {
        term.style.transition = "";
        titlebar.removeEventListener("pointermove", mv);
        titlebar.removeEventListener("pointerup",   up);
        titlebar.removeEventListener("pointercancel", up);
      };
      titlebar.addEventListener("pointermove", mv);
      titlebar.addEventListener("pointerup",   up);
      titlebar.addEventListener("pointercancel", up);
    });
    term.querySelectorAll(".vf-resize").forEach(handle => {
      handle.addEventListener("pointerdown", e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        const dir = handle.dataset.dir;
        const r = term.getBoundingClientRect();
        const origW = r.width, origH = r.height, origL = r.left, origT = r.top;
        const sx = e.clientX, sy = e.clientY;
        term.style.transition = "none";
        const mv = me => {
          const vw = window.innerWidth, vh = window.innerHeight;
          const dx = me.clientX - sx, dy = me.clientY - sy;
          let w = origW, h = origH, l = origL, t = origT;
          if (dir.includes("e")) w = Math.max(MIN_W, Math.min(vw - origL - 4, origW + dx));
          if (dir.includes("s")) h = Math.max(MIN_H, Math.min(vh - origT - 4, origH + dy));
          if (dir.includes("w")) { w = Math.max(MIN_W, Math.min(origW + origL, origW - dx)); l = origL + origW - w; }
          if (dir.includes("n")) { h = Math.max(MIN_H, Math.min(origH + origT, origH - dy)); t = origT + origH - h; }
          term.style.width = w + "px"; term.style.height = h + "px";
          term.style.left  = l + "px"; term.style.top    = t + "px";
        };
        const up = () => {
          term.style.transition = "";
          handle.removeEventListener("pointermove", mv);
          handle.removeEventListener("pointerup",   up);
          handle.removeEventListener("pointercancel", up);
        };
        handle.addEventListener("pointermove", mv);
        handle.addEventListener("pointerup",   up);
        handle.addEventListener("pointercancel", up);
      });
    });
  }


  function initVoidDesktopApi() {
    if (voidDesktopApi) return voidDesktopApi;
    voidDesktopApi = createVoidDesktopApi({
      $,
      nowIso,
      log,
      state,
      ROOT_ID,
      TRASH_ID,
      getSelectedId: () => selectedId,
      setSelectedId: (id) => { selectedId = id; },
      getSelectedSystemIconId: () => selectedSystemIconId,
      setSelectedSystemIconId: (id) => { selectedSystemIconId = id; },
      getForceEditMode: () => forceEditMode,
      getItem,
      childrenOf,
      visibleProjectFiles,
      trashedProjectFiles,
      saveProject,
      rebuildPaths,
      canMoveToParent,
      moveItemToParent,
      getDragItem,
      getDragOrigin,
      hasDragType,
      getDragOffset,
      setDragOffset,
      deleteItemDirect,
      openFinderTool,
      openVoidSettings,
      openTrash,
      openFolder,
      openEditor,
      selectItem,
      handleUpload,
      renderAll,
    });
    return voidDesktopApi;
  }

  function initVoidGenerateApi() {
    if (voidGenerateApi) return voidGenerateApi;
    voidGenerateApi = createVoidGenerateApi({
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
      getSelectedId: () => selectedId,
      getActiveFolderId: () => state.activeFolderId,
      getForceEditMode: () => forceEditMode,
      wantsEditContext,
      shouldCreateSeparateProject,
      tryApplyWorkspaceInstruction,
      initVoidChatApi: () => initVoidChatApi(),
      getAgentOSMode: () => agentOSMode,
      getRunAbort: () => runAbort,
      setRunAbort: (v) => { runAbort = v; },
    });
    return voidGenerateApi;
  }

  function initVoidWireEventsApi() {
    if (voidWireEventsApi) return voidWireEventsApi;
    voidWireEventsApi = createVoidWireEventsApi({
      $,
      log,
      ROOT_ID,
      initVoidChatApi: () => initVoidChatApi(),
      wireFinderEvents: () => {
        $("voidFinderTrashBtn")?.addEventListener("click", finderTrashButtonAction);
        $("voidFinderSettingsBtn")?.addEventListener("click", openVoidSettings);
        $("voidFinderToggleBtn")?.addEventListener("click", () => setFinderCollapsed(!finderCollapsed));
        $("voidFinderClose")?.addEventListener("click", () => setFinderCollapsed(true));
        $("voidFinderBack")?.addEventListener("click", () => {
          if (finderHistoryIdx > 0) {
            finderHistoryIdx--;
            state.activeFolderId = finderHistory[finderHistoryIdx];
            selectedId = state.activeFolderId === ROOT_ID || state.activeFolderId === TRASH_ID ? "" : state.activeFolderId;
            renderAll();
          }
        });
        $("voidFinderFwd")?.addEventListener("click", () => {
          if (finderHistoryIdx < finderHistory.length - 1) {
            finderHistoryIdx++;
            state.activeFolderId = finderHistory[finderHistoryIdx];
            selectedId = state.activeFolderId === ROOT_ID || state.activeFolderId === TRASH_ID ? "" : state.activeFolderId;
            renderAll();
          }
        });
        $("voidFinderViewToggle")?.addEventListener("click", () => {
          finderViewMode = finderViewMode === "list" ? "grid" : "list";
          const icon = $("voidFinderViewToggle");
          if (icon) icon.title = finderViewMode === "list" ? "Switch to grid view" : "Switch to list view";
          renderAll();
        });
        initFinderInteract();
      },
      createFile,
      createFolder,
      renderAll,
      renderEditMode: () => initVoidDesktopApi().renderEditMode(),
      toggleForceEditMode: () => {
        forceEditMode = !forceEditMode;
        const target = selectedId ? getItem(selectedId) : (state.activeFolderId !== ROOT_ID ? getItem(state.activeFolderId) : null);
        log(forceEditMode
          ? target
            ? `Edit Mode on. Sending context for /${target.path}.`
            : "Edit Mode on. Existing project context will be sent."
          : "Edit Mode off. Existing projects will be hidden from new prompts.",
          forceEditMode ? "warn" : "ok"
        );
      },
      initTerminalInteract,
      getTermHistory: () => termHistory,
      getTermHistIdx: () => termHistIdx,
      setTermHistIdx: (v) => { termHistIdx = v; },
      getTermLines: () => termLines,
      setTermLines: (v) => { termLines = v; },
      getTermCwd: () => termCwd,
      appendTermLine,
      termExec,
      renderTermOutput,
      renderTermPrompt,
      openTerminal,
      getRunAbort: () => runAbort,
      abortRun: () => { if (runAbort) runAbort.abort(); },
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
      getEditingId: () => editingId,
      closeDialog,
      clearDesktopSelection: () => initVoidDesktopApi().clearDesktopSelection(),
      hasDragType,
      getSystemIconDrag: (e) => initVoidDesktopApi().getSystemIconDrag(e),
      moveSystemIcon: (...args) => initVoidDesktopApi().moveSystemIcon(...args),
      getDragItem,
      moveItemToParent,
      getDragOffset,
      downloadFolder,
      setActiveFolderId: (id) => { state.activeFolderId = id; },
      getSelectedId: () => selectedId,
      setMounted: (v) => { mounted = v; },
      getInitialized: () => initialized,
      setInitialized: (v) => { initialized = v; },
      getClockTimer: () => clockTimer,
      setClockTimer: (v) => { clockTimer = v; },
      updateVoidClock: () => initVoidDesktopApi().updateVoidClock(),
      loadProjects,
      logReady: () => log("Virtual OS ready. No files touch disk until export.", "ok"),
      prepareMount: () => {
        finderCollapsed = true;
        const wrapEl = document.getElementById("virtual-os-wrap");
        if (wrapEl) wrapEl.classList.add("finder-collapsed");
        const finderEl = document.getElementById("voidFinder");
        if (finderEl) { finderEl.style.width = ""; finderEl.style.height = ""; finderEl.style.left = ""; finderEl.style.top = ""; }
      },
    });
    return voidWireEventsApi;
  }

  function initVoidChatApi() {
    if (voidChatApi) return voidChatApi;
    voidChatApi = createVoidChatApi({
      $,
      log,
      setStatus,
      ROOT_ID,
      getActiveProject: () => state.activeProject,
      setActiveFolderId: (id) => { state.activeFolderId = id; },
      setFinderCollapsed: (v) => setFinderCollapsed(v),
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
      chooseWorkerModel: () => initVoidGenerateApi().chooseWorkerModel(),
      callModelValue: (...args) => initVoidGenerateApi().callModelValue(...args),
      callWithFailover: (...args) => initVoidGenerateApi().callWithFailover(...args),
      getLastWorkedModel: () => initVoidGenerateApi().getLastWorkedModel(),
      setLastWorkedModel: (v) => initVoidGenerateApi().setLastWorkedModel(v),
      getRunAbort: () => runAbort,
      setRunAbort: (v) => { runAbort = v; },
      generate: (...args) => initVoidGenerateApi().generate(...args),
      termExec,
      appendTermLine,
      openTerminal,
      getTermLines: () => termLines,
      setTermLines: (v) => { termLines = v; },
      renderTermOutput,
      openEditorAtLine,
    });
    return voidChatApi;
  }

  function folderSvg() {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#69b7ff" d="M6 18.5c0-4 3.2-7.2 7.2-7.2h12.5c2 0 3.5.6 5 2.1l3.1 3.1h17c4 0 7.2 3.2 7.2 7.2v2.1H6v-7.3Z"/><path fill="#4aa3ff" d="M6 24.5h52v22.3c0 4-3.2 7.2-7.2 7.2H13.2c-4 0-7.2-3.2-7.2-7.2V24.5Z"/><path fill="rgba(255,255,255,.34)" d="M10 25h44v3H10z"/></svg>`;
  }

  function fileSvg() {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#f7fbff" d="M15 5h24l13 13v36.5A4.5 4.5 0 0 1 47.5 59h-33a4.5 4.5 0 0 1-4.5-4.5v-45A4.5 4.5 0 0 1 15 5Z"/><path fill="#d8e8f7" d="M39 5v12.5c0 2.5 2 4.5 4.5 4.5H52L39 5Z"/><path fill="#58c7e8" d="M20 32h24v4H20zm0 9h24v4H20zm0 9h15v4H20z"/></svg>`;
  }

  function settingsSvg() {
    return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="58" rx="20" ry="4.2" fill="#000000" opacity=".36"/>
      <path d="m37 6.5 2.3 7.2c1.3.4 2.6.9 3.8 1.6l6.8-3.5 6.4 6.4-3.5 6.8c.7 1.2 1.2 2.5 1.6 3.8l7.2 2.3v9.1l-7.2 2.3c-.4 1.3-.9 2.6-1.6 3.8l3.5 6.8-6.4 6.4-6.8-3.5c-1.2.7-2.5 1.2-3.8 1.6L37 64.8h-9.1l-2.3-7.2a22 22 0 0 1-3.8-1.6L15 59.5l-6.4-6.4 3.5-6.8a22 22 0 0 1-1.6-3.8l-7.2-2.3v-9.1l7.2-2.3c.4-1.3.9-2.6 1.6-3.8l-3.5-6.8 6.4-6.4 6.8 3.5c1.2-.7 2.5-1.2 3.8-1.6l2.3-7.2H37Z" fill="#c7ced7"/>
      <path d="m36.4 8.5 2.1 6.5c1.5.4 3 1 4.3 1.8l6.2-3.2 5.1 5.1-3.2 6.2c.8 1.3 1.4 2.8 1.8 4.3l6.5 2.1v7.2l-6.5 2.1a20 20 0 0 1-1.8 4.3l3.2 6.2-5.1 5.1-6.2-3.2a20 20 0 0 1-4.3 1.8l-2.1 6.5h-7.2L27.1 55a20 20 0 0 1-4.3-1.8l-6.2 3.2-5.1-5.1 3.2-6.2a20 20 0 0 1-1.8-4.3l-6.5-2.1v-7.2l6.5-2.1c.4-1.5 1-3 1.8-4.3l-3.2-6.2 5.1-5.1 6.2 3.2c1.3-.8 2.8-1.4 4.3-1.8l2.1-6.5h7.2Z" fill="#87919d"/>
      <path d="M18 15.4 15.4 18M49.5 18.3l-3-2.8M56.6 35H52M12 35H7.4M22.7 54.3l1.7-3.8M41.8 50.5l1.8 3.8" stroke="#ffffff" stroke-width="1.4" opacity=".44" stroke-linecap="round"/>
      <circle cx="32.4" cy="34.9" r="15.2" fill="#59636f"/>
      <circle cx="32.4" cy="34.9" r="9.1" fill="#1e2630"/>
      <circle cx="28" cy="28.5" r="10" fill="#ffffff" opacity=".2"/>
      <path d="M21.5 24c5.1-6 14.5-7.3 21-2.2" stroke="#ffffff" stroke-width="1.6" opacity=".36" stroke-linecap="round"/>
    </svg>`;
  }

  function trashSvg(full = false) {
    const contents = full
      ? `<path d="M21 33h22l-2.2 18H23.2L21 33Z" fill="#9ec3e9" opacity=".52"/><path d="M25 39h14M26 44h11" stroke="#577ca9" stroke-width="2" stroke-linecap="round" opacity=".78"/>`
      : "";
    return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="58" rx="18.5" ry="4.2" fill="#000000" opacity=".34"/>
      <path d="M17.5 20.5h29L43.2 55H20.8L17.5 20.5Z" fill="#c8d1da"/>
      <path d="M21.2 23h21.6L40.4 52H23.6L21.2 23Z" fill="#f8fbff" opacity=".36"/>
      <path d="M32 20.5h14.5L43.2 55H32Z" fill="#6f7b87" opacity=".42"/>
      ${contents}
      <path d="M16 20.5h32M24.4 20.5l2.5-7h10.2l2.5 7" fill="none" stroke="#3d4650" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M26.8 27.5 28 49M37.2 27.5 36 49" stroke="#65707c" stroke-width="2.3" stroke-linecap="round"/>
      <path d="M21.7 21.8h20.6" stroke="#ffffff" stroke-width="1.4" opacity=".78" stroke-linecap="round"/>
      <path d="M23.4 25c1.6 8.8 1.8 17.1.8 25.8" stroke="#ffffff" stroke-width="1.2" opacity=".25" stroke-linecap="round"/>
    </svg>`;
  }

  // ── Wallpaper ────────────────────────────────────────────────────
  const WP_DB_NAME = "hashui_wallpaper_v1";
  const WP_STORE   = "blobs";
  const WP_KEY     = "current";
  let   _wpBlobUrl = null;   // revoked & replaced on each set

  function _openWpDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(WP_DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(WP_STORE))
          req.result.createObjectStore(WP_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  async function saveWallpaperBlob(blob) {
    const db    = await _openWpDb();
    const store = db.transaction(WP_STORE, "readwrite").objectStore(WP_STORE);
    await new Promise((res, rej) => {
      const r = store.put(blob, WP_KEY);
      r.onsuccess = res; r.onerror = rej;
    });
    db.close();
  }

  async function loadWallpaperBlob() {
    const db    = await _openWpDb();
    const store = db.transaction(WP_STORE, "readonly").objectStore(WP_STORE);
    const blob  = await new Promise((res, rej) => {
      const r = store.get(WP_KEY);
      r.onsuccess = () => res(r.result); r.onerror = rej;
    });
    db.close();
    return blob || null;
  }

  async function deleteWallpaperBlob() {
    const db    = await _openWpDb();
    const store = db.transaction(WP_STORE, "readwrite").objectStore(WP_STORE);
    await new Promise((res, rej) => {
      const r = store.delete(WP_KEY);
      r.onsuccess = res; r.onerror = rej;
    });
    db.close();
  }

  async function applyWallpaper() {
    const desktop = $("voidDesktop");
    if (!desktop) return;
    // revoke previous object URL to free memory
    if (_wpBlobUrl) { URL.revokeObjectURL(_wpBlobUrl); _wpBlobUrl = null; }
    const blob = await loadWallpaperBlob().catch(() => null);
    if (blob) {
      _wpBlobUrl = URL.createObjectURL(blob);
      desktop.style.backgroundImage =
        `linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.14)),url(${_wpBlobUrl})`;
    } else {
      desktop.style.backgroundImage = "";
    }
  }

  function setWallpaperMenu(open) {
    const menu = $("voidWallpaperMenu");
    if (!menu) return;
    if (open) menu.removeAttribute("hidden");
    else menu.setAttribute("hidden", "");
  }

  function openEditorAtLine(filePath, targetLine) {
    const clean = String(filePath || "").replace(/^\/+/, "");
    const item  = visibleProjectFiles().find(f => f.type === "file" && f.path === clean);
    if (!item) return;
    finderCollapsed = false;
    renderAll();
    openEditor(item.id);
    setTimeout(() => {
      const ta = $("voidEditorText");
      if (!ta) return;
      const lines = ta.value.split("\n");
      const ln    = Math.max(1, Math.min(targetLine, lines.length)) - 1;
      const charIdx = lines.slice(0, ln).join("\n").length + (ln > 0 ? 1 : 0);
      ta.setSelectionRange(charIdx, charIdx + lines[ln].length);
      ta.scrollTop = Math.max(0, ln - 4) * 18;
      ta.focus();
    }, 120);
  }

  // ── Change summary bubble ─────────────────────────────────────────
  async function exportZip() {
    if (!state.activeProject) return;
    rebuildPaths();
    const entries = [];
    for (const folder of visibleProjectFiles().filter(f => f.type === "folder")) entries.push({ name: folder.path.replace(/\/?$/, "/"), data: "" });
    for (const file of visibleProjectFiles().filter(f => f.type === "file")) entries.push({ name: file.path, data: file.content || "" });
    if (!entries.length) {
      log("Nothing to export.", "warn");
      return;
    }
    const blob = makeZip(entries, normalizeVirtualPath);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `desktop-files.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    log(`Exported ${entries.length} ZIP entr${entries.length === 1 ? "y" : "ies"}`, "ok");
  }

  async function mount() {
    return initVoidWireEventsApi().mount();
  }

  function destroy() {
    mounted = false;
    if (runAbort) runAbort.abort();
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
    closeEditor();
  }

  return { mount, destroy };
})();

window.VoidStudio = VoidStudio;

