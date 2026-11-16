import {
  BackSide,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Shape,
  ShapeGeometry,
  ShadowMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
} from '@iwsdk/core';
import { mergeGeometries } from './geo.js';
import {
  cellOf,
  GRID,
  HOME,
  isBoardCell,
  isSafeCell,
  PATHS,
  Seat,
  START,
} from './rules.js';

/** Size of one square, metres. 19 squares ≈ 49 cm: fits a small table. */
export const CELL = 0.026;
export const HALF = (GRID / 2) * CELL;
/** Height of the cloth surface above the table top. */
export const SURFACE_Y = 0.014;

export const SEAT_COLORS = ['#e8a33a', '#5b3fa8'] as const; // saffron vs violet
const ARM_COLORS = {
  near: '#8a1c1c', // crimson
  right: '#b8770f', // turmeric
  far: '#1d1838', // indigo-black
  left: '#1d5532', // green
};

export function cellLocal(c: number, r: number, out: Vector3): Vector3 {
  return out.set((c - 9) * CELL, SURFACE_Y, (r - 9) * CELL);
}

// ───────────────────────── cloth ─────────────────────────
//
// The cloth is drawn twice from the same strokes: once as colour (2048²) and
// once as a packed surface mask (1024²) used as bump (R), roughness (G) and
// metalness (B) map at the same time. Gold zari and mirror-work are raised,
// metallic and smooth, so they glint as the head moves; the cotton stays matte.

type Pass = 'color' | 'mask';
const MASK = {
  cloth: 'rgb(70,232,0)',
  weaveHi: 'rgba(120,232,0,0.5)',
  weaveLo: 'rgba(25,232,0,0.5)',
  velvet: 'rgb(60,250,0)',
  thread: 'rgb(165,150,0)', // raised silk embroidery, semi-gloss
  gold: 'rgb(235,72,255)', // zari: raised, metallic, low roughness
  goldLo: 'rgb(165,115,235)', // satin-stitch dips across the zari
  mirror: 'rgb(150,10,255)', // shisha: flat, mirror-smooth, metal
  groove: 'rgb(8,242,0)',
} as const;
type MaskKind = keyof typeof MASK;

const GOLD = '#e8c06a';
const GOLD_DEEP = '#c9952f';
const GOLD_PALE = '#f6dc92';
const SILVER = '#e6edf4';

/** Seeded RNG so both passes draw identical "random" weave. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawCloth(pass: Pass): HTMLCanvasElement {
  const S = 2048; // drawing space
  const OUT = pass === 'color' ? 2048 : 1024;
  const px = S / GRID;
  const C = pass === 'color';
  const cv = document.createElement('canvas');
  cv.width = cv.height = OUT;
  const g = cv.getContext('2d')!;
  g.scale(OUT / S, OUT / S);
  const rand = rng(1931);
  const ink = (col: string, m: MaskKind) => (C ? col : MASK[m]);

  g.clearRect(0, 0, S, S);
  if (!C) {
    g.fillStyle = MASK.cloth;
    g.fillRect(0, 0, S, S);
  }

  const zari = (w: number, path: () => void, col: string = GOLD) => {
    g.beginPath();
    path();
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = ink(col, 'gold');
    g.stroke();
    // satin stitches: short dips across the thread so it reads as embroidery
    g.setLineDash([w * 0.5, w * 0.5]);
    g.lineWidth = w * 0.55;
    g.strokeStyle = ink('rgba(110,70,15,0.32)', 'goldLo');
    g.stroke();
    g.setLineDash([]);
  };
  const dot = (x: number, y: number, r: number, col: string, m: MaskKind) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = ink(col, m);
    g.fill();
  };
  const mirror = (x: number, y: number, r: number) => {
    dot(x, y, r, SILVER, 'mirror');
    zari(r * 0.32, () => g.arc(x, y, r * 1.12, 0, Math.PI * 2));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      zari(r * 0.16, () => {
        g.moveTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
        g.lineTo(x + Math.cos(a) * r * 1.75, y + Math.sin(a) * r * 1.75);
      }, GOLD_PALE);
    }
  };
  const paisley = (x: number, y: number, s: number, rot: number, body: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const path = () => {
      g.moveTo(0, -s);
      g.bezierCurveTo(s * 0.95, -s * 0.55, s * 0.85, s * 0.75, 0, s * 0.7);
      g.bezierCurveTo(-s * 0.8, s * 0.65, -s * 0.7, -s * 0.05, -s * 0.15, -s * 0.2);
      g.bezierCurveTo(s * 0.2, -s * 0.3, s * 0.15, -s * 0.75, 0, -s);
      g.closePath();
    };
    g.beginPath();
    path();
    g.fillStyle = ink(body, 'thread');
    g.fill();
    zari(s * 0.09, path);
    // inner teardrop and seed stitches
    zari(s * 0.06, () => {
      g.moveTo(s * 0.05, -s * 0.35);
      g.bezierCurveTo(s * 0.55, -s * 0.1, s * 0.45, s * 0.45, 0, s * 0.42);
    }, GOLD_PALE);
    g.restore();
    // a mirror in the paisley's belly (local (0.1s, 0.25s) rotated into place)
    const lx = s * 0.1, ly = s * 0.25;
    mirror(x + Math.cos(rot) * lx - Math.sin(rot) * ly, y + Math.sin(rot) * lx + Math.cos(rot) * ly, s * 0.16);
  };

  const armOf = (c: number, r: number) =>
    r >= 11 ? 'near' : r <= 7 ? 'far' : c >= 11 ? 'right' : c <= 7 ? 'left' : 'centre';

  // Home columns (each seat's run into the centre) are lighter.
  const homeCells = new Set<number>();
  for (const s of [0, 1] as Seat[])
    for (let i = HOME - 7; i < HOME; i++) {
      const [c, r] = PATHS[s][i];
      homeCells.add(c * 100 + r);
    }

  const base = new Color();
  const cream = new Color('#f3dfb0');
  for (let c = 0; c < GRID; c++) {
    for (let r = 0; r < GRID; r++) {
      if (!isBoardCell(c, r)) continue;
      const arm = armOf(c, r);
      if (arm === 'centre') continue;
      const x = c * px;
      const y = r * px;
      const home = homeCells.has(c * 100 + r);
      base.set(ARM_COLORS[arm]);
      if (home) base.lerp(cream, 0.28);
      if ((c + r) % 2 === 0) base.multiplyScalar(0.88);
      g.fillStyle = C ? `#${base.getHexString()}` : MASK.cloth;
      g.fillRect(x, y, px, px);
      // woven texture (and its relief in the mask)
      g.globalAlpha = C ? 0.09 : 1;
      for (let k = 0; k < 44; k++) {
        const hi = k % 2 === 0;
        g.fillStyle = C ? (hi ? '#fff' : '#000') : hi ? MASK.weaveHi : MASK.weaveLo;
        const yy = y + rand() * px;
        g.fillRect(x, yy, px, 1.5);
      }
      g.globalAlpha = 1;
      // dark seam between squares
      g.strokeStyle = ink('rgba(0,0,0,0.5)', 'groove');
      g.lineWidth = 2.5;
      g.strokeRect(x + 1, y + 1, px - 2, px - 2);
      // gold-thread border with a fine inner running stitch
      zari(4, () => g.rect(x + 5, y + 5, px - 10, px - 10));
      g.setLineDash([3, 5]);
      g.strokeStyle = ink('rgba(246,220,146,0.8)', 'gold');
      g.lineWidth = 1.6;
      g.strokeRect(x + 11, y + 11, px - 22, px - 22);
      g.setLineDash([]);
      // corner bootis: four gold seed stitches
      for (const [dx, dy] of [[14, 14], [px - 14, 14], [14, px - 14], [px - 14, px - 14]]) {
        dot(x + dx, y + dy, 2.6, GOLD_PALE, 'gold');
      }
      const cx = x + px / 2;
      const cy = y + px / 2;
      if (isSafeCell([c, r])) {
        drawCastle(cx, cy);
      } else if (home) {
        // chevron pointing toward the centre: the run home
        const dx = Math.sign(9 - c);
        const dy = Math.sign(9 - r);
        const s = px * 0.18;
        zari(5, () => {
          const ox = -dy, oy = dx; // perpendicular
          g.moveTo(cx - dx * s * 0.4 + ox * s, cy - dy * s * 0.4 + oy * s);
          g.lineTo(cx + dx * s * 0.6, cy + dy * s * 0.6);
          g.lineTo(cx - dx * s * 0.4 - ox * s, cy - dy * s * 0.4 - oy * s);
        }, GOLD_PALE);
      } else if ((c + r) % 2 === 1) {
        // small four-petal phool
        const s = px * 0.1;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          g.beginPath();
          g.ellipse(cx + Math.cos(a) * s, cy + Math.sin(a) * s, s * 0.85, s * 0.42, a, 0, Math.PI * 2);
          g.fillStyle = ink(GOLD, 'gold');
          g.fill();
        }
        dot(cx, cy, s * 0.45, '#f6ead0', 'thread');
      } else {
        // tiny diamond of seed stitches
        const s = px * 0.09;
        for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) dot(cx + ax * s, cy + ay * s, 3, GOLD_PALE, 'gold');
        dot(cx, cy, 3.4, '#f6ead0', 'thread');
      }
    }
  }

  function drawCastle(x: number, y: number) {
    const s = px * 0.36;
    zari(5, () => {
      g.moveTo(x - s, y - s);
      g.lineTo(x + s, y + s);
      g.moveTo(x + s, y - s);
      g.lineTo(x - s, y + s);
    }, GOLD_PALE);
    const diamond = () => {
      g.moveTo(x, y - s * 0.8);
      g.lineTo(x + s * 0.8, y);
      g.lineTo(x, y + s * 0.8);
      g.lineTo(x - s * 0.8, y);
      g.closePath();
    };
    g.beginPath();
    diamond();
    g.fillStyle = ink('#5a0f12', 'velvet');
    g.fill();
    zari(4.5, diamond, GOLD_PALE);
    mirror(x, y, s * 0.26);
    for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) dot(x + ax * s * 0.8, y + ay * s * 0.8, 4.5, SILVER, 'mirror');
  }

  // Char koni (centre 3x3): maroon velvet field with a gold lotus.
  const cx = 9.5 * px;
  const cy = 9.5 * px;
  g.fillStyle = ink('#5a0f12', 'velvet');
  g.fillRect(8 * px, 8 * px, 3 * px, 3 * px);
  zari(7, () => g.rect(8 * px + 7, 8 * px + 7, 3 * px - 14, 3 * px - 14));
  zari(2.5, () => g.rect(8 * px + 17, 8 * px + 17, 3 * px - 34, 3 * px - 34), GOLD_PALE);
  // paisley (buta) in each corner of the centre, curling toward the lotus
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const bx = cx + sx * px * 1.12;
    const by = cy + sy * px * 1.12;
    paisley(bx, by, px * 0.3, Math.atan2(sy, sx) - Math.PI / 2, '#8a1c1c');
  }
  // two-layer lotus
  const petal = (a: number, len: number, wid: number, fill: string, m: MaskKind) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    const path = () => {
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.4, -len * wid, len, 0);
      g.quadraticCurveTo(len * 0.4, len * wid, 0, 0);
      g.closePath();
    };
    g.beginPath();
    path();
    g.fillStyle = ink(fill, m);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = ink(GOLD_DEEP, 'goldLo');
    g.stroke();
    // centre vein
    g.beginPath();
    g.moveTo(len * 0.2, 0);
    g.lineTo(len * 0.85, 0);
    g.strokeStyle = ink('rgba(120,60,10,0.6)', 'goldLo');
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  };
  for (let k = 0; k < 12; k++) petal((k / 12) * Math.PI * 2 + Math.PI / 12, 1.08 * px, 0.32, GOLD_DEEP, 'gold');
  for (let k = 0; k < 12; k++) petal((k / 12) * Math.PI * 2, 0.82 * px, 0.34, GOLD_PALE, 'gold');
  dot(cx, cy, px * 0.34, '#7a1418', 'velvet');
  zari(6, () => g.arc(cx, cy, px * 0.34, 0, Math.PI * 2), GOLD_PALE);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    dot(cx + Math.cos(a) * px * 0.25, cy + Math.sin(a) * px * 0.25, 3.2, GOLD_PALE, 'gold');
  }
  mirror(cx, cy, px * 0.12);

  // Thick gold piping around the cross outline, with a rope twist.
  const P = (c: number, r: number) => [c * px, r * px] as const;
  const outline: (readonly [number, number])[] = [
    P(8, 0), P(11, 0), P(11, 8), P(19, 8), P(19, 11), P(11, 11), P(11, 19),
    P(8, 19), P(8, 11), P(0, 11), P(0, 8), P(8, 8),
  ];
  const outlinePath = () => {
    outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  zari(14, outlinePath, GOLD_DEEP);
  g.beginPath();
  outlinePath();
  g.setLineDash([6, 6]);
  g.lineWidth = 9;
  g.strokeStyle = ink(GOLD_PALE, 'gold');
  g.stroke();
  g.setLineDash([]);
  return cv;
}

function woodTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#4a200d';
  g.fillRect(0, 0, 512, 512);
  const rand = rng(77);
  for (let i = 0; i < 140; i++) {
    const y0 = rand() * 512;
    const amp = 2 + rand() * 6;
    const f = 0.006 + rand() * 0.01;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const y = y0 + Math.sin(x * f + i) * amp + Math.sin(x * 0.031 + i * 3) * 1.2;
      if (x) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.strokeStyle = rand() < 0.55 ? 'rgba(30,8,2,0.4)' : 'rgba(120,60,26,0.3)';
    g.lineWidth = 0.6 + rand() * 2.2;
    g.stroke();
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 3);
  t.anisotropy = 4;
  return t;
}

function crossShape(margin: number): Shape {
  const a = 1.5 * CELL + margin;
  const b = HALF + margin;
  const s = new Shape();
  const pts = [
    [-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b],
    [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a],
  ];
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

// ───────────────────────── pieces ─────────────────────────

const PIECE_H = 0.026;
const PIECE_R = 0.0085;
function pieceRadius(t: number): number {
  return PIECE_R * (0.96 - 0.25 * t) * Math.cos(t * Math.PI * 0.48) + 0.0012;
}

/** Beehive-shaped goti (chausar piece). */
function pieceGeometry(): LatheGeometry {
  const pts: Vector2[] = [];
  const h = PIECE_H;
  pts.push(new Vector2(0, 0));
  pts.push(new Vector2(PIECE_R, 0));
  pts.push(new Vector2(PIECE_R * 1.02, h * 0.08));
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    pts.push(new Vector2(pieceRadius(t), h * (0.08 + 0.78 * t)));
  }
  pts.push(new Vector2(0.0022, h * 0.9));
  pts.push(new Vector2(0.0018, h * 0.98));
  pts.push(new Vector2(0, h));
  return new LatheGeometry(pts, 24);
}

/** Gold trim: a base band, a waist band and a finial, merged into one draw. */
function trimGeometry(): ReturnType<typeof mergeGeometries> {
  const band = (t: number, tube: number) => {
    const g = new TorusGeometry(pieceRadius(t) + 0.0001, tube, 6, 24);
    g.rotateX(Math.PI / 2);
    g.translate(0, PIECE_H * (0.08 + 0.78 * t), 0);
    return g;
  };
  const foot = new TorusGeometry(PIECE_R * 1.01, 0.0011, 6, 24);
  foot.rotateX(Math.PI / 2);
  foot.translate(0, PIECE_H * 0.05, 0);
  const finial = new SphereGeometry(0.0024, 12, 8);
  finial.translate(0, PIECE_H + 0.0012, 0);
  return mergeGeometries([foot, band(0.28, 0.0008), band(0.62, 0.0009), finial]);
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export class PieceView {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  /** Inverted-hull gold outline shown on legal pieces (see setHighlight). */
  readonly outline: Mesh;
  readonly seat: Seat;
  readonly index: number;
  glow = 0;
  private hlOn = false;
  private hlChanged = -1e9;
  private outlineMat: MeshBasicMaterial;

  constructor(seat: Seat, index: number, geo: LatheGeometry, trimGeo?: ReturnType<typeof mergeGeometries>, trimMat?: Material) {
    this.seat = seat;
    this.index = index;
    this.material = new MeshPhysicalMaterial({
      color: seat === 0 ? '#d9650c' : '#4b2c9e',
      roughness: 0.45,
      metalness: 0.0,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      envMapIntensity: 0.7,
      emissive: new Color(SEAT_COLORS[seat]),
      emissiveIntensity: 0,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = `piece-${seat ? 'shakuni' : 'player'}-${index}`;
    this.mesh.castShadow = true;
    const trim = new Mesh(
      trimGeo ?? trimGeometry(),
      trimMat ?? new MeshStandardMaterial({ color: '#f0c862', metalness: 1, roughness: 0.22 }),
    );
    trim.castShadow = true;
    this.mesh.add(trim);

    this.outlineMat = new MeshBasicMaterial({
      color: '#fff1b8',
      side: BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    this.outline = new Mesh(geo, this.outlineMat);
    this.outline.name = `${this.mesh.name}-outline`;
    this.outline.visible = false;
    this.outline.renderOrder = 2;
    // Self-animating (no per-frame call needed): pop-in with easeOutBack, then pulse.
    this.outline.onBeforeRender = () => {
      const now = performance.now() / 1000;
      const k = now - this.hlChanged;
      let s: number;
      let a: number;
      if (this.hlOn) {
        s = easeOutBack(Math.min(1, k / 0.28));
        a = 0.7 + 0.3 * Math.sin(now * 6.5);
        s *= 1 + 0.035 * Math.sin(now * 6.5);
      } else {
        const f = Math.max(0, 1 - k / 0.14);
        s = f;
        a = 0.8 * f;
        if (f <= 0) this.outline.visible = false;
      }
      this.outline.scale.set(1 + 0.28 * s, 1 + 0.11 * s, 1 + 0.28 * s);
      this.outline.position.y = -0.0006;
      this.outlineMat.opacity = a;
      this.outline.updateMatrixWorld();
    };
    this.mesh.add(this.outline);
  }

  setGlow(v: number): void {
    this.glow = v;
    this.material.emissiveIntensity = v;
  }

  /** Gold pulsing outline for a legal move; pops in with easeOutBack. Idempotent. */
  setHighlight(on: boolean): void {
    if (on === this.hlOn) return;
    this.hlOn = on;
    this.hlChanged = performance.now() / 1000;
    if (on) this.outline.visible = true;
  }

  get highlighted(): boolean {
    return this.hlOn;
  }
}

export interface BoardView {
  root: Group;
  cloth: Mesh;
  pieces: PieceView[][];
  markers: Mesh[];
  gong: Group;
  gongDisc: Mesh;
  /** Local position of the gong's striking face. */
  gongCenter: Vector3;
  /** Invisible plane on the table that shows only received shadows. */
  shadowCatcher: Mesh;
  /** Swaying arm-tip tassels (animated in their shader; no update call needed). */
  tassels: Group;
}

export function piecePosition(
  seat: Seat,
  index: number,
  piece: number,
  sameSquare: number,
  out: Vector3,
): Vector3 {
  if (index === START) {
    // waiting beside the entry square, outside the board
    const sgn = seat === 0 ? 1 : -1;
    return out.set(sgn * (2.6 + piece * 1.1) * CELL, SURFACE_Y - 0.002, sgn * 9.9 * CELL);
  }
  if (index >= HOME) {
    const sgn = seat === 0 ? 1 : -1;
    return out.set((piece - 0.5) * CELL * 0.9, SURFACE_Y, sgn * 0.6 * CELL);
  }
  const cell = cellOf(seat, index)!;
  cellLocal(cell[0], cell[1], out);
  if (sameSquare > 0) {
    out.x += (sameSquare % 2 ? 1 : -1) * CELL * 0.22;
    out.z += (seat ? -1 : 1) * CELL * 0.22;
  }
  return out;
}

/** Shared uniform for every time-animated board shader (tassels). */
const boardTime = { value: 0 };

/** Tassels: 8 at the arm-tip corners, draped onto the table, swaying gently. */
function buildTassels(): Group {
  const group = new Group();
  group.name = 'tassels';
  const L = 0.03;
  const cord = new CylinderGeometry(0.0006, 0.0006, 0.007, 5, 1);
  cord.translate(0, -0.0035, 0);
  const cap = new SphereGeometry(0.0026, 10, 6);
  cap.scale(1, 1.3, 1);
  cap.translate(0, -0.0085, 0);
  const goldGeo = mergeGeometries([cord, cap]);
  const skirtPts: Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    skirtPts.push(new Vector2(0.0016 + 0.0026 * Math.pow(t, 0.7), -0.0095 - t * (L - 0.0095)));
  }
  skirtPts.push(new Vector2(0, -L));
  const skirtGeo = new LatheGeometry(skirtPts, 12);

  const patch = (m: MeshStandardMaterial) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = boardTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float ph = 0.0;
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].x * 41.0 + instanceMatrix[3].z * 23.0;
          #endif
          float a1 = 0.16 * sin(uTime * 1.3 + ph) + 0.05 * sin(uTime * 3.1 + ph * 2.0);
          float a2 = 0.10 * sin(uTime * 1.9 + ph * 1.7);
          float c1 = cos(a1), s1 = sin(a1), c2 = cos(a2), s2 = sin(a2);
          transformed.xy = mat2(c1, s1, -s1, c1) * transformed.xy;
          transformed.zy = mat2(c2, s2, -s2, c2) * transformed.zy;`,
        );
    };
  };
  const goldMat = new MeshStandardMaterial({ color: '#f0c862', metalness: 1, roughness: 0.3 });
  const threadMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 });
  patch(goldMat);
  patch(threadMat);

  const a = 1.5 * CELL + 0.008;
  const b = HALF + 0.012;
  const spots: [number, number, number][] = []; // x, z, outward yaw
  for (const [ax, az] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    for (const s of [-1, 1]) {
      const x = ax ? ax * b : s * a;
      const z = az ? az * b : s * a;
      spots.push([x, z, Math.atan2(x, z)]);
    }
  }
  const caps = new InstancedMesh(goldGeo, goldMat, spots.length);
  const skirts = new InstancedMesh(skirtGeo, threadMat, spots.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const o = new Object3D();
  const col = new Color();
  const armCol = [ARM_COLORS.far, ARM_COLORS.far, ARM_COLORS.near, ARM_COLORS.near, ARM_COLORS.left, ARM_COLORS.left, ARM_COLORS.right, ARM_COLORS.right];
  spots.forEach(([x, z, yaw], i) => {
    o.position.set(x, SURFACE_Y - 0.001, z);
    // hang down, then tip ~62° outward so it drapes onto the table
    o.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    q.setFromAxisAngle(new Vector3(1, 0, 0), -1.08);
    o.quaternion.multiply(q);
    o.updateMatrix();
    m.copy(o.matrix);
    caps.setMatrixAt(i, m);
    skirts.setMatrixAt(i, m);
    col.set(armCol[i]).lerp(new Color('#e8c06a'), 0.15);
    skirts.setColorAt(i, col);
  });
  // time drives the sway; written once per rendered frame
  skirts.onBeforeRender = () => {
    boardTime.value = performance.now() / 1000;
  };
  caps.frustumCulled = skirts.frustumCulled = false;
  group.add(caps, skirts);
  return group;
}

export function buildBoard(): BoardView {
  const root = new Group();
  root.name = 'chausar-board';

  // Carved, lacquered wooden base: a stepped plinth, a bevelled body and a
  // brass inlay line framing the cloth.
  const wood = new MeshPhysicalMaterial({
    color: '#c9a48c',
    map: woodTexture(),
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.45,
  });
  const base = new Mesh(
    new ExtrudeGeometry(crossShape(0.012), {
      depth: SURFACE_Y - 0.003,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.004,
      bevelSegments: 3,
    }),
    wood,
  );
  base.rotation.x = -Math.PI / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  base.name = 'board-base';
  root.add(base);

  const plinth = new Mesh(
    new ExtrudeGeometry(crossShape(0.021), {
      depth: 0.002,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0025,
      bevelSegments: 2,
    }),
    wood,
  );
  plinth.rotation.x = -Math.PI / 2;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  root.add(plinth);

  const brass = new MeshStandardMaterial({ color: '#e2b65a', metalness: 1, roughness: 0.24 });
  const inlayShape = crossShape(0.0088);
  inlayShape.holes.push(crossShape(0.0052));
  const inlay = new Mesh(new ShapeGeometry(inlayShape), brass);
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = SURFACE_Y + 0.0002;
  inlay.receiveShadow = true;
  inlay.name = 'brass-inlay';
  root.add(inlay);

  const tex = new CanvasTexture(drawCloth('color'));
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  const surf = new CanvasTexture(drawCloth('mask'));
  surf.anisotropy = 8;
  const cloth = new Mesh(
    new PlaneGeometry(GRID * CELL, GRID * CELL),
    new MeshStandardMaterial({
      map: tex,
      bumpMap: surf,
      bumpScale: 1.6,
      roughnessMap: surf,
      roughness: 1,
      metalnessMap: surf,
      metalness: 1,
      alphaTest: 0.5,
      side: DoubleSide,
      envMapIntensity: 0.75,
    }),
  );
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.y = SURFACE_Y + 0.0005;
  cloth.name = 'cloth';
  cloth.receiveShadow = true;
  root.add(cloth);

  // brass studs at the arm tips (one instanced draw)
  const studs = new InstancedMesh(new SphereGeometry(0.004, 12, 8), brass, 8);
  const o = new Object3D();
  let n = 0;
  for (const [x, z] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    for (const s of [-1, 1]) {
      const along = HALF + 0.006;
      const across = 1.5 * CELL + 0.006;
      o.position.set(x ? x * along : s * across, SURFACE_Y - 0.001, z ? z * along : s * across);
      o.updateMatrix();
      studs.setMatrixAt(n++, o.matrix);
    }
  }
  studs.castShadow = true;
  root.add(studs);

  const tassels = buildTassels();
  root.add(tassels);

  const geo = pieceGeometry();
  const trimGeo = trimGeometry();
  const trimMat = new MeshStandardMaterial({ color: '#f0c862', metalness: 1, roughness: 0.2 });
  const pieces: PieceView[][] = [[], []];
  for (const seat of [0, 1] as Seat[])
    for (let i = 0; i < 2; i++) {
      const p = new PieceView(seat, i, geo, trimGeo, trimMat);
      root.add(p.mesh);
      pieces[seat].push(p);
    }

  const markerMat = new MeshBasicMaterial({
    color: '#ffe9a8',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  const markers: Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const m = new Mesh(new RingGeometry(CELL * 0.3, CELL * 0.45, 24), markerMat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    root.add(m);
    markers.push(m);
  }

  // The accusation gong, in the empty near-left corner of the cross
  // (always on the table, within easy reach of the left hand).
  const gong = new Group();
  gong.name = 'gong';
  gong.position.set(-0.15, 0, 0.16);
  gong.scale.setScalar(0.85);
  const postGeo = new CylinderGeometry(0.004, 0.005, 0.2, 8);
  for (const s of [-1, 1]) {
    const post = new Mesh(postGeo, wood);
    post.position.set(s * 0.07, 0.1, 0);
    post.castShadow = true;
    gong.add(post);
  }
  const bar = new Mesh(new CylinderGeometry(0.004, 0.004, 0.16, 8), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.198;
  bar.castShadow = true;
  gong.add(bar);
  const bronze = new MeshStandardMaterial({
    color: '#c8923a',
    metalness: 1,
    roughness: 0.26,
    emissive: new Color('#ff9a2e'),
    emissiveIntensity: 0,
  });
  const gongDisc = new Mesh(new CylinderGeometry(0.052, 0.052, 0.006, 40), bronze);
  gongDisc.rotation.x = Math.PI / 2;
  gongDisc.position.set(0, 0.12, 0);
  gongDisc.name = 'gong-disc';
  gongDisc.castShadow = true;
  gong.add(gongDisc);
  const boss = new Mesh(new SphereGeometry(0.014, 16, 10), bronze);
  boss.scale.z = 0.4;
  boss.position.set(0, 0.12, 0.004);
  gong.add(boss);
  gong.rotation.y = Math.PI / 10; // angled toward the player
  root.add(gong);
  const gongCenter = new Vector3(0, 0.12, 0).multiplyScalar(0.85).applyEuler(gong.rotation).add(gong.position);

  // Shadow-only plane on the real table under (and around) the board.
  const shadowCatcher = new Mesh(
    new PlaneGeometry(0.95, 0.95),
    new ShadowMaterial({ color: '#1a0c04', opacity: 0.38, depthWrite: false }),
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.0004;
  shadowCatcher.receiveShadow = true;
  shadowCatcher.renderOrder = -1;
  shadowCatcher.name = 'shadow-catcher';
  root.add(shadowCatcher);

  return { root, cloth, pieces, markers, gong, gongDisc, gongCenter, shadowCatcher, tassels };
}

/**
 * Opt a hierarchy into the key light's shadow map: every opaque mesh casts,
 * and (optionally) receives. Transparent / additive things are skipped.
 * Use for the dice group or Shakuni; buildBoard() already sets its own flags.
 */
export function enableBoardShadows(root: Object3D, receive = false): void {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as Material;
    if (Array.isArray(mat) || mat.transparent || m.name === 'shadow-catcher') return;
    m.castShadow = true;
    if (receive) m.receiveShadow = true;
  });
}
