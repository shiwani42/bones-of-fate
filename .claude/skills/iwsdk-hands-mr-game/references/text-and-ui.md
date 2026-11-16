# Spatial text and onboarding that reads well (and never clips or overlaps)

The user's most-reported defects after the character were "text abruptly cut from all sides" and "so much text overlapping". The system below fixed both. Code: `reference/runtime/text.ts` (Label, fit-to-card) and `reference/runtime/ui.ts` (Subtitles, Hint).

## Numbers (Meta `hz-immersive-designer`)
- Glyph height **≥1.0°**, aim for **1.5°** at the viewing distance (≈1.7 cm at 1 m, ≈2.6 cm at 1.5 m).
- Primary UI within **30° of gaze**, **10–20° below** eye level, ≥0.5 m away (avoid the vergence-accommodation conflict zone for reading).
- Contrast **≥4.5:1**. Clear sans-serif for body text; decorative faces for titles only.
- Captions for all speech, at most about **32 chars × 2 lines** per page.
- Hand-tracking targets ≥ 64 mm.

## Rules
1. **Fit-to-card:** when drawing text on a canvas, shrink the font until the wrapped line block fits *both* width and height inside the frame padding. Wrapping only guarantees width; two-line text then overflows and gets clipped on every side. Size cards for two lines (aspect ≈ 2.5–3).
2. **One region per kind of text:**
   - **Dialogue** (the NPC, whispers, narrator): a fixed world spot just below the speaker's face, above the far edge of the play area, facing the viewer. A speaker tag above it ("SHAKUNI", "A WHISPER"). Distinct styles: dark lacquer for dialogue, violet italic for whispers.
   - **Instructions:** a parchment card floating ~8–12 cm above the object they refer to (dice, piece, placement outline), gently bobbing. Never over the dialogue spot.
   - **Object labels** (e.g. a gong's "Strike: Cheat!"): exactly one label per object; no duplicate hints on top of them.
   - **Title and stake:** only before any dialogue starts.
   - **Numbers** (dice totals): a display face directly over the dice. Don't also repeat them as captions.
   - Status spam ("5 + 6 + 6 = 17" every frame) is removed, not restyled.
3. **Head-stabilised lazy-follow subtitles** are an option for open scenes. When used, compute forward as `(0,0,-1)` rotated by the head's world quaternion: `getWorldDirection` flips for cameras and put the bar behind a desktop camera. At a table, though, gaze-following subtitles slide over world hints when the player looks down, so anchoring dialogue in the world near the speaker worked better.
4. **Choreograph onboarding as a sequence**, never overlapping timers:
   title + stake (0.3–3.4 s) → NPC greeting → narrator rules → tip (e.g. how to move the board) → first-turn instruction anchored on the object → one-time whispers when each secret mechanic first becomes possible. A pinch skips ahead.
   Base "first time" on explicit counters (e.g. `playerTurns`), not on "has this key been shown".
5. **Copy:** imperative, one action per line, ≤ ~40 chars for hints (*"Pinch the three pasa"*, *"Pinch a glowing piece"*, *"Strike the gong to accuse"*). Explain each secret mechanic exactly once, at the moment it's possible.
6. **Fonts:** load with `<link>` plus `document.fonts.load()` and a 2.5 s timeout; fall back gracefully. Canvas2D shapes Indic scripts (uikit/troika don't). Use Mukta (sans, Devanagari, 600–700) for reading and Rozha One for display. Avoid glyphs the MSDF font lacks (`·`) in UIKitML.

## Verify
Capture the headset view at each onboarding moment (placing, title, greeting, rules, first turn, first cheat hint, accusation, win) and inspect at full resolution:
- clipped edges;
- overlaps between any two text elements;
- text over the character's face;
- legibility at the real distance.
