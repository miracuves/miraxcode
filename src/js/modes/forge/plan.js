/** Geometry plan normalization and primitive node builders (Wave 15). */
import { MAX_FORGE_NODES } from './constants.js';

export function vec3(v, fallback) {
  return Array.isArray(v) && v.length >= 3
    ? [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0]
    : fallback.slice();
}

export function normalizePlan(plan) {
  const src = plan && typeof plan === 'object' ? plan : { name: 'Empty model', nodes: [] };
  const nodes = Array.isArray(src.nodes) ? src.nodes : [];
  return {
    name: src.name || 'Forged model',
    glbUrl: typeof src.glbUrl === 'string' ? src.glbUrl : '',
    constraints: Array.isArray(src.constraints) ? src.constraints : [],
    edges: Array.isArray(src.edges) ? src.edges : [],
    nodes: nodes.slice(0, MAX_FORGE_NODES).map((node, i) => ({
      id: String(node.id || `node_${i + 1}`),
      name: String(node.name || node.id || `Node ${i + 1}`),
      type: ['box', 'cylinder', 'capsule', 'sphere', 'cone', 'torus', 'lathe', 'extrude', 'logo', 'logo_img', 'mesh'].includes(node.type) ? node.type : 'box',
      role: ['structure', 'surface', 'detail', 'audit'].includes(node.role) ? node.role : 'structure',
      position: vec3(node.position, [0, 0, 0]),
      rotation: vec3(node.rotation, [0, 0, 0]),
      scale: vec3(node.scale, [1, 1, 1]),
      params: node.params && typeof node.params === 'object' ? node.params : {},
      color: node.color,
      opacity: Number.isFinite(node.opacity) ? node.opacity : undefined,
    })),
  };
}

export function box(id, name, role, position, size, color, rotation) {
  return { id, name, role, type: 'box', position, rotation: rotation || [0, 0, 0], scale: [1, 1, 1], params: { width: size[0], height: size[1], depth: size[2] }, color };
}

export function cyl(id, name, role, position, radius, height, color, rotation) {
  return { id, name, role, type: 'cylinder', position, rotation: rotation || [0, 0, 0], scale: [1, 1, 1], params: { radius, height, segments: 36 }, color };
}

export function capsule(id, name, role, position, radius, length, color, rotation, scale, opacity) {
  return { id, name, role, type: 'capsule', position, rotation: rotation || [0, 0, 0], scale: scale || [1, 1, 1], params: { radius, length, capSegments: 10, radialSegments: 24 }, color, opacity };
}

export function sphere(id, name, role, position, radius, color) {
  return { id, name, role, type: 'sphere', position, rotation: [0, 0, 0], scale: [1, 1, 1], params: { radius }, color };
}

export function ellipsoid(id, name, role, position, radius, scale, color, rotation, opacity) {
  return { id, name, role, type: 'sphere', position, rotation: rotation || [0, 0, 0], scale: scale || [1, 1, 1], params: { radius, widthSegments: 32, heightSegments: 18 }, color, opacity };
}

export function cone(id, name, role, position, radius, height, color, rotation) {
  return { id, name, role, type: 'cone', position, rotation: rotation || [0, 0, 0], scale: [1, 1, 1], params: { radius, height, segments: 4 }, color };
}

export function torus(id, name, role, position, radius, tube, color, rotation) {
  return { id, name, role, type: 'torus', position, rotation: rotation || [Math.PI / 2, 0, 0], scale: [1, 1, 1], params: { radius, tube }, color };
}

export function lathe(id, name, role, position, points, color, scale, rotation, opacity) {
  return { id, name, role, type: 'lathe', position, rotation: rotation || [0, 0, 0], scale: scale || [1, 1, 1], params: { points, segments: 48 }, color, opacity };
}

export function logo(id, name, role, position, width, height, style, opacity) {
  return { id, name, role, type: 'logo', position, rotation: [0, 0, 0], scale: [1, 1, 1], params: { width, height, text: 'H', fontSize: 860, ...(style || {}) }, color: style?.color || '#c9a96e', opacity };
}

export function serializeGeometry(geometry) {
  const pos = geometry.getAttribute('position');
  if (!pos || pos.count < 3 || pos.count > 25000) return null;
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  return {
    positions: Array.from(pos.array),
    normals: normal && normal.array.length === pos.array.length ? Array.from(normal.array) : undefined,
    uvs: uv ? Array.from(uv.array) : undefined,
    indices: geometry.index ? Array.from(geometry.index.array) : undefined,
  };
}

export function meshNodesFromScene(root, fileName) {
  const nodes = [];
  let totalVertices = 0;
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || nodes.length >= 32 || totalVertices > 60000) return;
    const geo = obj.geometry.clone();
    geo.applyMatrix4(obj.matrixWorld);
    const serialized = serializeGeometry(geo);
    geo.dispose?.();
    if (!serialized) return;
    totalVertices += serialized.positions.length / 3;
    const color = Array.isArray(obj.material)
      ? obj.material[0]?.color?.getHexString?.()
      : obj.material?.color?.getHexString?.();
    nodes.push({
      id: `asset_${Date.now().toString(36)}_${nodes.length}`,
      name: obj.name || `${fileName.replace(/\.[^.]+$/, '')} mesh ${nodes.length + 1}`,
      role: nodes.length ? 'surface' : 'structure',
      type: 'mesh',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      params: { ...serialized, smooth: true },
      color: color ? `#${color}` : '#c9a96e',
    });
  });
  return nodes;
}

export function safeFileName(name) {
  return String(name || '3d-forge-model').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || '3d-forge-model';
}
