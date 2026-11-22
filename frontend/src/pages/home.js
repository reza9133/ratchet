import { api } from '../lib/chain.js';
import { fmtGEN, thresholdVotes, $, $$ } from '../lib/format.js';
import { TIERS } from '../lib/config.js';
import { countUp, initReveal, initTilt } from '../ui/effects.js';
import { gearSpinner } from '../ui/brand.js';
import { motionCard } from '../ui/motion-view.js';
import { CHAPTERS } from './chapters.js';

const TIPS = [
  'Hi, I’m <b>Mochi</b>! I’m the clerk who keeps the wheel honest.',
  'A motion’s tier = the <b>highest</b> tier among the articles it touches (and its floor).',
  'Challenges only ever <b>add</b> touched articles. Tiers go up, never down!',
  'Nobody voted? The bond is <b>forfeited</b> to the commons. Please vote 🐾',
  'Payouts are <b>pull payments</b>. Hit “Withdraw” on the Assembly page.',
  'If validators don’t agree <b>exactly</b>, nothing changes. Just send it again.',
];

const TIER_TEXT = {
  1: 'Tier 1 · ORDINARY: a strict majority is enough.',
  2: 'Tier 2 · QUALIFIED: two thirds of the frozen roster must say yes.',
  3: 'Tier 3 · ENTRENCHED: four fifths. Touching entrenched articles is hard.',
  4: 'Tier 4 · FOUNDATIONAL: unanimity. Every single member must agree.',
};

async function loadStats() {
  try {
    const a = await api.assembly();
    const set = (id, v) => { const el = $(id); el.classList.remove('skeleton'); return el; };
    countUp(set('#hs-members'), a.member_count);
    countUp(set('#hs-motions'), a.motion_count);
    const t = set('#hs-treasury'); t.textContent = fmtGEN(a.treasury, 4);
    const c = set('#hs-charter'); c.textContent = `v${a.charter_version}`;
    return a;
  } catch {
    ['#hs-members', '#hs-motions', '#hs-treasury', '#hs-charter'].forEach((id) => { const el = $(id); el.classList.remove('skeleton'); el.textContent = '—'; });
    return null;
  }
}

async function loadLatest(total) {
  const host = $('#latest-motions');
  try {
    const n = total ?? (await api.assembly()).motion_count;
    if (!n) { host.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center"><h3>No motions yet</h3><p class="muted">The floor is free. Connect a wallet and file the first motion.</p><a class="btn btn-primary" href="motions.html">Open motions</a></div>'; return; }
    const ids = []; for (let i = n; i > Math.max(0, n - 3); i -= 1) ids.push(i);
    const ms = []; for (const id of ids) ms.push(await api.motion(id));
    host.innerHTML = ms.map(motionCard).join(''); initReveal(host); initTilt(host);
  } catch {
    host.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center"><p class="muted" style="margin:0">Could not read motions right now (the Studionet RPC is rate limited). <a href="motions.html">Try the Motions page</a>.</p></div>';
  }
}

function initRatchet() {
  const ladder = $('#tier-ladder'); let tier = 1;
  const roster = $('#roster'); const needRow = $('#need-row');
  const names = Object.entries(TIERS);
  const paint = () => {
    const n = Number(roster.value); $('#roster-n').textContent = n;
    ladder.innerHTML = names.map(([t, v]) => `<div class="tl ${Number(t) === tier ? 'on' : Number(t) < tier ? 'passed' : ''}" style="--tc:var(--t${t})"><span class="tn">${t}</span><div><b>${v.name}</b><small>${v.rule}</small></div><span class="req">${thresholdVotes(t, n)} / ${n}</span></div>`).join('');
    needRow.innerHTML = names.map(([t]) => `<div class="${Number(t) === tier ? 'on' : ''}" style="--tc:var(--t${t})"><b>${thresholdVotes(t, n)}</b><span>TIER ${t}</span></div>`).join('');
    const msg = $('#rt-msg'); if (!msg.classList.contains('shake')) msg.textContent = TIER_TEXT[tier];
  };
  roster.addEventListener('input', paint); paint();
  const stage = $('#gear-stage'); $('#gear-fallback').innerHTML = gearSpinner(110);
  let gear = null;
  const ensure = async () => {
    if (gear) return gear;
    try {
      const { mountGear } = await import('../three/gear.js');
      gear = mountGear($('#gear-canvas'), { onTierChange: (t) => { tier = t; paint(); } });
      stage.classList.add('ready');
    } catch (e) { console.warn('WebGL unavailable', e); stage.classList.add('ready'); $('#gear-fallback').innerHTML = '<p class="muted" style="padding:20px;text-align:center">3D preview needs WebGL.</p>'; gear = { step: () => { tier = Math.min(4, tier + 1); paint(); }, tryBack() {}, reset() { tier = 1; paint(); } }; }
    return gear;
  };
  new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { ensure(); o.disconnect(); } }, { rootMargin: '200px' }).observe(stage);
  const flash = (txt) => { const m = $('#rt-msg'); m.textContent = txt; m.classList.add('shake'); setTimeout(() => { m.classList.remove('shake'); m.textContent = TIER_TEXT[tier]; }, 2600); };
  $('#rt-up').addEventListener('click', async () => { const g = await ensure(); if (tier >= 4) { g.step(); flash('Already FOUNDATIONAL: the ratchet is fully tightened. Unanimity is the ceiling.'); return; } g.step(); });
  $('#rt-back').addEventListener('click', async () => { const g = await ensure(); g.tryBack(); flash('Click! The pawl blocks the wheel: a tier can only go up, never down.'); });
  $('#rt-reset').addEventListener('click', async () => { (await ensure()).reset(); });
}

function initVideo() {
  const shell = $('#video-shell'), v = $('#demo-video'), btn = $('#play-big'), ch = $('#chapters');
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  ch.innerHTML = CHAPTERS.map((c) => `<li><button type="button" data-t="${c.t}"><time>${fmt(c.t)}</time>${c.label}</button></li>`).join('');

  // Seeking (chapters, scrubbing, "start at 1:17") needs HTTP Range support from the host, which many static
  // hosts / dev servers lack: the video then restarts from 0. To work everywhere the file is downloaded once
  // into memory and played from a blob: URL, where seeking is always exact.
  const src = document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') ? './media/demo.mp4' : './media/demo.webm';
  const note = document.createElement('div'); note.className = 'vid-loading'; note.hidden = true; shell.appendChild(note);
  let blobUrl = null, loading = null;
  const ensureBlob = () => {
    if (blobUrl) return Promise.resolve(blobUrl);
    if (loading) return loading;
    loading = (async () => {
      const res = await fetch(src); if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0; const type = res.headers.get('content-type') || (src.endsWith('mp4') ? 'video/mp4' : 'video/webm');
      const reader = res.body.getReader(); const parts = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (total) note.textContent = `Loading video… ${Math.round((got / total) * 100)}%`; }
      blobUrl = URL.createObjectURL(new Blob(parts, { type })); return blobUrl;
    })().catch((e) => { loading = null; throw e; });
    return loading;
  };
  new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { ensureBlob().catch(() => {}); o.disconnect(); } }, { rootMargin: '500px' }).observe(shell);

  let token = 0;
  async function start(t = 0) {
    const my = ++token;
    shell.classList.add('playing'); v.controls = true;
    if (v.dataset.blob !== '1') {
      note.hidden = false; note.textContent = 'Loading video…';
      try {
        const url = await ensureBlob(); if (my !== token) return;
        v.src = url; v.dataset.blob = '1';
        await new Promise((res, rej) => { v.addEventListener('loadedmetadata', res, { once: true }); v.addEventListener('error', rej, { once: true }); });
      } catch { /* fall back to the plain <source> elements */ }
      note.hidden = true;
    }
    if (my !== token) return;
    try { v.currentTime = t; } catch { /* ignore */ }
    v.play().catch(() => {});
    // some hosts ignore the first seek: verify and retry once the media can play
    if (t > 1) setTimeout(() => { if (Math.abs(v.currentTime - t) > 3 && my === token) { v.currentTime = t; } }, 700);
  }
  btn.addEventListener('click', () => start(0));
  v.addEventListener('click', () => { if (!shell.classList.contains('playing')) start(0); });
  ch.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const t = Number(b.dataset.t); shell.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (v.dataset.blob === '1') { shell.classList.add('playing'); v.controls = true; v.currentTime = t; v.play().catch(() => {}); } else start(t); });
  v.addEventListener('timeupdate', () => { const t = v.currentTime; let on = 0; CHAPTERS.forEach((c, i) => { if (t >= c.t) on = i; }); $$('li', ch).forEach((li, i) => li.classList.toggle('on', i === on && !v.paused)); });
  v.addEventListener('ended', () => { shell.classList.remove('playing'); v.controls = false; v.currentTime = 0; });
}

function initMochi() {
  let i = 0; const b = $('#bubble');
  const next = () => { i = (i + 1) % TIPS.length; b.innerHTML = TIPS[i]; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; };
  b.addEventListener('click', next); $('#next-tip').addEventListener('click', next);
  setInterval(next, 9000);
}

export default async function init() {
  initRatchet(); initVideo(); initMochi();
  const a = await loadStats();
  loadLatest(a?.motion_count);
  window.addEventListener('ratchet:refresh', async () => { const x = await loadStats(); loadLatest(x?.motion_count); });
}
