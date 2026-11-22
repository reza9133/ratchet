// Floating "SIMULATION" control panel (demo mode only): switch member, fast-forward the clock, reset.
import { ACCOUNTS, advance } from './sim.js';
import { shortAddr } from '../lib/format.js';

export function mountDemoPanel() {
  const el = document.createElement('div');
  el.className = 'demo-panel closed'; el.id = 'demo-panel';
  if (new URLSearchParams(location.search).get('panel') === '0') el.style.display = 'none';
  el.innerHTML = `
    <button class="demo-head" type="button" aria-expanded="false"><span class="dot"></span> SIMULATION <em>no real chain</em></button>
    <div class="demo-body">
      <label>Act as member
        <select id="demo-acc">${ACCOUNTS.map((a, i) => `<option value="${i}">${a.name} · ${shortAddr(a.address, 6, 4)}</option>`).join('')}</select>
      </label>
      <div class="demo-row">
        <button type="button" data-adv="60">+1 min</button><button type="button" data-adv="300">+5 min</button><button type="button" data-adv="660">+11 min</button>
      </div>
      <div class="demo-row"><button type="button" id="demo-reset">Reset</button><a href="?demo=0">Exit demo</a></div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.demo-head').addEventListener('click', () => el.classList.toggle('closed'));
  el.querySelector('#demo-acc').addEventListener('change', (e) => window.__demo.setAccount(Number(e.target.value)));
  el.querySelectorAll('[data-adv]').forEach((b) => b.addEventListener('click', () => {
    advance(Number(b.dataset.adv));
    window.dispatchEvent(new CustomEvent('ratchet:refresh'));
  }));
  el.querySelector('#demo-reset').addEventListener('click', () => window.__demo.reset());
}
