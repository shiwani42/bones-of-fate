import { InstancedMesh, LatheGeometry, MeshPhysicalMaterial, Object3D, Vector2, Vector3 } from '@iwsdk/core';

/**
 * The wager, on the table: stacks of gold mohurs beside the board.
 *
 * "With every lost round the royal court changes: wealth disappears." Your
 * stacks sit at your end of the right-hand margin, Shakuni's at his end. A
 * capture sweeps one stack across the table to the captor; catching or being
 * caught cheating costs a stack too; the match winner takes everything left.
 *
 * One InstancedMesh (one draw call) of lathe-turned coins with a raised rim,
 * full metal, reflecting the palace IBL. Board-local; y = 0 is the table top.
 */

export type Owner = 0 | 1; // 0 = you, 1 = Shakuni

const STACKS = 8;
const COINS = 10;
const R = 0.0105; // a mohur is about 2 cm across
const H = 0.0021;
const GAP = 0.027;
const ARC = 0.07;
const CLOTH = 0.0016; // the velvet sits 1.5 mm above the table top
const DUR = 0.85;

// slot grids (2 columns × 4 rows) on the right-hand margin, beyond the board edge
const slotPos = (owner: Owner, i: number, out: Vector3) =>
  out.set(0.3 + (i % 2) * GAP, 0, owner === 0 ? 0.07 + Math.floor(i / 2) * GAP : -0.08 - Math.floor(i / 2) * GAP);

interface Stack {
  owner: Owner;
  slot: number;
  /** -1 = resting; otherwise seconds into a move */
  t: number;
  delay: number;
  from: Vector3;
  to: Vector3;
  jitter: { x: number; z: number; yaw: number; tilt: number }[];
}

function coinGeometry(): LatheGeometry {
  // radius, height: flat underside, bevelled edge, raised rim, slightly sunken field
  const p = [
    [0, 0], [R - 0.0006, 0], [R, 0.0004], [R, H - 0.0004], [R - 0.0005, H],
    [R - 0.0013, H], [R - 0.0016, H - 0.0004], [0, H - 0.0004],
  ].map(([x, y]) => new Vector2(x, y));
  const g = new LatheGeometry(p, 28);
  g.computeVertexNormals();
  return g;
}

export class GoldStakes {
  readonly mesh: InstancedMesh;
  private readonly stacks: Stack[] = [];
  private readonly e = new Object3D();
  private readonly p = new Vector3();
  /** called when a stack lands: (owner it landed with, how many coins) */
  onLand: (owner: Owner, coins: number) => void = () => {};
  private queue = 0;

  constructor() {
    const mat = new MeshPhysicalMaterial({
      color: '#e9b949',
      metalness: 1,
      roughness: 0.3,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.3,
    });
    this.mesh = new InstancedMesh(coinGeometry(), mat, STACKS * COINS);
    this.mesh.name = 'gold-stakes';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    for (let i = 0; i < STACKS; i++) {
      this.stacks.push({
        owner: 0,
        slot: 0,
        t: -1,
        delay: 0,
        from: new Vector3(),
        to: new Vector3(),
        jitter: Array.from({ length: COINS }, () => ({
          x: (Math.random() - 0.5) * 0.0016,
          z: (Math.random() - 0.5) * 0.0016,
          yaw: Math.random() * Math.PI * 2,
          tilt: (Math.random() - 0.5) * 0.06,
        })),
      });
    }
    this.reset();
  }

  /** Half the gold each, at rest. */
  reset(): void {
    this.stacks.forEach((s, i) => {
      s.owner = i < STACKS / 2 ? 0 : 1;
      s.slot = i % (STACKS / 2);
      s.t = -1;
      slotPos(s.owner, s.slot, s.to);
    });
    this.queue = 0;
    this.write();
  }

  count(owner: Owner): number {
    return this.stacks.filter((s) => s.owner === owner).length;
  }

  get moving(): boolean {
    return this.stacks.some((s) => s.t >= 0);
  }

  /** Sweep `n` stacks to `to` (as many as the other side has). Returns how many moved. */
  transfer(to: Owner, n = 1): number {
    let moved = 0;
    for (let k = 0; k < n; k++) {
      // the stack nearest the far end of the loser's rows goes first (the last one placed)
      let pick: Stack | null = null;
      for (const s of this.stacks) if (s.owner !== to && s.t < 0 && (!pick || s.slot > pick.slot)) pick = s;
      if (!pick) break;
      const used = new Set(this.stacks.filter((s) => s.owner === to).map((s) => s.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      pick.from.copy(pick.to);
      pick.owner = to;
      pick.slot = slot;
      slotPos(to, slot, pick.to);
      pick.t = 0;
      pick.delay = this.queue * 0.22; // a run of stacks goes one after another
      this.queue++;
      moved++;
    }
    return moved;
  }

  /** The winner takes all that is left. */
  allTo(to: Owner): number {
    return this.transfer(to, STACKS);
  }

  update(dt: number): void {
    if (!this.moving) {
      this.queue = 0;
      return;
    }
    for (const s of this.stacks) {
      if (s.t < 0) continue;
      s.t += dt;
      if (s.t - s.delay >= DUR + COINS * 0.03) {
        s.t = -1;
        this.onLand(s.owner, COINS);
      }
    }
    this.write();
  }

  private write(): void {
    let n = 0;
    for (const s of this.stacks) {
      for (let c = 0; c < COINS; c++) {
        const j = s.jitter[c];
        // the top coin leaves first and lands on top: the stack is swept, coin by coin
        const lag = (COINS - 1 - c) * 0.03;
        const u = s.t < 0 ? 1 : Math.min(1, Math.max(0, (s.t - s.delay - lag) / DUR));
        const e = u * u * (3 - 2 * u);
        this.p.lerpVectors(s.t < 0 ? s.to : s.from, s.to, e);
        this.p.y = CLOTH + c * H + Math.sin(Math.PI * e) * (ARC + c * 0.004);
        this.p.x += j.x;
        this.p.z += j.z;
        this.e.position.copy(this.p);
        this.e.rotation.set(j.tilt + Math.sin(Math.PI * e) * 1.2, j.yaw + e * 3, j.tilt * 0.5);
        this.e.updateMatrix();
        this.mesh.setMatrixAt(n++, this.e.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
