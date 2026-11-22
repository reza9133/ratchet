import { api, invalidate } from '../lib/chain.js';
import { wallet, requireMember } from '../lib/wallet.js';
import { CONTRACT_ADDRESS, CHAIN, explorerAddress } from '../lib/config.js';
import { $, esc, fmtGEN, parseGEN, shortAddr, sameAddr, avatar, copyText, fmtDuration } from '../lib/format.js';
import { runTx, ensureReady } from '../ui/tx.js';
import { openWalletModal } from '../ui/wallet-ui.js';
import { toast } from '../ui/kit.js';
import { loadingBlock } from '../ui/brand.js';

let data = null;

const bar = (label, v, max, hue = '') => `<div class="sb"><span>${label}</span><div class="bar"><i style="width:${max ? Math.max(3, (v / max) * 100) : 0}%"></i></div><b class="mono">${v}</b></div>`;

async function load(force = false) {
  const root = $('#asm-root');
  if (!data) root.innerHTML = loadingBlock('Reading the assembly from Studionet…');
  try {
    const [asm, ledger] = await Promise.all([api.assembly({ force }), api.ledger({ force })]);
    let acct = null;
    const me = wallet.state.account;
    if (me) {
      const [claimable, standing, balance] = await Promise.all([api.claimable(me, { force }), api.standing(me, { force }), api.balance(me).catch(() => null)]);
      acct = { claimable, standing, balance };
    }
    data = { asm, ledger, acct };
    render();
    $('#asm-updated').innerHTML = `<span class="dot"></span> Live · updated ${new Date().toLocaleTimeString()} · charter v${asm.charter_version}`;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card center"><h3>Couldn’t reach the contract</h3><p class="muted">The Studionet RPC didn’t answer (it is rate limited and sometimes returns gateway errors). Check the contract address <code>${esc(shortAddr(CONTRACT_ADDRESS, 10, 8))}</code> and try again.</p><button class="btn btn-primary" id="asm-retry">Retry</button></div>`;
    $('#asm-retry')?.addEventListener('click', () => load(true));
  }
}

function render() {
  const { asm, ledger, acct } = data;
  const me = wallet.state.account;
  const isMember = requireMember(asm);
  const s = asm.stats; const mx = Math.max(1, s.filed);
  const floor = asm.floor_motion ? `<a href="motions.html?id=${asm.floor_motion}">Motion #${asm.floor_motion} is on the floor →</a>` : 'The floor is free';
  const bond = BigInt(asm.bond);

  const acctHtml = !me
    ? `<div class="card acct-card"><h3>Your account</h3><p class="muted">Connect a wallet to see your balance, standing and any payouts waiting for you.</p><button class="btn btn-primary" id="a-connect">Connect wallet</button></div>`
    : `<div class="card acct-card"><div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">${avatar(me, 40)}<div><b class="addr">${esc(shortAddr(me, 8, 6))}</b><div>${isMember ? '<span class="chip" style="background:var(--ok-bg);color:var(--ok)">Member</span>' : '<span class="chip">Not a member</span>'}</div></div></div>
      <div class="ledger"><div class="r"><span>Wallet balance</span><b class="mono">${acct?.balance != null ? fmtGEN(acct.balance, 4) : '—'} GEN</b></div>
      <div class="r"><span>Claimable payout</span><b class="mono">${fmtGEN(acct.claimable, 6)} GEN</b></div>
      <div class="r"><span>Motions filed / enacted</span><b class="mono">${acct.standing.filed} / ${acct.standing.enacted}</b></div>
      <div class="r"><span>Challenges won / lost</span><b class="mono">${acct.standing.raised} / ${acct.standing.lost}</b></div></div>
      <button class="btn btn-primary" id="a-withdraw" style="margin-top:14px;width:100%" ${acct.claimable > 0n ? '' : 'disabled'}>Withdraw ${fmtGEN(acct.claimable, 6)} GEN</button>
      <p class="muted" style="font-size:.8rem;margin:10px 0 0">Payouts are pull payments: bounties, refunds and grants wait here until you withdraw them.${!isMember ? ' You can donate or be admitted by a motion, but only members can file, vote or challenge.' : ''}</p></div>`;

  $('#asm-root').innerHTML = `
    <div class="stat-grid">
      <div class="card stat reveal in"><small>Assembly</small><b style="font-size:1.25rem">${esc(asm.name)}</b><span>${floor}</span></div>
      <div class="card stat"><small>Members</small><b>${asm.member_count}</b><span>3 to 15 allowed</span></div>
      <div class="card stat"><small>Treasury</small><b>${fmtGEN(asm.treasury, 5)}</b><span>GEN in the commons</span></div>
      <div class="card stat"><small>Charter</small><b>v${asm.charter_version}</b><span>${asm.article_count} articles · <a href="charter.html">read</a></span></div>
    </div>
    <div class="two-col">
      <div style="display:grid;gap:20px">
        <div class="card"><h3>Members <span class="muted" style="font-weight:500">(${asm.member_count})</span></h3>
          ${asm.members.map((m) => `<div class="member">${avatar(m, 34)}<span class="addr">${esc(m)}</span>${sameAddr(m, me) ? '<span class="you">YOU</span>' : ''}<button class="copy" data-copy="${esc(m)}" title="Copy" style="margin-left:auto">⧉</button></div>`).join('')}</div>
        <div class="card"><h3>Track record</h3><div class="stats-bars">
          ${bar('Filed', s.filed, mx)}${bar('Enacted', s.enacted, mx)}${bar('Rejected', s.rejected, mx)}${bar('Lapsed', s.lapsed, mx)}${bar('Void', s.void, mx)}${bar('Tier raised', s.challenges_raised, mx)}${bar('Challenge failed', s.challenges_upheld, mx)}</div></div>
      </div>
      <div style="display:grid;gap:20px">
        ${acctHtml}
        <div class="card"><h3>Treasury</h3><p class="muted" style="font-size:.9rem;margin-top:0">Anyone can donate to the commons. Funds leave only through an enacted GRANT motion.</p>
          <div class="field"><label for="don">Amount (GEN)</label><input id="don" type="text" inputmode="decimal" placeholder="0.01" autocomplete="off"><div class="err-text" id="don-err"></div></div>
          <button class="btn btn-primary" id="a-donate" style="width:100%">Donate to the treasury</button></div>
        <div class="card"><h3>Parameters</h3><div class="ledger">
          <div class="r"><span>Bond per motion</span><b class="mono">${fmtGEN(bond, 6)} GEN</b></div>
          <div class="r"><span>Voting window</span><b class="mono">${fmtDuration(asm.vote_minutes * 60)}</b></div>
          <div class="r"><span>Challenge window</span><b class="mono">${fmtDuration(asm.challenge_minutes * 60)}</b></div>
          <div class="r"><span>Network</span><b>${CHAIN.short} · ${CHAIN.id}</b></div>
          <div class="r"><span>Contract</span><b class="mono"><a href="${esc(explorerAddress(CONTRACT_ADDRESS))}" target="_blank" rel="noopener">${esc(shortAddr(CONTRACT_ADDRESS, 8, 6))} ↗</a></b></div></div></div>
        <div class="card"><h3>Ledger <span class="solvent">${ledger.solvent ? '✓ solvent' : '⚠ check'}</span></h3><div class="ledger">
          <div class="r"><span>Contract balance</span><b class="mono">${fmtGEN(ledger.balance, 6)}</b></div>
          <div class="r"><span>Treasury</span><b class="mono">${fmtGEN(ledger.treasury, 6)}</b></div>
          <div class="r"><span>Escrow (bond on the floor)</span><b class="mono">${fmtGEN(ledger.escrow, 6)}</b></div>
          <div class="r"><span>Claimable (pull payments)</span><b class="mono">${fmtGEN(ledger.claimable_total, 6)}</b></div></div>
          <p class="muted" style="font-size:.8rem;margin:10px 0 0">Conservation law: balance ≥ treasury + escrow + claimable.</p></div>
      </div>
    </div>`;

  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => { await copyText(b.dataset.copy); toast({ title: 'Copied', msg: shortAddr(b.dataset.copy, 10, 8), kind: 'ok', ttl: 2000 }); }));
  $('#a-connect')?.addEventListener('click', openWalletModal);
  $('#a-withdraw')?.addEventListener('click', async () => {
    const out = await runTx({ title: 'Withdraw your payout', intro: 'The contract pays your whole pull balance to your wallet.', fn: 'withdraw' });
    if (out?.ok) { invalidate(); load(true); }
  });
  $('#a-donate').addEventListener('click', async () => {
    const wei = parseGEN($('#don').value);
    const err = $('#don-err');
    if (wei == null || wei <= 0n) { err.textContent = 'Enter a positive amount, e.g. 0.01'; return; }
    err.textContent = '';
    if (!ensureReady()) return;
    const out = await runTx({ title: `Donate ${fmtGEN(wei, 6)} GEN`, intro: 'The amount goes straight to the treasury.', fn: 'donate', value: wei });
    if (out?.ok) { $('#don').value = ''; invalidate(); load(true); }
  });
}

export default function init() {
  load();
  $('#asm-refresh').addEventListener('click', () => { invalidate(); load(true); });
  window.addEventListener('ratchet:refresh', () => { invalidate(); load(true); });
  window.addEventListener('ratchet:wallet', () => load());
  setInterval(() => { if (!document.hidden && !document.querySelector('.modal-back')) load(true); }, 45000);
}
