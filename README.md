# Mahabharat Chausar

A carved chausar board rises out of your real table. Play the dice game from the Mahabharata against an AI Shakuni. **Cheating is a mechanic**: load the dice with a secret hand gesture, but the opponent watches your hands and can call "Cheat!".

- **Track:** Gaming. **Awards:** Boldest Original Concept (cheating by gesture only works with tracked hands), Best Agentic Interaction (AI Shakuni), Social & Multiplayer if 1v1 PvP ships.
- **Awe moment:** a caught cheater's side of the board cracks open, and divine light pours out to reveal the true roll.
- **Core loop:** throw the pasa dice with a real throw → move pieces by pinch → optionally load the dice (costs karma) → Shakuni may accuse → punishment, or progress toward a short Kurukshetra finale.

## Minimum playable version
1v1 against a heuristic AI on one board, with 2–3 distinct cheat gestures and the board-crack finale.

## Reuse
- **IWSDK Havok physics:** set `world.features.physics: true` in `iwsdk.config.json`. Grabbed bodies keep their velocity when thrown, and `PhysicsManipulation` sets velocity directly.
- byWulf/threejs-dice (MIT) for the pre-simulated forced-outcome trick.
- Gesture detection from the 2025 winner Dun Jun (`sma1692/DunJun`, check its license) and handy-work (MIT).
- Kenney board-game kit (CC0) with toon materials; three.quarks (MIT) for VFX.
- Pre-fractured glTF (Blender Cell Fracture) for the crack.

## Build steps
1. Board snaps to the table.
2. Long dice as box shapes; read the face pointing up.
3. Snap-to-square pieces with oversized colliders.
4. Cheat gestures with hysteresis and hold time.
5. Heuristic Shakuni that watches for hand-motion anomalies; optional LLM taunts through a `/api` proxy.
6. Finale.

## Risks
- Fast throws leave the tracking volume: use a 120 ms ring-buffer velocity and the last good pose.
- Story material must be public-domain only; use respectful original art.
- Hindi text needs the Canvas2D path (uikit doesn't support Indic shaping).

## Common to every project
- Stack: IWSDK 1.1.0 (pinned) · WebXR in Meta Quest Browser · mixed-reality `ar` session · hands only · seated · Vercel.
- Shared rules, visual/hands/MR playbooks, perf budget, assets & licenses, and the submission gate: **[common build plan](../meta-vr-start-2026-kit/research/common-build-plan.md)**.
- Competition: Meta VR Start Developer Competition 2026. Deadline **Wed 18 Nov 2026, 12:00 PM PST (Thu 19 Nov, 1:30 AM IST)**.

## Run
```bash
npm ci            # Node >=20.19 (see .nvmrc). .npmrc skips onnxruntime's CUDA download.
npm run setup     # once per machine: MCP configs for Claude/Cursor/Codex + IWSDK reference index
npm run dev       # HTTPS dev server + emulator on https://localhost:8081
npm run typecheck && npm run build
```
Testing on a Quest from Linux: `adb reverse tcp:8081 tcp:8081`, then open `https://localhost:8081` in Quest Browser.
Agent workflow: start every task with the `iwsdk-dev` skill. More in [docs/IWSDK-STARTER.md](docs/IWSDK-STARTER.md) and [AGENTS.md](AGENTS.md).
