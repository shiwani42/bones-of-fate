// Resize the managed browser WINDOW (persists after the script, unlike a viewport
// override), so an XR session started afterwards renders at the larger size.
export default async function run({ page, context }) {
  const w = Number(process.env.GALLERY_W || 1800);
  const h = Number(process.env.GALLERY_H || 1200);
  const cdp = await context.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
  // find the frame overhead, then size the window so the page itself is w x h
  const inner = await page.evaluate(() => [innerWidth, innerHeight, outerWidth, outerHeight]);
  const dw = Math.max(0, inner[2] - inner[0]), dh = Math.max(0, inner[3] - inner[1]);
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: w + dw, height: h + dh } });
  await page.waitForTimeout(800);
  return await page.evaluate(() => [innerWidth, innerHeight]);
}
