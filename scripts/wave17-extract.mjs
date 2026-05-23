/**
 * Wave 17 — extract forge + systems modules from monoliths.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function write(rel, content) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function sliceLines(rel, startLine, endLine) {
  const lines = read(rel).split('\n');
  return lines.slice(startLine - 1, endLine - 1).join('\n');
}

const FORGE_STATE = [
  'mounted', 'initialized', 'THREE', 'OrbitControls', 'TransformControls',
  'GLTFLoader', 'GLTFExporter', 'STLExporter', 'OBJExporter',
  'renderer', 'scene', 'camera', 'controls', 'modelGroup', 'particleGroup', 'starField',
  'activePlan', 'raf', 'flights', 'revealMeshes', 'logoMeshes', 'logoBobT', 'scanMesh',
  'abortCtrl', 'eventsWired', 'traceStartTime', 'traceRunCount',
  'raycaster', 'pointer', 'transformControls', 'selectedMesh', 'selectedObjectWhole', 'selectionBox',
  'transformMode', 'snapEnabled', 'underfloorTick',
  'forgeProjects', 'activeProjectId', 'projectSaveTimer', 'activeReferenceBrief', 'activeForgeRoute',
];

function toStRefs(code) {
  let out = code;
  for (const key of [...FORGE_STATE].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\b${key}\\b`, 'g'), `st.${key}`);
  }
  return out;
}

function forgeBody(startLine, endLine, opts = {}) {
  let body = sliceLines('src/js/modes/forge/forge-mode.js', startLine, endLine);
  if (opts.st) body = toStRefs(body);
  return body;
}

// --- forge/projects.js (41-196) ---
write('src/js/modes/forge/projects.js', `/** Forge project persistence (Wave 17). */
import { PROJECT_STORE_KEY } from './constants.js';
import { normalizePlan } from './plan.js';

export function createForgeProjectsApi(ctx) {
  const {
    $, st, escapeHtml, setStatus, log, updatePlanList, buildPlan, renderAgents,
    restoreModelRoutes, clearScene, AGENTS, modelLabel,
  } = ctx;

${forgeBody(41, 197, { st: true })}

  return {
    loadForgeProjects, persistForgeProjects, renderForgeProjects, saveCurrentProject,
    queueProjectSave, newForgeProject, openForgeProject, deleteForgeProject,
    cloneJson, projectNameFromPrompt, currentModelRoutes, restoreModelRoutes,
  };
}
`);

// --- forge/prompts.js (1422-1478) ---
write('src/js/modes/forge/prompts.js', `/** Forge prompt classification (Wave 17). */

export function createForgePromptsApi() {

${forgeBody(1422, 1479)}

  return {
    isSkeletonOnlyPrompt, needsTemplateAuthority, isKnifeLikePrompt, isSpoonLikePrompt,
    isSwordLikePrompt, isDroneLikePrompt, isPhonePrompt, isLaptopPrompt, classifyForgePrompt,
  };
}
`);

// --- forge/plans-samples.js (3224-3367) ---
write('src/js/modes/forge/plans-samples.js', `/** Built-in sample / template plans (Wave 17). */
import { box, cyl, sphere, vec3 } from './plan.js';

export function createForgePlansSamplesApi(ctx) {
  const { classifyForgePrompt } = ctx;

${forgeBody(3224, 3368)}

  return {
    hLogoPlan, chairPlan, roverPlan, dronePlan, labelWords, housePlan, towerPlan, mechanismPlan,
    spoonPlan, knifePlan, swordPlan, tablePlan, personPlan, phonePlan, laptopPlan,
    electronicsDeskScenePlan, genericPlan, humanBodyModelNodes, humanSkeletonLibraryNodes,
    offsetNodes, prefixNodes,
  };
}
`);

// viewport: 332-1419, skip duplicate mesh helpers 1277-1334 (in plan.js)
const viewportPart1 = forgeBody(332, 1277, { st: true });
const viewportPart2 = forgeBody(1324, 1420, { st: true });
write('src/js/modes/forge/viewport.js', `/** Forge Three.js viewport + CAD (Wave 17). */
import { FLOOR_Y } from './constants.js';
import { normalizePlan, meshNodesFromScene, serializeGeometry, safeFileName } from './plan.js';

export function createForgeViewportApi(ctx) {
  const {
    $, st, escapeHtml, setStatus, log, updatePlanList, renderableNodes, renderSelection,
    renderCadToolbar, syncSelectedNodeFromMesh,
  } = ctx;

${viewportPart1}
${viewportPart2}

  return {
    initThree, clearScene, buildPlan, resetView, frameModel, selectMesh, selectWholeObject,
    selectNodeById, deleteSelectedPart, duplicateSelectedPart, resetSelectedPart,
    alignSelectedToFloor, setTransformMode, setSnapEnabled, updateSelectedScale,
    updateSelectedPosition, updateSelectedRotation, focusCameraOnSelection, panCameraVertical,
    exportForgeAsset, importForgeAsset, exportableObject, spawnFlightsTo, selectableMeshes,
    renderCadToolbar, renderSelection,
  };
}
`);

// agents-run: 1480-3222 (includes mesh helpers used only by agents)
write('src/js/modes/forge/agents-run.js', `/** Forge god-agent pipeline + plan generation (Wave 17). */
import {
  AGENTS, FLOOR_Y, MAX_FORGE_NODES,
  FORGE_REFERENCE_SOURCES, FORGE_BLOCKED_REFERENCE_DOMAINS, FORGE_ALLOWED_MODEL_PROVIDERS,
} from './constants.js';
import {
  normalizePlan, vec3, box, cyl, capsule, sphere, ellipsoid, cone, torus, lathe, logo,
} from './plan.js';

export function createForgeAgentsRunApi(ctx) {
  const {
    $, st, escapeHtml, setStatus, log, traceKind, forgePrefs, updateStage, resetStages,
    setAgentState, renderAgents, selectedModelFor, modelLabel, updatePlanList, buildPlan,
    clearScene, initThree, queueProjectSave, autoAssignForgeModels, agentsRouting,
    classifyForgePrompt, needsTemplateAuthority, isKnifeLikePrompt, isSpoonLikePrompt,
    isSwordLikePrompt, isDroneLikePrompt, isPhonePrompt, isLaptopPrompt, isSkeletonOnlyPrompt,
    hLogoPlan, chairPlan, roverPlan, dronePlan, housePlan, towerPlan, mechanismPlan,
    spoonPlan, knifePlan, swordPlan, tablePlan, personPlan, phonePlan, laptopPlan,
    electronicsDeskScenePlan, genericPlan, humanBodyModelNodes, humanSkeletonLibraryNodes,
    offsetNodes, prefixNodes, labelWords,
  } = ctx;

${forgeBody(1480, 3223, { st: true })}

  return { runGodAgent, sleep, failForgeRun };
}
`);

// wire: 3374-3522
write('src/js/modes/forge/wire.js', `/** Forge DOM event wiring + lifecycle (Wave 17). */

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

${forgeBody(3374, 3523, { st: true })}

  return { wireEvents, mount, destroy };
}
`);

// --- systems/spec-normalize.js (274-818) ---
write('src/js/modes/systems/spec-normalize.js', `/** Systems spec normalization (Wave 17). */
import { slug, titleCase, fieldType, structuredCloneSafe } from './utils.js';
import { detectDomain } from './domain-config.js';

export function createSystemsSpecApi(ctx) {
  const { getRuntimeData } = ctx;

${sliceLines('src/js/modes/systems/system-maker.js', 274, 773)}

  return {
    defaultFields, normalizeSpec, normalizeEntities, normalizeField, normalizeData,
    normalizeRecord, generateRows, seededRand, sampleValue,
  };
}
`);

// --- systems/generate.js (824-1985) — includes fallbackSystem, inferName wrapper ---
write('src/js/modes/systems/generate.js', `/** Systems AI generation pipeline (Wave 17). */
import {
  CREATIVE_DIRECTIVES, FINANCE_ENTITY_IDS, FALLBACK_SCREENS, ACCENT_PALETTE,
} from './constants.js';
import {
  esc, pickRandom, uid, structuredCloneSafe, slug, titleCase, threeWords,
} from './utils.js';
import { detectDomain, DOMAIN_CONFIG, DOMAIN_SHELL_OPTIONS, inferNameFromDesc } from './domain-config.js';

export function createSystemsGenerateApi(ctx) {
  const {
    $, st, setStatus, trace, clearTrace, updateCreateButtonState, stopSystemGeneration,
    getActive, getRuntimeData, saveRuntimeData, saveSystems, renderAll,
    normalizeSpec, defaultFields, moduleIcon,
  } = ctx;

  function inferName(desc) {
    return inferNameFromDesc(desc);
  }

${sliceLines('src/js/modes/systems/system-maker.js', 824, 2025)}

  return {
    fallbackSystem, systemPrompt, generateWithModel, createSystem, callModel,
    parseSpecJson, finalizeGeneratedSpec, assertRenderableSpec,
  };
}
`);

console.log('Wave 17 module files written.');
