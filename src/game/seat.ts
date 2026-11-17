import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from '@iwsdk/core';
import { bakeContactShadow } from './contact.js';

/**
 * Shakuni's gaddi: a low carved platform with a velvet mattress, gold zari piping,
 * a round bolster behind him and corner tassels. Its height adapts to the real table
 * (`setHeight`), so he always sits naturally, cross-legged, at the right eye level.
 * Procedural (canvas + primitives), ~8 draw calls.
 */

function velvetTexture(): CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a0f1c';
  g.fillRect(0, 0, S, S);
  // pile sheen
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60},${20 + Math.random() * 15},${35 + Math.random() * 20},0.08)`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 6);
  }
  // gold zari border and buta
  g.strokeStyle = '#d6a64a';
  g.lineWidth = 10;
  g.strokeRect(14, 14, S - 28, S - 28);
  g.lineWidth = 3;
  g.strokeRect(34, 34, S - 68, S - 68);
  g.fillStyle = '#d6a64a';
  for (let x = 90; x < S - 60; x += 82) {
    for (let y = 90; y < S - 60; y += 82) {
      g.beginPath();
      g.ellipse(x, y, 9, 14, ((x + y) % 3) * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export class Gaddi {
  readonly group = new Group();
  private platform: Mesh;
  private mattress: Mesh;
  private bolster: Mesh;
  private feet: Mesh[] = [];
  private tassels: Mesh[] = [];
  private height = 0.4;

  constructor() {
    this.group.name = 'gaddi';
    const velvet = new MeshPhysicalMaterial({ map: velvetTexture(), roughness: 0.85, sheen: 1, sheenRoughness: 0.5, sheenColor: 0xff7a8a });
    const wood = new MeshPhysicalMaterial({ color: '#3a1a0c', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const gold = new MeshStandardMaterial({ color: '#d9a441', metalness: 0.95, roughness: 0.28 });
    this.platform = new Mesh(new BoxGeometry(0.9, 1, 0.72), wood);
    this.mattress = new Mesh(new BoxGeometry(0.86, 0.09, 0.68, 6, 1, 6), velvet);
    this.bolster = new Mesh(new CylinderGeometry(0.11, 0.11, 0.78, 28), velvet);
    this.bolster.rotation.z = Math.PI / 2;
    // gold piping rings round both ends (bolster-local Y is the cylinder axis)
    for (const y of [-0.385, 0.385]) {
      const ring = new Mesh(new TorusGeometry(0.11, 0.008, 6, 28), gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.bolster.add(ring);
    }
    const footGeo = new SphereGeometry(0.035, 16, 10);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const f = new Mesh(footGeo, gold);
        f.position.set(sx * 0.42, 0, sz * 0.33);
        f.scale.y = 0.6;
        this.feet.push(f);
        const tassel = new Mesh(new CylinderGeometry(0.004, 0.018, 0.09, 10), gold);
        tassel.position.set(sx * 0.43, 0, sz * 0.34);
        this.tassels.push(tassel);
        this.group.add(f, tassel);
      }
    this.group.add(this.platform, this.mattress, this.bolster);
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.setHeight(0.4);
    // baked floor shadow: the footprint never changes with the seat height
    const shadow = bakeContactShadow(this.group, { reach: 0.3, opacity: 0.7, pad: 0.26 });
    if (shadow) this.group.add(shadow);
  }

  /** Height of the mattress top above the floor (m). The group origin is the floor. */
  setHeight(h: number): void {
    this.height = Math.max(0.06, h);
    const ph = Math.max(0.01, this.height - 0.09);
    this.platform.scale.y = ph;
    this.platform.position.y = ph / 2;
    this.platform.visible = ph > 0.02;
    this.mattress.position.y = ph + 0.045;
    this.bolster.position.set(0, ph + 0.09 + 0.09, -0.3);
    for (const f of this.feet) {
      f.position.y = 0.02;
      f.visible = ph > 0.05;
    }
    for (const t of this.tassels) t.position.y = ph - 0.04;
  }

  update(time: number): void {
    this.tassels.forEach((t, i) => (t.rotation.z = Math.sin(time * 1.3 + i) * 0.08));
  }
}
