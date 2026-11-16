import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import { sfx } from './audio.js';

/**
 * Game-feel layer, all in board-local metres. Add `juice.group` to the board
 * root (so it shakes with the board) and call `juice.update(dt)` every frame.
 *
 *  - Pooled particle bursts in ONE Points draw (dust, gold, poof, ember).
 *    Idea after Meta ProjectFlowerbed `src/core/bursts.ts` (MIT,
 *    © Meta Platforms, Inc.); this is our own code: premultiplied blending
 *    lets additive sparkles and alpha-blended dust share one draw.
 *  - Expanding gold landing rings in ONE instanced draw.
 *  - Reward waves (Flowerbed's `tickReveal` pattern): 3–4 gold bursts 0.28 s
 *    apart with a rising chime.
 *  - hopPose(): anticipation → stretch → squash → overshoot for piece hops,
 *    tuned from The Nanauts' animator constants (see docs/VISUAL-RESEARCH.md).
 */

export interface BurstStyle {
  color: number;
  accent?: number;
  /** horizontal speed, m/s */
  speed: number;
  /** upward speed, m/s */
  lift: number;
  /** m/s² (negative falls) */
  gravity: number;
  /** world size, m */
  size: number;
  /** seconds */
  life: number;
  /** spawn radius, m */
  spread?: number;
  additive?: boolean;
  /** particles used (≤ PER) */
  count?: number;
}

export const BURST_STYLES = {
  /** cloth dust kicked up by a hop landing */
  dust: { color: 0xc9b48a, accent: 0x8a7458, speed: 0.12, lift: 0.18, gravity: -0.9, size: 0.0055, life: 0.5, spread: 0.006, count: 12 },
  /** heavier dust for the final landing */
  poof: { color: 0xe2d3b5, accent: 0xa89070, speed: 0.16, lift: 0.14, gravity: -0.15, size: 0.011, life: 0.85, spread: 0.008 },
  /** reward sparkles */
  gold: { color: 0xffd86b, accent: 0xfff4d0, speed: 0.2, lift: 0.42, gravity: -0.35, size: 0.0075, life: 1.25, spread: 0.01, additive: true },
  /** capture / Shakuni embers */
  ember: { color: 0xff7a1a, accent: 0xffc04a, speed: 0.12, lift: 0.3, gravity: 0.05, size: 0.005, life: 1.4, spread: 0.012, additive: true },
} satisfies Record<string, BurstStyle>;

const BURSTS = 12;
const PER = 24;
const COUNT = BURSTS * PER;
const RINGS = 4;

const VERT = /* glsl */ `
precision highp float;
attribute float aSize;
attribute float aAlpha;
attribute float aAdd;
varying vec3 vColor;
varying float vAlpha;
varying float vAdd;
uniform float uScale;
void main() {
  vColor = color;
  vAlpha = aAlpha;
  vAdd = aAdd;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
varying float vAdd;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float soft = smoothstep(1.0, 0.0, r);
  // sparkles get a hot core and a four-point glint
  float glint = max(0.0, 1.0 - abs(p.x * p.y) * 14.0) * smoothstep(1.0, 0.2, r);
  float shape = mix(soft * soft, max(soft * soft * soft, glint * 0.9), vAdd);
  float a = shape * vAlpha;
  if (a < 0.004) discard;
  vec3 col = vColor * (1.0 + vAdd * 0.8 * smoothstep(0.35, 0.0, r));
  // premultiplied: additive sparkles keep little coverage, dust fully blends
  gl_FragColor = vec4(col * a, a * mix(1.0, 0.45, vAdd));
  #include <colorspace_fragment>
}`;

const RING_VERT = /* glsl */ `
precision highp float;
attribute vec2 aRing; // x: progress 0..1, y: strength
varying vec2 vUv;
varying vec2 vRing;
void main() {
  vUv = uv;
  vRing = aRing;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const RING_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
varying vec2 vUv;
varying vec2 vRing;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float w = mix(0.22, 0.05, vRing.x);
  float band = smoothstep(w, 0.0, abs(r - 0.82));
  float a = band * (1.0 - vRing.x) * (1.0 - vRing.x) * vRing.y;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a * 1.6, a * 0.5);
  #include <colorspace_fragment>
}`;

function premultipliedMaterial(m: ShaderMaterial): ShaderMaterial {
  m.transparent = true;
  m.depthWrite = false;
  m.toneMapped = false;
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
  return m;
}

interface PendingWave {
  at: Vector3;
  t: number;
  wave: number;
  of: number;
}

export class Juice {
  readonly group = new Group();
  private readonly points: Points;
  private readonly pos = new Float32Array(COUNT * 3);
  private readonly vel = new Float32Array(COUNT * 3);
  private readonly col = new Float32Array(COUNT * 3);
  private readonly size = new Float32Array(COUNT);
  private readonly alpha = new Float32Array(COUNT);
  private readonly add = new Float32Array(COUNT);
  private readonly age = new Float32Array(BURSTS).fill(1e9);
  private readonly styles: (BurstStyle | null)[] = new Array(BURSTS).fill(null);
  private next = 0;
  private readonly rings: InstancedMesh;
  private readonly ringState = new Float32Array(RINGS * 6); // x y z age life radius
  private readonly ringAttr: InstancedBufferAttribute;
  private nextRing = 0;
  private readonly waves: PendingWave[] = [];
  private readonly tmpC = new Color();
  private readonly dummy = new Object3D();

  constructor() {
    this.group.name = 'juice';
    const g = new BufferGeometry();
    const attr = (a: Float32Array, n: number) => new BufferAttribute(a, n).setUsage(DynamicDrawUsage);
    g.setAttribute('position', attr(this.pos, 3));
    g.setAttribute('color', attr(this.col, 3));
    g.setAttribute('aSize', attr(this.size, 1));
    g.setAttribute('aAlpha', attr(this.alpha, 1));
    g.setAttribute('aAdd', attr(this.add, 1));
    const mat = premultipliedMaterial(
      new ShaderMaterial({
        uniforms: { uScale: { value: 720 } },
        vertexColors: true,
        vertexShader: VERT,
        fragmentShader: FRAG,
      }),
    );
    this.points = new Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.visible = false;
    this.group.add(this.points);

    const rg = new PlaneGeometry(1, 1);
    rg.rotateX(-Math.PI / 2);
    this.ringAttr = new InstancedBufferAttribute(new Float32Array(RINGS * 2), 2).setUsage(DynamicDrawUsage);
    rg.setAttribute('aRing', this.ringAttr);
    this.rings = new InstancedMesh(
      rg,
      premultipliedMaterial(
        new ShaderMaterial({
          uniforms: { uColor: { value: new Color('#ffd36b') } },
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          side: DoubleSide,
        }),
      ),
      RINGS,
    );
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 19;
    this.rings.visible = false;
    for (let i = 0; i < RINGS; i++) this.ringState[i * 6 + 3] = 1e9;
    this.group.add(this.rings);
  }

  /** Emit one pooled burst at a board-local point. */
  emit(at: Vector3, style: BurstStyle, scale = 1): void {
    const b = this.next;
    this.next = (this.next + 1) % BURSTS;
    this.age[b] = 0;
    this.styles[b] = style;
    const n = Math.min(PER, style.count ?? PER);
    const spread = style.spread ?? 0.005;
    for (let i = 0; i < PER; i++) {
      const j = b * PER + i;
      const k = j * 3;
      if (i >= n) {
        this.size[j] = 0;
        this.alpha[j] = 0;
        continue;
      }
      const a = Math.random() * Math.PI * 2;
      const sp = style.speed * scale * (0.35 + Math.random() * 0.65);
      const r = Math.random() * spread;
      this.pos[k] = at.x + Math.cos(a) * r;
      this.pos[k + 1] = at.y + 0.002 + Math.random() * 0.004;
      this.pos[k + 2] = at.z + Math.sin(a) * r;
      this.vel[k] = Math.cos(a) * sp;
      this.vel[k + 1] = style.lift * scale * (0.45 + Math.random() * 0.55);
      this.vel[k + 2] = Math.sin(a) * sp;
      this.tmpC.setHex(style.accent != null && Math.random() < 0.4 ? style.accent : style.color);
      this.col[k] = this.tmpC.r;
      this.col[k + 1] = this.tmpC.g;
      this.col[k + 2] = this.tmpC.b;
      this.add[j] = style.additive ? 1 : 0;
      this.size[j] = style.size * scale * (0.7 + Math.random() * 0.6);
      this.alpha[j] = 1;
    }
    this.points.visible = true;
  }

  /** Expanding flat gold ring on the cloth. */
  ring(at: Vector3, radius = 0.045, life = 0.6, strength = 1): void {
    const i = this.nextRing;
    this.nextRing = (this.nextRing + 1) % RINGS;
    const s = this.ringState;
    s[i * 6] = at.x;
    s[i * 6 + 1] = at.y + 0.0012;
    s[i * 6 + 2] = at.z;
    s[i * 6 + 3] = 0;
    s[i * 6 + 4] = life;
    s[i * 6 + 5] = radius;
    this.ringAttr.setY(i, strength);
    this.rings.visible = true;
  }

  /**
   * A hop landed at `at` (board-local, cloth height). Small dust + a tap that
   * climbs with `step`; the last landing adds a poof, a gold ring and a thump.
   */
  landing(at: Vector3, isLast = false, step = 0): void {
    const pan = Math.max(-1, Math.min(1, at.x * 3));
    if (isLast) {
      this.emit(at, BURST_STYLES.poof);
      this.ring(at, 0.05, 0.55, 1);
      sfx.thump(pan);
    } else {
      this.emit(at, BURST_STYLES.dust);
      sfx.hopTap(step, pan);
    }
  }

  /** A capture: embers, a poof and a ring where the victim stood. */
  capture(at: Vector3): void {
    this.emit(at, BURST_STYLES.poof, 1.3);
    this.emit(at, BURST_STYLES.ember, 1.2);
    this.ring(at, 0.07, 0.8, 1);
  }

  /**
   * Reward reveal: `waves` gold bursts `interval` s apart with a rising chime
   * (capture by the player, win, correct accusation).
   */
  reward(at: Vector3, waves = 4, interval = 0.28): void {
    for (let i = 0; i < waves; i++) {
      this.waves.push({ at: at.clone(), t: -i * interval, wave: i, of: waves });
    }
  }

  get busy(): boolean {
    return this.points.visible || this.rings.visible || this.waves.length > 0;
  }

  update(dt: number): void {
    // scheduled reward waves
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      if (w.t < 0) continue;
      const k = w.wave / Math.max(1, w.of - 1);
      const p = this.dummy.position.copy(w.at);
      p.x += (Math.random() - 0.5) * 0.03;
      p.z += (Math.random() - 0.5) * 0.03;
      this.emit(p, BURST_STYLES.gold, 0.8 + 0.6 * k);
      this.ring(w.at, 0.05 + 0.04 * k, 0.7, 0.6 + 0.4 * k);
      sfx.reward(w.wave, w.of);
      this.waves.splice(i, 1);
    }

    if (this.points.visible) {
      let alive = false;
      for (let b = 0; b < BURSTS; b++) {
        const st = this.styles[b];
        if (!st) continue;
        if (this.age[b] >= st.life) {
          for (let i = 0; i < PER; i++) this.alpha[b * PER + i] = 0;
          this.styles[b] = null;
          continue;
        }
        alive = true;
        this.age[b] += dt;
        const f = Math.max(0, 1 - this.age[b] / st.life);
        const drag = 1 - 2.2 * dt;
        for (let i = 0; i < PER; i++) {
          const j = b * PER + i;
          if (this.size[j] === 0) continue;
          const k = j * 3;
          this.vel[k + 1] += st.gravity * dt;
          this.vel[k] *= drag;
          this.vel[k + 2] *= drag;
          this.pos[k] += this.vel[k] * dt;
          this.pos[k + 1] = Math.max(0.0005, this.pos[k + 1] + this.vel[k + 1] * dt);
          this.pos[k + 2] += this.vel[k + 2] * dt;
          this.alpha[j] = st.additive ? f * (0.7 + 0.3 * Math.sin(this.age[b] * 40 + j)) : f * f;
        }
      }
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      g.attributes.aAdd.needsUpdate = true;
      this.points.visible = alive;
    }

    if (this.rings.visible) {
      let any = false;
      const s = this.ringState;
      for (let i = 0; i < RINGS; i++) {
        const o = i * 6;
        if (s[o + 3] >= s[o + 4]) {
          this.dummy.position.set(0, -10, 0);
          this.dummy.scale.setScalar(0.0001);
          this.ringAttr.setX(i, 1);
        } else {
          any = true;
          s[o + 3] += dt;
          const p = Math.min(1, s[o + 3] / s[o + 4]);
          const e = 1 - Math.pow(1 - p, 3);
          this.dummy.position.set(s[o], s[o + 1], s[o + 2]);
          this.dummy.scale.setScalar(s[o + 5] * 2 * (0.25 + 0.75 * e));
          this.ringAttr.setX(i, p);
        }
        this.dummy.updateMatrix();
        this.rings.setMatrixAt(i, this.dummy.matrix);
      }
      this.rings.instanceMatrix.needsUpdate = true;
      this.ringAttr.needsUpdate = true;
      this.rings.visible = any;
    }
  }
}

// ───────────────────────── hop animation ─────────────────────────

/** Suggested durations: first hop has the full anticipation, last has the settle. */
export const HOP_FIRST_S = 0.26;
export const HOP_STEP_S = 0.17;
export const HOP_LAST_S = 0.38;
export function hopDuration(i: number, n: number): number {
  if (n === 1) return HOP_FIRST_S + 0.12;
  return i === n - 1 ? HOP_LAST_S : i === 0 ? HOP_FIRST_S : HOP_STEP_S;
}

// The Nanauts animator: maxSquash .2, maxStretch .12, startMoveSquash -.15,
// bounceOvershoot .1, landingRecovery .18 s.
const MAX_SQUASH = 0.2;
const MID_SQUASH = 0.12;
const MAX_STRETCH = 0.12;
const ANTICIPATION = 0.15;
const LEAN = 0.22; // rad, toward travel

const _dir = new Vector3();
const _axis = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Pose a piece for normalised hop time t ∈ [0,1] from `from` to `to`
 * (board-local). Writes position, scale and a lean toward travel; at t = 1
 * the pose is exactly `to`, unit scale, no rotation. Pivot is the piece base.
 *
 * Phases: crouch (anticipation) → stretched arc with a forward/back lean →
 * squash on impact → damped overshoot settle. `isFirst` gives the full crouch;
 * later hops in a chain only dip briefly so the run flows.
 */
export function hopPose(
  piece: Object3D,
  t: number,
  from: Vector3,
  to: Vector3,
  isLast: boolean,
  isFirst = true,
): void {
  t = Math.max(0, Math.min(1, t));
  const A = isFirst ? 0.2 : 0.07; // anticipation end
  const L = isLast ? 0.62 : 0.8; // impact
  const H = isLast ? 0.024 : 0.016; // arc height
  let sy = 1;
  let lean = 0;
  _dir.subVectors(to, from);
  _dir.y = 0;
  const dist = _dir.length();
  if (dist > 1e-6) _dir.divideScalar(dist);

  if (t < A) {
    const a = t / A;
    piece.position.copy(from);
    sy = 1 - (isFirst ? ANTICIPATION : 0.06) * Math.sin((a * Math.PI) / 2);
    lean = -0.08 * a; // wind-up: lean back a touch
  } else if (t < L) {
    const u = (t - A) / (L - A);
    const e = u * u * (3 - 2 * u);
    piece.position.lerpVectors(from, to, e);
    piece.position.y = from.y + (to.y - from.y) * u + H * 4 * u * (1 - u);
    const crouch = 1 - (isFirst ? ANTICIPATION : 0.06);
    const stretch = 1 + MAX_STRETCH * Math.sin(Math.PI * u);
    const k = Math.min(1, u / 0.18);
    sy = crouch + (stretch - crouch) * k * k * (3 - 2 * k);
    lean = LEAN * Math.sin(2 * Math.PI * u) * (isFirst || u > 0.5 ? 1 : 0.6);
  } else {
    const v = (t - L) / (1 - L);
    piece.position.copy(to);
    const S = isLast ? MAX_SQUASH : MID_SQUASH;
    // impact squash, then a damped spring that overshoots (~+0.1·S) and settles at 1
    sy = 1 - S * (1 - v) * Math.exp(-1.5 * v) * Math.cos(2.5 * Math.PI * v);
    lean = -0.06 * (1 - v) * Math.cos(2.5 * Math.PI * v);
  }
  if (t >= 1) {
    piece.position.copy(to);
    piece.scale.set(1, 1, 1);
    piece.quaternion.identity();
    return;
  }
  const sxz = 1 / Math.sqrt(sy); // keep volume
  piece.scale.set(sxz, sy, sxz);
  if (dist > 1e-6) {
    _axis.crossVectors(UP, _dir).normalize();
    piece.quaternion.setFromAxisAngle(_axis, lean);
  } else piece.quaternion.identity();
}
