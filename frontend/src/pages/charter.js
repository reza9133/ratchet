import { api, invalidate } from '../lib/chain.js';
import { TIERS } from '../lib/config.js';
import { $, esc, thresholdVotes } from '../lib/format.js';
import { loadingBlock } from '../ui/brand.js';

const TC = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)' };
let members = 5;

function paintNeeds() {
  const n = Number($('#ch-roster').value); $('#ch-roster-n').textContent = n;
  $('#ch-needs').innerHTML = [1, 2, 3, 4].map((t) => `<div class="need-line" style="--tc:${TC[t]}"><span class="tier-badge" data-tier="${t}">T${t}</span><div class="bar"><i style="width:${(thresholdVotes(t, n) / n) * 100}%"></i></div><b class="mono">${thresholdVotes(t, n)} / ${n}</b></div>`).join('');
}

function paintTower() {
  $('#tower').innerHTML = [1, 2, 3, 4].map((t) => `<div class="plate" style="--tc:${TC[t]};--z:${(t - 1) * 34}" title="${TIERS[t].name}: ${TIERS[t].rule}"><span>${t}</span></div>`).join('');
}

async function load(force = false) {
  const host = $('#ch-list');
  try {
    const [c, a] = await Promise.all([api.charter({ force }), api.assembly({ force })]);
    members = a.member_count; $('#ch-roster').value = members; paintNeeds();
    $('#ch-version').innerHTML = `<span class="dot"></span> Charter version <b>${c.version}</b> · ${c.articles.length} articles · roster of ${a.member_count}`;
    host.innerHTML = c.articles.length ? c.articles.map((x, i) => `<article class="card article reveal in" data-tier="${x.tier}" style="--d:${i * 0.05}s">
      <div class="aid">${esc(x.id)}</div><p>${esc(x.text)}</p>
      <div class="meta"><span class="tier-badge" data-tier="${x.tier}">T${x.tier} · ${TIERS[x.tier].name}</span><span class="muted" style="font-size:.85rem">touching it needs <b>${thresholdVotes(x.tier, a.member_count)}</b> of ${a.member_count} votes (${TIERS[x.tier].rule.toLowerCase()})</span></div></article>`).join('')
      : '<div class="card center"><h3>The charter is empty</h3><p class="muted">Adopt the first article with an AMEND motion.</p></div>';
  } catch (e) {
    console.error(e);
    host.innerHTML = '<div class="card center"><h3>Couldn’t read the charter</h3><p class="muted">The RPC is busy. Please retry in a moment.</p><button class="btn btn-primary" id="ch-retry">Retry</button></div>';
    $('#ch-retry')?.addEventListener('click', () => load(true));
  }
}

export default function init() {
  paintTower(); paintNeeds();
  $('#ch-roster').addEventListener('input', paintNeeds);
  $('#ch-refresh').addEventListener('click', () => { invalidate(); load(true); });
  window.addEventListener('ratchet:refresh', () => { invalidate(); load(true); });
  load();
}
