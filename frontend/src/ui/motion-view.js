import { esc, fmtGEN, shortAddr, thresholdVotes } from '../lib/format.js';
import { TIERS } from '../lib/config.js';

export const KIND_LABEL = { AMEND: 'Amendment', GRANT: 'Grant', ADMIT: 'Admission', EXPEL: 'Expulsion' };

export function motionTitle(m) {
  const d = m.detail || {};
  if (m.kind === 'AMEND') return d.action === 'REPEAL' ? `Repeal article ${d.article_id}` : d.action === 'ADOPT' ? `Adopt article ${d.article_id}` : `Replace article ${d.article_id}`;
  if (m.kind === 'GRANT') return `Grant ${fmtGEN(d.amount, 6)} GEN to ${shortAddr(d.recipient, 6, 4)}`;
  if (m.kind === 'ADMIT') return `Admit ${shortAddr(d.candidate, 6, 4)}`;
  if (m.kind === 'EXPEL') return `Expel ${shortAddr(d.member, 6, 4)}`;
  return `Motion #${m.id}`;
}

export const tierBadge = (tier, name = true) => (tier ? `<span class="tier-badge" data-tier="${tier}">T${tier}${name ? ' · ' + TIERS[tier].name : ''}</span>` : '');
export const statusChip = (s) => `<span class="status" data-s="${esc(s)}">${esc(s)}</span>`;

export function voteBar(yes, no, roster, tier) {
  const n = Math.max(1, roster); const need = tier ? thresholdVotes(tier, roster) : 0;
  return `<div class="vote-bar" title="${yes} yes · ${no} no · ${need} needed of ${roster}"><i class="y" style="width:${(yes / n) * 100}%"></i><i class="n" style="width:${(no / n) * 100}%"></i>${need ? `<span class="need" style="left:calc(${(need / n) * 100}% - 1.5px)"></span>` : ''}</div>`;
}

export function motionCard(m) {
  const tier = m.tier || m.floor_tier;
  return `<a class="card hover tilt mcard reveal" href="motions.html?id=${m.id}">
    <div class="top"><span class="kind">#${m.id} · ${esc(KIND_LABEL[m.kind] || m.kind)}</span>${statusChip(m.status)}</div>
    <h3>${esc(motionTitle(m))}</h3><p>${esc(m.text)}</p>
    ${voteBar(m.yes, m.no, m.roster.length, tier)}
    <div class="top"><small class="muted">${m.yes} yes · ${m.no} no · ${thresholdVotes(tier, m.roster.length)} needed</small>${tierBadge(tier, false)}</div></a>`;
}
