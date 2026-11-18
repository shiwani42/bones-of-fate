/**
 * The HTML loading screen in index.html (#boot): shown before any script runs, so a
 * first visit never starts on a blank page. The game fills its bar as the court's
 * assets arrive and fades it out once they all have.
 */
export function setBootProgress(f: number): void {
  const bar = document.querySelector<HTMLElement>('#boot .boot-bar i');
  if (!bar) return;
  bar.parentElement?.classList.add('known');
  bar.style.width = `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`;
}

export function hideBoot(): void {
  const el = document.getElementById('boot');
  if (!el) return;
  setBootProgress(1);
  el.classList.add('done');
  window.setTimeout(() => el.remove(), 900);
}
