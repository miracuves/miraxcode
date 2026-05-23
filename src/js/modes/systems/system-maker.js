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

  function defaultFields(entityName, domain = "") {
    const base = slug(entityName);

    // Domain-specific entity fields
    if (domain === "restaurant") {
      if (/order/.test(base)) return [
        { id:"table_number", label:"Table", type:"text", required:true },
        { id:"items", label:"Items Ordered", type:"textarea" },
        { id:"total", label:"Total ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Seated","Order Placed","Preparing","Served","Bill Requested","Paid"] },
        { id:"waiter", label:"Waiter", type:"text" },
        { id:"time_placed", label:"Time Placed", type:"date" },
        { id:"guests", label:"Guests", type:"number" },
      ];
      if (/menu|item/.test(base)) return [
        { id:"item_name", label:"Item Name", type:"text", required:true },
        { id:"category", label:"Category", type:"select", options:["Starters","Mains","Sides","Desserts","Drinks","Specials"] },
        { id:"price", label:"Price ($)", type:"number" },
        { id:"description", label:"Description", type:"textarea" },
        { id:"available", label:"Availability", type:"select", options:["Available","Out of Stock","Seasonal","Discontinued"] },
        { id:"prep_time", label:"Prep Time (min)", type:"number" },
      ];
      if (/table/.test(base)) return [
        { id:"table_number", label:"Table #", type:"text", required:true },
        { id:"capacity", label:"Capacity", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Available","Occupied","Reserved","Cleaning","Closed"] },
        { id:"section", label:"Section", type:"select", options:["Indoor","Outdoor","Bar","Private","Terrace"] },
        { id:"current_guests", label:"Current Guests", type:"number" },
        { id:"waiter", label:"Assigned Waiter", type:"text" },
      ];
      if (/ingredient/.test(base)) return [
        { id:"name", label:"Ingredient", type:"text", required:true },
        { id:"category", label:"Category", type:"select", options:["Produce","Protein","Dairy","Dry Goods","Beverages","Spices"] },
        { id:"quantity", label:"Qty in Stock", type:"number" },
        { id:"unit", label:"Unit", type:"text" },
        { id:"reorder_level", label:"Reorder At", type:"number" },
        { id:"status", label:"Status", type:"select", options:["In Stock","Low Stock","Out of Stock","Ordered"] },
        { id:"last_ordered", label:"Last Ordered", type:"date" },
      ];
      if (/staff/.test(base)) return [
        { id:"name", label:"Name", type:"text", required:true },
        { id:"role", label:"Role", type:"select", options:["Head Chef","Sous Chef","Line Cook","Waiter","Bartender","Host","Manager","Dishwasher"] },
        { id:"shift", label:"Shift", type:"select", options:["Morning","Afternoon","Evening","Night","Weekend"] },
        { id:"hourly_rate", label:"Hourly Rate ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Active","On Leave","Part-Time","Training","Terminated"] },
        { id:"start_date", label:"Start Date", type:"date" },
      ];
    }

    if (domain === "hotel") {
      if (/booking|reservation/.test(base)) return [
        { id:"guest_name", label:"Guest Name", type:"text", required:true },
        { id:"room_number", label:"Room #", type:"text" },
        { id:"check_in", label:"Check-In", type:"date" },
        { id:"check_out", label:"Check-Out", type:"date" },
        { id:"total", label:"Total ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Reserved","Confirmed","Checked In","Occupied","Checkout Pending","Checked Out","Cancelled"] },
        { id:"guests", label:"Guests", type:"number" },
      ];
      if (/room/.test(base)) return [
        { id:"room_number", label:"Room #", type:"text", required:true },
        { id:"type", label:"Type", type:"select", options:["Standard","Deluxe","Suite","Penthouse","Family Room","Studio"] },
        { id:"floor", label:"Floor", type:"number" },
        { id:"rate", label:"Nightly Rate ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Available","Occupied","Reserved","Maintenance","Cleaning","Out of Order"] },
        { id:"view", label:"View", type:"select", options:["City","Ocean","Garden","Pool","Mountain"] },
      ];
      if (/guest/.test(base)) return [
        { id:"name", label:"Guest Name", type:"text", required:true },
        { id:"email", label:"Email", type:"text" },
        { id:"nationality", label:"Nationality", type:"text" },
        { id:"loyalty_tier", label:"Loyalty Tier", type:"select", options:["Bronze","Silver","Gold","Platinum","Diamond"] },
        { id:"visits", label:"Total Stays", type:"number" },
        { id:"last_stay", label:"Last Stay", type:"date" },
      ];
      if (/housekeeping/.test(base)) return [
        { id:"room_number", label:"Room #", type:"text", required:true },
        { id:"housekeeper", label:"Housekeeper", type:"text" },
        { id:"status", label:"Status", type:"select", options:["Dirty","Assigned","Cleaning","Inspected","Ready"] },
        { id:"priority", label:"Priority", type:"select", options:["Normal","Express","Do Not Disturb"] },
        { id:"scheduled", label:"Scheduled", type:"date" },
        { id:"notes", label:"Notes", type:"textarea" },
      ];
    }

    if (domain === "healthcare") {
      if (/patient/.test(base)) return [
        { id:"name", label:"Patient Name", type:"text", required:true },
        { id:"dob", label:"Date of Birth", type:"date" },
        { id:"gender", label:"Gender", type:"select", options:["Male","Female","Other","Prefer not to say"] },
        { id:"blood_type", label:"Blood Type", type:"select", options:["A+","A-","B+","B-","AB+","AB-","O+","O-"] },
        { id:"doctor", label:"Assigned Doctor", type:"text" },
        { id:"status", label:"Status", type:"select", options:["Registered","Waiting","With Doctor","Under Observation","Discharged"] },
        { id:"last_visit", label:"Last Visit", type:"date" },
      ];
      if (/appointment/.test(base)) return [
        { id:"patient_name", label:"Patient", type:"text", required:true },
        { id:"doctor", label:"Doctor", type:"text" },
        { id:"department", label:"Department", type:"select", options:["General","Cardiology","Orthopedics","Pediatrics","Neurology","Dermatology","Emergency"] },
        { id:"date", label:"Date", type:"date" },
        { id:"status", label:"Status", type:"select", options:["Scheduled","Confirmed","In Progress","Completed","Cancelled","No Show"] },
        { id:"type", label:"Type", type:"select", options:["Consultation","Follow-Up","Emergency","Check-Up","Procedure"] },
      ];
    }

    if (domain === "fitness") {
      if (/member/.test(base)) return [
        { id:"name", label:"Member Name", type:"text", required:true },
        { id:"email", label:"Email", type:"text" },
        { id:"membership_type", label:"Plan", type:"select", options:["Basic","Standard","Premium","VIP","Student","Corporate"] },
        { id:"status", label:"Status", type:"select", options:["Trial","Active","Expiring","Expired","Cancelled","Frozen"] },
        { id:"join_date", label:"Join Date", type:"date" },
        { id:"monthly_fee", label:"Monthly Fee ($)", type:"number" },
        { id:"trainer", label:"Personal Trainer", type:"text" },
      ];
      if (/class|schedule/.test(base)) return [
        { id:"class_name", label:"Class", type:"text", required:true },
        { id:"trainer", label:"Trainer", type:"text" },
        { id:"date", label:"Date", type:"date" },
        { id:"capacity", label:"Capacity", type:"number" },
        { id:"enrolled", label:"Enrolled", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Scheduled","Full","In Progress","Completed","Cancelled"] },
        { id:"type", label:"Type", type:"select", options:["Yoga","HIIT","Cycling","Pilates","Strength","CrossFit","Cardio","Swim"] },
      ];
    }

    if (domain === "realestate") {
      if (/propert/.test(base)) return [
        { id:"address", label:"Address", type:"text", required:true },
        { id:"type", label:"Type", type:"select", options:["Apartment","Villa","Office","Retail","Land","Warehouse","Townhouse"] },
        { id:"price", label:"Price ($)", type:"number" },
        { id:"bedrooms", label:"Bedrooms", type:"number" },
        { id:"area_sqft", label:"Area (sqft)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Available","Under Offer","Sold","Off Market","Rented","Maintenance"] },
        { id:"agent", label:"Agent", type:"text" },
        { id:"listed_date", label:"Listed", type:"date" },
      ];
      if (/lead|deal/.test(base)) return [
        { id:"client_name", label:"Client", type:"text", required:true },
        { id:"property", label:"Property Interest", type:"text" },
        { id:"budget", label:"Budget ($)", type:"number" },
        { id:"status", label:"Stage", type:"select", options:["Lead","Qualified","Viewing Scheduled","Offer Made","Under Contract","Closed","Lost"] },
        { id:"agent", label:"Agent", type:"text" },
        { id:"date", label:"Date", type:"date" },
      ];
    }

    if (domain === "logistics") {
      if (/shipment/.test(base)) return [
        { id:"tracking_number", label:"Tracking #", type:"text", required:true },
        { id:"origin", label:"Origin", type:"text" },
        { id:"destination", label:"Destination", type:"text" },
        { id:"weight_kg", label:"Weight (kg)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Booked","Assigned","In Transit","At Depot","Out for Delivery","Delivered","Failed"] },
        { id:"driver", label:"Driver", type:"text" },
        { id:"expected_date", label:"Expected Delivery", type:"date" },
        { id:"value", label:"Cargo Value ($)", type:"number" },
      ];
    }

    if (domain === "retail") {
      if (/product/.test(base)) return [
        { id:"name", label:"Product Name", type:"text", required:true },
        { id:"sku", label:"SKU", type:"text" },
        { id:"category", label:"Category", type:"select", options:["Clothing","Electronics","Home","Beauty","Sports","Food","Toys","Books"] },
        { id:"price", label:"Price ($)", type:"number" },
        { id:"stock", label:"Stock", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Active","Low Stock","Out of Stock","Discontinued","Coming Soon"] },
        { id:"added_date", label:"Added", type:"date" },
      ];
      if (/order/.test(base)) return [
        { id:"order_number", label:"Order #", type:"text", required:true },
        { id:"customer", label:"Customer", type:"text" },
        { id:"total", label:"Total ($)", type:"number" },
        { id:"items_count", label:"Items", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Placed","Payment Confirmed","Picking","Packed","Shipped","Delivered","Returned"] },
        { id:"date", label:"Order Date", type:"date" },
        { id:"channel", label:"Channel", type:"select", options:["Online","In-Store","Mobile","Marketplace","Phone"] },
      ];
    }

    if (domain === "manufacturing") {
      if (/production|order/.test(base)) return [
        { id:"order_number", label:"Order #", type:"text", required:true },
        { id:"product", label:"Product", type:"text" },
        { id:"quantity", label:"Quantity", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Draft","Approved","Materials Sourced","In Production","QC","Completed","Shipped"] },
        { id:"machine", label:"Machine", type:"text" },
        { id:"start_date", label:"Start Date", type:"date" },
        { id:"due_date", label:"Due Date", type:"date" },
      ];
      if (/material/.test(base)) return [
        { id:"name", label:"Material", type:"text", required:true },
        { id:"supplier", label:"Supplier", type:"text" },
        { id:"quantity", label:"Qty in Stock", type:"number" },
        { id:"unit", label:"Unit", type:"text" },
        { id:"unit_cost", label:"Unit Cost ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["In Stock","Low Stock","Out of Stock","Ordered","On Hold"] },
        { id:"last_received", label:"Last Received", type:"date" },
      ];
    }

    if (domain === "hr") {
      if (/employee/.test(base)) return [
        { id:"name", label:"Name", type:"text", required:true },
        { id:"role", label:"Job Title", type:"text" },
        { id:"department", label:"Department", type:"select", options:["Engineering","Finance","Operations","Sales","Marketing","HR","Legal","Product"] },
        { id:"salary", label:"Salary ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Active","On Leave","Probation","Resigned","Terminated"] },
        { id:"start_date", label:"Start Date", type:"date" },
        { id:"manager", label:"Manager", type:"text" },
      ];
      if (/candidate/.test(base)) return [
        { id:"name", label:"Candidate Name", type:"text", required:true },
        { id:"role", label:"Applied Role", type:"text" },
        { id:"email", label:"Email", type:"text" },
        { id:"source", label:"Source", type:"select", options:["LinkedIn","Referral","Job Board","Agency","Direct","University"] },
        { id:"status", label:"Stage", type:"select", options:["Applied","Screened","Interview 1","Interview 2","Offer Sent","Hired","Rejected"] },
        { id:"applied_date", label:"Applied", type:"date" },
        { id:"salary_expectation", label:"Expected Salary ($)", type:"number" },
      ];
    }

    // Generic entity-name-based fallbacks
    if (/inventory|product|stock|item/.test(base)) return [
      { id:"name", label:"Item", type:"text", required:true },
      { id:"sku", label:"SKU", type:"text" },
      { id:"stock", label:"Stock", type:"number" },
      { id:"price", label:"Price", type:"number" },
      { id:"status", label:"Status", type:"select", options:["Active","Low Stock","Paused"] },
    ];
    if (/employee|hr|staff|payroll/.test(base)) return [
      { id:"name", label:"Name", type:"text", required:true },
      { id:"role", label:"Role", type:"text" },
      { id:"department", label:"Department", type:"select", options:["Operations","Sales","Finance","HR"] },
      { id:"salary", label:"Salary", type:"number" },
      { id:"status", label:"Status", type:"select", options:["Active","On Leave","Review"] },
    ];
    return [
      { id:"name", label:"Name", type:"text", required:true },
      { id:"owner", label:"Owner", type:"text" },
      { id:"amount", label:"Amount", type:"number" },
      { id:"status", label:"Status", type:"select", options:["New","In Progress","Approved","Closed"] },
      { id:"updated", label:"Updated", type:"date" },
    ];
  }

  function normalizeSpec(raw, desc = "", previousSpec = null) {
    const spec = raw && typeof raw === "object" ? structuredCloneSafe(raw) : {};
    spec.id = spec.id || previousSpec?.id || uid("system");
    spec.name = threeWords(spec.name || previousSpec?.name || inferName(desc) || "Business System");
    spec.description = String(spec.description || desc || previousSpec?.description || "Interactive business system prototype").slice(0, 180);
    spec.createdAt = spec.createdAt || previousSpec?.createdAt || Date.now();
    spec.updatedAt = Date.now();
    spec.revisionHistory = Array.isArray(spec.revisionHistory) ? spec.revisionHistory.slice(0, MAX_HISTORY) : [];

    spec.theme = {
      mode: spec.theme?.mode === "dark" ? "dark" : "light",
      primary: spec.theme?.primary || "#2563eb",
      accent: spec.theme?.accent || "#a70d2a",
      density: ["compact","comfortable","spacious"].includes(spec.theme?.density) ? spec.theme.density : "comfortable",
      radius: Number(spec.theme?.radius || 10),
    };
    const VALID_SHELLS = ["sidebar","top","dock","cards-nav","command"];
    spec.domain = spec.domain || detectDomain(desc);
    const defaultShell = (() => {
      const pool = DOMAIN_SHELL_OPTIONS[spec.domain] || DOMAIN_SHELL_OPTIONS.generic;
      return pickRandom(pool);
    })();
    spec.layout = {
      nav: spec.layout?.nav === "top" ? "top" : "sidebar",
      shell: VALID_SHELLS.includes(spec.layout?.shell) ? spec.layout.shell : defaultShell,
      dashboardStyle: spec.layout?.dashboardStyle || "operational",
    };

    const moduleNames = Array.isArray(spec.modules) && spec.modules.length
      ? spec.modules.map(m => m.name || m.id)
      : ["Overview", "Sales", "Inventory", "Customers", "Finance", "Operations"];
    spec.modules = moduleNames.slice(0, 10).map((name, idx) => {
      const old = Array.isArray(spec.modules) ? spec.modules[idx] || {} : {};
      const id = old.id || slug(name, `module_${idx + 1}`);
      const entity = old.entity || (idx === 0 ? slug(moduleNames[1] || "sales") : slug(name));
      const fallbackScreen = idx === 0 ? "dashboard" : FALLBACK_SCREENS[idx % FALLBACK_SCREENS.length];
      const screen = VALID_SCREENS.includes(old.screen) ? old.screen : fallbackScreen;
      return {
        id,
        name: String(old.name || name || `Module ${idx + 1}`).slice(0, 32),
        icon: old.icon || moduleIcon(name),
        entity,
        screen,
        kpis: Array.isArray(old.kpis) ? old.kpis : null,
        color: old.color || null,
      };
    });

    spec.entities = normalizeEntities(spec.entities, spec.modules);
    spec.mockData = normalizeData(spec.mockData, spec.entities, previousSpec);
    spec.screens = Array.isArray(spec.screens) ? spec.screens : [];
    spec.workflows = Array.isArray(spec.workflows) && spec.workflows.length ? spec.workflows : [
      { id:"approval_flow", name:"Approval Flow", stages:["Draft","Review","Approved","Closed"] },
      { id:"fulfillment", name:"Fulfillment", stages:["Requested","Assigned","In Progress","Done"] },
    ];
    spec.interactions = Array.isArray(spec.interactions) && spec.interactions.length ? spec.interactions : [
      "module navigation", "search", "sort", "row selection", "add record", "edit record", "delete record", "localStorage persistence"
    ];
    return spec;
  }

  function normalizeEntities(input, modules) {
    const map = {};
    if (input && typeof input === "object" && !Array.isArray(input)) {
      Object.entries(input).forEach(([id, e]) => {
        map[slug(id)] = {
          id: slug(e?.id || id),
          name: e?.name || titleCase(id),
          fields: Array.isArray(e?.fields) && e.fields.length ? e.fields.map(normalizeField) : defaultFields(e?.name || id),
        };
      });
    } else if (Array.isArray(input)) {
      input.forEach(e => {
        const id = slug(e?.id || e?.name);
        if (!id) return;
        map[id] = { id, name: e.name || titleCase(id), fields: Array.isArray(e.fields) && e.fields.length ? e.fields.map(normalizeField) : defaultFields(e.name || id) };
      });
    }
    modules.forEach(m => {
      const id = slug(m.entity || m.id);
      if (!map[id]) map[id] = { id, name: titleCase(id), fields: defaultFields(id) };
    });
    return map;
  }

  function normalizeField(f) {
    if (typeof f === "string") return { id: slug(f), label: titleCase(f), type: fieldType("", f) };
    const id = slug(f?.id || f?.name || f?.label, "field");
    return {
      id,
      label: f?.label || f?.name || titleCase(id),
      type: ["text","number","date","select","textarea"].includes(f?.type) ? f.type : fieldType("", id),
      options: Array.isArray(f?.options) && f.options.length ? f.options : undefined,
      required: !!f?.required,
    };
  }

  function normalizeData(input, entities, previousSpec) {
    const data = {};
    const oldRuntime = previousSpec ? getRuntimeData(previousSpec) : null;
    Object.values(entities).forEach(entity => {
      // Try to find AI-provided data using multiple key formats
      let rows = oldRuntime?.[entity.id] || null;
      if (!rows && input && typeof input === "object") {
        const candidates = [
          entity.id,
          entity.name,
          slug(entity.name),
          entity.name.toLowerCase(),
          entity.id.replace(/_/g, ""),
        ];
        for (const key of candidates) {
          if (Array.isArray(input[key]) && input[key].length) { rows = input[key]; break; }
        }
        // Last resort: case-insensitive search over all keys
        if (!rows) {
          const lc = entity.id.toLowerCase();
          const match = Object.keys(input).find(k => k.toLowerCase() === lc || slug(k) === lc);
          if (match && Array.isArray(input[match])) rows = input[match];
        }
      }
      data[entity.id] = Array.isArray(rows) && rows.length
        ? rows.map((r, idx) => normalizeRecord(r, entity, idx))
        : generateRows(entity, entity.id);
    });
    return data;
  }

  function normalizeRecord(row, entity, idx) {
    const out = { id: row?.id || `${entity.id}_${idx + 1}` };
    entity.fields.forEach(f => {
      // Try exact id, then label variants, then fuzzy slug match
      const val = row?.[f.id]
        ?? row?.[f.label]
        ?? row?.[f.label?.toLowerCase()]
        ?? row?.[slug(f.label)]
        ?? row?.[f.id.replace(/_/g,"")]
        ?? undefined;
      out[f.id] = val !== undefined ? val : sampleValue(f, idx, entity.id);
    });
    return out;
  }

  function generateRows(entity, seed = "") {
    return Array.from({ length: 8 }, (_, idx) => normalizeRecord({}, entity, idx));
  }

  // Seeded pseudo-random so each entity+field combo gets different but stable values
  function seededRand(seed, idx) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
    h = (h + idx * 2654435761) | 0;
    return Math.min(0.999999, Math.abs(h) / 2147483647);
  }

  function sampleValue(field, idx, entitySeed = "") {
    const r = seededRand(entitySeed + field.id, idx);
    const ri = n => Math.floor(r * n);

    if (field.type === "number") {
      const base = seededRand(field.id, 0);
      if (/salary|wage|pay/i.test(field.id)) return Math.round(45000 + base * 155000 + idx * 8000);
      if (/hourly_rate|hourly/i.test(field.id)) return Math.round(14 + r * 46 + idx);
      if (/price|cost|amount|total|revenue|value/i.test(field.id)) {
        if (/menu|food|dish|meal|item_price/i.test(entitySeed)) return +(8 + r * 42).toFixed(2);
        return Math.round(50 + r * 4950 + idx * 200);
      }
      if (/fee|rate|nightly/i.test(field.id)) return Math.round(80 + r * 920 + idx * 50);
      if (/monthly_fee/i.test(field.id)) return Math.round(29 + r * 171 + idx * 10);
      if (/budget/i.test(field.id)) return Math.round(50000 + r * 950000);
      if (/qty|quantity|stock|count|units/i.test(field.id)) return Math.round(1 + r * 499 + idx * 12);
      if (/guests|capacity|enrolled|seats|people/i.test(field.id)) return Math.round(1 + r * 11 + (idx % 4));
      if (/floor|room_number/i.test(field.id)) return Math.floor(1 + r * 12) * 100 + Math.floor(r * 20) + 1;
      if (/prep_time|duration|minutes/i.test(field.id)) return [5,8,10,12,15,20,25,30][ri(8)];
      if (/visits|stays|orders_count/i.test(field.id)) return Math.round(1 + r * 49);
      if (/score|rate|percent|rating/i.test(field.id)) return Math.round(60 + r * 40);
      if (/age/i.test(field.id)) return Math.round(22 + r * 43);
      if (/weight|kg|lbs/i.test(field.id)) return +(5 + r * 295).toFixed(1);
      if (/area|sqft|sqm/i.test(field.id)) return Math.round(400 + r * 4600);
      if (/bedrooms/i.test(field.id)) return [1,2,2,3,3,4,5][ri(7)];
      return Math.round(100 + r * 9900 + idx * 300);
    }
    if (field.type === "date") {
      const months = ["2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05"];
      const m = months[ri(months.length)];
      const d = String(Math.floor(r * 27) + 1).padStart(2, "0");
      return `${m}-${d}`;
    }
    if (field.type === "select") {
      const opts = field.options?.length ? field.options : ["Active","Pending","Closed"];
      return opts[ri(opts.length)];
    }

    const firstNames = ["Sarah","James","Aisha","Carlos","Mei","Omar","Priya","Lucas","Fatima","David","Yuna","Ravi","Elena","Marcus","Layla","Tom","Zara","Kofi","Ana","Ethan"];
    const lastNames  = ["Chen","Osei","Patel","Müller","Santos","Kim","Reyes","Ali","Johnson","Okafor","Nakamura","Singh","Cohen","Williams","Dubois","García","Yamamoto","Mensah","Brown","Andersen"];
    const companies  = ["Meridian Co.","Stellar Inc.","Cascade Corp.","Ironvault Ltd.","Nexar Group","BluePeak","Solvex","Quorra","Crestfield","Lumina Tech","Arion Partners","Veltrix","Helix Solutions","Norwood & Co.","Solara","Drakenberg","Pinnacle","Trident","Epsilon","Zephyr"];
    const cities     = ["New York","London","Dubai","Singapore","Tokyo","Paris","Toronto","Sydney","Berlin","Mumbai","Seoul","São Paulo","Amsterdam","Chicago","Zurich"];
    const depts      = ["Engineering","Finance","Operations","Sales","Marketing","HR","Legal","Product","Customer Success","Procurement","IT","Logistics"];
    const statuses   = ["Active","In Progress","Pending","Approved","Closed","On Hold"];

    // Domain-specific text pools
    const menuItems  = ["Margherita Pizza","BBQ Chicken Burger","Caesar Salad","Grilled Salmon","Spaghetti Bolognese","Beef Tacos","Veggie Wrap","Tiramisu","Cheesecake Slice","Garlic Bread","Mushroom Risotto","Fish & Chips","Chicken Wings","Penne Arrabbiata","Brownie Sundae","Lamb Chops","Club Sandwich","Onion Rings","Lemon Tart","Truffle Fries"];
    const waiters    = ["Marco R.","Sophie L.","Tariq M.","Anna K.","Diego P.","Fatima H.","James O.","Lily C.","Rami A.","Claire D."];
    const roomTypes  = ["Standard King","Deluxe Twin","Ocean Suite","Family Suite","Studio Room","Executive King","Penthouse","Garden View"];
    const guestNames = ["Emily Watson","Hamid Al-Rashid","Yuki Tanaka","David Osei","Isabella Rossi","Arjun Sharma","Nour Mansour","Li Wei","Sara Johansson","Carlos Mendez","Priya Nair","Ahmed Hassan"];
    const addresses  = ["14 Maple Street","270 Riverside Ave","Apt 5B, 88 Oak Lane","Unit 3, 45 Park Blvd","12 Harbor View","Suite 200, 310 Commerce St","7 Hillside Close","22 Cedar Road"];
    const trackingNos = () => `TRK-${Date.now().toString(36).toUpperCase().slice(-4)}-${String(1000+ri(8999))}`;

    if (/table_number|table_no|table#/i.test(field.id)) return `T${String(idx + 1).padStart(2, "0")}`;
    if (/room_number|room#|room_no/i.test(field.id)) return `${Math.floor(1 + r * 5)}${String(Math.floor(r * 20) + 1).padStart(2,"0")}`;
    if (/tracking|track_no/i.test(field.id)) return `TRK-${entitySeed.slice(0,3).toUpperCase()}${String(1000 + idx * 37 + ri(500)).padStart(4,"0")}`;
    if (/order_number|order#|order_no/i.test(field.id)) return `ORD-${String(10000 + idx * 73 + ri(900)).padStart(5,"0")}`;
    if (/sku|code|ref|serial|barcode/i.test(field.id)) return `${entitySeed.slice(0,3).toUpperCase()}-${String(1000 + ri(8999)).padStart(4,"0")}`;
    if (/item_name|dish|meal|food_name/i.test(field.id)) return menuItems[ri(menuItems.length)];
    if (/waiter|server|attendant/i.test(field.id)) return waiters[ri(waiters.length)];
    if (/guest_name|guest/i.test(field.id) && !/count/.test(field.id)) return guestNames[ri(guestNames.length)];
    if (/room_type|room_kind/i.test(field.id)) return roomTypes[ri(roomTypes.length)];
    if (/address|street|property_address/i.test(field.id)) return addresses[ri(addresses.length)];
    if (/items_ordered|items|dishes/i.test(field.id)) return `${menuItems[ri(menuItems.length)]}, ${menuItems[ri(menuItems.length)]}`;
    if (/section|zone/i.test(field.id)) return ["Indoor","Outdoor","Bar","Private","Terrace"][ri(5)];
    if (/unit/i.test(field.id)) return ["kg","L","pcs","box","bag","dozen","oz","g"][ri(8)];
    if (/nationality|country/i.test(field.id)) return ["UAE","USA","UK","France","Germany","India","Australia","Canada","Japan","Italy"][ri(10)];
    if (/loyalty|tier|level/i.test(field.id)) return ["Bronze","Silver","Gold","Platinum"][ri(4)];
    if (/source/i.test(field.id)) return ["LinkedIn","Referral","Job Board","Agency","Direct","University"][ri(6)];
    if (/channel/i.test(field.id)) return ["Online","In-Store","Mobile","Marketplace"][ri(4)];
    if (/view/i.test(field.id)) return ["City","Ocean","Garden","Pool","Mountain"][ri(5)];
    if (/origin|from/i.test(field.id)) return cities[ri(cities.length)];
    if (/destination|to/i.test(field.id)) return cities[ri(cities.length)];
    if (/driver|carrier/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/supplier|vendor/i.test(field.id)) return companies[ri(companies.length)];
    if (/machine|equipment/i.test(field.id)) return ["CNC-A1","Press-04","Lathe-B2","Mixer-07","Welder-03","Cutter-12"][ri(6)];
    if (/product_name|product/i.test(field.id) && !/sku/.test(field.id)) return ["Hydraulic Valve","Steel Bracket","Circuit Board","Aluminum Sheet","Polymer Casing","LED Module","Drive Shaft","Sensor Array"][ri(8)];
    if (/material/i.test(field.id)) return ["Steel","Aluminum","Copper","Polymer","Resin","Carbon Fiber","Rubber","Glass"][ri(8)];
    if (/class_name|class/i.test(field.id)) return ["Advanced Yoga","HIIT Blast","Spin Class","Power Pilates","CrossFit WOD","Aqua Aerobics","Zumba Gold","Boxing Basics"][ri(8)];
    if (/trainer|coach/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/membership_type|plan/i.test(field.id)) return ["Basic","Standard","Premium","VIP","Student"][ri(5)];
    if (/housekeeper/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/^(name|full_name|employee_name|customer_name|client_name|contact_name|patient_name|candidate_name|person)$/i.test(field.id)) {
      return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    }
    if (/company|organization|client|customer|vendor/i.test(field.id)) return companies[ri(companies.length)];
    if (/email/i.test(field.id)) { const fn = firstNames[ri(firstNames.length)].toLowerCase(); return `${fn}@${companies[ri(companies.length)].split(" ")[0].toLowerCase()}.com`; }
    if (/phone|tel/i.test(field.id)) return `+1 (${300+ri(699)}) ${100+ri(899)}-${1000+ri(8999)}`;
    if (/city|location|region/i.test(field.id)) return cities[ri(cities.length)];
    if (/department|dept|division/i.test(field.id)) return depts[ri(depts.length)];
    if (/role|title|position|job/i.test(field.id)) return ["Senior Manager","Analyst","Specialist","Director","Lead","Coordinator","Consultant","Engineer"][ri(8)];
    if (/owner|assigned|manager|lead/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/note|comment|description|detail|remark/i.test(field.id)) return ["Awaiting review","High priority","Follow-up needed","Documentation complete","Approved by management","Escalated to team lead","On track","Needs clarification"][ri(8)];
    if (/name/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/status|stage|state/i.test(field.id)) return statuses[ri(statuses.length)];
    return `${titleCase(field.label)} ${idx + 1}`;
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

  function inferName(desc) {
    return inferNameFromDesc(desc);
  }

  function fallbackSystem(desc = "business system", previousSpec = null) {
    const domain = detectDomain(desc);
    const cfg = DOMAIN_CONFIG[domain] || DOMAIN_CONFIG.generic;
    // Pick a random shell from domain options
    const shellPool = DOMAIN_SHELL_OPTIONS[domain] || DOMAIN_SHELL_OPTIONS.generic;
    const shell = pickRandom(shellPool);

    const entities = {};
    cfg.modules.forEach(m => {
      const id = slug(m.entity);
      if (!entities[id]) entities[id] = { id, name: titleCase(m.entity), fields: defaultFields(m.entity, domain) };
    });

    return normalizeSpec({
      id: previousSpec?.id || uid("system"),
      name: previousSpec?.name || inferName(desc),
      description: `Interactive prototype for ${String(desc || "a business system").slice(0, 120)}`,
      theme: previousSpec?.theme || { ...cfg.theme, density:"comfortable", radius:10 },
      layout: previousSpec?.layout || { nav:"sidebar", shell },
      modules: cfg.modules.map((m, idx) => ({
        id: slug(m.name),
        name: m.name,
        icon: moduleIcon(m.name),
        entity: slug(m.entity),
        screen: idx === 0 ? "dashboard" : (m.screen || FALLBACK_SCREENS[idx % FALLBACK_SCREENS.length]),
        color: ACCENT_PALETTE[idx % ACCENT_PALETTE.length],
        kpis: cfg.kpis?.[m.entity] || null,
      })),
      entities,
      mockData: previousSpec ? getRuntimeData(previousSpec) : {},
      workflows: cfg.workflows || [],
      interactions: ["navigation","search","filter","sort","add/edit/delete records","import/export","localStorage persistence"],
      revisionHistory: previousSpec?.revisionHistory || [],
    }, desc, previousSpec);
  }

  function systemPrompt() {
    return `You are a world-class ERP architect. Return ONLY valid JSON for a SystemSpec. No markdown, no prose, no code fences.

REQUIRED TOP-LEVEL KEYS:
id, name, description, theme, layout, modules, entities, screens, workflows, mockData, interactions, revisionHistory

SCREEN TYPES — use every generation differently. Never output the same combination twice:
• "dashboard"  — KPI cards + table + side charts. First module only.
• "list"       — Sortable table. Reference data only. MAX ONE per spec.
• "kanban"     — Status columns. Pipelines, orders, recruitment, tickets.
• "report"     — KPIs + bar charts. Analytics, revenue, performance.
• "split"      — List + detail panel. CRM, employees, suppliers, contacts.
• "cards"      — Grid of visual cards. Products, menu items, members, staff.
• "timeline"   — Date-ordered events. History, shipments, audit logs.
• "calendar"   — Monthly grid with chips. Appointments, bookings, schedules.
• "metric"     — Giant KPI tiles + sparklines. Executive view, pure analytics.
• "feed"       — Scrolling activity. Support, messages, notifications, logs.

LAYOUT:
• modules[].screen: MANDATORY — at least 5 DIFFERENT types per spec. Never "list" for more than one module.
• modules[].kpis: [{label, field, aggregate}] where aggregate is "sum"|"count"|"avg"|"max". Required for dashboard/report/metric.
• modules[].color: REQUIRED on every module — different hex per module (spectrum of colors in nav).
• layout.shell: choose boldly — vary by run, not just by domain default:
  - "sidebar"   — classic left panel. Finance, accounting, operations.
  - "top"       — horizontal tabs. SaaS, education, product tools.
  - "dock"      — icon-only 56px rail. Logistics, manufacturing, dense ops.
  - "cards-nav" — module card strip. Restaurant, retail, hotel, fitness.
  - "command"   — compact VS Code style. Healthcare, legal, HR, CRM.
• layout.nav: match the shell ("top" if shell is "top", "sidebar" otherwise).
• Follow the CREATIVE DIRECTIVE in the user message — it overrides domain defaults.

THEME (industry-appropriate colors — never use default blue for all domains):
• Restaurant/F&B      → primary "#92400e", accent "#f59e0b",  mode "light"  (warm amber/brown)
• Hotel/Hospitality   → primary "#1e3a5f", accent "#60a5fa",  mode "light"  (deep navy + sky)
• Healthcare          → primary "#0e7490", accent "#06b6d4",  mode "light"  (clinical teal/cyan)
• Education           → primary "#3730a3", accent "#818cf8",  mode "light"  (rich indigo)
• Fitness/Gym         → primary "#7c3aed", accent "#a70d2a",  mode "dark"   (electric purple + neon green)
• Real Estate         → primary "#047857", accent "#a70d2a",  mode "light"  (forest green)
• Retail/E-commerce   → primary "#be185d", accent "#f472b6",  mode "light"  (hot pink/magenta)
• Logistics/Supply    → primary "#0369a1", accent "#38bdf8",  mode "dark"   (steel blue + cyan)
• Manufacturing       → primary "#1d4ed8", accent "#fb923c",  mode "dark"   (industrial blue + orange)
• HR/People Ops       → primary "#6d28d9", accent "#c4b5fd",  mode "light"  (deep violet + lavender)
• Legal/Law           → primary "#1c1917", accent "#d97706",  mode "light"  (charcoal + gold)
• Finance/Accounting  → primary "#0c4a6e", accent "#0ea5e9",  mode "light"  (dark navy + sky blue)
• Jewelry/Luxury      → primary "#b45309", accent "#fbbf24",  mode "dark"   (deep gold + amber)
• Tech/SaaS           → primary "#0f172a", accent "#38bdf8",  mode "dark"   (near-black + electric blue)
• theme.radius: 6-8 for corporate/legal, 10-12 for standard, 14-16 for retail/consumer-facing

ENTITIES & FIELDS:
• Each entity: {id, name, fields[]}
• Fields: {id, label, type, required?, options?} — type: "text"|"number"|"date"|"select"|"textarea"
• Field ids must exactly match mockData record property names
• Include a "status" select field with 3-5 meaningful stage options per entity
• Include at least one number field (amount, quantity, score, etc.) per entity
• Include at least one date field per entity

MOCK DATA (realistic, not placeholder):
• 5-7 records per entity
• Use real-sounding names (not "John Doe"), actual company names, realistic amounts
• Dates in YYYY-MM-DD format, within the past 12 months
• Status values must match the field's options exactly
• Number fields: realistic ranges (salaries $45k-$200k, order amounts $50-$50000, etc.)

FINANCIAL MODEL:
• Every ERP must include finance as a first-class operating area, not a cosmetic report.
• Include at least one finance/accounting module using "metric", "report", or "split".
• Include entities for invoices or sales, payments or receipts, expenses or bills, and monthly financial summary.
• Include enough financial fields to support revenue, cost, gross profit, net profit, cash balance, AR, AP, and payment status.
• Data must feel linked and plausible for the business size; do not output isolated random numbers.

WORKFLOWS:
• 2-3 workflows per system
• stages array: 4-6 meaningful steps that reflect real process progression

Build a complete, production-realistic system. Impress with depth and realism.`;
  }

  async function callModel(modelValue, messages, signal, temperature = 0.25) {
    const mv = modelValue || $("model")?.value || "llama3.2";
    if (mv.startsWith("cloud:")) {
      const rest = mv.slice(6);
      const colon = rest.indexOf(":");
      const provider = colon !== -1 ? rest.slice(0, colon) : rest;
      const model = colon !== -1 ? rest.slice(colon + 1) : rest;
      if (provider === "gemini") return window._H.agentTurnGemini({ model, messages, tools: [], temperature, signal });
      return window._H.agentTurnOpenAI({ provider, model, messages, tools: [], temperature, signal });
    }
    return window._H.agentTurnOllama({ model: mv, messages, tools: [], temperature, signal });
  }

  function modelTraceLabel(modelValue) {
    const mv = modelValue || "default";
    if (!mv.startsWith("cloud:")) return `local:${mv}`;
    const [, provider, model] = mv.split(":");
    return `${provider}:${model || "default"}`;
  }

  function isFailoverError(err) {
    return /rate.?limit|quota|429|too many|capacity|overloaded|unavailable|timeout|timed.?out|failed to fetch|jsondecodeerror|invalid_request_error|invalid ai systemspec|semantic repair|tool|function|model.{0,12}not.{0,12}found|context/i.test(err?.message || "");
  }

  function modelScore(value, label) {
    const t = `${value || ""} ${label || ""}`.toLowerCase();
    let score = 0;
    if (/gpt-5|gpt-4\.1|gpt-4o|claude|opus|sonnet/.test(t)) score += 160;
    if (/gemini-2\.5-pro|gemini.*pro/.test(t)) score += 145;
    if (/deepseek|r1|v3/.test(t)) score += 130;
    if (/405b|235b|120b|70b|maverick|nemotron|hermes|qwen/.test(t)) score += 115;
    if (/flash|lite|mini|small|instant|8b/.test(t)) score -= 45;
    if (/embedding|rerank|moderation|vision|image|tts|whisper/.test(t)) score -= 1000;
    return score;
  }

  function availableModels() {
    const src = $("model");
    if (!src) return [];
    return Array.from(src.options)
      .map(o => ({ value:o.value, label:o.textContent || o.label || o.value, disabled:o.disabled }))
      .filter(o => o.value && !o.disabled)
      .sort((a, b) => modelScore(b.value, b.label) - modelScore(a.value, a.label));
  }

  function failoverModels(active) {
    const activeProvider = active?.startsWith("cloud:") ? active.split(":")[1] : "local";
    const seen = new Set([activeProvider]);
    const out = [];
    for (const opt of availableModels()) {
      const provider = opt.value.startsWith("cloud:") ? opt.value.split(":")[1] : "local";
      if (seen.has(provider)) continue;
      seen.add(provider);
      out.push(opt.value);
    }
    return out;
  }

  function godAgentPrompt() {
    return `You are the God Agent — a senior ERP architect who assigns specialist agents.
Given a business description, produce a Domain Brief: a compact JSON object your specialist agents will build from.
Return ONLY valid JSON. No markdown, no prose, no code fences.

Required keys:
{
  "domain": "restaurant|hotel|healthcare|education|fitness|realestate|retail|logistics|manufacturing|hr|legal|saas|generic",
  "name": "Human-readable system name (≤48 chars)",
  "description": "One sentence about what this ERP manages",
  "theme": { "mode": "light|dark", "primary": "#hex", "accent": "#hex" },
  "layout": {
    "nav": "sidebar|top",
    "shell": "sidebar|top|dock|cards-nav|command"
  },
  "modules": [
    { "name": "Module Name", "entity": "entity_id", "screen": "dashboard|list|kanban|report|split|cards|timeline|calendar|metric|feed", "color": "#hex or null" }
  ],
  "agent_assignments": [
    "UX Agent: owns modules [name, name] with screen types [type, type] — rationale",
    "Data Agent: owns entities [entity, entity] — will generate realistic records",
    "Finance Agent: owns invoices, payments, expenses, and monthly financial summary — rationale",
    "Workflow Agent: designing [workflow name] for [entity] spanning N stages"
  ]
}

Rules:
- VARIETY IS MANDATORY. Each generation must feel different from the last. Do not default to the same screen types, shell, or color every time.
- modules array: 5-8 modules, MINIMUM 5 different screen types across them. Avoid repeating any type more than once unless 8+ modules.
- First module MUST be "dashboard" or "metric". Second module is never "list" — use kanban, split, or cards instead.
- layout.shell: choose boldly — a restaurant can use "top" or "sidebar" instead of always "cards-nav". Break domain stereotypes if the creative directive says so.
  "sidebar" → finance, accounting, generic; "top" → saas, education, lightweight;
  "dock" → logistics, manufacturing, dense ops; "cards-nav" → restaurant, retail, hotel, fitness;
  "command" → healthcare, legal, hr, CRM
- Theme: industry-specific, non-generic. Vary accent dramatically from primary (complementary, not analogous).
  restaurant→ "#92400e"/"#f59e0b" light; fitness→ "#7c3aed"/"#a70d2a" dark; logistics→ "#0369a1"/"#38bdf8" dark;
  legal→ "#1c1917"/"#d97706" light; saas→ "#0f172a"/"#38bdf8" dark; retail→ "#be185d"/"#f472b6" light
- modules[].color: REQUIRED on every module — give each a distinct hex accent, making the nav a multi-color spectrum
- Include at least one finance/accounting module and the financial entities needed for revenue, expenses, cash, AR/AP, and margin
- agent_assignments: write 3 specific delegation lines reflecting actual screen and entity choices
- Follow the CREATIVE DIRECTIVE in the user message — it overrides defaults`;
  }

  function specialistPrompt(brief) {
    return `You are a specialist agent swarm executing a brief from the God Agent.
Return ONLY valid JSON for a complete SystemSpec. No markdown, no prose, no code fences.

GOD AGENT BRIEF:
${JSON.stringify(brief, null, 2)}

YOUR ASSIGNED ROLES:
① UX ARCHITECT — implement the exact modules and screen types from the brief. Keep nav and theme.
② DATA ENGINEER — for each entity in the modules, define realistic fields and 8-12 records of real data.
③ FINANCE AGENT — create realistic finance entities: invoices/sales, payments, expenses/bills, cash/bank, and monthly financial summary.
④ WORKFLOW DESIGNER — design 2-3 workflows with meaningful stage progressions.
⑤ VALIDATOR — verify all mockData keys match field ids exactly. No placeholder text.

REQUIRED TOP-LEVEL KEYS:
id, name, description, theme, layout, modules, entities, screens, workflows, mockData, interactions, revisionHistory

SCREEN TYPES (use exactly as specified in brief — implement all 10 types correctly):
• "dashboard"  — KPI summary cards + bar chart + top records table
• "list"       — Full-width sortable/filterable table
• "kanban"     — Cards grouped by status column
• "report"     — KPIs + bar charts + breakdowns
• "split"      — Table left + rich detail panel right
• "cards"      — Visual card grid: avatar, accent, stats. For people, products, menu items.
• "timeline"   — Date-ordered vertical timeline. For orders, events, bookings, history.
• "calendar"   — Monthly grid with record chips on dates. For appointments, schedules.
• "metric"     — Giant KPI tiles with sparklines. For pure analytics/exec dashboards.
• "feed"       — Scrolling feed with avatars. For messages, tickets, activity logs.

ENTITIES & FIELDS:
• Each entity matches a module's entity id from the brief
• Fields: {id, label, type, required?, options?} — type: "text"|"number"|"date"|"select"|"textarea"
• Field ids must exactly match mockData record property names
• Include a "status" select field with 3-5 meaningful domain-specific options
• Include at least one number field and one date field per entity

MOCK DATA (domain-realistic, not generic):
• 8-12 records per entity with real-sounding names, actual amounts, ISO dates (YYYY-MM-DD)
• Status values must exactly match the field's options array
• For restaurants: table numbers, dish names, prices; for hotels: room numbers, guest names; etc.
• Finance records must be internally plausible: invoices, payments, expenses, and summaries should support revenue, cost, profit, cash, AR, and AP.

WORKFLOWS:
• 2-3 workflows, 4-6 stages each, matching the domain's real process flow

CRITICAL: Implement the exact modules and screen types from the God Agent brief. Do NOT substitute "list" for screens the brief specified. Preserve every layout.shell choice, every module.color, every screen type exactly as given. Be thorough, realistic, and domain-specific. No placeholder data.`;
  }

  async function generateWithModel(desc, signal) {
    let active = $("sysModelSelect")?.value || $("model")?.value || "";
    const tried = [];
    const creativeDirective = pickRandom(CREATIVE_DIRECTIVES);

    // ── PRIMARY: Single-shot direct generation (fastest & most reliable) ─
    trace("AI generating full SystemSpec…", "run");
    const messages = [
      { role:"system", content: systemPrompt() },
      { role:"user", content: `Create a complete SystemSpec for:\n${desc}\n\nCREATIVE DIRECTIVE: ${creativeDirective}\n[run-id:${Date.now().toString(36)}]` }
    ];
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      trace(`Direct generation attempt ${attempt} — ${modelTraceLabel(active)}`, "run");
      try {
        const result = await callModel(active, messages, signal, 0.35);
        let raw = result?.content || "";
        let parsed = parseSpecJson(raw);
        if (!parsed) {
          trace("JSON repair pass…", "warn");
          const repair = await callModel(active, [
            { role:"system", content: "You are a JSON repair tool. Return ONLY the cleaned valid JSON object. No markdown, no prose, no explanation. Fix any syntax errors (trailing commas, missing quotes, etc.). Preserve all data." },
            { role:"user", content: `Repair this into valid JSON:\n${raw.slice(0, 12000)}` }
          ], signal, 0.2);
          raw = repair?.content || "";
          parsed = parseSpecJson(raw);
        }
        if (!parsed) {
          trace(`Raw response preview: ${raw.slice(0, 120).replace(/\n/g, " ")}`, "warn");
          throw new Error("Model returned invalid SystemSpec JSON");
        }
        trace("SystemSpec JSON parsed", "ok");
        const spec = await finalizeOrRepairGeneratedSpec(active, parsed, raw, desc, signal);
        trace("SystemSpec validated and finance model linked", "ok");
        return spec;
      } catch (err) {
        if (err.name === "AbortError") throw err;
        trace(`${modelTraceLabel(active)} failed: ${String(err.message || err).slice(0, 90)}`, "warn");
        tried.push(active);
        if (!isFailoverError(err)) break;
        const next = failoverModels(active).find(m => !tried.includes(m));
        if (!next) break;
        active = next;
        trace(`Switching to ${modelTraceLabel(active)}`, "run");
      }
    }

    // ── FALLBACK: Multi-phase pipeline if direct generation fails ───────
    trace("Direct generation failed — trying multi-phase pipeline…", "warn");
    trace("① God Agent analysing domain…", "plan");
    let brief = null;
    const briefMessages = [
      { role:"system", content: godAgentPrompt() },
      { role:"user", content: `Business description: ${desc}\n\nCREATIVE DIRECTIVE (follow this): ${creativeDirective}\n[run-id:${Date.now().toString(36)}]` },
    ];
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const r = await callModel(active, briefMessages, signal, 0.92);
        brief = parseSpecJson(r?.content || "");
        if (brief && Array.isArray(brief.modules) && brief.modules.length) break;
        brief = null;
        throw new Error("Brief missing modules");
      } catch (err) {
        if (err.name === "AbortError") throw err;
        trace(`God Agent brief attempt ${attempt} failed: ${String(err.message).slice(0,70)}`, "warn");
        const next = failoverModels(active).find(m => !tried.includes(m));
        if (next) { tried.push(active); active = next; trace(`→ switching to ${modelTraceLabel(active)}`, "run"); }
        else break;
      }
    }

    if (brief) {
      const assignments = Array.isArray(brief.agent_assignments) ? brief.agent_assignments : [];
      assignments.forEach(a => trace(`② ${a}`, "plan"));
      if (!assignments.length) {
        trace("② UX Agent shaping module layouts and theme", "plan");
        trace("② Data Agent generating domain-realistic records", "data");
        trace("② Workflow Agent modelling business process stages", "plan");
      }

      trace("③ Specialist agents building full SystemSpec…", "run");
      const specMessages = [
        { role:"system", content: specialistPrompt(brief) },
        { role:"user", content: `Build the complete SystemSpec now. Every module must have matching entity fields and mock data.\nCREATIVE DIRECTIVE: ${creativeDirective}` },
      ];
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
          const r = await callModel(active, specMessages, signal, 0.35);
          let raw = r?.content || "";
          let parsed = parseSpecJson(raw);
          if (!parsed) {
            trace("Specialist JSON repair pass…", "warn");
            const repair = await callModel(active, [
              { role:"system", content: "You are a JSON repair tool. Return ONLY the cleaned valid JSON object. No markdown, no prose, no explanation. Fix any syntax errors." },
              { role:"user", content: `Repair this into valid JSON:\n${raw.slice(0, 12000)}` }
            ], signal, 0.2);
            parsed = parseSpecJson(repair?.content || "");
          }
          if (!parsed) throw new Error("Specialist agents returned invalid JSON");
          trace("④ Validator confirming field/data consistency", "ok");
          trace("SystemSpec ready", "ok");
          const spec = await finalizeOrRepairGeneratedSpec(active, parsed, raw, desc, signal);
          trace("Finance model linked", "ok");
          return spec;
        } catch (err) {
          if (err.name === "AbortError") throw err;
          trace(`Specialist attempt ${attempt} failed: ${String(err.message).slice(0,70)}`, "warn");
          tried.push(active);
          if (!isFailoverError(err)) break;
          const next = failoverModels(active).find(m => !tried.includes(m));
          if (!next) break;
          active = next;
          trace(`→ switching to ${modelTraceLabel(active)}`, "run");
        }
      }
      throw new Error("AI specialist agents could not produce a valid ERP SystemSpec. No template was inserted.");
    }

    // No silent deterministic fallback: the app should not show ready-made ERP templates as if AI designed them.
    throw new Error("AI generation failed before a valid ERP SystemSpec was created. No template was inserted; check the selected model or API key.");
  }

  function fallbackFromBrief(brief, desc) {
    const domain = brief.domain || detectDomain(desc);
    const cfg = DOMAIN_CONFIG[domain] || DOMAIN_CONFIG.generic;
    const modules = (Array.isArray(brief.modules) && brief.modules.length ? brief.modules : cfg.modules)
      .map((m, idx) => ({
        id: slug(m.name || m.entity || `module_${idx}`),
        name: m.name || titleCase(m.entity || `Module ${idx + 1}`),
        icon: moduleIcon(m.name || ""),
        entity: slug(m.entity || m.name || `entity_${idx}`),
        screen: VALID_SCREENS.includes(m.screen) ? m.screen : (idx === 0 ? "dashboard" : FALLBACK_SCREENS[idx % FALLBACK_SCREENS.length]),
        color: m.color || ACCENT_PALETTE[idx % ACCENT_PALETTE.length],
        kpis: cfg.kpis?.[m.entity] || null,
      }));
    const entities = {};
    modules.forEach(m => {
      const id = m.entity;
      if (!entities[id]) entities[id] = { id, name: titleCase(id), fields: defaultFields(id, domain) };
    });
    return normalizeSpec({
      id: uid("system"),
      name: brief.name || cfg.name,
      description: brief.description || `Interactive ERP for ${desc}`,
      theme: { ...(brief.theme || cfg.theme), density:"comfortable", radius:10 },
      layout: brief.layout || { nav:"sidebar" },
      modules,
      entities,
      mockData: {},
      workflows: cfg.workflows || [],
      interactions: ["navigation","search","filter","sort","add/edit/delete records","import/export","localStorage persistence"],
      revisionHistory: [],
    }, desc, null);
  }

  function parseSpecJson(raw) {
    if (!raw) return null;
    const text = String(raw).trim();
    // 1. Direct parse
    try { return JSON.parse(text); } catch {}
    // 2. Strip all markdown fences and parse what remains
    const stripped = text.replace(/```[\s\S]*?```/g, (m) => {
      const inner = m.match(/```(?:json)?\s*([\s\S]*?)```/);
      return inner ? " " + inner[1] + " " : " ";
    });
    try { return JSON.parse(stripped.trim()); } catch {}
    // 3. Find every {…} block by bracket matching
    const opens = [];
    for (let i = 0; i < text.length; i++) if (text[i] === "{") opens.push(i);
    let best = null;
    let bestLen = 0;
    for (const start of opens) {
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") depth--;
        if (depth === 0) {
          try {
            const candidate = text.slice(start, i + 1);
            const parsed = JSON.parse(candidate);
            if (typeof parsed === "object" && candidate.length > bestLen) {
              best = parsed;
              bestLen = candidate.length;
            }
          } catch {}
          break;
        }
      }
    }
    if (best) return best;
    // 4. Last resort: strip trailing commas and retry the largest block
    const clean = text.replace(/,\s*([}\]])/g, "$1").replace(/\/\/.*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const s2 = clean.indexOf("{");
    const e2 = clean.lastIndexOf("}");
    if (s2 !== -1 && e2 !== -1 && e2 > s2) {
      for (let start = s2; start < Math.min(s2 + 60, clean.length); start++) {
        for (let end = e2; end > Math.max(e2 - 60, start); end--) {
          try {
            const parsed = JSON.parse(clean.slice(start, end + 1));
            if (typeof parsed === "object") return parsed;
          } catch {}
        }
      }
    }
    return null;
  }

  function rawEntityMap(entities) {
    const map = {};
    if (entities && typeof entities === "object" && !Array.isArray(entities)) {
      Object.entries(entities).forEach(([key, entity]) => {
        const id = slug(entity?.id || key);
        if (id) map[id] = entity || {};
      });
    } else if (Array.isArray(entities)) {
      entities.forEach(entity => {
        const id = slug(entity?.id || entity?.name);
        if (id) map[id] = entity || {};
      });
    }
    return map;
  }

  function canonicalFinanceEntityForModule(module) {
    const text = `${module?.name || ""} ${module?.entity || ""}`.toLowerCase();
    if (!/finance|financial|account|invoice|billing|payment|revenue|cash|ledger|journal|expense|bill|receivable|payable|profit|margin|bank/.test(text)) return "";
    if (/invoice|billing|receivable/.test(text)) return FINANCE_ENTITY_IDS.invoices;
    if (/payment|receipt|collection/.test(text)) return FINANCE_ENTITY_IDS.payments;
    if (/expense|bill|payable|vendor/.test(text)) return FINANCE_ENTITY_IDS.expenses;
    if (/ledger|journal|entry/.test(text)) return FINANCE_ENTITY_IDS.journal;
    if (/bank|cash|transaction/.test(text)) return FINANCE_ENTITY_IDS.bank;
    if (/chart|account/.test(text) && !/summary|profit|revenue|finance|financial/.test(text)) return FINANCE_ENTITY_IDS.accounts;
    return FINANCE_ENTITY_IDS.summary;
  }

  function canonicalFinanceEntityForSchema(id, entity) {
    const text = `${id || ""} ${entity?.id || ""} ${entity?.name || ""}`.toLowerCase();
    if (/financial.?summary|finance.?summary|financialsummary|revenue.?summary|profit.?summary|cash.?summary/.test(text)) return FINANCE_ENTITY_IDS.summary;
    if (/\binvoices?\b|billing|receivable/.test(text)) return FINANCE_ENTITY_IDS.invoices;
    if (/\bpayments?\b|receipt|collection/.test(text)) return FINANCE_ENTITY_IDS.payments;
    if (/\bexpenses?\b|\bbills?\b|payable/.test(text)) return FINANCE_ENTITY_IDS.expenses;
    if (/journal|ledger|entries/.test(text)) return FINANCE_ENTITY_IDS.journal;
    if (/bank.?transaction|cash.?transaction|banking/.test(text)) return FINANCE_ENTITY_IDS.bank;
    if (/chart.?of.?accounts|chart_accounts|general.?ledger.?accounts/.test(text)) return FINANCE_ENTITY_IDS.accounts;
    return "";
  }

  function mergeGeneratedFields(base, additions) {
    const fields = Array.isArray(base) ? base.map(normalizeField) : [];
    const seen = new Set(fields.map(f => f.id));
    (additions || []).map(normalizeField).forEach(field => {
      if (!seen.has(field.id)) {
        fields.push(field);
        seen.add(field.id);
      }
    });
    return fields;
  }

  function ensureGeneratedEntityFields(entity, entityId, desc) {
    const domain = detectDomain(desc || "");
    const financePack = financeFields(/egp|egypt|cairo/i.test(desc || "") ? "EGP" : /eur|euro/i.test(desc || "") ? "EUR" : "USD");
    const financeSchema = financePack[entityId] || null;
    entity.fields = mergeGeneratedFields(entity.fields, financeSchema || defaultFields(entity.name || entityId, domain));
    const hasNumber = entity.fields.some(f => f.type === "number" || /amount|total|price|cost|revenue|salary|qty|quantity|balance|value|profit|margin|count|rate/i.test(`${f.id} ${f.label}`));
    const hasDate = entity.fields.some(f => f.type === "date" || /date|time|due|created|updated|month|period/i.test(`${f.id} ${f.label}`));
    const hasStatus = entity.fields.some(f => f.type === "select" || /status|stage|state|type|category/i.test(`${f.id} ${f.label}`));
    if (!hasNumber) {
      entity.fields = mergeGeneratedFields(entity.fields, [{ id:"business_value", label:"Business Value", type:"number" }]);
    }
    if (!hasDate) {
      const dateField = entityId === FINANCE_ENTITY_IDS.summary ? { id:"month", label:"Month", type:"date", required:true } : { id:"updated", label:"Updated", type:"date" };
      entity.fields = mergeGeneratedFields(entity.fields, [dateField]);
    }
    if (!hasStatus) {
      entity.fields = mergeGeneratedFields(entity.fields, [{ id:"status", label:"Status", type:"select", options:["New","Active","Review","Closed"] }]);
    }
    if (entity.fields.length < 3) {
      entity.fields = mergeGeneratedFields(entity.fields, defaultFields(entity.name || entityId, domain));
    }
    return entity;
  }

  function prepareRawGeneratedSpecForValidation(raw, desc) {
    const prepared = raw && typeof raw === "object" && !Array.isArray(raw) ? structuredCloneSafe(raw) : raw;
    if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) return prepared;
    const modules = Array.isArray(prepared.modules) ? prepared.modules : [];
    const existingEntities = rawEntityMap(prepared.entities);
    const entities = {};
    Object.entries(existingEntities).forEach(([id, entity]) => {
      const entityId = canonicalFinanceEntityForSchema(id, entity) || id;
      const current = entities[entityId] || { id: entityId, name: entity?.name || titleCase(entityId), fields: [] };
      current.name = current.name || entity?.name || titleCase(entityId);
      current.fields = mergeGeneratedFields(current.fields, Array.isArray(entity?.fields) ? entity.fields : []);
      entities[entityId] = current;
    });

    prepared.modules = modules.map((module, idx) => {
      const next = { ...(module || {}) };
      const canonicalFinance = canonicalFinanceEntityForModule(next);
      next.entity = canonicalFinance || slug(next.entity || next.name || `entity_${idx + 1}`);
      return next;
    });

    prepared.modules.forEach(module => {
      const entityId = slug(module?.entity || "");
      if (!entityId) return;
      const financeSchema = financeFields(/egp|egypt|cairo/i.test(`${desc} ${prepared.description}`) ? "EGP" : /eur|euro/i.test(`${desc} ${prepared.description}`) ? "EUR" : "USD")[entityId];
      const entity = entities[entityId] || { id: entityId, name: module?.name ? `${module.name} Records` : titleCase(entityId), fields: [] };
      entity.id = entityId;
      entity.name = entity.name || titleCase(entityId);
      if (financeSchema) entity.fields = mergeGeneratedFields(entity.fields, financeSchema);
      entities[entityId] = ensureGeneratedEntityFields(entity, entityId, `${desc} ${prepared.description || ""}`);
    });

    prepared.entities = entities;
    return prepared;
  }

  function validateRawGeneratedSpec(raw) {
    const issues = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["Top-level SystemSpec must be a JSON object."];

    const modules = Array.isArray(raw.modules) ? raw.modules : [];
    const entities = rawEntityMap(raw.entities);
    if (!String(raw.name || "").trim()) issues.push("Missing non-empty name.");
    if (modules.length < 5) issues.push("modules must include at least 5 business modules.");
    if (Object.keys(entities).length < 3) issues.push("entities must define at least 3 entity schemas.");

    const screens = new Set();
    modules.forEach((module, idx) => {
      if (!String(module?.name || "").trim()) issues.push(`modules[${idx}] is missing name.`);
      if (!String(module?.entity || "").trim()) issues.push(`modules[${idx}] is missing entity.`);
      if (!VALID_SCREENS.includes(module?.screen)) issues.push(`modules[${idx}] has invalid or missing screen.`);
      if (module?.screen) screens.add(module.screen);
      const entity = entities[slug(module?.entity || "")];
      if (!entity) {
        issues.push(`Entity "${module?.entity || "(missing)"}" referenced by module "${module?.name || idx}" is not defined.`);
        return;
      }
      const fields = Array.isArray(entity.fields) ? entity.fields : [];
      if (fields.length < 3) issues.push(`Entity "${module.entity}" must include at least 3 fields.`);
      if (!fields.some(f => ["number"].includes(f?.type) || /amount|total|price|cost|revenue|salary|qty|quantity|balance|value/i.test(f?.id || f?.label || ""))) {
        issues.push(`Entity "${module.entity}" needs at least one numeric/business value field.`);
      }
      if (!fields.some(f => f?.type === "date" || /date|time|due|created|updated/i.test(f?.id || f?.label || ""))) {
        issues.push(`Entity "${module.entity}" needs at least one date/time field.`);
      }
    });

    if (modules.length >= 5 && screens.size < 4) issues.push("Use at least 4 different screen types across modules.");
    return [...new Set(issues)].slice(0, 14);
  }

  function semanticRepairPrompt() {
    return `You repair invalid ERP SystemSpec JSON.
Return ONLY one valid JSON object. No markdown, no prose, no code fences.

Repair requirements:
- Preserve the user's business idea, domain, theme direction, module intent, and visual variety.
- Do not replace the system with a generic ready-made template.
- Include 5-8 modules, at least 4 different screen types, and valid module.entity references.
- Every referenced entity must exist and include fields[].
- Every entity must include a number field, a date field, and a status/stage select field when business-appropriate.
- Include real finance structure: invoices or sales, payments, expenses or bills, cash/bank, and monthly financial summary.
- mockData keys must match entity ids and record property names must match field ids.
- Use realistic business data, not placeholder rows.`;
  }

  async function finalizeOrRepairGeneratedSpec(modelValue, parsed, rawText, desc, signal) {
    try {
      return finalizeGeneratedSpec(parsed, desc, null);
    } catch (err) {
      if (!err.validationIssues) throw err;
      trace("Semantic SystemSpec repair pass...", "warn");
      const repair = await callModel(modelValue, [
        { role:"system", content: semanticRepairPrompt() },
        { role:"user", content: `Business request:\n${desc}\n\nValidation issues:\n- ${err.validationIssues.join("\n- ")}\n\nInvalid JSON to repair:\n${String(rawText || JSON.stringify(parsed || {})).slice(0, 18000)}` }
      ], signal, 0.25);
      const repaired = parseSpecJson(repair?.content || "");
      if (!repaired) throw new Error("Semantic repair returned invalid JSON.");
      return finalizeGeneratedSpec(repaired, desc, null);
    }
  }

  function finalizeGeneratedSpec(raw, desc, previousSpec = null) {
    const prepared = prepareRawGeneratedSpecForValidation(raw, desc);
    const issues = validateRawGeneratedSpec(prepared);
    if (issues.length) {
      const err = new Error(`Invalid AI SystemSpec: ${issues[0]}`);
      err.validationIssues = issues;
      throw err;
    }
    const spec = normalizeSpec(prepared, desc, previousSpec);
    reinforceGeneratedDesign(spec);
    enrichFinancialCore(spec, desc);
    reinforceGeneratedDesign(spec);
    assertRenderableSpec(spec);
    return spec;
  }

  function assertRenderableSpec(spec) {
    const issues = [];
    if (!Array.isArray(spec.modules) || spec.modules.length < 5) issues.push("Generated system has too few modules.");
    spec.modules.forEach(m => {
      if (!spec.entities?.[m.entity]) issues.push(`Module "${m.name}" points to missing entity "${m.entity}".`);
    });
    Object.values(spec.entities || {}).forEach(entity => {
      if (!Array.isArray(entity.fields) || !entity.fields.length) issues.push(`Entity "${entity.id}" has no fields.`);
      if (!Array.isArray(spec.mockData?.[entity.id])) issues.push(`Entity "${entity.id}" has no records.`);
    });
    if (issues.length) throw new Error(`Generated system could not be rendered: ${issues[0]}`);
  }

  function reinforceGeneratedDesign(spec) {
    if (!spec || !Array.isArray(spec.modules)) return spec;
    const used = new Set();
    spec.modules.forEach((module, idx) => {
      if (!VALID_SCREENS.includes(module.screen)) module.screen = idx === 0 ? "dashboard" : FALLBACK_SCREENS[idx % FALLBACK_SCREENS.length];
      if (idx === 0 && !["dashboard","metric"].includes(module.screen)) module.screen = "dashboard";
      if (module.screen === "list" && [...used].includes("list")) {
        module.screen = FALLBACK_SCREENS.find(s => s !== "list" && !used.has(s)) || "split";
      } else if (idx > 0 && used.has(module.screen) && used.size < Math.min(5, spec.modules.length)) {
        module.screen = FALLBACK_SCREENS.find(s => !used.has(s)) || module.screen;
      }
      used.add(module.screen);
      module.color = module.color || ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
      module.icon = module.icon || moduleIcon(module.name);
    });
    if (spec.layout?.shell === "top") spec.layout.nav = "top";
    else if (spec.layout) spec.layout.nav = "sidebar";
    return spec;
  }

  function roundMoney(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function addDays(iso, days) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function recentMonths(count = 12) {
    const out = [];
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - count + 1);
    for (let i = 0; i < count; i++) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      out.push({ key:`${y}-${m}`, date:`${y}-${m}-15` });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }

  function financeProfile(spec, desc) {
    const domain = spec.domain || detectDomain(desc || spec.description || "");
    const profiles = {
      restaurant: { baseRevenue:52000, grossMargin:.62, taxRate:.0825, customers:["North Table Events","Downtown Catering","Walk-in Guests","Riverside Delivery","Private Dining"], vendors:["Fresh Farms Co.","Prime Meats","City Beverage Supply","LinenPro"] },
      hotel: { baseRevenue:145000, grossMargin:.58, taxRate:.105, customers:["Corporate Travel Desk","Global Tours","Direct Booking","Conference Group","Family Suite Guests"], vendors:["LinenPro","Metro Maintenance","Guest Supply Co.","Foodservice Direct"] },
      healthcare: { baseRevenue:118000, grossMargin:.54, taxRate:.035, customers:["Insurance Partner A","Self Pay Patients","Corporate Wellness","Family Care Plan","Diagnostics Referral"], vendors:["MedSupply Direct","Lab Services Co.","Clinical Software","SterileWorks"] },
      education: { baseRevenue:82000, grossMargin:.49, taxRate:.02, customers:["Tuition Plans","Corporate Training","Summer Program","Online Courses","Exam Prep"], vendors:["BookSource","Campus Catering","Learning Cloud","Facilities Co."] },
      fitness: { baseRevenue:61000, grossMargin:.66, taxRate:.06, customers:["Monthly Members","Corporate Wellness","Personal Training","Class Packs","Annual Members"], vendors:["EquipmentCare","FitSupply","Trainer Contractors","Wellness Software"] },
      realestate: { baseRevenue:176000, grossMargin:.72, taxRate:.04, customers:["Residential Sellers","Commercial Lease","Buyer Commission","Property Management","Developer Account"], vendors:["Listing Portals","Staging Studio","Legal Closings","Inspection Partners"] },
      retail: { baseRevenue:94000, grossMargin:.45, taxRate:.0875, customers:["Online Store","Flagship Shop","Marketplace Sales","Wholesale Buyer","Loyalty Customers"], vendors:["Northstar Wholesale","Packaging Hub","Payment Processor","Last Mile Freight"] },
      logistics: { baseRevenue:132000, grossMargin:.38, taxRate:.055, customers:["Atlas Imports","Meridian Retail","Cold Chain Client","Express Accounts","Regional Shippers"], vendors:["Fuel Network","Truck Maintenance","Warehouse Lease","Route Software"] },
      manufacturing: { baseRevenue:210000, grossMargin:.34, taxRate:.06, customers:["Apex Industrial","Crestfield Parts","Helix Systems","Norwood Manufacturing","Trident Supply"], vendors:["SteelWorks","CNC Maintenance","Packaging Hub","Safety Supplies"] },
      hr: { baseRevenue:76000, grossMargin:.71, taxRate:.05, customers:["Retainer Clients","Recruiting Fees","Payroll Services","Benefits Admin","HR Advisory"], vendors:["Job Boards","Assessment Tools","Payroll Processor","Legal Counsel"] },
      legal: { baseRevenue:138000, grossMargin:.69, taxRate:.045, customers:["Corporate Counsel","Litigation Client","Estate Planning","Retainer Account","Contract Review"], vendors:["Court Filing Service","Legal Research","Process Servers","Document Storage"] },
      jewelry: { baseRevenue:165000, grossMargin:.42, taxRate:.0825, customers:["Bridal Clients","Collectors","Custom Orders","Boutique Buyers","Repair Customers"], vendors:["Gem Exchange","Gold Refinery","Security Services","Luxury Packaging"] },
      saas: { baseRevenue:123000, grossMargin:.82, taxRate:.04, customers:["Enterprise Plan","Team Subscriptions","Usage Overage","Implementation Fees","Partner Channel"], vendors:["Cloud Hosting","Support Tools","Data Provider","Security Audit"] },
      generic: { baseRevenue:88000, grossMargin:.52, taxRate:.06, customers:["Meridian Co.","Northstar Group","BluePeak LLC","Arion Partners","Crestfield"], vendors:["Office Supply Co.","Cloud Services","Contract Labor","Facilities Vendor"] },
    };
    return { domain, ...(profiles[domain] || profiles.generic) };
  }

  function financeFields(currency) {
    const money = label => `${label} (${currency})`;
    return {
      [FINANCE_ENTITY_IDS.accounts]: [
        { id:"account_code", label:"Account Code", type:"text", required:true },
        { id:"name", label:"Account", type:"text", required:true },
        { id:"type", label:"Type", type:"select", options:["Asset","Liability","Equity","Revenue","Cost of Sales","Expense"] },
        { id:"balance", label:money("Balance"), type:"number" },
        { id:"status", label:"Status", type:"select", options:["Active","Review","Closed"] },
        { id:"updated", label:"Updated", type:"date" },
      ],
      [FINANCE_ENTITY_IDS.invoices]: [
        { id:"invoice_number", label:"Invoice #", type:"text", required:true },
        { id:"customer", label:"Customer", type:"text", required:true },
        { id:"issue_date", label:"Issue Date", type:"date" },
        { id:"due_date", label:"Due Date", type:"date" },
        { id:"subtotal", label:money("Subtotal"), type:"number" },
        { id:"tax", label:money("Tax"), type:"number" },
        { id:"total", label:money("Total"), type:"number" },
        { id:"paid", label:money("Paid"), type:"number" },
        { id:"balance", label:money("Balance"), type:"number" },
        { id:"status", label:"Status", type:"select", options:["Draft","Sent","Partially Paid","Paid","Overdue"] },
      ],
      [FINANCE_ENTITY_IDS.invoiceLines]: [
        { id:"invoice_number", label:"Invoice #", type:"text", required:true },
        { id:"item", label:"Item", type:"text" },
        { id:"quantity", label:"Qty", type:"number" },
        { id:"unit_price", label:money("Unit Price"), type:"number" },
        { id:"line_total", label:money("Line Total"), type:"number" },
        { id:"status", label:"Status", type:"select", options:["Open","Billed","Adjusted"] },
        { id:"date", label:"Date", type:"date" },
      ],
      [FINANCE_ENTITY_IDS.payments]: [
        { id:"payment_number", label:"Payment #", type:"text", required:true },
        { id:"invoice_number", label:"Invoice #", type:"text" },
        { id:"customer", label:"Customer", type:"text" },
        { id:"payment_date", label:"Payment Date", type:"date" },
        { id:"method", label:"Method", type:"select", options:["Bank Transfer","Card","ACH","Cash","Check"] },
        { id:"amount", label:money("Amount"), type:"number" },
        { id:"status", label:"Status", type:"select", options:["Pending","Posted","Reconciled"] },
      ],
      [FINANCE_ENTITY_IDS.expenses]: [
        { id:"expense_number", label:"Expense #", type:"text", required:true },
        { id:"vendor", label:"Vendor", type:"text" },
        { id:"category", label:"Category", type:"select", options:["COGS","Payroll","Rent","Marketing","Software","Utilities","Insurance","Professional Services"] },
        { id:"expense_date", label:"Expense Date", type:"date" },
        { id:"amount", label:money("Amount"), type:"number" },
        { id:"payment_status", label:"Payment Status", type:"select", options:["Accrued","Approved","Paid","Disputed"] },
        { id:"status", label:"Status", type:"select", options:["Submitted","Approved","Paid","Rejected"] },
      ],
      [FINANCE_ENTITY_IDS.journal]: [
        { id:"journal_id", label:"Journal ID", type:"text", required:true },
        { id:"entry_date", label:"Entry Date", type:"date" },
        { id:"account", label:"Account", type:"text" },
        { id:"source", label:"Source", type:"text" },
        { id:"debit", label:money("Debit"), type:"number" },
        { id:"credit", label:money("Credit"), type:"number" },
        { id:"status", label:"Status", type:"select", options:["Draft","Posted","Reviewed"] },
      ],
      [FINANCE_ENTITY_IDS.bank]: [
        { id:"transaction_id", label:"Transaction ID", type:"text", required:true },
        { id:"transaction_date", label:"Date", type:"date" },
        { id:"description", label:"Description", type:"text" },
        { id:"type", label:"Type", type:"select", options:["Deposit","Withdrawal","Transfer"] },
        { id:"amount", label:money("Amount"), type:"number" },
        { id:"balance", label:money("Running Balance"), type:"number" },
        { id:"status", label:"Status", type:"select", options:["Pending","Cleared","Reconciled"] },
      ],
      [FINANCE_ENTITY_IDS.summary]: [
        { id:"month", label:"Month", type:"date", required:true },
        { id:"revenue", label:money("Revenue"), type:"number" },
        { id:"cost_of_sales", label:money("Cost of Sales"), type:"number" },
        { id:"gross_profit", label:money("Gross Profit"), type:"number" },
        { id:"operating_expenses", label:money("Operating Expenses"), type:"number" },
        { id:"net_profit", label:money("Net Profit"), type:"number" },
        { id:"cash_balance", label:money("Cash Balance"), type:"number" },
        { id:"accounts_receivable", label:money("AR"), type:"number" },
        { id:"accounts_payable", label:money("AP"), type:"number" },
        { id:"status", label:"Status", type:"select", options:["Open","Review","Closed"] },
      ],
    };
  }

  function collectBusinessNames(spec, regex) {
    const out = [];
    Object.entries(spec.entities || {}).forEach(([entityId, entity]) => {
      const rows = spec.mockData?.[entityId] || [];
      const fields = (entity.fields || []).filter(f => regex.test(`${f.id} ${f.label}`));
      rows.slice(0, 20).forEach(row => {
        fields.forEach(f => {
          const value = String(row[f.id] || "").trim();
          if (value.length >= 3 && value.length <= 48 && !/^\d{4}-\d{2}-\d{2}$/.test(value)) out.push(value);
        });
      });
    });
    return [...new Set(out)].slice(0, 12);
  }

  function mergeFinanceEntity(spec, id, name, fields) {
    const current = spec.entities[id];
    if (!current) {
      spec.entities[id] = { id, name, fields: structuredCloneSafe(fields) };
      return;
    }
    current.id = id;
    current.name = current.name || name;
    current.fields = Array.isArray(current.fields) ? current.fields : [];
    const byId = new Set((current.fields || []).map(f => f.id));
    fields.forEach(field => {
      if (!byId.has(field.id)) current.fields.push(structuredCloneSafe(field));
    });
  }

  function uniqueModuleId(spec, raw) {
    const base = slug(raw, "module");
    let id = base;
    let i = 2;
    while (spec.modules.some(m => m.id === id)) id = `${base}_${i++}`;
    return id;
  }

  function ensureFinancialModules(spec) {
    const financeText = m => `${m.name || ""} ${m.entity || ""}`.toLowerCase();
    const hasFinance = spec.modules.some(m => /finance|account|billing|invoice|payment|revenue|cash|ledger|profit|expense/.test(financeText(m)));
    const hasInvoice = spec.modules.some(m => /invoice|billing|receivable/.test(financeText(m)));
    const financeKpis = [
      { label:"Revenue", field:"revenue", aggregate:"sum" },
      { label:"Net Profit", field:"net_profit", aggregate:"sum" },
      { label:"Cash", field:"cash_balance", aggregate:"max" },
      { label:"AR", field:"accounts_receivable", aggregate:"sum" },
    ];

    spec.modules.forEach(module => {
      if (/finance|account|revenue|profit|cash/.test(financeText(module)) && !Array.isArray(module.kpis)) {
        module.kpis = financeKpis;
        if (!["metric","report","dashboard"].includes(module.screen)) module.screen = "metric";
      }
    });

    if (!hasFinance && spec.modules.length < 10) {
      spec.modules.push({
        id: uniqueModuleId(spec, "finance"),
        name: "Finance",
        icon: "coin",
        entity: FINANCE_ENTITY_IDS.summary,
        screen: "metric",
        color: "#0ea5e9",
        kpis: financeKpis,
      });
    }
    if (!hasInvoice && spec.modules.length < 10) {
      spec.modules.push({
        id: uniqueModuleId(spec, "invoices"),
        name: "Invoices",
        icon: "docs",
        entity: FINANCE_ENTITY_IDS.invoices,
        screen: "split",
        color: "#14b8a6",
        kpis: null,
      });
    }
  }

  function buildFinancialData(spec, desc) {
    const profile = financeProfile(spec, desc);
    const currency = /egp|egypt|cairo/i.test(`${desc} ${spec.description}`) ? "EGP" : /eur|euro/i.test(`${desc} ${spec.description}`) ? "EUR" : "USD";
    const seed = `${spec.id}|${spec.name}|${profile.domain}`;
    const customers = [...new Set([...collectBusinessNames(spec, /customer|client|guest|patient|member|student|company|name/i), ...profile.customers])].slice(0, 18);
    const vendors = [...new Set(profile.vendors)].slice(0, 12);
    const months = recentMonths(12);
    const items = ["Core service", "Premium package", "Implementation", "Monthly retainer", "Usage fees", "Support plan"];
    const invoices = [];
    const invoiceLines = [];
    const payments = [];
    const expenses = [];
    const journal = [];
    const bank = [];
    const summary = [];
    const invoiceTotals = {};
    const paymentTotals = {};
    const expenseTotals = {};
    let runningBank = roundMoney(profile.baseRevenue * (0.38 + seededRand(seed, 1) * 0.32));

    const pushJournal = (date, source, account, debit, credit, status = "Posted") => {
      journal.push({
        id:`jrnl_${journal.length + 1}`,
        journal_id:`JE-${String(Math.ceil((journal.length + 1) / 2)).padStart(5, "0")}`,
        entry_date:date,
        account,
        source,
        debit:roundMoney(debit),
        credit:roundMoney(credit),
        status,
      });
    };

    months.forEach((month, mi) => {
      const season = 0.82 + seededRand(seed + "season", mi) * 0.44;
      const invoiceCount = 3 + Math.floor(seededRand(seed + "invoice-count", mi) * 3);
      invoiceTotals[month.key] = 0;
      paymentTotals[month.key] = 0;
      expenseTotals[month.key] = 0;

      for (let j = 0; j < invoiceCount; j++) {
        const idx = invoices.length;
        const issueDate = `${month.key}-${String(4 + j * 6).padStart(2, "0")}`;
        const invoiceNumber = `INV-${month.key.replace("-", "")}-${String(j + 1).padStart(3, "0")}`;
        const subtotal = roundMoney((profile.baseRevenue * season / invoiceCount) * (0.72 + seededRand(seed + "invoice", idx) * 0.68));
        const tax = roundMoney(subtotal * profile.taxRate);
        const total = roundMoney(subtotal + tax);
        const paidRatio = [1, 1, 0.65, 0][Math.floor(seededRand(seed + "paid", idx) * 4)];
        const paid = roundMoney(total * paidRatio);
        const balance = roundMoney(total - paid);
        const status = balance <= 0 ? "Paid" : paid > 0 ? "Partially Paid" : mi < months.length - 1 ? "Overdue" : "Sent";
        const customer = customers[idx % customers.length] || "Business Customer";
        invoices.push({
          id:`invoice_${idx + 1}`,
          invoice_number:invoiceNumber,
          customer,
          issue_date:issueDate,
          due_date:addDays(issueDate, 30),
          subtotal,
          tax,
          total,
          paid,
          balance,
          status,
        });
        invoiceTotals[month.key] += subtotal;

        const lineA = roundMoney(subtotal * (0.58 + seededRand(seed + "line-a", idx) * 0.14));
        const lineB = roundMoney(subtotal - lineA);
        [lineA, lineB].forEach((lineTotal, li) => {
          const quantity = 1 + Math.floor(seededRand(seed + "qty", idx + li) * 4);
          invoiceLines.push({
            id:`line_${invoiceLines.length + 1}`,
            invoice_number:invoiceNumber,
            item:items[(idx + li) % items.length],
            quantity,
            unit_price:roundMoney(lineTotal / quantity),
            line_total:lineTotal,
            status:"Billed",
            date:issueDate,
          });
        });

        pushJournal(issueDate, invoiceNumber, "Accounts Receivable", total, 0);
        pushJournal(issueDate, invoiceNumber, "Revenue", 0, subtotal);
        if (tax > 0) pushJournal(issueDate, invoiceNumber, "Sales Tax Payable", 0, tax);

        if (paid > 0) {
          const paymentDate = addDays(issueDate, 8 + Math.floor(seededRand(seed + "paydate", idx) * 24));
          payments.push({
            id:`payment_${payments.length + 1}`,
            payment_number:`PAY-${month.key.replace("-", "")}-${String(payments.length + 1).padStart(3, "0")}`,
            invoice_number:invoiceNumber,
            customer,
            payment_date:paymentDate,
            method:["Bank Transfer","Card","ACH","Check"][Math.floor(seededRand(seed + "method", idx) * 4)],
            amount:paid,
            status:"Reconciled",
          });
          paymentTotals[month.key] += paid;
          runningBank = roundMoney(runningBank + paid);
          bank.push({
            id:`bank_${bank.length + 1}`,
            transaction_id:`BNK-${String(bank.length + 1).padStart(5, "0")}`,
            transaction_date:paymentDate,
            description:`Payment ${invoiceNumber}`,
            type:"Deposit",
            amount:paid,
            balance:runningBank,
            status:"Reconciled",
          });
          pushJournal(paymentDate, `Payment ${invoiceNumber}`, "Cash", paid, 0);
          pushJournal(paymentDate, `Payment ${invoiceNumber}`, "Accounts Receivable", 0, paid);
        }
      }

      const revenue = invoiceTotals[month.key];
      const cogs = roundMoney(revenue * (1 - profile.grossMargin));
      const operating = [
        ["COGS", vendors[0] || "Supplier", cogs],
        ["Payroll", "Payroll Processor", revenue * (0.16 + seededRand(seed + "payroll", mi) * 0.06)],
        ["Rent", "Facilities Vendor", profile.baseRevenue * 0.055],
        ["Marketing", "Growth Channel", revenue * (0.035 + seededRand(seed + "mkt", mi) * 0.03)],
        ["Software", "Cloud Services", profile.baseRevenue * 0.025],
        ["Utilities", "Utility Provider", profile.baseRevenue * 0.018],
      ];
      operating.forEach(([category, vendor, rawAmount], ei) => {
        const amount = roundMoney(rawAmount);
        const expenseDate = `${month.key}-${String(6 + ei * 3).padStart(2, "0")}`;
        expenses.push({
          id:`expense_${expenses.length + 1}`,
          expense_number:`EXP-${month.key.replace("-", "")}-${String(ei + 1).padStart(3, "0")}`,
          vendor,
          category,
          expense_date:expenseDate,
          amount,
          payment_status:ei % 5 === 0 && mi === months.length - 1 ? "Accrued" : "Paid",
          status:ei % 5 === 0 && mi === months.length - 1 ? "Approved" : "Paid",
        });
        expenseTotals[month.key] += amount;
        if (!(ei % 5 === 0 && mi === months.length - 1)) {
          runningBank = roundMoney(runningBank - amount);
          bank.push({
            id:`bank_${bank.length + 1}`,
            transaction_id:`BNK-${String(bank.length + 1).padStart(5, "0")}`,
            transaction_date:expenseDate,
            description:`${category} - ${vendor}`,
            type:"Withdrawal",
            amount:-amount,
            balance:runningBank,
            status:"Reconciled",
          });
        }
        pushJournal(expenseDate, category, category === "COGS" ? "Cost of Sales" : `${category} Expense`, amount, 0);
        pushJournal(expenseDate, category, ei % 5 === 0 && mi === months.length - 1 ? "Accounts Payable" : "Cash", 0, amount);
      });
    });

    let cash = roundMoney(profile.baseRevenue * 0.42);
    months.forEach((month, mi) => {
      const revenue = roundMoney(invoiceTotals[month.key] || 0);
      const costOfSales = roundMoney(revenue * (1 - profile.grossMargin));
      const operatingExpenses = roundMoney((expenseTotals[month.key] || 0) - costOfSales);
      const grossProfit = roundMoney(revenue - costOfSales);
      const netProfit = roundMoney(grossProfit - operatingExpenses);
      const ar = roundMoney(invoices.filter(i => i.issue_date.startsWith(month.key)).reduce((s, i) => s + i.balance, 0));
      const ap = roundMoney(expenses.filter(e => e.expense_date.startsWith(month.key) && e.payment_status !== "Paid").reduce((s, e) => s + e.amount, 0));
      cash = roundMoney(cash + (paymentTotals[month.key] || 0) - (expenseTotals[month.key] || 0));
      summary.push({
        id:`fin_${mi + 1}`,
        month:month.date,
        revenue,
        cost_of_sales:costOfSales,
        gross_profit:grossProfit,
        operating_expenses:operatingExpenses,
        net_profit:netProfit,
        cash_balance:cash,
        accounts_receivable:ar,
        accounts_payable:ap,
        status:mi < months.length - 1 ? "Closed" : "Review",
      });
    });

    const last = summary[summary.length - 1] || {};
    const fields = financeFields(currency);
    const accounts = [
      ["1000","Cash","Asset",last.cash_balance || 0],
      ["1100","Accounts Receivable","Asset",last.accounts_receivable || 0],
      ["2000","Accounts Payable","Liability",last.accounts_payable || 0],
      ["2100","Sales Tax Payable","Liability",roundMoney(invoices.reduce((s, i) => s + i.tax, 0) * .08)],
      ["3000","Owner Equity","Equity",roundMoney((last.cash_balance || 0) * .45)],
      ["4000","Revenue","Revenue",roundMoney(summary.reduce((s, m) => s + m.revenue, 0))],
      ["5000","Cost of Sales","Cost of Sales",roundMoney(summary.reduce((s, m) => s + m.cost_of_sales, 0))],
      ["6100","Payroll Expense","Expense",roundMoney(expenses.filter(e => e.category === "Payroll").reduce((s, e) => s + e.amount, 0))],
      ["6200","Rent Expense","Expense",roundMoney(expenses.filter(e => e.category === "Rent").reduce((s, e) => s + e.amount, 0))],
      ["6300","Marketing Expense","Expense",roundMoney(expenses.filter(e => e.category === "Marketing").reduce((s, e) => s + e.amount, 0))],
    ].map(([code, name, type, balance], idx) => ({
      id:`acct_${code}`,
      account_code:code,
      name,
      type,
      balance:roundMoney(balance),
      status:"Active",
      updated:months[months.length - 1]?.date || new Date().toISOString().slice(0, 10),
    }));

    return {
      fields,
      data: {
        [FINANCE_ENTITY_IDS.accounts]: accounts,
        [FINANCE_ENTITY_IDS.invoices]: invoices,
        [FINANCE_ENTITY_IDS.invoiceLines]: invoiceLines,
        [FINANCE_ENTITY_IDS.payments]: payments,
        [FINANCE_ENTITY_IDS.expenses]: expenses,
        [FINANCE_ENTITY_IDS.journal]: journal.slice(0, 240),
        [FINANCE_ENTITY_IDS.bank]: bank.slice(0, 180),
        [FINANCE_ENTITY_IDS.summary]: summary,
      },
      currency,
    };
  }

  function enrichFinancialCore(spec, desc) {
    if (!spec || !spec.entities) return spec;
    const pack = buildFinancialData(spec, desc);
    const names = {
      [FINANCE_ENTITY_IDS.accounts]: "Chart of Accounts",
      [FINANCE_ENTITY_IDS.invoices]: "Invoices",
      [FINANCE_ENTITY_IDS.invoiceLines]: "Invoice Lines",
      [FINANCE_ENTITY_IDS.payments]: "Payments",
      [FINANCE_ENTITY_IDS.expenses]: "Expenses",
      [FINANCE_ENTITY_IDS.journal]: "Journal Entries",
      [FINANCE_ENTITY_IDS.bank]: "Bank Transactions",
      [FINANCE_ENTITY_IDS.summary]: "Financial Summary",
    };
    Object.entries(pack.fields).forEach(([id, fields]) => mergeFinanceEntity(spec, id, names[id] || titleCase(id), fields));
    spec.mockData = spec.mockData || {};
    Object.entries(pack.data).forEach(([id, rows]) => { spec.mockData[id] = rows; });
    ensureFinancialModules(spec);
    spec.financialModel = {
      currency: pack.currency,
      basis: "generated-linked-ledger",
      generatedAt: new Date().toISOString(),
      entities: Object.values(FINANCE_ENTITY_IDS),
    };
    spec.interactions = [...new Set([...(spec.interactions || []), "financial dashboards", "linked invoices/payments/expenses", "ledger exports"])];
    return spec;
  }

  function snapshot(spec, label) {
    return {
      at: Date.now(),
      label: label || "Revision",
      spec: structuredCloneSafe({ ...spec, revisionHistory: [] }),
    };
  }

  async function createSystem() {
    if (runAbort) {
      stopSystemGeneration();
      return;
    }
    const desc = $("sysPromptInput")?.value.trim() || "Create a professional ERP system for a growing business";
    clearTrace();
    setStatus("Running", "running");
    runAbort = new AbortController();
    updateCreateButtonState();
    try {
      trace("Planning business modules", "plan");
      const spec = await generateWithModel(desc, runAbort.signal);
      if (runAbort.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      trace("Normalising modules, data, and interactions", "data");
      systems.unshift(spec);
      activeId = spec.id;
      activeModuleId = spec.modules[0]?.id || "";
      activeEntityId = spec.modules[0]?.entity || "";
      selectedRecordId = "";
      saveRuntimeData(spec, spec.mockData);
      saveSystems();
      renderAll();
      setStatus("Done", "done");
      trace("System ready", "ok");
    } catch (err) {
      if (err.name === "AbortError") {
        setStatus("Stopped", "stopped");
        trace("Generation stopped before a new system was saved", "warn");
      } else {
        setStatus("Error", "error");
        trace(err.message || "System generation failed", "err");
      }
    } finally {
      runAbort = null;
      updateCreateButtonState();
    }
  }

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
