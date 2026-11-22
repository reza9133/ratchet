import { logoMark } from './brand.js';
import { initWalletUI } from './wallet-ui.js';
import { initReveal, initTilt, initParallax } from './effects.js';
import { CONTRACT_ADDRESS, LINKS, CHAIN, DEMO, explorerAddress } from '../lib/config.js';
import { copyText, shortAddr, $ } from '../lib/format.js';
import { toast } from './kit.js';
import glBlack from '../assets/genlayer-logo-black.svg';
import glWhite from '../assets/genlayer-logo-white.svg';

const NAV = [
  ['index.html', 'Home', 'home'], ['assembly.html', 'Assembly', 'assembly'], ['charter.html', 'Charter', 'charter'],
  ['motions.html', 'Motions', 'motions'], ['docs.html', 'Docs', 'docs'], ['about.html', 'About', 'about'],
];

export function renderHeader(page) {
  const h = $('#site-header');
  h.innerHTML = `<div class="container hdr">
    <a class="brand" href="index.html" aria-label="Ratchet home">${logoMark()}<span class="w">RATCHET<small>on GenLayer</small></span></a>
    <nav class="nav" id="nav" aria-label="Main">${NAV.map(([href, label, id]) => `<a href="${href}"${id === page ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <div class="hdr-right" id="hdr-right"></div>
    <button class="burger" id="burger" aria-label="Menu" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  </div>`;
  const onScroll = () => h.classList.toggle('scrolled', window.scrollY > 24);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  $('#burger').addEventListener('click', () => { const o = $('#nav').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', String(o)); });
  $('#nav').addEventListener('click', () => $('#nav').classList.remove('open'));
}

export function renderFooter() {
  const f = $('#site-footer'); if (!f) return;
  f.className = 'site';
  f.innerHTML = `<div class="container"><div class="f-grid">
    <div><a class="brand" href="index.html">${logoMark()}<span class="w">RATCHET<small>on GenLayer</small></span></a>
      <p style="max-width:34ch;font-size:.92rem">A self-tightening constitution for small assemblies. Rules that can be hardened, never loosened by the back door.</p>
      <div class="f-gl"><span>Built on</span><img src="${glWhite}" alt="GenLayer"></div></div>
    <div><h5>Explore</h5><a href="assembly.html">Assembly</a><a href="charter.html">Charter</a><a href="motions.html">Motions</a><a href="index.html#demo">Demo video</a></div>
    <div><h5>Learn</h5><a href="docs.html">Documentation</a><a href="docs.html#api">Contract API</a><a href="docs.html#consensus">Consensus rule</a><a href="about.html">About</a></div>
    <div><h5>Links</h5><a href="${LINKS.github}" target="_blank" rel="noopener">GitHub ↗</a><a href="${LINKS.x}" target="_blank" rel="noopener">X · ${LINKS.xHandle} ↗</a><a href="${LINKS.genlayer}" target="_blank" rel="noopener">GenLayer ↗</a>
      <h5 style="margin-top:18px">Contract · ${CHAIN.short}</h5>
      <span class="f-contract" id="f-contract"><span>${shortAddr(CONTRACT_ADDRESS, 10, 8)}</span><button class="copy" style="color:#8fe9ff" title="Copy">⧉</button></span>
      <a href="${explorerAddress(CONTRACT_ADDRESS)}" target="_blank" rel="noopener" style="margin-top:6px">Open in explorer ↗</a></div>
  </div>
  <div class="f-bottom"><span>© ${new Date().getFullYear()} RATCHET · MIT licensed · Not audited, reference implementation.</span><span>Made with Mochi 🐾 for GenLayer</span></div></div>`;
  $('#f-contract .copy').addEventListener('click', async () => { await copyText(CONTRACT_ADDRESS); toast({ title: 'Contract address copied', msg: CONTRACT_ADDRESS, kind: 'ok', ttl: 2500 }); });
}

export async function mountShell(page) {
  renderHeader(page); renderFooter();
  if (DEMO) {
    const [{ installDemoWallets }, { mountDemoPanel }] = await Promise.all([import('../demo/fakeWallet.js'), import('../demo/panel.js')]);
    installDemoWallets(); mountDemoPanel();
    const r = document.createElement('div'); r.className = 'demo-ribbon'; r.textContent = 'SIMULATION · DEMO DATA'; document.body.appendChild(r);
  }
  initWalletUI();
  initReveal(); initTilt(); initParallax();
  window.addEventListener('load', () => setTimeout(() => $('#splash')?.classList.add('gone'), 250));
  setTimeout(() => $('#splash')?.classList.add('gone'), 2200);
}
export { glBlack, glWhite };
