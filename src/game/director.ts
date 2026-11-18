import {
  BufferGeometry,
  createSystem,
  Group,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  VisibilityState,
  XRPlane,
  AssetManager,
  Mesh,
  DepthOccludable,
  type Entity,
} from '@iwsdk/core';
import { sfx } from './audio.js';
import { buildBoard, BoardView, CELL, HALF, piecePosition, SURFACE_Y } from './board.js';
import { ShadowRig } from './lighting.js';
import { createAmbience, createRoomDimmer, type Ambience, type RoomDimmer } from './ambience.js';
import { BURST_STYLES, hopDuration, hopPose, Juice } from './juice.js';
import { DIE_W, DiceSet } from './dice.js';
import { Fx } from './fx.js';
import { Hands, HandState } from './hands.js';
import {
  applyMove,
  bestMove,
  cellOf,
  cloneState,
  GameState,
  HOME,
  honestThrow,
  leadingPiece,
  legalMoves,
  loadedThrow,
  Move,
  newGame,
  PASA_FACES,
  passTurn,
  rollTotal,
  Seat,
  START,
} from './rules.js';
import { Ledger, ledgerLine, loadLedger, recordMatch, saveLedger, stakeName } from './save.js';
import { Shakuni } from './shakuni.js';
import { FONT_DISPLAY, Label, loadFonts } from './text.js';
import { Hint, Subtitles } from './ui.js';
import { Palace } from './palace.js';
import { TableDressing } from './tablecloth.js';
import { SetDressing } from './props.js';
import { GhostDemo, type GhostDemoKind } from './ghost/ghost-hand.js';
import { GoldStakes, type Owner } from './stakes.js';
import { hideBoot, setBootProgress } from './boot.js';

/**
 * The game director: one IWSDK system that owns the match.
 *
 * Phases:
 *  placing → intro → [player turn: ready → holding → flying → reveal → (caught) → choose → moving]
 *                  ↔ [Shakuni turn: throwing → flying → reveal → moving]   … → gameover
 *
 * Everything (board, dice, Shakuni, fx, labels) lives under one `anchor`
 * group placed on the real table, and all game maths is in board-local space.
 */

type Phase =
  | 'boot'
  | 'placing'
  | 'intro'
  | 'p_ready'
  | 'p_holding'
  | 'p_flying'
  | 'p_reveal'
  | 'caught'
  | 'p_choose'
  | 'moving'
  | 's_throw'
  | 's_flying'
  | 's_reveal'
  | 'accused'
  | 'handoff'
  | 'p_takeback'
  | 'gameover';

/**
 * Hand-tracking guardrails (lessons from Chess Club, Hand Physics Lab and
 * Table Troopers on Quest): never execute an action the player didn't mean.
 *  - Tracking lost while holding the dice: a fast hand was throwing (the blur
 *    lost it), so throw; a slow one slipped out of view, so the dice wait in
 *    place, glide back to the hand when it returns, or go back to the table.
 *  - Choosing a piece: hovering previews it (lift, brighter marker, tick); a
 *    pinch commits at once, a fingertip touch only after a short dwell.
 *  - A short take-back window after each choice you made.
 */
const LOST_THROW_SPEED = 0.8; // m/s: faster than this when tracking dropped = a throw
const HOLD_WAIT = 2.5; // s the dice wait for a vanished hand
const TOUCH_DWELL = 0.3; // s a fingertip must rest on a piece to choose it
const TAKEBACK_WINDOW = 2.4; // s
const TAKEBACK_REACH = 5; // s, while a hand hovers near the moved piece

const GREETINGS = [
  'Yes, yes, Prince. I see you.',
  'Wave all you like. The pasa do not care.',
  'Greetings are free. Kingdoms are not.',
];

interface CheatAct {
  kind: 'swap' | 'flip';
  seen: boolean;
}

const PLAYER_DICE_SPOT = new Vector3(0.15, 0, 0.16);
const PLAYER_COURT = new Vector3(0.145, 0, 0.15);
const SHAKUNI_COURT = new Vector3(-0.14, 0, -0.14);
const SHAKUNI_POS = new Vector3(0, 0, -0.62);
const SHAKUNI_HAND_REST = new Vector3(-0.17, 0.04, -0.42); // resting on the table by his side
const SHAKUNI_DICE_SPOT = new Vector3(-0.1, 0, -0.17); // where the dice slide to (within his reach)
const SHAKUNI_HAND_LIFT = new Vector3(-0.08, 0.2, -0.36);
const SHAKUNI_HAND_DIP = new Vector3(-0.12, -0.09, -0.36); // below the table top: clipped from view

/**
 * Instructions follow the input in use (Meta, "Hands Onboarding 101"):
 * a controller player is never told to pinch.
 */
const CONTROLLER_LINES: Partial<Record<keyof typeof LINES, string>> = {
  moveBoard: 'Tip: hold both triggers for a moment to move the board.',
  pick: 'Reach the three pasa and pull the trigger',
  throw: 'Shake them… then let go of the trigger to throw.',
  choose: 'Touch or trigger a glowing piece',
  hintFlip: 'Quick — tap a die with your controller tip to tip it over.',
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen'];
const spoken = (n: number) => {
  const w = NUMBER_WORDS[n] ?? String(n);
  return w[0].toUpperCase() + w.slice(1) + '.';
};

/**
 * The legend of the dice. Popular retellings (not the critical edition of the
 * Sabha Parva) say Shakuni's pasa were made from his father's bones and obeyed
 * him: hence "the old tellings say".
 */
const X_AXIS = new Vector3(1, 0, 0);
const LEGEND = [
  'The old tellings say Shakuni carved these pasa from his own father\'s bones.',
  'They fall as he wills. Tonight, you made him answer for it.',
];

const LINES = {
  intro: 'Welcome, Prince. Sit. The pasa are hungry.',
  rules: 'Throw, then move one piece. First piece into the centre wins.',
  moveBoard: 'Tip: pinch with both hands for a moment to move the board.',
  pick: 'Pinch the three pasa',
  throw: 'Shake them… then open your hand to throw.',
  choose: 'Pinch a glowing piece',
  hintSwap: 'He looks away… lower the dice below the table edge.',
  hintFlip: 'Quick — poke a die with one finger to tip it over.',
  hintGong: 'His hand slipped under the table! Strike the gong.',
  underTable: 'What are you doing beneath the table, Prince?',
  caughtSeen: 'CHEAT! I saw that hand, Prince!',
  caughtLuck: 'Such luck… no one is that lucky. CHEAT!',
  shakuniWin: 'Lo, I have won! Your kingdom is mine.',
  playerWin: 'Your piece reaches the centre. The kingdom is yours again!',
  accusedRight: 'Impossible! The light… betrays me.',
  accusedWrong: 'You accuse me without cause? You lose your next throw.',
  loIWon: 'Lo, I have won!',
  captureByS: 'Back to the start with you.',
  captureByP: 'A lucky throw. Nothing more.',
  hintCall: 'He named the throw before the pasa stopped rolling…',
};

export class ChausarSystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  private anchor!: Group;
  private anchorEntityReady = false;
  private devCam = 0;
  private anchorEntity!: Entity;
  private shakuniEntity!: Entity;
  private board!: BoardView;
  private dice!: DiceSet;
  private shakuni!: Shakuni;
  private fx!: Fx;
  private shadows!: ShadowRig;
  private ambience!: Ambience;
  private dimmer!: RoomDimmer;
  private juice!: Juice;
  private hands!: Hands;
  private caption!: Label;
  private whisper!: Label;
  private title!: Label;
  private totalLabel!: Label;
  private gongLabel!: Label;
  private keysLabel!: Label;
  private ledgerLabel!: Label;
  private subs!: Subtitles;
  private hint!: Hint;
  private palace!: Palace;
  private dressing!: TableDressing;
  private setDressing!: SetDressing;
  private ledger: Ledger = loadLedger();
  private statT = 0;
  private placeMarker!: LineLoop;

  private state: GameState = newGame();
  private phase: Phase = 'boot';
  private phaseT = 0;
  private time = 0;

  // player turn
  private holder: HandState | null = null;
  private underT = 0;
  private underSeenT = 0;
  private loaded = false;
  private acts: CheatAct[] = [];
  private flipCooldown = 0;
  private throwValues: number[] = [];
  private options: Move[] = [];
  private skipNextThrow = false;
  private rattleT = 0;
  private slideStart = 0;
  /** seconds since the holding hand vanished; -1 while it is tracked */
  private holdLost = -1;
  private holdBackT = 0;
  private readonly holdAnchor = new Vector3();
  private readonly holdQuat = new Quaternion();
  /** 0→1: dice glide from where they waited back into the returned hand */
  private holdResume = 1;
  private readonly holdFrom = new Vector3();
  private returnSlide = -1;
  private inReach = false;
  // choosing
  private hoverOpt = -1;
  private dwellT = 0;
  private readonly pieceLift = [[0, 0], [0, 0]];
  // take-back
  private undo: { snap: GameState; values: number[]; piece: number; gold?: number } | null = null;
  private takebackArmed = false;
  private takebackT = 0;
  private takebacksShown = 0;
  // wave at Shakuni
  private readonly waveFlips: [number[], number[]] = [[], []];
  private readonly waveSign = [0, 0];
  private waveCooldown = 0;
  private greetIdx = 0;

  // move animation
  private hop: { seat: Seat; piece: number; path: number[]; i: number; t: number; then: () => void } | null = null;

  // Shakuni turn
  private sCheat = false;
  private sSnapshot: GameState | null = null;
  private sTurnCount = 0;
  private sThrowAt = 0;
  private accuseOpen = false;
  private gongCooldown = 0;

  // captions
  private captionT = 0;
  private whisperT = 0;
  private shown = new Set<string>();

  // placement
  private placeT = 0;
  private bothPinchT = 0;
  private immersive = false;

  // input
  private keys = new Set<string>();

  // temps
  private readonly tA = new Vector3();
  private readonly tB = new Vector3();
  private readonly tC = new Vector3();
  private readonly tQ = new Quaternion();
  private readonly invQ = new Quaternion();
  private readonly invM = new Matrix4();
  private readonly headLocal = new Vector3();
  private readonly headWorld = new Vector3();
  private ghost!: GhostDemo;
  /** every asset the entrance needs has loaded (or the wait timed out) */
  private courtReady = false;
  private courtDone = 0;
  private courtTotal = 1;
  private courtWait = 0;
  private envResolve: (() => void) | null = null;
  private stakes!: GoldStakes;
  /** the total Shakuni will call out while his loaded dice are still in the air */
  private sCalled = 0;
  /** the dice legend, once per visit, on the first time you catch him */
  private legendShown = false;
  private legend: { t: number; end: number; from: Vector3; touchCd: number; spin: number; angle: number } | null = null;
  /** how this match was played, for the closing reflection */
  private readonly match = { cheats: 0, caught: 0, sCheats: 0, sExposed: 0, sMissed: 0, wrong: 0 };
  /** demos left this match per cheat (refilled by the every-third-turn reminder) */
  private readonly ghostLeft: Record<GhostDemoKind, number> = { swap: 2, flip: 2 };
  private ghostShown: GhostDemoKind | null = null;
  private ghostPreview: 0 | 1 | 2 = 0;
  /** cheats and the gong the player has used this match (unused ones get their hint again) */
  private readonly used = new Set<'swap' | 'flip' | 'gong'>();

  private openCourt(why: string): void {
    if (this.courtReady) return;
    this.courtReady = true;
    this.hint?.hide();
    hideBoot();
    if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} court ready (${why}) ${this.courtDone}/${this.courtTotal} in ${this.courtWait.toFixed(1)} s`);
  }

  /** Sweep gold across the table, and say so in the dev log. */
  private moveGold(to: Owner, n: number, why: string): number {
    const moved = this.stakes.transfer(to, n);
    if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} stakes ${why} → ${to === 0 ? 'you' : 'shakuni'} moved=${moved} you=${this.stakes.count(0)} shakuni=${this.stakes.count(1)}`);
    return moved;
  }

  /** The instruction for `key`, worded for hands or controllers. */
  private line(key: keyof typeof LINES): string {
    const hands = this.hands.both.some((h) => h.tracked && h.isHand) || !this.hands.both.some((h) => h.tracked);
    return (!hands && CONTROLLER_LINES[key]) || LINES[key];
  }

  init(): void {
    const fontsP = loadFonts().then(() => this.refreshTitle());
    this.hands = new Hands();
    this.anchor = new Group();
    this.anchor.name = 'chausar-anchor';
    this.board = buildBoard();
    this.anchor.add(this.board.root);
    this.dice = new DiceSet('dice');
    this.anchor.add(this.dice.group);
    this.dice.onImpact = (s, x) => {
      sfx.clack(s, x * 3);
      if (s > 0.6) sfx.thud(s * 0.6, x * 3);
    };
    this.shakuni = new Shakuni();
    this.shakuni.group.position.copy(SHAKUNI_POS);
    this.shakuni.attachTo(this.anchor);
    // the realistic human: seated, clipped at the table top (needs local clipping)
    this.renderer.localClippingEnabled = true;
    const humanP = this.shakuni.loadHuman(`${import.meta.env.BASE_URL}models/shakuni.glb`).then((ok) => {
      if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} human ${ok ? 'loaded' : 'FALLBACK'}`);
      if (ok) {
        this.shadows.watch(this.shakuni.group);
        this.shadows.watchSoft(3, ...this.shakuni.human!.shadowBones());
        // real-world depth hides whatever of him is behind your real table (Quest 3/3S)
        for (const obj of [this.shakuni.human!.root, this.shakuni.seat.group]) {
          const e = this.world.createTransformEntity(obj, { parent: this.shakuniEntity, persistent: true });
          e.addComponent(DepthOccludable);
        }
      }
    });
    this.shakuni.hand.position.copy(SHAKUNI_HAND_REST);
    this.shakuni.handTarget.copy(SHAKUNI_HAND_REST);
    this.shakuni.onWarn = () => {
      if (this.phase === 'p_holding' || this.phase === 'p_reveal') sfx.warn();
    };
    this.shakuni.onTurnAway = () => {
      if (this.phase === 'p_holding' && !this.shown.has('hintSwap') && !this.loaded) {
        this.say('hintSwap', LINES.hintSwap, true);
      }
    };
    this.fx = new Fx();
    this.anchor.add(this.fx.group);
    // the wager, in gold, on the right-hand margin of the table
    this.stakes = new GoldStakes();
    this.stakes.onLand = (owner) => sfx.coins(8, owner === 0 ? 0.4 : 0.6);
    this.anchor.add(this.stakes.mesh);
    // the ghost hand that shows each cheat the first times it becomes possible
    this.ghost = new GhostDemo();
    this.anchor.add(this.ghost.root);
    void this.ghost.load(import.meta.env.BASE_URL).then((ok) => {
      if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} ghost hand ${ok ? 'loaded' : 'FAILED'}`);
    });
    // Production lighting + ambience + juice (see docs/INTEGRATION-VISUALS.md)
    this.shadows = new ShadowRig(this.world);
    this.shadows.watch(
      ...this.board.pieces.flat().map((p) => p.mesh),
      ...this.dice.dice.map((d) => d.mesh),
      this.board.gongDisc,
    );
    this.ambience = createAmbience();
    this.board.root.add(this.ambience.group);
    this.juice = new Juice();
    this.board.root.add(this.juice.group);
    this.dimmer = createRoomDimmer();
    this.anchor.add(this.dimmer.mesh);
    // Text that follows Meta's comfort rules: lazy-follow subtitles + world-anchored hints
    // dialogue spot: above the far edge of the board, below Shakuni's face
    this.subs = new Subtitles(this.anchor, new Vector3(0, 0.2, -0.33));
    this.hint = new Hint(this.anchor);
    // The dice hall of Hastinapur replaces your walls (your table and floor stay real)
    this.palace = new Palace(`${import.meta.env.BASE_URL}textures/palace.jpg`);
    this.palace.mesh.rotation.y = Math.PI / 2; // centre of the hall behind Shakuni
    this.anchor.add(this.palace.mesh);
    this.dressing = new TableDressing();
    this.anchor.add(this.dressing.group);
    // 3D palace pieces in front of the painted hall (arch, pillars, lamps), if generated
    this.setDressing = new SetDressing(import.meta.env.BASE_URL);
    this.anchor.add(this.setDressing.group);
    // A real-world detail at Shakuni's side: brass goblets (Poly Haven, CC0)
    const gobletsP = AssetManager.loadGLTF(`${import.meta.env.BASE_URL}models/props/goblets.glb`, 'goblets').then((g) => {
      const o = g.scene;
      o.position.set(0.3, 0.0, -0.44);
      o.rotation.y = -0.6;
      o.scale.setScalar(0.42); // a pair of small brass cups beside him, not centrepieces
      o.traverse((c) => {
        const m = c as Mesh;
        if (m.isMesh) m.castShadow = m.receiveShadow = true;
      });
      this.anchor.add(o);
    }).catch(() => {});

    // The court appears only when everything in it has arrived: Shakuni (with his turban),
    // the hall, its reflections, the props and the fonts. No stand-ins, no pop-in.
    if (import.meta.env.DEV) (window as unknown as { __chausar: unknown }).__chausar = this; // dev inspection only
    const envP = new Promise<void>((res) => (this.envResolve = res));
    const parts: Promise<unknown>[] = [humanP, fontsP, this.palace.ready, this.setDressing.ready, gobletsP, envP];
    this.courtTotal = parts.length;
    for (const p of parts) void p.finally(() => {
      this.courtDone++;
      setBootProgress(this.courtDone / this.courtTotal);
    });
    void Promise.allSettled(parts).then(() => this.openCourt('ready'));

    this.caption = new Label(0.44, 4.2, { size: 60 });
    this.caption.mesh.position.set(0, 0.25, -0.3);
    this.anchor.add(this.caption.mesh);
    this.whisper = new Label(0.42, 5.2, {
      size: 50,
      color: '#ffe3a3',
      background: 'rgba(30,14,40,0.75)',
      border: 'rgba(180,140,255,0.8)',
    });
    this.whisper.mesh.position.set(0, 0.165, -0.27);
    this.anchor.add(this.whisper.mesh);
    this.title = new Label(0.5, 3.2, {
      font: FONT_DISPLAY,
      size: 120,
      background: null,
      border: null,
      color: '#ffd77a',
    });
    this.title.mesh.position.set(0, 0.34, -0.06); // above the board, in front of Shakuni
    this.anchor.add(this.title.mesh);
    this.totalLabel = new Label(0.07, 1.6, {
      font: FONT_DISPLAY,
      size: 300,
      background: null,
      border: null,
      color: '#fff1c9',
      padding: 0,
    }, 512);
    this.anchor.add(this.totalLabel.mesh);
    this.gongLabel = new Label(0.14, 3, { size: 70, background: 'rgba(60,20,0,0.75)' }, 512);
    this.gongLabel.mesh.position.copy(this.board.gong.position).add(this.tA.set(0, 0.23, 0));
    this.anchor.add(this.gongLabel.mesh);
    this.keysLabel = new Label(0.5, 9, { size: 34, background: 'rgba(0,0,0,0.55)', border: null });
    this.keysLabel.mesh.position.set(0, 0.002 + SURFACE_Y, HALF + 0.05);
    this.keysLabel.mesh.rotation.x = -Math.PI / 2.6;
    this.keysLabel.setText('Desktop keys: Space throw · U load (swap) · F flip die · 1/2 pick piece · G gong · N new game');
    this.anchor.add(this.keysLabel.mesh);
    this.ledgerLabel = new Label(0.46, 9, { size: 40, background: 'rgba(20,8,4,0.6)', border: null, color: '#f6deb0' });
    this.ledgerLabel.mesh.position.set(0, 0.255, -0.06);
    this.anchor.add(this.ledgerLabel.mesh);
    this.ledgerLabel.opacity = 0;
    this.caption.opacity = 0;
    this.whisper.opacity = 0;
    this.totalLabel.opacity = 0;
    this.gongLabel.opacity = 0;

    // placement preview: the cross outline in gold
    const a = 1.5 * CELL + 0.012;
    const b = HALF + 0.012;
    const pts = [
      [-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b],
      [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a],
    ].map(([x, z]) => new Vector3(x, 0.002, z));
    this.placeMarker = new LineLoop(
      new BufferGeometry().setFromPoints(pts),
      new LineBasicMaterial({ color: '#ffd277', toneMapped: false }),
    );
    this.placeMarker.visible = false;

    this.anchorEntity = this.world.createTransformEntity(this.anchor, { persistent: true });
    // Shakuni is an entity under the anchor so the real table can depth-occlude him
    this.shakuniEntity = this.world.createTransformEntity(this.shakuni.group, { parent: this.anchorEntity, persistent: true });
    this.world.createTransformEntity(this.placeMarker as unknown as Object3D, { persistent: true });
    this.anchorEntityReady = true;

    this.resetMatch();
    this.placeDesktop();
    this.setPhase('intro');
    this.introEnd = 99;

    const onKey = (e: KeyboardEvent) => this.keys.add(e.key.toLowerCase());
    const unlock = () => {
      sfx.unlock();
      sfx.startDrone();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', onKey),
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
      this.world.visibilityState.subscribe((v) => this.onVisibility(v)),
    );
    // Expose a tiny debug handle for the emulator / CLI.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).chausar = this;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  private onVisibility(v: VisibilityState): void {
    const wasImmersive = this.immersive;
    this.immersive = v !== VisibilityState.NonImmersive;
    const panel = this.world.getSceneObject?.('welcome-panel');
    if (panel) panel.visible = !this.immersive;
    if (v === VisibilityState.Visible) {
      try {
        this.world.session?.updateTargetFrameRate?.(72)?.catch?.(() => {});
        this.renderer.xr.setFoveation(0.5);
      } catch {
        /* optional */
      }
      sfx.unlock();
      sfx.startDrone();
    }
    if (this.immersive && !wasImmersive) {
      this.keysLabel.opacity = 0;
      this.anchor.visible = false;
      this.placeT = 0;
      this.setPhase('placing');
    } else if (!this.immersive && wasImmersive) {
      this.keysLabel.opacity = 1;
      this.placeDesktop();
      this.anchor.visible = true;
      if (this.phase === 'placing') this.setPhase('intro');
    }
  }

  /** Royal cloth over the real table (its detected outline), or a default-size one. */
  private dressTable(detected: boolean): void {
    this.anchor.updateWorldMatrix(true, false);
    const h = Math.max(0.3, this.anchor.position.y);
    let corners: Vector3[];
    if (detected) {
      corners = this.tableHit.corners.map((c) => this.anchor.worldToLocal(c.clone()).setY(0));
    } else {
      corners = [new Vector3(-0.52, 0, -0.5), new Vector3(0.52, 0, -0.5), new Vector3(0.52, 0, 0.36), new Vector3(-0.52, 0, 0.36)];
    }
    this.dressing.build(corners, Math.min(0.24, h - 0.08), !this.immersive, h);
  }

  private placeDesktop(): void {
    this.anchor.position.set(0, 0.72, -0.55);
    this.anchor.quaternion.identity();
    this.anchor.visible = true;
    if (this.dressing) this.dressTable(false);
  }

  private resetMatch(): void {
    this.state = newGame();
    this.used.clear();
    this.ghostLeft.swap = this.ghostLeft.flip = 2;
    this.stakes?.reset();
    Object.assign(this.match, { cheats: 0, caught: 0, sCheats: 0, sExposed: 0, sMissed: 0, wrong: 0 });
    this.skipNextThrow = false;
    this.sTurnCount = 0;
    this.shakuni.suspicion = 20;
    this.accuseOpen = false;
    this.fx.clearPetals();
    this.ambience?.setMood('calm');
    this.dimmer?.fadeTo(1, 1.5);
    this.palace?.fadeTo(1);
    this.layoutPieces(true);
    this.dice.placeAt(PLAYER_DICE_SPOT, 0.4);
    this.totalLabel.opacity = 0;
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.phaseOnce.clear();
    this.hint?.hide();
    if (p === 'intro') this.introEnd = 99;
    if (import.meta.env.DEV) {
      const w = this.anchor ? this.anchor.position.toArray().map((v) => +v.toFixed(3)) : [];
      const dw = this.dice ? this.dice.dice.map((d) => this.anchor.localToWorld(d.pos.clone()).toArray().map((v) => +v.toFixed(3))) : [];
      console.info(`[chausar] #${this.logTag()} ${p} turn=${this.state.turn} pos=${JSON.stringify(this.state.pos)} dice=${this.dice?.values ?? ''} anchor=${JSON.stringify(w)} yaw=${this.anchor?.rotation.y.toFixed(3)} diceWorld=${JSON.stringify(dw)}`);
    }
  }

  private logSeq = 0;
  private readonly logId = Math.random().toString(36).slice(2, 6);
  /** Dev-log tag: per-page-load id + sequence number (keeps test logs unambiguous). */
  private logTag(): string {
    return `${this.logId}.${++this.logSeq}`;
  }

  private readonly phaseOnce = new Set<string>();
  /** True exactly once per phase entry for `key`. */
  private once(key: string): boolean {
    if (this.phaseOnce.has(key)) return false;
    this.phaseOnce.add(key);
    return true;
  }

  private refreshTitle(): void {
    this.title.setText('Bones of Fate · चौसर');
  }

  /** Show a caption (or whisper) for a few seconds. `once` keys show only once per session. */
  /**
   * Dialogue → head-stabilised subtitles (Shakuni / a whisper / the narrator).
   * `key` makes a line show once per session. (`seconds` kept for call-site readability;
   * page timing comes from the text length.)
   */
  private say(key: string, text: string, whisper = false, speak = false, _seconds = 4.5): void {
    if (key && this.shown.has(key)) return;
    if (key) this.shown.add(key);
    const clean = text.replace(/^\(whisper\)\s*/, '');
    if (whisper) {
      this.subs.say(clean, 'whisper');
      sfx.whisper?.();
    } else if (speak) {
      this.subs.say(clean, 'shakuni');
      sfx.speak(clean.replace(/[()]/g, ''));
      this.shakuni.talk(clean);
    } else {
      this.subs.say(clean, 'narrator');
    }
  }

  // ───────────────────────── main loop ─────────────────────────

  update(delta: number, time: number): void {
    // reflections come from the palace itself: keep the IBL (scene JSON: palace_env.jpg, a desaturated copy)
    // turned with the painted hall, whose centre sits behind Shakuni
    if (this.anchor) this.world.scene.environmentRotation.y = this.anchor.rotation.y + Math.PI / 2;
    if (this.envResolve && this.world.scene.environment) {
      this.envResolve(); // the palace reflections (IBL) are processed
      this.envResolve = null;
    }
    if (!this.anchorEntityReady) return;
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) return;
    const dt = Math.min(delta, 1 / 20);
    if (!this.courtReady) {
      this.courtWait += dt;
      if (this.courtWait > 30) this.openCourt('timeout'); // a slow asset must never hang the game
    }
    this.time = time;
    this.phaseT += dt;

    this.updateHands(dt);
    this.updateLocalHead();
    this.shakuni.setTableHeight(this.anchor.position.y); // floor is y=0 (local-floor)
    this.handleGlobalKeys();
    this.checkReplace(dt);

    switch (this.phase) {
      case 'placing': this.updatePlacing(dt); break;
      case 'intro': this.updateIntro(); break;
      case 'p_ready': this.updateReady(dt); break;
      case 'p_holding': this.updateHolding(dt); break;
      case 'p_flying': this.updatePFlying(); break;
      case 'p_reveal': this.updatePReveal(dt); break;
      case 'caught': this.updateCaught(); break;
      case 'p_choose': this.updateChoose(dt); break;
      case 'p_takeback': this.updateTakeback(dt); break;
      case 'moving': break;
      case 's_throw': this.updateSThrow(dt); break;
      case 's_flying': this.updateSFlying(); break;
      case 's_reveal': this.updateSReveal(); break;
      case 'accused': this.updateAccused(dt); break;
      case 'handoff': this.updateHandoff(); break;
      case 'gameover': this.updateGameOver(); break;
      default: break;
    }

    this.updateGong(dt);
    this.updateWave(dt);
    this.updateGhost(dt, time);
    this.stakes.update(dt);
    if (this.stakes.moving) this.shadows.requestShadowUpdate(1);
    this.updateHop(dt);
    this.updatePieces(dt);
    this.dice.update(dt);
    this.fx.update(dt);
    this.juice.update(dt);
    this.ambience.update(dt, time);
    this.dimmer.update(dt);
    this.palace.setMixedReality(this.immersive);
    this.palace.mesh.position.copy(this.headLocal); // centred on the viewer: no parallax, horizon at eye level
    this.palace.update(dt);
    this.setDressing.setTableHeight(this.anchor.position.y);
    this.setDressing.setReveal(this.palace.mesh.visible ? 1 : 0);
    this.shadows.update(this.board.root);
    this.updateShakuniLook();
    this.shakuni.update(dt, time);
    this.updateLabels(dt);
    if (import.meta.env.DEV) {
      this.statT += dt;
      if (this.statT > 5) {
        this.statT = 0;
        const r = this.renderer.info.render;
        console.info(`[chausar] #${this.logTag()} stats calls=${r.calls} tris=${r.triangles} phase=${this.phase}`);
      }
    }

    // board shake from the crack
    const sh = this.fx.shake;
    this.board.root.position.set(
      Math.sin(time * 61) * 0.003 * sh,
      0,
      Math.cos(time * 53) * 0.003 * sh,
    );
    if (import.meta.env.DEV && this.devCam && !this.immersive) {
      const views: [number, number, number, number, number, number][] = [
        [0, 0, 0, 0, 0, 0],
        [0.12, 0.44, -0.12, 0, 0.4, -0.62], // face close-up
        [0.35, 0.35, 0.35, 0, 0.05, -0.62], // seated body + gaddi
        [0.95, 0.25, -0.62, 0, 0.1, -0.62], // side profile
        [1.1, 0.45, 0.1, 0.55, -0.72, -0.95], // set: lamp and gaddi bases with their floor shadows
      ];
      const [px, py, pz, lx, ly, lz] = views[this.devCam];
      this.camera.position.copy(this.anchor.localToWorld(this.tA.set(px, py, pz)));
      this.camera.lookAt(this.anchor.localToWorld(this.tB.set(lx, ly, lz)));
    }
    this.keys.clear();
  }

  // ───────────────────────── input ─────────────────────────

  private updateHands(dt: number): void {
    const frame = this.xrFrame as XRFrame | undefined;
    const ref = this.renderer.xr.getReferenceSpace();
    const xr = this.input.xr;
    this.player.updateWorldMatrix(true, false);
    const now = performance.now();
    for (const h of this.hands.both) {
      const src = this.immersive ? xr.getPrimaryInputSource(h.side) : undefined;
      let sel = false;
      try {
        sel = xr.getSelectState(h.side).active;
      } catch {
        sel = false;
      }
      h.update(frame, ref, src, this.player.matrixWorld, sel, now, dt);
    }
  }

  private updateLocalHead(): void {
    // Outside XR the render camera, not the XR head, is the viewer.
    (this.immersive ? this.player.head : this.camera).getWorldPosition(this.headWorld);
    this.anchor.updateWorldMatrix(true, false);
    this.invM.copy(this.anchor.matrixWorld).invert();
    this.headLocal.copy(this.headWorld).applyMatrix4(this.invM);
    this.invQ.copy(this.anchor.quaternion).invert();
  }

  private toLocal(world: Vector3, out: Vector3): Vector3 {
    return out.copy(world).applyMatrix4(this.invM);
  }

  private handleGlobalKeys(): void {
    if (this.keys.has('n')) {
      this.resetMatch();
      this.startTurn(0);
    }
    if (this.keys.has('m')) sfx.muted = !sfx.muted;
    if (import.meta.env.DEV) {
      // test hooks: k = Shakuni looks away, w/l = put a piece near home, o = split your pieces (two choices)
      if (this.keys.has('k')) this.shakuni.setGaze('away', 6);
      if (this.keys.has('w')) { this.state.pos[0][0] = HOME - 4; this.layoutPieces(true); }
      if (this.keys.has('l')) { this.state.pos[1][0] = HOME - 4; this.layoutPieces(true); }
      if (this.keys.has('o')) { this.state.pos[0][0] = 3; this.state.pos[0][1] = START; this.layoutPieces(true); }
      if (this.keys.has('x')) this.triggerCrack(0);
      if (this.keys.has('v')) this.finish(0);
      // review cameras: c cycles face close-up / seated body / side profile / set / off
      if (this.keys.has('c')) this.devCam = (this.devCam + 1) % 5;
      // 5 / 6 = a stack of gold to Shakuni / to you; 7 = play the dice legend now
      if (this.keys.has('5')) this.moveGold(1, 1, 'dev');
      if (this.keys.has('6')) this.moveGold(0, 1, 'dev');
      if (this.keys.has('7')) { this.beginLegend(); this.setPhase('accused'); }
      // 8 = pin the ghost-hand demo for review: swap → flip → off
      if (this.keys.has('8')) this.ghostPreview = ((this.ghostPreview + 1) % 3) as 0 | 1 | 2;
      if (this.keys.has('b')) this.shakuni.strokeBeard();
      if (this.keys.has('h')) this.shakuni.laughT = 2;
      if (this.keys.has('j')) this.shakuni.angerT = 2;
      if (this.keys.has('e') && this.shakuni.human) this.shakuni.human.neutral = !this.shakuni.human.neutral;
    }
  }

  /** Both hands pinching for 1.5 s → move the board. */
  private checkReplace(dt: number): void {
    if (!this.immersive || this.phase === 'placing' || this.phase === 'p_holding') {
      this.bothPinchT = 0;
      return;
    }
    if (this.hands.left.pinching && this.hands.right.pinching) {
      this.bothPinchT += dt;
      if (this.bothPinchT > 1.5) {
        this.bothPinchT = 0;
        this.anchor.visible = false;
        this.placeT = 0;
        this.setPhase('placing');
      }
    } else this.bothPinchT = 0;
  }

  // ───────────────────────── placement ─────────────────────────

  private findTable(out: { pos: Vector3; ok: boolean; corners: Vector3[] }): void {
    out.ok = false;
    let best = Infinity;
    for (const e of this.queries.planes.entities) {
      const plane = e.getValue(XRPlane, '_plane') as XRPlane | undefined;
      const obj = e.object3D;
      if (!plane || !obj) continue;
      if (plane.orientation !== 'horizontal') continue;
      const label = (plane as unknown as { semanticLabel?: string }).semanticLabel;
      obj.updateWorldMatrix(true, false);
      const y = obj.getWorldPosition(this.tA).y;
      const isTable = label === 'table' || label === 'desk' || (!label && y > 0.45 && y < 1.1);
      if (!isTable) continue;
      // bbox of the polygon in world space
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of plane.polygon) {
        this.tB.set(p.x, p.y, p.z);
        obj.localToWorld(this.tB);
        minX = Math.min(minX, this.tB.x); maxX = Math.max(maxX, this.tB.x);
        minZ = Math.min(minZ, this.tB.z); maxZ = Math.max(maxZ, this.tB.z);
      }
      const m = 0.24;
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const px = maxX - minX > 2 * m ? Math.min(maxX - m, Math.max(minX + m, this.headWorld.x)) : cx;
      const pz = maxZ - minZ > 2 * m ? Math.min(maxZ - m, Math.max(minZ + m, this.headWorld.z)) : cz;
      const d = Math.hypot(px - this.headWorld.x, pz - this.headWorld.z);
      // only tables roughly in front of you: turn toward your table to pick it
      const fwd = this.tB.set(0, 0, -1).applyQuaternion(this.player.head.getWorldQuaternion(this.tQ));
      const ang = Math.acos(Math.max(-1, Math.min(1, (fwd.x * (px - this.headWorld.x) + fwd.z * (pz - this.headWorld.z)) / (Math.hypot(fwd.x, fwd.z) * d + 1e-6))));
      if (ang > 1.2) continue;
      if (d < best && d < 2.2) {
        best = d;
        out.pos.set(px, y, pz);
        out.ok = true;
        // the table's own rectangle (plane-local bbox → world), for the royal cloth
        let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity;
        for (const q of plane.polygon) {
          lx0 = Math.min(lx0, q.x); lx1 = Math.max(lx1, q.x);
          lz0 = Math.min(lz0, q.z); lz1 = Math.max(lz1, q.z);
        }
        [[lx0, lz0], [lx1, lz0], [lx1, lz1], [lx0, lz1]].forEach(([x, z], i) =>
          obj.localToWorld(out.corners[i].set(x, 0, z)),
        );
      }
    }
    if (out.ok) {
      // keep the near edge a comfortable distance from the chest
      const dx = out.pos.x - this.headWorld.x;
      const dz = out.pos.z - this.headWorld.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.42) {
        const k = 0.42 / Math.max(d, 1e-3);
        out.pos.x = this.headWorld.x + dx * k;
        out.pos.z = this.headWorld.z + dz * k;
      }
    }
  }

  private readonly tableHit = { pos: new Vector3(), ok: false, corners: [new Vector3(), new Vector3(), new Vector3(), new Vector3()] };

  private updatePlacing(dt: number): void {
    this.placeT += dt;
    this.findTable(this.tableHit);
    const hand = this.hands.right.tracked ? this.hands.right : this.hands.left.tracked ? this.hands.left : null;
    const pos = this.tC;
    let ok = false;
    if (this.tableHit.ok) {
      if (import.meta.env.DEV && this.once('tablelog')) console.info(`[chausar] #${this.logTag()} table at ${this.tableHit.pos.toArray().map((v) => v.toFixed(2))}`);
      pos.copy(this.tableHit.pos);
      ok = true;
      this.hint.show('Table found — pinch to set the board here', this.tB.set(0, 0, 0), 0.12);
    } else if (hand) {
      // board centre ~22 cm beyond the pinch, at hand height
      const fx = hand.pinchPoint.x - this.headWorld.x;
      const fz = hand.pinchPoint.z - this.headWorld.z;
      const len = Math.hypot(fx, fz) || 1;
      pos.set(
        hand.pinchPoint.x + (fx / len) * 0.2,
        hand.pinchPoint.y - 0.03,
        hand.pinchPoint.z + (fz / len) * 0.2,
      );
      ok = true;
      this.hint.show('Hold your hand just above your table, then pinch', this.tB.set(0, 0, 0), 0.12);
    } else {
      // no table, no hands yet: a virtual table spot in front
      this.tA.set(0, 0, -0.55).applyQuaternion(this.player.head.getWorldQuaternion(this.tQ));
      pos.set(this.headWorld.x + this.tA.x, this.headWorld.y - 0.5, this.headWorld.z + this.tA.z);
      ok = this.placeT > 6;
    }
    const yaw = Math.atan2(this.headWorld.x - pos.x, this.headWorld.z - pos.z);
    this.placeMarker.visible = true;
    this.dimmer.setAmount(0);
    this.palace.fadeTo(0);
    this.placeMarker.position.copy(pos);
    this.placeMarker.rotation.set(0, yaw, 0);
    // show the caption floating at the marker
    this.anchor.visible = true;
    this.board.root.visible = false;
    this.dice.group.visible = false;
    this.dressing.group.visible = false;
    this.shakuni.setFade(0);
    this.anchor.position.copy(pos);
    this.anchor.rotation.set(0, yaw, 0);

    const pinched = this.hands.left.pinchStarted || this.hands.right.pinchStarted || this.keys.has(' ');
    if (ok && pinched && this.placeT > 0.6) {
      this.placeMarker.visible = false;
      this.board.root.visible = true;
      this.dice.group.visible = true;
      this.dressTable(this.tableHit.ok);
      sfx.gong();
      this.setPhase('intro');
    }
  }

  // ───────────────────────── intro ─────────────────────────

  private updateIntro(): void {
    if (!this.courtReady) {
      // hold the entrance at its first frame until the court has arrived
      this.phaseT = 0;
      this.board.root.visible = false;
      this.title.opacity = 0;
      this.ledgerLabel.opacity = 0;
      this.shakuni.setFade(0);
      if (this.immersive) this.hint.show(`Preparing the court…  ${Math.round((100 * this.courtDone) / this.courtTotal)}%`, this.tB.set(0, 0, 0), 0.12);
      return;
    }
    const t = this.phaseT;
    // board rises out of the table
    const e = Math.min(1, t / 1.4);
    const back = 1 + 2.2 * Math.pow(e - 1, 3) + 1.2 * Math.pow(e - 1, 2);
    this.board.root.scale.set(Math.max(0.01, back), Math.max(0.01, e), Math.max(0.01, back));
    this.board.root.visible = true;
    if (this.once('burst')) {
      this.fx.burst(this.tA.set(0, 0, 0), 80, 0.5);
      sfx.thud(1);
    }
    this.shakuni.setFade(Math.min(1, Math.max(0, (t - 0.8) / 1.2)));
    if (t > 0.8 && this.once('entrance')) {
      // the room dims to a lamp-lit court as Shakuni materialises
      if (this.immersive) this.dimmer.fadeTo(1, 2.0);
      this.palace.fadeTo(1);
      sfx.dim(true);
      this.ambience.setMood('tense');
      this.ambience.flare(0.8);
    }
    // Choreography (no overlaps): title + stake 0.3–3.4 s → Shakuni speaks → rules → your turn.
    this.title.opacity = t < 0.3 ? 0 : t < 3.0 ? Math.min(1, (t - 0.3) / 0.6) : Math.max(0, 1 - (t - 3.0) / 0.5);
    this.ledgerLabel.setText(ledgerLine(this.ledger));
    this.ledgerLabel.opacity = this.title.opacity;
    if (t > 3.6 && this.once('stake')) {
      this.introEnd = 3.6 + this.subs.say(`${LINES.intro} Today I wager ${stakeName(this.ledger)}.`, 'shakuni');
      sfx.speak(`${LINES.intro} Today I wager ${stakeName(this.ledger)}.`);
      this.shakuni.talk(LINES.intro);
      this.introEnd += this.subs.say(LINES.rules, 'narrator');
      if (this.immersive) this.introEnd += this.subs.say(this.line('moveBoard'), 'narrator') * 0.5;
      this.shown.add('rules');
    }
    const skip = t > 3.6 && (this.hands.left.pinchStarted || this.hands.right.pinchStarted || this.keys.has(' '));
    if ((t > 3.6 && t > this.introEnd) || skip) {
      this.board.root.scale.set(1, 1, 1);
      this.shakuni.setFade(1);
      this.title.opacity = 0;
      this.ledgerLabel.opacity = 0;
      this.startTurn(0);
    }
  }

  // ───────────────────────── turns ─────────────────────────

  private startTurn(seat: Seat): void {
    this.state.turn = seat;
    this.totalLabel.opacity = 0;
    if (seat === 0) {
      this.ambience.setMood('calm');
      // the accusation window stays open until you pick up the dice
      if (this.skipNextThrow) {
        this.skipNextThrow = false;
        this.say('', 'You forfeit this throw.', false, false, 2.5);
        passTurn(this.state);
        this.setPhase('handoff');
        return;
      }
      this.holder = null;
      this.holdLost = -1;
      this.returnSlide = -1;
      this.inReach = false;
      this.underT = 0;
      this.underSeenT = 0;
      this.loaded = false;
      this.acts = [];
      this.dice.dice.forEach((d) => d.setGlow(0));
      this.setPhase('p_ready');
      this.shakuni.cycling = false;
      this.playerTurns++;
      this.pickHintText = this.playerTurns <= 1 ? this.line('pick') : 'Your throw';
      // contextual reminders: every third turn, re-offer the hint for a trick not yet tried
      if (this.playerTurns > 1 && this.playerTurns % 3 === 1) {
        if (!this.used.has('swap')) { this.shown.delete('hintSwap'); this.ghostLeft.swap = Math.max(this.ghostLeft.swap, 1); }
        if (!this.used.has('flip')) { this.shown.delete('hintFlip'); this.ghostLeft.flip = Math.max(this.ghostLeft.flip, 1); }
        if (!this.used.has('gong')) this.shown.delete('hintGong');
      }
    } else {
      this.beginShakuniTurn();
    }
  }

  // ── player

  private nearestDieDist(p: Vector3): number {
    let d = Infinity;
    for (const die of this.dice.dice) d = Math.min(d, die.pos.distanceTo(p));
    return d;
  }

  private pickHintText = '';
  private introEnd = 99;
  private playerTurns = 0;

  private updateReady(dt: number): void {
    // dice coming back to the table after a cancelled hold
    if (this.returnSlide >= 0) {
      this.returnSlide = Math.min(1, this.returnSlide + dt / 0.45);
      const e = this.returnSlide;
      this.dice.updateSlide(e * e * (3 - 2 * e));
      if (e >= 1) this.returnSlide = -1;
      else return;
    }
    // a short "Your throw" later on, but the full instruction again if nothing happens for 12 s
    const stuck = this.phaseT > 12;
    if (this.phaseT < (this.pickHintText === 'Your throw' ? 3 : 60) || stuck) {
      let cx = 0, cz = 0;
      for (const d of this.dice.dice) { cx += d.pos.x / 3; cz += d.pos.z / 3; }
      this.hint.show(stuck && this.pickHintText === 'Your throw' ? this.line('pick') : this.pickHintText, this.tB.set(cx, SURFACE_Y, cz), 0.1);
    } else this.hint.hide();
    // a hand within grabbing range: the dice brighten and tick, so you know a pinch will take them
    let reach: HandState | null = null;
    for (const h of this.hands.both) {
      if (h.tracked && this.nearestDieDist(this.toLocal(h.pinchPoint, this.tA)) < 0.07) reach = h;
    }
    if (reach && !this.inReach) {
      sfx.tap(0, 1.5);
      reach.buzz(0.2, 20);
    }
    this.inReach = !!reach;
    // gentle pulse so the dice say "pick me up"
    const pulse = reach ? 0.55 : 0.15 + 0.15 * Math.sin(this.time * 4);
    this.dice.dice.forEach((d) => d.setGlow(pulse, reach ? '#ffe08a' : '#ffcc55'));
    for (const h of this.hands.both) {
      if (!h.pinchStarted) continue;
      const p = this.toLocal(h.pinchPoint, this.tA);
      if (this.nearestDieDist(p) < 0.07) {
        this.holder = h;
        this.holdLost = -1;
        this.holdResume = 1;
        this.inReach = false;
        this.accuseOpen = false;
        this.dice.dice.forEach((d) => d.setGlow(this.loaded ? 0.6 : 0, '#ffcf4a'));
        sfx.rattle();
        h.buzz(0.4, 40);
        this.shakuni.cycling = true;
        this.shakuni.setGaze('watch', 1.2 + Math.random());
        if (!this.shown.has('throw')) this.say('throw', this.line('throw'), false, false, 4);
        this.setPhase('p_holding');
        return;
      }
    }
    if (this.keys.has('u') && !this.loaded) {
      this.loaded = true;
      this.acts.push({ kind: 'swap', seen: this.shakuni.watching });
      sfx.sparkle();
    }
    if (this.keys.has(' ')) {
      // desktop: auto-throw from above the player's court
      this.accuseOpen = false;
      this.dice.dice.forEach((d) => d.setGlow(0));
      this.tA.set(0.12, 0.25, 0.3);
      this.dice.holdAt(this.tA, this.tQ.identity(), this.time, 0);
      this.throwFromHand(this.tA, this.tB.set(0, 0.2, -1.2), 0);
    }
  }

  private updateHolding(dt: number): void {
    const h = this.holder!;
    if (this.holdLost >= 0) {
      this.updateHoldLost(dt, h);
      return;
    }
    if (!h.tracked && !this.keys.has(' ')) {
      // pinchPoint/velocity still hold the last good sample
      if (h.lostSpeed > LOST_THROW_SPEED) {
        if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} hold lost at ${h.lostSpeed.toFixed(2)} m/s → throw`);
        this.tB.copy(h.velocity).applyQuaternion(this.invQ);
        this.throwFromHand(this.holdAnchor, this.tB, h.lostSpeed);
      } else {
        if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} hold lost at ${h.lostSpeed.toFixed(2)} m/s → dice wait`);
        this.holdLost = 0;
        this.holdBackT = 0;
      }
      return;
    }
    const anchor = this.toLocal(h.pinchPoint, this.tA);
    this.tQ.copy(this.invQ).multiply(h.palmQuat);
    if (this.holdResume < 1) {
      // glide from where the dice waited back into the hand (never snap)
      this.holdResume = Math.min(1, this.holdResume + dt / 0.22);
      const e = this.holdResume;
      anchor.lerpVectors(this.holdFrom, anchor, e * e * (3 - 2 * e));
    }
    this.holdAnchor.copy(anchor);
    this.holdQuat.copy(this.tQ);
    const speed = h.velocity.length();
    this.dice.holdAt(anchor, this.tQ, this.time, Math.min(1, speed * 0.8));
    this.rattleT -= dt;
    if (speed > 0.5 && this.rattleT <= 0) {
      sfx.rattle();
      this.rattleT = 0.12;
    }
    this.shakuni.lookTarget.copy(anchor);
    this.trackSwap(anchor.y, dt);

    if (this.keys.has('u') && !this.loaded) {
      this.loaded = true;
      this.acts.push({ kind: 'swap', seen: this.shakuni.watching });
      sfx.sparkle();
    }

    if (h.pinchEnded || this.keys.has(' ')) {
      this.tB.copy(h.velocity).applyQuaternion(this.invQ);
      this.throwFromHand(anchor, this.tB, speed);
    }
  }

  /** The holding hand is out of view: the dice wait where they were. */
  private updateHoldLost(dt: number, h: HandState): void {
    this.holdLost += dt;
    // cameras often lose a hand below the table edge: the swap keeps counting
    this.trackSwap(this.holdAnchor.y, dt);
    const warn = 0.25 + 0.2 * Math.sin(this.time * 7);
    if (!this.loaded) this.dice.dice.forEach((d) => d.setGlow(warn, '#ff7a4a'));
    if (this.holdLost > 0.6) this.hint.show('Show your hand again — the dice will wait', this.holdAnchor, 0.08);
    if (h.tracked) {
      const p = this.toLocal(h.pinchPoint, this.tA);
      if (h.pinching && p.distanceTo(this.holdAnchor) < 0.3) {
        if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} hold resumed after ${this.holdLost.toFixed(2)} s`);
        this.holdLost = -1;
        this.holdResume = 0;
        this.holdFrom.copy(this.holdAnchor);
        this.hint.hide();
        this.dice.dice.forEach((d) => d.setGlow(this.loaded ? 0.6 : 0, '#ffcf4a'));
        sfx.rattle();
        return;
      }
      // back in view with the fingers open: you let go while unseen. Don't guess a throw.
      this.holdBackT += dt;
      if (this.holdBackT > 0.3) this.cancelHold('released out of view');
      return;
    }
    if (this.holdLost > HOLD_WAIT) this.cancelHold('timeout');
  }

  /** Abandon a hold without throwing: the dice slide back to your side of the board. */
  private cancelHold(why: string): void {
    if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} hold cancelled (${why})`);
    this.holder = null;
    this.holdLost = -1;
    this.hint.hide();
    this.dice.dice.forEach((d) => d.setGlow(0));
    this.dice.beginSlide(PLAYER_DICE_SPOT, 0.4);
    this.returnSlide = 0;
    this.pickHintText = 'Pick the dice up again';
    sfx.tap(0, 0.8);
    this.setPhase('p_ready'); // loaded / acts are kept: a swap already made stays made
  }

  /** Cheat 1: the under-the-table swap. */
  private trackSwap(anchorY: number, dt: number): void {
    if (anchorY < -0.04) {
      this.underT += dt;
      if (this.shakuni.watching) this.underSeenT += dt;
      if (this.underT > 0.5 && !this.loaded) {
        this.loaded = true;
        this.acts.push({ kind: 'swap', seen: this.underSeenT > 0.25 });
        this.used.add('swap');
        sfx.sparkle();
        this.dice.dice.forEach((d) => d.setGlow(0.9, '#ffcf4a'));
      }
      if (this.loaded && this.shakuni.watching && this.underSeenT > 0.25) {
        const act = this.acts.find((a) => a.kind === 'swap');
        if (act) act.seen = true;
      }
      if (this.underT > 2.8 && !this.shown.has('under')) {
        this.say('under', LINES.underTable, false, true, 3);
        this.shakuni.stare(3);
      }
    } else {
      this.underT = 0;
      this.underSeenT = 0;
      if (this.loaded) this.dice.dice.forEach((d) => d.setGlow(Math.max(0, d.glowMats[0].emissiveIntensity - dt * 1.5)));
    }
  }

  /** Release the player's dice toward their court with gentle aim assist. */
  private throwFromHand(from: Vector3, handVelLocal: Vector3, speed: number): void {
    const start = this.tC.copy(from);
    start.y = Math.max(start.y, SURFACE_Y + 0.05);
    this.dice.dice.forEach((d, i) => {
      d.pos.y = Math.max(d.pos.y, SURFACE_Y + 0.04 + i * 0.002);
    });
    const target = this.tA.copy(PLAYER_COURT);
    // land a little short: bars roll on after touching down
    target.x += (start.x - target.x) * 0.15;
    target.z += (start.z - target.z) * 0.25;
    // the hand's direction nudges the landing spot within the court
    target.x += Math.max(-0.05, Math.min(0.05, handVelLocal.x * 0.04));
    target.z += Math.max(-0.05, Math.min(0.05, handVelLocal.z * 0.04));
    const v = this.ballistic(start, target, 0.42);
    const forced = this.loaded
      ? loadedThrow(this.state, 0).map((f) => PASA_FACES.indexOf(f as 1))
      : null;
    this.dice.release(v, 14 + speed * 6, forced);
    sfx.whoosh();
    this.holder?.buzz(0.7, 60);
    this.holder = null;
    this.holdLost = -1;
    this.setPhase('p_flying');
  }

  private ballistic(from: Vector3, to: Vector3, t: number): Vector3 {
    const g = -9.81;
    return this.tB.set(
      (to.x - from.x) / t,
      (to.y + DIE_W - from.y - 0.5 * g * t * t) / t,
      (to.z - from.z) / t,
    );
  }

  private updatePFlying(): void {
    if (this.dice.allRest || this.phaseT > 4) {
      this.throwValues = this.dice.values;
      this.flipCooldown = 0.3;
      this.setPhase('p_reveal');
    }
  }

  private showTotal(values: number[]): void {
    const total = rollTotal(values);
    this.totalLabel.setText(String(total));
    this.totalLabel.opacity = 1;
    let cx = 0, cz = 0;
    for (const d of this.dice.dice) {
      cx += d.pos.x / 3;
      cz += d.pos.z / 3;
    }
    this.totalLabel.mesh.position.set(cx, SURFACE_Y + 0.07, cz);
  }

  private updatePReveal(dt: number): void {
    this.throwValues = this.dice.values;
    this.showTotal(this.throwValues);
    const v = this.throwValues;
    if (!this.shakuni.watching && !this.loaded) this.say('hintFlip', this.line('hintFlip'), true);

    // Cheat 2: poke a die to tip it onto the next face
    this.flipCooldown -= dt;
    if (this.flipCooldown <= 0) {
      for (const h of this.hands.both) {
        if (!h.tracked) continue;
        const tip = this.toLocal(h.indexTip, this.tA);
        for (const d of this.dice.dice) {
          if (d.mode !== 'rest') continue;
          if (d.pos.distanceTo(tip) < 0.028 && tip.y < d.pos.y + 0.03) {
            this.flipDie(d);
            h.buzz(0.5, 30);
            break;
          }
        }
      }
      if (this.keys.has('f')) this.flipDie(this.dice.dice[0]);
    }

    // The window stays open while a hand hovers near the dice (reaching to flip).
    let reaching = false;
    for (const h of this.hands.both) {
      if (!h.tracked) continue;
      const tip = this.toLocal(h.indexTip, this.tA);
      for (const d of this.dice.dice) if (d.pos.distanceTo(tip) < 0.1) reaching = true;
    }
    // time to watch the ghost demonstrate the flip, and to try it
    const limit = reaching || this.ghostShown === 'flip' ? 6 : 3;
    if (this.phaseT > limit && this.dice.allRest) this.resolvePlayerThrow();
  }

  private flipDie(d: (typeof this.dice.dice)[number]): void {
    d.flip();
    sfx.clack(0.7);
    this.acts.push({ kind: 'flip', seen: this.shakuni.watching });
    this.used.add('flip');
    this.flipCooldown = 0.45;
    this.phaseT = Math.min(this.phaseT, 2); // give a moment after each flip
  }

  private resolvePlayerThrow(): void {
    this.shakuni.cycling = false;
    const seen = this.acts.some((a) => a.seen);
    let caught = seen;
    if (!seen && this.acts.length) {
      this.shakuni.suspicion = Math.min(100, this.shakuni.suspicion + 18 * this.acts.length);
      const p = Math.max(0, (this.shakuni.suspicion - 60) / 80);
      caught = Math.random() < p;
    } else if (!this.acts.length) {
      this.shakuni.suspicion = Math.max(10, this.shakuni.suspicion - 5);
    }
    if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} resolve acts=${JSON.stringify(this.acts)} loaded=${this.loaded} suspicion=${this.shakuni.suspicion} caught=${caught}`);
    if (caught) {
      this.match.caught++;
      this.moveGold(1, 1, 'you were caught');
      this.ledger.timesCaught++;
      saveLedger(this.ledger);
      this.say('', seen ? LINES.caughtSeen : LINES.caughtLuck, false, true, 4);
      this.triggerCrack(0);
      this.shakuni.angerT = 3;
      // divine light reveals the true roll
      const honest = honestThrow();
      this.dice.dice.forEach((d, i) => {
        d.forcedFace = PASA_FACES.indexOf(honest[i] as 1);
        d.beginSettle();
        d.setGlow(1.2, '#fff2c0');
      });
      // penalty: your leading piece goes back to the start
      const lead = leadingPiece(this.state, 0);
      if (this.state.pos[0][lead] !== START) this.state.pos[0][lead] = START;
      this.shakuni.suspicion = 35;
      this.ambience.setMood('tense');
      this.ambience.flare(0.8);
      this.setPhase('caught');
      return;
    }
    if (this.acts.length) {
      this.match.cheats++;
      this.ledger.cheatsLanded++;
      saveLedger(this.ledger);
    }
    this.beginChoose(0, this.throwValues);
  }

  private triggerCrack(side: Seat): void {
    sfx.crack();
    sfx.divine();
    this.fx.crack(this.tA.set(0, 0, side === 0 ? 0.12 : -0.12), side === 0 ? 1 : -1);
  }

  private updateCaught(): void {
    if (this.phaseT > 1.2) {
      if (this.once('layout')) this.layoutPieces(false);
      const v = this.dice.values;
      this.showTotal(v);
    }
    if (this.phaseT > 4.5) {
      this.dice.dice.forEach((d) => d.setGlow(0));
      passTurn(this.state);
      this.setPhase('handoff');
    }
  }

  private beginChoose(seat: Seat, values: number[]): void {
    this.undo = null; // only a move you chose between options can be taken back
    if (seat === 1 && this.sCheat) this.match.sMissed++;
    this.options = legalMoves(this.state, seat, rollTotal(values));
    if (this.options.length === 1 || seat === 1) {
      const m = seat === 1 ? bestMove(this.state, 1, rollTotal(values)) : this.options[0];
      this.executeMove(m, values);
      return;
    }
    this.options.forEach((m, i) => {
      this.board.pieces[0][m.piece].setGlow(0.3);
      this.board.pieces[0][m.piece].setHighlight(true);
      const marker = this.board.markers[i];
      marker.visible = true;
      this.markerPos(m, marker.position);
    });

    this.setPhase('p_choose');
    if (import.meta.env.DEV) {
      const at = this.options.map((m) => this.anchor.localToWorld(this.board.pieces[0][m.piece].mesh.position.clone()).toArray().map((v) => +v.toFixed(3)));
      const to = this.options.map((_, i) => this.anchor.localToWorld(this.board.markers[i].position.clone()).toArray().map((v) => +v.toFixed(3)));
      console.info(`[chausar] #${this.logTag()} choose at=${JSON.stringify(at)} to=${JSON.stringify(to)}`);
    }
  }

  private markerPos(m: Move, out: Vector3): void {
    if (m.to >= HOME) out.set(0, SURFACE_Y + 0.002, 0);
    else piecePosition(m.seat, m.to, 0, 0, out).setY(SURFACE_Y + 0.002);
  }

  /**
   * Hover previews (the piece lifts, its landing marker swells, a soft tick);
   * a pinch commits at once, a resting fingertip after TOUCH_DWELL. A finger
   * brushing past on its way to the other piece no longer moves anything.
   */
  private updateChoose(dt: number): void {
    const first = this.board.pieces[0][this.options[0].piece].mesh.position;
    this.hint.show(this.line('choose'), this.tB.copy(first), 0.09);
    let chosen = -1;
    let hover = -1;
    let hoverD = Infinity;
    let touching = false;
    let by: HandState | null = null;
    for (const h of this.hands.both) {
      if (!h.tracked) continue;
      const pinch = h.pinchStarted ? this.toLocal(h.pinchPoint, this.tA) : null;
      const tip = this.toLocal(h.indexTip, this.tB);
      const pp = h.pinchStarted ? null : this.toLocal(h.pinchPoint, this.tA);
      this.options.forEach((m, i) => {
        const piece = this.board.pieces[0][m.piece].mesh.position;
        const marker = this.board.markers[i].position;
        if (pinch && (pinch.distanceTo(piece) < 0.035 || pinch.distanceTo(marker) < 0.03)) {
          chosen = i;
          by = h;
        }
        const dTip = tip.distanceTo(this.tC.copy(piece).setY(piece.y + 0.015));
        const d = Math.min(dTip, pp ? pp.distanceTo(piece) : Infinity);
        if (d < 0.045 && d < hoverD) {
          hoverD = d;
          hover = i;
          touching = dTip < 0.02;
          by = by ?? h;
        }
      });
    }
    if (hover !== this.hoverOpt) {
      this.dwellT = 0;
      if (hover >= 0) {
        sfx.tap(0, 1.3);
        (by as HandState | null)?.buzz(0.15, 15);
      }
      this.hoverOpt = hover;
    }
    this.dwellT = touching ? this.dwellT + dt : Math.max(0, this.dwellT - dt * 2);
    if (touching && this.dwellT >= TOUCH_DWELL) chosen = hover;

    const pulse = 0.35 + 0.35 * Math.sin(this.time * 5);
    this.options.forEach((m, i) => {
      const on = i === hover;
      // the hovered piece brightens as the dwell fills; the others step back
      this.board.pieces[0][m.piece].setGlow(on ? 0.8 + 0.6 * Math.min(1, this.dwellT / TOUCH_DWELL) : hover >= 0 ? 0.15 : pulse);
      this.board.markers[i].scale.setScalar(on ? 1.4 : hover >= 0 ? 0.85 : 1 + 0.15 * Math.sin(this.time * 5));
    });

    if (this.keys.has('1')) chosen = 0;
    if (this.keys.has('2') && this.options[1]) chosen = 1;
    if (chosen >= 0) {
      sfx.select();
      (by as HandState | null)?.buzz(0.5, 40);
      const m = this.options[chosen];
      this.undo = { snap: cloneState(this.state), values: this.throwValues.slice(), piece: m.piece };
      this.clearChoice();
      this.executeMove(m, this.throwValues);
    }
  }

  private clearChoice(): void {
    this.hoverOpt = -1;
    this.dwellT = 0;
    for (const p of this.board.pieces[0]) {
      p.setGlow(0);
      p.setHighlight(false);
    }
    for (const m of this.board.markers) m.visible = false;
  }

  /** A moment to take the move back: touch the piece you just moved. */
  private updateTakeback(dt: number): void {
    const u = this.undo;
    if (!u) {
      this.setPhase('handoff');
      return;
    }
    const piece = this.board.pieces[0][u.piece];
    const at = piece.mesh.position;
    if (import.meta.env.DEV && this.phaseT > 0.5 && this.once('log')) {
      const w = this.anchor.localToWorld(this.tA.copy(at)).toArray().map((v) => +v.toFixed(3));
      console.info(`[chausar] #${this.logTag()} takeback at=${JSON.stringify(w)}`);
    }
    if (this.takebacksShown < 2) this.hint.show('Touch it again to take back', at, 0.07);
    piece.setGlow(0.25 + 0.2 * Math.sin(this.time * 6));
    // the hand that just chose must leave the piece before a touch counts again
    let near = false;
    let reaching = false;
    let touch: HandState | null = null;
    for (const h of this.hands.both) {
      if (!h.tracked) continue;
      const tip = this.toLocal(h.indexTip, this.tA);
      const pp = this.toLocal(h.pinchPoint, this.tB);
      const top = this.tC.copy(at).setY(at.y + 0.015);
      if (tip.distanceTo(top) < 0.06 || pp.distanceTo(at) < 0.06) near = true;
      if (tip.distanceTo(top) < 0.12) reaching = true;
      if (tip.distanceTo(top) < 0.022 || (h.pinchStarted && pp.distanceTo(at) < 0.035)) touch = h;
    }
    if (!near) this.takebackArmed = true;
    this.takebackT = this.takebackArmed && touch ? this.takebackT + dt : 0;
    const pinched = !!touch && (touch as HandState).pinchStarted;
    if (this.keys.has('z') || (this.takebackArmed && touch && (pinched || this.takebackT > 0.2))) {
      if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} take back`);
      (touch as HandState | null)?.buzz(0.4, 40);
      sfx.whoosh();
      piece.setGlow(0);
      this.state = cloneState(u.snap);
      if (u.gold) this.moveGold(1, u.gold, 'take-back');
      this.undo = null;
      this.layoutPieces(false); // pieces (and anything captured) drift back
      this.say('', 'Change of heart, Prince? Choose again.', false, true, 2.5);
      this.beginChoose(0, u.values);
      return;
    }
    // a hand reaching back toward the piece keeps the window open a little longer
    if (this.phaseT > (reaching && this.takebackArmed ? TAKEBACK_REACH : TAKEBACK_WINDOW)) {
      if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} takeback closed t=${this.phaseT.toFixed(2)} armed=${this.takebackArmed} reaching=${reaching} near=${near}`);
      piece.setGlow(0);
      this.undo = null;
      this.takebacksShown++;
      this.setPhase('handoff');
      this.phaseT = 0.7; // the window already gave the pause handoff would wait for
    }
  }

  // ── moving

  private executeMove(m: Move, faces: number[]): void {
    const path: number[] = [];
    const startIdx = m.from === START ? -1 : m.from;
    for (let i = startIdx + 1; i <= Math.min(m.to, HOME); i++) path.push(i);
    this.setPhase('moving');
    this.hop = {
      seat: m.seat,
      piece: m.piece,
      path,
      i: 0,
      t: 0,
      then: () => {
        const res = applyMove(this.state, m, faces);
        this.layoutPieces(false);
        if (m.captures.length) {
          // the captor sweeps a stack of gold across the table (a take-back sweeps it home again)
          const moved = this.moveGold(m.seat as Owner, 1, 'capture');
          if (m.seat === 0 && this.undo) this.undo.gold = moved;
          sfx.thud(1);
          sfx.sinister();
          const at = this.tA.copy(this.board.pieces[m.seat][m.piece].mesh.position);
          this.juice.capture(at);
          if (m.seat === 0) this.juice.reward(at, 3);
          else this.ambience.flare(0.6);
          this.say('', m.seat === 1 ? LINES.captureByS : LINES.captureByP, false, true, 3);
          if (m.seat === 1) this.shakuni.laughT = 1.5;
        }
        if (res.winner !== null) {
          this.finish(res.winner);
          return;
        }
        if (m.seat === 1 && rollTotal(faces) >= 15 && !m.captures.length) {
          this.say('', LINES.loIWon, false, true, 2.5);
          this.shakuni.laughT = 1.2;
        }
        if (res.extraTurn) {
          this.say('', m.seat === 0 ? 'Throw again!' : 'Shakuni throws again.', false, false, 2.5);
        }
        if (m.seat === 0 && this.undo) {
          this.takebackArmed = false;
          this.takebackT = 0;
          this.setPhase('p_takeback');
          return;
        }
        this.setPhase('handoff');
      },
    };
  }

  private updateHop(dt: number): void {
    const h = this.hop;
    if (!h) return;
    const n = h.path.length;
    h.t += dt / hopDuration(h.i, n);
    const piece = this.board.pieces[h.seat][h.piece];
    const fromIdx = h.i === 0 ? (h.path[0] - 1 < 0 ? START : h.path[0] - 1) : h.path[h.i - 1];
    const toIdx = h.path[h.i];
    if (toIdx !== undefined) {
      const a = piecePosition(h.seat, fromIdx, h.piece, 0, this.tA);
      const b = piecePosition(h.seat, toIdx, h.piece, 0, this.tB);
      hopPose(piece.mesh, Math.min(1, h.t), a, b, h.i === n - 1, h.i === 0);
      if (h.t >= 1) this.juice.landing(b, h.i === n - 1, h.i);
    }
    if (h.t >= 1) {
      h.t = 0;
      h.i++;
      if (h.i >= n) {
        this.hop = null;
        h.then();
      }
    }
  }

  /** Pieces drift toward their logical squares (captured ones fly home). */
  private pieceTargets: Vector3[][] = [[new Vector3(), new Vector3()], [new Vector3(), new Vector3()]];

  private layoutPieces(immediate: boolean): void {
    const counts = new Map<string, number>();
    for (const seat of [0, 1] as Seat[]) {
      this.state.pos[seat].forEach((idx, pi) => {
        const cell = cellOf(seat, idx);
        const key = cell ? `${cell[0]},${cell[1]}` : `${seat}:${idx}`;
        const n = counts.get(key) ?? 0;
        counts.set(key, n + 1);
        piecePosition(seat, idx, pi, cell ? n : 0, this.pieceTargets[seat][pi]);
        if (immediate) this.board.pieces[seat][pi].mesh.position.copy(this.pieceTargets[seat][pi]);
      });
    }
  }

  private updatePieces(dt: number): void {
    const k = 1 - Math.exp(-dt * 8);
    for (const seat of [0, 1] as Seat[])
      for (let pi = 0; pi < 2; pi++) {
        if (this.hop && this.hop.seat === seat && this.hop.piece === pi) continue;
        const mesh = this.board.pieces[seat][pi].mesh;
        mesh.scale.setScalar(1); // undo any squash left by a cancelled hop
        mesh.quaternion.identity();
        const m = mesh.position;
        const t = this.pieceTargets[seat][pi];
        const dist = Math.hypot(t.x - m.x, t.z - m.z);
        m.x += (t.x - m.x) * k;
        m.z += (t.z - m.z) * k;
        // a hovered choice lifts a little off the board (a preview, nothing committed)
        const want = this.phase === 'p_choose' && seat === 0 && this.hoverOpt >= 0 && this.options[this.hoverOpt]?.piece === pi ? 0.014 : 0;
        this.pieceLift[seat][pi] += (want - this.pieceLift[seat][pi]) * k;
        m.y = t.y + Math.min(0.06, dist * 0.6) + this.pieceLift[seat][pi];
      }
  }

  private updateHandoff(): void {
    if (this.phaseT < 0.7) return;
    if (this.state.winner !== null) return;
    if (this.state.turn === 0) {
      // the dice come back to you
      if (this.once('slide')) {
        this.dice.beginSlide(PLAYER_DICE_SPOT, 0.4);
        this.shakuni.handTarget.set(-0.02, 0.1, -0.3); // a flick: the dice slide back to you
        this.slideStart = this.phaseT;
      }
      const e = Math.min(1, (this.phaseT - this.slideStart) / 0.7);
      this.dice.updateSlide(e * e * (3 - 2 * e));
      if (e >= 1) {
        this.shakuni.handTarget.copy(SHAKUNI_HAND_REST);
        this.startTurn(0);
      }
    } else {
      this.startTurn(1);
    }
  }

  // ── Shakuni

  private beginShakuniTurn(): void {
    this.sTurnCount++;
    this.sSnapshot = cloneState(this.state);
    const behind = this.progress(1) < this.progress(0);
    // His 2nd throw always cheats so the player learns the tell early.
    this.sCheat = this.sTurnCount === 2 || (this.sTurnCount > 2 && Math.random() < (behind ? 0.45 : 0.28));
    this.sThrowAt = this.sCheat ? 2.9 : 1.9;
    // dice out of his reach slide across the cloth to him (they obey Shakuni)
    let cx = 0, cz = 0;
    for (const d of this.dice.dice) { cx += d.pos.x / 3; cz += d.pos.z / 3; }
    this.sPre = Math.hypot(cx - SHAKUNI_DICE_SPOT.x, cz - SHAKUNI_DICE_SPOT.z) > 0.12 ? 0.9 : 0;
    if (this.sPre > 0) {
      this.dice.beginSlide(SHAKUNI_DICE_SPOT, 0.3);
      this.shakuni.handTarget.set(-0.03, 0.12, -0.32); // beckoning
      sfx.whoosh();
    }
    this.shakuni.cycling = false;
    this.accuseOpen = false;
    this.sCalled = 0;
    this.setPhase('s_throw');
  }

  private progress(seat: Seat): number {
    return Math.max(...this.state.pos[seat].map((p) => (p === START ? 0 : p + 1)));
  }

  private sPre = 0;

  private updateSThrow(dt: number): void {
    if (this.phaseT < this.sPre) {
      const e = Math.min(1, this.phaseT / (this.sPre - 0.15));
      this.dice.updateSlide(e * e * (3 - 2 * e));
      this.shakuni.lookTarget.copy(this.dice.dice[1].pos);
      return;
    }
    const t = this.phaseT - this.sPre;
    const s = this.shakuni;
    const centre = this.tA.set(0, 0, 0);
    for (const d of this.dice.dice) centre.addScaledVector(d.pos, 1 / 3);
    s.lookTarget.copy(centre);
    if (t < 0.7) {
      s.handTarget.set(centre.x, centre.y + 0.06, centre.z - 0.02);
      s.setGrip(0);
      return;
    }
    s.setGrip(1);
    if (t < 1.1) s.handTarget.copy(SHAKUNI_HAND_LIFT);
    else if (t < 1.9) {
      s.handTarget.copy(SHAKUNI_HAND_LIFT);
      s.handTarget.x += Math.sin(t * 30) * 0.025;
      s.handTarget.y += Math.cos(t * 26) * 0.015;
      this.rattleT -= dt;
      if (this.rattleT <= 0) {
        sfx.rattle();
        this.rattleT = 0.11;
      }
    } else if (this.sCheat && t < 2.6) {
      // the tell: his hand dips below the table edge
      s.handTarget.copy(SHAKUNI_HAND_DIP);
      if (!this.accuseOpen) {
        this.accuseOpen = true;
      }
    } else if (this.sCheat && t < this.sThrowAt) {
      s.handTarget.copy(SHAKUNI_HAND_LIFT);
      this.dice.dice.forEach((d) => d.setGlow(0.5 + 0.5 * Math.sin(t * 40), '#b48cff'));
    }
    // dice ride in his hand
    this.tB.copy(s.hand.position).add(this.tC.set(0, -0.025, 0.03));
    this.dice.holdAt(this.tB, s.hand.quaternion, this.time, t > 1.1 && t < 1.9 ? 1 : 0.2);

    if (t >= this.sThrowAt) {
      this.dice.dice.forEach((d) => d.setGlow(0));
      const target = this.tC.copy(SHAKUNI_COURT);
      target.x += (Math.random() - 0.5) * 0.04;
      target.z += -0.04 + (Math.random() - 0.5) * 0.04; // land short; they roll toward you
      const v = this.ballistic(this.tB, target, 0.4);
      const loadedFaces = this.sCheat ? loadedThrow(this.state, 1) : null;
      const forced = loadedFaces ? loadedFaces.map((f) => PASA_FACES.indexOf(f as 1)) : null;
      // the second tell: he knows the total before the dice stop (always on his scripted first cheat)
      this.sCalled = loadedFaces && (this.sTurnCount === 2 || Math.random() < 0.75) ? rollTotal(loadedFaces) : 0;
      if (this.sCheat) this.match.sCheats++;
      this.dice.release(v, 16, forced);
      sfx.whoosh();
      s.setGrip(0);
      s.handTarget.copy(SHAKUNI_HAND_REST);
      this.accuseOpen = true; // you may always accuse once he has thrown
      if (this.sCheat && !this.shown.has('hintGong')) this.say('hintGong', LINES.hintGong, true, false, 6);
      this.setPhase('s_flying');
    }
  }

  private updateSFlying(): void {
    if (this.sCalled && this.phaseT > 0.3 && this.once('call')) {
      if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} shakuni calls ${this.sCalled} early`);
      this.say('', spoken(this.sCalled), false, true, 1.6);
    }
    if (this.dice.allRest || this.phaseT > 4) {
      this.throwValues = this.dice.values;
      this.setPhase('s_reveal');
    }
  }

  private updateSReveal(): void {
    const v = this.throwValues;
    this.showTotal(v);
    // honest throws: sometimes he names the total, but only once it has landed
    if (!this.sCheat && this.phaseT > 0.35 && this.once('callAfter') && Math.random() < 0.4) this.say('', spoken(rollTotal(v)), false, true, 1.4);
    if (this.sCheat && this.sCalled && this.sTurnCount > 2 && this.phaseT > 0.9 && !this.shown.has('hintCall')) this.say('hintCall', LINES.hintCall, true);
    if (this.phaseT > 1.3) this.beginChoose(1, v);
  }

  // ── gong / accusation

  private updateGong(dt: number): void {
    this.gongCooldown -= dt;
    const disc = this.board.gongDisc;
    disc.rotation.z *= 0.9;
    const open = this.accuseOpen && this.state.winner === null;
    const mat = disc.material as unknown as { emissiveIntensity: number };
    mat.emissiveIntensity = open ? 0.25 + 0.25 * Math.sin(this.time * 6) : 0;
    this.gongLabel.opacity = open ? 1 : this.phase === 'gameover' ? 1 : 0;
    this.gongLabel.setText(this.phase === 'gameover' ? 'Strike to play again' : 'Strike: “Cheat!”');
    if (this.gongCooldown > 0) return;
    let struck = this.keys.has('g');
    for (const h of this.hands.both) {
      if (!h.tracked) continue;
      const tip = this.toLocal(h.indexTip, this.tA);
      const pin = this.toLocal(h.pinchPoint, this.tB);
      if (tip.distanceTo(this.board.gongCenter) < 0.055 || (h.pinchStarted && pin.distanceTo(this.board.gongCenter) < 0.07)) {
        struck = true;
        h.buzz(1, 90);
      }
    }
    if (!struck) return;
    this.gongCooldown = 1.5;
    sfx.gong();
    this.ambience.flare(0.4);
    disc.rotation.z = 0.25;
    if (this.phase === 'gameover') {
      this.resetMatch();
      this.ledgerLabel.opacity = 0;
      this.setPhase('intro');
      this.phaseT = 1.5;
      return;
    }
    if (!open) return;
    this.accuse();
  }

  /**
   * The ghost hand (Meta's "Hands Onboarding 101": demonstrate an unfamiliar
   * gesture where it's used, loop it, stop once the player has done it).
   * Only while Shakuni looks away, so following it never gets you caught.
   */
  private updateGhost(dt: number, time: number): void {
    let want: GhostDemoKind | null = null;
    const away = !this.shakuni.watching;
    const right = this.hands.right.tracked || !this.hands.left.tracked;
    if (this.phase === 'p_holding' && this.holder && this.holdLost < 0 && !this.loaded && !this.used.has('swap') && away) {
      // beside your own hand, a little to the outside, then back toward you and under the edge
      const sign = this.holder.side === 'right' ? 1 : -1;
      if (this.ghostShown === 'swap' || this.ghostLeft.swap > 0) {
        want = 'swap';
        this.ghost.from.copy(this.holdAnchor);
        this.ghost.from.x += 0.075 * sign;
        this.ghost.to.set(this.ghost.from.x, -0.11, Math.max(this.ghost.from.z + 0.1, this.headLocal.z - 0.3));
      }
    } else if (this.phase === 'p_reveal' && !this.loaded && !this.used.has('flip') && away && this.dice.allRest) {
      if (this.ghostShown === 'flip' || this.ghostLeft.flip > 0) {
        want = 'flip';
        // the die nearest you
        let best = this.dice.dice[0];
        for (const d of this.dice.dice) if (d.pos.z > best.pos.z) best = d;
        this.ghost.target.copy(best.pos);
      }
    }
    if (import.meta.env.DEV && this.ghostPreview) {
      want = this.ghostPreview === 1 ? 'swap' : 'flip';
      this.ghost.from.copy(PLAYER_DICE_SPOT).add(this.tA.set(0.075, 0.16, 0.08));
      this.ghost.to.set(this.ghost.from.x, -0.11, Math.max(this.ghost.from.z + 0.1, this.headLocal.z - 0.3));
      this.ghost.target.copy(this.dice.dice[1].pos);
      this.ghostShown = want;
    }
    if (want && this.ghostShown !== want) {
      this.ghostLeft[want]--;
      if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} ghost ${want}`);
    }
    this.ghostShown = want;
    this.ghost.play(want, want === 'swap' && this.holder ? this.holder.side : right ? 'right' : 'left');
    this.anchor.updateWorldMatrix(true, false);
    this.ghost.update(dt, time, this.anchor.matrixWorld);
    if (import.meta.env.DEV && want && this.ghost.showing && this.once(`ghostpos-${want}`)) {
      console.info(`[chausar] #${this.logTag()} ghost at wrist=${JSON.stringify(this.ghost.wristWorld())} visible=${this.ghost.root.visible}`);
    }
  }

  /**
   * Players talk with their hands (Chess Club answered gestures with emoji):
   * an open hand raised and waved side to side gets a reply from Shakuni.
   */
  private updateWave(dt: number): void {
    this.waveCooldown -= dt;
    // not while the hands are busy with the game (holding, poking, choosing) or a verdict is on screen
    const quiet =
      this.phase !== 'boot' && this.phase !== 'placing' && this.phase !== 'p_holding' && this.phase !== 'p_reveal' &&
      this.phase !== 'p_choose' && this.phase !== 'p_takeback' && this.phase !== 'caught' && this.phase !== 'accused';
    for (let s = 0; s < 2; s++) {
      const h = this.hands.both[s];
      const flips = this.waveFlips[s];
      while (flips.length && this.time - flips[0] > 1.6) flips.shift();
      if (!h.tracked || !h.isHand || h.pinching) {
        flips.length = 0;
        this.waveSign[s] = 0;
        continue;
      }
      const palm = this.toLocal(h.palm, this.tA);
      if (palm.y < this.headLocal.y - 0.3) {
        flips.length = 0;
        continue;
      }
      const vx = this.tB.copy(h.velocity).applyQuaternion(this.invQ).x;
      if (Math.abs(vx) < 0.3) continue;
      const sign = vx > 0 ? 1 : -1;
      if (this.waveSign[s] !== 0 && sign !== this.waveSign[s]) flips.push(this.time);
      this.waveSign[s] = sign;
      if (flips.length >= 3 && quiet && this.waveCooldown <= 0) {
        flips.length = 0;
        this.waveCooldown = 25;
        if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} wave`);
        this.shakuni.setGaze('focus', 2);
        this.shakuni.laughT = 0.8;
        this.say('', GREETINGS[this.greetIdx++ % GREETINGS.length], false, true, 2.5);
      }
    }
  }

  private accuse(): void {
    this.accuseOpen = false;
    this.used.add('gong');
    if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} accuse cheated=${this.sCheat} phase=${this.phase}`);
    if (this.sCheat) {
      // Caught him: undo his whole turn and send his leading piece back.
      this.hop = null;
      if (this.sSnapshot) this.state = cloneState(this.sSnapshot);
      const lead = leadingPiece(this.state, 1);
      this.state.pos[1][lead] = START;
      this.state.turn = 0;
      this.state.winner = null;
      this.sCheat = false;
      this.triggerCrack(1);
      this.juice.reward(this.tA.set(0, SURFACE_Y, -0.12), 4);
      this.ambience.flare(1);
      this.ambience.setMood('calm');
      this.dice.dice.forEach((d) => d.setGlow(1.2, '#b48cff'));
      this.shakuni.angerT = 3;
      this.ledger.shakuniCaught++;
      saveLedger(this.ledger);
      this.match.sExposed++;
      this.moveGold(0, 1, 'shakuni exposed');
      if (!this.legendShown) this.beginLegend();
      this.shakuni.setGrip(0);
      this.shakuni.handTarget.copy(SHAKUNI_HAND_REST);
      this.say('', LINES.accusedRight, false, true, 4);
      this.layoutPieces(false);
      this.setPhase('accused');
      return;
    }
    // Wrong: he laughs and you lose a throw.
    this.match.wrong++;
    this.shakuni.laughT = 2;
    sfx.sinister();
    this.say('', LINES.accusedWrong, false, true, 4);
    this.ambience.setMood('tense');
    this.ambience.flare(0.5);
    if (this.phase === 'p_ready') {
      passTurn(this.state);
      this.setPhase('handoff');
    } else {
      this.skipNextThrow = true;
    }
  }

  private beginLegend(): void {
    this.legendShown = true;
    this.legend = { t: 0, end: 0, from: new Vector3(), touchCd: 0, spin: 0, angle: 0 };
  }

  /**
   * The first time you catch him: his dice rise in front of you, within reach and
   * below the subtitles (never moving the view), grow to 1.5× and turn on their own
   * long axes in violet light while the legend is told. Touch one and it spins and rings.
   */
  private updateLegend(dt: number): void {
    const L = this.legend!;
    L.t += dt;
    const busy = this.dice.dice.some((d) => d.mode === 'flying' || d.mode === 'settling');
    if (!L.end) {
      if (L.t < 1.6 || (busy && L.t < 3.5)) return; // the crack and the light play first
      L.from.set(0, 0, 0);
      for (const d of this.dice.dice) L.from.addScaledVector(d.pos, 1 / 3);
      // one passage: a second narrator line would replace the first (Subtitles keeps only the newest)
      const dur = this.subs.say(LEGEND.join(' '), 'narrator');
      L.t = 0.001; // from here, t counts the float itself
      L.end = Math.max(7, dur) + 0.6;
      sfx.sparkle();
      if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} legend`);
      return;
    }
    const k = Math.min(1, L.t / 1.3);
    const e = k * k * (3 - 2 * k);
    // about 0.43 m away, below and to the right of the captions: in easy reach, like something held up to you
    const target = this.tA.copy(this.headLocal).add(this.tB.set(0.12, -0.24, -0.34));
    target.y = Math.max(target.y, SURFACE_Y + 0.14);
    const at = this.tC.lerpVectors(L.from, target, e);
    at.y += Math.sin(this.time * 1.4) * 0.004 * e + Math.sin(Math.PI * e) * 0.04;
    L.spin = Math.max(0, L.spin - dt * 1.2);
    L.angle += dt * (0.45 + 7 * L.spin);
    // three bars stacked one above another, each turning on its long axis: every face shows in turn
    const out = Math.min(1, Math.max(0, (L.t - (L.end - 0.6)) / 0.6)); // shrink back before they go home
    const sc = 1 + 0.5 * e * (1 - out * out * (3 - 2 * out));
    this.dice.dice.forEach((d, i) => {
      d.mode = 'held';
      d.pos.copy(at);
      d.pos.y += (1 - i) * 0.03 * sc;
      d.quat.setFromAxisAngle(X_AXIS, L.angle + i * 0.9);
      d.mesh.scale.setScalar(sc);
      d.sync();
    });
    // the violet of his cheating dice, breathing: the same light you saw when he loaded them
    const glow = 0.55 + 0.2 * Math.sin(this.time * 2.4) + 0.7 * L.spin;
    this.dice.dice.forEach((d) => d.setGlow(glow, '#a97cff'));
    this.shakuni.lookTarget.copy(at);
    // touch a die: it spins and rings
    L.touchCd -= dt;
    if (L.touchCd <= 0 && e > 0.9) {
      for (const h of this.hands.both) {
        if (!h.tracked) continue;
        const tip = this.toLocal(h.indexTip, this.tB);
        if (this.dice.dice.some((d) => d.pos.distanceTo(tip) < 0.035)) {
          L.spin = 1;
          L.touchCd = 0.45;
          sfx.tap(0, 1.9);
          sfx.sparkle();
          h.buzz(0.4, 30);
          break;
        }
      }
    }
    if (L.t > L.end) {
      this.legend = null;
      this.dice.dice.forEach((d) => {
        d.setGlow(0);
        d.mesh.scale.setScalar(1);
      });
    }
  }

  private updateAccused(dt: number): void {
    if (this.legend) {
      this.updateLegend(dt);
      return;
    }
    if (this.phaseT < 3.2) return;
    if (this.dice.dice.some((d) => d.mode === 'flying' || d.mode === 'settling')) return;
    this.dice.dice.forEach((d) => d.setGlow(0));
    this.setPhase('handoff');
  }

  // ───────────────────────── end ─────────────────────────

  private finish(winner: Seat): void {
    this.setPhase('gameover');
    this.moveGold(winner as Owner, 8, 'match');
    this.resultLine = recordMatch(this.ledger, winner === 0);
    this.accuseOpen = false;
    this.shakuni.cycling = false;
    if (winner === 0) {
      this.say('', LINES.playerWin, false, true, 8);
      sfx.conch();
      this.fx.petalShower();
      this.juice.reward(this.tA.set(0, SURFACE_Y, 0), 4);
      this.ambience.setMood('triumph');
      this.dimmer.fadeTo(0, 2.5);
      this.palace.fadeTo(0); // the court melts away: your room, your kingdom
      sfx.dim(false);
      this.shakuni.angerT = 2;
    } else {
      this.say('', LINES.shakuniWin, false, true, 8);
      sfx.sinister();
      this.shakuni.laughT = 3;
      this.ambience.setMood('tense');
      this.ambience.flare(1);
    }
  }

  private resultLine = '';

  /** The question the epic leaves you with, shaped by how this match was played. */
  private reflection(playerWon: boolean): string {
    const m = this.match;
    if (playerWon && m.cheats > 0 && m.cheats >= m.sCheats) return 'You beat a cheat by cheating. Who was the fairer player tonight?';
    if (playerWon && m.cheats === 0) return 'You won with honest throws, against dice that obey him. Some would call that dharma.';
    if (playerWon) return 'You won, and you know how. The court will tell it differently.';
    if (m.sMissed > 0) {
      const n = m.sMissed === 1 ? 'once' : m.sMissed === 2 ? 'twice' : `${m.sMissed} times`;
      return `He cheated ${n} and no one struck the gong. In the epic, Vidura warned them, and the elders kept silent.`;
    }
    if (m.sExposed > 0) return 'You exposed him, and still the game went on. So it did in the Sabha Parva.';
    return 'A game decided before it began. The epic asks why the court stayed silent.';
  }

  private updateGameOver(): void {
    if (this.phaseT > 5 && this.once('result')) this.say('', this.resultLine, false, true, 6);
    if (this.phaseT > 11.5 && this.once('reflect')) {
      const line = this.reflection(this.state.winner === 0);
      if (import.meta.env.DEV) console.info(`[chausar] #${this.logTag()} reflection ${JSON.stringify(this.match)} "${line}"`);
      this.say('', line, false, false, 7);
    }
    this.ledgerLabel.setText(ledgerLine(this.ledger));
    this.ledgerLabel.opacity = Math.min(1, Math.max(0, this.phaseT - 5));
  }

  // ───────────────────────── presentation ─────────────────────────

  private updateShakuniLook(): void {
    const s = this.shakuni;
    if (this.phase === 'p_holding') return; // set to the hand
    if (this.phase === 's_throw') return;
    if (this.phase === 'p_reveal' || this.phase === 'p_flying' || this.phase === 's_flying' || this.phase === 's_reveal') {
      s.lookTarget.set(0, 0, 0);
      for (const d of this.dice.dice) s.lookTarget.addScaledVector(d.pos, 1 / 3);
      return;
    }
    s.lookTarget.copy(this.headLocal);
    s.lookTarget.y -= 0.03; // eye contact
  }

  private billboard(o: Object3D): void {
    this.tA.copy(this.headLocal);
    o.lookAt(this.tA.applyMatrix4(this.anchor.matrixWorld));
  }

  private updateLabels(dt: number): void {
    this.captionT -= dt;
    this.whisperT -= dt;
    this.caption.opacity = 0; // retired: dialogue now lives in Subtitles (ui.ts)
    this.whisper.opacity = 0;
    this.subs.update(dt, this.immersive ? this.player.head : this.camera);
    this.hint.update(dt, this.headLocal);
    for (const l of [this.caption, this.whisper, this.title, this.totalLabel, this.gongLabel]) {
      if (l.mesh.visible) this.billboard(l.mesh);
    }
    if (this.phase !== 'p_reveal' && this.phase !== 's_reveal' && this.phase !== 'caught' && this.phase !== 'p_choose' && this.phase !== 'moving') {
      this.totalLabel.opacity = Math.max(0, this.totalLabel.opacity - dt * 2);
    }
  }
}
