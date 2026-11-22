import { api, invalidate, chainNow } from '../lib/chain.js';
import { wallet, requireMember } from '../lib/wallet.js';
import { TIERS, CONTRACT_ADDRESS } from '../lib/config.js';
import { $, $$, esc, fmtGEN, parseGEN, shortAddr, sameAddr, avatar, fmtDuration, fmtTime, thresholdVotes, utf8Len } from '../lib/format.js';
import { runTx, ensureReady } from '../ui/tx.js';
import { openModal, toast } from '../ui/kit.js';
import { openWalletModal } from '../ui/wallet-ui.js';
import { loadingBlock } from '../ui/brand.js';
import { motionTitle, tierBadge, statusChip, voteBar, KIND_LABEL } from '../ui/motion-view.js';
import { initReveal, initTilt } from '../ui/effects.js';

const PAGE = 8;
let shown = 0, total = 0, rowsCache = [];
let tick = null;

const params = () => new URLSearchParams(location.search);
const isDetail = () => params().has('id');
const addrOk = (a) => /^0x[0-9a-fA-F]{40}$/.test((a || '').trim()) && !/^0x0{40}$/i.test(a.trim());

// ========================= LIST =========================
async function loadList(reset = true) {
  const host = $('#mo-list');
  if (reset) { host.innerHTML = loadingBlock('Reading motions…'); shown = 0; rowsCache = []; }
  try {
    const asm = await api.assembly({ force: reset });
    total = asm.motion_count;
    $('#mo-floor').innerHTML = asm.floor_motion
      ? `<span class="dot" style="background:#FFB800"></span> Floor held by <a href="motions.html?id=${asm.floor_motion}">motion #${asm.floor_motion}</a> · ${total} filed`
      : `<span class="dot"></span> The floor is free · ${total} motion${total === 1 ? '' : 's'} filed`;
    if (!total) { host.innerHTML = '<div class="card center"><h3>No motions yet</h3><p class="muted">Be the first: connect a wallet and file a motion.</p></div>'; $('#mo-more').hidden = true; return; }
    const remaining = total - shown; const limit = Math.min(PAGE, remaining);
    const offset = Math.max(0, total - shown - limit);
    const res = await api.motions(offset, limit, { force: reset });
    const rows = res.motions.slice().reverse(); shown += rows.length; rowsCache.push(...rows);
    const html = rows.map((r) => rowHtml(r)).join('');
    if (reset) host.innerHTML = `<div class="mlist">${html}</div>`; else host.firstElementChild.insertAdjacentHTML('beforeend', html);
    $('#mo-more').hidden = shown >= total;
    initReveal(host); initTilt(host);
    hydrate(rows.slice(0, 6));
  } catch (e) {
    console.error(e);
    host.innerHTML = '<div class="card center"><h3>Couldn’t read motions</h3><p class="muted">The RPC is busy. Please retry.</p><button class="btn btn-primary" id="mo-retry">Retry</button></div>';
    $('#mo-retry')?.addEventListener('click', () => loadList(true));
  }
}
function rowHtml(r) {
  return `<a class="card hover mrow reveal in" href="motions.html?id=${r.id}" data-row="${r.id}">
    <div class="top"><div style="display:flex;gap:12px;align-items:center"><span class="id">#${r.id}</span><span class="kind">${esc(KIND_LABEL[r.kind] || r.kind)}</span>${statusChip(r.status)}${r.tier ? tierBadge(r.tier, false) : ''}</div><span class="muted addr">${avatar(r.proposer, 18)} ${esc(shortAddr(r.proposer, 6, 4))}</span></div>
    <p data-title="${r.id}" class="skeleton" style="height:1.2em;width:60%"></p>
    <div class="top"><small class="muted">${r.yes} yes · ${r.no} no</small></div></a>`;
}
async function hydrate(rows) {
  for (const r of rows) {
    try {
      const m = await api.motion(r.id); const el = $(`[data-title="${r.id}"]`); if (!el) continue;
      el.className = ''; el.removeAttribute('style'); el.innerHTML = `<b>${esc(motionTitle(m))}</b> <span class="muted">· ${esc(m.text.slice(0, 120))}${m.text.length > 120 ? '…' : ''}</span>`;
      const row = $(`[data-row="${r.id}"]`); row?.insertAdjacentHTML('beforeend', voteBar(m.yes, m.no, m.roster.length, m.tier || m.floor_tier));
    } catch { /* leave the skeleton */ }
  }
}

// ========================= FILE A MOTION =========================
async function openFileModal() {
  let asm, charter;
  try { [asm, charter] = await Promise.all([api.assembly(), api.charter()]); } catch { toast({ title: 'Could not read the assembly', msg: 'Try again in a moment.', kind: 'bad' }); return; }
  const bond = BigInt(asm.bond); const me = wallet.state.account;
  const arts = Object.fromEntries(charter.articles.map((a) => [a.id, a]));
  let kind = 'AMEND';
  const m = openModal({ title: 'File a motion', wide: true, html: '<div id="fm"></div>' });
  const root = m.body.querySelector('#fm');

  const preview = () => {
    const out = {}; const errs = [];
    if (kind === 'AMEND') {
      const id = $('#f-id', root).value.trim().toUpperCase(); const text = $('#f-text', root).value.trim(); const repeal = $('#f-repeal', root)?.checked;
      const ex = arts[id]; const tier = Number($('#f-tier', root).value);
      if (!/^[A-Z][A-Z0-9_]{0,11}$/.test(id)) errs.push('Article id: 1–12 chars of A–Z, 0–9, _ starting with a letter.');
      if (utf8Len(text) > 500) errs.push('Text is longer than 500 bytes.');
      let action = 'ADOPT', floor = 1;
      if (ex) { floor = Math.max(1, ex.tier); action = repeal ? 'REPEAL' : 'REPLACE'; if (!repeal && !text) errs.push('Enter the new text, or tick “Repeal”.'); if (!repeal && text === ex.text && tier === ex.tier) errs.push('That amendment changes nothing.'); }
      else { if (!text) errs.push('Enter the text of the new article.'); if (repeal) errs.push('That article does not exist, nothing to repeal.'); if (charter.articles.length >= 12) errs.push('The charter is full (12 articles).'); }
      out.floor = floor; out.fn = 'file_amendment'; out.args = [id, action === 'REPEAL' ? '' : text, BigInt(action === 'REPEAL' ? 0 : tier)]; out.summary = `${action} article ${id}`;
      $('#f-action', root).innerHTML = `<b>${action}</b> · floor tier <span class="tier-badge" data-tier="${floor}">T${floor}</span>${ex ? ` (current tier of ${esc(id)})` : ' (new article)'}`;
      $('#f-bytes', root).textContent = `${utf8Len(text)}/500 bytes`;
    } else if (kind === 'GRANT') {
      const to = $('#f-to', root).value.trim(); const amt = parseGEN($('#f-amt', root).value); const why = $('#f-why', root).value.trim(); const tre = BigInt(asm.treasury);
      if (!addrOk(to)) errs.push('Recipient must be a 0x… address (40 hex chars).');
      if (amt == null || amt <= 0n || amt > tre) errs.push(`Amount must be positive and at most the treasury (${fmtGEN(tre, 6)} GEN).`);
      if (!why || utf8Len(why) > 500) errs.push('Purpose is required (max 500 bytes).');
      const floor = amt == null ? 1 : amt * 10n <= tre ? 1 : amt * 2n <= tre ? 2 : 3;
      out.floor = floor; out.fn = 'file_grant'; out.args = [to, amt ?? 0n, why]; out.summary = 'GRANT';
      $('#f-action', root).innerHTML = `Floor tier by size: <span class="tier-badge" data-tier="${floor}">T${floor}</span> (treasury ${fmtGEN(tre, 6)} GEN)`;
    } else if (kind === 'ADMIT') {
      const who = $('#f-cand', root).value.trim(); const st = $('#f-st', root).value.trim();
      if (!addrOk(who)) errs.push('Candidate must be a 0x… address.'); else if (asm.members.some((x) => sameAddr(x, who))) errs.push('That address is already a member.');
      if (asm.member_count >= 15) errs.push('The roster is full (15).');
      if (!st || utf8Len(st) > 500) errs.push('A statement is required (max 500 bytes).');
      out.floor = 2; out.fn = 'file_admission'; out.args = [who, st]; out.summary = 'ADMIT';
      $('#f-action', root).innerHTML = 'Floor tier <span class="tier-badge" data-tier="2">T2</span> · admissions need two thirds';
    } else {
      const who = $('#f-mem', root).value; const g = $('#f-gr', root).value.trim();
      if (asm.member_count <= 3) errs.push('The roster cannot drop below 3 members.');
      if (!g || utf8Len(g) > 500) errs.push('Grounds are required (max 500 bytes).');
      out.floor = 3; out.fn = 'file_expulsion'; out.args = [who, g]; out.summary = 'EXPEL';
      $('#f-action', root).innerHTML = 'Floor tier <span class="tier-badge" data-tier="3">T3</span> · expulsions need four fifths';
    }
    if (asm.floor_motion) errs.unshift(`Motion #${asm.floor_motion} is on the floor. Only one motion can be active.`);
    if (!asm.members.some((x) => sameAddr(x, me))) { if (me) errs.unshift('Your connected address is not a member of the assembly.'); }
    $('#f-errs', root).innerHTML = errs.map((e) => `<div>• ${esc(e)}</div>`).join('');
    $('#f-submit', root).disabled = errs.length > 0 && !!me;
    return out;
  };

  const body = () => ({
    AMEND: `<div class="field"><label for="f-id">Article id <span class="hint">existing id = replace / repeal · new id = adopt</span></label><input id="f-id" class="mono-in" type="text" list="f-ids" value="${charter.articles[0] ? '' : 'A1'}" placeholder="e.g. A1 or ARCHIVE" maxlength="12" autocomplete="off"><datalist id="f-ids">${charter.articles.map((a) => `<option value="${esc(a.id)}">`).join('')}</datalist></div>
      <div class="field"><label for="f-text">Article text <span class="hint" id="f-bytes">0/500 bytes</span></label><textarea id="f-text" maxlength="600" placeholder="The wording of the article…"></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div class="field"><label for="f-tier">Tier of the article</label><select id="f-tier">${[1, 2, 3, 4].map((t) => `<option value="${t}">${t} · ${TIERS[t].name}</option>`).join('')}</select></div>
      <div class="field"><span class="lbl">Repeal</span><label style="display:flex;gap:10px;align-items:center;font-weight:500;padding:11px 0"><input type="checkbox" id="f-repeal" style="width:auto"> Repeal this article instead</label></div></div>`,
    GRANT: `<div class="field"><label for="f-to">Recipient</label><input id="f-to" class="mono-in" type="text" placeholder="0x…" autocomplete="off"></div>
      <div class="field"><label for="f-amt">Amount (GEN) <span class="hint">treasury: ${fmtGEN(asm.treasury, 6)} GEN</span></label><input id="f-amt" type="text" inputmode="decimal" placeholder="0.001"></div>
      <div class="field"><label for="f-why">Purpose</label><textarea id="f-why" placeholder="What is the money for?"></textarea></div>`,
    ADMIT: `<div class="field"><label for="f-cand">Candidate address</label><input id="f-cand" class="mono-in" type="text" placeholder="0x…" autocomplete="off"></div>
      <div class="field"><label for="f-st">Statement</label><textarea id="f-st" placeholder="Why should this person join the assembly?"></textarea></div>`,
    EXPEL: `<div class="field"><label for="f-mem">Member to expel</label><select id="f-mem">${asm.members.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="f-gr">Grounds</label><textarea id="f-gr" placeholder="Why should this member be removed?"></textarea></div>`,
  }[kind]);

  const paint = () => {
    root.innerHTML = `<div class="tabs" role="tablist">${['AMEND', 'GRANT', 'ADMIT', 'EXPEL'].map((k) => `<button type="button" data-k="${k}" class="${k === kind ? 'on' : ''}">${{ AMEND: 'Amendment', GRANT: 'Grant', ADMIT: 'Admission', EXPEL: 'Expulsion' }[k]}</button>`).join('')}</div>
      ${body()}
      <div class="note" id="f-action" style="margin-bottom:12px"></div>
      <div class="err-text" id="f-errs"></div>
      <div class="note warn" style="margin-top:12px">You attach <b>exactly ${fmtGEN(bond, 6)} GEN</b> as a bond. It comes back when the motion ends (enacted, rejected, void, withdrawn, expired), unless nobody votes (forfeited) or a challenge raises the tier (half goes to the challenger).</div>
      <div class="modal-ft"><button class="btn btn-ghost" id="f-cancel">Cancel</button><button class="btn btn-primary" id="f-submit">File motion · ${fmtGEN(bond, 6)} GEN bond</button></div>`;
    $$('.tabs button', root).forEach((b) => b.addEventListener('click', () => { kind = b.dataset.k; paint(); }));
    $$('input,textarea,select', root).forEach((e) => { e.addEventListener('input', preview); e.addEventListener('change', preview); });
    $('#f-cancel', root).addEventListener('click', () => m.close());
    $('#f-submit', root).addEventListener('click', async () => {
      const o = preview(); if (!ensureReady()) return;
      if ($('#f-errs', root).textContent.trim()) return;
      m.close();
      const out = await runTx({ title: `File motion: ${o.summary}`, intro: `Bond ${fmtGEN(bond, 6)} GEN is held in escrow.`, fn: o.fn, args: o.args, value: bond });
      if (out?.ok) { invalidate(); route(); }
    });
    preview();
  };
  paint();
}

// ========================= DETAIL =========================
let current = null;

function timelineHtml(m) {
  const reachedContest = m.provisional === 'PASSED' || m.status === 'CONTESTABLE';
  const final = ['ENACTED', 'REJECTED', 'VOID', 'LAPSED', 'WITHDRAWN', 'EXPIRED'].includes(m.status);
  const steps = [['Filed', 'FILED'], ['Voting', 'VOTING'], ['Contest window', 'CONTESTABLE'], [final ? m.status : 'Settled', 'END']];
  const idx = { FILED: 0, VOTING: 1, CONTESTABLE: 2 }[m.status] ?? 3;
  return `<div class="timeline" style="grid-template-columns:repeat(4,1fr)">${steps.map(([label, key], i) => {
    let cls = '';
    if (final) {
      if (i === 3) cls = m.status === 'ENACTED' ? 'ok' : 'bad';
      else if (i === 2 && !reachedContest) cls = '';
      else if (m.status === 'WITHDRAWN' || m.status === 'EXPIRED') cls = i === 0 ? 'done' : '';
      else cls = 'done';
    } else cls = i < idx ? 'done' : i === idx ? 'now' : '';
    return `<div class="tl-step ${cls}">${esc(label)}</div>`;
  }).join('')}</div>`;
}

function detailBlock(m) {
  const d = m.detail || {};
  const rows = [];
  if (m.kind === 'AMEND') { rows.push(['Action', d.action], ['Article', d.article_id]); if (d.action !== 'REPEAL') rows.push(['New tier', `T${d.new_tier} · ${TIERS[d.new_tier]?.name}`]); }
  if (m.kind === 'GRANT') rows.push(['Recipient', d.recipient], ['Amount', `${fmtGEN(d.amount, 6)} GEN`], ['Treasury at filing', `${fmtGEN(d.treasury_at_filing, 6)} GEN`]);
  if (m.kind === 'ADMIT') rows.push(['Candidate', d.candidate]);
  if (m.kind === 'EXPEL') rows.push(['Member', d.member]);
  return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function touchesHtml(m) {
  const target = m.kind === 'AMEND' ? m.detail.article_id : null;
  const ch = m.challenge;
  return `<div class="touch-grid">${m.articles.map((a) => {
    if (a.id === target) return `<div class="touch"><b>${esc(a.id)}</b><span class="muted">edited by this motion</span><span class="flag muted">TARGET</span></div>`;
    if (!m.touches) return `<div class="touch"><b>${esc(a.id)}</b><span class="muted">${esc(a.text.slice(0, 70))}…</span><span class="flag muted">PENDING</span></div>`;
    const hit = m.touches[a.id]; const raisedBy = ch && ch.touches && ch.touches[a.id] && ch.raised;
    return `<div class="touch ${hit ? 'hit' : ''}"><b>${esc(a.id)}</b>${tierBadge(a.tier, false)}<span class="muted" style="font-size:.84rem">${esc(a.text.slice(0, 64))}${a.text.length > 64 ? '…' : ''}</span><span class="flag" style="color:${hit ? 'var(--t4)' : 'var(--ink-3)'}">${hit ? 'TOUCHED' : 'untouched'}${raisedBy ? ' · by challenge' : ''}</span></div>`;
  }).join('')}</div>`;
}

function actionsHtml(m, asm, myVote) {
  const me = wallet.state.account; const now = chainNow();
  const member = requireMember(asm); const inRoster = !!me && m.roster.some((x) => sameAddr(x, me));
  const n = m.roster.length; const part = m.yes + m.no; const need = thresholdVotes(m.tier || m.floor_tier, n);
  const bond = BigInt(asm.bond); const out = [];
  const btn = (id, label, cls = 'btn-primary', dis = false, title = '') => `<button class="btn ${cls}" id="${id}" ${dis ? 'disabled' : ''} title="${esc(title)}">${label}</button>`;
  const connectHint = !me ? `<div class="note">Connect your wallet to take part. <button class="btn btn-primary btn-sm" id="d-connect" style="margin-left:8px">Connect</button></div>` : '';
  if (m.status === 'FILED') {
    out.push(`<p class="muted" style="margin:0">Waiting for classification. A member asks the validators which articles this motion touches.</p>`);
    out.push(`<div class="btns">${btn('d-classify', '🧠 Classify (AI consensus)', 'btn-primary', !member, member ? '' : 'Members only')}${sameAddr(me, m.proposer) ? btn('d-withdraw', 'Withdraw motion', 'btn-ghost') : ''}${now >= m.stale_at ? btn('d-expire', 'Expire (stale)', 'btn-ghost') : ''}</div>`);
    if (now < m.stale_at) out.push(`<small class="muted">Becomes stale in ${fmtDuration(m.stale_at - now)}: anyone may then expire it and free the floor.</small>`);
  } else if (m.status === 'VOTING') {
    const open = now < m.vote_deadline; const hopeless = m.yes + (n - part) < need;
    const closable = part === n || now >= m.vote_deadline || (hopeless && part * 2 >= n);
    if (inRoster && myVote === 'NONE' && open) out.push(`<div><b>Cast your vote</b><div class="btns" style="margin-top:8px">${btn('d-yes', '✓ Vote YES', 'btn-ok')}${btn('d-no', '✕ Vote NO', 'btn-danger')}</div></div>`);
    else if (inRoster && myVote !== 'NONE') out.push(`<div class="note ok">You voted <b>${myVote}</b>.</div>`);
    else if (me && !inRoster) out.push(`<div class="note">You were not on the frozen roster, so you cannot vote on this motion.</div>`);
    out.push(`<div class="btns">${btn('d-close', 'Close vote', closable ? 'btn-primary' : 'btn-ghost', !closable, 'Closes when everyone voted, the deadline passed, or the motion is hopeless with at least half the roster voted')}</div>`);
    if (!closable) out.push(`<small class="muted">A passing count never ends voting early. It closes when everyone has voted or the deadline passes.</small>`);
  } else if (m.status === 'CONTESTABLE') {
    const open = now <= m.contest_deadline; const challenged = !!m.challenge;
    const can = inRoster && !sameAddr(me, m.proposer) && !challenged && open;
    out.push(`<p style="margin:0">Passed provisionally under the <b>strict</b> reading. A roster member (not the proposer) can challenge once, with a bond, for an <b>inclusive</b> re-read that may raise the tier.</p>`);
    out.push(`<div class="btns">${btn('d-challenge', `⚖️ Challenge · ${fmtGEN(bond, 6)} GEN bond`, 'btn-primary', !can, challenged ? 'Already challenged' : !open ? 'Window closed' : sameAddr(me, m.proposer) ? 'The proposer cannot challenge' : !inRoster ? 'Roster members only' : '')}${btn('d-finalize', 'Finalize', challenged || !open ? 'btn-primary' : 'btn-ghost', !(challenged || !open), 'Available after the window closes, or right after a challenge')}</div>`);
    if (!challenged && open) out.push(`<small class="muted">Window closes in ${fmtDuration(m.contest_deadline - now)}.</small>`);
  } else {
    const msg = { ENACTED: 'This motion passed and its effect was applied.', REJECTED: 'This motion did not reach the required supermajority.', VOID: 'The motion passed, but its effect no longer applied (void).', LAPSED: 'Fewer than half of the roster voted, so the bond was forfeited to the commons.', WITHDRAWN: 'The proposer withdrew the motion before classification.', EXPIRED: 'Nobody classified the motion in time.' }[m.status];
    out.push(`<div class="note ${m.status === 'ENACTED' ? 'ok' : ''}">${esc(msg)}</div>`);
  }
  return `<div class="act-panel">${connectHint}${out.join('')}</div>`;
}

async function loadDetail(force = false) {
  const id = Number(params().get('id'));
  const host = $('#mo-detail-view');
  if (!current) host.innerHTML = loadingBlock(`Reading motion #${id}…`);
  try {
    const [m, asm] = await Promise.all([api.motion(id, { force }), api.assembly({ force })]);
    const me = wallet.state.account;
    const myVote = me && m.status === 'VOTING' ? await api.vote(id, me, { force }) : 'NONE';
    current = { m, asm, myVote }; renderDetail();
  } catch (e) {
    console.error(e);
    host.innerHTML = `<a class="crumb" href="motions.html">← All motions</a><div class="card center"><h3>Motion #${id} not found</h3><p class="muted">It may not exist yet, or the RPC is busy.</p><button class="btn btn-primary" id="d-retry">Retry</button></div>`;
    $('#d-retry')?.addEventListener('click', () => loadDetail(true));
  }
}

function renderDetail() {
  const { m, asm, myVote } = current; const host = $('#mo-detail-view'); const now = chainNow();
  const tier = m.tier || m.floor_tier; const n = m.roster.length; const need = thresholdVotes(tier, n);
  const ch = m.challenge;
  const deadline = m.status === 'VOTING' ? m.vote_deadline : m.status === 'CONTESTABLE' ? m.contest_deadline : 0;
  host.innerHTML = `
    <a class="crumb" href="motions.html">← All motions</a>
    <div class="detail-grid">
      <div style="display:grid;gap:20px">
        <div class="card">
          <div class="top" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="id" style="font:800 1.6rem var(--display);color:var(--cobalt)">#${m.id}</span><span class="kind">${esc(KIND_LABEL[m.kind])}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap">${statusChip(m.status)}${tierBadge(tier)}</div></div>
          <h2 style="font-size:1.6rem;margin:14px 0 8px">${esc(motionTitle(m))}</h2>
          <p style="font-size:1.05rem">${esc(m.text)}</p>${detailBlock(m)}
          <div class="muted" style="font-size:.86rem">Filed by <span class="addr">${esc(shortAddr(m.proposer, 8, 6))}</span> on ${fmtTime(m.filed_at)} · frozen roster of ${n} · bond ${fmtGEN(m.bond, 6)} GEN</div>
          ${timelineHtml(m)}
        </div>
        <div class="card"><h3>What the validators decided</h3>
          ${m.touches ? '' : '<p class="muted">Not classified yet. Once a member sends <code>classify</code>, validators answer one yes/no question per article and must agree exactly.</p>'}
          ${touchesHtml(m)}
          ${m.reason ? `<div class="note" style="margin-top:12px"><b>Strict reading:</b> ${esc(m.reason)}</div>` : ''}
          ${ch ? `<div class="note ${ch.raised ? 'warn' : ''}" style="margin-top:10px"><b>Challenge by</b> <span class="addr">${esc(shortAddr(ch.by, 6, 4))}</span> (inclusive reading): ${esc(ch.reason)}<div class="tier-jump" style="margin-top:8px">${tierBadge(ch.tier_before, false)}<span class="arrow">${ch.raised ? '→' : '='}</span>${tierBadge(ch.tier_after, false)}<span>${ch.raised ? 'Tier raised: challenger wins their bond back plus half of the proposer’s.' : 'Tier unchanged: the challenge failed, the bond is split between proposer and commons.'}</span></div></div>` : ''}
        </div>
      </div>
      <div style="display:grid;gap:20px">
        <div class="card">
          <h3>Votes <span class="muted" style="font-weight:500">· ${need} of ${n} needed</span></h3>
          <div class="big-vote"><div class="nums"><span style="color:var(--ok)">${m.yes} YES</span><span class="muted">${n - m.yes - m.no} not voted</span><span style="color:var(--err)">${m.no} NO</span></div>${voteBar(m.yes, m.no, n, tier)}</div>
          <div class="muted" style="font-size:.86rem">${TIERS[tier].rule} (${TIERS[tier].short}) of the frozen roster. ${m.status === 'VOTING' ? '' : ''}</div>
          ${deadline ? `<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><small class="muted">${m.status === 'VOTING' ? 'Voting closes in' : 'Challenge window closes in'}</small><div class="countdown" id="countdown" data-deadline="${deadline}">${fmtDuration(deadline - now)}</div>` : ''}
        </div>
        <div class="card"><h3>Actions</h3>${actionsHtml(m, asm, myVote)}</div>
      </div>
    </div>`;
  bindActions(m, asm); startTick();
}

function startTick() {
  clearInterval(tick);
  tick = setInterval(() => {
    const c = $('#countdown'); if (!c) return;
    const left = Number(c.dataset.deadline) - chainNow();
    if (left <= 0) { clearInterval(tick); renderDetail(); return; }
    c.textContent = fmtDuration(left);
  }, 1000);
}

function bindActions(m, asm) {
  const id = BigInt(m.id); const bond = BigInt(asm.bond);
  const go = async (opts) => { const out = await runTx(opts); if (out?.ok) { invalidate(); await loadDetail(true); } };
  $('#d-connect')?.addEventListener('click', openWalletModal);
  $('#d-classify')?.addEventListener('click', () => go({ title: `Classify motion #${m.id}`, intro: 'Validators will independently answer: does this motion touch each other article? Their answers must match exactly.', fn: 'classify', args: [id], ai: true }));
  $('#d-withdraw')?.addEventListener('click', () => go({ title: `Withdraw motion #${m.id}`, fn: 'withdraw_motion', args: [id] }));
  $('#d-expire')?.addEventListener('click', () => go({ title: `Expire motion #${m.id}`, fn: 'expire_motion', args: [id] }));
  $('#d-yes')?.addEventListener('click', () => go({ title: `Vote YES on #${m.id}`, fn: 'vote', args: [id, true] }));
  $('#d-no')?.addEventListener('click', () => go({ title: `Vote NO on #${m.id}`, fn: 'vote', args: [id, false] }));
  $('#d-close')?.addEventListener('click', () => go({ title: `Close the vote on #${m.id}`, fn: 'close_vote', args: [id] }));
  $('#d-challenge')?.addEventListener('click', () => go({ title: `Challenge motion #${m.id}`, intro: `Bond ${fmtGEN(bond, 6)} GEN. Validators re-read the motion with the INCLUSIVE reading. A tier can only go up.`, fn: 'challenge', args: [id], value: bond, ai: true }));
  $('#d-finalize')?.addEventListener('click', () => go({ title: `Finalize motion #${m.id}`, fn: 'finalize', args: [id] }));
}

// ========================= routing =========================
function route() {
  clearInterval(tick); current = null;
  if (isDetail()) { $('#mo-list-view').hidden = true; $('#mo-detail-view').hidden = false; loadDetail(); }
  else { $('#mo-list-view').hidden = false; $('#mo-detail-view').hidden = true; loadList(true); }
}

export default function init() {
  $('#mo-file').addEventListener('click', () => { if (!ensureReady()) return; openFileModal(); });
  $('#mo-refresh').addEventListener('click', () => { invalidate(); loadList(true); });
  $('#mo-more').addEventListener('click', () => loadList(false));
  window.addEventListener('ratchet:refresh', () => { invalidate(); if (isDetail()) loadDetail(true); else loadList(true); });
  window.addEventListener('ratchet:wallet', () => { if (isDetail()) loadDetail(); });
  setInterval(() => { if (!document.hidden && !document.querySelector('.modal-back')) { if (isDetail()) loadDetail(true); } }, 30000);
  route();
}
