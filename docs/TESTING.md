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

### Visual pass (17 Nov): lighting, grounding, materials
- **Props rendered as dull metal.** The TRELLIS GLBs have no metal or roughness factors, so glTF's defaults (1, 1) applied. Now set per prop (`props.ts` `surface`): stone, marble, brass.
- **Reflections came from a generic room.** The IBL is now `textures/palace_env.jpg`, a 50%-desaturated copy of the hall, turned with the dome. Brass lamps, goblets and gold now reflect the palace without turning the board orange.
- **Props floated on the real floor.** Each one now has a contact shadow baked at load from its own geometry (`contact.ts`): pillars, lamps, both arch feet and the gaddi. The A/B screenshot diff confirmed they render.
- **Shakuni's hands cast no shadow on the cloth.** They now do, refreshed at about 24 Hz while he idles.
- **Zari border:** a glossy, slightly metallic mask built from the cloth texture. At full metal it mirrored the dark ceiling and vanished.
- **KTX2: skipped.** All textures are small WebP (largest about 120 KB, 2048×1024 dome), so there's no visible gain, ETC1S risks blotching the face, and IWSDK would fetch the transcoder from a CDN at runtime.
- **Antialiasing:** MSAA is on (IWSDK `antialias:true`); foveation is 0.5 (`director.ts`). Frame rate is unverified until H1.

### Hands pass (18 Nov): intent guardrails from Meta's hands-first success stories
Sources: Chess Club (Odders Lab), Hand Physics Lab (Holonautic) and Table Troopers (Cosmorama) on developers.meta.com. Tested by `scripts/e2e/xr_hands.py`.
- **Losing your hand no longer throws the dice by accident.** A fast hand (above 0.8 m/s when tracking dropped) is still treated as a throw. A slow one leaves the dice waiting where they were; they glide back into your hand if it returns pinching, and slide back to your side if it returns open or stays away for 2.5 s. A swap already made stays made, and time under the table keeps counting while the hand is out of view.
- **Brushing past a piece no longer moves it.** Hovering lifts the piece and swells its landing marker with a tick. A pinch chooses at once; a resting fingertip chooses after 0.3 s.
- **Take-back:** for 2.4 s after a move you chose, touching that piece again undoes it (captures too) and lets you choose again. Desktop: `Z`.
- **Feedback:** the dice brighten and tick when your hand is in grabbing range. Controllers buzz on grab, throw, flip, choose, take-back and gong.
- **Wave at Shakuni** (open hand, near head height) and he answers, at most every 25 s.
- **Instructions follow your input** (Meta's "Hands Onboarding 101"): controller players see "pull the trigger", not "pinch".
- **A ghost hand shows each cheat** where it happens, only while Shakuni looks away: holding the dice, a blue spirit hand beside yours dips below the table edge and back; in the reveal, a ghost finger pokes the die nearest you. It shows twice per match per cheat, stops once you've done that cheat, and returns with the reminder. The reveal window stays open 6 s while it shows. Dev key `8` pins either demo for review (`src/game/ghost/ghost-hand.ts`).
- **Help comes back:** if you haven't picked up the dice after 12 s, the full instruction returns; every third turn, the hint for a trick you haven't tried yet (swap, flip, gong) can play again.
- **Skipped:** daily puzzles and live-ops (Chess Club's retention), voice commands, and red-tinted virtual hands (passthrough shows your real hands; the waiting dice glow instead).

**The article's other links, and what came of them:**
| Link | Used? |
|---|---|
| Hands Onboarding 101 (linked from the Operator blog) | Yes: input-aware instructions, reminders, recovery after tracking loss, and a looping ghost hand that demonstrates each cheat. |
| Hand tracking overview | Confirms "hands complement controllers": both stay supported. Its wide-motion mode is Unity-only. |
| Mixed reality overview | Already covered: plane detection, depth occlusion, passthrough grounding. |
| Interaction SDK (Unity/Unreal), Building Blocks | Engine-only; IWSDK is our WebXR equivalent. Their ideas (hover state, grab affordance) are now in. |
| Voice SDK | Not used: soft-deprecated, Wit.ai needs consent and a privacy policy; captions and TTS already carry the voice. |
| Meta XR Operator (blog + docs) | Unity/OpenXR. The IWSDK CLI + IWER is our equivalent, and it can drive per-finger hands, which Operator can't yet. |
| Meta Quest/VR Developer Hub | Optional on Windows for Perfetto traces; `scripts/perf-quest.sh` (metavr) covers Linux. |
| User Notifications, Developer Posts | Store-app channels; not available to a WebXR URL. |
| Meta Horizon Start | Its page says Start members compete for up to $100,000, entries by 18 Nov. |
| Muse Code, Odders Lab site, Store page | Nothing to apply (a coding agent, a company page, a JavaScript-only store page). |
| YouTube interview | Transcript not fetched (the downloader was blocked); the article is its edited write-up. |

## 2. Must be checked on a real Quest (the emulator can't prove these)

| # | Check | How |
|---|---|---|
| H1 | **72 fps** through the crack + light pillars + petals | `bash scripts/perf-quest.sh 20000` (metavr perf capture of Quest Browser, then analyze-trace) or OVR Metrics. Budget: about 64 draw calls per eye, about 45k triangles. If it misses, first set `watchSoft(3 → 6)` in `director.ts` (Shakuni's shadow refresh), then turn off `castShadow` on the human. |
| H2 | Pinch pickup and throw feel natural; release velocity is believable | Try 10 throws: soft, hard, and an underhand "drop". |
| H3 | Under-the-table swap with **real hand tracking** below a real table (tracking may drop under the table: a slow hand freezes the dice and the swap keeps counting; check they come back into the hand) | Hold the dice under the edge 1 s, bring them back up. |
| H4 | Table plane detected in 2 different rooms; the no-plane fallback (hand placement) works; the two-hand pinch re-places | Rooms with and without a Space Setup table. |
| H5 | Canvas text readable at arm's length; the Devanagari title shapes correctly | Look at the caption and title. |
| H8 | Depth occlusion: the real table hides Shakuni's lower body and gaddi (needs Quest 3/3S depth) | Look across the table from a low seat. |
| H9 | Palace dome: the horizon sits at eye level; the fade line below the walls doesn't cut into the real table | Sit at two different table heights. |
| H10 | Choosing and take-back feel deliberate, not sticky: 0.3 s dwell, 2.4 s window | Play 5 turns where you have two options; also hand the headset to someone new and watch, without explaining. |
| H11 | The ghost hand is readable but doesn't startle; does a newcomer copy it? | Watch a first-time player when Shakuni first looks away, without explaining. |
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
