# Visual quality: from "dummy" to production-grade in passthrough

The 2025 winners didn't win on polygons. They won on **lighting, grounding, motion, sound and one consistent style**. Code references: `reference/runtime/lighting.ts`, `juice.ts`, `palace.ts`, `tablecloth.ts`, `props.ts`.

## 1. Lighting and grounding (the biggest single jump)
- Replace the scaffold's dim `IBLGradient 0.25` with `IBLTexture {src:'room', intensity ~0.8}`. Otherwise every brass, gold or metal surface reads as brown plastic.
- One warm key light with `castShadow`, a **tight shadow camera (~1 m) re-aimed at the board each frame**, a 1024² map, and `autoUpdate=false` with refreshes only when something moves.
- A `ShadowMaterial` catcher under the play area.
- **Force one material recompile when shadows are turned on after load.** Materials compiled before `shadowMap.enabled` flips never pick up shadows.
- One warm flickering `PointLight` from practical lamps (diyas), created once in `init`. Adding or removing lights later recompiles every lit shader.

## 2. Materials that read as real
- **Cloth with gold thread:** draw the embroidery once on canvas and reuse the strokes as metalness, roughness and bump masks, so the gold glints as the head moves (the single most "alive" effect on a static object).
- Lacquer and wood: `MeshPhysicalMaterial` with clearcoat. Velvet: sheen, but **muted** (`sheenColor` dark, base colour darkened). A bright sheen turned crimson velvet salmon-pink under warm light.
- Pack multi-face textures into one atlas (one draw call per object, e.g. dice).
- Check colours under the *actual* scene lighting. Plum turned silver at low roughness, and crimson turned pink with a bright sheen.

## 3. Motion ("juice") that makes it feel alive
- Hops: anticipation (squash) → stretch in the air → squash on landing → settle with overshoot. A landing dust puff and a pitched tap per step; a bigger thump plus a gold ring on the last step.
- Reward waves (3–4 gold bursts 0.28 s apart with a rising sound) for captures, wins and correct accusations.
- A legal-move outline (inverted hull, easeOutBack pop-in, pulsing).
- Ambient life: flame flicker, embers and smoke, swaying tassels, the character breathing and fidgeting.
- An awe moment with no post-processing: a crack drawn progressively on a canvas → light pillars (additive open cylinders) → sparks → cooling to kintsugi gold.

## 4. Transform the room
- **Dim the passthrough** (warm black inside-out sphere at ~40–50 %) as the character appears.
- **Replace the walls** with a 360° panorama dome:
  - radius ~2.8 m (inside the dimmer);
  - **centred on the viewer's head every frame** (no parallax, horizon at eye level);
  - seam behind the player;
  - opaque on the walls and **faded out below about −15° elevation**, so the real table, hands and floor stay passthrough.

  Show the full dome on desktop. Reveal it with the entrance; dissolve it back to the real room on victory ("your room, your kingdom").
- 3D pieces in front of the backdrop give depth: an arch framing the character, symmetric pillars, tall lamps flanking the seat. Keep them clear of the play area and the sight-line to the character.

## 5. Dress the real table
Use the detected plane's outline to lay a themed cover: velvet, a wide zari border, corner rosettes, a skirt with folds (a sine offset along each edge), a gold hem, a tassel fringe (instanced cones). It turns any modern table into a period table while staying the real play surface. Use a default size when no plane is detected, plus carved lathe legs on desktop.

## 6. A consistent look
- One palette (here: crimson, plum, sandstone, brass, gold), one material language, one font pair.
- Every prop passes the "same world?" test before it's placed.
- Review the hero frame (the first 30 s of the video) as a composition: frame, symmetry, light on the character's face.

## 7. Cost guardrails
Under ~100 draw calls per eye; under ~150k triangles in the stereo emulator counter; one shadow map; no post-processing; foveation 0.5; 72 Hz target. Log `renderer.info.render` every 5 s in dev. The emulator reports stereo numbers (×2).
