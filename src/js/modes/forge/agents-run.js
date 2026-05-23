/** Forge god-agent pipeline + plan generation (Wave 17). */
import {
  AGENTS, FLOOR_Y, MAX_FORGE_NODES,
  FORGE_REFERENCE_SOURCES, FORGE_BLOCKED_REFERENCE_DOMAINS, FORGE_ALLOWED_MODEL_PROVIDERS,
} from './constants.js';
import {
  normalizePlan, vec3, box, cyl, capsule, sphere, ellipsoid, cone, torus, lathe, logo,
} from './plan.js';
import { createForgePlansTemplatesApi } from './plans-templates.js';

export function createForgeAgentsRunApi(ctx) {
  const {
    $, st, escapeHtml, setStatus, log, traceKind, forgePrefs, updateStage, resetStages,
    setAgentState, renderAgents, selectedModelFor, modelLabel, updatePlanList, buildPlan,
    clearScene, initThree, queueProjectSave, autoAssignForgeModels, agentsRouting,
    classifyForgePrompt, needsTemplateAuthority, isKnifeLikePrompt, isSpoonLikePrompt,
    isSwordLikePrompt, isDroneLikePrompt, isPhonePrompt, isLaptopPrompt, isSkeletonOnlyPrompt,
    renderableNodes,
    hLogoPlan, roverPlan, dronePlan, housePlan, towerPlan, mechanismPlan,
  } = ctx;

  const {
    fallbackPlan, reconstructSpoonStructure,
    ellipsoidMesh, spoonBowlMesh, taperedHandleMesh, coneMesh, tubeMesh,
  } = createForgePlansTemplatesApi({
    log, renderableNodes,
    isKnifeLikePrompt, isSpoonLikePrompt, isSwordLikePrompt, isDroneLikePrompt, isSkeletonOnlyPrompt,
    roverPlan, dronePlan, housePlan, towerPlan, mechanismPlan,
  });

  async function runGodAgent(useSample) {
    if (!await initThree()) return;
    if (st.abortCtrl) st.abortCtrl.abort();
    st.abortCtrl = new AbortController();
    st.traceRunCount += 1;
    st.traceStartTime = Date.now();
    const prompt = ($("frgPrompt")?.value || "").trim() || "a complex original 3D object";
    const prefs = forgePrefs();
    st.activeReferenceBrief = "";
    resetStages();
    updateStage("input", "done", "prompt locked");
    const traceEntries = $("frgTraceEntries");
    if (traceEntries) traceEntries.innerHTML = "";
    const consoleEl = $("frgTraceConsole");
    if (consoleEl) {
      consoleEl.classList.remove("collapsed");
      consoleEl.classList.add("expanded");
    }
    AGENTS.forEach((a) => setAgentState(a.id, "idle"));
    setStatus("Forging");
    setAgentState("god", "thinking");
    log("Orchestrator", `Run ${st.traceRunCount} started`, "boss");
    autoAssignForgeModels(prompt, false);
    let routeBrief = classifyForgePrompt(prompt);
    if (routeBrief.route === "organic_diffusion") {
      routeBrief = {
        ...routeBrief,
        route: "parametric",
        brief: "Organic mesh approximation routed through direct AI geometry because no diffusion backend is configured.",
      };
      log("Router", "Diffusion backend unavailable; routing organic prompt to direct mesh geometry", "warn");
    }
    st.activeForgeRoute = routeBrief.route;
    log("God Agent", `Route: ${routeBrief.route}`, "boss", routeBrief.brief);
    log("Parameter Agent", useSample ? "Loading sample geometry plan." : `Designing "${prompt}" with ${modelLabel(selectedModelFor("god"))}`, "run");

    let plan = null;
    if (useSample) {
      plan = hLogoPlan();
      plan.route = "parametric";
    } else {
      try {
        updateStage("generate", "active", "references");
        st.activeReferenceBrief = await gatherReferenceBrief(prompt, routeBrief.route, st.abortCtrl.signal);
        updateStage("generate", "active", "parameter agent");
        plan = await requestForgeKernelPlan(prompt, prefs, st.activeReferenceBrief, routeBrief, st.abortCtrl.signal);
        if (plan) {
          plan.route = routeBrief.route;
          log(routeBrief.route === "anatomical" ? "SDF Kernel" : "Geometry Kernel", `Executed ${routeBrief.route} mesh plan · ${plan.nodes.length} mesh part(s)`, "ok");
        }
      } catch (err) {
        failForgeRun("Parameter Agent", "Model generation failed: " + (err.message || err));
        return;
      }
    }
    updateStage("generate", "done", plan ? "plan ready" : "failed");
    if (!plan) {
      failForgeRun("Parameter Agent", "No model plan was produced.");
      return;
    }
    if (!useSample) {
      plan = enforceSingleMainModel(prompt, plan, prefs);
      plan.route = routeBrief.route;
    }

    setAgentState("god", "done");

    // ── Multi-agent refinement pipeline ───────────────────────────────
    if (!useSample && routeBrief.route !== "organic_diffusion" && st.abortCtrl && !st.abortCtrl.signal.aborted) {
      updateStage("refine", "active", "structure agent");
      const ROLE_PIPELINE = ["structure", "surface", "detail", "audit"];
      for (const role of ROLE_PIPELINE) {
        if (st.abortCtrl.signal.aborted) break;
        const agentMeta = AGENTS.find((a) => a.id === role);
        setAgentState(role, "thinking");
        updateStage("refine", "active", `${agentMeta?.name || role}`);
        try {
          const extraNodes = await askRoleAgentWithFailover(role, prompt, plan, st.activeReferenceBrief, prefs, st.abortCtrl.signal);
          if (Array.isArray(extraNodes) && extraNodes.length) {
            plan.nodes.push(...extraNodes);
            log(agentMeta?.name || role, `Added ${extraNodes.length} ${role} part(s)`, "ok");
          } else {
            log(agentMeta?.name || role, `No ${role} additions needed`, "wait");
          }
        } catch (err) {
          log(agentMeta?.name || role, `${role} failed: ${err.message || err}`, "warn");
        }
        setAgentState(role, "done");
      }

      // Keep every agent contribution attached to one assembled subject.
      plan = enforceSingleMainModel(prompt, plan, prefs);

      // Enrich sparse plans with procedural fallback nodes — disabled to keep pure AI generation
      plan = ensurePlanRichness(prompt, plan, false);

      // Normalize and cap
      plan = normalizePlan(plan);
      plan.route = routeBrief.route;
    }
    updateStage("refine", "done", plan.route === "anatomical" ? "sdf smoothed" : "post-process done");

    buildPlan(plan);
    saveCurrentProject(false);
    log("Orchestrator", `Forge complete · ${renderableNodes(plan.nodes).length} mesh part(s) exported`, "ok");
    const dot = $("frgTraceDot");
    if (dot) dot.className = "frg-trace-dot done";
    updateStage("export", "active", `${(prefs.output || "glb").toUpperCase()} ready`);
    setStatus("Ready");
  }

  function failForgeRun(label, message) {
    log(label || "Forge", message || "Generation failed", "err");
    setStatus("Failed");
    updateStage("generate", "active", "failed");
    updateStage("refine", "active", "blocked");
    updateStage("export", "active", "blocked");
    AGENTS.forEach((a) => setAgentState(a.id, a.id === "god" ? "failed" : "blocked"));
    const dot = $("frgTraceDot");
    if (dot) dot.className = "frg-trace-dot error";
  }

  async function askGodPlanWithFailover(prompt, referenceBrief, prefs, signal) {
    const sel = $("frgModel_god");
    const original = sel?.value || "";
    const current = selectedModelFor("god");
    const routes = providerModelsForForge(true)
      .map(([provider, value, label]) => ({ provider, value, label }))
      .filter((route) => route.value);
    const candidates = [
      current ? { provider: providerFromValue(current), value: current, label: modelLabel(current) } : null,
      ...routes.filter((route) => route.value !== current),
    ].filter((route, index, arr) => route?.value && arr.findIndex((r) => r?.value === route.value) === index);
    let lastError = null;
    for (let i = 0; i < Math.min(candidates.length, 5); i++) {
      const candidate = candidates[i];
      if (skipCoolingCandidate(candidate, candidates)) continue;
      if (sel && Array.from(sel.options).some((o) => o.value === candidate.value)) sel.value = candidate.value;
      if (i > 0) log("Router", `Retrying God Agent with ${candidate.label || modelLabel(candidate.value)}`, "warn");
      let routedSignal = null;
      try {
        const timeoutMs = candidate.provider === "local" ? 90_000 : 45_000;
        routedSignal = timeoutSignal(signal, timeoutMs);
        return await askModelForPlan(prompt, referenceBrief, prefs, routedSignal.signal);
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        markForgeProviderFailure(candidate.provider, err);
        log("God Agent", `${candidate.label || modelLabel(candidate.value)} failed · ${err.message || err}`, "warn");
      } finally {
        routedSignal?.cleanup();
      }
    }
    if (sel && original && Array.from(sel.options).some((o) => o.value === original)) sel.value = original;
    throw lastError || new Error("all Forge planner routes failed");
  }

  async function askRoleAgentWithFailover(role, prompt, plan, referenceBrief, prefs, signal) {
    const agentName = AGENTS.find((a) => a.id === role)?.name || role;
    const sel = $(`frgModel_${role}`);
    const original = sel?.value || "";
    const current = selectedModelFor(role);
    const routes = providerModelsForForge(false)
      .map(([provider, value, label]) => ({ provider, value, label }))
      .filter((route) => route.value);
    const candidates = [
      { provider: providerFromValue(current), value: current, label: modelLabel(current) },
      ...routes.filter((route) => route.value !== current),
    ].filter((route, index, arr) => route.value && arr.findIndex((r) => r.value === route.value) === index);
    let lastError = null;
    for (let i = 0; i < Math.min(candidates.length, 4); i++) {
      const candidate = candidates[i];
      if (skipCoolingCandidate(candidate, candidates)) continue;
      if (sel && Array.from(sel.options).some((o) => o.value === candidate.value)) sel.value = candidate.value;
      if (i > 0) log("Router", `Retrying ${agentName} with ${candidate.label || modelLabel(candidate.value)}`, "warn");
      let routedSignal = null;
      try {
        const timeoutMs = candidate.provider === "local" ? 75_000 : 35_000;
        routedSignal = timeoutSignal(signal, timeoutMs);
        return await askRoleAgent(role, prompt, plan, referenceBrief, prefs, routedSignal.signal);
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        markForgeProviderFailure(candidate.provider, err);
        log(agentName, `${candidate.label || modelLabel(candidate.value)} failed · ${err.message || err}`, "warn");
      } finally {
        routedSignal?.cleanup();
      }
    }
    if (sel && original && Array.from(sel.options).some((o) => o.value === original)) sel.value = original;
    throw lastError || new Error(`all ${role} routes failed`);
  }

  async function requestForgeKernelPlan(prompt, prefs, referenceBrief, routeBrief, signal) {
    const route = routeBrief?.route || "parametric";
    // In Tauri (desktop) mode or when backend is unavailable, use direct AI geometry generation
    const isTauri = typeof window.__TAURI__ !== "undefined" || typeof window.__TAURI_INTERNALS__ !== "undefined";
    if (!isTauri) {
      try {
        const headers = { "Content-Type": "application/json", ...(window._H?.backendAuthHeaders?.() || {}) };
        const endpoint = route === "anatomical" ? "/api/forge-kernel/anatomical" : "/api/forge-kernel";
        const paramPlan = await askParameterPlanWithFailover(prompt, prefs, referenceBrief, route, signal);
        const res = await fetch(endpoint, {
          method: "POST", headers,
          body: JSON.stringify({ prompt, prefs, plan: paramPlan }),
          cache: "no-store", signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.ok && data.plan) {
            const plan = normalizePlan(data.plan);
            plan.route = route;
            plan.rawKernelPlan = paramPlan;
            if (data.glbUrl) { plan.glbUrl = data.glbUrl; log("Export", `GLB generated · ${data.glbUrl}`, "ok"); }
            return plan;
          }
        }
      } catch (err) {
        if (err?.name === "AbortError") throw err;
      }
    }
    // Direct AI generation — no backend needed (Tauri / offline mode)
    log("God Agent", "Direct AI geometry mode (no backend kernel)", "run");
    const plan = await askGodPlanWithFailover(prompt, referenceBrief, prefs, signal);
    if (plan) plan.route = route;
    return plan;
  }

  async function askParameterPlanWithFailover(prompt, prefs, referenceBrief, route, signal) {
    const sel = $("frgModel_god");
    const original = sel?.value || "";
    const current = selectedModelFor("god");
    const routes = providerModelsForForge(true)
      .map(([provider, value, label]) => ({ provider, value, label }))
      .filter((route) => route.value);
    const candidates = [
      { provider: providerFromValue(current), value: current, label: modelLabel(current) },
      ...routes.filter((route) => route.value !== current),
    ].filter((route, index, arr) => route.value && arr.findIndex((r) => r.value === route.value) === index);
    let lastError = null;
    const maxRoutes = Math.min(candidates.length, 6);
    for (let i = 0; i < maxRoutes; i++) {
      const candidate = candidates[i];
      if (skipCoolingCandidate(candidate, candidates)) continue;
      if (sel && Array.from(sel.options).some((o) => o.value === candidate.value)) sel.value = candidate.value;
      if (i > 0) log("Router", `Switching Parameter Agent to ${candidate.label || modelLabel(candidate.value)}`, "warn");
      let routedSignal = null;
      try {
        const timeoutMs = providerFromValue(candidate.value) === "local" ? 90_000 : 45_000;
        routedSignal = timeoutSignal(signal, timeoutMs);
        const plan = route === "anatomical"
          ? await askModelForAnatomicalPlan(prompt, prefs, referenceBrief, routedSignal.signal)
          : await askModelForParametricPlan(prompt, prefs, referenceBrief, routedSignal.signal);
        if (i > 0) log("Parameter Agent", `Recovered with ${candidate.label || modelLabel(candidate.value)}`, "ok");
        return plan;
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        markForgeProviderFailure(candidate.provider, err);
        const reason = err?.name === "AbortError" ? "timed out / no reply" : (err.message || err);
        log("Parameter Agent", `${candidate.label || modelLabel(candidate.value)} failed · ${reason}`, "warn");
      } finally {
        routedSignal?.cleanup();
      }
    }
    if (sel && original && Array.from(sel.options).some((o) => o.value === original)) sel.value = original;
    throw lastError || new Error("all parameter model routes failed");
  }

  function timeoutSignal(parentSignal, ms) {
    const ctrl = new AbortController();
    let cleaned = false;
    const abort = () => {
      if (!ctrl.signal.aborted) ctrl.abort();
    };
    if (parentSignal?.aborted) abort();
    else parentSignal?.addEventListener?.("abort", abort, { once: true });
    const timer = setTimeout(abort, Math.max(5000, Number(ms) || 45_000));
    return {
      signal: ctrl.signal,
      cleanup() {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timer);
        parentSignal?.removeEventListener?.("abort", abort);
      },
    };
  }

  async function askModelForParametricPlan(prompt, prefs, referenceBrief, signal) {
    const api = window._H;
    const model = selectedModelFor("god");
    if (!api?.ollamaChat || !model) throw new Error("no model bridge");
    const system = `You are a parametric 3D model designer. Output ONLY valid JSON, no markdown.
The backend kernel is generic and does not know object names. You must design the object by choosing geometry primitives and numeric parameters.
Schema:
{
  "name": "short model name",
  "primitives": [
    {
      "id": "stable_id",
      "name": "part name",
      "type": "lathe|tube|extrude|sphere|box|loft",
      "role": "structure|surface|detail",
      "position": [x,y,z],
      "profile": [[radiusCm,yCm],[radiusCm,yCm]],
      "path": [[xCm,yCm,zCm],[xCm,yCm,zCm]],
      "points": [[xCm,yCm],[xCm,yCm]],
      "radius": 2,
      "size": [xCm,yCm,zCm],
      "depth": 2,
      "segments": 24,
      "color": "#cfd8d4"
    }
  ],
  "material": {"roughness":0.5,"metalness":0,"color":"#cfd8d4"},
  "postprocess": ["smooth_normals"]
}
Rules:
- All dimensions are centimeters.
- Use 3 to 18 primitives. Prefer fewer, meaningful primitives over many decorations.
- Use lathe for circular/oval revolved forms: bowls, cups, vases, wheels, knobs.
- Use tube for handles, limbs, branches, cables, spikes, ribs, stems, shafts.
- Use extrude for flat custom silhouettes: blades, leaves, fins, panels, signs.
- Use sphere for organic masses, joints, eyes, caps.
- Use box only for hard rectangular parts.
- Build exactly one primary subject. Every primitive must overlap, attach to, or visibly continue that subject. Do not scatter loose sample parts or create a second mini-model.
- For phones/smartphones, design a thin handheld device with rounded body, screen glass, bezel/rails, st.camera island or st.camera bump, lens rings, flash, speaker slots, charging port, side buttons, sensors, and at least 14 meaningful primitives.
- Do not output semantic nodes. Do not mention agents. Do not use object templates.
- The kernel will blindly execute your primitives; make the geometry recognizable from the parameters alone.
- Use these reference-derived constraints when present. Treat dimensions and ratios as hard constraints, not prose to repeat.
- Style target: ${prefs.style || "realistic"}. Detail target: ${prefs.detail || "balanced"}. Output target: ${prefs.output || "glb"}.`;
    const text = await api.ollamaChat(model, [
      { role: "system", content: system },
      { role: "user", content: `Design this object as a parametric mesh plan: ${prompt}\n\nReference dimensions and constraints:\n${referenceBrief || "No reference constraints available. Infer reasonable real-world proportions."}` },
    ], null, signal);
    return validateParametricPlan(parseJsonPayload(text, "object"));
  }

  function validateParametricPlan(plan) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("parametric plan must be an object");
    if (!Array.isArray(plan.primitives) || plan.primitives.length < 2) throw new Error("parametric plan needs at least 2 primitives");
    const allowed = new Set(["lathe", "tube", "extrude", "sphere", "box", "loft"]);
    plan.primitives = plan.primitives.slice(0, 18).filter((prim) => prim && allowed.has(String(prim.type || "").toLowerCase()));
    if (plan.primitives.length < 2) throw new Error("parametric plan had fewer than 2 supported primitives");
    return plan;
  }

  async function askModelForAnatomicalPlan(prompt, prefs, referenceBrief, signal) {
    const api = window._H;
    const model = selectedModelFor("god");
    if (!api?.ollamaChat || !model) throw new Error("no model bridge");
    const detail = prefs.detail || "balanced";
    const resolution = detail === "high" ? 96 : detail === "fast" ? 48 : 64;
    const system = `You are an anatomical 3D sculptor. Output ONLY valid JSON, no markdown.
You design realistic anatomy using Signed Distance Functions. The backend SDF kernel is generic and blind to object names.
Allowed SDF primitives:
- ellipsoid: {"type":"ellipsoid","center":[x,y,z],"radii":[x,y,z],"operation":"union|subtract|intersect|smooth_union","id":"part"}
- capsule: {"type":"capsule","a":[x,y,z],"b":[x,y,z],"radius":r,"operation":"union|smooth_union","id":"bone"}
- sphere: {"type":"sphere","center":[x,y,z],"radius":r,"operation":"union|subtract|smooth_union","id":"part"}
- box: {"type":"box","center":[x,y,z],"size":[x,y,z],"operation":"union|subtract|intersect","id":"part"}
- cylinder: {"type":"cylinder","center":[x,y,z],"radius":r,"height":h,"operation":"union|subtract","id":"part"}
- torus: {"type":"torus","center":[x,y,z],"majorRadius":R,"minorRadius":r,"operation":"union|subtract","id":"part"}
Operations: union, subtract, intersect, smooth_union. For smooth_union include "k": 1.5 to 3.0.
Rules:
- All dimensions are centimeters.
- Use anatomical proportions from references.
- Human skull default: length about 21cm, width about 15cm, height about 17cm.
- Human hand skeleton: 27 bones, capsules for phalanges/metacarpals, spheres for joints/carpals.
- Ribcage: 12 rib pairs as curved capsule chains, sternum as box/capsule chain, thoracic spine as capsules.
- Full skeleton: approximate 170cm height unless user specifies another scale.
- Use subtract for eye sockets, nasal cavities, foramen, hollow openings.
- Domain must tightly fit the model with about 10% padding.
- Resolution target: ${resolution}. Do not exceed 96.
Schema:
{
  "name": "short anatomical model name",
  "sdf_primitives": [],
  "domain": {"min":[x,y,z],"max":[x,y,z]},
  "resolution": ${resolution},
  "material": {"roughness":0.7,"metalness":0,"color":"#E8DCC8","subsurface":0.2},
  "postprocess": ["marching_cubes","laplacian_smooth:2","compute_normals","decimate:0.7","weld_vertices"]
}`;
    const text = await api.ollamaChat(model, [
      { role: "system", content: system },
      { role: "user", content: `NOW DESIGN: ${prompt}\nREFERENCES:\n${referenceBrief || "No reference constraints available. Use standard anatomical proportions."}` },
    ], null, signal);
    return validateAnatomicalPlan(parseJsonPayload(text, "object"), resolution);
  }

  function validateAnatomicalPlan(plan, defaultResolution) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("anatomical plan must be an object");
    const allowed = new Set(["sphere", "ellipsoid", "capsule", "box", "cylinder", "torus"]);
    const ops = new Set(["union", "subtract", "intersect", "smooth_union"]);
    if (!Array.isArray(plan.sdf_primitives) || plan.sdf_primitives.length < 2) throw new Error("anatomical plan needs SDF primitives");
    plan.sdf_primitives = plan.sdf_primitives.slice(0, 220).filter((prim) => {
      if (!prim || typeof prim !== "object") return false;
      prim.type = String(prim.type || "").toLowerCase();
      prim.operation = String(prim.operation || "union").toLowerCase();
      return allowed.has(prim.type) && ops.has(prim.operation);
    });
    if (plan.sdf_primitives.length < 2) throw new Error("anatomical plan had fewer than 2 supported SDF primitives");
    const res = Math.floor(Number(plan.resolution) || defaultResolution || 64);
    plan.resolution = Math.max(16, Math.min(96, res));
    if (!plan.domain || !Array.isArray(plan.domain.min) || !Array.isArray(plan.domain.max)) {
      plan.domain = { min: [-15, -15, -15], max: [15, 25, 15] };
    }
    if (!Array.isArray(plan.postprocess)) plan.postprocess = ["marching_cubes", "laplacian_smooth:2", "compute_normals", "decimate:0.7", "weld_vertices"];
    if (!plan.material || typeof plan.material !== "object") plan.material = { roughness: 0.7, metalness: 0, color: "#E8DCC8", subsurface: 0.2 };
    return plan;
  }

  async function gatherReferenceBrief(prompt, route, signal) {
    const api = window._H;
    if (!api?.runOneTool) {
      log("Reference", "Web tools unavailable; planning from prompt only", "warn");
      return "";
    }
    const queries = referenceSearchQueries(prompt, route);
    const answers = [];
    const resultMap = new Map();
    for (const query of queries) {
      log("Reference", `Searching reference objects: ${query.slice(0, 72)}`, "run");
      const raw = await api.runOneTool("web_search", { query }, (msg) => log("Reference", msg, "run"));
      const parsed = safeJson(raw);
      if (parsed?.answer) answers.push(parsed.answer);
      (Array.isArray(parsed?.results) ? parsed.results : []).forEach((result) => {
        const url = String(result.url || "");
        if (!url || !isUsefulReferenceUrl(url)) return;
        if (!resultMap.has(url)) resultMap.set(url, result);
      });
    }
    const results = Array.from(resultMap.values()).sort(referenceResultScore).slice(0, 8);
    if (!results.length && !answers.length) {
      log("Reference", "No usable web reference results; planning from prompt", "warn");
      return "";
    }
    const pages = [];
    const pinnedUrls = pinnedReferenceUrls(prompt);
    const pageTargets = [
      ...pinnedUrls.map((url) => ({ title: "Pinned anatomical reference", url })),
      ...results,
    ].filter((result, index, arr) => result.url && arr.findIndex((r) => r.url === result.url) === index);
    for (const result of pageTargets.slice(0, 4)) {
      try {
        const pageRaw = await api.runOneTool("fetch_url", { url: result.url }, (msg) => log("Reference", msg, "run"));
        const page = safeJson(pageRaw);
        if (page?.text) pages.push({ title: result.title || result.url, url: result.url, text: String(page.text).slice(0, 1800) });
      } catch {}
    }
    const sourceText = [
      answers.length ? `Search answers:\n${answers.slice(0, 2).join("\n")}` : "",
      `Preferred 3D/CAD sources: ${FORGE_REFERENCE_SOURCES.join(", ")}`,
      ...results.map((r, i) => `${i + 1}. ${r.title || "Reference"} (${r.url || "no url"}): ${r.snippet || ""}`),
      ...pages.map((p, i) => `Page ${i + 1} ${p.title}: ${p.text}`),
    ].filter(Boolean).join("\n\n").slice(0, 7000);
    const brief = summarizeReferenceBrief(prompt, sourceText);
    if (brief) log("Reference", "Reference constraints ready", "ok", `${results.length} result(s)`);
    return brief;
  }

  function referenceSearchQueries(prompt, route) {
    const q = String(prompt || "").toLowerCase();
    const sourceFilter = "(Sketchfab OR GrabCAD OR Thingiverse OR Printables OR CGTrader OR TurboSquid OR Free3D OR BlendSwap)";
    const blocked = "-youtube -facebook -instagram -pinterest -tiktok";
    if (route === "anatomical") return [
      `${prompt} anatomy orthographic dimensions medical diagram ${blocked}`,
      `${prompt} 3D model anatomy GLB OBJ Sketchfab dimensions ${blocked}`,
      `${prompt} labeled anatomy diagram dimensions site:edu ${blocked}`,
      `${prompt} anatomical reference proportions front side view ${blocked}`,
    ];
    if (isAnimalPrompt(q)) return [
      `${prompt} 3D model mesh topology Blender ${sourceFilter} ${blocked}`,
      `${prompt} anatomy side front view proportions body parts tail legs ears paws ${blocked}`,
      `${prompt} sculpt retopology smooth mesh reference Blender ${blocked}`,
    ];
    if (/skull|skeleton|bone|anatomy/.test(q)) return [
      `The Anatomy of the Human Skull HannahNewey Sketchfab CT ZBrush cranium mandible teeth`,
      `${prompt} 3D model mesh anatomy Blender ${sourceFilter} ${blocked}`,
      `${prompt} anatomy reference proportions named parts front side view ${blocked}`,
      `${prompt} CAD mesh STL OBJ GLB reference ${blocked}`,
    ];
    if (isSpoonLikePrompt(q)) return [
      `${prompt} 3D model spoon mesh CAD Blender ${sourceFilter} ${blocked}`,
      `${prompt} cutlery spoon concave bowl tapered handle STL OBJ GLB CAD reference ${blocked}`,
      `${prompt} spoon orthographic top side view bowl rim neck handle proportions ${blocked}`,
    ];
    return [
      `${prompt} 3D model mesh CAD Blender dimensions orthographic ${sourceFilter} ${blocked}`,
      `${prompt} OBJ GLB STL CAD model reference dimensions width height depth orthographic ${blocked}`,
      `${prompt} shape materials proportions key part ratios dimensions CAD reference ${blocked}`,
    ];
  }

  function pinnedReferenceUrls(prompt) {
    if (isSkullPrompt(prompt)) {
      return ["https://sketchfab.com/3d-models/the-anatomy-of-the-human-skull-baf6ac7b781a46218dca2b59dee58817"];
    }
    return [];
  }

  function isUsefulReferenceUrl(url) {
    const s = String(url || "").toLowerCase();
    return !!s && !FORGE_BLOCKED_REFERENCE_DOMAINS.some((domain) => s.includes(domain));
  }

  function referenceResultScore(a, b) {
    return referenceUrlScore(b.url) - referenceUrlScore(a.url);
  }

  function referenceUrlScore(url) {
    const s = String(url || "").toLowerCase();
    let score = 0;
    FORGE_REFERENCE_SOURCES.forEach((domain, i) => {
      if (s.includes(domain)) score += 80 - i;
    });
    if (/\.(glb|gltf|obj|stl|fbx|blend)(\?|$)/.test(s)) score += 30;
    if (/3d|model|mesh|cad|blender|stl|obj|gltf|glb/.test(s)) score += 10;
    return score;
  }

  function summarizeReferenceBrief(prompt, sourceText) {
    const source = String(sourceText || "");
    if (!source.trim()) return "";
    const dims = Array.from(source.matchAll(/\b(\d+(?:\.\d+)?)\s?(mm|millimeters?|cm|centimeters?|m|meters?|in|inch|inches|")\b/gi))
      .map((m) => `${m[1]} ${m[2].replace('"', "in")}`)
      .slice(0, 18);
    const ratioHints = Array.from(source.matchAll(/\b(?:ratio|proportion|length|height|width|depth|diameter|radius|handle|bowl|rim|shaft|head|base|stem|flange|cup|body|opening|thickness)[^.\n]{0,120}/gi))
      .map((m) => m[0].replace(/\s+/g, " ").trim())
      .filter((line, index, arr) => line.length > 18 && arr.indexOf(line) === index)
      .slice(0, 12);
    const sourceUrls = Array.from(source.matchAll(/https?:\/\/[^\s)]+/g))
      .map((m) => m[0].replace(/[.,;]+$/, ""))
      .filter((url, index, arr) => isUsefulReferenceUrl(url) && arr.indexOf(url) === index)
      .slice(0, 8);
    const q = String(prompt || "").toLowerCase();
    const primitiveHints = [];
    if (/cup|mug|glass|vase|bottle|bowl|spoon|plate|skull|head|wheel|knob/.test(q)) primitiveHints.push("Use lathe for revolved bowls/cups/rounded cavities and rim profiles.");
    if (/handle|limb|leg|arm|tail|stem|shaft|mace|branch|cable|spike|rib/.test(q)) primitiveHints.push("Use tube paths with variable radii for handles, limbs, shafts, spikes, stems, and ribs.");
    if (/blade|leaf|fin|flange|panel|shield|wing/.test(q)) primitiveHints.push("Use extrude for flat silhouettes such as blades, leaves, flanges, panels, and fins.");
    if (/organic|animal|human|skull|head|body|joint|cap/.test(q)) primitiveHints.push("Use sphere/loft combinations for organic masses and transitions.");
    const lines = [
      `Object prompt: ${prompt}`,
      "Reference extraction is deterministic; the next step is the only LLM call.",
      dims.length ? `Detected dimension tokens: ${dims.join(", ")}` : "No exact dimensions detected; infer real-world scale from source titles/snippets.",
      ratioHints.length ? `Reference proportion hints: ${ratioHints.join(" | ")}` : "Extract key ratios from the object type: overall length/height/width/depth plus major part ratios.",
      primitiveHints.length ? `Primitive constraints: ${primitiveHints.join(" ")}` : "Primitive constraints: combine lathe, tube, extrude, sphere, box, and loft numerically.",
      sourceUrls.length ? `Preferred 3D/CAD sources: ${sourceUrls.join(" | ")}` : `Preferred 3D/CAD sources: ${FORGE_REFERENCE_SOURCES.join(", ")}`,
      "Do not copy any source model. Use references only for proportions, silhouettes, materials, and part ratios.",
    ];
    return lines.join("\n").slice(0, 2600);
  }

  function safeJson(text) {
    try { return JSON.parse(String(text || "")); } catch { return null; }
  }

  async function askModelForPlan(prompt, referenceBrief, prefs, signal) {
    const api = window._H;
    const model = selectedModelFor("god");
    if (!api?.ollamaChat || !model) throw new Error("no model bridge");
    const system = `Return only JSON for a 3D Forge GeometryPlan. No markdown.
Schema:
{
  "name": "short model name",
  "nodes": [
    {
      "id": "stable_id",
      "name": "part name",
      "type": "mesh|lathe|extrude|capsule|sphere|cone|torus|box|cylinder",
      "role": "structure|surface|detail|audit",
      "position": [x,y,z],
      "rotation": [x,y,z],
      "scale": [x,y,z],
      "params": {"width":1,"height":1,"depth":1,"radius":0.5,"length":0.8,"tube":0.08,"points":[[0.2,-0.5],[0.5,0],[0.2,0.5]],"segments":64,"subdivisions":1},
      "color": "#4bd2be"
    }
  ],
  "edges": [],
  "constraints": []
}
Mesh node params for real smooth structures:
{"positions":[x,y,z,...],"indices":[a,b,c,...],"normals":[x,y,z,...],"uvs":[u,v,...],"subdivisions":1,"center":false}
Rules:
- Design the user's requested object, not a default chair.
- Act like a reference-driven CAD/Blender procedural modeller: decompose the object into recognizable masses, profiles, cuts, rings, struts, panels, knobs, lenses, limbs, housings, and detail features.
- Build the model yourself from the prompt and reference brief. Do not use a canned template or generic placeholder.
- Treat Sketchfab/GrabCAD/Thingiverse/Printables/CGTrader/TurboSquid/Free3D/BlendSwap/Poly Haven/Blender modeling references as higher quality than social/video pages.
- Main visible forms should be smooth mesh surfaces with positions+indices, lathe profiles, extruded profiles, capsules, or organic ellipsoid meshes. Boxes/cylinders are only allowed for small mechanical fixtures, never as the main form for animals, people, characters, vehicles, or sculptural objects.
- Approximate any shape with custom mesh/extrude/lathe surface nodes first. Use boxes/cylinders only for hard mechanical sub-parts, not as the main body. Use 24 to 56 nodes for ordinary product/furniture/tool prompts and 38 to 86 for complex mechanical or anatomical objects.
- Use visible scale. Center the model near origin.
- Structure nodes first, then surface, detail, audit.
- Prefer lathe over cylinder for ANY revolved or organic curved form (bowls, vases, heads, limbs, torsos, necks, fruit, bottles, lamp shades, knobs). Cylinder is only for straight mechanical shafts. Lathe profiles let you taper, bulge, and round shapes properly.
- ALWAYS set "subdivisions":1 on every sphere, capsule, lathe, extrude, and mesh node that represents a smooth organic or sculptural surface. The st.renderer applies Loop-style smoothing so subdivided primitives look polished instead of faceted.
- ALWAYS set "segments":64 (or higher) on every lathe, cylinder, cone, and capsule. Default segment counts are too low to look smooth at production quality.
- Use cylinders/torus/spheres/cones/capsules for curved, mechanical, or organic parts, boxes for planar parts, lathe for rotational CAD profiles, and extrude for custom 2D outlines with depth.
- Style target: ${prefs.style}. Detail target: ${prefs.detail}. Output target: ${prefs.output}.
- For GLB/game output, keep separate named parts, clean pivots, no audit geometry unless it helps editing. For 3D print, make parts visually connected, grounded, and avoid tiny floating details.
- For animals, people, products, vehicles, tools, symbols, architecture, furniture, machines, or abstract sculptures, build a recognizable primitive approximation.
- For phones/smartphones, return a recognizable smartphone, not a plain slab: rounded frame, glass display, bezels/metal rails, st.camera bump/island, multiple lenses/rings, flash, speaker slots, charging port, side buttons, sensors, and UI/display details. Minimum 18 visible non-audit parts.
- For animals, build a real quadruped model with smooth mesh surface nodes: horizontal torso mesh, chest/hip masses, neck, head mesh, muzzle, two ears, four legs with paws, and tail. Name those parts explicitly. Never return a mushroom, pedestal, humanoid, chair-like stack, or abstract mascot when the prompt asks for an animal.
- For spoons or cutlery, build a recognizable utensil: a shallow concave oval bowl/scoop mesh, raised rim/lip, narrowed neck transition, long tapered handle mesh, rounded handle end, metal bevels/highlights, and polished steel/silver material. Never return a symbol, pentagon, plaque, ball, or generic primitive stack.
- For people or humanoid characters, build a proportional anatomical body model, not a toy mannequin: head about 1/7.5 body height, ribcage narrower than shoulders, pelvis below abdomen, arms hanging beside torso, knees/ankles aligned, hands and feet sized correctly.
- If the prompt specifically asks for a human skeleton, return only anatomical bones and joints. Do not add skin shells, clothing, rulers, audit rods, red rings, floor planes, or decorative markers.
- ONE SUBJECT RULE: build exactly one primary object. Every non-audit part must touch, overlap, or visibly connect to that object. Do not add loose side pieces, floating decorative spheres, random orbit rings, unrelated markers, or a second mini-model beside the requested object.
- Put audit markers last and only when they clarify floor contact, balance, symmetry, clearance, overhang, or wall thickness.
- Keep coordinates within roughly -3..3 unless needed.`;
    const user = `Design this as a complete 3D model, ready to preview and export.
Prompt: ${prompt}

Reference brief from web search:
${referenceBrief || "No external reference brief available; infer from general object knowledge."}`;
    const text = await api.ollamaChat(model, [
      { role: "system", content: system },
      { role: "user", content: user },
    ], null, signal);
    try {
      return parsePlan(text);
    } catch (err) {
      log("God Agent", `JSON repair pass · ${err.message || err}`, "warn");
      const repaired = await repairForgeJson("object", prompt, text, signal, model);
      return parsePlan(repaired);
    }
  }

  async function askRoleAgent(role, prompt, plan, referenceBrief, prefs, signal) {
    const api = window._H;
    const model = selectedModelFor(role);
    if (!api?.ollamaChat || !model) throw new Error("no model bridge");
    const existing = JSON.stringify({
      name: plan.name,
      nodes: plan.nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, role: n.role, position: n.position, rotation: n.rotation, scale: n.scale, params: n.params })).slice(0, 42),
    });
    const system = `Return only JSON array, no markdown.
You are the Forge ${role} agent. Add only ${role} nodes that make the requested 3D object more recognizable.
Allowed node schema:
{"id":"stable_unique_id","name":"part","type":"mesh|box|cylinder|capsule|sphere|cone|torus|lathe|extrude","role":"${role}","position":[x,y,z],"rotation":[x,y,z],"scale":[x,y,z],"params":{"width":1,"height":1,"depth":1,"radius":0.5,"length":0.8,"tube":0.08,"points":[[0.2,-0.5],[0.5,0],[0.2,0.5]],"subdivisions":0},"color":"#hex"}
Return [] only if the current plan is already sufficient for your role and has clear object-specific named features.
If the current plan is sparse, generic, or below 18 visible non-audit parts, add concrete attached parts for your role.
Maximum ${prefs?.detail === "high" ? 14 : prefs?.detail === "fast" ? 5 : 9} nodes. Keep coordinates near the existing model.
Use this style/output target: ${prefs?.style || "realistic"} / ${prefs?.output || "glb"}.
Use the reference brief to add accurate object-specific parts, not generic decoration.
Single subject rule: every new node must attach to an existing visible part as a surface, limb, support, panel, handle, fastener, seam, or material feature. Never add a freestanding object, loose sample primitive, second character, side prop, or detached mini-model. Return [] if your only idea would be separate from the main object.
For phones, add only smartphone parts: rounded frame, screen glass, bezels, st.camera island, lens rings, flash, speaker slots, charging port, side buttons, sensors, and subtle UI tiles.
For animals, add only anatomical quadruped parts: torso/chest/hips, head/muzzle, ears, legs, paws, tail, eyes, nose, whiskers, fur patches.
For spoons, add only utensil parts: concave bowl/scoop, rim/lip, neck/shoulder transition, long tapered handle, end cap, bevels, polished metal highlights.
Do not add floating decorations or abstract markers. Structure must add load-bearing/support parts; surface must refine silhouette/material panels; detail must add handles, bolts, seams, bevels, grooves, st.controls, or functional small parts; audit must add only clearance/balance/floor/symmetry review markers.`;
    const text = await api.ollamaChat(model, [
      { role: "system", content: system },
      { role: "user", content: `User object: ${prompt}\nReference brief:\n${referenceBrief || "No reference brief."}\n\nCurrent plan: ${existing}` },
    ], null, signal);
    let arr = null;
    try {
      arr = parseJsonPayload(text, "array");
    } catch (err) {
      log(AGENTS.find((a) => a.id === role)?.name || role, `JSON repair pass · ${err.message || err}`, "warn");
      arr = parseJsonPayload(await repairForgeJson("array", prompt, text, signal, model), "array");
    }
    if (!Array.isArray(arr)) return [];
    return normalizePlan({ name: plan.name, nodes: arr }).nodes
      .filter((node) => node.role === role)
      .map((node, i) => ({ ...node, id: `${role}_${Date.now()}_${i}_${node.id}` }))
      .slice(0, prefs?.detail === "high" ? 14 : prefs?.detail === "fast" ? 5 : 9);
  }

  function parsePlan(text) {
    const parsed = parseJsonPayload(text, "object");
    const plan = normalizePlan(parsed);
    if (plan.nodes.length < 2) throw new Error("plan had fewer than 2 nodes");
    return plan;
  }

  function isSkullPrompt(prompt) {
    return /\b(skull|cranium|human skull)\b/i.test(String(prompt || ""));
  }

  function isAnimalPrompt(prompt) {
    return /\b(cat|kitten|dog|puppy|horse|lion|tiger|wolf|fox|bear|rabbit|deer|cow|bull|goat|sheep|elephant|giraffe|zebra|animal)\b/i.test(String(prompt || ""));
  }

  function reconstructMeshStructure(prompt, plan) {
    const normalized = normalizePlan(plan);
    if (!isAnimalPrompt(prompt)) return normalized;
    const text = normalized.nodes.map((n) => `${n.id} ${n.name} ${n.type}`).join(" ").toLowerCase();
    const hasMeshSkin = /\bmesh_skin\b|smooth .* mesh|torso_mesh|head_mesh/.test(text);
    const meshCount = normalized.nodes.filter((n) => n.type === "mesh").length;
    if (hasMeshSkin && meshCount >= 6) return normalized;
    const q = String(prompt || "").toLowerCase();
    const cat = /\bcat|kitten\b/.test(q);
    const fur = cat ? "#9b7a46" : "#8f7654";
    const dark = cat ? "#3d3024" : "#3f3428";
    const light = cat ? "#d4b37a" : "#c9a77a";
    const meshNodes = [
      ellipsoidMesh("mesh_skin_torso", "Smooth torso mesh skin", "structure", [0, 0.05, 0], [1.18, 0.42, 0.46], fur),
      ellipsoidMesh("mesh_skin_chest", "Smooth chest mesh mass", "structure", [0, 0.14, 0.48], [0.58, 0.43, 0.38], light),
      ellipsoidMesh("mesh_skin_hips", "Smooth hip mesh mass", "structure", [0, 0.08, -0.48], [0.64, 0.38, 0.42], fur),
      ellipsoidMesh("mesh_skin_neck", "Curved neck mesh", "structure", [0, 0.38, 0.72], [0.26, 0.34, 0.24], fur),
      ellipsoidMesh("mesh_skin_head", "Smooth cat head mesh", "structure", [0, 0.68, 0.96], [0.43, 0.34, 0.36], fur),
      ellipsoidMesh("mesh_skin_muzzle", "Projected muzzle mesh", "surface", [0, 0.62, 1.24], [0.22, 0.13, 0.16], light),
      coneMesh("mesh_left_ear", "Left triangular ear mesh", "surface", [-0.23, 1.02, 0.96], [0.16, 0.32, 0.13], dark, [0, 0, -0.22]),
      coneMesh("mesh_right_ear", "Right triangular ear mesh", "surface", [0.23, 1.02, 0.96], [0.16, 0.32, 0.13], dark, [0, 0, 0.22]),
      tubeMesh("mesh_tail", "Curved raised tail mesh", "structure", [[0, 0.18, -0.9], [0.1, 0.42, -1.22], [0.16, 0.86, -1.38], [0.08, 1.1, -1.16]], 0.07, fur),
    ];
    [
      ["front_left", -0.34, 0.42],
      ["front_right", 0.34, 0.42],
      ["hind_left", -0.36, -0.42],
      ["hind_right", 0.36, -0.42],
    ].forEach(([id, x, z]) => {
      const front = String(id).startsWith("front");
      const dz = front ? 0.16 : -0.08;
      meshNodes.push(tubeMesh(`mesh_${id}_upper_leg`, `${id.replace(/_/g, " ")} upper leg mesh`, "structure", [[x, -0.04, z], [x * 1.04, -0.36, z + dz * 0.35], [x * 1.05, -0.58, z + dz * 0.55]], 0.085, fur));
      meshNodes.push(tubeMesh(`mesh_${id}_lower_leg`, `${id.replace(/_/g, " ")} lower leg mesh`, "structure", [[x * 1.05, -0.56, z + dz * 0.55], [x * 1.08, -0.76, z + dz * 0.85], [x * 1.08, -0.9, z + dz]], 0.06, fur));
      meshNodes.push(ellipsoidMesh(`mesh_${id}_paw`, `${id.replace(/_/g, " ")} paw mesh`, "surface", [x * 1.08, -0.94, z + dz + 0.04], [0.15, 0.055, 0.12], light));
    });
    meshNodes.push(
      ellipsoidMesh("mesh_left_eye", "Left eye inset mesh", "detail", [-0.13, 0.72, 1.27], [0.035, 0.025, 0.018], "#050505"),
      ellipsoidMesh("mesh_right_eye", "Right eye inset mesh", "detail", [0.13, 0.72, 1.27], [0.035, 0.025, 0.018], "#050505"),
      ellipsoidMesh("mesh_nose", "Nose mesh", "detail", [0, 0.62, 1.38], [0.045, 0.03, 0.025], "#1b1110")
    );
    [-1, 1].forEach((side) => {
      [-0.04, 0.02, 0.08].forEach((dy, i) => {
        meshNodes.push(tubeMesh(`mesh_whisker_${side > 0 ? "right" : "left"}_${i}`, `${side > 0 ? "Right" : "Left"} whisker mesh ${i + 1}`, "detail", [[side * 0.08, 0.62 + dy, 1.38], [side * 0.42, 0.62 + dy + 0.03, 1.54]], 0.009, "#f1e4c8"));
      });
    });
    [
      ["front_left", -0.34, 0.62],
      ["front_right", 0.34, 0.62],
      ["hind_left", -0.36, -0.22],
      ["hind_right", 0.36, -0.22],
    ].forEach(([id, x, z]) => {
      meshNodes.push(ellipsoidMesh(`mesh_${id}_toe_pad`, `${id.replace(/_/g, " ")} toe pad mesh`, "detail", [x, -0.93, z], [0.045, 0.018, 0.035], "#2a1d18"));
    });
    const next = {
      ...normalized,
      name: normalized.name || (cat ? "Mesh cat model" : "Mesh animal model"),
      nodes: meshNodes.slice(0, MAX_FORGE_NODES),
    };
    log("Surface Agent", `Reconstructed organic mesh surface · ${meshNodes.length} mesh node(s)`, "ok");
    return next;
  }

  function reconstructSkullStructure(prompt, plan) {
    const normalized = normalizePlan(plan);
    if (!isSkullPrompt(prompt)) return normalized;
    const text = normalized.nodes.map((n) => `${n.id} ${n.name} ${n.type}`).join(" ").toLowerCase();
    const hasSkullMesh = /\bmesh_cranium\b|smooth cranium mesh|orbital socket mesh/.test(text);
    if (hasSkullMesh && normalized.nodes.length >= 24) return normalized;
    const bone = "#d8d2bd";
    const shadow = "#6f6b60";
    const dark = "#070807";
    const nodes = [
      ellipsoidMesh("mesh_cranium", "CT-like smooth cranium skull vault mesh", "structure", [0, 0.62, -0.04], [0.62, 0.72, 0.56], bone),
      ellipsoidMesh("mesh_occipital_back", "Rounded occipital back skull mesh", "structure", [0, 0.5, -0.42], [0.5, 0.44, 0.28], bone),
      ellipsoidMesh("mesh_forehead_frontal", "Sloped frontal bone forehead mesh", "surface", [0, 0.79, 0.38], [0.46, 0.27, 0.18], bone, [-0.12, 0, 0]),
      ellipsoidMesh("mesh_left_parietal", "Left parietal bone mesh", "surface", [-0.39, 0.6, -0.04], [0.2, 0.43, 0.4], bone),
      ellipsoidMesh("mesh_right_parietal", "Right parietal bone mesh", "surface", [0.39, 0.6, -0.04], [0.2, 0.43, 0.4], bone),
      torus("mesh_left_orbital_rim", "Left eye socket orbital rim mesh", "structure", [-0.24, 0.4, 0.54], 0.16, 0.024, bone, [0, Math.PI / 2, 0]),
      torus("mesh_right_orbital_rim", "Right eye socket orbital rim mesh", "structure", [0.24, 0.4, 0.54], 0.16, 0.024, bone, [0, Math.PI / 2, 0]),
      ellipsoidMesh("mesh_left_eye_socket_void", "Left eye socket dark hollow mesh", "surface", [-0.24, 0.39, 0.57], [0.14, 0.105, 0.035], dark),
      ellipsoidMesh("mesh_right_eye_socket_void", "Right eye socket dark hollow mesh", "surface", [0.24, 0.39, 0.57], [0.14, 0.105, 0.035], dark),
      coneMesh("mesh_nasal_cavity", "Pear-shaped nasal cavity aperture mesh", "surface", [0, 0.18, 0.6], [0.14, 0.3, 0.07], dark, [Math.PI, 0, 0]),
      ellipsoidMesh("mesh_nasal_bridge", "Nasal bridge bone mesh", "surface", [0, 0.33, 0.59], [0.07, 0.17, 0.055], bone),
      tubeMesh("mesh_left_zygoma", "Left zygomatic cheekbone arch mesh", "structure", [[-0.16, 0.25, 0.52], [-0.36, 0.22, 0.45], [-0.52, 0.19, 0.24]], 0.045, bone),
      tubeMesh("mesh_right_zygoma", "Right zygomatic cheekbone arch mesh", "structure", [[0.16, 0.25, 0.52], [0.36, 0.22, 0.45], [0.52, 0.19, 0.24]], 0.045, bone),
      ellipsoidMesh("mesh_maxilla", "Upper jaw maxilla mesh", "structure", [0, 0.04, 0.46], [0.38, 0.18, 0.17], bone),
      ellipsoidMesh("mesh_palate", "Hard palate underside mesh", "surface", [0, -0.07, 0.33], [0.28, 0.045, 0.16], shadow),
      ellipsoidMesh("mesh_mandible", "Detached lower jaw mandible mesh", "structure", [0, -0.28, 0.34], [0.43, 0.16, 0.16], bone),
      tubeMesh("mesh_left_mandible_ram", "Left mandible ramus mesh", "structure", [[-0.36, -0.2, 0.22], [-0.42, 0.02, 0.24], [-0.34, 0.18, 0.32]], 0.055, bone),
      tubeMesh("mesh_right_mandible_ram", "Right mandible ramus mesh", "structure", [[0.36, -0.2, 0.22], [0.42, 0.02, 0.24], [0.34, 0.18, 0.32]], 0.055, bone),
      ellipsoidMesh("mesh_chin", "Rounded chin mental protuberance mesh", "surface", [0, -0.34, 0.42], [0.18, 0.08, 0.09], bone),
      ellipsoidMesh("mesh_left_temporal", "Left temporal bone depression mesh", "surface", [-0.5, 0.33, 0.08], [0.09, 0.18, 0.16], shadow),
      ellipsoidMesh("mesh_right_temporal", "Right temporal bone depression mesh", "surface", [0.5, 0.33, 0.08], [0.09, 0.18, 0.16], shadow),
    ];
    for (let i = 0; i < 8; i++) {
      const x = -0.245 + i * 0.07;
      nodes.push(ellipsoidMesh(`mesh_upper_tooth_${i}`, `Upper tooth ${i + 1} mesh`, "detail", [x, -0.105, 0.565], [0.025, 0.07, 0.026], "#eee8d3"));
      nodes.push(ellipsoidMesh(`mesh_lower_tooth_${i}`, `Lower tooth ${i + 1} mesh`, "detail", [x, -0.265, 0.54], [0.023, 0.055, 0.024], "#eee8d3"));
    }
    nodes.push(
      tubeMesh("mesh_left_brow_ridge", "Left brow ridge mesh", "surface", [[-0.42, 0.51, 0.5], [-0.25, 0.55, 0.55], [-0.08, 0.5, 0.52]], 0.035, bone),
      tubeMesh("mesh_right_brow_ridge", "Right brow ridge mesh", "surface", [[0.42, 0.51, 0.5], [0.25, 0.55, 0.55], [0.08, 0.5, 0.52]], 0.035, bone),
      tubeMesh("mesh_sagittal_suture", "Sagittal skull suture mesh", "detail", [[0, 1.18, -0.18], [0, 1.1, 0.08], [0, 0.95, 0.36]], 0.012, shadow),
      tubeMesh("mesh_coronal_suture_left", "Left coronal skull suture mesh", "detail", [[-0.44, 0.86, 0.18], [-0.22, 0.98, 0.28], [0, 1.02, 0.3]], 0.01, shadow),
      tubeMesh("mesh_coronal_suture_right", "Right coronal skull suture mesh", "detail", [[0.44, 0.86, 0.18], [0.22, 0.98, 0.28], [0, 1.02, 0.3]], 0.01, shadow),
      tubeMesh("mesh_left_dental_arcade", "Left dental arcade curve mesh", "surface", [[-0.33, -0.1, 0.48], [-0.2, -0.13, 0.58], [0, -0.14, 0.61]], 0.018, bone),
      tubeMesh("mesh_right_dental_arcade", "Right dental arcade curve mesh", "surface", [[0.33, -0.1, 0.48], [0.2, -0.13, 0.58], [0, -0.14, 0.61]], 0.018, bone)
    );
    log("Surface Agent", `Reconstructed anatomical skull mesh · ${nodes.length} mesh node(s)`, "ok");
    return { ...normalized, name: "Anatomical mesh skull", nodes: nodes.slice(0, MAX_FORGE_NODES) };
  }
  function parseJsonPayload(text, expected) {
    const raw = String(text || "").trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const source = fenced ? fenced[1] : raw;
    const candidates = [];
    const primary = extractJsonSpan(source, expected);
    if (primary) candidates.push(primary);
    candidates.push(source);
    for (const candidate of candidates) {
      const cleaned = cleanJsonLike(candidate);
      try {
        const parsed = JSON.parse(cleaned);
        if (expected === "array" && !Array.isArray(parsed)) continue;
        if (expected === "object" && (!parsed || Array.isArray(parsed) || typeof parsed !== "object")) continue;
        return parsed;
      } catch {}
    }
    throw new Error("could not parse JSON " + expected);
  }

  async function repairForgeJson(expected, prompt, badText, signal, modelValue) {
    const api = window._H;
    const model = modelValue || selectedModelFor("god");
    if (!api?.ollamaChat || !model) throw new Error("no JSON repair model");
    const schema = expected === "array"
      ? `[{"id":"stable_unique_id","name":"part","type":"mesh|lathe|extrude|capsule|sphere|cone|torus|box|cylinder","role":"structure|surface|detail","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"params":{},"color":"#9b7a46"}]`
      : `{"name":"short model name","nodes":[{"id":"stable_id","name":"part name","type":"mesh|lathe|extrude|capsule|sphere|cone|torus|box|cylinder","role":"structure|surface|detail|audit","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"params":{},"color":"#9b7a46"}],"edges":[],"constraints":[]}`;
    return await api.ollamaChat(model, [
      {
        role: "system",
        content: `You are a strict JSON repair tool. Return only valid JSON, no markdown, no comments, no prose. The output must be a JSON ${expected}. Use double quotes for every key and string. Remove trailing commas. If the input is prose, infer the closest valid Forge geometry JSON. Schema example: ${schema}`,
      },
      {
        role: "user",
        content: `Prompt: ${prompt}\n\nMalformed model output to repair:\n${String(badText || "").slice(0, 9000)}`,
      },
    ], null, signal);
  }

  function extractJsonSpan(text, expected) {
    const open = expected === "array" ? "[" : "{";
    const close = expected === "array" ? "]" : "}";
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start < 0 || end <= start) return "";
    return text.slice(start, end + 1);
  }

  function cleanJsonLike(text) {
    return String(text || "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();
  }

  function ensurePlanRichness(prompt, plan, allowLocalTemplates) {
    const normalized = normalizePlan(plan);
    if (!allowLocalTemplates) return normalized;
    const q = String(prompt || "").toLowerCase();
    const minNodes = ((/iphone|phone|smartphone|mobile/.test(q) || /laptop|macbook|notebook|computer/.test(q)) && /table|desk|workbench/.test(q)) ? 48 : /person|human|humanoid|character|man|woman|body|anatomy|skeleton/.test(q) ? 40 : /iphone|phone|smartphone|mobile|laptop|macbook|notebook|computer/.test(q) ? 22 : /table|desk|workbench|bench|dining/.test(q) ? 22 : needsTemplateAuthority(q) ? 18 : /long|complex|detailed|advanced|cad|blender|mechanism|machine/.test(q) ? 16 : 12;
    if (normalized.nodes.length >= minNodes) return normalized;
    const fallback = fallbackPlan(prompt);
    const existingNames = new Set(normalized.nodes.map((n) => `${n.name}`.toLowerCase()));
    const additions = fallback.nodes
      .filter((node) => !existingNames.has(`${node.name}`.toLowerCase()))
      .map((node, i) => ({ ...node, id: `local_${Date.now().toString(36)}_${i}_${node.id}` }))
      .slice(0, minNodes - normalized.nodes.length);
    if (additions.length) {
      normalized.nodes = normalized.nodes.concat(additions);
      log("Forge CAD", `Enriched sparse model plan with ${additions.length} procedural node(s)`, "ok", `${normalized.nodes.length} total`);
    }
    return normalized;
  }

  function isToolPlanSane(prompt, plan) {
    const q = String(prompt || "").toLowerCase();
    const normalized = normalizePlan(plan);
    if (isDroneLikePrompt(q)) return isDronePlanSane(plan);
    if (isSpoonLikePrompt(q)) return isSpoonPlanSane(plan);
    if (!isKnifeLikePrompt(q) && !isSwordLikePrompt(q)) return true;
    const nodes = renderableNodes(normalized.nodes);
    const bladeNodes = nodes.filter((node) => /blade|edge|tip|spine|fuller/i.test(`${node.id} ${node.name}`));
    const handleNodes = nodes.filter((node) => /handle|grip|guard|pommel|tang/i.test(`${node.id} ${node.name}`));
    if (!bladeNodes.length || !handleNodes.length) return false;
    const bladeBox = boundsForNodes(bladeNodes);
    const allBox = boundsForNodes(nodes);
    if (!bladeBox || !allBox) return false;
    const bladeSize = [
      bladeBox.max[0] - bladeBox.min[0],
      bladeBox.max[1] - bladeBox.min[1],
      bladeBox.max[2] - bladeBox.min[2],
    ];
    const allSize = [
      allBox.max[0] - allBox.min[0],
      allBox.max[1] - allBox.min[1],
      allBox.max[2] - allBox.min[2],
    ];
    const longestBladeAxis = bladeSize.indexOf(Math.max(...bladeSize));
    const longestAll = Math.max(...allSize);
    const verticalDominance = allSize[1] > Math.max(allSize[0], allSize[2]) * 1.35;
    const bladeTooChunky = Math.max(bladeSize[(longestBladeAxis + 1) % 3], bladeSize[(longestBladeAxis + 2) % 3]) > Math.max(bladeSize[longestBladeAxis] * 0.45, 0.45);
    return longestAll >= 1.2 && !verticalDominance && !bladeTooChunky;
  }

  function isDronePlanSane(plan) {
    const normalized = normalizePlan(plan);
    const nodes = renderableNodes(normalized.nodes);
    const rotorNodes = nodes.filter((node) => /rotor|prop|propeller|guard|motor/i.test(`${node.id} ${node.name}`));
    const bodyNodes = nodes.filter((node) => /body|core|fuselage|avionics|st.camera|lens/i.test(`${node.id} ${node.name}`));
    const guardNodes = nodes.filter((node) => /guard|halo/i.test(`${node.id} ${node.name}`));
    const propNodes = nodes.filter((node) => /prop|propeller|blade/i.test(`${node.id} ${node.name}`));
    const landingNodes = nodes.filter((node) => /landing|skid|strut/i.test(`${node.id} ${node.name}`));
    if (rotorNodes.length < 12 || !bodyNodes.length || guardNodes.length < 4 || propNodes.length < 4 || !landingNodes.length) return false;
    const allBox = boundsForNodes(nodes);
    if (!allBox) return false;
    const size = [
      allBox.max[0] - allBox.min[0],
      allBox.max[1] - allBox.min[1],
      allBox.max[2] - allBox.min[2],
    ];
    return Math.max(size[0], size[2]) >= 1.8 && size[1] < Math.max(size[0], size[2]) * 0.75;
  }

  function isPhonePlanSane(plan) {
    const normalized = normalizePlan(plan);
    const nodes = renderableNodes(normalized.nodes);
    if (nodes.length < 16) return false;
    const text = nodes.map((node) => `${node.id} ${node.name} ${node.type}`).join(" ").toLowerCase();
    const cameraNodes = nodes.filter((node) => /st.camera|lens|flash/i.test(`${node.id} ${node.name}`));
    const controlNodes = nodes.filter((node) => /button|port|speaker|notch|sensor|bezel|rail|frame/i.test(`${node.id} ${node.name}`));
    const hasBody = /\b(body|chassis|frame|case|shell)\b/.test(text);
    const hasScreen = /\b(screen|display|glass|panel)\b/.test(text);
    const box = boundsForNodes(nodes);
    if (!box) return false;
    const size = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]].sort((a, b) => a - b);
    const thinEnough = size[0] <= Math.max(0.18, size[2] * 0.22);
    const longEnough = size[2] >= size[1] * 1.35;
    return hasBody && hasScreen && cameraNodes.length >= 3 && controlNodes.length >= 4 && thinEnough && longEnough;
  }

  function isLaptopPlanSane(plan) {
    const normalized = normalizePlan(plan);
    const nodes = renderableNodes(normalized.nodes);
    if (nodes.length < 18) return false;
    const text = nodes.map((node) => `${node.id} ${node.name} ${node.type}`).join(" ").toLowerCase();
    return /base|chassis/.test(text) && /screen|display|lid/.test(text) && /keyboard|key/.test(text) && /trackpad|touchpad/.test(text) && /hinge/.test(text);
  }

  function reconstructPhoneStructure(prompt, plan) {
    const normalized = normalizePlan(plan);
    if (isPhonePlanSane(normalized)) return normalized;
    const rebuilt = phonePlan(prompt);
    log("Geometry Kernel", `Rebuilt phone-specific product model · ${renderableNodes(rebuilt.nodes).length} part(s)`, "warn");
    return rebuilt;
  }

  function reconstructLaptopStructure(prompt, plan) {
    const normalized = normalizePlan(plan);
    if (isLaptopPlanSane(normalized)) return normalized;
    const rebuilt = laptopPlan(prompt);
    log("Geometry Kernel", `Rebuilt laptop-specific product model · ${renderableNodes(rebuilt.nodes).length} part(s)`, "warn");
    return rebuilt;
  }

  function reconstructKnownObjectStructure(prompt, plan) {
    const normalized = normalizePlan(plan);
    if (isDroneLikePrompt(prompt) && !isDronePlanSane(normalized)) {
      const rebuilt = dronePlan(prompt);
      log("Geometry Kernel", `Rebuilt drone-specific engineering model · ${renderableNodes(rebuilt.nodes).length} part(s)`, "warn");
      return rebuilt;
    }
    if ((isKnifeLikePrompt(prompt) || isSwordLikePrompt(prompt)) && !isToolPlanSane(prompt, normalized)) {
      const rebuilt = fallbackPlan(prompt);
      log("Geometry Kernel", `Rebuilt tool-specific model · ${renderableNodes(rebuilt.nodes).length} part(s)`, "warn");
      return rebuilt;
    }
    return normalized;
  }

  function isSpoonPlanSane(plan) {
    return normalizePlan(plan).nodes.length > 0;
  }

  function enforceSingleMainModel(prompt, plan) {
    let normalized = normalizePlan(plan);
    if (isPhonePrompt(prompt) && !isPhonePlanSane(normalized)) {
      normalized = reconstructPhoneStructure(prompt, normalized);
    }
    if (isLaptopPrompt(prompt) && !isLaptopPlanSane(normalized)) {
      normalized = reconstructLaptopStructure(prompt, normalized);
    }
    if (needsTemplateAuthority(prompt) && !isToolPlanSane(prompt, normalized)) {
      normalized = reconstructKnownObjectStructure(prompt, normalized);
    }
    if (isAnimalPrompt(prompt) && !isAnimalPlanSane(prompt, normalized)) {
      normalized = reconstructMeshStructure(prompt, normalized);
    }
    if (isSkullPrompt(prompt)) {
      normalized = reconstructSkullStructure(prompt, normalized);
    }
    if (isSpoonLikePrompt(prompt)) {
      normalized = reconstructSpoonStructure(prompt, normalized);
    }
    normalized = keepLargestConnectedModel(prompt, normalized);
    return centerAndGroundPlan(normalized);
  }

  function isAnimalPlanSane(prompt, plan) {
    if (!isAnimalPrompt(prompt)) return true;
    const normalized = normalizePlan(plan);
    const nodes = renderableNodes(normalized.nodes);
    if (nodes.length < 14) return false;
    const labels = nodes.map((node) => `${node.id} ${node.name} ${node.type}`).join(" ").toLowerCase();
    const legNodes = nodes.filter((node) => /leg|paw|foot|hind|front/i.test(`${node.id} ${node.name}`));
    const organicNodes = nodes.filter((node) => ["mesh", "lathe", "capsule", "sphere"].includes(node.type));
    const hasTorso = /\b(torso|body|chest|hip|abdomen)\b/.test(labels);
    const hasHead = /\b(head|muzzle|snout|face)\b/.test(labels);
    const hasAnimalDetails = /\b(ear|tail)\b/.test(labels);
    if (!hasTorso || !hasHead || !hasAnimalDetails || legNodes.length < 8 || organicNodes.length < 10) return false;
    const stats = connectedModelStats(nodes);
    return stats.clusterCount <= 1 || stats.largestCount >= nodes.length - 2;
  }

  function keepLargestConnectedModel(prompt, plan) {
    const normalized = normalizePlan(plan);
    if (allowsMultipleForgeSubjects(prompt)) return normalized;
    const nodes = renderableNodes(normalized.nodes);
    if (nodes.length < 4) return normalized;
    const stats = connectedModelStats(nodes);
    if (stats.clusterCount <= 1 || !stats.largestCluster.length) return normalized;
    if (stats.largestCount < Math.max(4, nodes.length * 0.45)) return normalized;
    const keepIds = new Set(stats.largestCluster.map((node) => node.id));
    const removed = nodes.length - keepIds.size;
    if (removed <= 0) return normalized;
    normalized.nodes = normalized.nodes.filter((node) => node.role === "audit" || keepIds.has(node.id));
    log("Audit Agent", `Removed ${removed} detached part(s) outside the main model`, "warn");
    return normalized;
  }

  function allowsMultipleForgeSubjects(prompt) {
    const q = String(prompt || "").toLowerCase();
    return /\b(two|three|four|five|pair|set of|collection|group|st.scene|diorama|room|city|street|landscape)\b/.test(q)
      || /\bon (a |the )?(table|desk|workbench|floor|shelf)\b/.test(q);
  }

  function connectedModelStats(nodes) {
    const items = (Array.isArray(nodes) ? nodes : [])
      .map((node, index) => {
        const extents = nodeApproxExtents(node);
        const radius = Math.max(0.035, Math.hypot(extents[0], extents[1], extents[2]));
        return {
          node,
          index,
          center: vec3(node.position, [0, 0, 0]),
          radius,
        };
      });
    if (!items.length) return { clusterCount: 0, largestCount: 0, largestCluster: [] };
    const box = boundsForNodes(items.map((item) => item.node));
    const size = box ? [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]] : [1, 1, 1];
    const diag = Math.max(0.5, Math.hypot(size[0], size[1], size[2]));
    const slack = Math.max(0.22, Math.min(0.75, diag * 0.14));
    const parent = items.map((_, i) => i);
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const unite = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const d = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1], a.center[2] - b.center[2]);
        if (d <= a.radius + b.radius + slack) unite(i, j);
      }
    }
    const groups = new Map();
    items.forEach((item, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(item.node);
    });
    const clusters = Array.from(groups.values()).sort((a, b) => b.length - a.length);
    return {
      clusterCount: clusters.length,
      largestCount: clusters[0]?.length || 0,
      largestCluster: clusters[0] || [],
    };
  }

  function centerAndGroundPlan(plan) {
    const normalized = normalizePlan(plan);
    const nodes = renderableNodes(normalized.nodes);
    const box = boundsForNodes(nodes);
    if (!box) return normalized;
    const dx = -((box.min[0] + box.max[0]) / 2);
    const dy = FLOOR_Y + 0.015 - box.min[1];
    const dz = -((box.min[2] + box.max[2]) / 2);
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001 && Math.abs(dz) < 0.001) return normalized;
    normalized.nodes = normalized.nodes.map((node) => ({
      ...node,
      position: [
        (node.position?.[0] || 0) + dx,
        (node.position?.[1] || 0) + dy,
        (node.position?.[2] || 0) + dz,
      ],
    }));
    return normalized;
  }

  function boundsForNodes(nodes) {
    if (!nodes.length) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    nodes.forEach((node) => {
      const p = node.position || [0, 0, 0];
      const e = nodeApproxExtents(node);
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], (p[i] || 0) - e[i]);
        max[i] = Math.max(max[i], (p[i] || 0) + e[i]);
      }
    });
    return { min, max };
  }

  function nodeApproxExtents(node) {
    const p = node.params || {};
    const s = node.scale || [1, 1, 1];
    if (node.type === "mesh" && Array.isArray(p.positions) && p.positions.length >= 9) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.positions.length; i += 3) {
        for (let axis = 0; axis < 3; axis++) {
          const value = Number(p.positions[i + axis]) || 0;
          min[axis] = Math.min(min[axis], value);
          max[axis] = Math.max(max[axis], value);
        }
      }
      return [
        Math.max(0.02, ((max[0] - min[0]) / 2) * Math.abs(s[0] || 1)),
        Math.max(0.02, ((max[1] - min[1]) / 2) * Math.abs(s[1] || 1)),
        Math.max(0.02, ((max[2] - min[2]) / 2) * Math.abs(s[2] || 1)),
      ];
    }
    if (node.type === "box" || node.type === "extrude") return [(p.width || 1) * (s[0] || 1) / 2, (p.height || p.depth || 1) * (s[1] || 1) / 2, (p.depth || 1) * (s[2] || 1) / 2];
    if (node.type === "cylinder" || node.type === "capsule" || node.type === "cone") return [(p.radius || 0.2) * (s[0] || 1), (p.height || p.length || 1) * (s[1] || 1) / 2, (p.radius || 0.2) * (s[2] || 1)];
    if (node.type === "sphere") return [(p.radius || 0.3) * (s[0] || 1), (p.radius || 0.3) * (s[1] || 1), (p.radius || 0.3) * (s[2] || 1)];
    if (node.type === "torus") return [(p.radius || 0.5) * (s[0] || 1), (p.tube || 0.05) * (s[1] || 1), (p.radius || 0.5) * (s[2] || 1)];
    return [0.3, 0.3, 0.3];
  }

  function localRoleAdditions(role, prompt, plan) {
    const fallback = fallbackPlan(prompt);
    const existing = new Set((plan.nodes || []).map((n) => `${n.name}`.toLowerCase()));
    return fallback.nodes
      .filter((node) => node.role === role && !existing.has(`${node.name}`.toLowerCase()))
      .map((node, i) => ({ ...node, id: `fallback_${role}_${Date.now().toString(36)}_${i}_${node.id}` }))
      .slice(0, role === "detail" ? 6 : 4);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return { runGodAgent, sleep, failForgeRun };
}
