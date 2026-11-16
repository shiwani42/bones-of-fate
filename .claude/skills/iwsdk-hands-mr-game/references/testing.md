# Verifying without a headset

## Layers
1. **Pure logic:** `node file.ts` sims (Node ≥ 22 strips types). Thousands of AI games for length and balance, plus regression asserts (e.g. seat 0 winning must not pass the turn; `!winner` is falsy for 0). See `scripts/test/rules-sim.example.ts`.
2. **Physics:** bundle with `esbuild --alias:@iwsdk/core=three --platform=node` and stub `document.createElement` for canvas textures. Assert 100 % settle, 100 % forced outcomes, the landing-zone share and the median settle time. See `scripts/test/headless-physics-test.example.ts`.
3. **XR with emulated hands:** `npx @iwsdk/cli dev up --ai-mode agent` (headless) or `--ai-mode collaborate` (headed, when the user wants to watch), driven from Python with `scripts/test/xr_lib.py`.
4. **Visual review:** dev review cameras plus pose and effect keys plus Blender A/B renders. Screenshots go through PIL crops and thumbnails before reading (≤ ~900 px).

## XR harness contract
- The app logs dev-only lines: `[tag] #<pageId>.<seq> <phase> … anchor=[x,y,z] objWorld=[[…]]`. The page ID is random per load and the sequence number increments every line.
- After `browser reload`, pin the **newest page ID** from the latest log line. Waits accept only lines from that page with a sequence number above the last one consumed. The log buffer survives reloads, CLI calls take about 2 s each, and fast phases are easy to skip, so naive matching produced false PASSes and timeouts.
- Log world positions of interactables. `xr list-targets` only sees ECS entities.
- Hands:
  - `xr set-input-mode {"mode":"hand"}`, then `xr set-transform` the headset to a seated pose;
  - `xr select {"device":"hand-right"}` is a pinch tap;
  - `xr run-sequence` for reach, grab, carry, release, poke. **Name an `anchor` in the first positioned step of every call** (`grasp`, `index-tip`).
- Keys during XR via `browser interact` `press`. Use dev-only keys to force rare states (NPC looks away, piece near home, trigger the crack, trigger victory).
- Scenarios are PASS/FAIL checks: core loop; each secret mechanic seen and unseen; correct and wrong accusation; win and restart. Run them with `npm run test:xr`, in the background while writing docs, and **never while editing source** (hot reload breaks the run; re-run if it happened).

## What only a headset can prove
- 72 fps during the heaviest effect;
- the feel of real-hand throws;
- tracking at the gesture's extremes (under the table);
- two different rooms;
- depth occlusion;
- text legibility at distance;
- TTS voices present;
- the production URL logged out.

Keep this list in `docs/TESTING.md` and tick it on the device.
