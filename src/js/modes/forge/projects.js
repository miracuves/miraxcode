/** Forge project persistence (Wave 17). */
import { PROJECT_STORE_KEY } from './constants.js';
import { normalizePlan } from './plan.js';

export function createForgeProjectsApi(ctx) {
  const {
    $, st, escapeHtml, setStatus, log, updatePlanList, buildPlan, renderAgents,
    clearScene, AGENTS, modelLabel,
  } = ctx;

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  function loadForgeProjects() {
    try {
      const raw = localStorage.getItem(PROJECT_STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      st.forgeProjects = Array.isArray(parsed) ? parsed.filter((p) => p && Array.isArray(p.plan?.nodes)) : [];
    } catch {
      st.forgeProjects = [];
    }
  }

  function persistForgeProjects() {
    try { localStorage.setItem(PROJECT_STORE_KEY, JSON.stringify(st.forgeProjects.slice(0, 40))); } catch {}
  }

  function projectNameFromPrompt(prompt, plan) {
    const src = String(prompt || plan?.name || "Forge Project").trim().replace(/\s+/g, " ");
    return src.split(" ").slice(0, 4).join(" ") || "Forge Project";
  }

  function currentModelRoutes() {
    return AGENTS.map((agent) => ({
      id: agent.id,
      value: $(`frgModel_${agent.id}`)?.value || "",
      label: modelLabel($(`frgModel_${agent.id}`)?.value || ""),
    }));
  }

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

  function restoreModelRoutes(routes) {
    if (!Array.isArray(routes)) return;
    routes.forEach((route) => {
      const sel = $(`frgModel_${route.id}`);
      if (sel && Array.from(sel.options).some((o) => o.value === route.value)) sel.value = route.value || "";
    });
  }

  function renderForgeProjects() {
    const host = $("frgProjectsList");
    if (!host) return;
    if (!st.forgeProjects.length) {
      host.innerHTML = `<div class="frg-project-empty">Saved Forge projects will appear here.</div>`;
      return;
    }
    host.innerHTML = st.forgeProjects.map((project) => `
      <div class="frg-project-card${project.id === st.activeProjectId ? " active" : ""}" data-frg-project="${escapeHtml(project.id)}">
        <div class="frg-project-name">${escapeHtml(project.name || "Forge Project")}</div>
        <div class="frg-project-meta">${escapeHtml(project.route || project.plan?.route || "parametric")} · ${escapeHtml((project.plan?.nodes?.length || 0) + " mesh parts")} · ${escapeHtml(new Date(project.updatedAt || project.createdAt || Date.now()).toLocaleDateString())}</div>
        <div class="frg-project-prompt">${escapeHtml(project.prompt || project.plan?.name || "")}</div>
        <button class="frg-project-delete" data-frg-project-delete="${escapeHtml(project.id)}" title="Delete project">×</button>
      </div>
    `).join("");
  }

  function saveCurrentProject(manual) {
    if (!st.activePlan?.nodes?.length) {
      if (manual) log("Projects", "No Forge object to save yet", "warn");
      return null;
    }
    const now = Date.now();
    const prompt = ($("frgPrompt")?.value || st.activePlan.name || "").trim();
    let project = st.forgeProjects.find((p) => p.id === st.activeProjectId);
    if (!project) {
      project = {
        id: "forge_" + now.toString(36),
        name: projectNameFromPrompt(prompt, st.activePlan),
        createdAt: now,
      };
      st.forgeProjects.unshift(project);
      st.activeProjectId = project.id;
    }
    project.updatedAt = now;
    project.prompt = prompt;
    project.plan = cloneJson(st.activePlan);
    project.route = st.activePlan.route || st.activeForgeRoute || "parametric";
    project.routes = currentModelRoutes();
    project.name = project.name || projectNameFromPrompt(prompt, st.activePlan);
    persistForgeProjects();
    renderForgeProjects();
    if (manual) log("Projects", `Saved ${project.name}`, "ok", `${project.plan.nodes.length} mesh parts`);
    return project;
  }

  function queueProjectSave() {
    if (!st.activePlan?.nodes?.length) return;
    clearTimeout(st.projectSaveTimer);
    st.projectSaveTimer = setTimeout(() => saveCurrentProject(false), 450);
  }

  function newForgeProject() {
    st.activeProjectId = null;
    if ($("frgPrompt")) $("frgPrompt").value = "";
    clearScene();
    st.activePlan = null;
    updatePlanList(null);
    renderSelection();
    renderForgeProjects();
    setStatus("Idle");
    log("Projects", "New Forge project ready", "wait");
  }

  function openForgeProject(id) {
    const project = st.forgeProjects.find((p) => p.id === id);
    if (!project) return;
    st.activeProjectId = project.id;
    if ($("frgPrompt")) $("frgPrompt").value = project.prompt || project.plan?.name || "";
    restoreModelRoutes(project.routes);
    buildPlan(project.plan);
    renderForgeProjects();
    log("Projects", `Opened ${project.name || "Forge Project"}`, "ok", `${project.plan.nodes.length} mesh parts`);
  }

  function deleteForgeProject(id) {
    const project = st.forgeProjects.find((p) => p.id === id);
    if (!project) return;
    if (!confirm(`Delete "${project.name || "Forge Project"}"?`)) return;
    st.forgeProjects = st.forgeProjects.filter((p) => p.id !== id);
    if (st.activeProjectId === id) st.activeProjectId = null;
    persistForgeProjects();
    renderForgeProjects();
    log("Projects", "Deleted Forge project", "warn");
  }

  return {
    loadForgeProjects, persistForgeProjects, renderForgeProjects, saveCurrentProject,
    queueProjectSave, newForgeProject, openForgeProject, deleteForgeProject,
    cloneJson, projectNameFromPrompt, currentModelRoutes, restoreModelRoutes,
  };
}
