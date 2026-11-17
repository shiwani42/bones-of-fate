import {
  BufferAttribute,
  CanvasTexture,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from '@iwsdk/core';

/**
 * Baked contact shadows ("floor AO") for objects standing on the real floor.
 *
 * The real-time shadow map only covers the board (≈1 m), so pillars, lamps, the
 * arch and Shakuni's gaddi would otherwise float over passthrough. At load time
 * we rasterise every triangle near the object's base into a top-down canvas
 * (nearer the floor = darker), blur it twice (a tight contact core plus a wide
 * ambient falloff) and lay it on the floor as one transparent quad. The shape
 * follows the real footprint: two feet for the arch, a ring for a lamp base.
 *
 * One draw call per object, no per-frame cost. In mixed reality a dark
 * translucent quad darkens the passthrough floor, which is exactly a shadow.
 */

export interface ContactOptions {
  /** geometry this high above the base (m) still darkens the floor */
  reach?: number;
  /** extra margin around the footprint (m) for the soft falloff */
  pad?: number;
  /** darkness at the densest point, 0..1 */
  opacity?: number;
  /** canvas pixels per metre */
  ppm?: number;
}

const inv = new Matrix4();
const rel = new Matrix4();
const a = new Vector3();
const b = new Vector3();
const c = new Vector3();

/**
 * Build a contact-shadow quad for `root` (in root-local space, base at y = minY).
 * Returns null when the object has no geometry. Add the result as a child of `root`.
 */
export function bakeContactShadow(root: Object3D, opts: ContactOptions = {}): Mesh | null {
  const reach = opts.reach ?? 0.3;
  const pad = opts.pad ?? 0.22;
  const opacity = opts.opacity ?? 0.72;
  const ppm = opts.ppm ?? 160;

  root.updateMatrixWorld(true);
  inv.copy(root.matrixWorld).invert();

  // pass 1: bounds in root space
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
  const meshes: { pos: BufferAttribute; index: ArrayLike<number> | null; m: Matrix4 }[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.visible || !m.geometry) return;
    const pos = m.geometry.getAttribute('position') as BufferAttribute | undefined;
    if (!pos) return;
    const mm = new Matrix4().multiplyMatrices(inv, m.matrixWorld);
    meshes.push({ pos, index: m.geometry.index ? m.geometry.index.array : null, m: mm });
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(mm);
      if (a.x < minX) minX = a.x;
      if (a.x > maxX) maxX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.z < minZ) minZ = a.z;
      if (a.z > maxZ) maxZ = a.z;
    }
  });
  if (!meshes.length || !isFinite(minX)) return null;

  const w = maxX - minX + 2 * pad;
  const d = maxZ - minZ + 2 * pad;
  const W = Math.min(512, Math.max(32, Math.ceil(w * ppm)));
  const H = Math.min(512, Math.max(32, Math.ceil(d * ppm)));
  const sx = W / w;
  const sz = H / d;
  const ox = minX - pad;
  const oz = minZ - pad;

  // pass 2: rasterise low triangles, keeping the darkest value per pixel
  const raw = document.createElement('canvas');
  raw.width = W;
  raw.height = H;
  const g = raw.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighten';
  const tri = (i0: number, i1: number, i2: number, pos: BufferAttribute, mm: Matrix4) => {
    a.fromBufferAttribute(pos, i0).applyMatrix4(mm);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mm);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mm);
    const h = Math.min(a.y, b.y, c.y) - minY;
    if (h > reach) return;
    const k = 1 - h / reach;
    const v = Math.round(255 * k * k);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.moveTo((a.x - ox) * sx, (a.z - oz) * sz);
    g.lineTo((b.x - ox) * sx, (b.z - oz) * sz);
    g.lineTo((c.x - ox) * sx, (c.z - oz) * sz);
    g.closePath();
    g.fill();
  };
  for (const { pos, index, m: mm } of meshes) {
    if (index) for (let i = 0; i + 2 < index.length; i += 3) tri(index[i], index[i + 1], index[i + 2], pos, mm);
    else for (let i = 0; i + 2 < pos.count; i += 3) tri(i, i + 1, i + 2, pos, mm);
  }

  // pass 3: soft contact core + wide ambient falloff
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const o = out.getContext('2d')!;
  o.fillStyle = '#000';
  o.fillRect(0, 0, W, H);
  o.globalCompositeOperation = 'lighter';
  o.filter = `blur(${Math.max(1, Math.round(0.03 * ppm))}px)`;
  o.globalAlpha = 0.85;
  o.drawImage(raw, 0, 0);
  o.filter = `blur(${Math.max(2, Math.round(0.13 * ppm))}px)`;
  o.globalAlpha = 0.9;
  o.drawImage(raw, 0, 0);
  o.drawImage(raw, 0, 0); // twice: the wide falloff is the part you see beyond the base
  o.filter = 'none';
  // fade the mask to black at the canvas edge so the quad never shows a seam
  o.globalCompositeOperation = 'multiply';
  o.globalAlpha = 1;
  const edge = Math.max(2, Math.round(0.06 * ppm));
  const fx = o.createLinearGradient(0, 0, W, 0);
  fx.addColorStop(0, '#000');
  fx.addColorStop(edge / W, '#fff');
  fx.addColorStop(1 - edge / W, '#fff');
  fx.addColorStop(1, '#000');
  o.fillStyle = fx;
  o.fillRect(0, 0, W, H);
  const fz = o.createLinearGradient(0, 0, 0, H);
  fz.addColorStop(0, '#000');
  fz.addColorStop(edge / H, '#fff');
  fz.addColorStop(1 - edge / H, '#fff');
  fz.addColorStop(1, '#000');
  o.fillStyle = fz;
  o.fillRect(0, 0, W, H);

  // mask → alpha of a black texture (normal alpha blending is what darkens passthrough
  // in mixed reality; multiply blending would leave the camera feed untouched)
  const img = o.getImageData(0, 0, W, H);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    // gamma lifts the faint tail: the visible part of a contact shadow is the falloff
    px[i + 3] = Math.round(255 * Math.pow(px[i + 1] / 255, 0.5));
    px[i] = px[i + 1] = px[i + 2] = 0;
  }
  o.putImageData(img, 0, 0);
  const tex = new CanvasTexture(out);
  const mat = new MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const geo = new PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2); // canvas +y (rows) maps to +z
  const mesh = new Mesh(geo, mat);
  mesh.name = 'contact-shadow';
  mesh.position.set(ox + w / 2, minY + 0.002, oz + d / 2);
  mesh.renderOrder = -1;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.raycast = () => {};
  return mesh;
}
