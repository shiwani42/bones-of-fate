import { BufferAttribute, BufferGeometry } from '@iwsdk/core';

/**
 * Merge indexed geometries that share the same attribute set (position,
 * normal, uv, optional color) into one, so a multi-part ornament is one draw
 * call. A tiny stand-in for three's BufferGeometryUtils.mergeGeometries,
 * which @iwsdk/core does not re-export.
 */
export function mergeGeometries(geos: BufferGeometry[]): BufferGeometry {
  const names = Object.keys(geos[0].attributes).filter((n) =>
    geos.every((g) => g.getAttribute(n)),
  );
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.getAttribute('position').count;
    iCount += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const out = new BufferGeometry();
  for (const n of names) {
    const size = geos[0].getAttribute(n).itemSize;
    const arr = new Float32Array(vCount * size);
    let o = 0;
    for (const g of geos) {
      const a = g.getAttribute(n);
      for (let i = 0; i < a.count; i++)
        for (let k = 0; k < size; k++) arr[o++] = a.getComponent(i, k);
    }
    out.setAttribute(n, new BufferAttribute(arr, size));
  }
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let io = 0;
  let base = 0;
  for (const g of geos) {
    const n = g.getAttribute('position').count;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + base;
    else for (let i = 0; i < n; i++) idx[io++] = i + base;
    base += n;
  }
  out.setIndex(new BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Paint one flat vertex colour over a whole geometry (for merged multi-tone parts). */
export function tintGeometry(g: BufferGeometry, r: number, gr: number, b: number): BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = gr;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}
