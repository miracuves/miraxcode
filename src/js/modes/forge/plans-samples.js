/** Built-in sample / template plans (Wave 17). */
import { box, cyl, sphere, vec3 } from './plan.js';

export function createForgePlansSamplesApi(ctx) {
  const { classifyForgePrompt } = ctx;

  function hLogoPlan() {
    return {
      name: "MiraXcode intro mark",
      _introLogo: true,
      nodes: [
        { id: "hcx_teal_halo", name: "Teal halo layer", role: "structure", type: "logo_img",
          position: [0.06, 0.2, -0.08], rotation: [0, 0, 0], scale: [1, 1, 1],
          params: { width: 4.4, height: 2.86, src: "/assets/miraxcode-logo.png" },
          color: "#4bd2be", opacity: 0.26 },
        { id: "hcx_main", name: "MiraXcode logo", role: "surface", type: "logo_img",
          position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
          params: { width: 4.0, height: 2.6, src: "/assets/miraxcode-logo.png" },
          color: "#ffffff", opacity: 0.98 },
        { id: "hcx_gold_sheen", name: "Gold sheen overlay", role: "detail", type: "logo_img",
          position: [-0.03, 0.22, 0.04], rotation: [0, 0, 0], scale: [1, 1, 1],
          params: { width: 4.05, height: 2.63, src: "/assets/miraxcode-logo.png" },
          color: "#c9a96e", opacity: 0.22 },
      ],
    };
  }

  function chairPlan() {
    return {
      name: "Forged ergonomic chair",
      nodes: [
        box("seat", "Seat slab", "structure", [0, 0, 0], [1.7, 0.18, 1.45], "#4bd2be"),
        box("back", "Curved back plane", "surface", [0, 0.92, -0.62], [1.75, 1.55, 0.18], "#f5c97a", [-0.28, 0, 0]),
        cyl("leg_fl", "Front left leg", "structure", [-0.68, -0.78, 0.48], 0.07, 1.45, "#4bd2be"),
        cyl("leg_fr", "Front right leg", "structure", [0.68, -0.78, 0.48], 0.07, 1.45, "#4bd2be"),
        cyl("leg_bl", "Back left leg", "structure", [-0.68, -0.76, -0.48], 0.07, 1.38, "#4bd2be"),
        cyl("leg_br", "Back right leg", "structure", [0.68, -0.76, -0.48], 0.07, 1.38, "#4bd2be"),
        box("arm_l", "Left arm rest", "surface", [-1.02, 0.34, 0], [0.16, 0.16, 1.35], "#f5c97a"),
        box("arm_r", "Right arm rest", "surface", [1.02, 0.34, 0], [0.16, 0.16, 1.35], "#f5c97a"),
        torus("lumbar", "Lumbar detail", "detail", [0, 0.86, -0.75], 0.58, 0.035, "#8fb7ff", [Math.PI / 2, 0, 0]),
        sphere("audit_marker", "Balance marker", "audit", [0, -1.46, 0], 0.09, "#ff8f8f"),
      ],
    };
  }

  function roverPlan() {
    return {
      name: "Forged lunar rover",
      nodes: [
        box("body", "Pressure body", "structure", [0, 0.22, 0], [2.2, 0.55, 1.25], "#4bd2be"),
        box("deck", "Instrument deck", "surface", [0, 0.64, -0.05], [1.55, 0.18, 0.92], "#f5c97a"),
        cyl("wheel_fl", "Wheel front left", "structure", [-0.88, -0.24, 0.72], 0.32, 0.22, "#4bd2be", [Math.PI / 2, 0, 0]),
        cyl("wheel_fr", "Wheel front right", "structure", [0.88, -0.24, 0.72], 0.32, 0.22, "#4bd2be", [Math.PI / 2, 0, 0]),
        cyl("wheel_bl", "Wheel back left", "structure", [-0.88, -0.24, -0.72], 0.32, 0.22, "#4bd2be", [Math.PI / 2, 0, 0]),
        cyl("wheel_br", "Wheel back right", "structure", [0.88, -0.24, -0.72], 0.32, 0.22, "#4bd2be", [Math.PI / 2, 0, 0]),
        cyl("mast", "Sensor mast", "detail", [0.48, 1.08, -0.25], 0.045, 1.05, "#8fb7ff"),
        sphere("camera", "Camera head", "detail", [0.48, 1.68, -0.25], 0.18, "#8fb7ff"),
        box("solar_l", "Left solar wing", "surface", [-1.42, 0.58, 0], [0.85, 0.06, 1.18], "#f5c97a"),
        box("solar_r", "Right solar wing", "surface", [1.42, 0.58, 0], [0.85, 0.06, 1.18], "#f5c97a"),
      ],
    };
  }

  function dronePlan(prompt) {
    const q = String(prompt || "").toLowerCase();
    const heavy = /cinema|camera|professional|heavy|large/.test(q);
    const arm = heavy ? 1.38 : 1.14;
    const gold = "#c9a96e";
    const bright = "#f5d77a";
    const dark = "#070a0d";
    const teal = "#4bd2be";
    const nodes = [
      ellipsoid("fuselage_shell", "Dark rounded avionics body", "structure", [0, 0.02, 0], 0.42, [1.55, 0.36, 0.9], dark, [0, 0, 0], 0.94),
      box("gold_body_frame", "Gold body frame", "surface", [0, 0.075, 0], [0.96, 0.09, 0.54], gold),
      box("front_sensor_panel", "Front sensor panel", "surface", [0, 0.04, 0.44], [0.38, 0.16, 0.055], "#181210"),
      cyl("main_camera_barrel", "Forward camera barrel", "detail", [0.18, 0.04, 0.51], 0.09, 0.09, gold, [Math.PI / 2, 0, 0]),
      cyl("glass_camera_lens", "Glowing camera lens", "detail", [0.18, 0.04, 0.565], 0.055, 0.025, teal, [Math.PI / 2, 0, 0]),
      sphere("status_led", "Pulsing gold status LED", "detail", [-0.18, 0.105, 0.48], 0.035, bright),
      capsule("left_front_arm", "Left front carbon arm", "structure", [-arm * 0.42, 0.03, arm * 0.42], 0.035, arm * 1.1, gold, [0, Math.PI / 4, Math.PI / 2]),
      capsule("right_front_arm", "Right front carbon arm", "structure", [arm * 0.42, 0.03, arm * 0.42], 0.035, arm * 1.1, gold, [0, -Math.PI / 4, Math.PI / 2]),
      capsule("left_rear_arm", "Left rear carbon arm", "structure", [-arm * 0.42, 0.03, -arm * 0.42], 0.035, arm * 1.1, gold, [0, -Math.PI / 4, Math.PI / 2]),
      capsule("right_rear_arm", "Right rear carbon arm", "structure", [arm * 0.42, 0.03, -arm * 0.42], 0.035, arm * 1.1, gold, [0, Math.PI / 4, Math.PI / 2]),
      capsule("left_landing_strut", "Left landing strut", "structure", [-0.34, -0.34, 0.1], 0.025, 0.68, gold, [0.22, 0, 0]),
      capsule("right_landing_strut", "Right landing strut", "structure", [0.34, -0.34, 0.1], 0.025, 0.68, gold, [-0.22, 0, 0]),
      capsule("landing_skid", "Gold landing skid", "structure", [0, -0.72, 0.14], 0.03, 1.08, gold, [0, 0, Math.PI / 2]),
    ];
    [
      ["front_left", -arm, arm, 1],
      ["front_right", arm, arm, -1],
      ["rear_left", -arm, -arm, -1],
      ["rear_right", arm, -arm, 1],
    ].forEach(([id, x, z, spin], i) => {
      nodes.push(cyl(`motor_${id}`, `${labelWords(id)} motor pod`, "structure", [x, 0.06, z], 0.13, 0.13, gold));
      nodes.push(torus(`rotor_guard_${id}`, `${labelWords(id)} rotor halo guard`, "surface", [x, 0.09, z], 0.38, 0.018, gold));
      nodes.push(cyl(`rotor_hub_${id}`, `${labelWords(id)} rotor hub`, "detail", [x, 0.12, z], 0.055, 0.045, bright));
      nodes.push(box(`propeller_a_${id}`, `${labelWords(id)} spinning propeller blade A`, "detail", [x, 0.145, z], [0.7, 0.018, 0.055], bright, [0, i * 0.42, 0]));
      nodes.push(box(`propeller_b_${id}`, `${labelWords(id)} spinning propeller blade B`, "detail", [x, 0.148, z], [0.055, 0.018, 0.7], bright, [0, spin * 0.32, 0]));
      nodes.push(sphere(`rotor_glow_${id}`, `${labelWords(id)} rotor glow core`, "detail", [x, 0.18, z], 0.035, "#fff8c0"));
    });
    nodes.push(box("top_gold_rail", "Top gold electronics rail", "surface", [0, 0.28, -0.04], [0.72, 0.045, 0.16], gold));
    nodes.push(box("battery_pack", "Rear battery pack", "structure", [0, 0.1, -0.42], [0.54, 0.18, 0.22], "#181210"));
    nodes.push(box("battery_gold_cap", "Battery gold cap", "detail", [0, 0.13, -0.55], [0.46, 0.13, 0.035], gold));
    return { name: heavy ? "Forged professional camera drone" : "Forged intro quad drone", nodes };
  }

  function labelWords(id) {
    return String(id).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function housePlan() {
    return {
      name: "Forged modular house",
      nodes: [
        box("base", "Main volume", "structure", [0, 0, 0], [2.5, 1.35, 1.75], "#4bd2be"),
        cone("roof", "Pitched roof", "surface", [0, 1.05, 0], 1.55, 0.95, "#f5c97a", [0, Math.PI / 4, 0]),
        box("door", "Recessed door", "detail", [0, -0.34, 0.9], [0.42, 0.78, 0.08], "#8fb7ff"),
        box("window_l", "Left window", "detail", [-0.72, 0.18, 0.91], [0.42, 0.35, 0.07], "#8fb7ff"),
        box("window_r", "Right window", "detail", [0.72, 0.18, 0.91], [0.42, 0.35, 0.07], "#8fb7ff"),
        cyl("chimney", "Chimney", "surface", [0.82, 1.58, -0.35], 0.12, 0.75, "#f5c97a"),
        box("audit_foundation", "Foundation audit plane", "audit", [0, -0.77, 0], [2.72, 0.06, 1.95], "#ff8f8f"),
      ],
    };
  }

  function towerPlan() {
    const nodes = [cyl("core", "Central tower core", "structure", [0, 0.75, 0], 0.55, 3.2, "#4bd2be")];
    for (let i = 0; i < 6; i++) {
      nodes.push(box(`floor_${i}`, `Cantilever floor ${i + 1}`, i % 2 ? "surface" : "structure", [0, -0.55 + i * 0.52, 0], [1.55 - i * 0.09, 0.08, 1.2 - i * 0.06], i % 2 ? "#f5c97a" : "#4bd2be", [0, i * 0.28, 0]));
    }
    nodes.push(cone("spire", "Signal spire", "detail", [0, 2.78, 0], 0.28, 0.9, "#8fb7ff"));
    nodes.push(torus("audit_ring", "Overhang audit ring", "audit", [0, 1.02, 0], 1.05, 0.02, "#ff8f8f"));
    return { name: "Forged tower study", nodes };
  }

  function mechanismPlan() {
    return {
      name: "Forged watch mechanism",
      nodes: [
        torus("outer", "Outer case ring", "structure", [0, 0, 0], 1.2, 0.08, "#4bd2be"),
        torus("inner", "Inner gear ring", "surface", [0, 0, 0], 0.78, 0.045, "#f5c97a"),
        cyl("hub", "Central hub", "structure", [0, 0, 0], 0.18, 0.16, "#4bd2be"),
        ...Array.from({ length: 12 }, (_, i) => {
          const a = i / 12 * Math.PI * 2;
          return box(`tooth_${i}`, `Gear tooth ${i + 1}`, "detail", [Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78], [0.12, 0.12, 0.26], "#8fb7ff", [0, -a, 0]);
        }),
        box("hand_h", "Hour hand", "surface", [0.25, 0.12, 0], [0.62, 0.04, 0.06], "#f5c97a", [0, 0, -0.3]),
        box("hand_m", "Minute hand", "surface", [0, 0.14, -0.42], [0.05, 0.04, 0.86], "#f5c97a", [0, 0.2, 0]),
      ],
    };
  }

  return {
    hLogoPlan, chairPlan, roverPlan, dronePlan, labelWords, housePlan, towerPlan, mechanismPlan,
  };
}
