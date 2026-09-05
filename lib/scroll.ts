// JS-driven smooth scroll. Uses requestAnimationFrame rather than CSS
// `behavior:"smooth"`, which is a silent no-op in some webviews and whenever the
// viewer has "reduce motion" enabled. Returns a promise that resolves when done.

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function animateScrollBy(delta: number, duration = 420): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    const startY = window.scrollY;
    const targetY = Math.max(0, startY + delta);
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, startY + (targetY - startY) * easeOutCubic(p));
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
