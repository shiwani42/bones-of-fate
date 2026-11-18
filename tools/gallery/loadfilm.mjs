// First-visit check of a deployed (or `vite preview`) build: a fresh page in the managed
// browser, no cache, throttled network, a frame every FILM_STEP ms.
//   FILM_URL=https://bones-of-fate.vercel.app FILM_OUT=/abs/dir FILM_MBPS=8 \
//   npx @iwsdk/cli browser run tools/gallery/loadfilm.mjs --timeout 100000
export default async function run({ context }) {
  const url = process.env.FILM_URL, out = process.env.FILM_OUT;
  if (!url || !out) throw new Error('set FILM_URL and FILM_OUT');
  const mbps = Number(process.env.FILM_MBPS || 8), step = Number(process.env.FILM_STEP || 700), n = Number(process.env.FILM_N || 18);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1500, height: 1000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: (mbps * 1e6) / 8, uploadThroughput: 2e6 / 8 });
  const logs = []; page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 160)); });
  const failed = []; page.on('requestfailed', (r) => failed.push(r.url().split('/').slice(-2).join('/')));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });
  const t0 = Date.now(); const times = [];
  await page.goto(url, { waitUntil: 'commit' });
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(step);
    await page.screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70 });
    times.push(((Date.now() - t0) / 1000).toFixed(1));
  }
  await page.close().catch(() => {});
  return { times, logs: logs.slice(0, 12), failed: failed.slice(0, 12) };
}
