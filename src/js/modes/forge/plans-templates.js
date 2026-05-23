/** Procedural template plans + mesh geometry builders (Wave 18). */
import { FLOOR_Y, MAX_FORGE_NODES } from './constants.js';
import { normalizePlan, vec3, box, cyl, capsule, sphere, ellipsoid, cone, torus, lathe } from './plan.js';

export function createForgePlansTemplatesApi(ctx) {
  const {
    log, renderableNodes,
    isKnifeLikePrompt, isSpoonLikePrompt, isSwordLikePrompt, isDroneLikePrompt, isSkeletonOnlyPrompt,
    roverPlan, dronePlan, housePlan, towerPlan, mechanismPlan,
  } = ctx;

  function ellipsoidMesh(id, name, role, position, radii, color, rotation) {
    return { id, name, role, type: "mesh", position, rotation: rotation || [0, 0, 0], scale: [1, 1, 1], params: makeEllipsoidMeshParams(radii[0], radii[1], radii[2]), color, opacity: 0.98 };
  }

  function spoonBowlMesh(id, name, role, position, length, width, depth, color) {
    return { id, name, role, type: "mesh", position, rotation: [0, 0, 0], scale: [1, 1, 1], params: makeConcaveOvalBowlMeshParams(length, width, depth), color, opacity: 0.98 };
  }

  function taperedHandleMesh(id, name, role, position, length, wide, narrow, thickness, color) {
    return { id, name, role, type: "mesh", position, rotation: [0, 0, 0], scale: [1, 1, 1], params: makeTaperedHandleMeshParams(length, wide, narrow, thickness), color, opacity: 0.98 };
  }

  function coneMesh(id, name, role, position, radii, color, rotation) {
    return { id, name, role, type: "mesh", position, rotation: rotation || [0, 0, 0], scale: [1, 1, 1], params: makeConeMeshParams(radii[0], radii[1], radii[2]), color, opacity: 0.98 };
  }

  function makeConcaveOvalBowlMeshParams(length, width, depth, radial = 24, rings = 8) {
    const positions = [];
    const indices = [];
    for (let ring = 0; ring <= rings; ring++) {
      const r = ring / rings;
      const y = -depth * Math.pow(1 - r, 1.55) + (ring === rings ? depth * 0.18 : 0);
      for (let i = 0; i < radial; i++) {
        const a = i / radial * Math.PI * 2;
        const taper = 1 - 0.12 * Math.max(0, -Math.cos(a));
        positions.push(Math.cos(a) * length * 0.5 * r * taper, y, Math.sin(a) * width * 0.5 * r);
      }
    }
    for (let ring = 0; ring < rings; ring++) {
      for (let i = 0; i < radial; i++) {
        const a = ring * radial + i;
        const b = ring * radial + ((i + 1) % radial);
        const c = (ring + 1) * radial + i;
        const d = (ring + 1) * radial + ((i + 1) % radial);
        indices.push(a, c, b, b, c, d);
      }
    }
    return { positions, indices, subdivisions: 1 };
  }

  function makeTaperedHandleMeshParams(length, wide, narrow, thickness, segments = 10) {
    const positions = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = -length / 2 + t * length;
      const halfW = (wide + (narrow - wide) * t) / 2;
      const crown = Math.sin(t * Math.PI) * thickness * 0.22;
      positions.push(x, thickness / 2 + crown, -halfW, x, thickness / 2 + crown, halfW, x, -thickness / 2, -halfW * 0.88, x, -thickness / 2, halfW * 0.88);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
      indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      indices.push(a, a + 2, b, a + 2, b + 2, b);
      indices.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
    }
    indices.push(0, 1, 2, 1, 3, 2);
    const end = segments * 4;
    indices.push(end, end + 2, end + 1, end + 1, end + 2, end + 3);
    return { positions, indices, subdivisions: 1 };
  }

  function tubeMesh(id, name, role, points, radius, color) {
    const start = points[0] || [0, 0, 0];
    return { id, name, role, type: "mesh", position: start, rotation: [0, 0, 0], scale: [1, 1, 1], params: makeTubeMeshParams(points.map((p) => [p[0] - start[0], p[1] - start[1], p[2] - start[2]]), radius), color, opacity: 0.98 };
  }

  function makeEllipsoidMeshParams(rx, ry, rz, seg = 28, rings = 18) {
    const positions = [];
    const indices = [];
    for (let y = 0; y <= rings; y++) {
      const v = y / rings;
      const phi = v * Math.PI;
      for (let x = 0; x <= seg; x++) {
        const u = x / seg;
        const theta = u * Math.PI * 2;
        positions.push(rx * Math.sin(phi) * Math.cos(theta), ry * Math.cos(phi), rz * Math.sin(phi) * Math.sin(theta));
      }
    }
    for (let y = 0; y < rings; y++) {
      for (let x = 0; x < seg; x++) {
        const a = y * (seg + 1) + x;
        const b = a + seg + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { positions, indices, subdivisions: 1 };
  }

  function makeConeMeshParams(rx, height, rz, seg = 14) {
    const positions = [0, height / 2, 0, 0, -height / 2, 0];
    const indices = [];
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2;
      positions.push(rx * Math.cos(a), -height / 2, rz * Math.sin(a));
    }
    for (let i = 0; i < seg; i++) {
      const cur = 2 + i;
      const next = 2 + ((i + 1) % seg);
      indices.push(0, cur, next, 1, next, cur);
    }
    return { positions, indices, subdivisions: 1 };
  }

  function makeTubeMeshParams(points, radius, radial = 10) {
    const positions = [];
    const indices = [];
    const pts = points.length >= 2 ? points : [[0, 0, 0], [0, 1, 0]];
    pts.forEach((p, i) => {
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const prev = pts[Math.max(0, i - 1)];
      const tangent = normalize3([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
      const up = Math.abs(tangent[1]) > 0.85 ? [1, 0, 0] : [0, 1, 0];
      const side = normalize3(cross3(tangent, up));
      const normal = normalize3(cross3(side, tangent));
      for (let r = 0; r < radial; r++) {
        const a = r / radial * Math.PI * 2;
        positions.push(p[0] + (side[0] * Math.cos(a) + normal[0] * Math.sin(a)) * radius, p[1] + (side[1] * Math.cos(a) + normal[1] * Math.sin(a)) * radius, p[2] + (side[2] * Math.cos(a) + normal[2] * Math.sin(a)) * radius);
      }
    });
    for (let i = 0; i < pts.length - 1; i++) {
      for (let r = 0; r < radial; r++) {
        const a = i * radial + r;
        const b = i * radial + ((r + 1) % radial);
        const c = (i + 1) * radial + r;
        const d = (i + 1) * radial + ((r + 1) % radial);
        indices.push(a, c, b, b, c, d);
      }
    }
    return { positions, indices, subdivisions: 1 };
  }

  function normalize3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }


  function reconstructSpoonStructure(prompt, plan) {
    const normalized = normalizePlan(plan);
    if (!isSpoonLikePrompt(prompt)) return normalized;
    const text = normalized.nodes.map((n) => `${n.id} ${n.name} ${n.type}`).join(" ").toLowerCase();
    const hasSpoonMesh = /\b(concave .*bowl|spoon_bowl|tapered .*handle|spoon_handle)\b/.test(text);
    const meshCount = normalized.nodes.filter((n) => n.type === "mesh").length;
    if (hasSpoonMesh && meshCount >= 5 && normalized.nodes.length >= 12) return normalized;
    const steel = "#cfd8d4";
    const bright = "#f5fbf7";
    const shadow = "#7f8b87";
    const dark = "#424c49";
    const nodes = [
      spoonBowlMesh("spoon_bowl_concave", "Concave oval spoon bowl polished metal mesh", "structure", [0.82, 0.03, 0], 0.62, 0.38, 0.14, steel),
      torus("spoon_bowl_raised_rim", "Raised oval bowl rim lip polished metal", "surface", [0.82, 0.08, 0], 0.38, 0.018, bright, [Math.PI / 2, 0, 0]),
      spoonBowlMesh("spoon_inner_shadow", "Inner concave scoop shadow surface", "surface", [0.82, 0.018, 0], 0.48, 0.29, 0.09, shadow),
      taperedHandleMesh("spoon_handle_tapered", "Long tapered spoon handle polished metal mesh", "structure", [-0.58, 0.025, 0], 1.86, 0.22, 0.11, 0.045, steel),
      taperedHandleMesh("spoon_handle_top_highlight", "Raised handle center highlight ridge", "surface", [-0.58, 0.064, 0], 1.55, 0.085, 0.045, 0.012, bright),
      tubeMesh("spoon_neck_transition", "Curved neck transition from handle into bowl", "structure", [[0.12, 0.045, 0], [0.28, 0.056, 0], [0.43, 0.062, 0]], 0.07, steel),
      tubeMesh("spoon_left_shoulder", "Left bowl shoulder blend into neck", "surface", [[0.24, 0.06, -0.055], [0.43, 0.07, -0.19], [0.63, 0.075, -0.3]], 0.018, bright),
      tubeMesh("spoon_right_shoulder", "Right bowl shoulder blend into neck", "surface", [[0.24, 0.06, 0.055], [0.43, 0.07, 0.19], [0.63, 0.075, 0.3]], 0.018, bright),
      tubeMesh("spoon_left_handle_bevel", "Left handle rolled bevel edge", "detail", [[-1.5, 0.05, -0.055], [-0.85, 0.058, -0.082], [-0.02, 0.055, -0.108]], 0.011, bright),
      tubeMesh("spoon_right_handle_bevel", "Right handle rolled bevel edge", "detail", [[-1.5, 0.05, 0.055], [-0.85, 0.058, 0.082], [-0.02, 0.055, 0.108]], 0.011, bright),
      ellipsoidMesh("spoon_handle_rounded_end", "Rounded handle end cap polished metal", "surface", [-1.54, 0.032, 0], [0.075, 0.026, 0.105], steel),
      tubeMesh("spoon_bowl_left_specular_line", "Left bowl specular metal highlight", "detail", [[0.62, 0.096, -0.19], [0.85, 0.112, -0.24], [1.12, 0.09, -0.14]], 0.009, bright),
      tubeMesh("spoon_bowl_right_specular_line", "Right bowl specular metal highlight", "detail", [[0.62, 0.096, 0.19], [0.85, 0.112, 0.24], [1.12, 0.09, 0.14]], 0.009, bright),
      ellipsoidMesh("spoon_bowl_deep_scoop_center", "Deepest point of concave scoop", "detail", [0.88, -0.056, 0], [0.16, 0.018, 0.11], dark),
    ];
    nodes[1].scale = [1.55, 0.18, 1];
    log("Surface Agent", `Reconstructed spoon-specific CAD mesh · ${nodes.length} mesh node(s)`, "ok");
    return { ...normalized, name: "Polished metal spoon", nodes: nodes.slice(0, MAX_FORGE_NODES) };
  }

  function fallbackPlan(prompt) {
    const q = String(prompt || "").toLowerCase();
    if ((/iphone|phone|smartphone|mobile/.test(q) || /laptop|macbook|notebook|computer/.test(q)) && /table|desk|workbench/.test(q)) return electronicsDeskScenePlan(prompt);
    if (isSpoonLikePrompt(q)) return spoonPlan(prompt);
    if (isKnifeLikePrompt(q)) return knifePlan(prompt);
    if (isSwordLikePrompt(q)) return swordPlan(prompt);
    if (/person|human|humanoid|character|man|woman|body|anatomy|skeleton/.test(q)) return personPlan(prompt);
    if (/iphone|phone|smartphone|mobile/.test(q)) return phonePlan(prompt);
    if (/laptop|macbook|notebook|computer/.test(q)) return laptopPlan(prompt);
    if (/table|desk|workbench|bench|dining/.test(q)) return tablePlan(prompt);
    if (/rover|car|vehicle|truck/.test(q)) return roverPlan();
    if (/house|building|cabin|villa|home/.test(q)) return housePlan();
    if (isDroneLikePrompt(q)) return dronePlan(prompt);
    if (/tower|skyscraper|castle/.test(q)) return towerPlan();
    if (/watch|clock|gear|mechanism/.test(q)) return mechanismPlan();
    return genericPlan(prompt);
  }

  function spoonPlan(prompt) {
    return reconstructSpoonStructure(prompt || "spoon", { name: "Polished metal spoon", nodes: [] });
  }

  function knifePlan(prompt) {
    const q = String(prompt || "").toLowerCase();
    const chef = /chef|kitchen/.test(q);
    const dagger = /dagger|combat|tactical/.test(q);
    const bladeLen = chef ? 2.25 : dagger ? 1.85 : 1.55;
    const bladeWidth = chef ? 0.36 : dagger ? 0.22 : 0.18;
    const nodes = [
      box("blade_core", chef ? "Chef knife blade body" : "Knife blade body", "structure", [0.42, 0.18, 0], [bladeLen, 0.08, bladeWidth], "#d9dee2"),
      box("blade_spine", "Straight blade spine", "surface", [0.36, 0.235, -bladeWidth * 0.42], [bladeLen * 0.92, 0.035, 0.035], "#f4f7f8"),
      box("blade_edge", "Sharpened cutting edge", "surface", [0.42, 0.13, bladeWidth * 0.46], [bladeLen * 0.95, 0.035, 0.045], "#f4f7f8", [0, 0, -0.018]),
      cone("blade_tip", "Pointed blade tip", "structure", [0.42 + bladeLen / 2 + 0.18, 0.18, 0], bladeWidth * 0.52, 0.36, "#eef3f5", [0, 0, -Math.PI / 2]),
      box("blade_fuller", "Central blade groove", "detail", [0.36, 0.245, 0.006], [bladeLen * 0.58, 0.022, 0.026], "#6f8794"),
      box("tang", "Full tang", "structure", [-0.78, 0.18, 0], [0.72, 0.055, 0.1], "#9aa4a8"),
      box("guard", "Finger guard bolster", "structure", [-0.42, 0.18, 0], [0.09, 0.22, 0.34], "#c9a96e"),
      box("handle_core", "Ergonomic handle", "structure", [-1.14, 0.18, 0], [0.8, 0.16, 0.26], "#4b3428"),
      box("left_handle_scale", "Left handle scale", "surface", [-1.14, 0.245, -0.08], [0.76, 0.045, 0.1], "#6d4328"),
      box("right_handle_scale", "Right handle scale", "surface", [-1.14, 0.115, 0.08], [0.76, 0.045, 0.1], "#6d4328"),
      sphere("rivet_front", "Front handle rivet", "detail", [-0.89, 0.285, 0.11], 0.035, "#f5c97a"),
      sphere("rivet_back", "Back handle rivet", "detail", [-1.35, 0.285, 0.11], 0.035, "#f5c97a"),
      box("pommel_cap", "Handle end cap", "detail", [-1.58, 0.18, 0], [0.08, 0.18, 0.28], "#c9a96e"),
    ];
    if (dagger) {
      nodes.push(box("upper_edge", "Upper sharpened edge", "surface", [0.36, 0.23, -bladeWidth * 0.46], [bladeLen * 0.82, 0.03, 0.04], "#f4f7f8"));
    }
    return { name: chef ? "Forged chef knife" : dagger ? "Forged dagger" : "Forged knife", nodes };
  }

  function swordPlan(prompt) {
    const q = String(prompt || "").toLowerCase();
    const longBlade = /long|great|claymore|two.hand|two-hand/.test(q);
    const curved = /katana|curved|saber|sabre/.test(q);
    const bladeLen = longBlade ? 4.2 : 3.15;
    const bladeY = 0.72;
    const nodes = [
      box("blade_core", "Long blade body", "structure", [0, bladeY, 0], [0.22, bladeLen, 0.055], "#d9dee2"),
      cone("blade_tip", "Piercing blade tip", "structure", [0, bladeY + bladeLen / 2 + 0.24, 0], 0.19, 0.52, "#eef3f5", [0, 0, Math.PI / 4]),
      box("blade_ridge", "Central fuller ridge", "detail", [0, bladeY + 0.2, 0.035], [0.035, bladeLen * 0.78, 0.018], "#9fb0ba"),
      box("left_edge", "Left sharpened bevel", "surface", [-0.14, bladeY + 0.12, 0.01], [0.055, bladeLen * 0.94, 0.035], "#f4f7f8", [0, 0, curved ? -0.035 : 0]),
      box("right_edge", "Right sharpened bevel", "surface", [0.14, bladeY + 0.12, 0.01], [0.055, bladeLen * 0.94, 0.035], "#f4f7f8", [0, 0, curved ? 0.035 : 0]),
      box("guard_bar", "Cross guard", "structure", [0, -1.05, 0], [1.18, 0.13, 0.16], "#c9a96e"),
      sphere("guard_left_cap", "Left guard cap", "detail", [-0.66, -1.05, 0], 0.12, "#f5c97a"),
      sphere("guard_right_cap", "Right guard cap", "detail", [0.66, -1.05, 0], 0.12, "#f5c97a"),
      cyl("grip_core", "Leather grip core", "structure", [0, -1.55, 0], 0.15, 0.78, "#4b3428"),
      torus("grip_ring_top", "Top grip ring", "detail", [0, -1.18, 0], 0.17, 0.025, "#8fb7ff"),
      torus("grip_ring_mid", "Middle grip ring", "detail", [0, -1.55, 0], 0.17, 0.022, "#8fb7ff"),
      torus("grip_ring_bottom", "Bottom grip ring", "detail", [0, -1.91, 0], 0.17, 0.025, "#8fb7ff"),
      sphere("pommel", "Weighted pommel", "structure", [0, -2.13, 0], 0.22, "#c9a96e"),
      cyl("pommel_pin", "Pommel pin", "detail", [0, -2.36, 0], 0.055, 0.22, "#f5c97a"),
      box("audit_balance", "Balance audit marker", "audit", [0, -0.55, 0.22], [0.08, 0.08, 0.08], "#ff8f8f"),
      torus("blade_profile_audit", "Blade profile audit ring", "audit", [0, 0.95, 0], 0.36, 0.012, "#ff8f8f", [0, 0, 0]),
      box("shadow_floor_ref", "Floor alignment reference", "audit", [0, -2.48, 0], [1.25, 0.035, 0.18], "#ff8f8f"),
      box("fuller_channel", "Recessed fuller channel", "detail", [0, bladeY + 0.05, 0.062], [0.09, bladeLen * 0.62, 0.014], "#6f8794"),
    ];
    if (curved) {
      nodes.find((n) => n.id === "blade_core").rotation = [0, 0, -0.055];
      nodes.push(box("curve_back_spine", "Curved back spine", "surface", [-0.08, bladeY + 0.42, -0.01], [0.08, bladeLen * 0.82, 0.04], "#d9dee2", [0, 0, -0.08]));
    }
    return { name: "Forged metal long sword", nodes };
  }

  function tablePlan(prompt) {
    const q = String(prompt || "").toLowerCase();
    const round = /round|circular|coffee/.test(q);
    const workbench = /workbench|work bench|industrial/.test(q);
    const topColor = workbench ? "#9aa4a8" : "#b88752";
    const edgeColor = workbench ? "#c5d0d3" : "#d4a064";
    const legColor = workbench ? "#5f7478" : "#6d4328";
    const nodes = [];

    if (round) {
      nodes.push(cyl("table_top", "Round tabletop slab", "structure", [0, 0.18, 0], 1.18, 0.16, topColor, [0, 0, 0]));
      nodes.push(torus("table_top_bevel", "Rounded tabletop bevel", "surface", [0, 0.27, 0], 1.18, 0.035, edgeColor));
      nodes.push(cyl("pedestal", "Central pedestal column", "structure", [0, -0.48, 0], 0.16, 1.28, legColor));
      nodes.push(cyl("pedestal_base", "Weighted circular base", "structure", [0, -1.05, 0], 0.54, 0.12, legColor));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        nodes.push(box(`radial_support_${i}`, `Radial support ${i + 1}`, "surface", [Math.cos(a) * 0.43, -0.02, Math.sin(a) * 0.43], [0.72, 0.055, 0.055], edgeColor, [0, -a, 0]));
        nodes.push(sphere(`screw_${i}`, `Top screw cap ${i + 1}`, "detail", [Math.cos(a) * 0.74, 0.31, Math.sin(a) * 0.74], 0.035, "#8fb7ff"));
      }
      nodes.push(torus("audit_round_clearance", "Round clearance audit", "audit", [0, -1.13, 0], 1.24, 0.012, "#ff8f8f"));
      return { name: "Forged round table", nodes };
    }

    nodes.push(box("table_top", "Tabletop slab", "structure", [0, 0.15, 0], [2.65, 0.16, 1.45], topColor));
    nodes.push(box("front_bevel", "Front chamfered edge", "surface", [0, 0.25, 0.76], [2.72, 0.08, 0.07], edgeColor));
    nodes.push(box("back_bevel", "Back chamfered edge", "surface", [0, 0.25, -0.76], [2.72, 0.08, 0.07], edgeColor));
    nodes.push(box("left_bevel", "Left chamfered edge", "surface", [-1.36, 0.25, 0], [0.07, 0.08, 1.5], edgeColor));
    nodes.push(box("right_bevel", "Right chamfered edge", "surface", [1.36, 0.25, 0], [0.07, 0.08, 1.5], edgeColor));
    nodes.push(box("front_apron", "Front apron rail", "structure", [0, -0.08, 0.62], [2.25, 0.16, 0.08], legColor));
    nodes.push(box("back_apron", "Back apron rail", "structure", [0, -0.08, -0.62], [2.25, 0.16, 0.08], legColor));
    nodes.push(box("left_apron", "Left side apron rail", "structure", [-1.06, -0.08, 0], [0.08, 0.16, 1.05], legColor));
    nodes.push(box("right_apron", "Right side apron rail", "structure", [1.06, -0.08, 0], [0.08, 0.16, 1.05], legColor));

    [
      ["fl", -1.08, 0.52],
      ["fr", 1.08, 0.52],
      ["bl", -1.08, -0.52],
      ["br", 1.08, -0.52],
    ].forEach(([id, x, z]) => {
      nodes.push(cyl(`leg_${id}`, `${id.toUpperCase()} tapered leg`, "structure", [x, -0.56, z], 0.075, 1.18, legColor, [0.07 * Math.sign(x), 0, -0.05 * Math.sign(z)]));
      nodes.push(cyl(`foot_${id}`, `${id.toUpperCase()} leveling foot`, "detail", [x, -1.13, z], 0.115, 0.045, "#8fb7ff"));
      nodes.push(sphere(`bolt_${id}`, `${id.toUpperCase()} apron bolt`, "detail", [x, -0.05, z > 0 ? 0.68 : -0.68], 0.035, "#8fb7ff"));
    });

    nodes.push(box("front_cross_brace", "Front lower cross brace", "surface", [0, -0.83, 0.54], [2.08, 0.055, 0.055], edgeColor));
    nodes.push(box("back_cross_brace", "Back lower cross brace", "surface", [0, -0.83, -0.54], [2.08, 0.055, 0.055], edgeColor));
    nodes.push(box("left_side_brace", "Left side lower brace", "surface", [-1.05, -0.83, 0], [0.055, 0.055, 0.95], edgeColor));
    nodes.push(box("right_side_brace", "Right side lower brace", "surface", [1.05, -0.83, 0], [0.055, 0.055, 0.95], edgeColor));
    nodes.push(box("wood_grain_front", "Front wood grain line", "detail", [0, 0.335, 0.34], [2.28, 0.012, 0.025], "#8fb7ff"));
    nodes.push(box("wood_grain_back", "Back wood grain line", "detail", [0, 0.338, -0.22], [2.12, 0.012, 0.025], "#8fb7ff"));
    nodes.push(box("floor_contact_audit", "Floor contact audit plane", "audit", [0, FLOOR_Y + 0.012, 0], [2.55, 0.025, 1.26], "#ff8f8f"));
    nodes.push(torus("clearance_audit", "Knee clearance audit ring", "audit", [0, -0.44, 0], 0.68, 0.012, "#ff8f8f"));
    return { name: workbench ? "Forged workbench" : "Forged table", nodes };
  }

  function personPlan(prompt) {
    const skeletonOnly = isSkeletonOnlyPrompt(prompt);
    const skeleton = offsetNodes(humanSkeletonLibraryNodes(), [0, 1.02, 0]);
    if (skeletonOnly) return { name: "Anatomical human skeleton", nodes: skeleton };
    return { name: "Anatomical human model", nodes: humanBodyModelNodes(prompt) };
  }

  function humanBodyModelNodes(prompt) {
    const q = String(prompt || "").toLowerCase();
    const skin = /robot|android|cyborg/.test(q) ? "#8fb7ff" : "#c49a7a";
    const deepSkin = /robot|android|cyborg/.test(q) ? "#5f8fd8" : "#9d7358";
    const dark = "#2f2118";
    const nodes = [
      ellipsoid("head", "Anatomical head", "surface", [0, 1.82, 0.03], 0.24, [0.82, 1.08, 0.76], skin),
      capsule("neck", "Neck", "surface", [0, 1.47, 0], 0.105, 0.23, skin),
      ellipsoid("chest", "Ribcage chest mass", "structure", [0, 1.12, 0], 0.42, [1.0, 1.08, 0.58], skin),
      ellipsoid("abdomen", "Abdominal mass", "surface", [0, 0.66, 0.02], 0.34, [0.9, 1.02, 0.55], skin),
      ellipsoid("pelvis", "Pelvic mass", "structure", [0, 0.22, 0], 0.34, [1.12, 0.68, 0.62], deepSkin),
      ellipsoid("left_pectoralis", "Left pectoral plane", "detail", [-0.16, 1.2, 0.25], 0.16, [1.25, 0.45, 0.2], deepSkin),
      ellipsoid("right_pectoralis", "Right pectoral plane", "detail", [0.16, 1.2, 0.25], 0.16, [1.25, 0.45, 0.2], deepSkin),
      capsule("spine_pose_line", "Subtle spinal posture line", "detail", [0, 0.92, -0.27], 0.018, 0.86, "#d9dee2"),
      ellipsoid("left_shoulder", "Left deltoid", "surface", [-0.5, 1.3, 0], 0.15, [1.2, 0.86, 0.82], skin),
      ellipsoid("right_shoulder", "Right deltoid", "surface", [0.5, 1.3, 0], 0.15, [1.2, 0.86, 0.82], skin),
      capsule("left_upper_arm", "Left upper arm", "surface", [-0.69, 0.92, 0], 0.095, 0.52, skin, [0, 0, -0.22]),
      capsule("right_upper_arm", "Right upper arm", "surface", [0.69, 0.92, 0], 0.095, 0.52, skin, [0, 0, 0.22]),
      ellipsoid("left_elbow", "Left elbow", "detail", [-0.78, 0.55, 0], 0.075, [1, 0.85, 0.85], deepSkin),
      ellipsoid("right_elbow", "Right elbow", "detail", [0.78, 0.55, 0], 0.075, [1, 0.85, 0.85], deepSkin),
      capsule("left_forearm", "Left forearm", "surface", [-0.82, 0.2, 0], 0.075, 0.5, skin, [0, 0, -0.08]),
      capsule("right_forearm", "Right forearm", "surface", [0.82, 0.2, 0], 0.075, 0.5, skin, [0, 0, 0.08]),
      ellipsoid("left_hand", "Left hand", "detail", [-0.86, -0.12, 0.03], 0.095, [0.8, 0.42, 1.25], skin),
      ellipsoid("right_hand", "Right hand", "detail", [0.86, -0.12, 0.03], 0.095, [0.8, 0.42, 1.25], skin),
      capsule("left_thigh", "Left thigh", "surface", [-0.2, -0.38, 0], 0.13, 0.72, deepSkin, [0.03, 0, -0.05]),
      capsule("right_thigh", "Right thigh", "surface", [0.2, -0.38, 0], 0.13, 0.72, deepSkin, [0.03, 0, 0.05]),
      ellipsoid("left_knee", "Left knee", "detail", [-0.21, -0.84, 0.04], 0.1, [0.9, 0.72, 0.82], skin),
      ellipsoid("right_knee", "Right knee", "detail", [0.21, -0.84, 0.04], 0.1, [0.9, 0.72, 0.82], skin),
      capsule("left_lower_leg", "Left lower leg", "surface", [-0.21, -1.27, 0], 0.095, 0.7, skin),
      capsule("right_lower_leg", "Right lower leg", "surface", [0.21, -1.27, 0], 0.095, 0.7, skin),
      ellipsoid("left_foot", "Left foot", "detail", [-0.22, -1.72, 0.13], 0.12, [0.75, 0.34, 1.55], skin),
      ellipsoid("right_foot", "Right foot", "detail", [0.22, -1.72, 0.13], 0.12, [0.75, 0.34, 1.55], skin),
      ellipsoid("left_eye", "Left eye", "detail", [-0.075, 1.85, 0.2], 0.022, [1, 0.72, 0.32], "#050505"),
      ellipsoid("right_eye", "Right eye", "detail", [0.075, 1.85, 0.2], 0.022, [1, 0.72, 0.32], "#050505"),
      capsule("nose_bridge", "Nose bridge", "detail", [0, 1.78, 0.225], 0.018, 0.08, deepSkin, [Math.PI / 2, 0, 0]),
      box("mouth_line", "Mouth line", "detail", [0, 1.68, 0.205], [0.13, 0.012, 0.012], dark),
    ];
    if (/skeleton inside|visible skeleton|xray|x-ray|x ray/.test(q)) {
      nodes.push(...offsetNodes(humanSkeletonLibraryNodes().map((node) => ({ ...node, opacity: 0.32 })), [0, 1.02, -0.03]));
    }
    return offsetNodes(nodes, [0, 0.66, 0]);
  }

  function offsetNodes(nodes, offset) {
    return nodes.map((node) => ({
      ...node,
      position: [
        (node.position?.[0] || 0) + (offset?.[0] || 0),
        (node.position?.[1] || 0) + (offset?.[1] || 0),
        (node.position?.[2] || 0) + (offset?.[2] || 0),
      ],
    }));
  }

  function humanSkeletonLibraryNodes() {
    const bone = "#e9edf0";
    const joint = "#8fb7ff";
    const nodes = [
      sphere("skull_cranium", "Skull cranium", "structure", [0, 1.45, 0], 0.24, bone),
      box("mandible", "Mandible jaw bone", "structure", [0, 1.22, 0.04], [0.28, 0.11, 0.18], bone),
      cyl("cervical_spine", "Cervical vertebrae", "structure", [0, 1.06, 0], 0.032, 0.34, bone),
      cyl("thoracic_spine", "Thoracic vertebrae", "structure", [0, 0.55, 0], 0.038, 0.74, bone),
      cyl("lumbar_spine", "Lumbar vertebrae", "structure", [0, -0.12, 0], 0.044, 0.56, bone),
      box("sternum", "Sternum", "structure", [0, 0.46, 0.28], [0.08, 0.5, 0.035], bone),
      box("sacrum", "Sacrum", "structure", [0, -0.48, -0.02], [0.18, 0.22, 0.12], bone),
      box("left_pelvis", "Left pelvic ilium", "structure", [-0.22, -0.48, 0], [0.32, 0.17, 0.28], bone, [0, 0, -0.18]),
      box("right_pelvis", "Right pelvic ilium", "structure", [0.22, -0.48, 0], [0.32, 0.17, 0.28], bone, [0, 0, 0.18]),
      cyl("left_clavicle", "Left clavicle", "structure", [-0.31, 0.86, 0.03], 0.022, 0.58, bone, [0, 0, Math.PI / 2 - 0.18]),
      cyl("right_clavicle", "Right clavicle", "structure", [0.31, 0.86, 0.03], 0.022, 0.58, bone, [0, 0, Math.PI / 2 + 0.18]),
      box("left_scapula", "Left scapula", "structure", [-0.45, 0.58, -0.15], [0.24, 0.33, 0.045], bone, [0.15, 0.15, -0.18]),
      box("right_scapula", "Right scapula", "structure", [0.45, 0.58, -0.15], [0.24, 0.33, 0.045], bone, [0.15, -0.15, 0.18]),
    ];
    for (let i = 0; i < 6; i++) {
      const y = 0.72 - i * 0.1;
      const width = 0.34 + i * 0.035;
      nodes.push(cyl(`left_rib_${i + 1}`, `Left rib ${i + 1}`, "structure", [-width / 2, y, 0.16], 0.014, width, bone, [0.2, 0.35, Math.PI / 2 - 0.2]));
      nodes.push(cyl(`right_rib_${i + 1}`, `Right rib ${i + 1}`, "structure", [width / 2, y, 0.16], 0.014, width, bone, [0.2, -0.35, Math.PI / 2 + 0.2]));
    }
    [
      ["left_humerus", "Left humerus", -0.68, 0.44, 0, 0.036, 0.72, [0, 0, -0.28]],
      ["right_humerus", "Right humerus", 0.68, 0.44, 0, 0.036, 0.72, [0, 0, 0.28]],
      ["left_radius", "Left radius", -0.88, -0.16, 0.035, 0.022, 0.66, [0, 0, -0.08]],
      ["left_ulna", "Left ulna", -0.82, -0.16, -0.035, 0.022, 0.66, [0, 0, -0.08]],
      ["right_radius", "Right radius", 0.88, -0.16, 0.035, 0.022, 0.66, [0, 0, 0.08]],
      ["right_ulna", "Right ulna", 0.82, -0.16, -0.035, 0.022, 0.66, [0, 0, 0.08]],
      ["left_femur", "Left femur", -0.22, -0.88, 0, 0.044, 0.86, [0, 0, -0.08]],
      ["right_femur", "Right femur", 0.22, -0.88, 0, 0.044, 0.86, [0, 0, 0.08]],
      ["left_tibia", "Left tibia", -0.27, -1.63, 0.025, 0.032, 0.82, [0, 0, 0]],
      ["left_fibula", "Left fibula", -0.19, -1.63, -0.025, 0.022, 0.78, [0, 0, 0]],
      ["right_tibia", "Right tibia", 0.27, -1.63, 0.025, 0.032, 0.82, [0, 0, 0]],
      ["right_fibula", "Right fibula", 0.19, -1.63, -0.025, 0.022, 0.78, [0, 0, 0]],
    ].forEach(([id, name, x, y, z, radius, height, rotation]) => nodes.push(cyl(id, name, "structure", [x, y, z], radius, height, bone, rotation)));
    [
      ["left_shoulder_joint", "Left shoulder joint", -0.55, 0.82, 0],
      ["right_shoulder_joint", "Right shoulder joint", 0.55, 0.82, 0],
      ["left_elbow_joint", "Left elbow joint", -0.82, 0.1, 0],
      ["right_elbow_joint", "Right elbow joint", 0.82, 0.1, 0],
      ["left_wrist_joint", "Left wrist joint", -0.91, -0.48, 0],
      ["right_wrist_joint", "Right wrist joint", 0.91, -0.48, 0],
      ["left_hip_joint", "Left hip joint", -0.25, -0.54, 0],
      ["right_hip_joint", "Right hip joint", 0.25, -0.54, 0],
      ["left_knee_joint", "Left knee joint", -0.24, -1.29, 0],
      ["right_knee_joint", "Right knee joint", 0.24, -1.29, 0],
      ["left_ankle_joint", "Left ankle joint", -0.24, -1.99, 0],
      ["right_ankle_joint", "Right ankle joint", 0.24, -1.99, 0],
    ].forEach(([id, name, x, y, z]) => nodes.push(sphere(id, name, "detail", [x, y, z], 0.045, joint)));
    nodes.push(box("left_hand_carpals", "Left hand carpals", "detail", [-0.94, -0.62, 0.03], [0.18, 0.07, 0.12], bone));
    nodes.push(box("right_hand_carpals", "Right hand carpals", "detail", [0.94, -0.62, 0.03], [0.18, 0.07, 0.12], bone));
    nodes.push(box("left_foot_tarsals", "Left foot tarsals", "detail", [-0.25, -2.08, 0.12], [0.2, 0.06, 0.36], bone));
    nodes.push(box("right_foot_tarsals", "Right foot tarsals", "detail", [0.25, -2.08, 0.12], [0.2, 0.06, 0.36], bone));
    nodes.push(sphere("left_patella", "Left patella", "detail", [-0.24, -1.29, 0.08], 0.035, bone));
    nodes.push(sphere("right_patella", "Right patella", "detail", [0.24, -1.29, 0.08], 0.035, bone));
    return nodes;
  }

  function phonePlan(prompt) {
    const q = String(prompt || "").toLowerCase();
    const isIphone = /iphone/.test(q);
    const foldable = /fold|flip/.test(q);
    const body = isIphone ? "#1b1f24" : "#111719";
    const edge = isIphone ? "#d7dde0" : "#8fa2ad";
    const glass = "#050708";
    const glow = isIphone ? "#5eead4" : "#60a5fa";
    const nodes = [
      box("phone_frame_plate", isIphone ? "iPhone rounded metal frame plate" : "Smartphone rounded metal frame plate", "structure", [0, 0, 0], [0.68, 0.052, 1.34], edge),
      box("phone_body_inset", "Thin dark phone body inset", "structure", [0, 0.018, 0], [0.61, 0.045, 1.25], body),
      ellipsoid("corner_top_left", "Rounded top left corner cap", "surface", [-0.285, 0.032, -0.59], 0.07, [1, 0.18, 1], edge),
      ellipsoid("corner_top_right", "Rounded top right corner cap", "surface", [0.285, 0.032, -0.59], 0.07, [1, 0.18, 1], edge),
      ellipsoid("corner_bottom_left", "Rounded bottom left corner cap", "surface", [-0.285, 0.032, 0.59], 0.07, [1, 0.18, 1], edge),
      ellipsoid("corner_bottom_right", "Rounded bottom right corner cap", "surface", [0.285, 0.032, 0.59], 0.07, [1, 0.18, 1], edge),
      box("phone_screen_glass", "Black glass display panel", "surface", [0, 0.057, 0.03], [0.55, 0.018, 1.12], glass),
      box("phone_wallpaper_glow", "Display wallpaper glow layer", "surface", [0, 0.069, 0.05], [0.45, 0.006, 0.82], glow),
      box("phone_top_bezel", "Top display bezel", "surface", [0, 0.073, -0.53], [0.49, 0.012, 0.075], "#0b1012"),
      box("phone_bottom_bezel", "Bottom display bezel", "surface", [0, 0.073, 0.59], [0.47, 0.012, 0.055], "#0b1012"),
      box("phone_left_metal_rail", "Left polished metal rail", "surface", [-0.348, 0.034, 0], [0.025, 0.068, 1.12], edge),
      box("phone_right_metal_rail", "Right polished metal rail", "surface", [0.348, 0.034, 0], [0.025, 0.068, 1.12], edge),
      box("phone_dynamic_island", isIphone ? "Dynamic island st.camera sensor cutout" : "Camera notch sensor cutout", "detail", [0, 0.085, -0.43], [0.2, 0.012, 0.04], "#020303"),
      sphere("selfie_camera_dot", "Selfie st.camera dot", "detail", [0.11, 0.092, -0.43], 0.016, "#111827"),
      box("earpiece_slot", "Earpiece speaker slot", "detail", [0, 0.091, -0.49], [0.13, 0.008, 0.012], "#1f2937"),
      box("camera_bump", "Raised rear st.camera island bump", "structure", [-0.17, 0.096, -0.42], [0.25, 0.045, 0.28], isIphone ? "#20262c" : "#263238"),
      cyl("camera_main_ring", "Main st.camera metal lens ring", "detail", [-0.22, 0.13, -0.48], 0.052, 0.016, edge),
      cyl("camera_wide_ring", "Wide st.camera metal lens ring", "detail", [-0.11, 0.13, -0.48], 0.046, 0.016, edge),
      cyl("camera_tele_ring", "Telephoto st.camera metal lens ring", "detail", [-0.22, 0.13, -0.36], 0.044, 0.016, edge),
      cyl("camera_main_glass", "Main st.camera blue glass", "detail", [-0.22, 0.143, -0.48], 0.036, 0.008, "#8fb7ff"),
      cyl("camera_wide_glass", "Wide st.camera blue glass", "detail", [-0.11, 0.143, -0.48], 0.031, 0.008, "#8fb7ff"),
      cyl("camera_tele_glass", "Telephoto st.camera blue glass", "detail", [-0.22, 0.143, -0.36], 0.03, 0.008, "#8fb7ff"),
      cyl("camera_flash_disc", "Camera flash disc", "detail", [-0.1, 0.14, -0.36], 0.023, 0.008, "#f5c97a"),
      sphere("lidar_sensor", "Small LiDAR sensor dot", "detail", [-0.16, 0.142, -0.42], 0.016, "#050505"),
      box("volume_up_button", "Volume up side button", "detail", [-0.372, 0.065, -0.16], [0.014, 0.027, 0.16], edge),
      box("volume_down_button", "Volume down side button", "detail", [-0.372, 0.065, 0.04], [0.014, 0.027, 0.16], edge),
      box("mute_switch", "Mute switch", "detail", [-0.372, 0.066, -0.36], [0.014, 0.024, 0.09], "#f5c97a"),
      box("power_button", "Power button", "detail", [0.372, 0.065, -0.08], [0.014, 0.027, 0.28], edge),
      box("charge_port", "USB-C charging port", "detail", [0, 0.086, 0.67], [0.16, 0.012, 0.026], "#050505"),
      ...Array.from({ length: 6 }, (_, i) => box(`speaker_slot_${i + 1}`, `Bottom speaker slot ${i + 1}`, "detail", [-0.25 + i * 0.1, 0.089, 0.63], [0.045, 0.008, 0.015], "#050505")),
      ...Array.from({ length: 8 }, (_, i) => box(`app_tile_${i + 1}`, `Subtle app tile ${i + 1}`, "detail", [-0.18 + (i % 4) * 0.12, 0.078, -0.18 + Math.floor(i / 4) * 0.14], [0.07, 0.006, 0.07], i % 2 ? "#14b8a6" : "#2563eb")),
      box("home_indicator", "Home indicator pill", "detail", [0, 0.086, 0.49], [0.18, 0.006, 0.018], "#dce4e6"),
      ...(foldable ? [
        box("fold_hinge_line", "Foldable phone hinge line", "detail", [0, 0.093, 0], [0.58, 0.01, 0.018], "#d7dde0"),
      ] : []),
      torus("phone_clearance_audit", "Phone floor clearance audit", "audit", [0, -0.02, 0], 0.73, 0.01, "#ff8f8f"),
    ];
    return { name: isIphone ? "Forged iPhone" : "Forged smartphone", nodes };
  }

  function laptopPlan(prompt) {
    const q = String(prompt || "").toLowerCase();
    const isMac = /macbook|apple/.test(q);
    const metal = isMac ? "#b9c0c4" : "#69797d";
    const nodes = [
      box("laptop_base", isMac ? "MacBook aluminum base" : "Laptop base chassis", "structure", [0, 0, 0], [1.65, 0.08, 1.05], metal),
      box("laptop_lid", "Open display lid", "structure", [0, 0.58, -0.48], [1.62, 0.08, 1.02], metal, [-1.05, 0, 0]),
      box("display_panel", "Black display panel", "surface", [0, 0.61, -0.47], [1.44, 0.022, 0.82], "#050708", [-1.05, 0, 0]),
      box("display_glow", "Screen content glow", "detail", [0, 0.625, -0.45], [1.14, 0.014, 0.58], "#4bd2be", [-1.05, 0, 0]),
      cyl("left_hinge", "Left hinge barrel", "structure", [-0.56, 0.1, -0.55], 0.045, 0.28, metal, [0, 0, Math.PI / 2]),
      cyl("right_hinge", "Right hinge barrel", "structure", [0.56, 0.1, -0.55], 0.045, 0.28, metal, [0, 0, Math.PI / 2]),
      box("keyboard_deck", "Keyboard recessed deck", "surface", [0, 0.065, -0.06], [1.18, 0.016, 0.46], "#151b1d"),
      ...Array.from({ length: 12 }, (_, i) => box(`key_${i}`, `Keyboard key ${i + 1}`, "detail", [-0.48 + (i % 6) * 0.19, 0.088, -0.21 + Math.floor(i / 6) * 0.15], [0.13, 0.016, 0.08], "#dce4e6")),
      box("trackpad", "Glass trackpad", "detail", [0, 0.09, 0.34], [0.55, 0.018, 0.28], "#9aaeb2"),
      sphere("webcam", "Webcam dot", "detail", [0, 0.95, -0.82], 0.022, "#050505"),
      box("left_ports", "Left side ports", "detail", [-0.86, 0.04, -0.12], [0.022, 0.032, 0.24], "#050505"),
      box("right_ports", "Right side ports", "detail", [0.86, 0.04, -0.04], [0.022, 0.032, 0.2], "#050505"),
      box("laptop_shadow_audit", "Laptop table-contact audit", "audit", [0, -0.06, 0], [1.72, 0.025, 1.1], "#ff8f8f"),
    ];
    return { name: isMac ? "Forged MacBook" : "Forged laptop", nodes };
  }

  function electronicsDeskScenePlan(prompt) {
    const q = String(prompt || "").toLowerCase();
    const nodes = [];
    nodes.push(...prefixNodes(tablePlan(/desk|workbench/.test(q) ? "desk" : "table").nodes, "desk", [0, 0, 0]));
    nodes.push(...prefixNodes(laptopPlan(prompt).nodes.filter((node) => node.role !== "audit"), "laptop", [0.28, 0.37, -0.1]));
    if (/iphone|phone|smartphone|mobile/.test(q)) {
      nodes.push(...prefixNodes(phonePlan(prompt).nodes.filter((node) => node.role !== "audit"), "phone", [-0.82, 0.36, 0.32], [0, 0.02, -0.35]));
    }
    nodes.push(box("scene_clearance_audit", "Desktop st.scene clearance audit", "audit", [0, FLOOR_Y + 0.014, 0], [2.9, 0.028, 1.7], "#ff8f8f"));
    return { name: "Forged electronics desk st.scene", nodes: nodes.slice(0, MAX_FORGE_NODES) };
  }

  function prefixNodes(nodes, prefix, offset, extraRotation) {
    return nodes.map((node) => {
      const copy = cloneJson(node);
      copy.id = `${prefix}_${copy.id}`;
      copy.name = `${prefix === "desk" ? "" : prefix + " "}${copy.name || copy.id}`.trim();
      copy.position = [
        (copy.position?.[0] || 0) + (offset?.[0] || 0),
        (copy.position?.[1] || 0) + (offset?.[1] || 0),
        (copy.position?.[2] || 0) + (offset?.[2] || 0),
      ];
      if (extraRotation) {
        copy.rotation = [
          (copy.rotation?.[0] || 0) + (extraRotation[0] || 0),
          (copy.rotation?.[1] || 0) + (extraRotation[1] || 0),
          (copy.rotation?.[2] || 0) + (extraRotation[2] || 0),
        ];
      }
      return copy;
    });
  }

  function genericPlan(prompt) {
    const label = String(prompt || "object").trim().replace(/\s+/g, " ").slice(0, 48) || "object";
    const seed = hashString(label);
    const rand = mulberry32(seed);
    const wide = 1.15 + rand() * 0.65;
    const tall = 0.48 + rand() * 0.5;
    const deep = 0.72 + rand() * 0.55;
    const nodes = [
      box("main_chassis", "Main chassis volume", "structure", [0, 0.1, 0], [wide, tall, deep], "#4bd2be", [0, rand() * 0.16 - 0.08, 0]),
      box("front_face", "Front functional face", "surface", [0, 0.12, deep / 2 + 0.035], [wide * 0.78, tall * 0.62, 0.045], "#f5c97a"),
      box("rear_panel", "Rear service panel", "surface", [0, 0.08, -deep / 2 - 0.03], [wide * 0.62, tall * 0.5, 0.035], "#f5c97a"),
      box("top_module", "Raised top module", "structure", [0.14, 0.42 + tall * 0.35, -0.08], [wide * 0.55, 0.2, deep * 0.42], "#4bd2be"),
      box("base_footprint", "Stable base footprint", "structure", [0, -0.34, 0], [wide * 1.08, 0.12, deep * 1.05], "#4bd2be"),
      cyl("front_lens", "Front circular feature", "detail", [0, 0.16, deep / 2 + 0.07], 0.13, 0.05, "#8fb7ff", [Math.PI / 2, 0, 0]),
      box("left_side_rail", "Left side rail", "surface", [-wide / 2 - 0.055, 0.05, 0], [0.06, tall * 0.55, deep * 0.82], "#f5c97a"),
      box("right_side_rail", "Right side rail", "surface", [wide / 2 + 0.055, 0.05, 0], [0.06, tall * 0.55, deep * 0.82], "#f5c97a"),
      cyl("left_handle_post", "Left handle post", "detail", [-wide * 0.32, 0.55 + tall * 0.35, -0.08], 0.035, 0.42, "#8fb7ff"),
      cyl("right_handle_post", "Right handle post", "detail", [wide * 0.32, 0.55 + tall * 0.35, -0.08], 0.035, 0.42, "#8fb7ff"),
      cyl("top_handle", "Top handle bar", "detail", [0, 0.76 + tall * 0.35, -0.08], 0.035, wide * 0.62, "#8fb7ff", [0, 0, Math.PI / 2]),
      box("control_strip", "Control strip", "detail", [0, 0.34, deep / 2 + 0.086], [wide * 0.46, 0.045, 0.025], "#8fb7ff"),
      ...Array.from({ length: 4 }, (_, i) => sphere(`fastener_${i}`, `Fastener ${i + 1}`, "detail", [(i % 2 ? 1 : -1) * wide * 0.37, i > 1 ? 0.3 : -0.08, deep / 2 + 0.09], 0.035, "#8fb7ff")),
      ...Array.from({ length: 5 }, (_, i) => box(`vent_${i}`, `Vent slot ${i + 1}`, "detail", [-wide * 0.32 + i * wide * 0.16, -0.05, deep / 2 + 0.092], [0.07, 0.018, 0.02], "#050505")),
      box("floor_contact_audit", "Floor contact audit", "audit", [0, FLOOR_Y + 0.012, 0], [wide * 1.15, 0.025, deep * 1.12], "#ff8f8f"),
      torus("clearance_audit", "Object clearance audit", "audit", [0, 0.08, 0], Math.max(wide, deep) * 0.64, 0.012, "#ff8f8f"),
    ];
    return { name: `Forged ${label}`, nodes };
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }


  return {
    fallbackPlan,
    spoonPlan, knifePlan, swordPlan, tablePlan, personPlan, phonePlan, laptopPlan,
    electronicsDeskScenePlan, genericPlan,
    humanBodyModelNodes, humanSkeletonLibraryNodes, offsetNodes, prefixNodes,
    reconstructSpoonStructure,
    ellipsoidMesh, spoonBowlMesh, taperedHandleMesh, coneMesh, tubeMesh,
    makeConcaveOvalBowlMeshParams, makeTaperedHandleMeshParams,
    makeEllipsoidMeshParams, makeConeMeshParams, makeTubeMeshParams,
    normalize3, cross3,
  };
}
