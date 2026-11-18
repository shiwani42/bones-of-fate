// Save a PNG of the running app to $GALLERY_OUT. Size the window first with
// tools/gallery/window.mjs (a viewport override would not survive into XR).
//   GALLERY_OUT=/abs/path.png npx @iwsdk/cli browser run tools/gallery/snap.mjs
export default async function run({ page }) {
  const out = process.env.GALLERY_OUT;
  if (!out) throw new Error('set GALLERY_OUT');
  await page.waitForTimeout(Number(process.env.GALLERY_WAIT || 300));
  await page.screenshot({ path: out, type: 'png' });
  return { out, inner: await page.evaluate(() => [innerWidth, innerHeight]) };
}
