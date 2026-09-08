// A burst of sparkles from an element — used when toggling Jazzify. Pure DOM,
// self-cleaning; styles live in globals.css (.sparkle-layer / .sparkle).

export function burstSparkles(anchor: HTMLElement, count = 16) {
  if (typeof document === "undefined") return;
  const r = anchor.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  const layer = document.createElement("div");
  layer.className = "sparkle-layer";
  const glyphs = ["✦", "✧", "✨", "•"];

  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "sparkle";
    s.textContent = glyphs[i % glyphs.length];
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const dist = 30 + Math.random() * 50;
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    s.style.setProperty("--delay", `${Math.random() * 140}ms`);
    s.style.setProperty("--size", `${10 + Math.random() * 12}px`);
    s.style.setProperty("--hue", `${Math.floor(Math.random() * 360)}`);
    layer.appendChild(s);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1200);
}
