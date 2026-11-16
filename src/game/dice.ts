import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { CELL, HALF, SURFACE_Y } from './board.js';
import { mergeGeometries } from './geo.js';
import { PASA_FACES } from './rules.js';

/**
 * Long four-sided pasa dice with a small custom rigid-body simulation in
 * board-local space (no Havok).
 *
 * Why custom: the game must be able to force an outcome (loaded dice) without
 * the throw looking scripted. The dice fly and bounce for real; only in the
 * last ~0.3 s does the settle step roll each bar about its long axis onto the
 * chosen face — which is exactly how a long die topples anyway.
 */

export const DIE_L = 0.066;
export const DIE_W = 0.015;
const GRAVITY = -9.81;
const SUBSTEP = 1 / 240;
const RESTITUTION = 0.25;
const FRICTION = 0.65;

// Body axes whose face shows PASA_FACES[k] when pointing up.
const FACE_AXES = [
  new Vector3(0, 1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, -1),
];

/**
 * One 512×640 atlas: five 128 px strips — faces 1, 2, 6, 5 and a plain end
 * cap — so each die is a single draw call (was six materials per die).
 */
const STRIP = 128;
function diceAtlas(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = STRIP * 5;
  const g = cv.getContext('2d')!;
  const layouts: Record<number, [number, number][]> = {
    1: [[256, 64]],
    2: [[176, 64], [336, 64]],
    5: [[96, 64], [176, 64], [256, 64], [336, 64], [416, 64]],
    6: [[136, 38], [256, 38], [376, 38], [136, 90], [256, 90], [376, 90]],
  };
  const strip = (row: number, value: number | null) => {
    const y0 = row * STRIP;
    g.fillStyle = value === null ? '#e9d8b4' : '#f3e7cd';
    g.fillRect(0, y0, 512, STRIP);
    g.globalAlpha = 0.12; // faint bone grain
    for (let i = 0; i < 30; i++) {
      g.fillStyle = i % 2 ? '#a08860' : '#fff';
      g.fillRect(0, y0 + Math.random() * STRIP, 512, 1 + Math.random() * 2);
    }
    g.globalAlpha = 1;
    if (value === null) return;
    for (const [x, y] of layouts[value]) {
      g.beginPath();
      g.arc(x, y0 + y, 17, 0, Math.PI * 2);
      g.strokeStyle = '#7a1418';
      g.lineWidth = 5;
      g.stroke();
      g.beginPath();
      g.arc(x, y0 + y, 7, 0, Math.PI * 2);
      g.fillStyle = '#1c0d06';
      g.fill();
    }
    g.fillStyle = '#7a1418'; // carved end bands
    g.fillRect(14, y0, 6, STRIP);
    g.fillRect(492, y0, 6, STRIP);
  };
  PASA_FACES.forEach((v, i) => strip(i, v));
  strip(4, null);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Box with its six faces' UVs remapped into the atlas strips. */
function dieGeometry(): BoxGeometry {
  const geo = new BoxGeometry(DIE_L, DIE_W, DIE_W);
  const uv = geo.getAttribute('uv');
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const rowOfFace = [4, 4, 0, 2, 1, 3]; // +y→1, +z→2, -y→6, -z→5
  for (let f = 0; f < 6; f++) {
    const row = rowOfFace[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const v = uv.getY(i);
      // canvas row 0 is at the top; texture v=1 is the top
      uv.setY(i, 1 - (row + 1 - v) / 5);
    }
  }
  uv.needsUpdate = true;
  geo.clearGroups();
  return geo;
}

let atlas: CanvasTexture | null = null;
let sharedGeo: BoxGeometry | null = null;
let capGeo: ReturnType<typeof mergeGeometries> | null = null;
let capMat: MeshStandardMaterial | null = null;

/** Visual-only brass end caps (both ends, one draw). Physics uses DIE_L × DIE_W only. */
function endCapGeometry(): ReturnType<typeof mergeGeometries> {
  const len = 0.0042;
  const w = DIE_W * 1.035;
  const parts = [-1, 1].map((s) => {
    const b = new BoxGeometry(len, w, w);
    b.translate(s * (DIE_L / 2 - len / 2 + 0.0004), 0, 0);
    return b;
  });
  return mergeGeometries(parts);
}

export class Die {
  readonly mesh: Mesh;
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  readonly quat = new Quaternion();
  readonly angVel = new Vector3();
  /** 'held' follows an anchor; 'flying' simulates; 'settling' blends to a face; 'rest'. */
  mode: 'held' | 'flying' | 'settling' | 'rest' = 'rest';
  value = 1;
  forcedFace: number | null = null;
  airTime = 0;
  quietTime = 0;
  private settleT = 0;
  private settleDur = 0.3;
  private settleFrom = new Quaternion();
  private settleTo = new Quaternion();
  private settleY0 = 0;
  private hop = 0;
  readonly glowMats: MeshStandardMaterial[];

  constructor(name: string) {
    // One material per die so a loaded die can glint on its own.
    atlas ??= diceAtlas();
    sharedGeo ??= dieGeometry();
    // polished bone/ivory: soft clearcoat so the bars catch the key light
    const mat = new MeshPhysicalMaterial({
      map: atlas,
      roughness: 0.48,
      clearcoat: 0.6,
      clearcoatRoughness: 0.18,
    });
    mat.emissive = new Color('#ffcc55');
    mat.emissiveIntensity = 0;
    this.glowMats = [mat];
    this.mesh = new Mesh(sharedGeo, mat);
    this.mesh.name = name;
    this.mesh.castShadow = true;
    capGeo ??= endCapGeometry();
    capMat ??= new MeshStandardMaterial({ color: '#d9a94c', metalness: 1, roughness: 0.28 });
    const caps = new Mesh(capGeo, capMat);
    caps.castShadow = true;
    caps.name = `${name}-caps`;
    this.mesh.add(caps);
  }

  setGlow(v: number, color?: string): void {
    for (const m of this.glowMats) {
      if (color) m.emissive.set(color);
      m.emissiveIntensity = v;
    }
  }

  /** Index (0..3) of the face currently pointing most upward. */
  upFace(): number {
    let best = 0;
    let bestY = -2;
    const v = tmpA;
    FACE_AXES.forEach((ax, k) => {
      v.copy(ax).applyQuaternion(this.quat);
      if (v.y > bestY) {
        bestY = v.y;
        best = k;
      }
    });
    return best;
  }

  sync(): void {
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
  }

  beginSettle(): void {
    const natural = this.upFace();
    const k = this.forcedFace ?? natural;
    // Keep the bar's heading; roll it about its long axis onto face k.
    const axis = tmpA.set(1, 0, 0).applyQuaternion(this.quat);
    axis.y = 0;
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    let bestQ: Quaternion | null = null;
    let bestDot = -1;
    for (const sgn of [1, -1]) {
      const yaw = Math.atan2(-axis.z * sgn, axis.x * sgn);
      const qYaw = tmpQ1.setFromAxisAngle(UP, yaw);
      const qRoll = tmpQ2.setFromAxisAngle(X, (-k * Math.PI) / 2);
      const cand = new Quaternion().multiplyQuaternions(qYaw, qRoll);
      const d = Math.abs(cand.dot(this.quat));
      if (d > bestDot) {
        bestDot = d;
        bestQ = cand;
      }
    }
    this.settleFrom.copy(this.quat);
    this.settleTo.copy(bestQ!);
    const angle = 2 * Math.acos(Math.min(1, bestDot));
    this.settleDur = 0.22 + 0.3 * (angle / Math.PI);
    this.hop = 0.012 * (angle / Math.PI);
    this.settleT = 0;
    this.settleY0 = this.pos.y;
    this.value = PASA_FACES[k];
    this.mode = 'settling';
  }

  /** Quarter-roll onto the next face (the nudge cheat). */
  flip(): void {
    if (this.mode !== 'rest') return;
    const axis = tmpA.set(1, 0, 0).applyQuaternion(this.quat);
    const roll = tmpQ1.setFromAxisAngle(axis, Math.PI / 2);
    this.settleFrom.copy(this.quat);
    this.settleTo.copy(roll).multiply(this.quat);
    this.settleDur = 0.22;
    this.hop = 0.01;
    this.settleT = 0;
    this.settleY0 = this.pos.y;
    this.mode = 'settling';
    // value follows whichever face ends up on top
    const save = this.quat.clone();
    this.quat.copy(this.settleTo);
    this.value = PASA_FACES[this.upFace()];
    this.quat.copy(save);
  }

  updateSettle(dt: number): void {
    this.settleT += dt;
    const t = Math.min(1, this.settleT / this.settleDur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    this.quat.slerpQuaternions(this.settleFrom, this.settleTo, e);
    const restY = floorAt(this.pos.x, this.pos.z) + DIE_W / 2;
    this.pos.y =
      this.settleY0 + (restY - this.settleY0) * e + Math.sin(Math.PI * t) * this.hop;
    if (t >= 1) {
      this.mode = 'rest';
      this.vel.set(0, 0, 0);
      this.angVel.set(0, 0, 0);
    }
  }
}

const UP = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpD = new Vector3();
const tmpQ1 = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpM = new Matrix3();
const tmpR = new Matrix3();
const tmpMat4 = new Matrix4();

/** The board is a raised cross; the corner courts are the bare table. */
export function floorAt(x: number, z: number): number {
  const a = 1.5 * CELL + 0.012;
  const b = HALF + 0.012;
  const inCross =
    (Math.abs(x) <= a && Math.abs(z) <= b) || (Math.abs(z) <= a && Math.abs(x) <= b);
  return inCross ? SURFACE_Y : 0;
}

const INV_I_BODY = (() => {
  const m = 1;
  const ixx = (m * (DIE_W * DIE_W * 2)) / 12;
  const iyy = (m * (DIE_L * DIE_L + DIE_W * DIE_W)) / 12;
  return new Vector3(1 / ixx, 1 / iyy, 1 / iyy);
})();

const CORNERS = (() => {
  const out: Vector3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        out.push(new Vector3((sx * DIE_L) / 2, (sy * DIE_W) / 2, (sz * DIE_W) / 2));
  return out;
})();

export type ImpactFn = (strength: number, x: number) => void;

export class DiceSet {
  readonly group = new Group();
  readonly dice: Die[];
  private acc = 0;
  onImpact: ImpactFn = () => {};

  constructor(prefix: string) {
    this.dice = [0, 1, 2].map((i) => new Die(`${prefix}-pasa-${i}`));
    for (const d of this.dice) this.group.add(d.mesh);
  }

  get allRest(): boolean {
    return this.dice.every((d) => d.mode === 'rest');
  }

  get values(): number[] {
    return this.dice.map((d) => d.value);
  }

  /** Lay the dice neatly at a spot (board-local). */
  placeAt(center: Vector3, yaw: number): void {
    this.dice.forEach((d, i) => {
      d.mode = 'rest';
      d.pos.set(
        center.x + Math.cos(yaw) * (i - 1) * DIE_W * 1.6,
        floorAt(center.x, center.z) + DIE_W / 2,
        center.z - Math.sin(yaw) * (i - 1) * DIE_W * 1.6,
      );
      d.quat.setFromAxisAngle(UP, yaw + Math.PI / 2);
      d.vel.set(0, 0, 0);
      d.angVel.set(0, 0, 0);
      d.forcedFace = null;
      d.setGlow(0);
      d.sync();
    });
  }

  private slideFrom: { p: Vector3; q: Quaternion }[] = [];
  private slideTo: { p: Vector3; q: Quaternion }[] = [];

  /** Start sliding the dice across the table to a neat row at `center`. */
  beginSlide(center: Vector3, yaw: number): void {
    this.slideFrom = this.dice.map((d) => ({ p: d.pos.clone(), q: d.quat.clone() }));
    this.placeAt(center, yaw);
    this.slideTo = this.dice.map((d) => ({ p: d.pos.clone(), q: d.quat.clone() }));
    this.dice.forEach((d, i) => {
      d.pos.copy(this.slideFrom[i].p);
      d.quat.copy(this.slideFrom[i].q);
      d.sync();
    });
  }

  /** e: eased progress 0..1 */
  updateSlide(e: number): void {
    this.dice.forEach((d, i) => {
      const a = this.slideFrom[i];
      const b = this.slideTo[i];
      if (!a || !b) return;
      d.pos.lerpVectors(a.p, b.p, e);
      d.pos.y = Math.max(d.pos.y, b.p.y) + Math.sin(Math.PI * e) * 0.02;
      d.quat.slerpQuaternions(a.q, b.q, e);
      d.mode = 'rest';
      d.sync();
    });
  }

  /** Follow a holding anchor (board-local position + orientation). */
  holdAt(anchor: Vector3, anchorQuat: Quaternion, time: number, shake: number): void {
    this.dice.forEach((d, i) => {
      d.mode = 'held';
      tmpA.set((i - 1) * DIE_W * 1.1, -0.012, 0.0).applyQuaternion(anchorQuat);
      d.pos.copy(anchor).add(tmpA);
      const j = shake * 0.004;
      d.pos.x += Math.sin(time * 41 + i * 2.1) * j;
      d.pos.y += Math.sin(time * 37 + i * 1.3) * j;
      d.quat.copy(anchorQuat).multiply(tmpQ1.setFromAxisAngle(UP, Math.PI / 2 + (i - 1) * 0.08));
      d.quat.multiply(tmpQ2.setFromAxisAngle(X, Math.sin(time * 23 + i) * shake * 0.6));
      d.sync();
    });
  }

  /** Release all dice with a velocity (board-local). `forced` = PASA_FACES indices or null. */
  release(vel: Vector3, spin: number, forced: (number | null)[] | null): void {
    this.dice.forEach((d, i) => {
      d.mode = 'flying';
      d.airTime = 0;
      d.quietTime = 0;
      d.vel.copy(vel);
      d.vel.x += (Math.random() - 0.5) * 0.12;
      d.vel.z += (Math.random() - 0.5) * 0.12;
      // fair dice: random starting roll about the long axis (invisible at release speed)
      d.quat.multiply(tmpQ2.setFromAxisAngle(X, Math.random() * Math.PI * 2));
      // tumble mostly about the long axis, like a real pasa
      tmpA.set(1, 0, 0).applyQuaternion(d.quat);
      d.angVel.copy(tmpA).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * spin * (0.8 + Math.random() * 0.6));
      d.angVel.x += (Math.random() - 0.5) * 6;
      d.angVel.z += (Math.random() - 0.5) * 6;
      d.forcedFace = forced ? forced[i] : null;
    });
  }

  update(dt: number): void {
    const step = Math.min(dt, 1 / 30);
    this.acc += step;
    while (this.acc >= SUBSTEP) {
      this.acc -= SUBSTEP;
      for (const d of this.dice) if (d.mode === 'flying') this.integrate(d, SUBSTEP);
      this.collideDice();
    }
    for (const d of this.dice) {
      if (d.mode === 'flying') {
        d.airTime += step;
        const quiet = d.vel.length() < 0.07 && d.angVel.length() < 3.5 && d.pos.y < floorAt(d.pos.x, d.pos.z) + DIE_W;
        d.quietTime = quiet ? d.quietTime + step : 0;
        if (d.quietTime > 0.1 || d.airTime > 2.2) d.beginSettle();
      } else if (d.mode === 'settling') {
        d.updateSettle(step);
      }
      d.sync();
    }
  }

  private invInertiaWorld(d: Die): Matrix3 {
    tmpR.setFromMatrix4(tmpMat4.makeRotationFromQuaternion(d.quat));
    const r = tmpR.elements;
    const i = INV_I_BODY;
    // R * diag(i) * R^T
    const e = tmpM.elements;
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) {
        e[a + b * 3] =
          r[a] * i.x * r[b] + r[a + 3] * i.y * r[b + 3] + r[a + 6] * i.z * r[b + 6];
      }
    return tmpM;
  }

  private applyImpulse(d: Die, r: Vector3, j: Vector3, invI: Matrix3): void {
    d.vel.add(j);
    tmpD.crossVectors(r, j).applyMatrix3(invI);
    d.angVel.add(tmpD);
  }

  private integrate(d: Die, h: number): void {
    d.vel.y += GRAVITY * h;
    d.vel.multiplyScalar(1 - 0.15 * h);
    d.angVel.multiplyScalar(1 - 0.6 * h);
    d.pos.addScaledVector(d.vel, h);
    const w = d.angVel;
    const ang = w.length();
    if (ang > 1e-6) {
      tmpQ1.setFromAxisAngle(tmpA.copy(w).divideScalar(ang), ang * h);
      d.quat.premultiply(tmpQ1).normalize();
    }

    // Keep inside the board footprint (invisible low rails).
    const lim = HALF - 0.01;
    for (const ax of ['x', 'z'] as const) {
      if (Math.abs(d.pos[ax]) > lim) {
        d.pos[ax] = Math.sign(d.pos[ax]) * lim;
        if (Math.sign(d.vel[ax]) === Math.sign(d.pos[ax])) {
          d.vel[ax] *= -0.35;
          this.onImpact(0.4, d.pos.x);
        }
      }
    }

    // Floor contacts at the 8 corners.
    const invI = this.invInertiaWorld(d);
    let deepest = 0;
    for (const c of CORNERS) {
      const r = tmpB.copy(c).applyQuaternion(d.quat);
      const px = d.pos.x + r.x;
      const py = d.pos.y + r.y;
      const pz = d.pos.z + r.z;
      const floor = floorAt(px, pz);
      const pen = floor - py;
      if (pen <= 0) continue;
      deepest = Math.max(deepest, pen);
      // velocity at the contact point
      const vc = tmpC.crossVectors(d.angVel, r).add(d.vel);
      const vn = vc.y;
      if (vn < 0) {
        const rxn = tmpA.set(-r.z, 0, r.x); // r × (0,1,0)
        const k = 1 + tmpD.copy(rxn).applyMatrix3(invI).cross(r).y;
        const jn = (-(1 + (vn < -0.3 ? RESTITUTION : 0)) * vn) / k;
        this.applyImpulse(d, r, tmpA.set(0, jn, 0), invI);
        if (jn > 0.15) this.onImpact(Math.min(1, jn * 0.8), d.pos.x);
        // friction
        const vc2 = tmpC.crossVectors(d.angVel, r).add(d.vel);
        vc2.y = 0;
        const vt = vc2.length();
        if (vt > 1e-5) {
          const t = vc2.divideScalar(vt);
          const kt = 1 + tmpD.crossVectors(r, t).applyMatrix3(invI).cross(r).dot(t);
          const jt = Math.min(vt / kt, FRICTION * jn);
          this.applyImpulse(d, r, t.multiplyScalar(-jt), invI);
        }
      }
    }
    if (deepest > 0) {
      d.pos.y += deepest * 0.9;
      // rolling resistance of cloth/wood: kills the endless rocking
      d.angVel.multiplyScalar(1 - 5 * h);
      d.vel.x *= 1 - 2.5 * h;
      d.vel.z *= 1 - 2.5 * h;
    }
  }

  /** Bars as three spheres each; push apart and trade a little velocity. */
  private collideDice(): void {
    const R = DIE_W * 0.72;
    const ds = this.dice;
    for (let i = 0; i < ds.length; i++)
      for (let j = i + 1; j < ds.length; j++) {
        const a = ds[i];
        const b = ds[j];
        if (a.mode === 'held' || b.mode === 'held') continue;
        if (a.mode !== 'flying' && b.mode !== 'flying') continue;
        for (const sa of [-1, 0, 1])
          for (const sb of [-1, 0, 1]) {
            const pa = tmpB.set((sa * DIE_L) / 3, 0, 0).applyQuaternion(a.quat).add(a.pos);
            const pb = tmpC.set((sb * DIE_L) / 3, 0, 0).applyQuaternion(b.quat).add(b.pos);
            const n = tmpD.subVectors(pb, pa);
            const dist = n.length();
            if (dist >= 2 * R || dist < 1e-6) continue;
            n.divideScalar(dist);
            const push = (2 * R - dist) / 2;
            if (a.mode === 'flying') a.pos.addScaledVector(n, -push);
            if (b.mode === 'flying') b.pos.addScaledVector(n, push);
            const rel = tmpA.subVectors(b.vel, a.vel).dot(n);
            if (rel < 0) {
              const jmag = (-(1 + 0.3) * rel) / 2;
              if (a.mode === 'flying') a.vel.addScaledVector(n, -jmag);
              if (b.mode === 'flying') b.vel.addScaledVector(n, jmag);
              if (jmag > 0.1) this.onImpact(Math.min(1, jmag), a.pos.x);
            }
          }
      }
  }
}

