import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { GRID } from './rules.js';
import { CELL, SURFACE_Y } from './board.js';

/**
 * Cheap, post-processing-free spectacle:
 *  - crack: branching lines drawn into a 512px canvas over the cloth, revealed
 *    progressively; glowing white-gold, then they cool into kintsugi gold.
 *  - divine light: additive open cylinders (soft vertical gradient) rising
 *    out of the crack points.
 *  - sparks: one Points cloud.
 *  - petals: one InstancedMesh of marigold petals for the victory.
 */

interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  d: number; // distance from origin, for reveal order
}

function beamTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 256, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,236,170,0.75)');
  grd.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class Fx {
  readonly group = new Group();
  private crackCanvas: HTMLCanvasElement;
  private crackCtx: CanvasRenderingContext2D;
  private crackTex: CanvasTexture;
  private crackMat: MeshBasicMaterial;
  private segs: Seg[] = [];
  private crackT = -1;
  private crackOrigin = new Vector3();
  private beams: Mesh[] = [];
  private beamMat: MeshBasicMaterial;
  private sparks: Points;
  private sparkPos: Float32Array;
  private sparkVel: Float32Array;
  private sparkLife: Float32Array;
  private petals: InstancedMesh;
  private petalState: Float32Array; // x y z vx vy vz rot spin
  private petalT = -1;
  private dummy = new Object3D();
  private redrawEvery = 0;
  /** Board shake amount (read by the director). */
  shake = 0;

  constructor() {
    this.group.name = 'fx';
    // Crack layer
    this.crackCanvas = document.createElement('canvas');
    this.crackCanvas.width = this.crackCanvas.height = 512;
    this.crackCtx = this.crackCanvas.getContext('2d')!;
    this.crackTex = new CanvasTexture(this.crackCanvas);
    this.crackTex.colorSpace = SRGBColorSpace;
    this.crackMat = new MeshBasicMaterial({
      map: this.crackTex,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const crack = new Mesh(new PlaneGeometry(GRID * CELL, GRID * CELL), this.crackMat);
    crack.rotation.x = -Math.PI / 2;
    crack.position.y = SURFACE_Y + 0.0015;
    crack.renderOrder = 5;
    this.group.add(crack);

    // Beams
    this.beamMat = new MeshBasicMaterial({
      map: beamTexture(),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      color: new Color('#ffe7a8'),
    });
    const beamGeo = new CylinderGeometry(0.016, 0.007, 1, 16, 1, true);
    beamGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 7; i++) {
      const b = new Mesh(beamGeo, this.beamMat);
      b.visible = false;
      b.renderOrder = 6;
      this.group.add(b);
      this.beams.push(b);
    }

    // Sparks
    const N = 160;
    this.sparkPos = new Float32Array(N * 3);
    this.sparkVel = new Float32Array(N * 3);
    this.sparkLife = new Float32Array(N);
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(this.sparkPos, 3).setUsage(DynamicDrawUsage));
    this.sparks = new Points(
      sg,
      new PointsMaterial({
        color: '#ffd27a',
        size: 0.006,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);

    // Petals
    const P = 140;
    // a marigold petal: a soft oval
    const pg = new CircleGeometry(0.007, 7);
    pg.scale(1, 0.62, 1);
    this.petals = new InstancedMesh(
      pg,
      new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }),
      P,
    );
    const c = new Color();
    for (let i = 0; i < P; i++) {
      c.set(i % 3 === 0 ? '#ff8c00' : i % 3 === 1 ? '#ffb000' : '#e8590c');
      this.petals.setColorAt(i, c);
    }
    this.petals.visible = false;
    this.petals.frustumCulled = false;
    this.petalState = new Float32Array(P * 8);
    this.group.add(this.petals);
  }

  /** Crack the board from a board-local point, spreading across one half. */
  crack(origin: Vector3, towardZ: number): void {
    this.crackOrigin.copy(origin);
    this.segs = [];
    const S = 512 / (GRID * CELL); // px per metre
    const ox = 256 + origin.x * S;
    const oy = 256 + origin.z * S;
    const branch = (x: number, y: number, ang: number, len: number, w: number, d: number, depth: number) => {
      let cx = x, cy = y, a = ang, dist = d;
      const steps = Math.floor(len / 9);
      for (let i = 0; i < steps; i++) {
        a += (Math.random() - 0.5) * 0.7;
        const nx = cx + Math.cos(a) * 9;
        const ny = cy + Math.sin(a) * 9;
        dist += 9;
        this.segs.push({ x0: cx, y0: cy, x1: nx, y1: ny, w: Math.max(0.8, w * (1 - i / steps)), d: dist });
        cx = nx;
        cy = ny;
        if (depth < 3 && Math.random() < 0.12) {
          branch(cx, cy, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), len * 0.5, w * 0.6, dist, depth + 1);
        }
      }
    };
    const main = Math.sign(towardZ) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      branch(ox, oy, main + (i - 2.5) * 0.55 + (Math.random() - 0.5) * 0.3, 150 + Math.random() * 110, 5, 0, 0);
    }
    this.segs.sort((p, q) => p.d - q.d);
    this.crackT = 0;

    // beams rise from points along the cracks
    this.beams.forEach((b, i) => {
      const s = this.segs[Math.floor((i / this.beams.length) * this.segs.length * 0.8) + 3] ?? this.segs[0];
      b.position.set((s.x1 - 256) / S, SURFACE_Y, (s.y1 - 256) / S);
      b.scale.set(1, 0.001, 1);
      b.visible = true;
      b.userData.delay = 0.15 + i * 0.07;
      b.userData.h = 0.45 + Math.random() * 0.35;
    });
    this.burst(origin, 120, 0.9);
    this.shake = 1;
  }

  burst(at: Vector3, count: number, speed: number): void {
    let n = 0;
    for (let i = 0; i < this.sparkLife.length && n < count; i++) {
      if (this.sparkLife[i] > 0) continue;
      n++;
      this.sparkLife[i] = 0.6 + Math.random() * 0.9;
      this.sparkPos[i * 3] = at.x + (Math.random() - 0.5) * 0.08;
      this.sparkPos[i * 3 + 1] = SURFACE_Y + 0.005;
      this.sparkPos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.08;
      const a = Math.random() * Math.PI * 2;
      const h = Math.random() * speed;
      this.sparkVel[i * 3] = Math.cos(a) * h * 0.5;
      this.sparkVel[i * 3 + 1] = 0.3 + Math.random() * speed;
      this.sparkVel[i * 3 + 2] = Math.sin(a) * h * 0.5;
    }
  }

  petalShower(): void {
    const s = this.petalState;
    for (let i = 0; i < s.length / 8; i++) {
      s[i * 8] = (Math.random() - 0.5) * 0.7;
      s[i * 8 + 1] = 0.5 + Math.random() * 0.8;
      s[i * 8 + 2] = (Math.random() - 0.5) * 0.7;
      s[i * 8 + 3] = 0;
      s[i * 8 + 4] = -0.12 - Math.random() * 0.1;
      s[i * 8 + 5] = 0;
      s[i * 8 + 6] = Math.random() * 6;
      s[i * 8 + 7] = 2 + Math.random() * 5;
    }
    this.petals.visible = true;
    this.petalT = 0;
  }

  private drawCrack(reveal: number, heat: number, alpha: number): void {
    const g = this.crackCtx;
    g.clearRect(0, 0, 512, 512);
    if (alpha <= 0) return;
    const maxD = this.segs.length ? this.segs[this.segs.length - 1].d : 1;
    // hot white-gold → cooled kintsugi gold
    const r = 255;
    const gg = Math.round(200 + 55 * heat);
    const b = Math.round(60 + 170 * heat);
    g.lineCap = 'round';
    g.shadowColor = `rgba(255,200,80,${0.9 * alpha})`;
    g.shadowBlur = 6 + 10 * heat;
    g.strokeStyle = `rgba(${r},${gg},${b},${alpha})`;
    for (const s of this.segs) {
      if (s.d > reveal * maxD) break;
      g.lineWidth = s.w;
      g.beginPath();
      g.moveTo(s.x0, s.y0);
      g.lineTo(s.x1, s.y1);
      g.stroke();
    }
    this.crackTex.needsUpdate = true;
  }

  get busy(): boolean {
    return this.crackT >= 0 && this.crackT < 3;
  }

  update(dt: number): void {
    // crack lifecycle: 0–0.5 s spread, hot until 2 s, cool to gold, fade by 7 s
    if (this.crackT >= 0) {
      this.crackT += dt;
      const t = this.crackT;
      this.redrawEvery -= dt;
      if (t < 0.6 || (t > 1.5 && t < 7.2 && this.redrawEvery <= 0)) {
        const reveal = Math.min(1, t / 0.5);
        const heat = t < 1.5 ? 1 : Math.max(0, 1 - (t - 1.5) / 1.5);
        const alpha = t < 5 ? 1 : Math.max(0, 1 - (t - 5) / 2);
        this.drawCrack(reveal, heat, alpha);
        this.redrawEvery = 0.1;
      }
      if (t > 7.2) {
        this.drawCrack(0, 0, 0);
        this.crackTex.needsUpdate = true;
        this.crackT = -1;
      }
      for (const b of this.beams) {
        if (!b.visible) continue;
        const lt = t - (b.userData.delay as number);
        if (lt < 0) continue;
        const grow = Math.min(1, lt / 0.35);
        const fade = lt > 2.2 ? Math.max(0, 1 - (lt - 2.2) / 1.0) : 1;
        b.scale.set(1 + lt * 0.4, (b.userData.h as number) * grow * (0.6 + 0.4 * fade), 1 + lt * 0.4);
        if (fade <= 0) b.visible = false;
      }
      this.beamMat.opacity = 0.85 * (t < 2.4 ? 1 : Math.max(0, 1 - (t - 2.4) / 1.2));
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);

    // sparks
    let any = false;
    for (let i = 0; i < this.sparkLife.length; i++) {
      if (this.sparkLife[i] <= 0) {
        this.sparkPos[i * 3 + 1] = -10;
        continue;
      }
      any = true;
      this.sparkLife[i] -= dt;
      this.sparkVel[i * 3 + 1] -= 0.6 * dt;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
    }
    if (any || this.sparks.visible) {
      (this.sparks.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }
    this.sparks.visible = any;

    // petals
    if (this.petalT >= 0) {
      this.petalT += dt;
      const s = this.petalState;
      const n = s.length / 8;
      for (let i = 0; i < n; i++) {
        const o = i * 8;
        s[o + 6] += s[o + 7] * dt;
        s[o] += Math.sin(s[o + 6]) * 0.05 * dt;
        s[o + 1] = Math.max(SURFACE_Y + 0.002, s[o + 1] + s[o + 4] * dt);
        s[o + 2] += Math.cos(s[o + 6] * 0.7) * 0.05 * dt;
        this.dummy.position.set(s[o], s[o + 1], s[o + 2]);
        const landed = s[o + 1] <= SURFACE_Y + 0.0025;
        this.dummy.rotation.set(landed ? -Math.PI / 2 : s[o + 6], landed ? s[o + 7] : s[o + 6] * 0.5, 0);
        this.dummy.updateMatrix();
        this.petals.setMatrixAt(i, this.dummy.matrix);
      }
      this.petals.instanceMatrix.needsUpdate = true;
      if (this.petalT > 14) {
        this.petals.visible = false;
        this.petalT = -1;
      }
    }
  }

  clearPetals(): void {
    this.petals.visible = false;
    this.petalT = -1;
  }
}
