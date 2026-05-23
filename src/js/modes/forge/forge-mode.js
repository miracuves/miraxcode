import { AGENTS } from './constants.js';
import { createForgeAgentsRoutingApi } from './agents-routing.js';
import { createForgeProjectsApi } from './projects.js';
import { createForgeViewportApi } from './viewport.js';
import { createForgePromptsApi } from './prompts.js';
import { createForgePlansSamplesApi } from './plans-samples.js';
import { createForgeAgentsRunApi } from './agents-run.js';
import { createForgeWireApi } from './wire.js';

(function () {
  "use strict";

  const FORGE_PROVIDER_COOLDOWNS = new Map();
  let mounted = false;
  let initialized = false;
  let THREE = null;
  let OrbitControls = null;
  let TransformControls = null;
  let GLTFLoader = null;
  let GLTFExporter = null;
  let STLExporter = null;
  let OBJExporter = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let modelGroup = null;
  let particleGroup = null;
  let starField = null;
  let activePlan = null;
  let raf = 0;
  let flights = [];
  let revealMeshes = [];
  let logoMeshes = [];
  let logoBobT = 0;
  let scanMesh = null;
  let abortCtrl = null;
  let eventsWired = false;
  let traceStartTime = Date.now();
  let traceRunCount = 0;
  let raycaster = null;
  let pointer = null;
  let transformControls = null;
  let selectedMesh = null;
  let selectedObjectWhole = null;
  let selectionBox = null;
  let transformMode = "translate";
  let snapEnabled = false;
  let underfloorTick = 0;
  let forgeProjects = [];
  let activeProjectId = null;
  let projectSaveTimer = 0;
  let activeReferenceBrief = "";
  let activeForgeRoute = "parametric";

  const $ = (id) => document.getElementById(id);

  const st = {
    get mounted() { return mounted; }, set mounted(v) { mounted = v; },
    get initialized() { return initialized; }, set initialized(v) { initialized = v; },
    get THREE() { return THREE; }, set THREE(v) { THREE = v; },
    get OrbitControls() { return OrbitControls; }, set OrbitControls(v) { OrbitControls = v; },
    get TransformControls() { return TransformControls; }, set TransformControls(v) { TransformControls = v; },
    get GLTFLoader() { return GLTFLoader; }, set GLTFLoader(v) { GLTFLoader = v; },
    get GLTFExporter() { return GLTFExporter; }, set GLTFExporter(v) { GLTFExporter = v; },
    get STLExporter() { return STLExporter; }, set STLExporter(v) { STLExporter = v; },
    get OBJExporter() { return OBJExporter; }, set OBJExporter(v) { OBJExporter = v; },
    get renderer() { return renderer; }, set renderer(v) { renderer = v; },
    get scene() { return scene; }, set scene(v) { scene = v; },
    get camera() { return camera; }, set camera(v) { camera = v; },
    get controls() { return controls; }, set controls(v) { controls = v; },
    get modelGroup() { return modelGroup; }, set modelGroup(v) { modelGroup = v; },
    get particleGroup() { return particleGroup; }, set particleGroup(v) { particleGroup = v; },
    get starField() { return starField; }, set starField(v) { starField = v; },
    get activePlan() { return activePlan; }, set activePlan(v) { activePlan = v; },
    get raf() { return raf; }, set raf(v) { raf = v; },
    get flights() { return flights; }, set flights(v) { flights = v; },
    get revealMeshes() { return revealMeshes; }, set revealMeshes(v) { revealMeshes = v; },
    get logoMeshes() { return logoMeshes; }, set logoMeshes(v) { logoMeshes = v; },
    get logoBobT() { return logoBobT; }, set logoBobT(v) { logoBobT = v; },
    get scanMesh() { return scanMesh; }, set scanMesh(v) { scanMesh = v; },
    get abortCtrl() { return abortCtrl; }, set abortCtrl(v) { abortCtrl = v; },
    get eventsWired() { return eventsWired; }, set eventsWired(v) { eventsWired = v; },
    get traceStartTime() { return traceStartTime; }, set traceStartTime(v) { traceStartTime = v; },
    get traceRunCount() { return traceRunCount; }, set traceRunCount(v) { traceRunCount = v; },
    get raycaster() { return raycaster; }, set raycaster(v) { raycaster = v; },
    get pointer() { return pointer; }, set pointer(v) { pointer = v; },
    get transformControls() { return transformControls; }, set transformControls(v) { transformControls = v; },
    get selectedMesh() { return selectedMesh; }, set selectedMesh(v) { selectedMesh = v; },
    get selectedObjectWhole() { return selectedObjectWhole; }, set selectedObjectWhole(v) { selectedObjectWhole = v; },
    get selectionBox() { return selectionBox; }, set selectionBox(v) { selectionBox = v; },
    get transformMode() { return transformMode; }, set transformMode(v) { transformMode = v; },
    get snapEnabled() { return snapEnabled; }, set snapEnabled(v) { snapEnabled = v; },
    get underfloorTick() { return underfloorTick; }, set underfloorTick(v) { underfloorTick = v; },
    get forgeProjects() { return forgeProjects; }, set forgeProjects(v) { forgeProjects = v; },
    get activeProjectId() { return activeProjectId; }, set activeProjectId(v) { activeProjectId = v; },
    get projectSaveTimer() { return projectSaveTimer; }, set projectSaveTimer(v) { projectSaveTimer = v; },
    get activeReferenceBrief() { return activeReferenceBrief; }, set activeReferenceBrief(v) { activeReferenceBrief = v; },
    get activeForgeRoute() { return activeForgeRoute; }, set activeForgeRoute(v) { activeForgeRoute = v; },
  };

  function forgePrefs() {
    const style = $("frgStyle")?.value || "realistic";
    const detail = $("frgDetail")?.value || "balanced";
    const output = $("frgOutputTarget")?.value || "glb";
    return { style, detail, output };
  }

  function updateStage(stage, state, text) {
    document.querySelectorAll("[data-frg-stage]").forEach((el) => {
      const isTarget = el.dataset.frgStage === stage;
      if (isTarget) {
        el.classList.toggle("active", state !== "done");
        el.classList.toggle("done", state === "done");
        const label = el.querySelector("span");
        if (label) label.textContent = text || state || "waiting";
      } else if (state === "active") {
        el.classList.remove("active");
      }
    });
  }

  function resetStages() {
    ["input", "generate", "refine", "export"].forEach((stage, i) => {
      const el = document.querySelector(`[data-frg-stage="${stage}"]`);
      if (!el) return;
      el.classList.toggle("active", i === 0);
      el.classList.remove("done");
      const label = el.querySelector("span");
      if (label) label.textContent = i === 0 ? "prompt ready" : "waiting";
    });
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function setStatus(text) {
    const el = $("frgStatus");
    if (el) el.textContent = text || "Idle";
  }

  function traceKind(kind) {
    if (kind === "err") return "error";
    if (kind === "ok") return "done";
    if (kind === "boss" || kind === "run" || kind === "wait" || kind === "warn") return "running";
    return "";
  }

  function log(label, message, kind, tokens) {
    const host = $("frgTraceEntries");
    if (!host) return;
    const statusCls = kind || "wait";
    const elapsed = ((Date.now() - traceStartTime) / 1000).toFixed(1);
    const line = document.createElement("div");
    line.className = "frg-trace-entry";
    line.innerHTML =
      `<span class="trace-time">[${elapsed}s]</span>` +
      `<span class="trace-agent trace-${statusCls}">${escapeHtml(label)}</span>` +
      `<span class="trace-msg trace-${statusCls}">${escapeHtml(message)}</span>` +
      (tokens ? `<span class="trace-tokens">${escapeHtml(String(tokens))}</span>` : "");
    host.appendChild(line);
    host.scrollTop = host.scrollHeight;
    const summary = $("frgTraceSummary");
    if (summary) summary.textContent = `${label}: ${message}`;
    const dot = $("frgTraceDot");
    if (dot) dot.className = "frg-trace-dot " + traceKind(statusCls);
  }

  function setAgentState(id, state) {
    const el = document.querySelector(`[data-frg-agent="${id}"] .frg-agent-state`);
    if (el) el.textContent = state;
  }

  function renderAgents() {
    const host = $("frgAgents");
    if (!host) return;
    const options = modelOptionsHtml();
    host.innerHTML = AGENTS.map((agent) => `
      <div class="frg-agent" data-frg-agent="${agent.id}">
        <span class="frg-agent-dot" style="color:${agent.color};background:${agent.color}"></span>
        <span>
          <span class="frg-agent-name">${escapeHtml(agent.name)}</span>
          <span class="frg-agent-role">${escapeHtml(agent.role)}</span>
        </span>
        <span class="frg-agent-state">idle</span>
        <select class="frg-agent-model" id="frgModel_${agent.id}" title="${escapeHtml(agent.name)} model">
          ${options}
        </select>
      </div>
    `).join("");
  }

  function modelOptionsHtml() {
    const src = document.getElementById("model");
    const current = src?.value || "";
    const sourceOptions = Array.from(src?.options || []);
    if (!sourceOptions.length) return `<option value="">Main model</option>`;
    return [
      `<option value="">Main model (${escapeHtml(src.options[src.selectedIndex]?.textContent || current || "selected")})</option>`,
      ...sourceOptions.map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.textContent || opt.value)}</option>`),
    ].join("");
  }

  function syncModelSelectors() {
    const old = {};
    AGENTS.forEach((agent) => {
      old[agent.id] = $(`frgModel_${agent.id}`)?.value || "";
    });
    renderAgents();
    AGENTS.forEach((agent) => {
      const sel = $(`frgModel_${agent.id}`);
      if (sel && old[agent.id] && Array.from(sel.options).some((o) => o.value === old[agent.id])) {
        sel.value = old[agent.id];
      }
    });
  }

  let agentsRoutingApi;
  function agentsRouting() {
    if (!agentsRoutingApi) {
      agentsRoutingApi = createForgeAgentsRoutingApi({ $, log, cooldowns: FORGE_PROVIDER_COOLDOWNS });
    }
    return agentsRoutingApi;
  }
  const isFreeModel = (...a) => agentsRouting().isFreeModel(...a);
  const modelSizeScore = (...a) => agentsRouting().modelSizeScore(...a);
  const modelStrengthScore = (...a) => agentsRouting().modelStrengthScore(...a);
  const bestModelForProvider = (...a) => agentsRouting().bestModelForProvider(...a);
  const providerFromValue = (...a) => agentsRouting().providerFromValue(...a);
  const providerDisplayName = (...a) => agentsRouting().providerDisplayName(...a);
  const forgeProviderCooldown = (...a) => agentsRouting().forgeProviderCooldown(...a);
  const isForgeRoutingError = (...a) => agentsRouting().isForgeRoutingError(...a);
  const cooldownMsForForgeError = (...a) => agentsRouting().cooldownMsForForgeError(...a);
  const markForgeProviderFailure = (...a) => agentsRouting().markForgeProviderFailure(...a);
  const skipCoolingCandidate = (...a) => agentsRouting().skipCoolingCandidate(...a);
  const providerModelsForForge = (...a) => agentsRouting().providerModelsForForge(...a);
  const autoAssignForgeModels = (...a) => agentsRouting().autoAssignForgeModels(...a);

  function selectedModelFor(agentId) {
    return $(`frgModel_${agentId}`)?.value || window._H?.selectedModel?.() || document.getElementById("model")?.value || "";
  }

  function modelLabel(value) {
    if (!value) return "main model";
    const opt = Array.from(document.getElementById("model")?.options || []).find((o) => o.value === value);
    return (opt?.textContent || value).replace(/\s+/g, " ").slice(0, 42);
  }

  function updatePlanList(plan) {
    const host = $("frgPlanList");
    if (!host) return;
    const nodes = renderableNodes(plan?.nodes || []);
    host.innerHTML = nodes.length ? nodes.map((node) => `
      <div class="frg-plan-item${selectedMesh?.userData?.nodeId === node.id ? " selected" : ""}" data-node-id="${escapeHtml(node.id || "")}">
        <b>${escapeHtml(node.name || node.id || node.type)}</b>
        <span>${escapeHtml(node.role || "structure")} · ${escapeHtml(node.type || "box")}</span>
      </div>
    `).join("") : `<div class="frg-plan-item"><b>No mesh yet</b><span>Awaiting Parameter Agent</span></div>`;
    $("frgPlanName").textContent = plan?.name || "Void ready";
    $("frgNodeCount").textContent = `${nodes.length} mesh part${nodes.length === 1 ? "" : "s"}`;
  }

  function renderableNodes(nodes) {
    return (Array.isArray(nodes) ? nodes : []).filter((node) => node && node.role !== "audit");
  }

  let projectsApi, viewportApi, promptsApi, plansApi, agentsApi, wireApi;

  function forgeBaseCtx() {
    return {
      $, st, escapeHtml, setStatus, log, traceKind, forgePrefs, updateStage, resetStages,
      setAgentState, renderAgents, selectedModelFor, modelLabel, updatePlanList, renderableNodes,
      syncModelSelectors, AGENTS, autoAssignForgeModels,
    };
  }

  function initProjectsApi() {
    if (projectsApi) return projectsApi;
    projectsApi = createForgeProjectsApi({
      ...forgeBaseCtx(),
      buildPlan: (...a) => initViewportApi().buildPlan(...a),
      renderAgents,
      restoreModelRoutes: (...a) => initProjectsApi().restoreModelRoutes(...a),
      clearScene: (...a) => initViewportApi().clearScene(...a),
    });
    return projectsApi;
  }

  function initPromptsApi() {
    if (promptsApi) return promptsApi;
    promptsApi = createForgePromptsApi();
    return promptsApi;
  }

  function initPlansApi() {
    if (plansApi) return plansApi;
    plansApi = createForgePlansSamplesApi({ classifyForgePrompt: (...a) => initPromptsApi().classifyForgePrompt(...a) });
    return plansApi;
  }

  function initViewportApi() {
    if (viewportApi) return viewportApi;
    viewportApi = createForgeViewportApi({
      ...forgeBaseCtx(),
      queueProjectSave: (...a) => initProjectsApi().queueProjectSave(...a),
    });
    return viewportApi;
  }

  function initAgentsApi() {
    if (agentsApi) return agentsApi;
    const P = () => initPromptsApi();
    const S = () => initPlansApi();
    const V = () => initViewportApi();
    const Pr = () => initProjectsApi();
    agentsApi = createForgeAgentsRunApi({
      ...forgeBaseCtx(),
      agentsRouting,
      clearScene: (...a) => V().clearScene(...a),
      initThree: (...a) => V().initThree(...a),
      buildPlan: (...a) => V().buildPlan(...a),
      queueProjectSave: (...a) => Pr().queueProjectSave(...a),
      classifyForgePrompt: (...a) => P().classifyForgePrompt(...a),
      needsTemplateAuthority: (...a) => P().needsTemplateAuthority(...a),
      isKnifeLikePrompt: (...a) => P().isKnifeLikePrompt(...a),
      isSpoonLikePrompt: (...a) => P().isSpoonLikePrompt(...a),
      isSwordLikePrompt: (...a) => P().isSwordLikePrompt(...a),
      isDroneLikePrompt: (...a) => P().isDroneLikePrompt(...a),
      isPhonePrompt: (...a) => P().isPhonePrompt(...a),
      isLaptopPrompt: (...a) => P().isLaptopPrompt(...a),
      isSkeletonOnlyPrompt: (...a) => P().isSkeletonOnlyPrompt(...a),
      hLogoPlan: (...a) => S().hLogoPlan(...a),
      roverPlan: (...a) => S().roverPlan(...a),
      dronePlan: (...a) => S().dronePlan(...a),
      housePlan: (...a) => S().housePlan(...a),
      towerPlan: (...a) => S().towerPlan(...a),
      mechanismPlan: (...a) => S().mechanismPlan(...a),
    });
    return agentsApi;
  }

  function initWireApi() {
    if (wireApi) return wireApi;
    const V = () => initViewportApi();
    const A = () => initAgentsApi();
    const Pr = () => initProjectsApi();
    wireApi = createForgeWireApi({
      $, st,
      runGodAgent: (...a) => A().runGodAgent(...a),
      resetView: (...a) => V().resetView(...a),
      deleteSelectedPart: (...a) => V().deleteSelectedPart(...a),
      duplicateSelectedPart: (...a) => V().duplicateSelectedPart(...a),
      alignSelectedToFloor: (...a) => V().alignSelectedToFloor(...a),
      resetSelectedPart: (...a) => V().resetSelectedPart(...a),
      setSnapEnabled: (...a) => V().setSnapEnabled(...a),
      setTransformMode: (...a) => V().setTransformMode(...a),
      selectWholeObject: (...a) => V().selectWholeObject(...a),
      focusCameraOnSelection: (...a) => V().focusCameraOnSelection(...a),
      panCameraVertical: (...a) => V().panCameraVertical(...a),
      exportForgeAsset: (...a) => V().exportForgeAsset(...a),
      importForgeAsset: (...a) => V().importForgeAsset(...a),
      selectNodeById: (...a) => V().selectNodeById(...a),
      selectMesh: (...a) => V().selectMesh(...a),
      updateSelectedPosition: (...a) => V().updateSelectedPosition(...a),
      updateSelectedScale: (...a) => V().updateSelectedScale(...a),
      updateSelectedRotation: (...a) => V().updateSelectedRotation(...a),
      autoAssignForgeModels,
      newForgeProject: (...a) => Pr().newForgeProject(...a),
      saveCurrentProject: (...a) => Pr().saveCurrentProject(...a),
      openForgeProject: (...a) => Pr().openForgeProject(...a),
      deleteForgeProject: (...a) => Pr().deleteForgeProject(...a),
      loadForgeProjects: (...a) => Pr().loadForgeProjects(...a),
      syncModelSelectors,
      renderForgeProjects: (...a) => Pr().renderForgeProjects(...a),
      updatePlanList,
      initThree: (...a) => V().initThree(...a),
      buildPlan: (...a) => V().buildPlan(...a),
      renderAgents,
      hLogoPlan: (...a) => initPlansApi().hLogoPlan(...a),
    });
    return wireApi;
  }

  const loadForgeProjects = () => initProjectsApi().loadForgeProjects();
  const buildPlan = (...a) => initViewportApi().buildPlan(...a);
  const mount = (...a) => initWireApi().mount(...a);
  const destroy = (...a) => initWireApi().destroy(...a);
  const wireEvents = () => initWireApi().wireEvents();


  function debugState() {
    return {
      nodeCount: activePlan?.nodes?.length || 0,
      underfloorCount: initViewportApi().selectableMeshes().filter((mesh) => mesh.userData?.underFloor).length,
      activeProjectId,
    };
  }

  window.ForgeMode = { mount, destroy, buildPlan, debugState };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      renderAgents();
      wireEvents();
    }, { once: true });
  } else {
    renderAgents();
    wireEvents();
  }
})();
