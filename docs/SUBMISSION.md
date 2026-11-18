# Submission kit (Devpost)

Deadline: **Wed 18 Nov 2026, 12:00 PM PST = Thu 19 Nov, 1:30 AM IST.** Submit several hours early. Do not redeploy after the deadline.

- **Track:** Gaming
- **Division:** Original
- **Submitter:** must be a person who isn't submitting another project (one entry per person).

## Title and tagline
**Chausar: The Game of Dice.** Cheat Shakuni at his own game, with your bare hands, on your real table.

## Description (paste-ready)

> In the Mahabharata, a game of dice decided the fate of a kingdom, and Shakuni won it by cheating. **Chausar** puts that game on your real table.
>
> A carved, embroidered chausar board rises out of your table in passthrough. Across it sits Shakuni's spirit. You play with your hands only: pinch the long bone *pasa*, shake them, and open your fingers to throw. Pinch a piece to move it.
>
> **Cheating is the game.** Shakuni's eyes blaze red when he watches you and dim when he turns to his court. In those moments:
> - **lower the dice beneath your real table's edge** to swap in loaded pasa;
> - or **poke a die** to tip it onto a better face.
>
> If he catches you, your side of the board cracks open and divine light reveals the true roll.
>
> But Shakuni cheats too. Watch his ghostly hand: if it dips below the table before he throws, **strike the gong** to accuse him. If you're right, his side cracks and his turn is undone. If you're wrong, you lose your next throw.
>
> His tells are learnable: the hand that slips under the table, and the total he names while his dice are still in the air. He only knows it because the game was decided before it began. Catch him for the first time and his dice rise before you to be inspected while the legend is told: the old tellings say they were carved from his father's bones.
>
> The wager sits on your table as stacks of gold that sweep across to whoever captures, and the match ends with a question the epic leaves open: if you beat a cheat by cheating, who was the fairer player?
>
> Each win raises the stakes, as in the epic: gold, a chariot, elephants, an army, the treasury, and finally the kingdom itself.

**How we built it**
- **Stack:** Meta's Immersive Web SDK (IWSDK 1.1.0, three.js + ECS) running WebXR `immersive-ar` in Quest Browser, with hand tracking and plane detection.
- **Dice:** our own small rigid-body simulation for the long four-sided pasa. The dice really fly, bounce and topple, and in the last moment the simulation can roll a bar onto any chosen face invisibly. That's how loaded dice work.
- **Hands:** pinch hysteresis, a least-squares release velocity, and tracking-loss grace.
- **Board placement:** finds your table from scene understanding, with fallbacks.
- **Assets:** every model, texture and sound is procedural (no asset packs). The tanpura drone, gong, pasa clacks and divine choir are all synthesised in WebAudio.
- **Testing:** emulated hands in IWER, through an automated suite of 19 XR checks.

**Challenges**
- Making forced dice outcomes look natural.
- Detecting "hand under the table" robustly when tracking may drop.
- Letting judges in unknown rooms always find a play surface.

**What's next**
- Two-player mode, where your friend is Shakuni and the gaze becomes real head tracking.
- Spoken taunts from an LLM-driven Shakuni that reacts to your play.
- A Kurukshetra finale.

**Credits:**
- Fonts: Rozha One and Tiro Devanagari Hindi (SIL OFL).
- Story: Mahabharata, Sabha Parva, K. M. Ganguli's public-domain translation.
- Code: IWSDK (MIT).
- Everything else is original.

## Video (under 3:00, real headset footage, public on YouTube or Vimeo)

Record on Windows with MQDH casting, or with the headset's own recorder.

| Time | Shot | Point it makes |
|---|---|---|
| 0:00–0:08 | Over-the-shoulder: an empty real table. The gold cross snaps onto it, the board **rises**, Shakuni fades in. Title card "चौसर · Chausar". | Hook: the room is the stage |
| 0:08–0:25 | Pinch the pasa, shake (rattle), throw; the dice bounce and topple; "5 + 6 + 6 = 17". Pinch a piece; it hops. | Hands-first, seated, no controllers |
| 0:25–0:45 | Shakuni's eyes go dim and he turns away. Lower the dice **under the real table edge**, golden glint, throw. The perfect roll. | The core idea in one shot |
| 0:45–1:05 | Try again while he's watching: red eyes, "CHEAT!", **board cracks, light pillars**, true roll revealed. | The awe moment |
| 1:05–1:25 | Shakuni's ghost hand dips below the table. Poke the gong, his side cracks, "Impossible!" | Two-way mechanic |
| 1:25–1:40 | The nudge: poke a settled die to flip it. | Second cheat |
| 1:40–2:00 | Win: piece reaches the centre, marigold petals, conch. Ledger: "Next time Shakuni wagers the royal chariot." | Reason to come back |
| 2:00–2:20 | Quick cuts in a second room (different table), two-hand pinch to move the board. | Works in unknown rooms |
| 2:20–2:40 | End card: "Play it in Quest Browser" plus the URL. | Call to action |

Put the try-it URL next to the video link.

## Images for the gallery
1. The hero shot: the board on a real table with Shakuni across it.
2. The crack and light pillars.
3. A hand lowering the dice under the table edge.
4. The petal shower.

## Before you press Submit
- [ ] `npm test` passes, and so does `npm run test:xr` (dev server up).
- [ ] Headset checks H1–H7 in TESTING.md are done.
- [ ] Production deploy: `vercel --prod` from this folder. Open the production alias on the headset, logged out.
- [ ] Video uploaded and public; URL and video added to Devpost.
- [ ] Track and Division chosen; credits pasted.
