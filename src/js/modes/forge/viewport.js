/** Forge Three.js viewport + CAD (Wave 17). */
import { FLOOR_Y, ROLE_COLORS } from './constants.js';
import { normalizePlan, meshNodesFromScene, serializeGeometry, safeFileName } from './plan.js';

export function createForgeViewportApi(ctx) {
  const {
    $, st, escapeHtml, setStatus, log, updatePlanList, renderableNodes, queueProjectSave,
  } = ctx;

  async function initThree() {
    if (st.initialized) return true;
    const mount = $("frgCanvasMount");
    if (!mount) return false;

    setStatus("Loading");
    log("SYSTEM", "Loading Three.js runtime...");
    try {
      const threeMod = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js");
      const controlsMod = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/controls/OrbitControls.js");
      const transformMod = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/controls/TransformControls.js");
      const roomEnvMod = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/environments/RoomEnvironment.js");
      st.THREE = threeMod;
      st.OrbitControls = controlsMod.OrbitControls;
      st.TransformControls = transformMod.TransformControls;
      window.__forgeRoomEnv = roomEnvMod.RoomEnvironment;
    } catch (err) {
      log("SYSTEM", "Could not load Three.js from CDN: " + (err.message || err), "err");
      setStatus("3D error");
      return false;
    }

    st.scene = new st.THREE.Scene();
    st.scene.background = new st.THREE.Color(0x050505);
    st.scene.fog = new st.THREE.FogExp2(0x050505, 0.055);

    st.camera = new st.THREE.PerspectiveCamera(48, 1, 0.1, 120);
    st.camera.position.set(6, 4.2, 8);

    st.renderer = new st.THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    st.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    st.renderer.outputColorSpace = st.THREE.SRGBColorSpace;
    st.renderer.toneMapping = st.THREE.ACESFilmicToneMapping;
    st.renderer.toneMappingExposure = 1.12;
    st.renderer.shadowMap.enabled = true;
    st.renderer.shadowMap.type = st.THREE.PCFSoftShadowMap;
    mount.innerHTML = "";
    mount.appendChild(st.renderer.domElement);

    // PBR environment map — gives MeshStandardMaterial proper reflections + specular
    try {
      const pmremGen = new st.THREE.PMREMGenerator(st.renderer);
      pmremGen.compileEquirectangularShader();
      st.scene.environment = pmremGen.fromScene(new window.__forgeRoomEnv(), 0.04).texture;
      pmremGen.dispose();
    } catch (err) {
      log("SYSTEM", "Env map unavailable: " + (err.message || err), "warn");
    }

    st.controls = new st.OrbitControls(st.camera, st.renderer.domElement);
    st.controls.enableDamping = true;
    st.controls.dampingFactor = 0.06;
    st.controls.enablePan = true;
    st.controls.screenSpacePanning = true;
    if ("zoomToCursor" in st.controls) st.controls.zoomToCursor = true;
    st.controls.mouseButtons = {
      LEFT: st.THREE.MOUSE.ROTATE,
      MIDDLE: st.THREE.MOUSE.PAN,
      RIGHT: st.THREE.MOUSE.PAN,
    };
    st.controls.target.set(0, 0.55, 0);

    st.transformControls = new st.TransformControls(st.camera, st.renderer.domElement);
    st.transformControls.setMode(st.transformMode);
    st.transformControls.setSize(0.82);
    setSnapEnabled(false);
    st.transformControls.addEventListener("dragging-changed", (event) => {
      if (st.controls) st.controls.enabled = !event.value;
    });
    st.transformControls.addEventListener("objectChange", () => {
      syncSelectedNodeFromMesh();
      renderSelection();
    });
    if (typeof st.transformControls.getHelper === "function") st.scene.add(st.transformControls.getHelper());
    else st.scene.add(st.transformControls);
    st.raycaster = new st.THREE.Raycaster();
    st.pointer = new st.THREE.Vector2();
    st.renderer.domElement.addEventListener("click", handleCanvasClick);
    st.renderer.domElement.addEventListener("dblclick", handleCanvasDoubleClick);
    st.renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());

    st.modelGroup = new st.THREE.Group();
    st.particleGroup = new st.THREE.Group();
    st.scene.add(st.modelGroup, st.particleGroup);

    const key = new st.THREE.DirectionalLight(0xdffbf5, 2.1);
    key.position.set(6, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    key.shadow.st.camera.left = -10;
    key.shadow.st.camera.right = 10;
    key.shadow.st.camera.top = 10;
    key.shadow.st.camera.bottom = -10;
    key.shadow.st.camera.near = 0.1;
    key.shadow.st.camera.far = 40;
    st.scene.add(key);
    const rim = new st.THREE.DirectionalLight(0x4bd2be, 1.2);
    rim.position.set(-6, 3, -5);
    st.scene.add(rim);
    st.scene.add(new st.THREE.AmbientLight(0x6a8f8a, 0.45));
    st.scene.add(new st.THREE.HemisphereLight(0xb0d9d2, 0x1a1410, 0.5));

    const grid = new st.THREE.GridHelper(18, 36, 0xffffff, 0xffffff);
    grid.position.y = -1.15;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    st.scene.add(grid);

    const floor = new st.THREE.Mesh(
      new st.THREE.PlaneGeometry(18, 18, 36, 36),
      new st.THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.035,
        side: st.THREE.DoubleSide,
        depthWrite: false,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.151;
    floor.receiveShadow = true;
    st.scene.add(floor);

    st.starField = makeStarField();
    st.scene.add(st.starField);

    window.addEventListener("resize", resize);
    resize();
    st.initialized = true;
    animate();
    setStatus("Idle");
    log("SYSTEM", "Forge void is online.");
    return true;
  }

  function makeStarField() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random() * 38;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new st.THREE.BufferGeometry();
    geo.setAttribute("position", new st.THREE.BufferAttribute(positions, 3));
    const mat = new st.THREE.PointsMaterial({
      color: 0x9ff4e7,
      size: 0.022,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    return new st.THREE.Points(geo, mat);
  }

  function resize() {
    const mount = $("frgCanvasMount");
    if (!st.renderer || !st.camera || !mount) return;
    const rect = mount.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    st.camera.aspect = w / h;
    st.camera.updateProjectionMatrix();
    st.renderer.setSize(w, h, false);
  }

  function animate(now) {
    st.raf = requestAnimationFrame(animate);
    if (!st.renderer || !st.scene || !st.camera) return;
    if (!st.mounted) return;
    st.controls?.update();
    if (st.starField) st.starField.rotation.y += 0.00018;
    if (st.logoMeshes.length > 0) {
      st.logoBobT += 0.006;
      const bob  = Math.sin(st.logoBobT) * 0.16;
      const sway = Math.sin(st.logoBobT * 0.55) * 0.05;
      const pulse = 1 + Math.sin(st.logoBobT * 1.3) * 0.012;
      for (const m of st.logoMeshes) {
        m.position.y = m.userData.logoBaseY + bob;
        m.rotation.y = sway;
        m.scale.set(pulse, pulse, 1);
      }
    }
    if (st.selectionBox && st.selectedMesh) st.selectionBox.update();
    updateFlights(now || performance.now());
    updateReveal(now || performance.now());
    if (++st.underfloorTick % 8 === 0) updateUnderfloorHighlights();
    st.renderer.render(st.scene, st.camera);
  }

  function clearScene() {
    selectMesh(null);
    st.flights.forEach((f) => st.particleGroup.remove(f.mesh));
    st.flights = [];
    st.revealMeshes = [];
    st.logoMeshes = [];
    st.logoBobT = 0;
    if (st.scanMesh) {
      st.scene?.remove(st.scanMesh);
      st.scanMesh.geometry?.dispose();
      st.scanMesh.material?.dispose();
      st.scanMesh = null;
    }
    if (st.modelGroup) {
      while (st.modelGroup.children.length) {
        const obj = st.modelGroup.children.pop();
        obj.traverse?.((child) => {
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
          else child.material?.dispose?.();
        });
      }
    }
    if (st.particleGroup) {
      while (st.particleGroup.children.length) {
        const obj = st.particleGroup.children.pop();
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      }
    }
  }

  function primitiveGeometry(node) {
    const p = node.params || {};
    switch (node.type) {
      case "logo":
      case "logo_img":
        return new st.THREE.PlaneGeometry(p.width ?? 2.1, p.height ?? 2.1);
      case "mesh":
        return meshGeometryFromParams(p);
      case "cylinder":
        return new st.THREE.CylinderGeometry(p.radiusTop ?? p.radius ?? 0.35, p.radiusBottom ?? p.radius ?? 0.35, p.height ?? 1, p.segments ?? 48);
      case "capsule":
        return new st.THREE.CapsuleGeometry(p.radius ?? 0.12, p.length ?? p.height ?? 0.6, p.capSegments ?? 16, p.radialSegments ?? 32);
      case "sphere":
        return new st.THREE.SphereGeometry(p.radius ?? 0.45, p.widthSegments ?? 48, p.heightSegments ?? 32);
      case "cone":
        return new st.THREE.ConeGeometry(p.radius ?? 0.42, p.height ?? 1, p.segments ?? 48);
      case "torus":
        return new st.THREE.TorusGeometry(p.radius ?? 0.5, p.tube ?? 0.08, 24, 64);
      case "lathe": {
        const pts = Array.isArray(p.points) && p.points.length >= 2
          ? p.points.map((pt) => new st.THREE.Vector2(Number(pt[0]) || 0.1, Number(pt[1]) || 0))
          : [new st.THREE.Vector2(0.18, -0.55), new st.THREE.Vector2(0.42, -0.2), new st.THREE.Vector2(0.34, 0.42), new st.THREE.Vector2(0.08, 0.65)];
        return new st.THREE.LatheGeometry(pts, p.segments ?? 64);
      }
      case "extrude": {
        const pts = Array.isArray(p.points) && p.points.length >= 3
          ? p.points.map((pt) => [Number(pt[0]) || 0, Number(pt[1]) || 0])
          : [[-0.35, -0.25], [0.35, -0.25], [0.42, 0.2], [0, 0.45], [-0.42, 0.2]];
        const shape = new st.THREE.Shape();
        shape.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
        shape.closePath();
        return new st.THREE.ExtrudeGeometry(shape, { depth: p.depth ?? 0.18, bevelEnabled: true, bevelSize: p.bevelSize ?? 0.025, bevelThickness: p.bevelThickness ?? 0.025, bevelSegments: p.bevelSegments ?? 2 });
      }
      default:
        return new st.THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1);
    }
  }

  function meshGeometryFromParams(p) {
    const geo = new st.THREE.BufferGeometry();
    const positions = Array.isArray(p.positions) ? p.positions : [];
    if (positions.length < 9) return new st.THREE.BoxGeometry(0.4, 0.4, 0.4);
    geo.setAttribute("position", new st.THREE.Float32BufferAttribute(positions, 3));
    if (Array.isArray(p.normals) && p.normals.length === positions.length) {
      geo.setAttribute("normal", new st.THREE.Float32BufferAttribute(p.normals, 3));
    }
    if (Array.isArray(p.uvs) && p.uvs.length >= (positions.length / 3) * 2) {
      geo.setAttribute("uv", new st.THREE.Float32BufferAttribute(p.uvs, 2));
    }
    if (Array.isArray(p.indices) && p.indices.length >= 3) {
      geo.setIndex(p.indices);
    }
    return finalizeGeometry(geo, p);
  }

  function finalizeGeometry(geometry, params) {
    if (!geometry) return geometry;
    const p = params || {};
    const subdivisions = Math.min(2, Math.max(0, Number(p.subdivisions) || 0));
    let geo = geometry;
    for (let i = 0; i < subdivisions; i++) geo = subdivideGeometry(geo);
    if (p.center) geo.center();
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  function subdivideGeometry(source) {
    const base = source.index ? source.toNonIndexed() : source.clone();
    const pos = base.getAttribute("position");
    if (!pos || pos.count > 12000) return base;
    const next = [];
    const a = new st.THREE.Vector3();
    const b = new st.THREE.Vector3();
    const c = new st.THREE.Vector3();
    const ab = new st.THREE.Vector3();
    const bc = new st.THREE.Vector3();
    const ca = new st.THREE.Vector3();
    const push = (v) => next.push(v.x, v.y, v.z);
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      ab.copy(a).lerp(b, 0.5);
      bc.copy(b).lerp(c, 0.5);
      ca.copy(c).lerp(a, 0.5);
      push(a); push(ab); push(ca);
      push(ab); push(b); push(bc);
      push(ca); push(bc); push(c);
      push(ab); push(bc); push(ca);
    }
    base.dispose?.();
    const geo = new st.THREE.BufferGeometry();
    geo.setAttribute("position", new st.THREE.Float32BufferAttribute(next, 3));
    return geo;
  }

  function makeLogoMaterial(node) {
    const p = node.params || {};
    const size = 1536;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = p.text || "H";
    const family = `"Great Vibes", cursive`;
    let fontSize = p.fontSize || 860;
    let metrics = null;
    for (let i = 0; i < 18; i++) {
      ctx.font = `${fontSize}px ${family}`;
      metrics = ctx.measureText(text);
      const w = Math.abs(metrics.actualBoundingBoxLeft || 0) + Math.abs(metrics.actualBoundingBoxRight || metrics.width);
      const h = Math.abs(metrics.actualBoundingBoxAscent || fontSize * 0.8) + Math.abs(metrics.actualBoundingBoxDescent || fontSize * 0.25);
      if (w <= size * 0.72 && h <= size * 0.68) break;
      fontSize *= 0.92;
    }
    ctx.lineWidth = p.strokeWidth || 18;
    ctx.strokeStyle = p.stroke || "rgba(5,12,11,0.82)";
    ctx.fillStyle = p.fill || "#c9a96e";
    ctx.shadowColor = p.glow || "rgba(201,169,110,0.82)";
    ctx.shadowBlur = p.shadowBlur || 34;
    metrics = metrics || ctx.measureText(text);
    const glyphCenterOffsetX = ((metrics.actualBoundingBoxRight || metrics.width / 2) - (metrics.actualBoundingBoxLeft || metrics.width / 2)) / 2;
    const glyphCenterOffsetY = ((metrics.actualBoundingBoxDescent || fontSize * 0.2) - (metrics.actualBoundingBoxAscent || fontSize * 0.8)) / 2;
    const x = size * 0.5 - glyphCenterOffsetX;
    const y = size * 0.53 - glyphCenterOffsetY;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    const texture = new st.THREE.CanvasTexture(canvas);
    texture.colorSpace = st.THREE.SRGBColorSpace;
    const mat = new st.THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      side: st.THREE.DoubleSide,
      depthWrite: false,
    });
    mat.userData.logoTexture = texture;
    return mat;
  }

  function makeImageLogoMaterial(node) {
    const p = node.params || {};
    const loader = new st.THREE.TextureLoader();
    const texture = loader.load(p.src || "/assets/miraxcode-logo.png");
    texture.colorSpace = st.THREE.SRGBColorSpace;
    return new st.THREE.MeshBasicMaterial({
      map: texture,
      color: new st.THREE.Color(node.color || "#ffffff"),
      transparent: true,
      opacity: 0,
      side: st.THREE.DoubleSide,
      depthWrite: false,
    });
  }

  function buildScanlineMesh(baseY) {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0,    "rgba(75,210,190,0)");
    grad.addColorStop(0.38, "rgba(75,210,190,0)");
    grad.addColorStop(0.5,  "rgba(75,210,190,0.85)");
    grad.addColorStop(0.62, "rgba(75,210,190,0)");
    grad.addColorStop(1,    "rgba(75,210,190,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 128);
    const tex = new st.THREE.CanvasTexture(canvas);
    const geo = new st.THREE.PlaneGeometry(3.2, 0.22);
    const mat = new st.THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, side: st.THREE.DoubleSide, depthWrite: false });
    const mesh = new st.THREE.Mesh(geo, mat);
    mesh.position.set(0, baseY, 0.02);
    mesh.userData.scanBaseY = baseY;
    return mesh;
  }

  function addNodeMesh(node, index, total) {
    const color = node.color ? new st.THREE.Color(node.color) : new st.THREE.Color(ROLE_COLORS[node.role] || ROLE_COLORS.structure);
    const mat = node.type === "logo"
      ? makeLogoMaterial(node)
      : node.type === "logo_img"
      ? makeImageLogoMaterial(node)
      : new st.THREE.MeshStandardMaterial({
        color,
        roughness: 0.42,
        metalness: node.role === "detail" ? 0.55 : 0.28,
        transparent: true,
        opacity: 0,
        emissive: color,
        emissiveIntensity: 0.08,
      });
    if (mat.emissive) {
      mat.userData.baseEmissive = color.clone();
      mat.userData.baseEmissiveIntensity = 0.08;
    }
    // Tier 2: auto-subdivide surface-role organic primitives when AI didn't specify
    let geoParams = node.params || {};
    if (geoParams.subdivisions == null
        && node.role === "surface"
        && ["extrude", "lathe", "mesh", "capsule"].includes(node.type)) {
      geoParams = Object.assign({}, geoParams, { subdivisions: 1 });
    }
    const mesh = new st.THREE.Mesh(finalizeGeometry(primitiveGeometry(node), geoParams), mat);
    // Tier 4: shadows for all real meshes (skip flat logo planes)
    if (node.type !== "logo" && node.type !== "logo_img") {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    const pos = node.position || [0, 0, 0];
    const rot = node.rotation || [0, 0, 0];
    const scale = node.scale || [1, 1, 1];
    mesh.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    mesh.scale.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
    mesh.userData.node = node;
    mesh.userData.nodeId = node.id;
    mesh.userData.selectable = true;
    mesh.userData.originalTransform = {
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      scale: mesh.scale.clone(),
    };
    mesh.name = node.name || node.id || "Forge part";
    st.modelGroup.add(mesh);
    if (node.type === "logo_img") {
      mesh.userData.logoBaseY = mesh.position.y;
      st.logoMeshes.push(mesh);
    }
    st.revealMeshes.push({ mesh, start: performance.now() + index * 90, duration: 760, targetOpacity: node.opacity ?? (node.type === "mesh" ? 0.98 : 0.86) });
    spawnFlightsTo(mesh.position, node.role || "structure", Math.max(10, Math.floor(34 / Math.max(1, total / 8))));
  }

  function updateUnderfloorHighlights() {
    if (!st.THREE || !st.modelGroup) return;
    const box = new st.THREE.Box3();
    selectableMeshes().forEach((mesh) => {
      box.setFromObject(mesh);
      const under = !box.isEmpty() && box.min.y < FLOOR_Y - 0.01;
      const mat = mesh.material;
      if (!mat || Array.isArray(mat) || !mat.emissive) return;
      if (under) {
        mat.emissive.setHex(0xff6f6f);
        mat.emissiveIntensity = 0.32;
        mesh.userData.underFloor = true;
      } else if (mesh.userData.underFloor) {
        mat.emissive.copy(mat.userData.baseEmissive || new st.THREE.Color(ROLE_COLORS[mesh.userData.node?.role] || ROLE_COLORS.structure));
        mat.emissiveIntensity = mat.userData.baseEmissiveIntensity ?? 0.08;
        mesh.userData.underFloor = false;
      }
    });
  }

  function buildPlan(plan) {
    if (!st.THREE || !st.modelGroup) {
      log("Viewport", "Three.js not ready — cannot build plan. Check CDN connectivity.", "err");
      return;
    }
    clearScene();
    st.activePlan = normalizePlan(plan);
    window.ForgeEditor?.setPlanJson?.(st.activePlan);
    const nodes = renderableNodes(st.activePlan.nodes);
    nodes.forEach((node, i) => addNodeMesh(node, i, nodes.length));
    updatePlanList(st.activePlan);
    if (plan._introLogo && st.camera && st.controls) {
      // Intimate framing for the intro logo — skip auto-zoom so the brand reads big
      st.camera.position.set(0, 0.35, 4.8);
      st.controls.target.set(0, 0.2, 0);
      st.controls.update();
    } else {
      frameModel();
    }
    log("Viewport", `Loaded ${nodes.length} mesh part(s) in the void.`);
  }

  function selectableMeshes() {
    const out = [];
    if (!st.modelGroup) return out;
    st.modelGroup.traverse((obj) => {
      if (obj?.isMesh && obj.userData?.selectable) out.push(obj);
    });
    return out;
  }

  function handleCanvasClick(event) {
    if (!st.renderer || !st.camera || !st.raycaster || !st.pointer || !st.modelGroup) return;
    if (st.transformControls?.dragging) return;
    const rect = st.renderer.domElement.getBoundingClientRect();
    st.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    st.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    st.raycaster.setFromCamera(st.pointer, st.camera);
    const hit = st.raycaster.intersectObjects(selectableMeshes(), true)[0];
    selectMesh(hit ? nearestSelectable(hit.object) : null);
  }

  function handleCanvasDoubleClick(event) {
    handleCanvasClick(event);
    focusCameraOnSelection();
  }

  function nearestSelectable(obj) {
    let cur = obj;
    while (cur && !cur.userData?.selectable) cur = cur.parent;
    return cur || null;
  }

  function selectMesh(mesh) {
    if (st.selectionBox) {
      st.scene?.remove(st.selectionBox);
      st.selectionBox.geometry?.dispose?.();
      st.selectionBox.material?.dispose?.();
      st.selectionBox = null;
    }
    st.selectedObjectWhole = false;
    st.selectedMesh = mesh || null;
    if (st.transformControls) {
      if (st.selectedMesh) {
        st.transformControls.attach(st.selectedMesh);
        st.transformControls.setMode(st.transformMode);
      } else {
        st.transformControls.detach();
      }
    }
    if (st.selectedMesh && st.THREE && st.scene) {
      st.selectionBox = new st.THREE.BoxHelper(st.selectedMesh, 0x9ff4e7);
      st.scene.add(st.selectionBox);
      log("Editor", `Selected ${st.selectedMesh.userData.node?.name || st.selectedMesh.name}`, "wait");
    }
    renderSelection();
    updatePlanList(st.activePlan);
  }

  function selectWholeObject() {
    if (!st.modelGroup || !st.modelGroup.children.length) return;
    if (st.selectionBox) {
      st.scene?.remove(st.selectionBox);
      st.selectionBox.geometry?.dispose?.();
      st.selectionBox.material?.dispose?.();
      st.selectionBox = null;
    }
    st.selectedMesh = st.modelGroup;
    st.selectedObjectWhole = true;
    if (st.transformControls) {
      st.transformControls.attach(st.modelGroup);
      st.transformControls.setMode(st.transformMode);
    }
    if (st.THREE && st.scene) {
      st.selectionBox = new st.THREE.BoxHelper(st.modelGroup, 0xffffff);
      st.scene.add(st.selectionBox);
    }
    renderSelection();
    renderCadToolbar();
    updatePlanList(st.activePlan);
    log("Editor", "Selected whole object", "wait");
  }

  function focusCameraOnSelection() {
    if (!st.camera || !st.controls || !st.THREE) return;
    const targetObj = st.selectedMesh || st.modelGroup;
    if (!targetObj) return;
    const box = new st.THREE.Box3().setFromObject(targetObj);
    if (box.isEmpty()) return;
    const center = box.getCenter(new st.THREE.Vector3());
    const sizeVec = box.getSize(new st.THREE.Vector3());
    const radius = Math.max(0.18, sizeVec.length() * 0.5);
    const dir = st.camera.position.clone().sub(st.controls.target);
    if (dir.lengthSq() < 0.0001) dir.set(4, 2.4, 5);
    dir.normalize();
    const distance = Math.max(radius * 2.2, 0.75);
    st.controls.target.copy(center);
    st.camera.position.copy(center).add(dir.multiplyScalar(distance));
    st.camera.near = Math.max(0.01, distance / 100);
    st.camera.updateProjectionMatrix();
    st.controls.update();
    log("Camera", `Focused ${st.selectedObjectWhole ? "whole object" : st.selectedMesh?.userData?.node?.name || "selection"}`, "wait");
  }

  function panCameraVertical(amount) {
    if (!st.camera || !st.controls || !st.THREE) return;
    const up = new st.THREE.Vector3(0, 1, 0).multiplyScalar(amount);
    st.camera.position.add(up);
    st.controls.target.add(up);
    st.controls.update();
    log("Camera", amount > 0 ? "Panned st.camera up" : "Panned st.camera down", "wait");
  }

  function renderSelection() {
    const card = $("frgSelectionCard");
    if (!card) return;
    if (!st.selectedMesh) {
      card.innerHTML = `<div class="frg-selection-empty">Click any part in the void to edit it.</div>`;
      return;
    }
    const node = st.selectedMesh.userData.node || {};
    const pos = st.selectedMesh.position;
    const scale = st.selectedMesh.scale;
    const rot = st.selectedMesh.rotation;
    card.innerHTML = `
      <div class="frg-selection-title">
        <b title="${escapeHtml(st.selectedObjectWhole ? "Whole object" : node.name || st.selectedMesh.name || "Part")}">${escapeHtml(st.selectedObjectWhole ? "Whole object" : node.name || st.selectedMesh.name || "Part")}</b>
        <span>${escapeHtml(st.selectedObjectWhole ? "object" : node.role || "part")}</span>
      </div>
      <div class="frg-edit-buttons">
        <button class="frg-edit-btn${st.transformMode === "translate" ? " active" : ""}" data-frg-edit="translate">Move</button>
        <button class="frg-edit-btn${st.transformMode === "rotate" ? " active" : ""}" data-frg-edit="rotate">Rotate</button>
        <button class="frg-edit-btn${st.transformMode === "scale" ? " active" : ""}" data-frg-edit="scale">Resize</button>
        <button class="frg-edit-btn danger" data-frg-edit="delete">Delete</button>
      </div>
      <div class="frg-edit-buttons">
        <button class="frg-edit-btn" data-frg-edit="duplicate">Duplicate</button>
        <button class="frg-edit-btn" data-frg-edit="floor">To floor</button>
        <button class="frg-edit-btn" data-frg-edit="reset">Reset</button>
        <button class="frg-edit-btn${st.snapEnabled ? " active" : ""}" data-frg-edit="snap">Snap</button>
      </div>
      <div class="frg-edit-grid" aria-label="Position">
        ${["x", "y", "z"].map((axis) => `<span class="frg-edit-field"><label>Pos ${axis.toUpperCase()}</label><input data-frg-pos="${axis}" type="number" step="0.05" value="${escapeHtml(pos[axis].toFixed(2))}"></span>`).join("")}
      </div>
      <div class="frg-edit-grid" aria-label="Scale" style="margin-top:6px">
        ${["x", "y", "z"].map((axis) => `<span class="frg-edit-field"><label>Scale ${axis.toUpperCase()}</label><input data-frg-scale="${axis}" type="number" step="0.05" min="0.02" value="${escapeHtml(scale[axis].toFixed(2))}"></span>`).join("")}
      </div>
      <div class="frg-edit-grid" aria-label="Rotation" style="margin-top:6px">
        ${["x", "y", "z"].map((axis) => `<span class="frg-edit-field"><label>Rot ${axis.toUpperCase()}</label><input data-frg-rot="${axis}" type="number" step="5" value="${escapeHtml(Math.round(st.THREE.MathUtils.radToDeg(rot[axis])))}"></span>`).join("")}
      </div>`;
  }

  function setTransformMode(mode) {
    st.transformMode = mode === "scale" ? "scale" : mode === "rotate" ? "rotate" : "translate";
    if (st.transformControls) st.transformControls.setMode(st.transformMode);
    renderCadToolbar();
    renderSelection();
  }

  function renderCadToolbar() {
    document.querySelectorAll("[data-frg-tool]").forEach((btn) => {
      const tool = btn.dataset.frgTool;
      btn.classList.toggle("active",
        tool === st.transformMode ||
        (tool === "selectObject" && st.selectedObjectWhole) ||
        (tool === "snap" && st.snapEnabled)
      );
    });
  }

  function setSnapEnabled(enabled) {
    st.snapEnabled = !!enabled;
    if (st.transformControls) {
      st.transformControls.setTranslationSnap?.(st.snapEnabled ? 0.1 : null);
      st.transformControls.setRotationSnap?.(st.snapEnabled && st.THREE ? st.THREE.MathUtils.degToRad(5) : null);
      st.transformControls.setScaleSnap?.(st.snapEnabled ? 0.05 : null);
    }
    renderCadToolbar();
    renderSelection();
    log("Editor", st.snapEnabled ? "Snapping enabled" : "Snapping disabled", "wait");
  }

  function syncSelectedNodeFromMesh() {
    if (!st.selectedMesh) return;
    if (st.selectedObjectWhole) {
      st.activePlan?.nodes?.forEach((node) => {
        const mesh = selectableMeshes().find((obj) => obj.userData.nodeId === node.id);
        if (!mesh) return;
        node.position = [mesh.position.x, mesh.position.y, mesh.position.z];
        node.rotation = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z];
        node.scale = [mesh.scale.x, mesh.scale.y, mesh.scale.z];
      });
      queueProjectSave();
      return;
    }
    const node = st.selectedMesh.userData.node;
    if (!node) return;
    node.position = [st.selectedMesh.position.x, st.selectedMesh.position.y, st.selectedMesh.position.z];
    node.rotation = [st.selectedMesh.rotation.x, st.selectedMesh.rotation.y, st.selectedMesh.rotation.z];
    node.scale = [st.selectedMesh.scale.x, st.selectedMesh.scale.y, st.selectedMesh.scale.z];
    queueProjectSave();
  }

  function updateSelectedScale(axis, value) {
    if (!st.selectedMesh) return;
    const n = Math.max(0.02, Number(value) || 0.02);
    st.selectedMesh.scale[axis] = n;
    syncSelectedNodeFromMesh();
    st.selectionBox?.update();
    updatePlanList(st.activePlan);
  }

  function updateSelectedPosition(axis, value) {
    if (!st.selectedMesh) return;
    st.selectedMesh.position[axis] = Number(value) || 0;
    syncSelectedNodeFromMesh();
    st.selectionBox?.update();
    updatePlanList(st.activePlan);
  }

  function updateSelectedRotation(axis, degrees) {
    if (!st.selectedMesh || !st.THREE) return;
    st.selectedMesh.rotation[axis] = st.THREE.MathUtils.degToRad(Number(degrees) || 0);
    syncSelectedNodeFromMesh();
    st.selectionBox?.update();
    updatePlanList(st.activePlan);
  }

  function deleteSelectedPart() {
    if (!st.selectedMesh || !st.modelGroup) return;
    if (st.selectedObjectWhole) {
      const count = st.activePlan?.nodes?.length || st.modelGroup.children.length;
      clearScene();
    st.activePlan = { ...(st.activePlan || { name: "Forge object" }), nodes: [] };
    updatePlanList(st.activePlan);
    renderSelection();
    queueProjectSave();
    log("Editor", `Deleted whole object · ${count} part(s)`, "warn");
    return;
    }
    const nodeId = st.selectedMesh.userData.nodeId;
    const label = st.selectedMesh.userData.node?.name || st.selectedMesh.name || "part";
    st.transformControls?.detach();
    if (st.selectionBox) {
      st.scene?.remove(st.selectionBox);
      st.selectionBox.geometry?.dispose?.();
      st.selectionBox.material?.dispose?.();
      st.selectionBox = null;
    }
    st.revealMeshes = st.revealMeshes.filter((item) => item.mesh !== st.selectedMesh);
    st.modelGroup.remove(st.selectedMesh);
    st.selectedMesh.geometry?.dispose?.();
    if (Array.isArray(st.selectedMesh.material)) st.selectedMesh.material.forEach((m) => m.dispose?.());
    else st.selectedMesh.material?.dispose?.();
    if (st.activePlan?.nodes) st.activePlan.nodes = st.activePlan.nodes.filter((node) => node.id !== nodeId);
    st.selectedMesh = null;
    updatePlanList(st.activePlan);
    renderSelection();
    queueProjectSave();
    log("Editor", `Deleted ${label}`, "warn");
  }

  function duplicateSelectedPart() {
    if (!st.selectedMesh || !st.activePlan || !st.modelGroup) return;
    if (st.selectedObjectWhole) {
      const sourceNodes = st.activePlan.nodes.map((node) => JSON.parse(JSON.stringify(node)));
      const suffix = Date.now().toString(36);
      const clones = sourceNodes.map((node) => ({
        ...node,
        id: `${node.id}_copy_${suffix}`,
        name: `${node.name || node.id || "Part"} copy`,
        position: [(node.position?.[0] || 0) + 0.38, node.position?.[1] || 0, (node.position?.[2] || 0) + 0.38],
      }));
      st.activePlan.nodes.push(...clones);
      clones.forEach((node, i) => addNodeMesh(node, st.activePlan.nodes.length - clones.length + i, st.activePlan.nodes.length));
      updatePlanList(st.activePlan);
      selectWholeObject();
      queueProjectSave();
      log("Editor", `Duplicated whole object · ${clones.length} part(s)`, "ok");
      return;
    }
    const sourceNode = st.selectedMesh.userData.node || {};
    const cloneNode = JSON.parse(JSON.stringify(sourceNode));
    cloneNode.id = `${sourceNode.id || "part"}_copy_${Date.now().toString(36)}`;
    cloneNode.name = `${sourceNode.name || st.selectedMesh.name || "Part"} copy`;
    cloneNode.position = [
      st.selectedMesh.position.x + 0.22,
      st.selectedMesh.position.y,
      st.selectedMesh.position.z + 0.22,
    ];
    cloneNode.rotation = [st.selectedMesh.rotation.x, st.selectedMesh.rotation.y, st.selectedMesh.rotation.z];
    cloneNode.scale = [st.selectedMesh.scale.x, st.selectedMesh.scale.y, st.selectedMesh.scale.z];
    st.activePlan.nodes.push(cloneNode);
    addNodeMesh(cloneNode, st.activePlan.nodes.length - 1, st.activePlan.nodes.length);
    const mesh = selectableMeshes().find((obj) => obj.userData.nodeId === cloneNode.id);
    updatePlanList(st.activePlan);
    selectMesh(mesh || null);
    queueProjectSave();
    log("Editor", `Duplicated ${sourceNode.name || st.selectedMesh.name || "part"}`, "ok");
  }

  function resetSelectedPart() {
    if (!st.selectedMesh) return;
    if (st.selectedObjectWhole) {
      st.modelGroup.position.set(0, 0, 0);
      st.modelGroup.rotation.set(0, 0, 0);
      st.modelGroup.scale.set(1, 1, 1);
      st.selectionBox?.update();
      renderSelection();
      queueProjectSave();
      log("Editor", "Reset whole object transform", "wait");
      return;
    }
    const original = st.selectedMesh.userData.originalTransform;
    if (!original) return;
    st.selectedMesh.position.copy(original.position);
    st.selectedMesh.rotation.copy(original.rotation);
    st.selectedMesh.scale.copy(original.scale);
    syncSelectedNodeFromMesh();
    st.selectionBox?.update();
    renderSelection();
    updatePlanList(st.activePlan);
    queueProjectSave();
    log("Editor", `Reset ${st.selectedMesh.userData.node?.name || st.selectedMesh.name || "part"}`, "wait");
  }

  function alignSelectedToFloor() {
    if (!st.selectedMesh || !st.THREE) return;
    const box = new st.THREE.Box3().setFromObject(st.selectedMesh);
    if (box.isEmpty()) return;
    st.selectedMesh.position.y += FLOOR_Y - box.min.y;
    syncSelectedNodeFromMesh();
    st.selectionBox?.update();
    renderSelection();
    updatePlanList(st.activePlan);
    queueProjectSave();
    log("Editor", `Aligned ${st.selectedMesh.userData.node?.name || st.selectedMesh.name || "part"} to floor`, "ok");
  }

  async function ensurePipelineModule(kind) {
    if (kind === "gltfLoader" && !st.GLTFLoader) {
      const mod = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/loaders/GLTFLoader.js");
      st.GLTFLoader = mod.GLTFLoader;
    } else if (kind === "gltfExporter" && !st.GLTFExporter) {
      const mod = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/exporters/GLTFExporter.js");
      st.GLTFExporter = mod.GLTFExporter;
    } else if (kind === "stlExporter" && !st.STLExporter) {
      const mod = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/exporters/STLExporter.js");
      st.STLExporter = mod.STLExporter;
    } else if (kind === "objExporter" && !st.OBJExporter) {
      const mod = await import("https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/exporters/OBJExporter.js");
      st.OBJExporter = mod.OBJExporter;
    }
  }

  function exportableObject() {
    if (!st.modelGroup || !st.modelGroup.children.length) return null;
    syncSelectedNodeFromMesh();
    const clone = st.modelGroup.clone(true);
    clone.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.visible = true;
      obj.material = Array.isArray(obj.material) ? obj.material.map((m) => m.clone()) : obj.material?.clone?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          mat.opacity = Math.max(mat.opacity || 1, 0.86);
          mat.transparent = false;
          mat.depthWrite = true;
        });
      }
    });
    return clone;
  }

  async function exportForgeAsset(kind) {
    if (!await initThree()) return;
    const object = exportableObject();
    if (!object) {
      log("Pipeline", "No model to export", "warn");
      return;
    }
    updateStage("export", "active", `writing ${kind.toUpperCase()}`);
    const base = safeFileName(st.activePlan?.name || $("frgPrompt")?.value || "3d-forge-model");
    try {
      if (kind === "glb") {
        if (st.activePlan?.glbUrl) {
          const a = document.createElement("a");
          a.href = st.activePlan.glbUrl;
          a.download = `${base}.glb`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          log("Pipeline", "Downloaded kernel GLB asset", "ok");
          updateStage("export", "done", "GLB exported");
          return;
        }
        await ensurePipelineModule("gltfExporter");
        const exporter = new st.GLTFExporter();
        const result = await new Promise((resolve, reject) => {
          exporter.parse(object, resolve, reject, { binary: true, onlyVisible: true, trs: false });
        });
        downloadBlob(`${base}.glb`, new Blob([result], { type: "model/gltf-binary" }));
      } else if (kind === "obj") {
        await ensurePipelineModule("objExporter");
        const text = new st.OBJExporter().parse(object);
        downloadBlob(`${base}.obj`, new Blob([text], { type: "text/plain" }));
      } else if (kind === "stl") {
        await ensurePipelineModule("stlExporter");
        const result = new st.STLExporter().parse(object, { binary: true });
        downloadBlob(`${base}.stl`, new Blob([result], { type: "model/stl" }));
      }
      log("Pipeline", `Exported ${kind.toUpperCase()} asset`, "ok");
      updateStage("export", "done", `${kind.toUpperCase()} exported`);
    } catch (err) {
      log("Pipeline", `Export failed · ${err.message || err}`, "err");
      updateStage("export", "active", "export failed");
    }
  }

  async function importForgeAsset(file) {
    if (!file || !await initThree()) return;
    try {
      await ensurePipelineModule("gltfLoader");
      const url = URL.createObjectURL(file);
      const loader = new st.GLTFLoader();
      const gltf = await loader.loadAsync(url);
      URL.revokeObjectURL(url);
      const nodes = meshNodesFromScene(gltf.st.scene, file.name);
      if (!nodes.length) {
        log("Pipeline", "Imported asset had no supported mesh parts", "warn");
        return;
      }
      const current = st.activePlan?.nodes?.length ? normalizePlan(st.activePlan) : { name: `Imported ${file.name.replace(/\.[^.]+$/, "")}`, nodes: [] };
      current.nodes = current.nodes.concat(nodes).slice(0, MAX_FORGE_NODES);
      current.name = current.name || `Imported ${file.name.replace(/\.[^.]+$/, "")}`;
      buildPlan(current);
      saveCurrentProject(false);
      log("Pipeline", `Imported ${nodes.length} mesh part(s) from ${file.name}`, "ok");
    } catch (err) {
      log("Pipeline", `Import failed · ${err.message || err}`, "err");
    }
  }

  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function selectNodeById(nodeId) {
    const mesh = selectableMeshes().find((obj) => obj.userData.nodeId === nodeId);
    if (mesh) selectMesh(mesh);
  }

  function randomSpherePoint(radius) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    return new st.THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  function spawnFlightsTo(target, role, count) {
    if (!st.THREE || !st.particleGroup) return;
    const color = ROLE_COLORS[role] || ROLE_COLORS.structure;
    const geo = new st.THREE.SphereGeometry(0.025, 8, 8);
    const mat = new st.THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const now = performance.now();
    const duration = role === "structure" ? 2800 : role === "surface" ? 2000 : role === "detail" ? 1400 : 3500;
    for (let i = 0; i < count; i++) {
      const mesh = new st.THREE.Mesh(geo, mat.clone());
      const p0 = randomSpherePoint(7.8 + Math.random() * 2.2);
      const p3 = target.clone();
      const lift = role === "structure" ? 2.4 : role === "surface" ? 0.9 : role === "detail" ? 0.35 : 3.2;
      const side = new st.THREE.Vector3(-p3.z, 0, p3.x).normalize().multiplyScalar(role === "surface" ? 1.5 : role === "audit" ? 2.7 : 0.7);
      const p1 = p0.clone().multiplyScalar(0.62).add(new st.THREE.Vector3(0, lift, 0)).add(side);
      const p2 = p3.clone().add(new st.THREE.Vector3(0, lift * 0.45, 0)).sub(side.multiplyScalar(0.55));
      const curve = new st.THREE.CubicBezierCurve3(p0, p1, p2, p3);
      mesh.position.copy(p0);
      st.particleGroup.add(mesh);
      st.flights.push({ mesh, curve, start: now + i * 18, duration: duration * (0.78 + Math.random() * 0.34) });
    }
    $("frgParticleCount").textContent = `${st.flights.length} particles`;
  }

  function updateFlights(now) {
    for (let i = st.flights.length - 1; i >= 0; i--) {
      const f = st.flights[i];
      const t = Math.min(1, Math.max(0, (now - f.start) / f.duration));
      f.mesh.position.copy(f.curve.getPoint(t));
      f.mesh.material.opacity = 1 - Math.max(0, t - 0.72) / 0.28;
      if (t >= 1) {
        st.particleGroup.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        st.flights.splice(i, 1);
      }
    }
    const pc = $("frgParticleCount");
    if (pc) pc.textContent = `${st.flights.length} particles`;
  }

  function updateReveal(now) {
    for (const item of st.revealMeshes) {
      const t = Math.min(1, Math.max(0, (now - item.start) / item.duration));
      item.mesh.material.opacity = item.targetOpacity * easeOut(t);
    }
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function frameModel() {
    if (!st.modelGroup || !st.camera || !st.controls) return;
    const box = new st.THREE.Box3().setFromObject(st.modelGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new st.THREE.Vector3());
    const size = box.getSize(new st.THREE.Vector3()).length();
    st.controls.target.copy(center);
    st.camera.position.copy(center).add(new st.THREE.Vector3(size * 0.62 + 3.2, size * 0.38 + 2.4, size * 0.78 + 4.2));
    st.camera.lookAt(center);
    st.controls.update();
  }

  function resetView() {
    if (!st.camera || !st.controls) return;
    st.camera.position.set(6, 4.2, 8);
    st.controls.target.set(0, 0.55, 0);
    st.controls.update();
  }

  return {
    initThree, clearScene, buildPlan, resetView, frameModel, selectMesh, selectWholeObject,
    selectNodeById, deleteSelectedPart, duplicateSelectedPart, resetSelectedPart,
    alignSelectedToFloor, setTransformMode, setSnapEnabled, updateSelectedScale,
    updateSelectedPosition, updateSelectedRotation, focusCameraOnSelection, panCameraVertical,
    exportForgeAsset, importForgeAsset, exportableObject, spawnFlightsTo, selectableMeshes,
    renderCadToolbar, renderSelection,
  };
}
