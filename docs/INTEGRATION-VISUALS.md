# Visuals upgrade: what `director.ts` must call

This upgrade covers VISUAL-RESEARCH.md Top-12 items 1, 2, 6, 7, 8, 9, 10 and the caption half of 11. Everything below is built and checked with typecheck, build, `npm test` and runtime screenshots. **`director.ts` and `shakuni.ts` were not touched.** Some changes appear with no wiring at all; the rest need the calls listed here.

## Already live with no director changes
- **Lighting** (`public/scenes/main.iwsdk.scene.json`):
  - `IBLTexture {src:'room', intensity 0.8}` replaces IBLGradient 0.25.
  - Warm key light (`[1,.86,.68]`, intensity 3, about 45° elevation from the upper left behind the player).
  - Hemisphere fill lowered to 0.22.
  - `environment.shadows: true` with `pcf` filtering.
  - The key light has `castShadow` with a tight 1 m shadow camera (near 0.8, far 2.4, 1024 map, radius 3, bias −3e-4, normalBias 1.5e-3). Its authored pose already aims at the desktop board spot `(0, 0.72, −0.55)`.
- **Board** (`board.ts`):
  - Cloth embroidery has a packed bump, roughness and metalness mask, so the gold zari and the mirror-work glint as the head moves. It adds paisleys, home chevrons, phool motifs and a two-layer lotus.
  - Lacquered rosewood base with a stepped plinth and a brass inlay line.
  - 8 swaying tassels, animated in their shader.
  - Clearcoat lacquer pieces with gold foot, waist and finial trim.
  - Bronze gong. Instanced studs.
  - `castShadow` and `receiveShadow` are set on board meshes, and a `ShadowMaterial` catcher sits under the board (`board.shadowCatcher`).
- **Dice** (`dice.ts`): ivory clearcoat, brass end caps (visual-only children), cast shadows. Physics is unchanged and `test:dice` passes.
- **Captions** (`text.ts`): any `Label` with both `background` and `border` now draws an ornate lacquer card with gilded filigree corners. New optional style fields: `frame: 'ornate'|'plain'`, `variant: 'lacquer'|'parchment'`. Labels with `border: null` (keys, ledger) keep the plain rounded card. The constructor and `setText` are unchanged.

## Imports
```ts
import { enableBoardShadows, SURFACE_Y } from './board.js';            // SURFACE_Y already imported
import { ShadowRig } from './lighting.js';
import { createAmbience, createRoomDimmer, type Ambience, type RoomDimmer } from './ambience.js';
import { BURST_STYLES, hopDuration, hopPose, Juice } from './juice.js';
```
Fields: `private shadows!: ShadowRig; private ambience!: Ambience; private dimmer!: RoomDimmer; private juice!: Juice;`

## `init()` (after `buildBoard`, `DiceSet`, `Fx`)
```ts
this.shadows = new ShadowRig(this.world);                       // finds scene node "key-light"
this.shadows.watch(
  ...this.board.pieces.flat().map((p) => p.mesh),
  ...this.dice.dice.map((d) => d.mesh),
  this.board.gongDisc,
);
this.ambience = createAmbience();            // 2 diyas: far-right quadrant + beyond the far-left edge
this.board.root.add(this.ambience.group);    // under board.root so it shakes with the crack
this.juice = new Juice();
this.board.root.add(this.juice.group);
this.dimmer = createRoomDimmer();
this.anchor.add(this.dimmer.mesh);
```
- Create the ambience in `init` and never add or remove it later. It owns the scene's only `PointLight`, and toggling that light would recompile every lit shader.
- Optional: `enableBoardShadows(this.shakuni.group)` makes opaque parts cast; transparent ghost parts are skipped. Shakuni sits at z −0.62, which is outside the 1 m shadow camera, so only parts that reach over the board (the hand) would show.

## `update()` (each frame, after `updateHop`, `updatePieces` and `dice.update`)
```ts
this.juice.update(dt);
this.ambience.update(dt, time);
this.dimmer.update(dt);
this.shadows.update(this.board.root);   // aims the shadow camera at the board; re-renders only on motion
```
- `ShadowRig` sets `shadow.autoUpdate = false`. It refreshes the shadow map only when a watched object moves, the board moves, or you call `this.shadows.requestShadowUpdate(frames)`.
- It also forces a one-time material recompile when `renderer.shadowMap.enabled` flips on at level load. **Without that, three.js shows no shadows at all**, because materials compiled before the flip never pick it up.
- Call `shadows.update` in every phase, including `placing`.

## Hop: replace the body of `updateHop`
```ts
private updateHop(dt: number): void {
  const h = this.hop;
  if (!h) return;
  const n = h.path.length;
  h.t += dt / hopDuration(h.i, n);              // 0.26 s first, 0.17 s middle, 0.38 s last
  const piece = this.board.pieces[h.seat][h.piece];
  const fromIdx = h.i === 0 ? (h.path[0] - 1 < 0 ? START : h.path[0] - 1) : h.path[h.i - 1];
  const toIdx = h.path[h.i];
  if (toIdx !== undefined) {
    const a = piecePosition(h.seat, fromIdx, h.piece, 0, this.tA);
    const b = piecePosition(h.seat, toIdx, h.piece, 0, this.tB);
    hopPose(piece.mesh, Math.min(1, h.t), a, b, h.i === n - 1, h.i === 0);
    if (h.t >= 1) this.juice.landing(b, h.i === n - 1, h.i);   // dust + rising pentatonic tap; last = poof + gold ring + thump
  }
  if (h.t >= 1) {
    h.t = 0;
    h.i++;
    if (h.i >= n) { this.hop = null; h.then(); }
  }
}
```
- Remove the old `sfx.tap(...)`; `juice.landing` plays the sound.
- **If anything cancels a hop mid-flight** (`accuse()` sets `this.hop = null`), reset the pose. Either call `piece.mesh.scale.set(1, 1, 1); piece.mesh.quaternion.identity()`, or add `m.scale.setScalar(1)` to `updatePieces`. Otherwise the piece can stay squashed.

## Legal-move highlight (`p_choose`)
- Where legal pieces get `setGlow(0.6)` (around line 928), also call `piece.setHighlight(true)`. The outline is a gold inverted hull that pops in with easeOutBack and pulses on its own, with no per-frame call. You can keep the `setGlow` pulse or drop it, and the ring `markers` can go.
- In the clean-up (around line 970, `for (const p of this.board.pieces[0]) p.setGlow(0)`), add `p.setHighlight(false)`.

## Phase hooks
| Moment | Call |
|---|---|
| **Shakuni entrance** (intro start, when he materialises) | `this.dimmer.fadeTo(1, 2.0); sfx.dim(true); this.ambience.setMood('tense'); this.ambience.flare(0.8);` then `setMood('calm')` once play starts. Keep the dimmer at 1 through the match. |
| Placing / re-placing | `this.dimmer.setAmount(0)` while placing, so the player can see the real table. |
| **Capture** (`then()` with `m.captures.length`) | `const at = this.board.pieces[m.seat][m.piece].mesh.position; this.juice.capture(at);` in place of `fx.burst`. If the player captured (`m.seat === 0`), add `this.juice.reward(at, 3)`. If Shakuni captured, add `this.ambience.flare(0.6)`. |
| **Player win** (`finish(0)`) | `this.juice.reward(this.tA.set(0, SURFACE_Y, 0), 4); this.ambience.setMood('triumph'); this.dimmer.fadeTo(0, 2.5); sfx.dim(false);` Keep `fx.petalShower()` and `sfx.conch()`. |
| Shakuni win (`finish(1)`) | `this.ambience.setMood('tense'); this.ambience.flare(1);` and leave the room dim. |
| **Correct accusation** (`accuse()`, `sCheat` true) | `this.juice.reward(this.tA.set(0, SURFACE_Y, -0.12), 4); this.ambience.flare(1); this.ambience.setMood('calm');` Keep `triggerCrack(1)`. |
| Wrong accusation | `this.ambience.setMood('tense'); this.ambience.flare(0.5);` then back to `'calm'` at the next `p_ready`. |
| Caught cheating (`caught`) | `this.ambience.setMood('tense'); this.ambience.flare(0.8);` |
| Gong struck (`updateGong`) | `this.ambience.flare(0.4);` (optional) |
| Restart (`resetMatch`) | `this.ambience.setMood('calm'); this.dimmer.fadeTo(1, 1.5);` |
| Strong dice impact (optional, `dice.onImpact`) | `if (s > 0.7) this.juice.emit(this.tC.set(x, SURFACE_Y, z), BURST_STYLES.dust, 0.6)`. `onImpact` gives only x today, so use the die's position. |

## API reference (new or changed)
- `board.ts`:
  - `PieceView.setHighlight(on)`, `.highlighted`, `.outline`.
  - `BoardView.shadowCatcher`, `BoardView.tassels`.
  - `enableBoardShadows(root, receive?)`.
  - `PieceView` takes two optional trailing constructor arguments (shared trim geometry and material).
- `lighting.ts`: `ShadowRig { watch(...objs), requestShadowUpdate(frames=2), update(board) }`, `aimShadowAt(light, worldPos, distance=1.5)`, `findSceneLight(world, 'key-light')`, `refreshShadowMaterials(root)`.
- `juice.ts`:
  - `Juice { group, emit(pos, style, scale?), ring(pos, radius?, life?, strength?), landing(pos, isLast, step), capture(pos), reward(pos, waves=4, interval=0.28), update(dt), busy }`.
  - `BURST_STYLES` (`dust | poof | gold | ember`).
  - `hopPose(piece, t, from, to, isLast, isFirst=true)`, `hopDuration(i, n)`.
  - All positions are board-local.
- `ambience.ts`:
  - `createAmbience(spots = DIYA_SPOTS) → { group, light, flames, update(dt, time), setMood('calm'|'tense'|'triumph'), flare(strength) }`.
  - `createRoomDimmer(radius = 3) → { mesh, setAmount(0..1), fadeTo(v, s), update(dt), amount }`. An amount of 1 dims passthrough to about 40%.
- `audio.ts` (existing names kept): `tap(pan, pitch=1)`, plus new `hopTap(step, pan)`, `thump(pan)`, `reward(wave, of)`, `dim(on)`, `flare()`.

## Cost (per eye, Quest 3 target of 72 fps)
- **Static draws:**
  - +11: plinth, inlay, 2 tassel draws, shadow catcher, 3 die caps, 3 ambience draws.
  - −7: the 8 studs are now 1 instanced draw.
  - Net **+4**. Pieces stay at 2 draws each (body + merged trim).
- **Transient draws:** up to **+5** (2 outlines, burst points, rings, dimmer).
- **Shadow pass:** about 25 caster draws, **only on frames where something moved**. One 1024² map, one shadow light, no post-processing.
- **Triangles:** about +12k. Pieces with trim come to about 7k, tassels about 3k, diyas about 1.7k, studs about 1.5k, dimmer 768. The runtime counter read 23k triangles in total in the desktop view.
- **Fragment cost:**
  - One warm `PointLight` adds per-fragment lighting on lit materials.
  - Clearcoat is on pieces, base and dice only.
  - The dimmer is one full-screen blended pass, and only while it is visible.
- **Textures:** cloth colour 2048² plus mask 1024² (about 27 MB on the GPU with mips). If memory gets tight, drop the colour canvas to 1536.

## For the integrator and the Shakuni engineer
- **The lighting is brighter and warmer now.** Key 3.0 plus room IBL 0.8, replacing gradient IBL 0.25. Re-check Shakuni's lit materials. The dimmer has `renderOrder −50`, so his transparent ghost parts (default order 0) draw over it and stay bright.
- **Diya placement.** The two diyas are at board-local `(0.175, 0, −0.175)` and `(−0.215, 0, −0.31)`, clear of both dice courts, the gong, and the ghost-hand path (x −0.1 to −0.16, z −0.33 to −0.44). If Shakuni's hand path changes, pass your own `spots` to `createAmbience`.
- **Outdated README line.** README "Performance" still says "no real-time shadows", and Credits says "no third-party code". Update both: the bursts idea is adapted from Meta ProjectFlowerbed (MIT), and the attribution is in `juice.ts`.

## Credits
- No textures, models or audio were downloaded. Cloth, wood, flames, particles and captions are all procedural (canvas and GLSL), and the sounds are synthesised in WebAudio.
- The pooled-burst idea and the reward-wave pattern come from **Meta ProjectFlowerbed** (`src/core/bursts.ts`, `ui/feedback-system.ts`), MIT, © Meta Platforms, Inc. The code here is our own and carries an attribution comment.
- The hop animation constants follow the numbers The Nanauts' animator uses, as noted in VISUAL-RESEARCH.md. Only the numbers were taken, no code.
