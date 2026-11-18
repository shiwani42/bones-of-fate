// Dev: hide named meshes of Shakuni (MESH_HIDE=a,b) or list them; then snapshot to $GALLERY_OUT if set.
export default async function run({ page, frame }) {
  const hide = (process.env.MESH_HIDE || '').split(',').filter(Boolean);
  const res = await (frame || page).evaluate((hide) => {
    const d = window.__chausar; if (!d) return 'no handle';
    const root = d.shakuni.group; const out = [];
    root.traverse((o) => { if (o.isMesh) { const n = o.name + ' [' + (Array.isArray(o.material) ? o.material.map((m) => m.name).join('|') : o.material.name) + ']'; if (hide.length) o.visible = !hide.some((h) => n.includes(h)); out.push(n + (o.visible ? '' : ' (hidden)')); } });
    return out;
  }, hide);
  if (process.env.GALLERY_OUT) { await page.waitForTimeout(400); await page.screenshot({ path: process.env.GALLERY_OUT }); }
  return res;
}
