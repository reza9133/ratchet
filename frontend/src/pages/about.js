import { LINKS, CONTRACT_ADDRESS, CHAIN, explorerAddress } from '../lib/config.js';
import { $, shortAddr, copyText } from '../lib/format.js';
import { toast } from '../ui/kit.js';
import { logoMark } from '../ui/brand.js';
import glBlack from '../assets/genlayer-logo-black.svg';
import symBlack from '../assets/genlayer-symbol-black.svg';

export default function init() {
  $('#about-root').innerHTML = `
    <div class="card wide" style="display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center">
      <div style="width:120px">${logoMark('rt-mark')}</div>
      <div><h2 style="margin-bottom:8px">A constitution with a one-way wheel</h2>
      <p class="lead" style="margin-bottom:10px">RATCHET explores a simple question for intelligent contracts: <i>how do you let an LLM judge meaning without letting it move money?</i> The answer here is to ask it only narrow yes/no questions, demand that validators match <b>exactly</b>, compute everything else in code, and let members challenge a lenient reading. The tier can only ratchet up.</p>
      <p class="muted" style="margin:0">The logo is a ratchet wheel with its pawl and an upward chevron, the one direction the contract allows.</p></div>
    </div>
    <a class="card hover tilt link-card" href="${LINKS.github}" target="_blank" rel="noopener"><span class="ic">🐙</span><h3 style="margin:0">GitHub</h3><p class="muted" style="margin:0">Contract, tests, mutation suite, live e2e script.</p><b>reza9133/ratchet ↗</b></a>
    <a class="card hover tilt link-card" href="${LINKS.x}" target="_blank" rel="noopener"><span class="ic">𝕏</span><h3 style="margin:0">Author on X</h3><p class="muted" style="margin:0">Follow the build and say hi.</p><b>${LINKS.xHandle} ↗</b></a>
    <a class="card hover tilt link-card" href="${LINKS.genlayer}" target="_blank" rel="noopener"><span class="ic"><img src="${symBlack}" alt="" style="width:26px"></span><h3 style="margin:0">GenLayer</h3><p class="muted" style="margin:0">The intelligent-contract chain this runs on.</p><b>genlayer.com ↗</b></a>
    <div class="card"><h3>Mochi, the mascot</h3><img src="./assets/mochi.webp" alt="Mochi" style="width:150px;margin:6px auto 10px;animation:floaty 5s ease-in-out infinite"><p class="muted" style="margin:0">Mochi is the GenLayer cat who keeps the wheel honest. The mascot art is used for the Ratchet project’s pages.</p></div>
    <div class="card"><h3>Deployment</h3><dl class="kv"><dt>Network</dt><dd>${CHAIN.name} (${CHAIN.id})</dd><dt>Contract</dt><dd>${shortAddr(CONTRACT_ADDRESS, 10, 8)} <button class="copy" id="ab-copy">⧉</button></dd><dt>Explorer</dt><dd><a href="${explorerAddress(CONTRACT_ADDRESS)}" target="_blank" rel="noopener">open ↗</a></dd><dt>Runtime</dt><dd>GenVM v0.2.16</dd></dl></div>
    <div class="card"><h3>Built with</h3><p class="muted" style="margin:0 0 12px">genlayer-js 1.1.8 · three.js · Vite · EIP-6963 wallet discovery · vanilla JS, no framework.</p><img class="gl-logo" src="${glBlack}" alt="GenLayer"></div>
    <div class="card wide"><h3>Disclaimer</h3><p class="muted" style="margin:0">RATCHET is a reference implementation and has not been audited. Studionet is a test network: GEN has no monetary value. Do not use it to govern anything real.</p></div>`;
  $('#ab-copy').addEventListener('click', async () => { await copyText(CONTRACT_ADDRESS); toast({ title: 'Address copied', msg: CONTRACT_ADDRESS, kind: 'ok', ttl: 2500 }); });
}
