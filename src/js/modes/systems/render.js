/** Systems UI render pipeline (Wave 16). */
import { esc, nowLabel, shadeHex, hexToRgb, slug, titleCase } from './utils.js';
import { DOMAIN_BG, KPI_ICONS, VALID_SCREENS } from './constants.js';

export function createSystemsRenderApi(ctx) {
  const { $, st, getActive, getRuntimeData, saveRuntimeData, saveSystems, trace, moduleIcon, iconSvg } = ctx;

  function renderAll() {
    renderSystemList();
    renderVersionList();
    renderPreview();
    renderDataEditor();
  }

  function renderSystemList() {
    const el = $("sysSystemList");
    if (!el) return;
    if (!st.systems.length) {
      el.innerHTML = `<div class="sys-card-meta">No systems yet. Describe one above and create it.</div>`;
      return;
    }
    el.innerHTML = st.systems.map(s => `
      <div class="sys-system-card ${s.id === st.activeId ? "active" : ""}" data-system-id="${esc(s.id)}">
        <div class="sys-card-name">${esc(s.name)}</div>
        <div class="sys-card-meta">${esc((s.modules || []).length)} modules · ${esc(nowLabel(s.updatedAt || s.createdAt))}</div>
        <div class="sys-card-actions">
          <button class="sys-card-btn" data-sys-rename="${esc(s.id)}" title="Rename">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M9.5 2.5a1.5 1.5 0 0 1 2.12 2.12L4 13H2v-2L9.5 2.5z"/></svg>
          </button>
          <button class="sys-card-btn sys-card-btn-del" data-sys-delete="${esc(s.id)}" title="Delete">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5 6v4M9 6v4M3 4l.7 7.3a.7.7 0 0 0 .7.7h5.2a.7.7 0 0 0 .7-.7L11 4"/></svg>
          </button>
        </div>
      </div>
    `).join("");
  }

  function renderVersionList() {
    const spec = getActive();
    const el = $("sysVersionList");
    if (!el) return;
    const history = spec?.revisionHistory || [];
    if (!spec || !history.length) {
      el.innerHTML = `<div class="sys-card-meta">No revisions yet.</div>`;
      return;
    }
    el.innerHTML = history.map((h, idx) => `
      <div class="sys-version-card" data-version-index="${idx}">
        <div class="sys-card-name">${esc(h.label || "Revision")}</div>
        <div class="sys-card-meta">${esc(nowLabel(h.at))}</div>
      </div>
    `).join("");
  }

  function renderPreview() {
    const spec = getActive();
    const host = $("sysAppHost");
    if (!host) return;
    $("sysPreviewName").textContent = spec?.name || "No system selected";
    $("sysPreviewDesc").textContent = spec?.description || "Create a system to start.";
    if (!spec) {
      host.innerHTML = `<div class="sys-empty"><div><h2>ERP Builder</h2><p>Describe your business system to generate a fully interactive prototype with modules, data, charts, and workflows.</p></div></div>`;
      return;
    }
    if (!st.activeModuleId || !spec.modules.some(m => m.id === st.activeModuleId)) st.activeModuleId = spec.modules[0]?.id || "";
    const module = spec.modules.find(m => m.id === st.activeModuleId) || spec.modules[0];
    const entity = spec.entities[module?.entity] || Object.values(spec.entities)[0];
    st.activeEntityId = entity?.id || "";
    const data = getRuntimeData(spec);
    const records = prepareRecords(data[st.activeEntityId] || [], entity);
    const selected = records.find(r => r.id === st.selectedRecordId) || records[0] || null;
    st.selectedRecordId = selected?.id || "";

    const screenHtml = (() => {
      switch (module.screen) {
        case "kanban":   return renderKanban(records, entity, spec);
        case "list":     return renderListOnly(records, entity);
        case "report":   return renderReport(records, entity, spec, module);
        case "split":    return renderSplit(records, entity, selected, spec);
        case "cards":    return renderCards(records, entity);
        case "timeline": return renderTimeline(records, entity);
        case "calendar": return renderCalendar(records, entity);
        case "metric":   return renderMetric(records, entity, module, spec);
        case "feed":     return renderFeed(records, entity);
        default:         return `${renderKpis(records, entity, module)}<div class="sys-content-grid">${renderTable(records, entity)}${renderSideWidgets(records, entity, selected, spec)}</div>`;
      }
    })();

    const shell = spec.layout?.shell || "sidebar";
    const cls = spec.theme.mode === "dark" ? "dark" : "";
    const vars = themeVars(spec);
    const screen = module.screen || "dashboard";
    const searchInput = `<input class="sys-app-search" id="sysAppSearch" value="${esc(st.searchQuery)}" placeholder="Search ${esc(entity?.name || "")}…" />`;

    const moduleNav = (btnClass = "sys-module-btn") => spec.modules.map(m => `
      <button class="${btnClass} ${m.id === st.activeModuleId ? "active" : ""}" data-module-id="${esc(m.id)}"
        ${m.color ? `style="--mod-color:${esc(m.color)}"` : ""}>
        <span class="sys-module-icon">${iconSvg(m.icon)}</span><span>${esc(m.name)}</span>
      </button>`).join("");

    const screenDiv = `<div class="sys-screen sys-screen--${esc(screen)}">${screenHtml}</div>`;

    switch (shell) {

      // ── Shell: SIDEBAR ───────────────────────────────────────────
      case "sidebar":
      default:
        host.innerHTML = `
          <div class="sys-app sys-shell-sidebar ${cls}" style="${vars}">
            <nav class="sys-nav-sidebar">
              <div class="sys-nav-brand">
                <div class="sys-nav-logo" style="background:var(--sys-primary)">${esc(spec.name[0])}</div>
                <div><div class="sys-nav-title">${esc(spec.name)}</div><div class="sys-nav-sub">${esc(spec.description)}</div></div>
              </div>
              <div class="sys-module-list">${moduleNav()}</div>
            </nav>
            <section class="sys-app-main">
              <header class="sys-app-topbar">
                <div>
                  <div class="sys-breadcrumb">${esc(spec.name)} / ${esc(module.name)}</div>
                  <div class="sys-screen-title">${esc(module.name)}<span class="sys-screen-badge">${esc(screen)}</span></div>
                </div>
                ${searchInput}
              </header>
              ${screenDiv}
            </section>
          </div>`;
        break;

      // ── Shell: TOP TABS ──────────────────────────────────────────
      case "top":
        host.innerHTML = `
          <div class="sys-app sys-shell-top ${cls}" style="${vars}">
            <header class="sys-topnav">
              <div class="sys-topnav-brand">
                <div class="sys-topnav-dot" style="background:var(--sys-primary)"></div>
                <span class="sys-topnav-name">${esc(spec.name)}</span>
              </div>
              <div class="sys-topnav-tabs">
                ${spec.modules.map(m => `
                  <button class="sys-topnav-tab ${m.id === st.activeModuleId ? "active" : ""}" data-module-id="${esc(m.id)}">
                    <span class="sys-module-icon">${iconSvg(m.icon)}</span>${esc(m.name)}
                  </button>`).join("")}
              </div>
              <div class="sys-topnav-right">${searchInput}</div>
            </header>
            <div class="sys-shell-body">
              <div class="sys-top-breadcrumb">
                <span>${esc(module.name)}</span><span class="sys-screen-badge">${esc(screen)}</span>
              </div>
              ${screenDiv}
            </div>
          </div>`;
        break;

      // ── Shell: ICON DOCK ─────────────────────────────────────────
      case "dock":
        host.innerHTML = `
          <div class="sys-app sys-shell-dock ${cls}" style="${vars}">
            <nav class="sys-dock">
              <div class="sys-dock-logo" style="background:var(--sys-primary)">${esc(spec.name[0])}</div>
              <div class="sys-dock-divider"></div>
              ${spec.modules.map(m => `
                <button class="sys-dock-btn ${m.id === st.activeModuleId ? "active" : ""}" data-module-id="${esc(m.id)}" title="${esc(m.name)}">
                  <span class="sys-module-icon">${iconSvg(m.icon)}</span>
                  <span class="sys-dock-tooltip">${esc(m.name)}</span>
                </button>`).join("")}
            </nav>
            <section class="sys-app-main">
              <header class="sys-dock-topbar">
                <div class="sys-dock-breadcrumb">
                  <span class="sys-dock-module-name">${esc(module.name)}</span>
                  <span class="sys-screen-badge">${esc(screen)}</span>
                </div>
                ${searchInput}
              </header>
              ${screenDiv}
            </section>
          </div>`;
        break;

      // ── Shell: CARD PICKER ───────────────────────────────────────
      case "cards-nav":
        host.innerHTML = `
          <div class="sys-app sys-shell-cardsnav ${cls}" style="${vars}">
            <header class="sys-cardsnav-header">
              <div class="sys-cardsnav-brand">
                <div class="sys-cardsnav-logo" style="background:var(--sys-primary)">${esc(spec.name[0])}</div>
                <div>
                  <div class="sys-cardsnav-title">${esc(spec.name)}</div>
                  <div class="sys-cardsnav-desc">${esc(spec.description)}</div>
                </div>
              </div>
              ${searchInput}
            </header>
            <div class="sys-cardsnav-modules">
              ${spec.modules.map(m => `
                <button class="sys-cardsnav-module-btn ${m.id === st.activeModuleId ? "active" : ""}" data-module-id="${esc(m.id)}"
                  style="${m.color ? `--mod-color:${esc(m.color)}` : `--mod-color:var(--sys-primary)`}">
                  <span class="sys-cardsnav-icon">${iconSvg(m.icon)}</span>
                  <span class="sys-cardsnav-label">${esc(m.name)}</span>
                </button>`).join("")}
            </div>
            <div class="sys-cardsnav-content">
              ${screenDiv}
            </div>
          </div>`;
        break;

      // ── Shell: COMMAND (VS Code style) ───────────────────────────
      case "command":
        host.innerHTML = `
          <div class="sys-app sys-shell-command ${cls}" style="${vars}">
            <div class="sys-cmd-bar">
              <div class="sys-cmd-brand">
                <span class="sys-cmd-logo" style="background:var(--sys-primary)">${esc(spec.name[0])}</span>
                <span class="sys-cmd-name">${esc(spec.name)}</span>
                <span class="sys-cmd-sep">›</span>
                <span class="sys-cmd-module">${esc(module.name)}</span>
              </div>
              ${searchInput}
            </div>
            <div class="sys-cmd-body">
              <nav class="sys-cmd-sidebar">
                ${spec.modules.map(m => `
                  <button class="sys-cmd-nav-btn ${m.id === st.activeModuleId ? "active" : ""}" data-module-id="${esc(m.id)}">
                    <span class="sys-module-icon">${iconSvg(m.icon)}</span>
                    <span class="sys-cmd-nav-label">${esc(m.name)}</span>
                    ${m.id === st.activeModuleId ? `<span class="sys-screen-badge" style="margin-left:auto">${esc(screen)}</span>` : ""}
                  </button>`).join("")}
              </nav>
              <main class="sys-cmd-main">
                ${screenDiv}
              </main>
            </div>
          </div>`;
        break;
    }
  }

  function themeVars(spec) {
    const dark = spec.theme.mode === "dark";
    const primary = spec.theme.primary || "#2563eb";
    const accent  = spec.theme.accent  || "#a70d2a";
    const radius  = Number(spec.theme.radius || 10);
    const domain  = spec.domain || detectDomain(spec.description || "");
    const dbg     = (DOMAIN_BG[domain] || DOMAIN_BG.generic)[dark ? "dark" : "light"];
    const navBg      = dark ? shadeHex(primary, 0.38) : primary;
    const primaryRgb = hexToRgb(primary);
    const accentRgb  = hexToRgb(accent);

    return [
      `--sys-primary:${primary}`,
      `--sys-accent:${accent}`,
      `--sys-primary-rgb:${primaryRgb}`,
      `--sys-accent-rgb:${accentRgb}`,
      `--sys-primary-fade:rgba(${primaryRgb},${dark ? ".18" : ".10"})`,
      `--sys-accent-fade:rgba(${accentRgb},${dark ? ".18" : ".10"})`,
      `--sys-card-bg:${dbg.card}`,
      `--sys-app-bg:${dbg.app}`,
      `--sys-surface:${dark ? "rgba(255,255,255,.04)" : "rgba(15,23,42,.025)"}`,
      `--sys-app-text:${dark ? "#e5e7eb" : "#0f172a"}`,
      `--sys-app-sub:${dark ? "#94a3b8" : "#475569"}`,
      `--sys-app-muted:${dark ? "#64748b" : "#94a3b8"}`,
      `--sys-nav-bg:${navBg}`,
      `--sys-nav-text:#f1f5f9`,
      `--sys-border:${dbg.border}`,
      `--sys-radius:${radius}px`,
      `--sys-radius-sm:${Math.max(4, radius - 4)}px`,
      `--sys-radius-lg:${Math.min(20, radius + 6)}px`,
    ].join(";");
  }

  function prepareRecords(rows, entity) {
    let records = Array.isArray(rows) ? [...rows] : [];
    const q = st.searchQuery.trim().toLowerCase();
    if (q) {
      records = records.filter(r => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q)));
    }
    for (const rule of st.filterRules) {
      if (!rule.field || rule.value === "") continue;
      records = records.filter(r => {
        const cell = String(r[rule.field] ?? "").toLowerCase();
        const val  = rule.value.toLowerCase();
        switch (rule.op) {
          case "eq":     return cell === val;
          case "neq":    return cell !== val;
          case "starts": return cell.startsWith(val);
          case "gt":     return Number(r[rule.field]) > Number(rule.value);
          case "lt":     return Number(r[rule.field]) < Number(rule.value);
          default:       return cell.includes(val);
        }
      });
    }
    if (st.sortState.field) {
      records.sort((a, b) => {
        const av = a[st.sortState.field], bv = b[st.sortState.field];
        const n = Number(av) - Number(bv);
        const cmp = Number.isFinite(n) && !Number.isNaN(n) ? n : String(av ?? "").localeCompare(String(bv ?? ""));
        return st.sortState.dir === "desc" ? -cmp : cmp;
      });
    }
    return records;
  }

  function renderKpis(records, entity, module = null) {
    const fields = entity?.fields || [];
    const numField = fields.find(f => f.type === "number");
    const statusField = fields.find(f => f.id === "status" || f.type === "select");
    const total = numField ? records.reduce((sum, r) => sum + (Number(r[numField.id]) || 0), 0) : records.length;
    const open = statusField ? records.filter(r => !/closed|done|approved/i.test(String(r[statusField.id] || ""))).length : Math.ceil(records.length * .4);
    const pct = records.length ? Math.round(((records.length - open) / records.length) * 100) : 0;

    let kpis;
    if (Array.isArray(module?.kpis) && module.kpis.length) {
      kpis = module.kpis.map((k, i) => {
        const fld = fields.find(f => f.id === k.field || f.label?.toLowerCase() === k.field?.toLowerCase());
        let val;
        if (k.aggregate === "sum") val = formatValue(records.reduce((s, r) => s + (Number(r[fld?.id]) || 0), 0));
        else if (k.aggregate === "avg") val = formatValue(records.length ? records.reduce((s, r) => s + (Number(r[fld?.id]) || 0), 0) / records.length : 0);
        else if (k.aggregate === "max") val = formatValue(Math.max(...records.map(r => Number(r[fld?.id]) || 0)));
        else val = records.length;
        return { label: k.label, value: val, trend: k.trend || "+5%", up: !String(k.trend || "").startsWith("-"), icon: KPI_ICONS[i % KPI_ICONS.length], accent: ACCENT_PALETTE[i % ACCENT_PALETTE.length] };
      });
    } else {
      kpis = [
        { label: "Total Records", value: records.length, trend: "+12%", up: true, icon: KPI_ICONS[0], accent: ACCENT_PALETTE[0] },
        { label: numField ? `Total ${numField.label}` : "Active Work", value: formatValue(total), trend: "+8%", up: true, icon: KPI_ICONS[1], accent: ACCENT_PALETTE[1] },
        { label: "Open Items", value: open, trend: "-3%", up: false, icon: KPI_ICONS[2], accent: ACCENT_PALETTE[2] },
        { label: "Completion", value: `${pct}%`, trend: "+5%", up: true, icon: KPI_ICONS[3], accent: ACCENT_PALETTE[3] },
      ];
    }
    return `<div class="sys-kpi-grid">${kpis.map((k, ki) => {
      const seeds = [55,72,48,85,61,90,68];
      const bars = seeds.map((h, bi) => {
        const v = ((h + ki * 17 + bi * 11) % 16) + 4;
        return `<rect x="${bi * 6}" y="${20 - v}" width="4" height="${v}" rx="1" fill="${k.accent}" opacity="${bi === seeds.length - 1 ? "1" : "0.4"}"/>`;
      }).join("");
      return `
      <div class="sys-kpi-card" style="--kpi-accent:${k.accent}">
        <div class="sys-kpi-icon" style="color:${k.accent};background:${k.accent}18">${k.icon}</div>
        <div class="sys-kpi-body">
          <div class="sys-kpi-label">${esc(k.label)}</div>
          <div class="sys-kpi-value">${esc(String(k.value))}</div>
          <svg class="sys-sparkline" viewBox="0 0 46 20" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>
        </div>
        <div class="sys-kpi-trend ${k.up ? "up" : "down"}">
          <svg viewBox="0 0 10 10" fill="currentColor" width="9" height="9"><polygon points="${k.up ? "5,2 9,8 1,8" : "5,8 9,2 1,2"}"/></svg>
          ${esc(k.trend)}
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  function sortIcon(f) {
    if (st.sortState.field !== f.id) return `<svg viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.4" width="9" height="12" style="opacity:.3"><path d="M5 1v12M2 4l3-3 3 3M2 10l3 3 3-3"/></svg>`;
    return st.sortState.dir === "asc"
      ? `<svg viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.6" width="9" height="12"><path d="M5 2v10M2 5l3-3 3 3"/></svg>`
      : `<svg viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.6" width="9" height="12"><path d="M5 2v10M2 9l3 3 3-3"/></svg>`;
  }

  function renderFilterPanel(entity) {
    const fields = entity?.fields || [];
    const ops = [
      { v:"contains", l:"contains" }, { v:"eq", l:"= equals" }, { v:"neq", l:"≠ not" },
      { v:"starts", l:"starts with" }, { v:"gt", l:"> greater" }, { v:"lt", l:"< less" },
    ];
    return `<div class="sys-filter-panel">
      ${st.filterRules.map(rule => `
        <div class="sys-filter-rule">
          <select class="sys-filter-field" data-rule-id="${esc(rule.id)}" data-prop="field">
            ${fields.map(f => `<option value="${esc(f.id)}" ${rule.field === f.id ? "selected" : ""}>${esc(f.label)}</option>`).join("")}
          </select>
          <select class="sys-filter-op" data-rule-id="${esc(rule.id)}" data-prop="op">
            ${ops.map(o => `<option value="${o.v}" ${rule.op === o.v ? "selected" : ""}>${o.l}</option>`).join("")}
          </select>
          <input class="sys-filter-val" data-rule-id="${esc(rule.id)}" data-prop="value"
            value="${esc(rule.value)}" placeholder="Value…" />
          <button class="sys-filter-remove" data-rule-id="${esc(rule.id)}" title="Remove filter">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="10" height="10"><path d="M1 1l10 10M11 1L1 11"/></svg>
          </button>
        </div>`).join("")}
      <div class="sys-filter-actions">
        <button class="sys-action-btn" id="sysAddFilterRule">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M7 2v10M2 7h10"/></svg>
          Add Rule
        </button>
        ${st.filterRules.length ? `<button class="sys-action-btn" id="sysClearFilters">Clear All</button>` : ""}
      </div>
    </div>`;
  }

  function renderTable(records, entity) {
    const fields = (entity?.fields || []).slice(0, 6);
    const allChecked = records.length > 0 && records.every(r => st.selectedIds.has(r.id));
    const someChecked = st.selectedIds.size > 0;
    const activeFilters = st.filterRules.filter(r => r.field && r.value !== "");
    return `<div class="sys-widget sys-table-widget">
      <div class="sys-table-toolbar">
        <div class="sys-table-toolbar-left">
          <span class="sys-widget-title">${esc(entity?.name || "Records")}</span>
          <span class="sys-record-count">${records.length} record${records.length !== 1 ? "s" : ""}</span>
          ${someChecked ? `<span class="sys-bulk-badge">${st.selectedIds.size} selected</span>` : ""}
        </div>
        <div class="sys-table-toolbar-right">
          ${someChecked ? `
            <button class="sys-action-btn danger" id="sysBulkDeleteBtn">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12"><path d="M2 4h10M5 4V2.5h4V4M3 4l.7 7.3a.7.7 0 0 0 .7.7h5.2a.7.7 0 0 0 .7-.7L11 4"/></svg>
              Delete ${st.selectedIds.size}
            </button>` : ""}
          <button class="sys-action-btn ${st.filterPanelOpen || activeFilters.length ? "active" : ""}" id="sysFilterBtn">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" width="13" height="13"><path d="M2 4h12M4 8h8M6 12h4"/></svg>
            Filters${activeFilters.length ? ` <span class="sys-filter-badge">${activeFilters.length}</span>` : ""}
          </button>
          <button class="sys-action-btn" id="sysImportBtn">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" width="13" height="13"><path d="M8 11V3M5 8l3 4 3-4"/><path d="M3 13h10"/></svg>
            Import
          </button>
          <div class="sys-export-wrap">
            <button type="button" class="sys-action-btn" id="sysExportBtn">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" width="13" height="13"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 13h10"/></svg>
              Export
            </button>
            <div class="sys-export-menu" id="sysExportMenu" style="display:none">
              <button type="button" class="sys-export-item" id="sysExportCsvBtn">Export CSV (this entity)</button>
              <button type="button" class="sys-export-item" id="sysExportAllCsvBtn">Export all entities (CSV)</button>
              <button type="button" class="sys-export-item" id="sysExportJsonBtn">Backup full system (JSON)</button>
            </div>
          </div>
          <button class="sys-action-btn primary" id="sysAddRecordBtn2">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M8 3v10M3 8h10"/></svg>
            Add Record
          </button>
        </div>
      </div>
      ${st.filterPanelOpen ? renderFilterPanel(entity) : ""}
      <div class="sys-table-wrap"><table class="sys-table">
        <thead><tr>
          <th class="sys-th-check"><input type="checkbox" id="sysSelectAll" ${allChecked ? "checked" : ""} title="Select all"/></th>
          ${fields.map(f => `<th data-sort-field="${esc(f.id)}"><span class="sys-th-inner">${esc(f.label)}${sortIcon(f)}</span></th>`).join("")}
          <th class="sys-th-actions">Actions</th>
        </tr></thead>
        <tbody>${records.length ? records.map(r => `<tr data-record-id="${esc(r.id)}" class="${r.id === st.selectedRecordId ? "selected" : ""}${st.selectedIds.has(r.id) ? " bulk-selected" : ""}">
          <td class="sys-td-check"><input type="checkbox" class="sys-row-check" data-record-id="${esc(r.id)}" ${st.selectedIds.has(r.id) ? "checked" : ""}/></td>
          ${fields.map(f => `<td>${formatCell(r[f.id], f)}</td>`).join("")}
          <td class="sys-td-actions">
            <button class="sys-row-btn" data-action="edit" data-record-id="${esc(r.id)}" title="Edit">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
            </button>
            <button class="sys-row-btn danger" data-action="delete" data-record-id="${esc(r.id)}" title="Delete">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12"><path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5 6v4M9 6v4M3 4l.7 7.3a.7.7 0 0 0 .7.7h5.2a.7.7 0 0 0 .7-.7L11 4"/></svg>
            </button>
          </td>
        </tr>`).join("") : `<tr><td colspan="${fields.length + 2}" class="sys-empty-row">No records match the current filters</td></tr>`}</tbody>
      </table></div>
    </div>`;
  }

  function renderSideWidgets(records, entity, selected, spec) {
    const numField = entity?.fields?.find(f => f.type === "number");
    const chartRows = records.slice(0, 6);
    const max = Math.max(...chartRows.map(r => Number(r[numField?.id]) || 1), 1);
    const barColors = ["#6366f1","#a70d2a","#f59e0b","#3b82f6","#ec4899","#14b8a6"];
    return `<div class="sys-side-col">
      <div class="sys-widget">
        <div class="sys-widget-head">
          <div class="sys-widget-head-left">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><path d="M3 13V3M3 13h10"/><path d="M5.5 10V7M8 10V4M10.5 10V6"/></svg>
            <span class="sys-widget-title">Performance</span>
          </div>
          <span class="sys-badge">Live</span>
        </div>
        <div class="sys-widget-body"><div class="sys-bars">
          ${chartRows.map((r, idx) => {
            const label = r.name || r.ingredient_name || Object.values(r).find(v => typeof v === "string") || `Item ${idx + 1}`;
            const value = Number(r[numField?.id]) || (idx + 1) * 10;
            const pct = Math.max(6, Math.round((value / max) * 100));
            return `<div class="sys-bar-row">
              <span class="sys-bar-label">${esc(String(label)).slice(0, 16)}</span>
              <div class="sys-bar-track"><div class="sys-bar-fill" style="width:${pct}%;background:${barColors[idx % barColors.length]}"></div></div>
              <span class="sys-bar-val">${esc(formatValue(value))}</span>
            </div>`;
          }).join("")}
        </div></div>
      </div>

      <div class="sys-widget">
        <div class="sys-widget-head">
          <div class="sys-widget-head-left">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8h6M5 5h6M5 11h3"/></svg>
            <span class="sys-widget-title">Record Detail</span>
          </div>
          ${selected ? `<button class="sys-mini-btn" data-action="edit" data-record-id="${esc(selected.id)}">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
            Edit
          </button>` : ""}
        </div>
        <div class="sys-widget-body">
          ${selected
            ? `<div class="sys-detail-list">${(entity.fields || []).slice(0, 7).map(f => `
              <div class="sys-detail-row">
                <span class="sys-detail-label">${esc(f.label)}</span>
                <span class="sys-detail-val">${formatCell(selected[f.id], f)}</span>
              </div>`).join("")}</div>`
            : `<div class="sys-empty-hint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M9 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                <span>Select a row to inspect</span>
              </div>`}
        </div>
      </div>

      ${(spec.workflows || []).length ? `<div class="sys-widget">
        <div class="sys-widget-head">
          <div class="sys-widget-head-left">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><circle cx="3.5" cy="4" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="12.5" cy="8" r="1.5"/><path d="M5 4h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5M11 8H5"/></svg>
            <span class="sys-widget-title">Workflows</span>
          </div>
        </div>
        <div class="sys-widget-body">
          <div class="sys-activity">${(spec.workflows || []).slice(0, 4).map((w, i) => `
            <div class="sys-activity-item">
              <div class="sys-activity-dot" style="background:${barColors[i % barColors.length]}"></div>
              <div class="sys-activity-content">
                <span class="sys-activity-name">${esc(w.name)}</span>
                <span class="sys-activity-stages">${esc((w.stages || []).join(" → "))}</span>
              </div>
              <button class="sys-mini-btn" data-action="run-workflow" data-workflow="${esc(w.name)}">
                <svg viewBox="0 0 12 12" fill="currentColor" width="9" height="9"><polygon points="2,1 10,6 2,11"/></svg>
                Run
              </button>
            </div>`).join("")}
          </div>
        </div>
      </div>` : ""}
    </div>`;
  }

  // ── Alternate screen layouts ──────────────────────────────────────

  function renderListOnly(records, entity) {
    return `<div class="sys-list-wrap">${renderTable(records, entity)}</div>`;
  }

  function renderKanban(records, entity, spec) {
    const statusField = entity?.fields?.find(f => f.id === "status" || f.type === "select");
    const nameField = entity?.fields?.find(f => f.type === "text") || entity?.fields?.[0];
    const numField = entity?.fields?.find(f => f.type === "number");
    const colColors = ["#6366f1","#f59e0b","#a70d2a","#3b82f6","#ec4899","#8b5cf6"];

    const columns = statusField?.options?.length
      ? statusField.options
      : [...new Set(records.map(r => String(r[statusField?.id] || "Other")))];

    return `<div class="sys-kanban">
      <div class="sys-kanban-toolbar">
        <span class="sys-widget-title">${esc(entity?.name || "Board")}</span>
        <button class="sys-action-btn primary" id="sysAddRecordBtn2">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M8 3v10M3 8h10"/></svg>
          Add Card
        </button>
      </div>
      <div class="sys-kanban-board">
        ${columns.map((col, ci) => {
          const colRecords = records.filter(r => String(r[statusField?.id] || "Other") === col);
          return `<div class="sys-kanban-col">
            <div class="sys-kanban-col-head" style="border-top-color:${colColors[ci % colColors.length]}">
              <span class="sys-kanban-col-name">${esc(col)}</span>
              <span class="sys-kanban-col-count">${colRecords.length}</span>
            </div>
            <div class="sys-kanban-cards">
              ${colRecords.map(r => `
                <div class="sys-kanban-card" data-record-id="${esc(r.id)}">
                  <div class="sys-kanban-card-name">${esc(String(r[nameField?.id] || r.name || r.id || ""))}</div>
                  ${numField ? `<div class="sys-kanban-card-meta">${esc(numField.label)}: <b>${esc(formatValue(r[numField.id]))}</b></div>` : ""}
                  ${entity?.fields?.filter(f => f.id !== nameField?.id && f.id !== statusField?.id && f.id !== numField?.id).slice(0, 2).map(f => `<div class="sys-kanban-card-meta">${esc(f.label)}: ${esc(formatCell(r[f.id], f))}</div>`).join("")}
                  <div class="sys-kanban-card-actions">
                    <button class="sys-row-btn" data-action="edit" data-record-id="${esc(r.id)}" title="Edit">
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
                    </button>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  }

  function renderReport(records, entity, spec, module) {
    const fields = entity?.fields || [];
    const numField = fields.find(f => f.type === "number");
    const statusField = fields.find(f => f.id === "status" || f.type === "select");
    const barColors = ["#6366f1","#a70d2a","#f59e0b","#3b82f6","#ec4899","#14b8a6","#8b5cf6","#f97316"];

    const chartRows = records.slice(0, 8);
    const max = Math.max(...chartRows.map(r => Number(r[numField?.id]) || 1), 1);

    const breakdown = statusField ? (() => {
      const groups = {};
      records.forEach(r => { const k = String(r[statusField.id] || "Other"); groups[k] = (groups[k] || 0) + 1; });
      return Object.entries(groups).map(([k, v], i) => ({ label: k, count: v, pct: Math.round((v / records.length) * 100), color: barColors[i % barColors.length] }));
    })() : [];

    return `
      ${renderKpis(records, entity, module)}
      <div class="sys-report-grid">
        <div class="sys-widget sys-report-chart">
          <div class="sys-widget-head">
            <div class="sys-widget-head-left">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><path d="M3 13V3M3 13h10"/><path d="M5.5 10V7M8 10V4M10.5 10V6"/></svg>
              <span class="sys-widget-title">${numField ? esc(numField.label) + " by Record" : "Record Distribution"}</span>
            </div>
            <span class="sys-badge">Chart</span>
          </div>
          <div class="sys-widget-body"><div class="sys-bars sys-bars--report">
            ${chartRows.map((r, idx) => {
              const label = String(r.name || r.ingredient_name || Object.values(r).find(v => typeof v === "string") || `Item ${idx + 1}`);
              const value = Number(r[numField?.id]) || (idx + 1) * 10;
              const pct = Math.max(6, Math.round((value / max) * 100));
              return `<div class="sys-bar-row">
                <span class="sys-bar-label">${esc(label.slice(0, 20))}</span>
                <div class="sys-bar-track"><div class="sys-bar-fill" style="width:${pct}%;background:${barColors[idx % barColors.length]}"></div></div>
                <span class="sys-bar-val">${esc(formatValue(value))}</span>
              </div>`;
            }).join("")}
          </div></div>
        </div>
        ${breakdown.length ? `<div class="sys-widget sys-report-breakdown">
          <div class="sys-widget-head">
            <div class="sys-widget-head-left">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5V8l3.5 3.5"/></svg>
              <span class="sys-widget-title">By ${esc(statusField?.label || "Status")}</span>
            </div>
          </div>
          <div class="sys-widget-body">
            ${breakdown.map(b => `<div class="sys-breakdown-row">
              <div class="sys-breakdown-dot" style="background:${b.color}"></div>
              <span class="sys-breakdown-label">${esc(b.label)}</span>
              <div class="sys-breakdown-bar-wrap"><div class="sys-breakdown-bar" style="width:${b.pct}%;background:${b.color}22;border-left:3px solid ${b.color}"></div></div>
              <span class="sys-breakdown-val">${b.count}</span>
            </div>`).join("")}
          </div>
        </div>` : ""}
      </div>
    `;
  }

  function renderSplit(records, entity, selected, spec) {
    const fields = (entity?.fields || []).slice(0, 5);
    return `<div class="sys-split-view">
      <div class="sys-split-table sys-widget">
        <div class="sys-table-toolbar">
          <div class="sys-table-toolbar-left">
            <span class="sys-widget-title">${esc(entity?.name || "Records")}</span>
            <span class="sys-record-count">${records.length} record${records.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="sys-table-toolbar-right">
            <button class="sys-action-btn primary" id="sysAddRecordBtn2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M8 3v10M3 8h10"/></svg>
              Add
            </button>
          </div>
        </div>
        <div class="sys-table-wrap"><table class="sys-table">
          <thead><tr>
            ${fields.map(f => `<th data-sort-field="${esc(f.id)}"><span class="sys-th-inner">${esc(f.label)}${sortIcon(f)}</span></th>`).join("")}
          </tr></thead>
          <tbody>${records.map(r => `<tr data-record-id="${esc(r.id)}" class="${r.id === st.selectedRecordId ? "selected" : ""}">
            ${fields.map(f => `<td>${formatCell(r[f.id], f)}</td>`).join("")}
          </tr>`).join("")}</tbody>
        </table></div>
      </div>
      <div class="sys-split-detail sys-widget">
        <div class="sys-widget-head">
          <div class="sys-widget-head-left">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8h6M5 5h6M5 11h3"/></svg>
            <span class="sys-widget-title">${selected ? esc(String(selected.name || selected.id || "Selected Record")) : "Record Detail"}</span>
          </div>
          ${selected ? `<button class="sys-mini-btn" data-action="edit" data-record-id="${esc(selected.id)}">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
            Edit
          </button>` : ""}
        </div>
        <div class="sys-widget-body">
          ${selected
            ? `<div class="sys-detail-list sys-detail-list--rich">${(entity?.fields || []).map(f => `
              <div class="sys-detail-row">
                <span class="sys-detail-label">${esc(f.label)}</span>
                <span class="sys-detail-val">${formatCell(selected[f.id], f)}</span>
              </div>`).join("")}</div>`
            : `<div class="sys-empty-hint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M9 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                <span>Select a row to inspect</span>
              </div>`}
        </div>
      </div>
    </div>`;
  }

  // ── Cards screen ─────────────────────────────────────────────────
  function renderCards(records, entity) {
    const fields = entity?.fields || [];
    const nameField = fields.find(f => f.type === "text" && /name|title|item|product|guest|client|subject/i.test(f.id)) || fields[0];
    const statusField = fields.find(f => f.id === "status" || f.type === "select");
    const numField = fields.find(f => f.type === "number");
    const dateField = fields.find(f => f.type === "date");
    const secondaryFields = fields.filter(f => f !== nameField && f !== statusField && f !== numField && f !== dateField).slice(0, 3);
    const palette = ["#6366f1","#a70d2a","#f59e0b","#3b82f6","#ec4899","#14b8a6","#8b5cf6","#f97316","#06b6d4","#84cc16"];

    const initials = (val) => {
      const w = String(val || "?").trim().split(/\s+/);
      return (w[0]?.[0] || "") + (w[1]?.[0] || "");
    };

    return `<div class="sys-cards-screen">
      <div class="sys-cards-toolbar">
        <span class="sys-widget-title">${esc(entity?.name || "Records")}</span>
        <span class="sys-record-count">${records.length} record${records.length !== 1 ? "s" : ""}</span>
        <button class="sys-action-btn primary" id="sysAddRecordBtn2">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M8 3v10M3 8h10"/></svg>
          Add
        </button>
      </div>
      <div class="sys-cards-grid">
        ${records.map((r, idx) => {
          const color = palette[idx % palette.length];
          const name = String(r[nameField?.id] || r.name || r.id || "");
          const status = statusField ? String(r[statusField.id] || "") : "";
          return `<div class="sys-card" data-record-id="${esc(r.id)}">
            <div class="sys-card-accent" style="background:${color}"></div>
            <div class="sys-card-body">
              <div class="sys-card-top">
                <div class="sys-card-avatar" style="background:${color}18;color:${color}">${esc(initials(name).toUpperCase())}</div>
                <div class="sys-card-header">
                  <div class="sys-card-name">${esc(name)}</div>
                  ${status ? `<span class="sys-pill" data-status="${esc(status.toLowerCase())}">${esc(status)}</span>` : ""}
                </div>
                <button class="sys-card-edit sys-row-btn" data-action="edit" data-record-id="${esc(r.id)}" title="Edit">
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
                </button>
              </div>
              <div class="sys-card-fields">
                ${numField ? `<div class="sys-card-stat"><span class="sys-card-stat-val" style="color:${color}">${esc(formatValue(r[numField.id]))}</span><span class="sys-card-stat-label">${esc(numField.label)}</span></div>` : ""}
                ${dateField ? `<div class="sys-card-field"><span class="sys-card-field-label">${esc(dateField.label)}</span><span>${esc(String(r[dateField.id] || "—"))}</span></div>` : ""}
                ${secondaryFields.map(f => `<div class="sys-card-field"><span class="sys-card-field-label">${esc(f.label)}</span><span>${esc(formatCell(r[f.id], f))}</span></div>`).join("")}
              </div>
            </div>
          </div>`;
        }).join("")}
        ${records.length === 0 ? `<div class="sys-empty-hint" style="grid-column:1/-1"><span>No records yet. Add one to get started.</span></div>` : ""}
      </div>
    </div>`;
  }

  // ── Timeline screen ───────────────────────────────────────────────
  function renderTimeline(records, entity) {
    const fields = entity?.fields || [];
    const dateField = fields.find(f => f.type === "date");
    const nameField = fields.find(f => f.type === "text") || fields[0];
    const statusField = fields.find(f => f.id === "status" || f.type === "select");
    const descField = fields.find(f => f.type === "textarea" || /note|comment|description|detail/i.test(f.id));
    const extraFields = fields.filter(f => f !== nameField && f !== dateField && f !== statusField && f !== descField).slice(0, 3);
    const statusColors = { active:"#a70d2a", completed:"#6366f1", done:"#6366f1", paid:"#a70d2a", closed:"#94a3b8", pending:"#f59e0b", preparing:"#f97316", cancelled:"#ef4444", "in progress":"#3b82f6", approved:"#a70d2a", rejected:"#ef4444" };
    const getStatusColor = (s) => statusColors[String(s || "").toLowerCase()] || "#6366f1";

    const sorted = [...records].sort((a, b) => String(b[dateField?.id] || "").localeCompare(String(a[dateField?.id] || "")));

    return `<div class="sys-timeline-screen">
      <div class="sys-timeline-toolbar">
        <span class="sys-widget-title">${esc(entity?.name || "Timeline")}</span>
        <span class="sys-record-count">${records.length} event${records.length !== 1 ? "s" : ""}</span>
        <button class="sys-action-btn primary" id="sysAddRecordBtn2">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M8 3v10M3 8h10"/></svg>
          Add Event
        </button>
      </div>
      <div class="sys-timeline">
        ${sorted.map((r, idx) => {
          const status = String(r[statusField?.id] || "");
          const color = getStatusColor(status);
          const name = String(r[nameField?.id] || r.name || "Event");
          const date = String(r[dateField?.id] || "");
          const desc = descField ? String(r[descField.id] || "") : "";
          return `<div class="sys-tl-item" data-record-id="${esc(r.id)}">
            <div class="sys-tl-left">
              <span class="sys-tl-date">${esc(date)}</span>
            </div>
            <div class="sys-tl-spine">
              <div class="sys-tl-dot" style="background:${color};box-shadow:0 0 0 4px ${color}22"></div>
              ${idx < sorted.length - 1 ? `<div class="sys-tl-line"></div>` : ""}
            </div>
            <div class="sys-tl-card" style="border-left-color:${color}">
              <div class="sys-tl-card-head">
                <span class="sys-tl-name">${esc(name)}</span>
                ${status ? `<span class="sys-pill" data-status="${esc(status.toLowerCase())}">${esc(status)}</span>` : ""}
                <button class="sys-row-btn" data-action="edit" data-record-id="${esc(r.id)}" title="Edit" style="margin-left:auto">
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
                </button>
              </div>
              ${desc ? `<p class="sys-tl-desc">${esc(desc)}</p>` : ""}
              <div class="sys-tl-meta">
                ${extraFields.map(f => `<span class="sys-tl-meta-item"><b>${esc(f.label)}:</b> ${esc(formatCell(r[f.id], f))}</span>`).join("")}
              </div>
            </div>
          </div>`;
        }).join("")}
        ${sorted.length === 0 ? `<div class="sys-empty-hint"><span>No events yet.</span></div>` : ""}
      </div>
    </div>`;
  }

  // ── Calendar screen ───────────────────────────────────────────────
  function renderCalendar(records, entity) {
    const fields = entity?.fields || [];
    const dateField = fields.find(f => f.type === "date");
    const nameField = fields.find(f => f.type === "text") || fields[0];
    const statusField = fields.find(f => f.id === "status" || f.type === "select");
    const statusColors = ["#6366f1","#a70d2a","#f59e0b","#3b82f6","#ec4899","#14b8a6","#8b5cf6","#f97316"];

    // find most populated month from data, fallback to current month
    const allDates = records.map(r => String(r[dateField?.id] || "")).filter(d => /^\d{4}-\d{2}/.test(d));
    const monthCounts = {};
    allDates.forEach(d => { const m = d.slice(0,7); monthCounts[m] = (monthCounts[m]||0)+1; });
    const pivot = Object.keys(monthCounts).sort((a,b) => monthCounts[b]-monthCounts[a])[0] || new Date().toISOString().slice(0,7);
    const [yr, mo] = pivot.split("-").map(Number);
    const firstDay = new Date(yr, mo - 1, 1).getDay();
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const monthName = new Date(yr, mo - 1).toLocaleString("default", { month:"long" });
    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    const byDay = {};
    records.forEach((r, i) => {
      const d = String(r[dateField?.id] || "");
      if (d.startsWith(pivot)) {
        const day = parseInt(d.slice(8,10));
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push({ r, color: statusColors[i % statusColors.length] });
      }
    });

    const now = new Date();
    const todayD = now.getDate(), todayMo = now.getMonth() + 1, todayYr = now.getFullYear();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(`<div class="sys-cal-cell sys-cal-cell--empty"></div>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const today = todayD === d && todayMo === mo && todayYr === yr;
      const dayRecords = byDay[d] || [];
      cells.push(`<div class="sys-cal-cell${today ? " sys-cal-cell--today" : ""}">
        <span class="sys-cal-day-num${today ? " today" : ""}">${d}</span>
        <div class="sys-cal-chips">
          ${dayRecords.slice(0, 3).map(({r, color}) => {
            const name = String(r[nameField?.id] || r.name || "Event");
            return `<div class="sys-cal-chip" style="background:${color}22;border-left:3px solid ${color}" data-record-id="${esc(r.id)}" title="${esc(name)}">${esc(name.slice(0,16))}</div>`;
          }).join("")}
          ${dayRecords.length > 3 ? `<div class="sys-cal-chip-more">+${dayRecords.length - 3} more</div>` : ""}
        </div>
      </div>`);
    }

    return `<div class="sys-calendar-screen">
      <div class="sys-calendar-toolbar">
        <span class="sys-widget-title">${esc(entity?.name || "Calendar")}</span>
        <span class="sys-cal-month-label">${esc(monthName)} ${yr}</span>
        <button class="sys-action-btn primary" id="sysAddRecordBtn2">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M8 3v10M3 8h10"/></svg>
          Add
        </button>
      </div>
      <div class="sys-calendar">
        <div class="sys-cal-header">
          ${dayNames.map(d => `<div class="sys-cal-day-name">${d}</div>`).join("")}
        </div>
        <div class="sys-cal-grid">
          ${cells.join("")}
        </div>
      </div>
    </div>`;
  }

  // ── Metric screen ─────────────────────────────────────────────────
  function renderMetric(records, entity, module, spec) {
    const fields = entity?.fields || [];
    const numFields = fields.filter(f => f.type === "number").slice(0, 4);
    const statusField = fields.find(f => f.id === "status" || f.type === "select");
    const accent = spec?.theme?.accent || "#a70d2a";
    const primary = spec?.theme?.primary || "#2563eb";
    const tileColors = [primary, accent, "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6"];

    const kpiDefs = module?.kpis?.length ? module.kpis : numFields.map(f => ({ label: f.label, field: f.id, aggregate: "sum" }));

    const computeKpi = (def) => {
      if (!def) return 0;
      const { field, aggregate } = def;
      if (aggregate === "count" || !field) return records.length;
      const vals = records.map(r => Number(r[field]) || 0);
      if (aggregate === "sum") return vals.reduce((a,b) => a+b, 0);
      if (aggregate === "avg") return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
      if (aggregate === "max") return Math.max(...vals, 0);
      return records.length;
    };

    // status breakdown donut-style
    const breakdown = statusField ? (() => {
      const groups = {};
      records.forEach(r => { const k = String(r[statusField.id] || "Other"); groups[k] = (groups[k]||0)+1; });
      return Object.entries(groups).sort((a,b) => b[1]-a[1]).slice(0,6);
    })() : [];

    // mini sparkline from num data
    const sparkSvg = (field, color) => {
      const vals = records.slice(-12).map(r => Number(r[field]) || 0);
      if (vals.length < 2) return "";
      const mx = Math.max(...vals, 1);
      const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 80},${20 - (v / mx) * 18}`).join(" ");
      return `<svg viewBox="0 0 80 20" width="80" height="20" class="sys-metric-spark"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    };

    const tiles = kpiDefs.slice(0, 6).map((def, idx) => {
      const val = computeKpi(def);
      const color = tileColors[idx % tileColors.length];
      const formatted = def.aggregate === "sum" || def.aggregate === "avg" ? formatValue(val) : val.toLocaleString();
      return `<div class="sys-metric-tile" style="--tile-color:${color}">
        <div class="sys-metric-label">${esc(def.label)}</div>
        <div class="sys-metric-value" style="color:var(--tile-color)">${esc(formatted)}</div>
        ${numFields[idx] ? sparkSvg(numFields[idx]?.id || def.field, color) : ""}
        <div class="sys-metric-sub">${records.length} record${records.length !== 1 ? "s" : ""}</div>
      </div>`;
    });

    if (tiles.length < 3) {
      tiles.push(`<div class="sys-metric-tile sys-metric-tile--total" style="--tile-color:${accent}">
        <div class="sys-metric-label">Total Records</div>
        <div class="sys-metric-value" style="color:var(--tile-color)">${records.length}</div>
        <div class="sys-metric-sub">${entity?.name || "entries"}</div>
      </div>`);
    }

    return `<div class="sys-metric-screen">
      <div class="sys-metric-header">
        <span class="sys-widget-title">${esc(entity?.name || "Metrics")} Overview</span>
        <button class="sys-action-btn" id="sysAddRecordBtn2">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M8 3v10M3 8h10"/></svg>
          Add Record
        </button>
      </div>
      <div class="sys-metric-grid">${tiles.join("")}</div>
      ${breakdown.length ? `<div class="sys-metric-breakdown">
        <div class="sys-metric-breakdown-title">Breakdown by ${esc(statusField?.label || "Status")}</div>
        <div class="sys-metric-breakdown-bars">
          ${breakdown.map(([label, count], i) => {
            const pct = Math.round((count / records.length) * 100);
            const color = tileColors[i % tileColors.length];
            return `<div class="sys-metric-brow">
              <span class="sys-metric-brow-label">${esc(label)}</span>
              <div class="sys-metric-brow-track"><div class="sys-metric-brow-fill" style="width:${pct}%;background:${color}"></div></div>
              <span class="sys-metric-brow-pct">${pct}%</span>
              <span class="sys-metric-brow-count">${count}</span>
            </div>`;
          }).join("")}
        </div>
      </div>` : ""}
    </div>`;
  }

  // ── Feed screen ───────────────────────────────────────────────────
  function renderFeed(records, entity) {
    const fields = entity?.fields || [];
    const nameField = fields.find(f => f.type === "text" && /name|title|subject|from|sender/i.test(f.id)) || fields.find(f => f.type === "text") || fields[0];
    const statusField = fields.find(f => f.id === "status" || f.type === "select");
    const dateField = fields.find(f => f.type === "date");
    const bodyField = fields.find(f => f.type === "textarea" || /note|body|desc|message|detail|comment/i.test(f.id));
    const metaFields = fields.filter(f => f !== nameField && f !== statusField && f !== dateField && f !== bodyField).slice(0, 2);
    const avatarColors = ["#6366f1","#a70d2a","#f59e0b","#3b82f6","#ec4899","#14b8a6","#8b5cf6","#f97316","#06b6d4","#84cc16"];

    const sorted = [...records].sort((a,b) => String(b[dateField?.id] || "").localeCompare(String(a[dateField?.id] || "")));

    const initials = (val) => {
      const w = String(val || "?").trim().split(/\s+/);
      return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase() || "?";
    };

    return `<div class="sys-feed-screen">
      <div class="sys-feed-toolbar">
        <span class="sys-widget-title">${esc(entity?.name || "Feed")}</span>
        <span class="sys-record-count">${records.length} item${records.length !== 1 ? "s" : ""}</span>
        <button class="sys-action-btn primary" id="sysAddRecordBtn2">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M8 3v10M3 8h10"/></svg>
          New
        </button>
      </div>
      <div class="sys-feed">
        ${sorted.map((r, idx) => {
          const name = String(r[nameField?.id] || r.name || "Entry");
          const status = statusField ? String(r[statusField.id] || "") : "";
          const date = dateField ? String(r[dateField.id] || "") : "";
          const body = bodyField ? String(r[bodyField.id] || "") : "";
          const color = avatarColors[idx % avatarColors.length];
          return `<div class="sys-feed-item" data-record-id="${esc(r.id)}">
            <div class="sys-feed-avatar" style="background:${color}18;color:${color}">${esc(initials(name))}</div>
            <div class="sys-feed-content">
              <div class="sys-feed-row">
                <span class="sys-feed-name">${esc(name)}</span>
                ${status ? `<span class="sys-pill" data-status="${esc(status.toLowerCase())}">${esc(status)}</span>` : ""}
                <span class="sys-feed-date">${esc(date)}</span>
                <button class="sys-row-btn" data-action="edit" data-record-id="${esc(r.id)}" title="Edit" style="margin-left:auto">
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/></svg>
                </button>
              </div>
              ${body ? `<p class="sys-feed-body">${esc(body)}</p>` : ""}
              ${metaFields.length ? `<div class="sys-feed-meta">${metaFields.map(f => `<span class="sys-feed-meta-item"><b>${esc(f.label)}:</b> ${esc(formatCell(r[f.id], f))}</span>`).join("")}</div>` : ""}
            </div>
          </div>`;
        }).join("")}
        ${sorted.length === 0 ? `<div class="sys-empty-hint"><span>Nothing in the feed yet.</span></div>` : ""}
      </div>
    </div>`;
  }

  // ── Record Modal ──────────────────────────────────────────────────

  function showRecordModal(record, entity, isNew) {
    if (!entity) return;
    st.recordModalIsNew = isNew;
    $("sysRecordModalTitle").textContent = isNew ? `Add ${entity.name}` : `Edit ${entity.name}`;
    $("sysRecordModalForm").innerHTML = renderRecordFormModal(record || {}, entity);
    $("sysRecordModal").classList.add("open");
    setTimeout(() => $("sysRecordModalForm")?.querySelector("input,select,textarea")?.focus(), 60);
  }

  function closeRecordModal() {
    $("sysRecordModal")?.classList.remove("open");
  }

  function renderRecordFormModal(record, entity) {
    return (entity.fields || []).map(f => {
      const value = record[f.id] ?? "";
      const req = f.required ? `required` : "";
      const star = f.required ? `<span class="sys-required">*</span>` : "";
      if (f.type === "select") {
        const opts = f.options || [];
        return `<div class="sys-form-group">
          <label class="sys-form-label">${esc(f.label)}${star}</label>
          <select class="sys-form-input" data-sys-field="${esc(f.id)}" ${req}>
            ${opts.map(o => `<option value="${esc(o)}" ${String(value) === String(o) ? "selected" : ""}>${esc(o)}</option>`).join("")}
          </select>
        </div>`;
      }
      if (f.type === "textarea") {
        return `<div class="sys-form-group sys-form-group--full">
          <label class="sys-form-label">${esc(f.label)}${star}</label>
          <textarea class="sys-form-input" data-sys-field="${esc(f.id)}" rows="3" ${req}>${esc(value)}</textarea>
        </div>`;
      }
      const inputType = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
      return `<div class="sys-form-group">
        <label class="sys-form-label">${esc(f.label)}${star}</label>
        <input class="sys-form-input" data-sys-field="${esc(f.id)}" type="${inputType}" value="${esc(value)}" ${req} />
      </div>`;
    }).join("");
  }

  function saveRecordFromModal() {
    const spec = getActive();
    const entity = spec?.entities?.[st.activeEntityId];
    if (!spec || !entity) return;
    const inputs = $("sysRecordModalForm").querySelectorAll("[data-sys-field]");
    let valid = true;
    inputs.forEach(inp => {
      const field = entity.fields.find(f => f.id === inp.dataset.sysField);
      if (field?.required && !inp.value.trim()) { inp.classList.add("input-error"); valid = false; }
      else inp.classList.remove("input-error");
    });
    if (!valid) return;
    const data = getRuntimeData(spec);
    data[st.activeEntityId] = data[st.activeEntityId] || [];
    if (st.recordModalIsNew) {
      const rec = { id: `${st.activeEntityId}_${Date.now().toString(36)}` };
      inputs.forEach(inp => {
        const field = entity.fields.find(f => f.id === inp.dataset.sysField);
        rec[inp.dataset.sysField] = field?.type === "number" ? Number(inp.value || 0) : inp.value;
      });
      data[st.activeEntityId].unshift(rec);
      st.selectedRecordId = rec.id;
      trace(`Added record to ${entity.name}`, "ok");
    } else {
      const rec = data[st.activeEntityId].find(r => r.id === st.selectedRecordId);
      if (!rec) { closeRecordModal(); return; }
      inputs.forEach(inp => {
        const field = entity.fields.find(f => f.id === inp.dataset.sysField);
        rec[inp.dataset.sysField] = field?.type === "number" ? Number(inp.value || 0) : inp.value;
      });
      trace(`Saved ${entity.name} record`, "ok");
    }
    saveRuntimeData(spec, data);
    closeRecordModal();
    renderPreview();
    renderDataEditor();
  }

  // ── CSV Import ────────────────────────────────────────────────────

  function showImportModal(entity) {
    if (!entity) return;
    st.importState = null;
    $("sysImportTitle").textContent = `Import CSV → ${entity.name}`;
    $("sysImportBody").innerHTML = renderImportDropZone();
    $("sysImportConfirm").disabled = true;
    $("sysImportCount").textContent = "";
    $("sysImportModal").classList.add("open");
    const fileInput = $("sysImportFile");
    if (fileInput) {
      fileInput.onchange = e => handleImportFile(e.target.files[0], entity);
    }
    const zone = $("sysDropZone");
    if (zone) {
      zone.ondragover = e => { e.preventDefault(); zone.classList.add("drag-over"); };
      zone.ondragleave = () => zone.classList.remove("drag-over");
      zone.ondrop = e => { e.preventDefault(); zone.classList.remove("drag-over"); handleImportFile(e.dataTransfer.files[0], entity); };
    }
  }

  function renderImportDropZone() {
    return `<div class="sys-drop-zone" id="sysDropZone">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44" style="opacity:.5">
        <path d="M24 32V16M14 24l10-10 10 10"/>
        <rect x="6" y="36" width="36" height="6" rx="3"/>
      </svg>
      <p class="sys-drop-title">Drop a CSV file here</p>
      <p class="sys-drop-sub">or <label class="sys-file-link" for="sysImportFile">browse files</label></p>
      <p class="sys-drop-hint">First row must be column headers · UTF-8 · comma-separated</p>
      <input type="file" id="sysImportFile" accept=".csv,.txt" />
    </div>`;
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    const parseRow = line => {
      const out = []; let cur = ""; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === ',' && !q) { out.push(cur.trim()); cur = ""; }
        else cur += c;
      }
      out.push(cur.trim());
      return out;
    };
    return { headers: parseRow(lines[0]), rows: lines.slice(1).filter(l => l.trim()).map(parseRow) };
  }

  function handleImportFile(file, entity) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const { headers, rows } = parseCSV(e.target.result);
      if (!headers.length) { $("sysImportBody").innerHTML = `<p class="sys-import-error">Could not parse file — check it's a valid CSV with headers.</p>`; return; }
      const fields = entity?.fields || [];
      const autoMap = {};
      headers.forEach((h, i) => {
        const match = fields.find(f =>
          f.id === slug(h) || f.label.toLowerCase() === h.toLowerCase() ||
          f.id === h.toLowerCase().replace(/\s+/g,"_")
        );
        if (match) autoMap[i] = match.id;
      });
      st.importState = { headers, rows, mappings: autoMap };
      $("sysImportBody").innerHTML = renderImportMapping(entity);
      $("sysImportConfirm").disabled = false;
      $("sysImportCount").textContent = `${rows.length} row${rows.length !== 1 ? "s" : ""} ready`;
      $("sysImportBody").querySelectorAll("select[data-col-idx]").forEach(sel => {
        sel.onchange = () => { st.importState.mappings[Number(sel.dataset.colIdx)] = sel.value || undefined; };
      });
    };
    reader.readAsText(file);
  }

  function renderImportMapping(entity) {
    const { headers, rows } = st.importState;
    const fields = entity?.fields || [];
    return `<div class="sys-import-mapping">
      <div class="sys-import-info">
        <span class="sys-badge">${rows.length} rows</span>
        <span class="sys-badge">${headers.length} columns</span>
        <span class="sys-badge sys-badge--green">Auto-matched ${Object.keys(st.importState.mappings).length} fields</span>
      </div>
      <div class="sys-import-table-wrap">
        <table class="sys-import-table">
          <thead><tr><th>CSV Column</th><th>Maps To Field</th><th>Preview (first 3 rows)</th></tr></thead>
          <tbody>
            ${headers.map((h, i) => `<tr>
              <td class="sys-import-col-name">${esc(h)}</td>
              <td>
                <select class="sys-form-input sys-form-input--sm" data-col-idx="${i}">
                  <option value="">— Skip —</option>
                  ${fields.map(f => `<option value="${esc(f.id)}" ${st.importState.mappings[i] === f.id ? "selected" : ""}>${esc(f.label)}</option>`).join("")}
                </select>
              </td>
              <td class="sys-import-preview">${rows.slice(0,3).map(r => `<span>${esc(r[i] || "")}</span>`).join("")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function confirmImport() {
    const spec = getActive();
    const entity = spec?.entities?.[st.activeEntityId];
    if (!spec || !entity || !st.importState) return;
    const { rows } = st.importState;
    const data = getRuntimeData(spec);
    data[st.activeEntityId] = data[st.activeEntityId] || [];
    const imported = rows.map(row => {
      const rec = { id: `${st.activeEntityId}_imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,5)}` };
      Object.entries(st.importState.mappings).forEach(([colIdx, fieldId]) => {
        if (!fieldId) return;
        const field = entity.fields.find(f => f.id === fieldId);
        const val = row[Number(colIdx)] || "";
        rec[fieldId] = field?.type === "number" ? (Number(val) || 0) : val;
      });
      return rec;
    });
    data[st.activeEntityId] = [...imported, ...data[st.activeEntityId]];
    saveRuntimeData(spec, data);
    closeImportModal();
    renderPreview();
    renderDataEditor();
    trace(`Imported ${imported.length} records into ${entity.name}`, "ok");
  }

  function closeImportModal() {
    $("sysImportModal")?.classList.remove("open");
    st.importState = null;
  }

  // ── Export ────────────────────────────────────────────────────────

  function exportCSV(spec, entityId) {
    const entity = spec?.entities?.[entityId];
    const data = getRuntimeData(spec);
    const rows = data[entityId] || [];
    const fields = entity?.fields || [];
    const header = fields.map(f => `"${f.label}"`).join(",");
    const body = rows.map(r => fields.map(f => {
      const v = String(r[f.id] ?? "").replace(/"/g, '""');
      return `"${v}"`;
    }).join(",")).join("\n");
    const csv = header + "\n" + body;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${slug(entity?.name || "export")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    trace(`Exported ${entity?.name} as CSV`, "ok");
  }

  function exportAllEntitiesCSV(spec) {
    const data = getRuntimeData(spec);
    Object.values(spec.entities || {}).forEach(entity => {
      const rows = data[entity.id] || [];
      const fields = entity.fields || [];
      const header = fields.map(f => `"${f.label}"`).join(",");
      const body = rows.map(r => fields.map(f => `"${String(r[f.id] ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([header + "\n" + body], { type: "text/csv" }));
      a.download = `${slug(spec.name)}_${slug(entity.name)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    });
    trace(`Exported all entities as CSV`, "ok");
  }

  function exportJSON(spec) {
    const data = getRuntimeData(spec);
    const backup = {
      name: spec.name, description: spec.description,
      exportedAt: new Date().toISOString(),
      theme: spec.theme, layout: spec.layout,
      entities: Object.fromEntries(Object.entries(spec.entities || {}).map(([id, e]) => [
        id, { name: e.name, fields: e.fields, records: data[id] || [] }
      ])),
      workflows: spec.workflows || [],
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    a.download = `${slug(spec.name || "erp-backup")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    trace(`Exported full system backup as JSON`, "ok");
  }

  // ─────────────────────────────────────────────────────────────────

  function formatValue(v) {
    if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) {
      const n = Number(v);
      return n >= 1000 ? n.toLocaleString() : String(n);
    }
    return String(v ?? "");
  }

  function formatCell(v, field) {
    const value = formatValue(v);
    if (field?.type === "select" || /status|stage|priority/i.test(field?.id || "")) {
      const statusKey = String(value).toLowerCase();
      return `<span class="sys-pill" data-status="${esc(statusKey)}">${esc(value)}</span>`;
    }
    if (field?.type === "number" || /amount|total|price|cost|revenue|salary/i.test(field?.id || "")) {
      const n = Number(v);
      if (!isNaN(n) && n > 0) return `<span class="sys-num">${Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>`;
    }
    return esc(value);
  }

  function renderDataEditor() {
    const spec = getActive();
    const el = $("sysDataEditor");
    if (!el) return;
    if (!spec) {
      el.innerHTML = `<div class="sys-card-meta">Create a system to edit its mock data.</div>`;
      return;
    }
    const data = getRuntimeData(spec);
    const entityIds = Object.keys(spec.entities || {});
    if (!st.activeEntityId || !spec.entities[st.activeEntityId]) st.activeEntityId = entityIds[0] || "";
    const entity = spec.entities[st.activeEntityId];
    const rows = data[st.activeEntityId] || [];
    if (!st.selectedRecordId || !rows.some(r => r.id === st.selectedRecordId)) st.selectedRecordId = rows[0]?.id || "";
    const record = rows.find(r => r.id === st.selectedRecordId) || null;

    el.innerHTML = `
      <label>Entity</label>
      <select id="sysEntitySelect">${entityIds.map(id => `<option value="${esc(id)}" ${id === st.activeEntityId ? "selected" : ""}>${esc(spec.entities[id].name)}</option>`).join("")}</select>
      <label>Record</label>
      <select id="sysRecordSelect">${rows.map(r => `<option value="${esc(r.id)}" ${r.id === st.selectedRecordId ? "selected" : ""}>${esc(recordLabel(r, entity))}</option>`).join("")}</select>
      <div class="sys-record-actions">
        <button class="sys-small-btn" id="sysAddRecordBtn">New Record</button>
        <button class="sys-small-btn danger" id="sysDeleteRecordBtn">Delete</button>
      </div>
      <div id="sysRecordForm">${record ? renderRecordForm(record, entity) : `<div class="sys-card-meta" style="margin-top:12px">No records yet.</div>`}</div>
      <div class="sys-form-actions">
        <button class="sys-small-btn" id="sysSaveRecordBtn">Save Changes</button>
      </div>
    `;
  }

  function recordLabel(record, entity) {
    const nameField = entity.fields.find(f => /name|title|customer|item/i.test(f.id)) || entity.fields[0];
    return record?.[nameField?.id] || record?.id || "Record";
  }

  function renderRecordForm(record, entity) {
    return (entity.fields || []).map(f => {
      const value = record[f.id] ?? "";
      if (f.type === "select") {
        const opts = f.options || ["New","In Progress","Approved","Closed"];
        return `<label>${esc(f.label)}</label><select data-sys-field="${esc(f.id)}">${opts.map(o => `<option value="${esc(o)}" ${String(value) === String(o) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      }
      if (f.type === "textarea") return `<label>${esc(f.label)}</label><textarea data-sys-field="${esc(f.id)}">${esc(value)}</textarea>`;
      return `<label>${esc(f.label)}</label><input data-sys-field="${esc(f.id)}" type="${f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}" value="${esc(value)}" />`;
    }).join("");
  }

  function selectSystem(id) {
    st.activeId = id;
    const spec = getActive();
    st.activeModuleId = spec?.modules?.[0]?.id || "";
    st.activeEntityId = spec?.modules?.[0]?.entity || "";
    st.selectedRecordId = "";
    st.searchQuery = "";
    st.sortState = { field:"", dir:"asc" };
    st.filterRules = []; st.filterPanelOpen = false; st.selectedIds.clear();
    renderAll();
  }

  function restoreVersion(idx) {
    const spec = getActive();
    const snap = spec?.revisionHistory?.[idx];
    if (!spec || !snap?.spec) return;
    const current = snapshot(spec, "Before restore");
    const restored = normalizeSpec({ ...structuredCloneSafe(snap.spec), id: spec.id, revisionHistory: [current, ...(spec.revisionHistory || [])].slice(0, MAX_HISTORY) }, "restore", spec);
    st.systems[st.systems.findIndex(s => s.id === spec.id)] = restored;
    saveSystems();
    renderAll();
    trace("Version restored", "ok");
  }

  function addRecord() {
    const spec = getActive();
    const entity = spec?.entities?.[st.activeEntityId];
    if (!spec || !entity) return;
    const data = getRuntimeData(spec);
    data[st.activeEntityId] = data[st.activeEntityId] || [];
    const rec = normalizeRecord({ id:`${st.activeEntityId}_${Date.now().toString(36)}` }, entity, data[st.activeEntityId].length);
    data[st.activeEntityId].unshift(rec);
    st.selectedRecordId = rec.id;
    saveRuntimeData(spec, data);
    renderPreview();
    renderDataEditor();
  }

  function deleteRecord() {
    const spec = getActive();
    if (!spec || !st.activeEntityId || !st.selectedRecordId) return;
    const data = getRuntimeData(spec);
    data[st.activeEntityId] = (data[st.activeEntityId] || []).filter(r => r.id !== st.selectedRecordId);
    st.selectedRecordId = data[st.activeEntityId][0]?.id || "";
    saveRuntimeData(spec, data);
    renderPreview();
    renderDataEditor();
  }

  function saveRecord() {
    const spec = getActive();
    const entity = spec?.entities?.[st.activeEntityId];
    if (!spec || !entity || !st.selectedRecordId) return;
    const data = getRuntimeData(spec);
    const rows = data[st.activeEntityId] || [];
    const rec = rows.find(r => r.id === st.selectedRecordId);
    if (!rec) return;
    document.querySelectorAll("[data-sys-field]").forEach(input => {
      const field = entity.fields.find(f => f.id === input.dataset.sysField);
      rec[input.dataset.sysField] = field?.type === "number" ? Number(input.value || 0) : input.value;
    });
    saveRuntimeData(spec, data);
    renderPreview();
    renderDataEditor();
    trace("Mock data saved locally", "ok");
  }

  function syncModelSelect() {
    const src = $("model");
    const dst = $("sysModelSelect");
    if (src && dst) {
      dst.innerHTML = src.innerHTML;
      dst.value = src.value;
    }
  }

  return {
    renderAll, renderSystemList, renderVersionList, renderPreview, renderDataEditor,
    renderKanban, renderReport, renderSplit, renderCards, renderTimeline, renderCalendar, renderMetric, renderFeed,
    renderListOnly, renderTable, renderKpis, renderFilterPanel, renderSideWidgets,
    showRecordModal, closeRecordModal, renderRecordFormModal, saveRecordFromModal,
    showImportModal, renderImportDropZone, renderImportMapping, confirmImport, closeImportModal,
    renderRecordForm, selectSystem, restoreVersion, syncModelSelect,
  };
}
