/**
 * Wave 18 — messages/format.js + forge/plans-templates.js
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function write(rel, content) {
  fs.writeFileSync(path.join(ROOT, rel), content);
}

function sliceLines(rel, start, end) {
  return read(rel).split('\n').slice(start - 1, end - 1).join('\n');
}

// --- forge/plans-templates.js ---
const templatesBody = sliceLines('src/js/modes/forge/agents-run.js', 812, 843)
  + '\n\n'
  + sliceLines('src/js/modes/forge/agents-run.js', 844, 986)
  + '\n\n'
  + sliceLines('src/js/modes/forge/agents-run.js', 1043, 1059)
  + '\n\n'
  + sliceLines('src/js/modes/forge/agents-run.js', 1373, 1762);

write('src/js/modes/forge/plans-templates.js', `/** Procedural template plans + mesh geometry builders (Wave 18). */
import { FLOOR_Y, MAX_FORGE_NODES } from './constants.js';
import { normalizePlan, vec3, box, cyl, capsule, sphere, ellipsoid, cone, torus, lathe } from './plan.js';

export function createForgePlansTemplatesApi(ctx) {
  const {
    log, renderableNodes,
    isKnifeLikePrompt, isSpoonLikePrompt, isSwordLikePrompt, isDroneLikePrompt,
    roverPlan, dronePlan, housePlan, towerPlan, mechanismPlan,
  } = ctx;

${templatesBody}

  return {
    fallbackPlan,
    spoonPlan, knifePlan, swordPlan, tablePlan, personPlan, phonePlan, laptopPlan,
     electronicsDeskScenePlan, genericPlan,
    humanBodyModelNodes, humanSkeletonLibraryNodes, offsetNodes, prefixNodes,
    ellipsoidMesh, spoonBowlMesh, taperedHandleMesh, coneMesh, tubeMesh,
    makeConcaveOvalBowlMeshParams, makeTaperedHandleMeshParams,
    makeEllipsoidMeshParams, makeConeMeshParams, makeTubeMeshParams,
    reconstructSpoonStructure,
  };
}
`);

// Trim agents-run.js — remove extracted blocks (1-indexed line numbers)
const agentLines = read('src/js/modes/forge/agents-run.js').split('\n');
const keep = [
  ...agentLines.slice(0, 811),      // through end of reconstructSkullStructure block start - wait
];
// Need precise cuts. Read line 808-815 and 1368-1375
console.log('agents-run line 808:', agentLines[807]);
console.log('agents-run line 812:', agentLines[811]);
console.log('agents-run line 843:', agentLines[842]);
console.log('agents-run line 1040:', agentLines[1039]);
console.log('agents-run line 1060:', agentLines[1059]);
console.log('agents-run line 1370:', agentLines[1369]);
console.log('agents-run line 1763:', agentLines[1762]);
