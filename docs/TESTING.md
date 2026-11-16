# Testing and judging-criteria matrix

Last full run: 16 Nov 2026, on Linux with IWSDK 1.1.0, the IWER emulator (Meta Quest 3 profile, `sunlit_living_room`) and emulated hands.

## 1. Automated results

| Suite | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ clean |
| Production build | `npm run build` | ✅ (main chunk about 2.5 MB, about 680 kB gzipped) |
| Rules sim | `npm run test:rules` | ✅ 75-square path valid; 2,000 AI games, about 16.8 throws per game, wins 50/50; regression: a seat-0 win keeps the turn |
| Dice physics | `npm run test:dice` | ✅ 300/300 settle (median 1.08 s, p90 1.33 s); forced faces 150/150; about 97% fully in court |
| XR core loop | `python3 scripts/e2e/xr_core.py` | ✅ 12/12 |
| XR cheats and endings | `python3 scripts/e2e/xr_cheats.py` | ✅ 7/7 |

**XR checks** (every one done with emulated hands only, no controllers, no keyboard, except two dev-only hooks marked †):
1. Entering AR starts placement; a `table` plane is detected (only tables in front of you count).
2. A pinch places the board; a pinch skips the intro.
3. Pinching near the pasa picks them up; opening the fingers throws; the dice settle and show their total.
4. An honest throw is not punished.
5. Shakuni throws, then slides the dice back to your side.
6. Hand below the table edge while he watches → swap registered, **seen** → caught → crack + divine light → true roll.
7. His scripted second throw cheats → **poking the gong** accuses him → his turn is undone → play resumes with you.
8. Swap while he looks away (†`K` forces "away") → unseen → not caught at low suspicion.
9. Poking the gong when he was honest → wrong accusation → your next throw is forfeited.
10. Poking a settled die → quarter-roll flip registered as a cheat.
11. Reaching the centre wins (†`W` jumps a piece near home); striking the gong restarts.

**Bugs found and fixed by these tests:**
- Seat 0's win passed the turn (`!winner` is true when the winner is seat 0).
- A table *behind* the player was chosen.
- The flip window (2.2 s) was too short to reach a die; it's now 3 s, extended while a hand hovers.
- Dice were laid end to end.
- Dice rocked for 2.5 s before settling (rolling resistance added).
- Honest dice were biased by the release orientation (random starting roll added).

**Visual QA pass on the realistic Shakuni (16–17 Nov)**: each was found with close-up review cameras (dev key `C`), compared against a Blender render of the same GLB, and fixed:
- **Eye proxies exported unskinned**: the eyes stayed still while the head turned and slipped out of their sockets. Fixed by adding an Armature modifier and rigid head weights.
- **BLEND materials on skin and eyes** gave sorting errors: eyes hidden by the lids, limbs looking cut. Made opaque.
- **Opaque cornea shell** covered the irises. Fixed with an alpha test.
- **Lash and brow alpha** was lost in the glTF export. Rebuilt in the shader.
- **Draco compression** displaced the small skinned meshes. Draco is no longer used for the character.
- **Sanitised bone names** made the human fail to load (`wrist.R` → `wristR`).
- **The moustache was anchored by vertex group**, which put it across the eyes. Now anchored to the nose tip.
- **The hard cut at the tabletop** was replaced by a full seated body on a gaddi plus depth occlusion.
- **The beard stroke**: first the hand hid inside the torso, then the fingers fell short of the beard, then they went behind it. Now staged with the wrist forward, the elbow out and a knuckle aim in front of the beard.
- **Text clipped** on all sides (two-line overflow), now fit-to-card. **Text overlapping**: separate regions for dialogue, instructions and title, plus a choreographed intro.

## 2. Must be checked on a real Quest (the emulator can't prove these)

| # | Check | How |
|---|---|---|
| H1 | **72 fps** through the crack + light pillars + petals | `adb` + `metavr` perf capture or OVR Metrics. Budget: about 64 draw calls per eye, about 45k triangles. |
| H2 | Pinch pickup and throw feel natural; release velocity is believable | Try 10 throws: soft, hard, and an underhand "drop". |
| H3 | Under-the-table swap with **real hand tracking** below a real table (tracking may drop under the table: the 150 ms grace and `!tracked → throw` path should cope) | Hold the dice under the edge 1 s, bring them back up. |
| H4 | Table plane detected in 2 different rooms; the no-plane fallback (hand placement) works; the two-hand pinch re-places | Rooms with and without a Space Setup table. |
| H5 | Canvas text readable at arm's length; the Devanagari title shapes correctly | Look at the caption and title. |
| H8 | Depth occlusion: the real table hides Shakuni's lower body and gaddi (needs Quest 3/3S depth) | Look across the table from a low seat. |
| H9 | Palace dome: the horizon sits at eye level; the fade line below the walls doesn't cut into the real table | Sit at two different table heights. |
| H6 | `speechSynthesis` voice present in Quest Browser (optional: captions always show) | Listen during the intro. |
| H7 | Production URL works logged out, in incognito | Open the Vercel URL on the headset. |

## 3. Judging criteria self-assessment

| Criterion (25% each) | What Chausar does | Remaining risk |
|---|---|---|
| **Innovation & Creativity** | First chausar/pachisi in XR found (see RESEARCH §5). Cheating *by hand* is a mechanic that only exists with tracked hands and a real table edge. An AI opponent that watches your hands. Mahabharata theme from public-domain text. | None major |
| **Experience Design** | Seated, hands only, three verbs (pinch, poke, lower your hand). Onboarding in captions, one step at a time ("Pinch the three pasa…" → "Shake… open your fingers" → "Pinch a glowing piece"). Whispered hints teach each cheat the first time it's possible. Shakuni's 2nd throw always cheats, so the gong is learned by turn 4. Passthrough is purposeful: the real table is the play surface **and** the hiding place. Stakes ladder for return visits. | Needs real-hand tuning (H2, H3) |
| **Technical Implementation** | Plane detection with semantic labels, facing filter, and a 3-step fallback. Re-place gesture. Joint-level hand tracking with hysteresis, least-squares release velocity and tracking-loss grace. Custom deterministic dice physics with invisible outcome forcing. Controller fallback (trigger = pinch). 72 Hz target, foveation 0.5, no post-processing, under 100 draw calls. Automated XR e2e. | On-device fps (H1) |
| **Polish & Presentation** | Consistent art direction: embroidered cloth, bone pasa, brass gong, spectral violet Shakuni. Synthesised sound with tanpura drone, pasa clacks, gong, crack, choir and conch. Crack → divine light → kintsugi heal. Marigold petals on victory. Captions on everything. | Video still to shoot (see SUBMISSION.md) |

**Special awards:**
- **Boldest Original Concept** (strongest).
- **Best First Five Minutes**: first throw within about 15 s of placing; the crack payoff by turn 2–4.
- **Best Reason to Come Back**: stakes ladder plus ledger.
- **Accessibility**: captions on everything, one-handed play, works muted, seated.

## 4. Known limitations
- Honest pasa land on 5/6 about 60% of the time (the bars' contact dynamics). The average roll is about 3.9 instead of 3.5, which shortens matches slightly. Loaded and "true roll" throws are exact.
- Shakuni is placed 62 cm beyond the board centre, so on a table pushed against a wall he overlaps it. He is rendered as a translucent spirit, so this reads as intentional.
- No multiplayer: Shakuni is the only opponent.
