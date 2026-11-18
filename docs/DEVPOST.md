# Devpost: Bones of Fate (paste-ready)

## Elevator pitch

The Mahabharata's rigged dice game, on your real table. Throw Shakuni's dice with your own hands, cheat when he looks away, and catch him when he cheats.

## Try it out

https://bones-of-fate.vercel.app (open in Quest Browser on Quest 3 or 3S)

https://github.com/shiwani42/chausar

## Built with

webxr iwsdk three.js typescript vite vercel meta-quest quest-browser hand-tracking mixed-reality passthrough plane-detection depth-occlusion webgl web-audio-api web-speech-api canvas-2d blender makehuman mpfb flux trellis hugging-face poly-haven python iwer gltf claude-code

## About the project

## Inspiration

One of the most famous scenes in the Mahabharata is a game of dice. The Pandavas lose their wealth, their kingdom, their brothers and finally themselves to their cousins, and the dice are thrown by Shakuni, Duryodhana's uncle. The game was never fair. The epic says he played by unfair means, and a popular later retelling says his dice were carved from his own father's bones and fell however he wished.

We wanted to put the player at that table. Not to watch the scene, but to play a game whose outcome was decided before it began, against someone who can cheat, with a way to fight back.

## What it does

Bones of Fate is a seated, hands-only mixed reality game for Meta Quest, played in the browser.

- A carved chausar board rises out of your real table, and Shakuni sits across from you on his divan. The walls of your room give way to the dice hall of Hastinapur, but the table and your hands stay real.
- You pinch the three long pasa dice, shake them and open your fingers to throw. You pinch a piece to move it. First piece into the centre wins.
- **Cheating is how you fight back.** When Shakuni turns to his court, you can lower the dice below the edge of your real table to swap in loaded ones, or poke a settled die to tip it onto a better face. If his eyes catch you, your side of the board cracks open, the true roll is revealed and a stack of your gold goes to him.
- **He cheats too, and he has tells.** His hand slips below the table before a loaded throw, and he often names the total while his dice are still in the air. Strike the gong to accuse him. If you're right, his turn is undone. If you're wrong, you lose your next throw.
- The first time you catch him, his dice rise in front of you to be inspected while the legend of the bones is told.
- The wager sits on the table as stacks of gold coins that sweep across to whoever captures. Between sessions the stakes climb in the order the epic gives them: gold, a chariot, elephants, an army, the treasury, the kingdom.
- The match ends with a question shaped by how you played. If you beat a cheat by cheating, who was the fairer player?

## Why mixed reality and hand tracking

The main cheat only works because the table is real and your hands are tracked. Hiding the dice below the table edge is a physical act in your own room, and Shakuni is watching your hands, not a cursor. The throw is a real throw: release speed and direction come from your hand. Quest's depth sensing lets your real table hide the part of Shakuni that's behind it, so he reads as sitting at your table rather than floating over it.

## How we built it

- **Platform:** WebXR in Quest Browser using Meta's Immersive Web SDK (three.js with an entity component system), in TypeScript. The board finds your table with plane detection, with a hand-placement fallback.
- **Dice:** a physics engine can't choose which face a die lands on, so we wrote a small rigid-body simulation for the four-sided pasa. The dice really fly, bounce and topple, and in the last moment the simulation can roll a bar onto a chosen face. In a headless test of 300 throws, every forced face was honoured (150 of 150).
- **Rules:** pure TypeScript, tuned by simulating 2,000 AI-vs-AI games for match length and balance.
- **Shakuni:** a MakeHuman/MPFB human built headlessly in Blender, with his turban, clothes and beard generated in code. He is animated procedurally: his arms reach for, shake, hide and throw the dice, and he has gaze, expressions and jaw movement while he speaks.
- **World and sound:** the hall backdrop was painted with FLUX, and the props were made from FLUX images turned into 3D with TRELLIS. All sound is synthesised with the Web Audio API, his voice uses the browser's speech synthesis, and every line is captioned.
- **Testing:** we built most of it without a headset, in IWSDK's emulator with emulated hands. 38 end-to-end checks drive the whole game: pinches, throws, under-table swaps, pokes, accusations, take-backs and tracking loss.

Everything was made with free tools.

## Challenges

- **The cheat lives where hand tracking is weakest.** Lowering your hand under a table is exactly when the headset's cameras lose it. Our first version treated a lost hand as a release and threw the dice. Now the speed at the moment of loss decides: a fast hand was throwing, but a slow one has slipped out of view, so the dice wait for it and glide back when it returns. We drew on Meta's hands-first case studies (Chess Club, Hand Physics Lab, Table Troopers) for this.
- **Teaching gestures nobody would guess.** A text hint saying "lower the dice below the table edge" is easy to miss. Now a translucent ghost hand shows each cheat where it happens, only while Shakuni is looking away, and stops once you've done it.
- **Accidental moves.** A fingertip brushing past one piece on its way to another used to move it. Choices now commit on a pinch or a short dwell, and you can take a move back by touching the piece again.

## What we're proud of

- Cheating with your hands against a character who watches your hands, using the edge of your own table. In our search we didn't find another XR version of chausar or of this dice game.
- Dice that are thrown for real and can still be loaded without looking scripted.
- Shakuni's tells are learnable, so catching him feels earned rather than random.

## What we learned

- A hand that disappears is not a hand that let go. When the input is ambiguous, the game should wait rather than guess.
- Unfamiliar gestures need to be shown, not described.
- Emulator tests prove the logic, but not the feel. Throw strength, pinch distances and comfort still need real hands.

## What's next

- **Headset testing.** So far everything is verified in the emulator. Next we need to test on Quest 3 and 3S: frame rate, real throws, tracking under real tables, different rooms, and playtests with people new to VR.
- **Review by people who know the material.** We are not scholars of the Mahabharata or of traditional chaupar, and we'd like people who are to review the rules, the wording and how the story is framed.
- More of the court, such as the Pandavas and Duryodhana watching the game, if it can be done at the same quality as Shakuni without crowding the table.
