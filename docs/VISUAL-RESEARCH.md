# Visual research: how 2025 winners made it look "alive"

Researched 16 Nov 2026. Goal: make Chausar look production-grade, with a less "dummy" Shakuni and a less boring board.
Builds on `meta-vr-start-2026-kit/research/past-winners-2025-analysis.md` and does not repeat it.

## TL;DR
- **No 2025 winner used a realistic human.** The two winners with characters chose a stylised style on purpose. Monobonobo (Language IRL): *"a joyful, expressive companion far from the uncanny valley"*, modelled, rigged and animated in Blender. The Nanauts used cute robots with **2D canvas-drawn emotive faces** and **only procedural animation**. Shakuni needs **expression and motion more than polygons**.
- **The IWSDK winner HandCraft XR (Judges' Choice)** looks finished because of three things: **real shadows on the table** (an adaptive, on-demand shadow map), **stencil outlines** on held items, and an **ambient life layer** (snow falling, clouds drifting, warm lights).
- **Our scene is lit like a sample.** `public/scenes/main.iwsdk.scene.json` uses IBLGradient at intensity **0.25**, `shadows: false` and `castShadow: false`. As a result every brass, gold or bronze part (metalness 0.9–0.95) reflects almost nothing and looks flat brown, and the board floats on the real table with no contact shadow. This is the cheapest and biggest fix.
- IWSDK 1.1.0 already ships what we need: `IBLTexture {src:'room'}`, `ShadowCatcher`, `ContactShadow` and light shadow params (see `node_modules/@iwsdk/core/dist/environment/ground-shadows.d.ts`). Our own `src/AGENTS.md` says to use these components rather than hand-made shadow planes.
- Meta's MR design guideline says: *"Use shadows for more realistic object placement"* and *"compress movement, highlight on press, with audio"*. The Devpost tip for 2026 says: *"Give your assets a consistent style."*

## Sources checked first-hand
| Source | What I got |
|---|---|
| Devpost pages (curl): HandCraft XR, The Nanauts, Dun Jun, Language IRL, Tiny Golf, Pocket Lands, Le Dino Labo, ModStorm | The writeups quoted below |
| **HandCraft XR live bundle** `handcraft-xr.netlify.app/assets/index-*.js` (minified, no licence, read only) | The exact shadow and light setup |
| **The Nanauts live bundle** `jameskane05.github.io/nanauts/assets/main-*.js` (minified, no licence, read only) | Animator constants, the face system, the env-map loader, the viseme player |
| `meta-quest/ProjectFlowerbed` (MIT code; art and audio are CC BY 4.0), now rebuilt on IWSDK, shallow clone | Particles, tweens, materials and a spring we can copy |
| `meta-quest/webxr-showcases` (MIT), `chairs-etc` | Meta's own MR furniture demo: RoomEnvironment plus ShadowMaterial floor |
| Interview with J. C. Kane (Nanauts) on xraispotlight.substack | Notes on polish and audio |
| Not available | The `jameskane05/nanauts` repo now returns 404. HandCraft's app source is not public; only its IWSDK fork `evstinik/immersive-web-sdk` is (it enables the stencil buffer and changes pinch handling). Dun Jun's repo is private. Meta published **no per-winner judge comments**. |

Clones are in the scratchpad at `.../scratchpad/samples/`, and nothing in them was run.

## 1. Characters: what winners did

| Winner | Character | Tooling | How it was made "alive" |
|---|---|---|---|
| **The Nanauts** (IWSDK winner) | Three small robots and a narrator | Procedural only, plus Web Audio | Squash and stretch, **"leading with the eyes"**, follow-through and idle fidgets. A **canvas-texture face** with 9 emotions. Procedural Web Audio "voices" that carry emotion. An **anime-style viseme UV-scroll** mouth for recorded narration. Env maps taken from the passthrough camera. |
| **Language IRL** (PCA+AI) | Monobonobo, a monkey robot mentor | Blender model, rig and animation (Unity) | Stylised, "joyful, expressive, far from the uncanny valley", and reacts to the player's speech |
| Tarot / Into the Mind / Saber Punks | Set dressing, cinematic cast, 12 fighters | Unity/Unreal art teams | Not relevant to a 2-day web build |
| Ready Player Me | — | **Shut down on 31 Jan 2026** after Netflix bought it ([Wikipedia](https://en.wikipedia.org/wiki/Ready_Player_Me)) | Do not plan around it |

**The Nanauts animator constants, from its bundle (class `GY` plus the face manager).** Use these as tuning starting points:
- Squash and stretch: `maxSquash .2, maxStretch .12, landingRecovery .18s, bounceOvershoot .1`.
- Anticipation: `startMoveDuration .12s, startMoveSquash -.15, turnWindupDuration .1s, turnWindupAmount .06`.
- Follow-through: `stopOvershoot .04, stopSettleDuration .25, turnOvershoot 1.15`. The settle is a spring (k=120, damping 0.82/frame).
- Idle: `fidgetInterval 1.5–4s, fidgetDuration .4s, maxTilt .03, maxBank .04 rad`.
- Head and face: yaw is clamped to ±45° and pitch to −20°/+25°. `turnLeadMultiplier .7`, `maxTurnLead 35°` (the face turns *before* the body). `overshootAmount 1.12, overshootSpring 150`. Velocity-driven pitch up to 12°. When idle, the head picks random look targets.
- Face: one 256 px canvas holding pixel-art eye and mouth sprites per emotion (CONTENT, EXCITED, SAD, ANGRY, CURIOUS, ACKNOWLEDGE, AWE, FEAR, THINKING). The canvas is used as both `map` and `emissiveMap`, so it reads in passthrough. It is redrawn only when the emotion signature changes.
- Viseme: a 4×4 sprite-sheet atlas on a plane. `updateFrame` sets `uUvOffset/uUvRepeat` on each phoneme frame. The shader adds a holo tint and scanlines.

**Character options for Shakuni** (ranked for a deadline of Thu 01:30 IST, with Linux first):
| Option | Effort | Quest cost | Licence | Verdict |
|---|---|---|---|---|
| **A. Keep the primitive bust and add a canvas face, procedural layers and a voice** (the Nanauts approach) | 3–5 h | ~0 | ours | **Do this.** It follows the proven IWSDK winner pattern, adds no new pipeline and suits the "spirit" fiction. |
| B. VRM through `@pixiv/three-vrm` 3.5.5 (MIT, peer `three>=0.137`). Blink, lookAt and the `aa/ih/ou/ee/oh` expressions come built in. | 6–10 h | ~10–30k tris, MToon | Each model has its own terms | VRoid Studio runs only on Windows or macOS, and a turbaned Indian elder in VRoid takes real work. Treat it as a post-deadline upgrade. |
| C. AI-generated mesh (Meshy text-to-3D, auto-rig, animation presets) | 3–6 h | Needs decimating | **Free tier is CC BY 4.0; credit "Model created with Meshy"** ([Meshy help](https://help.meshy.ai/en/articles/9992001-can-i-use-my-generated-assets-for-commercial-projects)) | No face blendshapes, so no blink or lip-sync, and faces often land in the uncanny valley. Free downloads are capped. Fine for **props** (a throne, a dice box), risky for the face. |
| D. Mixamo or Quaternius (CC0) humanoid plus animations | 4–8 h | OK | Mixamo is free to use but not to redistribute raw; Quaternius is CC0 | Generic Western look that clashes with the style. Skip. |

Lip-sync without audio files: `speechSynthesis` exposes no audio stream. Drive mouth flaps from `SpeechSynthesisUtterance` `boundary` events, or from a timer per syllable of the caption text. With recorded mp3s, `wawa-lipsync` (MIT, 0.0.2, an early release) maps WebAudio to visemes. Before relying on TTS, **check whether Quest Browser exposes any voices at all**. Kane recorded the narrator himself and changed the voice with ElevenLabs; his line was *"Your ears are a huge part of how you perceive the world."*

## 2. Tabletop and MR "life": what winners did

**HandCraft XR** (IWSDK + three.js + Havok, Judges' Choice). The writeup says *"Standard materials and shadows were too heavy, so lighting had to be redesigned"* and describes *"an adaptive, on-demand shadow system with a dedicated micro shadow camera"*. Here is what the bundle actually does:
- **Static key light.** `castShadow`, a 512² map, `shadow.intensity .75`, `bias -5e-4`, `normalBias .005`, `radius 2`, `blurSamples 1`. The ortho camera is **2 × 1.5 m** with near .1 and far 2. `shadow.autoUpdate = false`; it re-renders only for a few `framesToUpdate` after something is placed.
- **Dynamic micro light.** A second directional light with a **128²** map over a 0.4 × 0.4 m camera. Each frame it is re-aimed at the one object being held (light position = object + lightDir × bounding radius). Its **intensity is ×0.001 and its shadow.intensity ×1000**, so it adds only a shadow and no light. Only held items cast into it; static batched meshes cast only into the static map.
- **Fill.** Ambient 0.6. A hemisphere light (0xffffff / 0xbcd2ff, 0.3) parented to the table. Key intensity = 3 − ambient − hemi. All table meshes `receiveShadow`.
- **Outline.** A single-pass outline through the stencil buffer (their IWSDK fork enables `stencil`). Two-hand scale and rotate show visual outlines.
- **Ambient layer.** Snow, drifting clouds and "warm lights". Planned next: a "Night mode with warm lights and glowing decorations".

**Meta `webxr-showcases/chairs-etc`** (MIT, MR furniture). `src/scene.js:47-54` sets `shadowMap PCFSoft` + `RoomEnvironment` through PMREM, with `environmentIntensity 0.2`. `src/furniture.js:95` adds a `ShadowMaterial` floor that receives shadows and models that cast them. This is the minimal "grounded in passthrough" recipe; IWSDK's `ShadowCatcher` is the same thing as a component.

**The Nanauts.** It builds an env map from a passthrough-camera frame. `CameraUtils.captureFrame()` draws the frame into a square canvas, sets `mapping = EquirectangularReflection`, and assigns it as `envMap` to the robots' Standard materials. A bundled JPG is the fallback. IWSDK 1.1.0 has the same `CameraUtils.captureFrame`. This is a stretch goal for us: it needs the camera permission prompt.

**Project Flowerbed** (Meta, MIT): a juice toolkit.
- `src/core/bursts.ts`: `bursts.emit(pos, BURST_STYLES.x)` gives 8 pooled bursts × 24 particles in **one Points draw**, with styles `soil`, `bloom`, `poof` and `gold`, each defined by speed, lift, gravity, size, life and additive.
- `src/core/tween.ts`: `tween(key, from, to, dur, apply, {ease})` and `easeOutBack` for pop-ins (used at `ui/tool-dial-system.ts:292`).
- `src/ui/feedback-system.ts` `tickReveal`: a reward fires **four waves of gold sparkles 0.28 s apart with a rising haptic swell**.
- `src/world/materials.ts`: `toLambert()`, which converts matte Standard to Lambert to save ~2 ms GPU per frame on Quest 3, and `makeFullRough()`. Its water shader shows how to add fresnel through `onBeforeCompile`.
- `src/ui/follow.ts`: a critically damped spring for UI that follows the player.
- Its audio and art in `public/flowerbed/` are CC BY 4.0 (© Meta), for example the wood and stone footstep clacks, so they can be reused with credit.

**Le Dino Labo** (Realcast) learned *"how lighting helps players read complex shapes"*, and its "subtle feedback (snap cues, highlights, soft audio)" was its polish. **Tiny Golf** treated the build "as a real product": brand identity, trailer and onboarding.

## 3. Why Chausar reads "dummy" today (code pointers)
| Symptom | Where | Cause |
|---|---|---|
| Metals look like brown plastic | `public/scenes/main.iwsdk.scene.json` | IBLGradient intensity 0.25 gives no reflections, while brass studs, gold bands and the gong have metalness 0.9–0.95 (`board.ts buildBoard`) |
| Board floats over the real table | same file | `environment.shadows:false`, `castShadow:false`, no ShadowCatcher or ContactShadow |
| Cloth looks printed | `board.ts drawCloth()` + cloth material | Only an albedo map at roughness 0.85; gold thread has no relief and no glint |
| Pieces slide | `director.ts updateHop()` | A linear lerp with a sine arc: no anticipation, squash, landing puff or overshoot |
| Shakuni is a mannequin | `shakuni.ts` constructor/`update` | No mouth or expression, eyes are two red spheres, one static hand, no breathing or fidgets, and the head turns with a single exponential ease |
| UI is a flat HUD bar | `shakuni.ts suspicionBack/Fill` | The meter is a dev-style bar floating at his chin |
| Idle scene is dead | — | Nothing moves while the player thinks |

## 4. Techniques to copy (with licences)
1. **Env lighting:** set `"com.iwsdk.components.IBLTexture": {"src":"room","intensity":0.8–1.0}` in place of IBLGradient (IWSDK, MIT). Put it on the level root only. If you change it at runtime, set `_needsUpdate` (see AGENTS.md traps). If the room looks too cool, rotate it or tint the key light warm. Make the change through the `iwsdk-compose-scene` skill.
2. **Grounding:** set `environment.shadows:true`. On the key light set `castShadow:true` and **shrink the shadow camera to the board** (about `shadowCameraSize 0.9`, near and far bracketing the board, 1024 map, radius 3–4). Add a `ShadowCatcher {size:[0.9,0.9], opacity:0.35}` on the board-root entity at table height. Set `castShadow` on pieces, dice, gong and Shakuni, and `receiveShadow` on the cloth and base. For perf, borrow HandCraft's trick: grab the three.js light and set `shadow.autoUpdate=false`, then set `needsUpdate=true` only while dice or pieces move. A cheaper fallback is a `ContactShadow` component under each piece and die.
3. **Cloth "embroidery":** in `drawCloth()`, draw a second 1024 canvas with the same geometry. Gold thread, borders and the lotus go white (`metalnessMap` B channel / `roughnessMap` G channel, so 0.3 rough for thread and 0.95 for cloth). Use the same strokes as a `bumpMap` (bumpScale ~0.002). Gold then **glints as the head moves**, which is the single most "alive" look for a static board.
4. **Hop juice:** in `updateHop`, wind up for 0.12 s first (scale y 0.85, xz 1.08). Stretch in the air (y 1.12). Squash on landing (y 0.8) and settle with overshoot over 0.18–0.25 s. Fire `bursts.emit(landing, dust)` (port `bursts.ts`, MIT) and vary the `sfx.tap` pitch by step. Rotate the piece slightly toward its travel direction. On the last step, finish with a larger thump and a gold ring.
5. **Shakuni face:** a canvas face plane (or a decal on the front of the face sphere) with drawn almond eyes, kohl, brows and a moustache-framed mouth. Use 5 states: `smug, suspicious, angry, laugh, shock`. Mouth frames: closed, open-small, open-wide and "O". Redraw only on change, and use the canvas as both `map` and `emissiveMap` (the Nanauts pattern; write our own code).
6. **Shakuni body layers:** breathing (torso scale y ±1% at 0.25 Hz). Idle fidget every 1.5–4 s. Eyes and face lead the head by 0.7 × turn, capped at 35°. Head turns use a spring with 1.12 overshoot instead of `1-exp`. Before "away" he winds up by tilting 0.06 rad in the opposite direction. A second ghost hand drums its fingers on the table edge or strokes his beard while idle. Laughing gets a shoulder bounce, not just a head bob.
7. **Outline and hover:** an inverted-hull outline (a duplicate mesh with `BackSide`, scale 1.06, MeshBasic gold, `toneMapped:false`) on legal pieces. Pulse it, and pop it in with `easeOutBack`. On pinch, compress the piece and play a click (Meta guideline).
8. **Ambient layer:** two brass **diyas** at the empty corners of the cross. Each has an additive flame billboard with a noise flicker. Add one warm `PointLight` (no shadow) whose intensity flickers 0.8–1.2. Add a few embers and incense wisps from one `Points` buffer. This is our equivalent of HandCraft's snow.
9. **Rewards:** for a capture, a win or a correct accusation, use Flowerbed's `tickReveal` pattern: 3–4 waves of gold bursts with a rising haptic swell (hands only, so use sound and light if haptics are absent). Marigold petals (`fx.ts`) are already good, so trigger them more often.
10. **Room transformation:** when Shakuni materialises, fade in a large `BackSide` sphere around the player, warm black at 35–50% opacity. The room dims to a torch-lit sabha while the board and diyas stay bright. Fade it back for the ending. This gives a strong first-30-seconds shot (pattern 6 in the winners analysis).
11. **Perf guardrails:** move matte things (cloth, wood, robe) to Lambert with Flowerbed's `toLambert`. Keep Shakuni's transparent materials few. Use one shadow-casting light. Check `renderStats.triangles` (src/AGENTS.md).

## 5. What judges visibly rewarded (inferred; no published comments)
- **A finished-toy feel at table scale** (HandCraft, Tiny Golf). They noted shadows, outlines, ambient motion, and a cosy, consistent palette.
- **Character through motion and voice, not fidelity** (The Nanauts, Language IRL).
- **One awe beat in the first seconds of the trailer.** Pattern 6: the room transforms.
- **Restraint.** Cut features to polish the core loop (Le Dino Labo, HandCraft).

## Top 12 changes for Chausar, ranked by impact ÷ effort
| # | Change | Impact | Effort | Where |
|---|---|---|---|---|
| 1 | IBLTexture `room` at ~0.9 in place of IBLGradient 0.25, so metals and gold come alive | High | 10 min | scene JSON |
| 2 | Shadows: `environment.shadows`, key `castShadow` with a tight board-sized camera, `ShadowCatcher` under the board, casters on pieces, dice, gong and Shakuni (on-demand `autoUpdate=false` if FPS drops) | High | 45 min | scene JSON, `board.ts`, `director.ts` |
| 3 | Hop juice: anticipation, squash and stretch, landing dust burst, pitched taps, final thump | High | 45 min | `director.ts updateHop`, `fx.ts` (port `bursts.ts`) |
| 4 | Shakuni canvas face with 5 emotions and a talking mouth tied to captions or speech boundaries | Very high | 2–3 h | `shakuni.ts` |
| 5 | Shakuni procedural layers: breathing, fidgets, eye-lead, overshoot spring, wind-up before looking away, second idle hand | High | 1.5 h | `shakuni.ts update` |
| 6 | Cloth metal, roughness and bump maps from the same canvas, so gold thread glints | Med-high | 1 h | `board.ts drawCloth` |
| 7 | Two diyas with flicker flame, one warm flickering point light, and embers or incense | Med-high | 1–1.5 h | new `fx` piece |
| 8 | Legal-move outline (inverted hull) with easeOutBack pop, plus press compress and click | Medium | 45 min | `board.ts PieceView`, `director.ts` |
| 9 | Room-dim "sabha" transformation on Shakuni's entrance and the finale | High (video) | 1 h | `director.ts` |
| 10 | Reward waves: 3–4 gold bursts and a rising sound on capture, win or correct accusation | Medium | 30 min | `fx.ts`, `audio.ts` |
| 11 | Diegetic suspicion: replace the HUD bar with eye-glow plus a reddening diya or aura, and put captions on a parchment card | Medium | 1–1.5 h | `shakuni.ts`, `text.ts` |
| 12 | Pre-recorded Shakuni voice lines (your voice, pitch-shifted) if Quest TTS is missing or robotic, with mouth flaps driven by the audio | Med-high | 1–2 h | `audio.ts` |

Later, not before the deadline: a VRM or Meshy rigged Shakuni, a passthrough-camera env map (Nanauts style), and depth occlusion of real hands over the board (see the `iwsdk-depth-occlusion` skill).

## Links
[HandCraft XR Devpost](https://devpost.com/software/handcraft-xr-winter-edition) · [live](https://handcraft-xr.netlify.app) · [The Nanauts Devpost](https://devpost.com/software/nanauts) · [live](https://jameskane05.github.io/nanauts/) · [Language IRL](https://devpost.com/software/see-and-speak-spanish) · [Dun Jun](https://devpost.com/software/dunjun) · [ProjectFlowerbed](https://github.com/meta-quest/ProjectFlowerbed) · [webxr-showcases](https://github.com/meta-quest/webxr-showcases) · [Kane interview](https://xraispotlight.substack.com/p/tools-and-workflows-for-shipping) · [three-vrm](https://github.com/pixiv/three-vrm) · [wawa-lipsync](https://www.npmjs.com/package/wawa-lipsync) · [RPM shutdown](https://en.wikipedia.org/wiki/Ready_Player_Me) · [Meshy licence](https://help.meshy.ai/en/articles/9992001-can-i-use-my-generated-assets-for-commercial-projects)
