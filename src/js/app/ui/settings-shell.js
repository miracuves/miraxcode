/**
 * Settings overlay shell: open/close, tab switching, usage refresh, compaction select.
 */

/**
 * @param {{ $: (id: string) => HTMLElement | null, saveSettings: () => void }} deps
 */
export function createCompactionSelectApi(deps) {
  const { $, saveSettings } = deps;
  const HC = () => window.HC;

  function populateCompactionModelSelect() {
    const sel = $("compactionModelSelect");
    const hint = $("compactionResolvedHint");
    const CC = HC()?.contextCompactor;
    if (!sel || !CC) return;

    const pref = CC.getCompactionPreference?.() || "auto";
    sel.innerHTML = "";

    const autoOpt = document.createElement("option");
    autoOpt.value = "auto";
    autoOpt.textContent = "Auto — best model from your API keys";
    sel.appendChild(autoOpt);

    const free = (CC.COMPACT_CANDIDATES || []).filter((c) => c.tier !== "licensed");
    const licensed = (CC.COMPACT_CANDIDATES || []).filter((c) => c.tier === "licensed");
    for (const [label, list] of [
      ["Free tier", free],
      ["MiniMax & GLM (your keys)", licensed],
    ]) {
      if (!list.length) continue;
      const g = document.createElement("optgroup");
      g.label = label;
      for (const c of list) {
        const opt = document.createElement("option");
        opt.value = c.value;
        const hasKey = CC.hasProviderKey?.(c.provider);
        opt.textContent = c.label + (hasKey ? "" : " — no key");
        opt.disabled = !hasKey;
        g.appendChild(opt);
      }
      sel.appendChild(g);
    }

    const canUse = (v) =>
      v === "auto" ||
      (CC.findCandidate?.(v) && CC.isProviderAvailable?.(CC.findCandidate(v).provider));
    sel.value = canUse(pref) ? pref : "auto";
    if (!canUse(pref) && pref !== "auto") CC.setCompactionPreference?.("auto");

    if (hint) hint.textContent = CC.getResolvedCompactionLabel?.() || "";
  }

  $("compactionModelSelect")?.addEventListener("change", () => {
    const v = $("compactionModelSelect")?.value || "auto";
    HC()?.contextCompactor?.setCompactionPreference?.(v);
    populateCompactionModelSelect();
    saveSettings();
  });

  window.addEventListener("hc-compaction-pref-changed", () => populateCompactionModelSelect());

  return { populateCompactionModelSelect };
}

/**
 * @param {object} deps
 */
export function createSettingsShellApi(deps) {
  const {
    $,
    settingsOverlay,
    saveSettings,
    HC = window.HC,
    getProviderKey,
    getAPI_PROVIDERS = () => [],
    updateCloudUsageChip,
    renderApisPane = () => {},
    showMcpPane = () => {},
    renderMemoryPane = () => {},
    terminalAlertOverlay = null,
    modelEl = null,
  } = deps;

  function openSettings() {
    activateSettingsTab(settingsOverlay.dataset.activeTab || "settings");
    settingsOverlay.classList.add("open");
    settingsOverlay.querySelector(".settings-pane:not([hidden])")?.scrollTo?.(0, 0);
  }

  function closeSettings() {
    settingsOverlay.classList.remove("open");
    HC?.providerUsage?.stopAutoRefresh?.();
    saveSettings();
  }

  $("openSettings")?.addEventListener("click", openSettings);
  $("closeSettings")?.addEventListener("click", closeSettings);
  $("closeSettingsFooter")?.addEventListener("click", closeSettings);
  $("settingsNotesToggle")?.addEventListener("click", () => {
    const notes = $("settingsNotes");
    if (!notes) return;
    const open = notes.style.display === "none";
    notes.style.display = open ? "" : "none";
    $("settingsNotesToggle")?.classList.toggle("active", open);
  });
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (terminalAlertOverlay?.classList.contains("open")) return;
    if (e.key === "Escape" && settingsOverlay.classList.contains("open")) closeSettings();
  });

  const stabSettings = $("stab-settings");
  const stabApis = $("stab-apis");
  const stabMcp = $("stab-mcp");
  const stabMemory = $("stab-memory");
  const stabAbout = $("stab-about");
  const settingsPane = $("settingsPane");
  const apisPane = $("apisPane");
  const mcpPane = $("mcpPane");
  const memoryPane = $("memoryPane");
  const aboutPane = $("aboutPane");

  function setSettingsPaneVisible(pane, visible) {
    if (!pane) return;
    pane.hidden = !visible;
    pane.style.display = visible ? "" : "none";
    pane.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function activateSettingsTab(which) {
    const tabs = {
      settings: { tab: stabSettings, pane: settingsPane, title: "Settings" },
      apis: {
        tab: stabApis,
        pane: apisPane,
        title: "APIs",
        onShow: renderApisPane,
        onHide: () => HC?.providerUsage?.stopAutoRefresh?.(),
      },
      mcp: { tab: stabMcp, pane: mcpPane, title: "MCP Servers", onShow: showMcpPane },
      memory: { tab: stabMemory, pane: memoryPane, title: "Memory", onShow: renderMemoryPane },
      about: { tab: stabAbout, pane: aboutPane, title: "About" },
    };
    const activeKey = tabs[which]?.tab && tabs[which]?.pane ? which : "settings";
    Object.entries(tabs).forEach(([key, cfg]) => {
      const active = key === activeKey;
      cfg.tab?.classList.toggle("active", active);
      setSettingsPaneVisible(cfg.pane, active);
    });
    settingsOverlay.dataset.activeTab = activeKey;
    $("settingsTitle").textContent = tabs[activeKey]?.title || "Settings";
    const prev = settingsOverlay.dataset.prevTab;
    if (prev && prev !== activeKey) tabs[prev]?.onHide?.();
    settingsOverlay.dataset.prevTab = activeKey;
    tabs[activeKey]?.onShow?.();
  }

  stabSettings?.addEventListener("click", () => activateSettingsTab("settings"));
  stabApis?.addEventListener("click", () => activateSettingsTab("apis"));
  stabMcp?.addEventListener("click", () => activateSettingsTab("mcp"));
  stabMemory?.addEventListener("click", () => activateSettingsTab("memory"));
  stabAbout?.addEventListener("click", () => activateSettingsTab("about"));
  activateSettingsTab("settings");

  $("apiUsageRefreshAll")?.addEventListener("click", async () => {
    const btn = $("apiUsageRefreshAll");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Refreshing…";
    }
    if (HC?.providerUsage) {
      await HC.providerUsage.refreshAllPanels(getProviderKey);
      for (const p of getAPI_PROVIDERS()) {
        const key = getProviderKey(p.id);
        if (key) await HC.providerUsage.syncProvider(p.id, key);
      }
      document.querySelectorAll(".api-usage-panel").forEach((panel) => {
        if (panel._provider) HC.providerUsage.renderPanel(panel, panel._provider);
      });
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Refresh all usage";
    }
    updateCloudUsageChip();
  });

  window.addEventListener(HC?.providerUsage?.EVENT_NAME || "hc-usage-updated", () => {
    document.querySelectorAll(".api-usage-panel").forEach((panel) => {
      const id = panel._provider || panel.dataset?.provider;
      if (id && HC?.providerUsage) HC.providerUsage.renderPanel(panel, id);
    });
    updateCloudUsageChip();
  });
  modelEl?.addEventListener("change", updateCloudUsageChip);

  return {
    openSettings,
    closeSettings,
    activateSettingsTab,
    setSettingsPaneVisible,
  };
}
