/**
 * Virtual OS Finder — tree, file list, breadcrumb, bar, navigation (Wave 13).
 */
import { esc } from './utils.js';

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

/**
 * @param {object} ctx
 */
export function createVoidFinderApi(ctx) {
  const {
    $,
    state,
    ROOT_ID,
    TRASH_ID,
    getItem,
    childrenOf,
    trashedProjectFiles,
    descendantIds,
    canMoveToParent,
    getSelectedId,
    setSelectedId,
    setDragItem,
    getDragItem,
    getDragOrigin,
    hasDragType,
    acceptItemDrop,
    moveItemToParent,
    deleteItemDirect,
    handleUpload,
    log,
    renderAll,
    openVoidSettings,
    openEditor,
    downloadItem,
    downloadFolder,
    renameItem,
    deleteItem,
    restoreItem,
    permanentDeleteItem,
    emptyTrash,
  } = ctx;

  let finderCollapsed = true;
  let finderHistory = [];
  let finderHistoryIdx = -1;
  let finderViewMode = "list";

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
    const fwd = $("voidFinderFwd");
    if (back) back.disabled = finderHistoryIdx <= 0;
    if (fwd) fwd.disabled = finderHistoryIdx >= finderHistory.length - 1;
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

  function detailAction(action) {
    if (action === "empty-trash") {
      emptyTrash();
      return;
    }
    const selectedId = getSelectedId();
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

  function renderFinderBar() {
    const status = $("voidFinderStatus");
    const actions = $("voidFinderBarActions");
    if (!status || !actions) return;
    const items = childrenOf(state.activeFolderId);
    const selectedId = getSelectedId();
    const sel = selectedId ? getItem(selectedId) : null;
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
    const finder = $("voidFinder");
    const titlebar = $("voidFinderTitlebar");
    if (!finder || !titlebar) return;

    const MIN_W = 260;
    const MIN_H = 220;

    function finderRect() {
      return finder.getBoundingClientRect();
    }

    function clampFinder() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const hasInlineW = !!finder.style.width;
      const hasInlineH = !!finder.style.height;
      const hasInlineL = !!finder.style.left;
      const hasInlineT = !!finder.style.top;
      const panelW = 320;
      const desktopW = Math.max(400, vw - panelW);
      const defaultW = Math.min(680, Math.max(MIN_W, Math.round(desktopW * 0.62)));
      const defaultH = Math.min(480, Math.max(MIN_H, Math.round(vh * 0.58)));
      const defaultL = Math.round(panelW + (desktopW - defaultW) / 2);
      const defaultT = Math.round((vh - defaultH) / 2);
      const curW = parseFloat(finder.style.width) || defaultW;
      const curH = parseFloat(finder.style.height) || defaultH;
      const curL = parseFloat(finder.style.left) || defaultL;
      const curT = parseFloat(finder.style.top) || defaultT;

      let w = Math.min(curW, vw - 20);
      let h = Math.min(curH, vh - 20);
      w = Math.max(w, MIN_W);
      h = Math.max(h, MIN_H);

      let l = Math.max(0, Math.min(curL, vw - w));
      let t = Math.max(0, Math.min(curT, vh - h));
      if (!hasInlineW) w = defaultW;
      if (!hasInlineH) h = defaultH;
      if (!hasInlineL) l = defaultL;
      if (!hasInlineT) t = defaultT;

      finder.style.width = w + "px";
      finder.style.height = h + "px";
      finder.style.left = l + "px";
      finder.style.top = t + "px";
    }

    clampFinder();
    window.addEventListener("resize", clampFinder);

    titlebar.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      if (e.target.closest("button, a") ||
          e.target.id === "voidFinderClose" ||
          e.target.id === "voidFinderMin" ||
          e.target.id === "voidFinderZoom") return;
      e.preventDefault();
      titlebar.setPointerCapture(e.pointerId);

      const r = finderRect();
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = r.left;
      const oy = r.top;
      const fw = r.width;
      const fh = r.height;
      finder.style.transition = "none";
      finder.classList.add("vf-dragging");

      function onMove(me) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        finder.style.left = Math.max(0, Math.min(vw - fw, ox + me.clientX - sx)) + "px";
        finder.style.top = Math.max(0, Math.min(vh - fh, oy + me.clientY - sy)) + "px";
      }
      function onUp() {
        finder.style.transition = "";
        finder.classList.remove("vf-dragging");
        titlebar.removeEventListener("pointermove", onMove);
        titlebar.removeEventListener("pointerup", onUp);
        titlebar.removeEventListener("pointercancel", onUp);
      }
      titlebar.addEventListener("pointermove", onMove);
      titlebar.addEventListener("pointerup", onUp);
      titlebar.addEventListener("pointercancel", onUp);
    });

    finder.querySelectorAll(".vf-resize").forEach(handle => {
      handle.addEventListener("pointerdown", e => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);

        const dir = handle.dataset.dir;
        const r = finderRect();
        const origW = r.width;
        const origH = r.height;
        const origL = r.left;
        const origT = r.top;
        const sx = e.clientX;
        const sy = e.clientY;
        finder.style.transition = "none";

        function onMove(me) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const dx = me.clientX - sx;
          const dy = me.clientY - sy;
          let w = origW;
          let h = origH;
          let l = origL;
          let t = origT;

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
          finder.style.width = w + "px";
          finder.style.height = h + "px";
          finder.style.left = l + "px";
          finder.style.top = t + "px";
        }
        function onUp() {
          finder.style.transition = "";
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onUp);
        }
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
      });
    });
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
    const selectedId = getSelectedId();
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
    setSelectedId(id);
    renderAll();
  }

  function openFolder(id) {
    const newId = id || ROOT_ID;
    if (newId !== ROOT_ID && newId !== TRASH_ID) {
      const item = getItem(newId);
      if (!item || item.type !== "folder") return;
    }
    finderHistory = finderHistory.slice(0, finderHistoryIdx + 1);
    finderHistory.push(newId);
    finderHistoryIdx = finderHistory.length - 1;
    state.activeFolderId = newId;
    setSelectedId(newId === ROOT_ID || newId === TRASH_ID ? "" : newId);
    finderCollapsed = false;
    renderAll();
  }

  function navigateHistory(delta) {
    const nextIdx = finderHistoryIdx + delta;
    if (nextIdx < 0 || nextIdx >= finderHistory.length) return;
    finderHistoryIdx = nextIdx;
    state.activeFolderId = finderHistory[finderHistoryIdx];
    const folderId = state.activeFolderId;
    setSelectedId(folderId === ROOT_ID || folderId === TRASH_ID ? "" : folderId);
    renderAll();
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

  async function finderTrashButtonAction() {
    const selectedId = getSelectedId();
    const item = selectedId ? getItem(selectedId) : null;
    if (!item) {
      openTrash();
      return;
    }
    if (item.deletedAt) await permanentDeleteItem(item.id);
    else await deleteItem(item.id);
  }

  function prepareMount() {
    finderCollapsed = true;
    finderHistory = [];
    finderHistoryIdx = -1;
    const wrapEl = document.getElementById("virtual-os-wrap");
    if (wrapEl) wrapEl.classList.add("finder-collapsed");
    const finderEl = document.getElementById("voidFinder");
    if (finderEl) {
      finderEl.style.width = "";
      finderEl.style.height = "";
      finderEl.style.left = "";
      finderEl.style.top = "";
    }
  }

  function wireFinderEvents() {
    $("voidFinderTrashBtn")?.addEventListener("click", finderTrashButtonAction);
    $("voidFinderSettingsBtn")?.addEventListener("click", openVoidSettings);
    $("voidFinderToggleBtn")?.addEventListener("click", () => setFinderCollapsed(!finderCollapsed));
    $("voidFinderClose")?.addEventListener("click", () => setFinderCollapsed(true));
    $("voidFinderBack")?.addEventListener("click", () => navigateHistory(-1));
    $("voidFinderFwd")?.addEventListener("click", () => navigateHistory(1));
    $("voidFinderViewToggle")?.addEventListener("click", () => {
      finderViewMode = finderViewMode === "list" ? "grid" : "list";
      const icon = $("voidFinderViewToggle");
      if (icon) icon.title = finderViewMode === "list" ? "Switch to grid view" : "Switch to list view";
      renderAll();
    });
    initFinderInteract();
  }

  function renderFinder() {
    renderTree();
    renderFileList();
    renderBreadcrumb();
    renderFinderBar();
    updateNavBtns();
    renderFinderToggle();
  }

  return {
    renderTree,
    renderFileList,
    renderBreadcrumb,
    renderFinderBar,
    renderFinderToggle,
    updateNavBtns,
    initFinderInteract,
    wireFinderEvents,
    renderFinder,
    openFolder,
    selectItem,
    setFinderCollapsed,
    openFinderTool,
    openTrash,
    finderTrashButtonAction,
    prepareMount,
    showFinder() {
      finderCollapsed = false;
      renderFinderToggle();
    },
  };
}
