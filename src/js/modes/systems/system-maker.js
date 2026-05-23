import {
  STORE_KEY,
  DATA_KEY_PREFIX,
  UI_STORE_KEY,
  MAX_HISTORY,
  DOMAIN_BG,
  DOMAIN_SHELL_OPTIONS,
  CREATIVE_DIRECTIVES,
  VALID_SCREENS,
  FALLBACK_SCREENS,
  ACCENT_PALETTE,
  FINANCE_ENTITY_IDS,
  KPI_ICONS,
} from './constants.js';
import {
  esc,
  shadeHex,
  hexToRgb,
  pickRandom,
  uid,
  nowLabel,
  structuredCloneSafe,
  slug,
  threeWords,
  titleCase,
  fieldType,
} from './utils.js';
import { detectDomain, DOMAIN_CONFIG, inferNameFromDesc } from './domain-config.js';
import { createSystemsRenderApi } from './render.js';
import { createSystemsSpecApi } from './spec-normalize.js';
import { createSystemsGenerateApi } from './generate.js';

// ════════════════════════════════════════════════════════════════════
//  SYSTEM MAKER — interactive business app prototype builder
// ════════════════════════════════════════════════════════════════════

const SystemMaker = (() => {

  let mounted = false;
  let systems = [];
  let activeId = null;
  let activeModuleId = "";
  let selectedRecordId = "";
  let activeEntityId = "";
  let sortState = { field: "", dir: "asc" };
  let searchQuery = "";
  let runAbort = null;
  let traceStart = Date.now();
  let libraryCollapsed = false;
  let inspectorCollapsed = true;
  let filterRules = [];
  let filterPanelOpen = false;
  let selectedIds = new Set();
  let importState = null;
  let recordModalIsNew = false;

  const $ = (id) => document.getElementById(id);

  function _sysDialog({ msg, showInput, inputDefault, showCancel }) {
    return new Promise(resolve => {
      const overlay   = document.getElementById("amkDialog");
      const msgEl     = document.getElementById("amkDialogMsg");
      const inputEl   = document.getElementById("amkDialogInput");
      const okBtn     = document.getElementById("amkDialogOk");
      const cancelBtn = document.getElementById("amkDialogCancel");
      if (!overlay) { resolve(showInput ? inputDefault : (showCancel ? true : undefined)); return; }
      msgEl.textContent       = msg;
      inputEl.style.display   = showInput  ? "block" : "none";
      cancelBtn.style.display = showCancel ? ""      : "none";
      if (showInput) inputEl.value = inputDefault || "";
      overlay.classList.add("open");
      if (showInput) setTimeout(() => { inputEl.focus(); inputEl.select(); }, 80);
      const cleanup = () => {
        overlay.classList.remove("open");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        inputEl.removeEventListener("keydown", onKey);
      };
      const onOk     = () => { cleanup(); resolve(showInput ? inputEl.value : true); };
      const onCancel = () => { cleanup(); resolve(showInput ? null : false); };
      const onKey    = (e) => { if (e.key === "Enter") onOk(); if (e.key === "Escape") onCancel(); };
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      inputEl.addEventListener("keydown", onKey);
    });
  }
  const _sysPrompt  = (msg, def) => _sysDialog({ msg, showInput: true,  inputDefault: def, showCancel: true });
  const _sysConfirm = (msg)      => _sysDialog({ msg, showInput: false, showCancel: true });

  function setStatus(text, cls = "") {
    const el = $("sysRunStatus");
    if (!el) return;
    el.textContent = text;
    el.className = `sys-run-status ${cls}`.trim();
    const dot = $("sysTraceDot");
    if (dot) {
      if (cls === "running") dot.className = "sys-trace-dot running";
      else if (cls === "done") dot.className = "sys-trace-dot done";
      else if (cls === "error") dot.className = "sys-trace-dot error";
      else dot.className = "sys-trace-dot";
    }
  }

  const traceIcons = {
    run:  `<svg viewBox="0 0 16 16"><path d="M4 2.5 12.5 8 4 13.5z"/></svg>`,
    ok:   `<svg viewBox="0 0 16 16"><path d="m3 8.5 3 3L13 4"/></svg>`,
    plan: `<svg viewBox="0 0 16 16"><path d="M3 3h10v10H3z"/><path d="M5 6h6M5 9h4"/></svg>`,
    data: `<svg viewBox="0 0 16 16"><ellipse cx="8" cy="3.5" rx="5" ry="2"/><path d="M3 3.5v6c0 1.1 2.2 2 5 2s5-.9 5-2v-6"/><path d="M3 6.5c0 1.1 2.2 2 5 2s5-.9 5-2"/></svg>`,
    warn: `<svg viewBox="0 0 16 16"><path d="M8 2 14 13H2z"/><path d="M8 6v3M8 11h.01"/></svg>`,
    err:  `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4"/></svg>`,
  };

  const traceAgentLabel = {
    run:  "Agent",
    ok:   "Done",
    plan: "Architect",
    data: "Data Eng",
    warn: "Warning",
    err:  "Error",
  };

  function trace(msg, cls = "run") {
    const el = $("sysTrace");
    if (!el) return;

    // Auto-expand console on first entry
    const console_ = $("sysTraceConsole");
    if (console_ && console_.classList.contains("collapsed")) {
      console_.classList.remove("collapsed");
      console_.classList.add("expanded");
    }

    const t = ((Date.now() - traceStart) / 1000).toFixed(1);
    const row = document.createElement("div");
    row.className = "sys-trace-entry";
    const agentLabel = traceAgentLabel[cls] || "Agent";
    row.innerHTML =
      `<span class="sys-te-time">[${t}s]</span>` +
      `<span class="sys-te-agent sys-te-${cls}">${esc(agentLabel)}</span>` +
      `<span class="sys-te-icon sys-te-${cls}">${traceIcons[cls] || traceIcons.run}</span>` +
      `<span class="sys-te-msg sys-te-${cls}">${esc(msg)}</span>`;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;

    // Also mirror into bottom drawer so traces are always visible
    if (console_) {
      let entries = console_.querySelector(".sys-trace-entries");
      if (!entries) {
        entries = document.createElement("div");
        entries.className = "sys-trace-entries";
        console_.appendChild(entries);
      }
      entries.appendChild(row.cloneNode(true));
      entries.scrollTop = entries.scrollHeight;
    }

    // Update dot + summary
    const dot = $("sysTraceDot");
    if (dot) dot.className = "sys-trace-dot" + (cls === "err" ? " error" : cls === "ok" ? " done" : " running");
    const summary = $("sysTraceSummary");
    if (summary) summary.textContent = msg.slice(0, 70);
  }

  function clearTrace() {
    traceStart = Date.now();
    const el = $("sysTrace");
    if (el) el.innerHTML = "";
    const console_ = $("sysTraceConsole");
    const entries = console_?.querySelector(".sys-trace-entries");
    if (entries) entries.innerHTML = "";
    const dot = $("sysTraceDot");
    if (dot) dot.className = "sys-trace-dot";
    const summary = $("sysTraceSummary");
    if (summary) summary.textContent = "No run yet";
  }

  function updateCreateButtonState() {
    const btn = $("sysCreateBtn");
    if (!btn) return;
    const running = !!runAbort;
    const stopping = running && runAbort.signal?.aborted;
    btn.disabled = false;
    btn.textContent = stopping ? "Stopping" : running ? "Stop" : "Generate";
    btn.classList.toggle("primary", !running);
    btn.classList.toggle("danger", running);
    btn.setAttribute("aria-label", running ? "Stop system generation" : "Generate system");
    btn.title = running ? "Stop the current generation run" : "Generate a new system";
  }

  function stopSystemGeneration() {
    if (!runAbort) return;
    if (!runAbort.signal?.aborted) {
      trace("Stop requested — aborting active generation", "warn");
      runAbort.abort();
    }
    setStatus("Stopping", "running");
    updateCreateButtonState();
  }

  function loadUiState() {
    try {
      const saved = JSON.parse(localStorage.getItem(UI_STORE_KEY) || "{}");
      libraryCollapsed = false;
      inspectorCollapsed = true; // always start closed; opens on demand
    } catch {
      libraryCollapsed = false;
      inspectorCollapsed = true;
    }
  }

  function saveUiState() {
    try { localStorage.setItem(UI_STORE_KEY, JSON.stringify({ libraryCollapsed, inspectorCollapsed })); } catch {}
  }

  function applyPanelState() {
    const wrap = $("system-maker-wrap");
    if (!wrap) return;
    wrap.classList.toggle("library-collapsed", libraryCollapsed);
    wrap.classList.toggle("data-collapsed", inspectorCollapsed);
  }

  function setLibraryCollapsed(value) {
    libraryCollapsed = !!value;
    applyPanelState();
    saveUiState();
  }

  function setInspectorCollapsed(value) {
    inspectorCollapsed = !!value;
    applyPanelState();
    saveUiState();
  }

  function loadSystems() {
    try {
      systems = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      if (!Array.isArray(systems)) systems = [];
    } catch {
      systems = [];
    }
    systems = systems.map(s => normalizeSpec(s, s.description || "")).filter(Boolean);
    activeId = systems[0]?.id || null;
  }

  function saveSystems() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(systems)); } catch {}
  }

  function dataKey(id) {
    return DATA_KEY_PREFIX + id;
  }

  function getActive() {
    return systems.find(s => s.id === activeId) || null;
  }

  function getRuntimeData(spec) {
    if (!spec) return {};
    try {
      const saved = JSON.parse(localStorage.getItem(dataKey(spec.id)) || "null");
      if (saved && typeof saved === "object") return saved;
    } catch {}
    return structuredCloneSafe(spec.mockData || {});
  }

  function saveRuntimeData(spec, data) {
    if (!spec) return;
    try { localStorage.setItem(dataKey(spec.id), JSON.stringify(data || {})); } catch {}
  }

  function resetRuntimeData(spec) {
    if (!spec) return;
    try { localStorage.removeItem(dataKey(spec.id)); } catch {}
  }

  function moduleIcon(name) {
    const n = String(name || "").toLowerCase();
    if (/dashboard|overview|home|summary/.test(n)) return "dashboard";
    if (/sale|revenue|crm/.test(n)) return "chart";
    if (/customer|client|contact/.test(n)) return "customers";
    if (/inventory|product|stock|warehouse/.test(n)) return "box";
    if (/order|purchase|requisition/.test(n)) return "orders";
    if (/menu|food|recipe|dish|cuisine/.test(n)) return "menu";
    if (/finance|account|invoice|billing|payment/.test(n)) return "coin";
    if (/hr|employee|staff|payroll/.test(n)) return "people";
    if (/report|analytic|insight|metric/.test(n)) return "reports";
    if (/project|task|operation|workflow/.test(n)) return "flow";
    if (/supplier|vendor|procurement/.test(n)) return "supplier";
    if (/setting|config|admin/.test(n)) return "settings";
    if (/document|contract|file/.test(n)) return "docs";
    if (/schedule|calendar|appointment/.test(n)) return "calendar";
    if (/ship|deliver|logistics|dispatch/.test(n)) return "truck";
    if (/support|ticket|help/.test(n)) return "support";
    if (/market|campaign|email/.test(n)) return "marketing";
    return "grid";
  }

  function iconSvg(type) {
    const set = {
      dashboard: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="2" rx=".5"/><rect x="2" y="12" width="5" height="2" rx=".5"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
      chart: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 13V3M2 13h12"/><path d="M5 10V7M8 10V4M11 10V6"/></svg>`,
      customers: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2"/><path d="M2 13a4 4 0 0 1 8 0"/><path d="M11 7a2 2 0 1 0 0-4"/><path d="M14 13a3 3 0 0 0-3-3"/></svg>`,
      box: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2 13 4.7v6.6L8 14l-5-2.7V4.7z"/><path d="m3 4.7 5 2.7 5-2.7M8 7.4V14"/></svg>`,
      orders: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 7h6M5 10h4"/><circle cx="11" cy="10" r="1" fill="currentColor" stroke="none"/></svg>`,
      menu: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2a3 3 0 0 0-3 3c0 1.5.8 2.6 2 3.2V13h2v-4.8c1.2-.6 2-1.7 2-3.2a3 3 0 0 0-3-3z"/><path d="M5 12h6"/></svg>`,
      coin: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 5.5v5M6.5 7h2.3a1.2 1.2 0 0 1 0 2.4H7"/></svg>`,
      people: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2"/><path d="M2.5 13a3.5 3.5 0 0 1 7 0"/><path d="M10 7a2 2 0 0 0 0-4M10.5 10.5A3 3 0 0 1 13.5 13"/></svg>`,
      reports: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M5 6h6M5 9h6M5 12h3"/></svg>`,
      flow: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="4" height="4" rx="1"/><rect x="10" y="2" width="4" height="4" rx="1"/><rect x="6" y="10" width="4" height="4" rx="1"/><path d="M6 4h4M8 6v4"/></svg>`,
      supplier: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="8" height="8" rx="1"/><path d="M10 7h2.5L14 9.5V13h-4"/><circle cx="5" cy="13.5" r="1.2"/><circle cx="11" cy="13.5" r="1.2"/></svg>`,
      settings: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2"/><path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.8 3.8l.7.7M11.5 11.5l.7.7M3.8 12.2l.7-.7M11.5 4.5l.7-.7"/></svg>`,
      docs: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h6l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M10 2v3h3M5 8h6M5 11h4"/></svg>`,
      calendar: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v2M11 2v2M2 7h12"/><circle cx="5.5" cy="10" r=".8" fill="currentColor" stroke="none"/><circle cx="8" cy="10" r=".8" fill="currentColor" stroke="none"/><circle cx="10.5" cy="10" r=".8" fill="currentColor" stroke="none"/></svg>`,
      truck: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="5" width="9" height="7" rx="1"/><path d="M10 7h2.5L14 9v3h-4"/><circle cx="4" cy="12.5" r="1.2"/><circle cx="11.5" cy="12.5" r="1.2"/></svg>`,
      support: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M6 6a2 2 0 1 1 2.7 1.9C8.3 8.2 8 8.6 8 9"/><circle cx="8" cy="11.5" r=".6" fill="currentColor" stroke="none"/></svg>`,
      marketing: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9V7l8-4v10L3 9z"/><path d="M3 7v5a2 2 0 0 0 2 2"/><circle cx="13" cy="8" r="1.5"/></svg>`,
      grid: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
    };
    return set[type] || set.grid;
  }

  let specApi, generateApi;
  function initSpecApi() {
    if (specApi) return specApi;
    specApi = createSystemsSpecApi({ getRuntimeData });
    return specApi;
  }
  function initGenerateApi() {
    if (generateApi) return generateApi;
    generateApi = createSystemsGenerateApi({
      $, st, setStatus, trace, clearTrace, updateCreateButtonState, stopSystemGeneration,
      getActive, getRuntimeData, saveRuntimeData, saveSystems, renderAll,
      normalizeSpec: (...a) => initSpecApi().normalizeSpec(...a),
      defaultFields: (...a) => initSpecApi().defaultFields(...a),
      moduleIcon,
    });
    return generateApi;
  }
  const normalizeSpec = (...a) => initSpecApi().normalizeSpec(...a);
  const defaultFields = (...a) => initSpecApi().defaultFields(...a);
  const generateWithModel = (...a) => initGenerateApi().generateWithModel(...a);
  const createSystem = (...a) => initGenerateApi().createSystem(...a);
  const fallbackSystem = (...a) => initGenerateApi().fallbackSystem(...a);

  const st = {
    get systems() { return systems; }, set systems(v) { systems = v; },
    get activeId() { return activeId; }, set activeId(v) { activeId = v; },
    get activeModuleId() { return activeModuleId; }, set activeModuleId(v) { activeModuleId = v; },
    get selectedRecordId() { return selectedRecordId; }, set selectedRecordId(v) { selectedRecordId = v; },
    get activeEntityId() { return activeEntityId; }, set activeEntityId(v) { activeEntityId = v; },
    get sortState() { return sortState; }, set sortState(v) { sortState = v; },
    get searchQuery() { return searchQuery; }, set searchQuery(v) { searchQuery = v; },
    get filterRules() { return filterRules; }, set filterRules(v) { filterRules = v; },
    get filterPanelOpen() { return filterPanelOpen; }, set filterPanelOpen(v) { filterPanelOpen = v; },
    get selectedIds() { return selectedIds; }, set selectedIds(v) { selectedIds = v; },
    get importState() { return importState; }, set importState(v) { importState = v; },
    get recordModalIsNew() { return recordModalIsNew; }, set recordModalIsNew(v) { recordModalIsNew = v; },
  };
  let renderApi;
  function initRenderApi() {
    if (renderApi) return renderApi;
    renderApi = createSystemsRenderApi({
      $, st, getActive, getRuntimeData, saveRuntimeData, saveSystems, trace,
      moduleIcon, iconSvg,
    });
    return renderApi;
  }
  const R = () => initRenderApi();
  const renderAll = () => R().renderAll();
  const renderPreview = () => R().renderPreview();
  const renderDataEditor = () => R().renderDataEditor();
  const selectSystem = (id) => R().selectSystem(id);
  const deleteRecord = () => R().deleteRecord();
  const saveRecord = () => R().saveRecord();
  const saveRecordFromModal = () => R().saveRecordFromModal();
  const closeRecordModal = () => R().closeRecordModal();
  const showRecordModal = (...a) => R().showRecordModal(...a);
  const confirmImport = () => R().confirmImport();
  const closeImportModal = () => R().closeImportModal();
  const restoreVersion = (idx) => R().restoreVersion(idx);
  const syncModelSelect = () => R().syncModelSelect();

  function wireEvents() {
    // ── Header / nav ────────────────────────────────────────────────
    $("sysCreateBtn")?.addEventListener("click", createSystem);
    $("sysNewBtn")?.addEventListener("click", () => {
      activeId = null;
      activeModuleId = "";
      activeEntityId = "";
      selectedRecordId = "";
      searchQuery = "";
      sortState = { field:"", dir:"asc" };
      filterRules = [];
      filterPanelOpen = false;
      selectedIds.clear();
      const prompt = $("sysPromptInput");
      if (prompt) prompt.value = "";
      clearTrace();
      setStatus("Idle");
      renderAll();
    });
    $("sysBackBtn")?.addEventListener("click", () => window._H?.setTab?.("chats"));
    $("sysToggleInspectorBtn")?.addEventListener("click", () => setInspectorCollapsed(!inspectorCollapsed));
    $("sysToggleLibraryBtn")?.addEventListener("click", () => setLibraryCollapsed(!libraryCollapsed));
    $("sysCloseLibraryBtn")?.addEventListener("click", () => setLibraryCollapsed(true));
    $("sysCloseInspectorBtn")?.addEventListener("click", () => setInspectorCollapsed(true));
    $("sysInspectorCloseBtn")?.addEventListener("click", () => setInspectorCollapsed(true));
    $("sysTraceToggle")?.addEventListener("click", () => {
      const tc = $("sysTraceConsole");
      if (!tc) return;
      const isCollapsed = tc.classList.contains("collapsed");
      tc.classList.toggle("collapsed", !isCollapsed);
      tc.classList.toggle("expanded", isCollapsed);
    });
    $("sysTraceClearBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      clearTrace();
      const tc = $("sysTraceConsole");
      if (tc) { tc.classList.add("collapsed"); tc.classList.remove("expanded"); }
    });
    $("sysResetDataBtn")?.addEventListener("click", () => {
      const spec = getActive();
      resetRuntimeData(spec);
      selectedIds.clear(); filterRules = []; filterPanelOpen = false;
      selectedRecordId = "";
      renderPreview(); renderDataEditor();
      trace("Mock data reset to original", "warn");
    });
    $("sysPromptInput")?.addEventListener("keydown", e => { if (e.key === "Enter") createSystem(); });
    $("sysPreviewImportBtn")?.addEventListener("click", () => {
      const spec = getActive();
      const entity = spec?.entities?.[activeEntityId];
      showImportModal(entity);
    });
    const setPreviewExportMenuOpen = (open) => {
      const menu = $("sysPreviewExportMenu");
      const btn = $("sysPreviewExportMenuBtn");
      if (!menu) return;
      menu.hidden = !open;
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", String(!open));
      if (btn) btn.setAttribute("aria-expanded", String(open));
    };
    $("sysPreviewExportMenuBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = $("sysPreviewExportMenu");
      if (menu) setPreviewExportMenuOpen(menu.hidden);
    });
    $("sysPreviewExportMenu")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-preview-export]");
      if (!btn) return;
      const spec = getActive();
      if (spec && btn.dataset.previewExport === "json") exportJSON(spec);
      if (spec && btn.dataset.previewExport === "csv") exportCSV(spec, activeEntityId);
      setPreviewExportMenuOpen(false);
    });
    document.addEventListener("click", (e) => {
      const menu = $("sysPreviewExportMenu");
      if (!menu || menu.hidden) return;
      if (e.target.closest("#sysPreviewExportMenuBtn") || e.target.closest("#sysPreviewExportMenu")) return;
      setPreviewExportMenuOpen(false);
    });

    // ── ERP list ────────────────────────────────────────────────────
    $("sysSystemList")?.addEventListener("click", async e => {
      const renameBtn = e.target.closest("[data-sys-rename]");
      if (renameBtn) {
        e.stopPropagation();
        const sys = systems.find(s => s.id === renameBtn.dataset.sysRename);
        if (!sys) return;
        const newName = await _sysPrompt("Rename system:", sys.name);
        if (newName?.trim()) { sys.name = threeWords(newName.trim()); sys.updatedAt = Date.now(); saveSystems(); renderSystemList(); if (sys.id === activeId) $("sysPreviewName").textContent = sys.name; }
        return;
      }
      const deleteBtn = e.target.closest("[data-sys-delete]");
      if (deleteBtn) {
        e.stopPropagation();
        const sys = systems.find(s => s.id === deleteBtn.dataset.sysDelete);
        if (!sys) return;
        systems = systems.filter(s => s.id !== sys.id);
        if (activeId === sys.id) {
          activeId = systems[0]?.id || null;
          activeModuleId = "";
          activeEntityId = "";
          selectedRecordId = "";
        }
        saveSystems(); renderAll();
        trace(`Deleted "${sys.name}"`, "ok");
        return;
      }
      const card = e.target.closest("[data-system-id]");
      if (card) selectSystem(card.dataset.systemId);
    });
    $("sysVersionList")?.addEventListener("click", e => {
      const card = e.target.closest("[data-version-index]");
      if (card) restoreVersion(Number(card.dataset.versionIndex));
    });

    // ── App host (delegated) ────────────────────────────────────────
    $("sysAppHost")?.addEventListener("click", e => {
      const spec = getActive();

      // Record modal actions (edit / delete)
      const actionBtn = e.target.closest("[data-action]");
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        const rid = actionBtn.dataset.recordId;
        if (action === "edit") {
          selectedRecordId = rid;
          const entity = spec?.entities?.[activeEntityId];
          const data = getRuntimeData(spec);
          const record = (data[activeEntityId] || []).find(r => r.id === rid);
          showRecordModal(record, entity, false);
        } else if (action === "delete") {
          selectedRecordId = rid;
          deleteRecord();
        } else if (action === "run-workflow") {
          trace(`Workflow "${actionBtn.dataset.workflow}" triggered`, "run");
        }
        return;
      }

      // Add Record
      if (e.target.closest("#sysAddRecordBtn2")) {
        const entity = spec?.entities?.[activeEntityId];
        showRecordModal(null, entity, true);
        return;
      }

      // Import
      if (e.target.closest("#sysImportBtn")) {
        const entity = spec?.entities?.[activeEntityId];
        showImportModal(entity);
        return;
      }

      // Export dropdown toggle
      if (e.target.closest("#sysExportBtn")) {
        const menu = e.target.closest(".sys-export-wrap")?.querySelector(".sys-export-menu");
        if (menu) menu.style.display = menu.style.display === "none" ? "block" : "none";
        return;
      }
      // Export menu items
      if (e.target.closest("#sysExportCsvBtn")) {
        if (spec) exportCSV(spec, activeEntityId);
        const menu = e.target.closest(".sys-export-menu");
        if (menu) menu.style.display = "none";
        return;
      }
      if (e.target.closest("#sysExportAllCsvBtn")) {
        if (spec) exportAllEntitiesCSV(spec);
        const menu = e.target.closest(".sys-export-menu");
        if (menu) menu.style.display = "none";
        return;
      }
      if (e.target.closest("#sysExportJsonBtn")) {
        if (spec) exportJSON(spec);
        const menu = e.target.closest(".sys-export-menu");
        if (menu) menu.style.display = "none";
        return;
      }
      // Close export menu on outside click
      if (!e.target.closest(".sys-export-wrap")) {
        $("sysAppHost")?.querySelectorAll(".sys-export-menu").forEach(menu => { menu.style.display = "none"; });
      }

      // Bulk delete
      if (e.target.closest("#sysBulkDeleteBtn")) {
        if (!spec || selectedIds.size === 0) return;
        const data = getRuntimeData(spec);
        data[activeEntityId] = (data[activeEntityId] || []).filter(r => !selectedIds.has(r.id));
        selectedIds.clear();
        selectedRecordId = data[activeEntityId][0]?.id || "";
        saveRuntimeData(spec, data);
        renderPreview(); renderDataEditor();
        trace(`Deleted ${selectedIds.size || "bulk"} records`, "warn");
        return;
      }

      // Filter panel toggle
      if (e.target.closest("#sysFilterBtn")) {
        filterPanelOpen = !filterPanelOpen;
        if (!filterPanelOpen) { /* keep rules, just hide panel */ }
        renderPreview();
        return;
      }
      // Add filter rule
      if (e.target.closest("#sysAddFilterRule")) {
        const entity = spec?.entities?.[activeEntityId];
        const firstField = entity?.fields?.[0]?.id || "";
        filterRules.push({ id: uid("f"), field: firstField, op: "contains", value: "" });
        renderPreview();
        return;
      }
      // Clear all filters
      if (e.target.closest("#sysClearFilters")) {
        filterRules = [];
        renderPreview();
        return;
      }
      // Remove individual filter rule
      const removeBtn = e.target.closest(".sys-filter-remove");
      if (removeBtn) {
        filterRules = filterRules.filter(r => r.id !== removeBtn.dataset.ruleId);
        renderPreview();
        return;
      }

      // Kanban card row selection
      const kCard = e.target.closest(".sys-kanban-card");
      if (kCard && !e.target.closest("[data-action]")) {
        selectedRecordId = kCard.dataset.recordId;
        renderDataEditor();
        return;
      }

      // Select-all checkbox
      if (e.target.id === "sysSelectAll") {
        const entity = spec?.entities?.[activeEntityId];
        const data = getRuntimeData(spec);
        const records = prepareRecords(data[activeEntityId] || [], entity);
        if (e.target.checked) records.forEach(r => selectedIds.add(r.id));
        else selectedIds.clear();
        renderPreview();
        return;
      }
      // Individual row checkbox
      const rowCheck = e.target.closest(".sys-row-check");
      if (rowCheck) {
        const rid = rowCheck.dataset.recordId;
        if (rowCheck.checked) selectedIds.add(rid); else selectedIds.delete(rid);
        renderPreview();
        return;
      }

      // Module nav
      const mod = e.target.closest("[data-module-id]");
      if (mod) {
        activeModuleId = mod.dataset.moduleId;
        selectedRecordId = ""; searchQuery = ""; sortState = { field:"", dir:"asc" };
        filterRules = []; filterPanelOpen = false; selectedIds.clear();
        renderPreview(); renderDataEditor();
        return;
      }

      // Row selection — surgical: just toggle the CSS class, avoid full re-render
      const row = e.target.closest("tr[data-record-id]");
      if (row && !e.target.closest(".sys-td-actions") && !e.target.closest(".sys-td-check")) {
        selectedRecordId = row.dataset.recordId;
        host.querySelectorAll("tr[data-record-id]").forEach(r => {
          r.classList.toggle("selected", r.dataset.recordId === selectedRecordId);
        });
        renderDataEditor();
        return;
      }

      // Column sort
      const th = e.target.closest("[data-sort-field]");
      if (th) {
        const field = th.dataset.sortField;
        sortState = sortState.field === field ? { field, dir: sortState.dir === "asc" ? "desc" : "asc" } : { field, dir:"asc" };
        renderPreview();
      }
    });

    // Filter panel — change events (field / op / value inputs)
    $("sysAppHost")?.addEventListener("change", e => {
      const ruleId = e.target.dataset.ruleId;
      const prop = e.target.dataset.prop;
      if (ruleId && prop) {
        const rule = filterRules.find(r => r.id === ruleId);
        if (rule) { rule[prop] = e.target.value; renderPreview(); }
      }
    });
    $("sysAppHost")?.addEventListener("input", e => {
      if (e.target.id === "sysAppSearch") {
        searchQuery = e.target.value;
        const caretPos = e.target.selectionStart;
        renderPreview();
        const restored = $("sysAppSearch");
        if (restored) { restored.focus(); restored.setSelectionRange(caretPos, caretPos); }
        return;
      }
      const ruleId = e.target.dataset.ruleId;
      const prop = e.target.dataset.prop;
      if (ruleId && prop === "value") {
        const rule = filterRules.find(r => r.id === ruleId);
        if (rule) { rule.value = e.target.value; renderPreview(); }
      }
    });

    // ── Data Editor panel ────────────────────────────────────────────
    $("sysDataEditor")?.addEventListener("change", e => {
      if (e.target.id === "sysEntitySelect") {
        activeEntityId = e.target.value;
        const spec = getActive();
        const mod = spec?.modules.find(m => m.entity === activeEntityId);
        if (mod) activeModuleId = mod.id;
        selectedRecordId = "";
        renderPreview(); renderDataEditor();
      } else if (e.target.id === "sysRecordSelect") {
        selectedRecordId = e.target.value;
        renderPreview(); renderDataEditor();
      }
    });
    $("sysDataEditor")?.addEventListener("click", e => {
      if (e.target.id === "sysAddRecordBtn") {
        const spec = getActive();
        const entity = spec?.entities?.[activeEntityId];
        showRecordModal(null, entity, true);
      }
      if (e.target.id === "sysDeleteRecordBtn") deleteRecord();
      if (e.target.id === "sysSaveRecordBtn") saveRecord();
    });

    // ── Record modal ─────────────────────────────────────────────────
    $("sysRecordModalClose")?.addEventListener("click", closeRecordModal);
    $("sysRecordModalCancel")?.addEventListener("click", closeRecordModal);
    $("sysRecordModalSave")?.addEventListener("click", saveRecordFromModal);
    $("sysRecordModal")?.addEventListener("click", e => { if (e.target === $("sysRecordModal")) closeRecordModal(); });
    $("sysRecordModal")?.addEventListener("keydown", e => { if (e.key === "Escape") closeRecordModal(); if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); saveRecordFromModal(); } });

    // ── Import modal ─────────────────────────────────────────────────
    $("sysImportClose")?.addEventListener("click", closeImportModal);
    $("sysImportCancel")?.addEventListener("click", closeImportModal);
    $("sysImportConfirm")?.addEventListener("click", confirmImport);
    $("sysImportModal")?.addEventListener("click", e => { if (e.target === $("sysImportModal")) closeImportModal(); });
    $("sysImportModal")?.addEventListener("keydown", e => { if (e.key === "Escape") closeImportModal(); });
  }

  function mount() {
    syncModelSelect();
    if (!mounted) {
      mounted = true;
      loadUiState();
      loadSystems();
      wireEvents();
    }
    applyPanelState();
    updateCreateButtonState();
    renderAll();
  }

  return { mount };
})();

window.SystemMaker = SystemMaker;
