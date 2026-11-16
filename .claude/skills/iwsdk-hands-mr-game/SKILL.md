---
name: iwsdk-hands-mr-game
description: End-to-end playbook for building a production-grade, hands-only, seated mixed-reality WebXR game or experience with Meta's IWSDK (Quest Browser), from an empty scaffold to a judged submission. Use when starting, rebuilding or polishing any IWSDK/WebXR project that needs a real-table play surface, hand interactions (pinch, poke, throw, gestures), a believable character or NPC, a transformed environment, readable spatial text, free/CC0 or AI-generated assets with no budget, automated verification without a headset, and submission docs. Encodes the lessons of a full build-rebuild-iterate cycle (Chausar, Meta VR Start 2026) so the next project starts at the quality bar instead of climbing to it.
---

# IWSDK hands-first MR: from scaffold to a production-grade submission

This playbook comes from building **Chausar**: a mixed-reality dice game against a realistic AI opponent (Shakuni), played on the player's real table inside a palace that replaces their walls.

The first version was "complete" by every functional test, and the user still called it *dummy, naive, unpolished*. Everything after that was rebuilding, so this skill moves those lessons to the **start**.

Supporting material:
- `references/`: deep dives, loaded when a phase needs them.
- `scripts/`: tools to copy into the project.
- `reference/runtime/`: working TypeScript modules to adapt.

---

## The ten rules that would have saved the most time

1. **Set the visual bar on day one, not after "it works".** Judges and users react to the look first. Plan the art direction, the character approach, the environment, the text system and the lighting *before* gameplay code. A grey-box that "passes tests" gets rejected wholesale.
2. **Never show work you haven't inspected up close.** Add dev-only review cameras (close-up, full body, profile) and pose and effect triggers on day one. Look at every state yourself first. Most of the "it looks broken" reports were visible in a 640 px close-up.
3. **When something looks wrong, bisect the pipeline before patching.**
   - Compare the source render (Blender) against the engine render.
   - Compare rest pose against posed.
   - Compare morphs off against morphs on.
   - Compare compressed against uncompressed.

   One A/B tells you which stage is wrong. Patching symptoms (tuning squint values, alpha cutoffs) cost five rounds on an eye bug that turned out to be "the proxies were exported unskinned".
4. **Ask about constraints that change the pipeline early**: budget (free only?), accounts (Hugging Face, Meshy, Sketchfab), hardware (GPU or not), deadline, who submits. Then design around them. Don't build a paid-API script before asking.
5. **Parallelise with clear ownership.** Use background agents for research and for self-contained subsystems (lighting, ambience, juice). Each gets a list of files it must not touch and delivers an integration doc (`docs/INTEGRATION-*.md`) that you wire in. Never let two agents edit the same file.
6. **Make every pipeline a script in the repo** (`tools/…`): character build, asset generation, cleanup, optimisation, previews. You will re-run it ten times.
7. **Reserve scarce resources for hero assets.** Free GPU quota runs out after about three image-to-3D models a day. Generate in priority order (the hero first) and keep a procedural fallback for everything, so a missing file never breaks the scene.
8. **Give text a layout system, not ad-hoc labels.** Use regions per kind of text, fit-to-card sizing and a choreographed intro. Clipped and overlapping text was the most-reported defect after the character.
9. **Don't edit source while the e2e suite is running** (hot reload kills the run), and **give each project its own dev port**.
10. **Report honestly and briefly.** Say what's done and verified, what's not, and what the user must do, with exact steps and links. When a decision is the user's (spend, accounts, style), ask with 2–4 concrete options and a recommendation.

---

## Phase 0: Orient (≤10 tool calls)
- Read the brief, the shared plan and the scaffold rules in one bounded pass: `AGENTS.md`, `.claude/rules/*`, `iwsdk.config.json`, `src/*.ts`, the scene JSON. If the repo has the `iwsdk-dev` skill, follow its router (a new experience on the scaffold takes the planner path).
- **Check the port** (`ss -ltnp | grep 808`), and give this project its own port in `vite.config.ts` and the README.
- Install Meta's agent skills as reference: `meta-quest/agentic-tools`. Especially `hz-immersive-designer` (comfort, text sizes, layout numbers) and `hz-iwsdk-webxr`.
- **Launch background research now** (a general-purpose agent):
  - the domain rules for a 2–4 minute session;
  - CC0/OFL assets with URLs and licences;
  - tech tricks for the risky mechanic;
  - prior art, for the novelty claim;
  - winners' craft: how last year's winners made things look alive.

  Output goes to `docs/RESEARCH.md` and `docs/VISUAL-RESEARCH.md`.
- **Ask the constraint questions** (rule 4) in one go.

## Phase 1: Design: one loop, one awe moment, one reason to come back
- One verb a stranger gets in 2 seconds, plus at most two more. The secret or advanced verb should use **the real room** (e.g. "hide your hand below the real table edge"). That makes passthrough purposeful, which is judged.
- An opponent or NPC with a **readable state machine** and telegraphs (watching / away / turning back with a 0.75 s warning). Script the first encounter so every player meets each mechanic in the first minute, with one-time contextual hints.
- **Rules sim first**: pure TypeScript, thousands of AI-vs-AI games with `node file.ts`. Gate: the session is 2–4 minutes and balanced.
- Progress that persists (a localStorage ledger, escalating stakes) for "reason to come back".
- Decide the **visual pillars** now (rule 1); see `references/visual-quality.md`:
  - **character**: realistic rigged human, or a deliberately stylised hero;
  - **environment**: the room, or a room transformation such as a palace or court;
  - **table dressing**: the real table becomes a themed table;
  - **lighting**: room IBL plus shadows plus warm practical lights.

## Phase 2: Architecture
One director system plus small pure modules. All game maths in **board-local space**, under one anchor group registered with `createTransformEntity(anchor, {persistent: true})`. Phase enum plus `phaseT`, and a `once(key)` helper reset on phase change; never `if (t < 0.05)`. Typical modules (see `reference/runtime/`):

`rules · dice/physics · hands · board · character (human.ts) · seat · palace · tablecloth · props · ui + text · lighting · ambience · juice · fx · audio · save · director`

Delete the scaffold's demo content in one pass. Import three.js only from `@iwsdk/core`.

## Phase 3: Hands (copy these numbers)
- **Pinch hysteresis:** start below 2.2 cm, release above 4.0 cm.
- **Release velocity:** least-squares over 140–40 ms before now.
- **Tracking loss:** 150 ms grace, then release with the last velocity.
- **Aim assist:** ±5 cm, landing short.
- **Hit tolerances:** poke 2.5 cm, pinch-select 3.5 cm.
- **Hold times:** gestures need ≥0.5 s; a two-hand pinch held 1.5 s re-places.
- **Controllers:** fall back to grip pose plus select.

Reference: `reference/runtime/hands.ts`.

## Phase 4: Outcomes you control (loaded dice, rigged throws)
Use a custom rigid-body sim: 8-corner contacts with impulse, friction and positional correction, rolling resistance on contact, and a settle that slerps onto the chosen face. Honest throws randomise the starting roll. Verify headlessly: 100 % settle, 100 % forced faces, and the share landing in the target zone. See `reference/runtime/dice.ts` and `scripts/test/headless-physics-test.example.ts`.

## Phase 5: Placement and the real table
- **Fallback chain:**
  1. A labelled `table`/`desk` plane within ~70° of the gaze.
  2. Otherwise, the board follows the hand; pinch at table height.
  3. Otherwise, after 6 s, a virtual spot.
- Show a gold-outline preview and confirm with a pinch.
- **Keep the plane's outline** (plane-local bbox → world corners). You need it to dress the table (`reference/runtime/tablecloth.ts`): a velvet cover cut to the outline, a border, a skirt with folds, a fringe, and carved legs on desktop.
- **Never clip virtual bodies at the tabletop.** Give characters a full body and seat, and let `DepthOccludable` (depth sensing `required:false`) hide what is behind the real table.

## Phase 6: Make it production-grade
Full detail is in the references. Order of impact:

1. **Lighting** (`references/visual-quality.md`):
   - `IBLTexture {src:'room'}` at ~0.8;
   - one warm shadow-casting key with a tight shadow camera aimed at the board, updated only on motion;
   - a shadow catcher;
   - one warm flickering point light from practical lamps.
2. **The character** (`references/character-pipeline.md`): realistic and rigged (MakeHuman/MPFB, CC0), dressed by script, animated procedurally (IK arms and legs, look, blinks, expressions, jaw talk, fidgets), seated on a seat sized to the real table. Review every pose in close-up.
3. **Environment transformation** (`references/visual-quality.md`): a FLUX 360° panorama dome centred on the head, fading out below the horizon so the real table, hands and floor stay passthrough. Generated 3D pieces stand in front of it (arch framing the character, pillars, lamps). Reveal with the entrance; dissolve back on the win.
4. **Materials that glint:** cloth gold-thread masks (metal, roughness and bump from the same canvas), lacquer clearcoat, brass. Keep the palette consistent (one style, no yard sale).
5. **Juice:** hop anticipation, squash and stretch, landing dust, reward bursts in waves, a legal-move outline, a room dimmer.
6. **Text** (`references/text-and-ui.md`).
7. **Assets with no budget** (`references/free-assets.md`): Poly Haven API, FLUX → TRELLIS / TRELLIS.2 on Hugging Face, and cleanup (fragments, ground slabs). Each placement needs its own clone. Bad results get rejected, not shipped.

**Budget:** under ~100 draw calls per eye, under ~150k triangles, a character of ~3 MB (WebP textures, **no Draco on skinned meshes**), props ≤1–2 MB each, one shadow map, no post-processing, foveation 0.5, 72 Hz.

## Phase 7: Verify without a headset
See `references/testing.md`:
- dev-only structured logs with page ID and sequence number;
- monotonic waits;
- emulated-hand scenarios via `scripts/test/xr_lib.py`;
- dev keys for rare states;
- review cameras;
- Blender A/B renders;
- PASS/FAIL suites in `npm run test:xr`.

Re-run the full suite after every integration. Never edit during a run.

## Phase 8: Judge yourself, then document
Score the four criteria (innovation, experience design, technical, polish). List what only a headset can prove: fps under the heaviest effects, real-hand feel, tracking at the gesture's extremes, two rooms, depth occlusion, text legibility, TTS, the production URL logged out.

Write:
- **README**: pitch, how to play, rules, run, tests, architecture, decisions, credits;
- **docs/TESTING.md**: results, bugs found, headset checklist, criteria matrix, limits;
- **docs/SUBMISSION.md**: paste-ready text, a ≤3-minute shot list with the hook in 8 s, gallery images, pre-submit checklist;
- **CREDITS** for every asset;
- credits in the app.

## Phase 9: Ship
- Typecheck and build. Grep `dist/` to confirm dev logs and handles are stripped.
- **Deploying creates a public URL, so confirm first** (`vercel --prod`).
- Don't commit unless asked.
- Save a memory note: status, port, pending headset checks, the user's quality bar and constraints.

---

## Gotchas that each cost an iteration
- `npx @iwsdk/cli browser logs` takes `count ≤ 200`. The log buffer survives reloads, so tag lines per page load.
- `xr run-sequence`: every new call must name an `anchor` in its first positioned step.
- three's GLTFLoader sanitises names (`wrist.R` → `wristR`).
- `Object3D.getWorldDirection` is +Z for objects but −Z for cameras. Compute forward as `(0,0,-1)` rotated by the world quaternion.
- `AssetManager.loadGLTF` caches by URL. Use `gltf.scene.clone(true)` per placement.
- `!state.winner` is wrong when seat 0 can win.
- In ESM tests, `pkill -f <pattern>` can kill your own shell.
- `gradio_client` ≥ 2 uses `token=`. Free spaces need connection retries with long timeouts.
- Canvas text wraps by width only. Always fit the height too.
- MPFB/MakeHuman export traps (unskinned proxies, BLEND materials, cornea shell, lost lash alpha, Draco on small skinned meshes) are listed in `references/character-pipeline.md`.

---

## Toolkit (copy into the new project, then adapt the marked parts)

| File | Copy to | What it does | Adapt |
|---|---|---|---|
| `scripts/test/xr_lib.py` | `<repo>/scripts/e2e/` | Emulator driver: monotonic log waits, hands, keys, PASS/FAIL | `XR_LOG_TAG`; your log fields |
| `scripts/test/rules-sim.example.ts` | `<repo>/scripts/` | Thousands of AI games plus regression asserts | your rules module |
| `scripts/test/headless-physics-test.example.ts` | `<repo>/scripts/` | Headless physics checks via esbuild alias | your sim |
| `scripts/character/build_human.example.py` + `costume.example.py` | `<repo>/tools/character/` | MakeHuman/MPFB → rigged, dressed GLB, plus a preview render | macros, face targets, skin, costume, colours |
| `scripts/assets/remotezip.py` + `remotezip_fetch.py` | anywhere | Fetch selected members from huge remote zips via HTTP Range | URL, patterns |
| `scripts/assets/flux_trellis.py` / `flux_trellis2.py` | `<repo>/tools/freegen/` | Free concept → 3D (reads `HF_TOKEN` from `<repo>/.env.local`) | `PROPS` prompts |
| `scripts/assets/flux_panorama.py` | `<repo>/tools/freegen/` | Free 360° environment backdrop | prompt, seeds |
| `scripts/assets/clean_fragments.py`, `remove_ground_slab.py` | `<repo>/tools/freegen/` | Clean generated meshes (size mode / horizontal-distance mode; slab outside the feet) | threshold |
| `scripts/assets/blender_preview.py` | `<repo>/tools/` | Cycles 3/4 preview of any GLB (inspect before placing) | — |
| `reference/runtime/*.ts` | `<repo>/src/game/` | human (IK, look, face), ui + text (regions, fit-to-card), palace (dome), tablecloth (dress the real table), props (normalise, clone), hands, dice, lighting, juice | constants, names, palette |

The originals all ran end to end in Chausar (`meta-vr/chausar`, Nov 2026): 19 emulated-hand XR checks, plus rules and physics sims.
