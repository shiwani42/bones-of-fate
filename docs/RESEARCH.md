# Mahabharat Chausar: research notes

Researched 16 Nov 2026 for the Meta VR Start 2026 build (deadline Thu 19 Nov, 1:30 AM IST). These notes build on `meta-vr-start-2026-kit/research/common-build-plan.md` §8–9. Anything marked ⚠ is unverified, or verified only from a search snippet.

**Corrections to the common plan:**
- **No 3D Kenney board-game kit.** Kenney only has the 2D [Board Game Pack](https://kenney.nl/assets/boardgame-pack) and [Board Game Icons](https://www.kenney.nl/assets/board-game-icons) (both CC0). Build pieces and dice procedurally (§2).
- **`sma1692/DunJun` isn't public** (GitHub returns 404). The Dun Jun authors published their gesture engine as **`@treefour/haath`** (MIT, github.com/sma1692/haath).
- **`byWulf/threejs-dice` (MIT) is dated.** It depends on the old `cannon` engine plus a global `THREE`, and was last pushed in 2022. Port its technique (§3b) rather than the code.
- **IWSDK 1.1.0 Havok sends no contact events** (open issue [#21](https://github.com/facebook/immersive-web-sdk/issues/21)). Settle and impact detection has to poll velocities.

---

## 1. Rules

### 1a. Traditional chaupar / pachisi (one family of games)
| Element | What sources say |
|---|---|
| Board | Cross of 4 arms, each **3 columns × 8 squares**, around a large central square, the **charkoni** ("ghar", home). Usually embroidered cloth. Each arm has **17 squares of travel** (outer column 8 + end square + other outer column 8), so a full outer loop is 4 × 17 = **68** squares, plus the 8-square home column. [Wikipedia Chaupar](https://en.wikipedia.org/wiki/Chaupar), [Pachisi](https://en.wikipedia.org/wiki/Pachisi) |
| Pieces | 4 per player, often beehive-shaped wood, in 4 colours. Usually 2 teams (yellow + black vs red + green). One player can run two colours. |
| Chaupar dice (pasa) | **3 long four-sided dice with values 1, 2, 5, 6.** 1 is opposite 6 and 2 is opposite 5; some sets use 3 and 4 instead of 2 and 5. Another variant uses 2 dice marked 1-3-4-6. Each die's value can be played on a different piece (a 1+2+6 throw moves one piece 9, or three pieces 1, 2 and 6). [Ludii Chaupar](https://ludii.games/details.php?keyword=Chaupar) (from the *Ain-i-Akbari*, 1590, and Murray 1951), [pachisi.vegard2.net](https://pachisi.vegard2.net/chaupar.html) |
| Pachisi dice | 6 cowries. Number of mouths up → move: 0→25\*, 1→10\*, 2→2, 3→3, 4→4, 5→5, 6→6\* (\* = grace throw: extra turn and can enter a piece). Seven-shell variants differ by source. |
| Entry | Pachisi: start in the charkoni and enter only on a grace throw. Chaupar (Ain-i-Akbari via Ludii): pieces **start on the board**, on the 6th/7th squares of the central row and the 7th/8th of the right row of your own arm. |
| Path | Down your own middle column, **anticlockwise** round the outer loop, then back up your middle column to the charkoni. Bearing off needs an **exact** throw. |
| Castles | **12** marked squares: the 4 middle-column ends plus 8 outer squares 4 in from the ends. A piece on a castle can't be captured, and you can't land on an opponent's castle. Sources disagree: vegard2 says "no safe squares". |
| Capture | Landing on a lone enemy piece off a castle sends it back to the start. In many versions the capturer gets an extra turn. Two of your pieces on one square can't be captured, and sometimes move together. |
| Other | Some versions require at least one capture before any piece may go home. Three high throws in a row "burn" the turn. With partners, a player who has finished throws for their partner. |

### 1b. What the Mahabharata (Sabha Parva, Dyuta Parva) actually says: public domain
- **Source:** K. M. Ganguli's translation (1883–96, public domain), on Wikisource: [Sabha Parva §LX](https://en.wikisource.org/wiki/The_Mahabharata/Book_2:_Sabha_Parva/Section_LX), [§LXIV](https://en.wikisource.org/wiki/The_Mahabharata/Book_2:_Sabha_Parva/Section_LXIV), [§LXV](https://en.wikisource.org/wiki/The_Mahabharata/Book_2:_Sabha_Parva/Section_LXV). Wikisource files these under the heading "Sisupala-Badha Parva", but they are the dice-game sections.
- **What the text says about Sakuni's play:** he plays "adopting unfair means" or "foul means". Yudhishthira objects: *"Thou hast won this stake of me by unfair means."* After every throw Sakuni repeats ***"Lo, I have won!"***, which is a perfect voice line for the AI (public domain, safe to quote).
- **The stakes escalate in order:** jars of gold → a royal chariot with eight white steeds → 100,000 serving-girls → servants → 1,000 elephants → chariots and horses → 60,000 warriors → wealth and kingdom → **Nakula, Sahadeva, Arjuna, Bhima** → **himself** → **Draupadi**. In §LXV Vidura argues she was staked "after he had lost himself". The second game (Anudyuta) stakes 12 years of exile plus 1 incognito ⚠ (well known, but I didn't open that section).
- ⚠ **Not in Ganguli:** the idea that the dice were made from the bones of Sakuni's father and obeyed him comes from later folk retellings. Present it as "legend says".
- **The epic's dice weren't a chausar board.** The Vedic/epic *akṣadyūta* was played with akṣa (nuts or beans) thrown onto a mat, with throws named krta, treta, dvapara and kali ([Ludii Aksadyuta](https://ludii.games/details.php?keyword=Aksadyuta)). Chausar with pasa is the later popular image, mainly from the 1988 TV series. Frame the game as **"inspired by"**.
- **Sensitivity:** don't depict Draupadi's humiliation. Keep the stakes abstract (gold → kingdom → brothers, shown as banners). Use original stylised art and no deity likenesses.

### 1c. Proposed ruleset: "Dyuta-5" (player vs AI Shakuni, about 4–6 minutes)
**Time budget:**
- Player turn about 12 s: throw 5 s, settle ≤2.5 s, choose and move 4 s.
- AI turn about 7 s, so a round takes about 20 s.
- **10 rounds is about 3.5 minutes,** plus a 30 s intro and a 45 s finale.
- A sum of 3 pasa averages 10.5 (range 3–18).

| Rule | Dyuta-5 |
|---|---|
| Seats | You sit South (Pandava, 2 pieces). Shakuni sits North (Kaurava, 2 pieces). E and W arms are drawn but empty. |
| Board | The full authentic cross (3×8 arms, charkoni, 12 castles) is **drawn** for looks. Only the **outer loop** is played. |
| Start | Both pieces start **on the board**, on your own arm's start castle (as in chaupar, no grace-throw entry). |
| Route | Anticlockwise along the outer loop for **51 squares (3 arms)**, then into the charkoni. With opposite seats, 34 of those 51 squares are shared, so captures happen. |
| Throw | Throw all 3 pasa together. **Move ONE piece by the total** (no splitting). |
| Bonus | **Triples** (1-1-1, 2-2-2, 5-5-5, 6-6-6) and **any capture** give one extra throw, capped at one bonus per turn. |
| Capture | Land exactly on a lone enemy piece that isn't on a castle → it goes back to its start. Your two pieces on one square make a **jod** (pair) and can't be captured. |
| Castles | Safe squares. You can't end your move on a castle the enemy holds; if that's the only move, you pass. |
| Home | Reaching or passing square 51 enters the charkoni. **No exact throw needed.** |
| Win | First to get **both pieces home**, or after **round 10** (the gong) the higher total progress wins. The cap keeps the demo length fixed. |
| Cheat (you) | Before the throw, a secret **load gesture** fixes one die (or two at a higher karma cost). A suspicion meter rises with anomalies. If Shakuni calls "Cheat!" correctly, your moved piece goes back to start and your side of the board cracks. If he calls it wrongly, he loses his next turn. |
| Cheat (Shakuni) | He loads about 1 in 4 throws, with a subtle tell: a last-moment unnatural roll and a faint glow. If you call him out correctly (an open-palm "stop" gesture), divine light reveals the true roll and **his side cracks**. That is the awe moment. |

**What to cut from the classic game:**
- 4 pieces → 2.
- Partners/teams, and the cowries.
- Grace-throw entry and the "capture before home" rule.
- The home column (−8 squares) and the exact-throw bear-off.
- One arm of the loop (68 → 51).
- Splitting dice across pieces, three-high-throw burning, and multi-piece block movement.
- Keep: castles, captures, jod, triples bonus, the 1/2/5/6 pasa.

---

## 2. Assets (CC0 unless noted; open each page before downloading)

### 2a. Board, dice and pieces
- **Recommendation:** procedural geometry, which carries no licence risk.
  - Board: a `BoxGeometry` slab, with the grid and castles drawn on a 2048² **CanvasTexture**, multiplied over a velvet or jacquard texture.
  - Pasa: a `BoxGeometry` of about 10×2×2 cm (sized for hands), with pips on a 4-tile canvas atlas.
  - Pieces: `LatheGeometry` beehive shapes (the real pachisi shape).

| Asset | URL | Licence / credit |
|---|---|---|
| Velvet cloth (board) | polyhaven.com/a/velour_velvet → `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/velour_velvet/velour_velvet_diff_1k.jpg` (swap `_diff_` for `_nor_gl_` / `_rough_`) | CC0 (Poly Haven) |
| Embroidered cloth | polyhaven.com/a/floral_jacquard, polyhaven.com/a/quatrefoil_jacquard_fabric | CC0 |
| Wood (frame, dice) | polyhaven.com/a/rosewood_veneer1, /teak_veneer, /lacquered_cherry_wood | CC0 |
| Alt. fabric and wood | `https://ambientcg.com/get?file=Fabric061_1K-JPG.zip` (redirect verified), Wood049, Carpet016 ⚠ (look not previewed) | CC0 (ambientCG) |
| Brass diya lantern | polyhaven.com/a/brass_diya_lantern, 12.7k tris, glTF 1k ≈2 MB: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/brass_diya_lantern/brass_diya_lantern_1k.gltf` | CC0, by Bhargav Kubal |
| Brass goblets / vase | polyhaven.com/a/brass_goblets (9.6k tris, ≈4.8 MB), /brass_vase_01 (21k tris) | CC0 |
| Fallback pawn | poly.pizza/m/79A3nqzZf56 "Pawn" (Poly by Google) | CC-BY 3.0 ⚠: "Pawn by Poly by Google, CC-BY via Poly Pizza" |
| UI icons (dice, tokens) | kenney.nl/assets/board-game-icons (2D) | CC0 |

### 2b. Ornament and reference art (public domain / CC0)
| Asset | URL | Licence / credit |
|---|---|---|
| Shiva & Parvati playing chaupar, 1694–95 | commons.wikimedia.org/wiki/File:Shiva_parvati_chaupar_1694–95.jpg (2000×1305) | Public domain |
| Couple Playing Chaupar on a Terrace (Kangra, late 18th c.) | commons.wikimedia.org/wiki/File:India,_Pahari,_Kangra_school,_late_18th_Century_-_Couple_Playing_Chaupar_on_a_Terrace_-_1936.683_-_Cleveland_Museum_of_Art.tif | CC0 (Cleveland Museum of Art). Good board-layout reference. |
| Owen Jones, *Grammar of Ornament* (1856), Indian plates LIII/LIV | commons.wikimedia.org/wiki/File:The_Grammar_of_Ornament-_Plate_LIV_-_Owen_Jones,… | The 1856 work is PD, but **this photo is tagged CC BY 2.0**: credit the uploader, or use the PD scan PDF `File:The grammar of ornament (IA gri c00033125008700094).pdf` |

### 2c. Sound effects and music
**Freesound:** I searched with the CC0 licence filter. Re-check the licence box on each page before downloading ⚠.

| Need | Picks |
|---|---|
| Dice roll on wood | freesound.org/s/558204 ("Dice Roll On Wood", jakubp.jp); /s/342202 ("Dice Rolling Sound - WOOD SURFACE"); /s/485950 (aunrea) |
| Wood tap / clack | **Kenney Impact Sounds**, 130 files, CC0: kenney.nl/assets/impact-sounds (`impactWood_*`, `impactPlank_*` ⚠ names from memory). **Kenney Casino Audio**, 50 files tagged dice/chip, CC0: kenney.nl/assets/casino-audio |
| Gong | /s/803159 "Temple Gong 2" (kerozenne); /s/853654 (glenm8) |
| Crowd gasp | /s/763875 (ShangusBurger, 3 s); /s/264376 (HowardV) |
| Crack / rumble | /s/222521 "Cracking Earthquake (cracking soil, cracking stone)" (uagadugu) |
| Tabla loop | /s/242591 "tabla_loop_4bars_90bpm"; /s/151176 "Tabla Rhythm Bayan Tala Kherwa"; /s/429539 "Indian Percussion Loop 121 bpm" |
| Sitar | /s/87435, /s/87436 (zgump); /s/339970 (Toni_Quiroga); /s/11200 "impro indian echo" (40 s) |
| Shehnai | No CC0 shehnai found ⚠. Pixabay music (pixabay.com/music/search/shehnai/) is under the **Pixabay Content License**, not CC0: commercial use is OK without attribution, but you can't redistribute it standalone. |

### 2d. Fonts (all from `google/fonts/ofl/`, so OFL-1.1, Latin + Devanagari)
| Font | Use |
|---|---|
| **Yatra One** (Display, C. L. Schmidt) | Title / "CHEAT!" callouts. Most "Indian-feeling" Latin. |
| **Rozha One** (high-contrast serif, ITF) | Headings and stake banners |
| **Amita** (calligraphic) | Shakuni's taunts |
| Eczar, Kurale, Laila, Tiro Devanagari Sanskrit | Body text, verses |

- ⚠ **Samarkan:** FontSpace lists it as **shareware**, and commercial use needs a licence from Titivillus. **Don't use it.**
- Devanagari needs the Canvas2D path, because uikit doesn't do Indic shaping.

---

## 3. Tech tricks

### 3a. Throwing dice with tracked hands
- **What Meta did** ([First Steps hand tracking](https://developers.meta.com/vr/blog/adding-hand-tracking-to-first-steps/)):
  - Keep a **1 s buffer** of hand transforms.
  - If tracking was continuous for the last 80 ms, use the velocity from **40 ms ago (about 3 frames)**, which skips the release-frame noise.
  - Otherwise take a velocity above **0.5 m/s** that points within 180° of head-forward.
  - If tracking was lost, aim 60% along the tracking-loss→hand vector plus 40% along head-forward, with magnitude × **0.4**.
  - Drop only after **75 ms** of no grip. Use **different grab and release thresholds** (hysteresis).
- **Meta Interaction SDK** uses a [`RANSACVelocity`](https://developers.meta.com/horizon/reference/interaction/v72/class_oculus_interaction_throw_r_a_n_s_a_c_velocity) estimator (8–10 samples, ignores the 2 newest).
- **Rescuties** ([Game Developer](https://gamedeveloper.com/design/why-throwing-in-vr-sucks--and-how-to-make-it-better)): a **linear regression over the last ~4 frames** beats a moving average, which blends in the wind-up, and beats the peak, whose direction is noisy.
- **Recipe for this game:**
  - Every XR frame, push the `wrist` (or the middle-metacarpal) position and time into a 24-slot ring buffer.
  - On release, least-squares fit position against time over the samples from 120 ms to 40 ms before release.
  - Clamp the speed to 0.3–2.5 m/s and blend the direction 30–50% toward the board centre (aim assist).
  - Add a random spin around the die's long axis.
  - Add invisible rim walls so dice never leave the board.

  ```ts
  // slope of x(t) via least squares over samples i..j (no allocation)
  let st=0,sx=0,stt=0,stx=0,n=0; for(...){const t=T[k]-T[j]; st+=t; sx+=X[k]; stt+=t*t; stx+=t*X[k]; n++}
  const vx=(n*stx-st*sx)/(n*stt-st*st); // repeat for y,z
  ```
- **Throw design:** a **low underhand roll onto the cloth**, which is how pasa are really thrown. Hands moving away from the user track better than motion across the view, and it stays inside the camera FOV.
- **Pick up all 3 dice as one bundle** (one grab target), shake (rattle volume ∝ hand speed), then release on **palm-open**. That avoids three tiny grabs.
- **Quest pitfalls:**
  - `getJointPose` returns null when a joint isn't tracked. Keep the last good pose.
  - **Quest Browser forces hand scale 1.0** as a fingerprinting mitigation, so in passthrough the rendered hands don't match the real ones ([#14](https://github.com/facebook/immersive-web-sdk/issues/14)). Hide the hand mesh or show only fingertip glows, and use **oversized colliders**.
  - Keep hands ≥10 cm from the headset.

### 3b. Forcing a die outcome that still looks physical
1. **Pre-simulate and relabel (recommended; the byWulf/Teall technique):**
   - At release you know the position, velocity and spin. Run a **cannon-es** (0.20.0, MIT) world with 3 boxes plus a floor and walls on the main thread, at 120 Hz for ≤4 s (⚠ an estimated few ms on Quest), and record the trajectory.
   - Read which long face ends up on top, then **rotate the die's label atlas by k×90° about its long axis** so the wanted value lands on that face.
   - **Play back** the recorded trajectory (a plain transform, or a Havok `KINEMATIC` body so pieces still get bumped).
   - Use this path for **every** throw, fair or loaded, so loaded throws leave no tell.
   - The sim also gives **contact times**, so you can schedule clack SFX exactly; Havok won't give you those.
   - Ready-made references:
     - `byWulf/threejs-dice` (MIT; old `cannon`, global THREE, 2022).
     - `BreadMoirai/threejs-dice` (MIT, cannon-es fork).
     - `@3d-dice/dice-box-threejs` 0.0.12 (MIT; three ^0.143 + cannon-es; `roll("3d6@6,6,6")`).
   - Copy the idea in about 80 lines rather than pull in a library that brings its own `three`.
2. **Live Havok with a nudge:**
   - Let IWSDK Havok run. When linear speed drops below 0.15 m/s, apply `PhysicsManipulation.angularVelocity` around the long axis to tip the die onto the wanted face.
   - **This produces a visible wobble.** Use it on purpose as **Shakuni's tell**.
3. **Relabel after settling** (swap labels when the die stops) is cheapest, but it's visible. Use it only as a fallback.

**Reading the top face:**
- For each die, transform its local ±Y and ±Z axes to world space and take the one with the largest `dot(up)`. That gives the face value from your atlas map.
- Give the ends a slight chamfer, or make the dice ConvexHull shapes, so a die can't stand on end.

### 3c. Hand pose and gesture detection
| Library | Licence / status | Notes |
|---|---|---|
| **handy-work** (AdaRoseCannon) | MIT. npm `handy-work@3.1.13` (Dec 2025) | Framework-agnostic. Uses a Web Worker, plus `loadPose(name,url)` and `update(inputSources, refSpace, frame, cb)`. Works with plain three.js; the CDN needs the `standalone` build. Matching against pose-file templates is sensitive to hand size and angle. |
| **@treefour/haath** (by the Dun Jun authors) | MIT, `0.0.2` (Oct 2026), 0 stars, API docs still TODO | Zero-dependency. O(1) curl via the **collinearity of finger bones** (dot > 0.6). Thumb ratio uses palm width as the ruler, so it works for any hand size. Pinch/point mutual exclusion; velocity-gated punch/slap; Schmitt-trigger hysteresis. **Read its `src/` and copy the maths.** Depending on a 0.0.x package is risky. |
| handy.js (stewdio) | MIT, last pushed 2021 | Old; reference only. |
| IWSDK built-in | `@iwsdk/xr-input` hand visual adapter | `pinchStrength` 0..1, pinch threshold 8 mm, open at 50 mm, 0.2 s cooldown. Joints via `fillPoses`. |

**Cheat gestures:** each one must be distinct from pinch, grab and poke, and must be held ≥0.6 s with hysteresis.
1. **"Blow on the dice":** bring the closed fist to 15–25 cm from the head. The gambler's ritual is easy to detect and reads clearly.
2. **"Prithvi mudra":** thumb tip to ring tip while the other fingers stay extended.
3. **"Palming":** the fist with the dice turns palm-down for more than 0.8 s.

Shakuni's suspicion rises with:
- hold time;
- the hand leaving the FOV while it holds the dice ("under the table");
- gesture near-misses.

Make Shakuni's eyes `lookAt` your dice hand so "he's watching" reads instantly.

### 3d. IWSDK 1.1.0 specifics (checked in `node_modules/@iwsdk/core/dist` plus the repo)
- **Enable physics** in `iwsdk.config.json` (the scaffold currently has `"physics": false`). Use `"physics": true`, or `{ "useWorker": true, "updateFrequency": 60, "interpolation": true }`. The default rate is 60 Hz, the max 240; consider 90.
- **Components:**
  - `PhysicsBody{state: STATIC|DYNAMIC|KINEMATIC, linearDamping, angularDamping, gravityFactor}`. It exposes `_linearVelocity` / `_angularVelocity` read back from Havok; use them for settle detection.
  - `PhysicsShape{shape: Sphere|Box|Cylinder|Capsules|ConvexHull|TriMesh|Auto, dimensions, density=1, restitution=0, friction=0.5}`.
  - `PhysicsManipulation{force, linearVelocity, angularVelocity}`: one-shot, removed after it's applied.
  - `PhysicsSystem.setBodyTransform(entity, pose, {resetVelocity})` teleports a body.
- **Grabbed dynamic bodies:** the physics system sends `SetTargetTransform` each step from the hand-driven `object3D`, so the body keeps Havok's last velocity on release. **Override it** with your ring-buffer velocity through `PhysicsManipulation` on release.
- **No contact or collision events.** [#21](https://github.com/facebook/immersive-web-sdk/issues/21) is open; the maintainers say it's on the 2026 roadmap. The Havok worker returns only pose and velocity.
- **Grab components:**
  - `OneHandGrabbable` (near pinch: `grabbing.useHandPinchForGrab` defaults to on), `TwoHandsGrabbable`, and `DistanceGrabbable` (needs `RayInteractable`; `returnToOrigin`).
  - `GrabSystem.forceRelease(entity)`.
  - [#10](https://github.com/facebook/immersive-web-sdk/issues/10) "OneHandGrabbable not working with hand tracking" is still OPEN; a maintainer says it's fixed in newer versions ⚠. **Test on the device on day 1.**
- **Scene understanding:**
  - `XRMesh{semanticLabel, isBounded3D, min, max, dimensions}`: find `semanticLabel === 'table'` and put the board at `max.y`.
  - `XRPlane` only wraps the raw WebXR plane (`_plane.orientation`, and `semanticLabel` on Quest ⚠).
  - Add `XRAnchor` to the board root.
  - **Fallback:** if Space Setup has no table, pinch to place, or default to 0.75 m in front.
- **Repo examples:** github.com/facebook/immersive-web-sdk/tree/main/examples covers `physics`, `grab`, `scene-understanding`, `gaze-pinch`, `poke`, `depth-occlusion`, `audio`, and more. The local project skills `iwsdk-physics` and `iwsdk-grab` contain ECS pause/step/diff and `xr run-sequence` pinch-test recipes.
- **One three.js instance:** `@iwsdk/core` imports `'three'`, which the package overrides alias to `super-three@0.185.0`, and `vite.config.ts` dedupes `three`. So libraries that import `'three'` (three-pinata, three.quarks) share the same instance. Still check for a "multiple instances" console warning.

### 3e. Crack / fracture effect without post-processing (fastest first)
1. **Shader crack reveal (1–2 h):** `onBeforeCompile` on the board material. Use the edges of a Voronoi/cellular function as cracks, masked by `distance(uv, impactUV) < uProgress`, and push emissive gold-white along the edges. No assets, no extra draw calls.
2. **Runtime Voronoi fracture:** **`@dgreenheck/three-pinata` 2.0.1** (MIT per its README and npm; there's no LICENSE file at the repo root ⚠; peer `three>=0.158`).
   - Use `DestructibleMesh` with separate inner and outer materials. Pre-fracture the player's or Shakuni's half-slab (12–20 pieces) **during the intro** to avoid a hitch.
   - Animate the pieces with a simple velocity + gravity system. They don't need Havok bodies.
3. **Divine light:** an additive cone mesh with a Fresnel shader, plus **three.quarks** 0.17.1 (MIT) or a simple `Points` system for dust and sparks.
4. Pre-fractured glTF (Blender Cell Fracture through Blender MCP) is the most pipeline work. Skip it unless 1 and 2 fail.

---

## 4. Unfair advantages
- **meta-quest/agentic-tools** (Apache-2.0):
  - Install in Claude Code with `/plugin marketplace add meta-quest/agentic-tools` then `/plugin install meta-vr@meta-vr`, or run `metavr init` / `metavr mcp install claude-code`. `@meta-quest/metavr` is already in devDependencies.
  - The skills that matter here: `hz-iwsdk-webxr`, `hz-immersive-designer` (comfort, accessibility), `hz-store-pwa`, `hz-perfetto-debug`, `hz-vr-debug`, `hz-quest-verify-first`, `metavr-cli`.
  - The MCP server has 40+ tools: device and app control, doc search, screenshots, performance traces.
- **Blender MCP** (ahujasid/blender-mcp, MIT, about 34.6k stars):
  - Install with `uvx mcp-for-blender setup`, or `claude mcp add blender uvx mcp-for-blender`, plus the add-on (`uvx mcp-for-blender install-addon`).
  - It can pull from Poly Haven, Sketchfab and Poly Pizza, and generate with Meshy, Tripo, Rodin or Hunyuan3D.
- **Meshy MCP** (meshy-dev/meshy-mcp-server, MIT):
  - Install with `claude mcp add-json meshy '{"command":"npx","args":["-y","@meshy-ai/meshy-mcp-server"],"env":{"MESHY_API_KEY":"…"}}'`.
  - The free tier's output is CC BY 4.0, so credit Meshy. Useful for a stylised Shakuni bust.
- **Code to crib:**
  - Codrops, ["Crafting a Dice Roller with Three.js and Cannon-es"](https://tympanus.net/codrops/2023/01/25/crafting-a-dice-roller-with-three-js-and-cannon-es/): sleep event → read the top face.
  - three.js forum, ["Dice + Scoreboard"](https://discourse.threejs.org/t/dice-scoreboard/88316): face normal dot up.
  - three.js forum, ["Identical cannon worlds… different results"](https://discourse.threejs.org/t/identical-cannon-worlds-with-equal-angular-velocity-bodies-yielding-different-collision-results/68889): use a fixed timestep, otherwise you lose determinism.
  - `ljiang9/pachisi` (MIT, Python): a 68-track cross board, castles and a greedy AI; good for track indexing and Shakuni's heuristic.
- **Lessons from the 2025 winners** ([winners blog](https://developers.meta.com/vr/blog/meta-horizon-start-developer-competition-meet-the-winners/)):
  - None of the 32 winners was a board or dice game, so the lane is open.
  - The IWSDK award went to The Nanauts and Dun Jun. The hand-interaction awards went to Hand Survivor, Pocket Lands and Awesome Hand.
  - Meta published no judge commentary. The implied pattern ⚠: a hands-first core verb, one clear wow moment, and a polished short loop.
- **Pitch hooks:**
  - "Cheating only works because the headset sees your hands."
  - Captions on everything, a one-handed mode, and a slow-tempo option (accessibility is rare in entries).

---

## 5. Prior art
| Project | Platform | How it differs from ours |
|---|---|---|
| VR Ludo Quest (Broken Engineers) | Quest Store, $4.99 | Fully virtual (not MR), **controller** dice, single player vs AI, modern Ludo |
| Mastery VR board-game collection | Quest, has an MR mode | Chess/Ludo/Chinese chess; generic, controller-based |
| All On Board! | Quest 3 MR | A generic tabletop platform that puts a board on your table; no Indian games, no cheating |
| Chess Club MR, MR Chess | Quest | Chess only |
| Joppa | **Apple Vision Pro** | MR Ludo; not on Quest, not WebXR |
| "Mahabharata The Game" (skich.app) | Mobile | Has the Shakuni dice story; **not XR** |
| Ludii Chaupar / Pachisi / Aksadyuta | Desktop research software | Rules engines; no XR |
| GitHub pachisi repos (ljiang9, bsingr, …) | 2D / CLI | No XR. No chaupar/chausar WebXR repo exists. |
| [Dhayam VR](https://fau.isle.flvc.org/node/70332) (M. Ramachendran Selvaraj, FAU M.F.A. thesis, 2020) | VR research project | The closest academic precedent: Dhayam, a Tamil roll-and-move board game, adapted to VR and inspired by the Mahabharata, as an educative experience. Fully virtual; no mixed reality, no hand-tracked throws, no cheating mechanic. |

**Verdict:** I found no chausar, pachisi or "game of dice" project in VR, AR or WebXR (GitHub, web, store searches). Ours is the only one with all of:
- hands-only physical pasa throws;
- **cheating as a gesture mechanic**;
- an AI that **watches your hands**;
- passthrough on your real table;
- story grounded in a public-domain text.

---

## 6. Concept review (18 Nov): "The Game of Destiny"
A concept note proposed five scenes. The central question it asks fits Chausar exactly: **what happens when you enter a game whose outcome has already been decided, but you don't know it?** Chausar is its direction B (play Shakuni's dice yourself, discover the rigging, expose it). What came of each scene:

| Scene in the note | In Chausar |
|---|---|
| 1. Enter the royal court (Pandavas, Duryodhana, Shakuni) | The hall dome, pillars, arch and lamps rise around your real table; Shakuni sits opposite. The other characters are **not** built: realistic humans at Shakuni's quality would take days each and would turn the table-top MR game into a full-VR scene. |
| 2. Pick up and roll the dice | The core verb: a real pinch, shake and throw. |
| 3. The mystery of Shakuni's dice | **Two tells:** his hand dips below the table before a loaded throw, and he **names the total while the dice are still in the air** (on three loaded throws in four, and always on his scripted first cheat; honest totals he names only after they land, if at all). **Inspection:** the first time you catch him (per visit), his dice rise in front of you, grow and turn in violet light while the legend is told as legend ("the old tellings say…"); touch one and it spins and rings. |
| 4. Consequences: the court changes as you lose | **Your stake in gold on the table:** eight stacks of mohurs on the right-hand margin, half each. A capture sweeps a stack to the captor, getting caught costs you one, catching him wins one, and the winner takes all that's left. Between sessions the stakes still climb (gold → kingdom). |
| 5. The moral dilemma | **A closing reflection** chosen by how you played: beat a cheat by cheating ("who was the fairer player?"), won honestly ("some would call that dharma"), or let his cheats pass ("Vidura warned them, and the elders kept silent"). |

Accuracy notes kept in the lines: the bones legend is framed as legend (1b); Vidura did object in the Sabha Parva (Ganguli §LXV onward), and Draupadi's humiliation is still not depicted.

## Top 10 actionable takeaways
1. **Ship Dyuta-5:** 2 pieces each, a 51-square anticlockwise route on the outer loop, a sum of 3 pasa (1/2/5/6) moving one piece, castles, captures, jod, a triples bonus, and a 10-round gong cap (fixed demo length).
2. **Use pre-simulate and relabel for every throw:** cannon-es sim → rotate the label atlas → play back as kinematic. Fair and loaded throws use the same path, and the SFX come with contact timing. Keep the Havok "nudge" wobble as Shakuni's visible tell.
3. **Throw velocity:** a ring buffer plus least-squares fit over the samples from 120 ms to 40 ms before release, a speed clamp, 30–50% aim assist, rim walls, and a palm-open release with hysteresis. Override Havok's release velocity with `PhysicsManipulation`.
4. **Grab the 3 dice as one bundle.** Test `OneHandGrabbable` with hands on the device on day 1 (#10). Fall back to a custom pinch-follow.
5. **Hide or minimise hand meshes in AR** (forced hand scale 1.0, #14). Make piece colliders about 2× the visible size and auto-hop the piece after a pinch.
6. **Settle detection polls `_linearVelocity` / `_angularVelocity`.** There are no Havok contact events in 1.1.0.
7. **Find the table with `XRMesh.semanticLabel === 'table'`** and put the board at `max.y`, plus an `XRAnchor`. Fall back to pinch-to-place.
8. **Awe moment:** the shader crack reveal first, then three-pinata fragments pre-fractured during the intro, then an additive light cone plus dust. No post-processing.
9. **Assets:**
   - Poly Haven velour_velvet / floral_jacquard / rosewood_veneer1 and the brass_diya_lantern (all CC0).
   - Freesound CC0 dice (558204), gong (803159), gasp (763875), crack (222521), tabla loop (242591).
   - Kenney Impact Sounds.
   - Yatra One and Rozha One (OFL). **Avoid Samarkan.**
10. **Cultural and legal:**
    - Quote Ganguli ("Lo, I have won!"). Treat the "bone dice" as legend.
    - Don't depict Draupadi's humiliation.
    - Ship a credits panel. Note that the *Grammar of Ornament* photos on Commons are CC BY 2.0, and that Pixabay ≠ CC0.
