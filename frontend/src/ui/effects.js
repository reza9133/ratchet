import { $$ } from '../lib/format.js';

export function initReveal(root = document) {
  const els = $$('.reveal:not(.in)', root);
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach((e) => io.observe(e));
}

/** 3D hover tilt (cards) */
export function initTilt(root = document) {
  if (matchMedia('(hover: none)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('.tilt:not([data-tilt-on])', root).forEach((el) => {
    el.dataset.tiltOn = '1';
    const max = Number(el.dataset.tilt || 7);
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`;
      el.style.setProperty('--mx', `${(x + 0.5) * 100}%`); el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

/** mouse parallax for [data-depth] layers inside [data-parallax] containers */
export function initParallax() {
  if (matchMedia('(hover: none)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('[data-parallax]').forEach((box) => {
    const layers = $$('[data-depth]', box);
    box.addEventListener('pointermove', (e) => {
      const r = box.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      layers.forEach((l) => { const d = Number(l.dataset.depth); l.style.transform = `translate3d(${(-x * d).toFixed(1)}px, ${(-y * d).toFixed(1)}px, 0)`; });
    });
    box.addEventListener('pointerleave', () => layers.forEach((l) => { l.style.transform = ''; }));
  });
}

export function countUp(el, to, { dur = 900, fmt = (v) => Math.round(v).toLocaleString() } = {}) {
  if (!el) return;
  const t0 = performance.now(); const from = Number(el.dataset.v || 0); el.dataset.v = to;
  const step = (t) => { const p = Math.min(1, (t - t0) / dur); const e = 1 - (1 - p) ** 3; el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
