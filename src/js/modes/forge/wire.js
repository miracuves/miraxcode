/** Forge DOM event wiring + lifecycle (Wave 17). */

export function createForgeWireApi(ctx) {
  const {
    $, st, runGodAgent, resetView, deleteSelectedPart, duplicateSelectedPart, alignSelectedToFloor,
    resetSelectedPart, setSnapEnabled, setTransformMode, selectWholeObject, focusCameraOnSelection,
    panCameraVertical, exportForgeAsset, importForgeAsset, selectNodeById, selectMesh,
    updateSelectedPosition, updateSelectedScale, updateSelectedRotation, autoAssignForgeModels,
    newForgeProject, saveCurrentProject, openForgeProject, deleteForgeProject,
    loadForgeProjects, syncModelSelectors, renderForgeProjects, updatePlanList, initThree,
    buildPlan, renderAgents, wireEvents: _noop,
  } = ctx;

  function wireEvents() {
    if (st.eventsWired) return;
    st.eventsWired = true;
    $("frgGodBtn")?.addEventListener("click", () => runGodAgent(false));
    $("frgMockBtn")?.addEventListener("click", () => runGodAgent(true));
    $("frgBtnCode")?.addEventListener("click", () => window.ForgeEditor?.toggle?.());
    $("frgResetViewBtn")?.addEventListener("click", resetView);
    $("frgBackBtn")?.addEventListener("click", () => {
      const back = window._H?.state?._preForgeTab || "chats";
      window._H?.setTab?.(back === "forge" ? "chats" : back);
    });
    $("frgPrompt")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runGodAgent(false);
      }
    });
    $("frgTraceToggle")?.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const tc = $("frgTraceConsole");
      if (!tc) return;
      const open = !tc.classList.contains("expanded");
      tc.classList.toggle("expanded", open);
      tc.classList.toggle("collapsed", !open);
    });
    $("frgTraceClearBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const entries = $("frgTraceEntries");
      if (entries) entries.innerHTML = "";
      const summary = $("frgTraceSummary");
      if (summary) summary.textContent = "Trace cleared";
      const dot = $("frgTraceDot");
      if (dot) dot.className = "frg-trace-dot";
    });
    $("frgSelectionCard")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-frg-edit]");
      if (!btn) return;
      const action = btn.dataset.frgEdit;
      if (action === "delete") deleteSelectedPart();
      else if (action === "duplicate") duplicateSelectedPart();
      else if (action === "floor") alignSelectedToFloor();
      else if (action === "reset") resetSelectedPart();
      else if (action === "snap") setSnapEnabled(!st.snapEnabled);
      else setTransformMode(action);
    });
    $("frgSelectionCard")?.addEventListener("change", (e) => {
      const posAxis = e.target.dataset.frgPos;
      const scaleAxis = e.target.dataset.frgScale;
      const rotAxis = e.target.dataset.frgRot;
      if (posAxis) updateSelectedPosition(posAxis, e.target.value);
      if (scaleAxis) updateSelectedScale(scaleAxis, e.target.value);
      if (rotAxis) updateSelectedRotation(rotAxis, e.target.value);
    });
    $("frgCadToolbar")?.addEventListener("click", (e) => {
      const exportBtn = e.target.closest("[data-frg-export-kind]");
      if (exportBtn) {
        exportForgeAsset(exportBtn.dataset.frgExportKind);
        exportBtn.closest(".frg-export-wrap")?.classList.remove("open");
        return;
      }
      const btn = e.target.closest("[data-frg-tool]");
      if (!btn) return;
      const tool = btn.dataset.frgTool;
      if (tool === "selectObject") selectWholeObject();
      else if (tool === "delete") deleteSelectedPart();
      else if (tool === "duplicate") duplicateSelectedPart();
      else if (tool === "floor") alignSelectedToFloor();
      else if (tool === "snap") setSnapEnabled(!st.snapEnabled);
      else if (tool === "import") $("frgAssetImport")?.click();
      else if (tool === "focus") focusCameraOnSelection();
      else if (tool === "camUp") panCameraVertical(0.35);
      else if (tool === "camDown") panCameraVertical(-0.35);
      else if (tool === "exportMenu") btn.closest(".frg-export-wrap")?.classList.toggle("open");
      else setTransformMode(tool);
    });
    document.addEventListener("click", (e) => {
      const openExport = document.querySelector(".frg-export-wrap.open");
      if (openExport && !e.target.closest(".frg-export-wrap")) openExport.classList.remove("open");
    });
    $("frgAssetImport")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) importForgeAsset(file);
    });
    $("frgAutoRouteBtn")?.addEventListener("click", () => {
      st.traceStartTime = Date.now();
      const traceEntries = $("frgTraceEntries");
      if (traceEntries && !traceEntries.children.length) traceEntries.innerHTML = "";
      autoAssignForgeModels(($("frgPrompt")?.value || "").trim(), true);
    });
    $("frgNewProjectBtn")?.addEventListener("click", newForgeProject);
    $("frgSaveProjectBtn")?.addEventListener("click", () => saveCurrentProject(true));
    $("frgProjectsList")?.addEventListener("click", (e) => {
      const del = e.target.closest("[data-frg-project-delete]");
      if (del) {
        e.stopPropagation();
        deleteForgeProject(del.dataset.frgProjectDelete);
        return;
      }
      const item = e.target.closest("[data-frg-project]");
      if (item) openForgeProject(item.dataset.frgProject);
    });
    $("frgPlanList")?.addEventListener("click", (e) => {
      const item = e.target.closest("[data-node-id]");
      if (item) selectNodeById(item.dataset.nodeId);
    });
    window.addEventListener("keydown", (e) => {
      if (!document.body.classList.contains("forge-studio-mode")) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedPart();
      } else if (e.key.toLowerCase() === "a") {
        selectWholeObject();
      } else if (e.key.toLowerCase() === "w") {
        setTransformMode("translate");
      } else if (e.key.toLowerCase() === "r") {
        setTransformMode("rotate");
      } else if (e.key.toLowerCase() === "s") {
        setTransformMode("scale");
      } else if (e.key.toLowerCase() === "d") {
        duplicateSelectedPart();
      } else if (e.key === "Escape") {
        selectMesh(null);
      }
    });
    const mainModel = document.getElementById("model");
    if (mainModel) {
      new MutationObserver(syncModelSelectors).observe(mainModel, { childList: true, subtree: true });
    }
  }

  async function mount() {
    st.mounted = true;
    loadForgeProjects();
    syncModelSelectors();
    renderForgeProjects();
    updatePlanList(null);
    wireEvents();
    const ok = await initThree();
    if (ok && !st.activePlan) buildPlan(hLogoPlan());
  }

  function destroy() {
    st.mounted = false;
    if (st.abortCtrl) st.abortCtrl.abort();
    window.ForgeEditor?.destroy?.();
  }

  return { wireEvents, mount, destroy };
}
