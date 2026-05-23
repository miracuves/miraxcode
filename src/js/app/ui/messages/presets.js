// ========= Rendering =========
// Every preset ends with a TASK slot the user fills in. Short = less prompt
// processing on the local host, faster first token.

// 2026 design vocabulary. Concrete and descriptive so even local models with
// older training cutoffs (that have never "seen" 2026) produce the right look.
export const LOOK_2026 = `=== 2026 LOOK (concrete spec — follow exactly even if your training is older) ===
Layout: bento-grid sections (asymmetric tiles, varied row heights), generous whitespace, max-width ~1200px content gutters.
Background: warm-tinted near-black (e.g. #0a0a0f, #0d0e14 — never pure #000 or pure #fff). Add a soft mesh/aurora gradient blob (2-3 stops, 40% opacity, blurred 80px+) behind the hero.
Typography: variable sans for body (Geist, Inter, or Satoshi). Editorial serif display for hero headlines (Fraunces, Instrument Serif, or Cormorant). Headlines 4xl-7xl, tight tracking (-0.02em), line-height 1.0-1.1.
Color: ONE bold accent (e.g. electric violet #7c3aed, lime #a3e635, or warm amber #f59e0b) + 2 neutral grays. No rainbow. No flat primary blue.
Surfaces: glass cards — bg rgba(255,255,255,0.04), backdrop-blur(20px), 1px hairline border rgba(255,255,255,0.08), rounded-2xl (16px) or rounded-3xl (24px) corners.
Texture: 3% opacity grain/noise overlay across large surfaces (SVG noise filter). Breaks the flatness.
Buttons: pill-shaped (rounded-full), accent-colored solid for primary, ghost (transparent border) for secondary. No drop shadows — use inner highlight + 1px ring instead.
Motion: spring physics (Framer Motion on web, Reanimated on RN). Hover = scale 1.02 + soft glow, 150ms. Press = scale 0.97, 100ms. Page enter = fade + 8px upward slide, 300ms cubic-bezier(0.22,1,0.36,1). Lists = stagger 40ms per item. Respect prefers-reduced-motion.
Patterns: floating sticky nav (backdrop-blur, hairline border), Cmd+K command palette, skeleton loaders not spinners, optimistic UI, empty states with personality.
Reference vibe: Linear + Vercel + Arc Browser + Raycast. Quiet confidence, not loud. Every detail intentional.`;

export const HASH_AI_PROMPT = `You are the user's personal AI assistant.
Be direct and concise. No preamble, no filler, no closing remarks.
Use bullet points for lists. Use code blocks for all code.
Prefer practical steps over theory.
Never guess or invent facts — say "I don't know" instead.`;

export const FULLSTACK_PROMPT = `Build a production-ready full-stack web app.
Stack: Next.js 15 + TS + Tailwind v4 + shadcn/ui + Framer Motion · tRPC v11 · Drizzle + Postgres · Auth.js · Zod · pnpm.
Deliverables: folder tree, every file's full contents (labeled), run commands, .env.example.

${LOOK_2026}`;

export const MOBILE_PROMPT = `Build a production-ready cross-platform mobile app.
Stack: Expo SDK 52 + TS + Expo Router + NativeWind v4 + Reanimated v3 + Zustand + TanStack Query · pnpm.
Deliverables: folder tree, every file's full contents (labeled), run commands.
Mobile extras: animated custom tab bar, haptics on every meaningful interaction, light+dark with smooth transition, shared-element transitions between screens.

${LOOK_2026}`;

export const SPEED_PROMPT = `SPEED MODE — until I say "normal mode":
- 1-3 short sentences by default. No preamble, no recap, no closers.
- Shortest correct reasoning path. Don't think out loud.
- "unknown" if you don't know. Never invent APIs/citations.
- Bullets over prose. Code blocks only when code is needed.`;

// ================ Coding-mode preset prompts ================
// Tight, task-focused. They lean on past chat for the actual code rather
// than re-shipping a long preamble — that keeps prompt processing fast.

export const REST_API_PROMPT = `Build a production REST API.
Stack: TS + Fastify or NestJS · JWT (access+refresh, httpOnly, rotation) · Postgres + Prisma/Drizzle · Zod on every route · pino logs · helmet + CORS + rate limit · vitest + supertest · multi-stage Dockerfile + docker-compose.
Deliver: folder tree → every file → run commands.`;

export const REFACTOR_PROMPT = `Refactor the code from our chat above.
1. Top 3 concrete issues (naming, coupling, dead code, types, a11y, perf).
2. Full refactored file (not a diff). Preserve public behavior.
3. Bullet list: every change → one-line rationale.`;

export const EXPLAIN_ERROR_PROMPT = `Explain the error from our chat above.
1. Exact cause (one sentence).
2. Why it happens (2-4 mechanism-level bullets).
3. Full corrected snippet.
4. Hardening: guard / test / lint rule that prevents recurrence.`;

export const WRITE_TESTS_PROMPT = `Write tests for the code from our chat above.
- Pick the right framework for the stack (vitest / jest / pytest / xctest).
- Unit tests per exported function: happy + 1 failure + 1 edge.
- Integration tests where there's real IO (DB/HTTP/FS).
- Run command + expected output at the end.`;

export const DEBUG_PROMPT = `Debug the code from our chat above.
1. What it currently does (3 lines).
2. What it should do.
3. The specific bug, named (off-by-one, race, stale closure, type coercion…).
4. Full corrected file.
5. A one-liner test that would have caught it.`;

export const OPTIMIZE_PROMPT = `Optimize the code from our chat above (speed / memory / bundle / DB / render).
1. Name the profiling tool you'd use to confirm the bottleneck.
2. Full optimized file.
3. Table: change → expected win → cost.
If it's already fine, say so.`;

export const CODE_REVIEW_PROMPT = `Review the diff/file from our chat above like a staff engineer.
- Correctness (must-fix), design (should-fix, justify), style (optional), security/a11y/perf, missing tests.
- Each finding: verdict + rationale + suggested fix as code.
- End with a 1-sentence ship/no-ship call.`;

export const FORGE_ARCHITECT_PROMPT = `You are 3D Forge mode inside MiraXcode.
Goal: help build Forge, a React + Three.js architecture-first 3D agent swarm planner. Be concrete and implementation-focused.

Core stack:
- Vite + React + TypeScript.
- Three.js 0.184, @react-three/fiber 9.6, drei 10.7, postprocessing 3.0.
- Rapier and manifold-3d use WASM, so vite.config.ts needs wasm(), topLevelAwait(), COOP/COEP headers, and optimizeDeps.exclude for WASM packages.
- Zustand + immer for state. No per-frame React re-renders.

Architecture rules:
- Write /src/types/forge.ts and /src/types/geometry.ts before implementation.
- AgentRole = structure | surface | detail | audit. Keep ROLE_COLORS centralized.
- GeometryPlan is the AI output. It contains nodes, edges, surfaces, and constraints.
- Data flow is one-way: prompt -> forgeAgent stream -> nodes arrive -> particles spawn -> density rises -> solidifyNode -> build mesh/CSG/check constraints -> fade opacity -> push snapshot.
- Hot path lives in useStore.getState() inside useFrame. Do not put per-frame particle data in React state.
- Particle trails use preallocated instancing and shader attributes, not per-frame DOM or React updates.
- CSG and constraint checks fire once on solidification, never every frame.

AI protocol:
- Force exactly one tool call named generate_geometry_plan.
- The schema requires 2-40 nodes, CSG edges, surface material hints, and constraints.
- Stream tool-call argument deltas. Use bracket depth to emit node_added events as soon as complete node objects arrive.
- System prompt must order nodes before edges.

Swarm math:
- Spawn points are random points on a sphere radius 8.
- Targets are node positions.
- Use THREE.CubicBezierCurve3.getPoint(t).
- Durations: structure 2800ms, surface 2000ms, detail 1400ms, audit 3500ms.
- Solidification opacity = clamp(arrivedParticles / totalParticles / threshold, 0, 1).

Build order:
1. Dark void + orbit controls.
2. Prompt bar + mock 5-node chair GeometryPlan.
3. Swarm particle system.
4. Mesh emergence animation.
5. Constraint overlay.
6. Version scrubber.
7. Export pipeline.

Answer format:
- For implementation requests, return exact file paths and full code or tight patches.
- For planning requests, return phase, file order, acceptance criteria, and risks.
- Keep performance budgets visible when touching SwarmParticles, meshBuilder, or useGeometry.`;

export const FORGE_SCAFFOLD_PROMPT = `Create the 3D Forge project scaffold.
Use Vite React TypeScript and this exact dependency plan:
- 3D: three@0.184.0, @react-three/fiber@9.6.1, @react-three/drei@10.7.7, @react-three/postprocessing@3.0.4, postprocessing@6.39.1, @types/three@0.184.0
- Physics visuals: @dimforge/rapier3d-compat@0.19.3
- Geometry: three-csg-ts@3.2.0, manifold-3d@3.4.1
- State/AI/UI: zustand@5.0.13, immer@11.1.7, openai@6.36.0, @anthropic-ai/sdk@0.95.0, framer-motion@12.38.0, clsx@2.1.1, tailwind-merge@3.5.0, leva@0.10.1
- Dev: tailwindcss@4.2.4, @tailwindcss/vite, vite-plugin-wasm@3.6.0, vite-plugin-top-level-await@1.6.0
Deliver folder tree, commands, vite.config.ts with WASM plugins plus COOP/COEP headers, and the first runnable App.tsx.`;

export const FORGE_TYPES_PROMPT = `Write Forge's TypeScript type system first.
Deliver /src/types/forge.ts and /src/types/geometry.ts.
Include AgentRole, ROLE_COLORS, ParticleState, BezierPath, SwarmParticle with trailPoints[32], AgentMessage, ConflictEntry, GeometrySnapshot, ExportOptions, all five Zustand slice interfaces, primitive discriminated unions, GeometryNode, GeometryEdge, GeometryPlan, VertexDensityMap, and ConstraintViolation.`;

export const FORGE_AGENT_PROMPT = `Design /src/agents/forgeAgent.ts.
Implement the generate_geometry_plan tool schema, forced tool_choice, streaming argument accumulation, bracket-depth node extraction, node_added events, final plan validation, and the system prompt that orders nodes before edges. Include robust parsing failure behavior.`;

export const FORGE_SWARM_PROMPT = `Implement /src/canvas/SwarmParticles.tsx and the supporting store methods.
Use instanced particles, CubicBezierCurve3 paths, role-specific arcs and durations, ring-buffer trailPoints[32], preallocated trail instancing, and no per-frame React state. Include dirty flags and activeCount-based draw counts.`;

export const FORGE_PHASES_PROMPT = `Turn 3D Forge into a 7-phase implementation checklist.
For each phase include deliverables, files touched, done criteria, tests/visual checks, and likely failure points. Preserve the critical file order: types, forgeAgent, SwarmParticles, meshBuilder, useGeometry.`;

export const PRESET_PROMPTS = {
  hashAi: HASH_AI_PROMPT,
  fullstack: FULLSTACK_PROMPT,
  mobile: MOBILE_PROMPT,
  freeRam: SPEED_PROMPT,
  restApi: REST_API_PROMPT,
  refactor: REFACTOR_PROMPT,
  explainErr: EXPLAIN_ERROR_PROMPT,
  writeTests: WRITE_TESTS_PROMPT,
  debug: DEBUG_PROMPT,
  optimize: OPTIMIZE_PROMPT,
  codeReview: CODE_REVIEW_PROMPT,
  forgeScaffold: FORGE_SCAFFOLD_PROMPT,
  forgeTypes: FORGE_TYPES_PROMPT,
  forgeAgent: FORGE_AGENT_PROMPT,
  forgeSwarm: FORGE_SWARM_PROMPT,
  forgePhases: FORGE_PHASES_PROMPT,
};
