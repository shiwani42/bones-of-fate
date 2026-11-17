import { AssetManager, Box3, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from '@iwsdk/core';
import { bakeContactShadow } from './contact.js';

/**
 * Optional 3D set dressing (public/models/props/*.glb). Each prop is loaded if present;
 * a missing file is simply skipped, so the scene always works.
 * Sources: free image→3D (FLUX + TRELLIS, tools/freegen) or CC0/CC-BY downloads (CREDITS.md).
 *
 * Placement is in board space (origin = table top under the board centre, +z toward the
 * player, -z toward Shakuni). The floor is at y = -tableHeight.
 */

export interface PropSpec {
  file: string;
  /** target height in metres (uniform scale to fit) */
  height: number;
  /** position on the floor (x, z) or, when `onTable`, on the table top */
  at: [number, number];
  /** y offset above the floor / table */
  lift?: number;
  onTable?: boolean;
  yaw?: number;
  /** extra rotation if the generator's "front" isn't +z */
  frontYaw?: number;
  /** emissive warmth for lamps */
  glow?: string;
  /**
   * Surface response. Image→3D GLBs ship base colour only, and glTF's defaults
   * (metallic 1, rough 1) turn stone into dull metal, so every prop states its own.
   */
  surface?: { metalness: number; roughness: number; env?: number };
  /** baked floor contact shadow (default on for floor props) */
  contact?: false | { reach?: number; opacity?: number; pad?: number };
}

const STONE = { metalness: 0, roughness: 0.82, env: 0.6 };
const MARBLE = { metalness: 0, roughness: 0.38, env: 0.9 };
const BRASS = { metalness: 0.9, roughness: 0.32, env: 1.2 };

export const SET_DRESSING: PropSpec[] = [
  // a great arch frames Shakuni from behind
  { file: 'arch.glb', height: 2.7, at: [0, -1.75], surface: MARBLE, contact: { reach: 0.35, opacity: 0.65 } },
  // carved pillars either side of him, well clear of the table
  { file: 'pillar.glb', height: 2.75, at: [-1.45, -1.4], surface: STONE, contact: { reach: 0.4 } },
  { file: 'pillar.glb', height: 2.75, at: [1.45, -1.4], surface: STONE, contact: { reach: 0.4 } },
  // tall brass lamps flanking his gaddi
  { file: 'standing_lamp.glb', height: 1.15, at: [-0.72, -0.85], glow: '#ff9a3a', surface: BRASS, contact: { reach: 0.25, opacity: 0.62 } },
  { file: 'standing_lamp.glb', height: 1.15, at: [0.72, -0.85], glow: '#ff9a3a', surface: BRASS, contact: { reach: 0.25, opacity: 0.62 } },
  // a hanging lamp off to his right, above head height (never over his face)
  { file: 'hanging_lamp.glb', height: 0.45, at: [-0.62, -0.55], lift: 1.25, glow: '#ffb24a', surface: BRASS, contact: false },
];

const box = new Box3();
const size = new Vector3();
const centre = new Vector3();

/** Load a GLB and normalise it: scaled to `height`, base on y=0, centred in x/z. */
export async function loadNormalised(url: string, height: number, frontYaw = 0): Promise<Object3D | null> {
  try {
    const gltf = await AssetManager.loadGLTF(url, `prop:${url}`);
    const inner = gltf.scene.clone(true); // the loader caches by URL: each placement needs its own copy
    inner.rotation.y = frontYaw;
    inner.updateMatrixWorld(true);
    box.setFromObject(inner);
    box.getSize(size);
    box.getCenter(centre);
    const s = height / Math.max(1e-3, size.y);
    inner.scale.setScalar(s);
    inner.position.set(-centre.x * s, -box.min.y * s, -centre.z * s);
    const holder = new Group();
    holder.add(inner);
    holder.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = true;
      }
    });
    return holder;
  } catch {
    return null; // not present yet
  }
}

export class SetDressing {
  readonly group = new Group();
  private tableHeight = 0.72;
  private items: { spec: PropSpec; obj: Object3D }[] = [];

  constructor(private readonly base: string) {
    this.group.name = 'set-dressing';
    for (const spec of SET_DRESSING) void this.add(spec);
  }

  private async add(spec: PropSpec): Promise<void> {
    const obj = await loadNormalised(`${this.base}models/props/${spec.file}`, spec.height, spec.frontYaw ?? 0);
    if (!obj) return;
    obj.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      // the loader caches by URL and clone(true) shares materials: give each placement its own
      const m = (mesh.material as MeshStandardMaterial).clone();
      mesh.material = m;
      if (!('emissive' in m)) return;
      if (spec.surface) {
        m.metalness = spec.surface.metalness;
        m.roughness = spec.surface.roughness;
        m.envMapIntensity = spec.surface.env ?? 1;
      }
      if (spec.glow) {
        m.emissive.set(spec.glow);
        m.emissiveIntensity = 0.12;
      }
    });
    if (spec.contact !== false && !spec.lift) {
      const shadow = bakeContactShadow(obj, spec.contact || {});
      if (shadow) obj.add(shadow);
    }
    obj.rotation.y = spec.yaw ?? 0;
    this.items.push({ spec, obj });
    this.group.add(obj);
    this.layout();
  }

  setTableHeight(h: number): void {
    if (Math.abs(h - this.tableHeight) < 0.005) return;
    this.tableHeight = h;
    this.layout();
  }

  private layout(): void {
    for (const { spec, obj } of this.items) {
      const y = (spec.onTable ? 0 : -this.tableHeight) + (spec.lift ?? 0);
      obj.position.set(spec.at[0], y, spec.at[1]);
    }
  }

  /** 0..1 — fades in with the palace */
  setReveal(v: number): void {
    this.group.visible = v > 0.02;
    this.group.scale.setScalar(0.96 + 0.04 * v);
  }
}
