// In-browser SIMULATION of the Ratchet contract (demo mode only, ?demo=1).
// It re-implements the contract's rules (tiers, thresholds, bonds, bounties, pull payments, floor lock) in JS
// and replaces the LLM validators with a tiny keyword "clerk".  Nothing here talks to a network.
import { friendlyError } from '../lib/receipt.js';

const E18 = 10n ** 18n;
const TIER_NAMES = { 1: 'ORDINARY', 2: 'QUALIFIED', 3: 'ENTRENCHED', 4: 'FOUNDATIONAL' };
const KIND_FLOOR = { AMEND: 1, GRANT: 1, ADMIT: 2, EXPEL: 3 };
const MAX_TEXT = 500, MAX_ARTICLES = 12, MAX_MEMBERS = 15, MIN_MEMBERS = 3;

class Revert extends Error {}
const speed = () => Number(sessionStorage.getItem('ratchet.sim.speed') || 1) || 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / speed()));
const utf8 = (s) => new TextEncoder().encode(s).length;

function fakeAddr(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let out = '';
  while (out.length < 40) { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; out += h.toString(16).padStart(8, '0'); }
  return '0x' + out.slice(0, 40);
}
export const ACCOUNTS = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank (outsider)', 'Grace (grant recipient)']
  .map((name) => ({ name, address: fakeAddr('ratchet-demo-' + name) }));
const FOUNDERS = ACCOUNTS.slice(0, 5).map((a) => a.address);

let offset = 0;
const now = () => Math.floor(Date.now() / 1000) + offset;
export const advance = (sec) => { offset += sec; save(); };
export const simNow = () => now();

const S = {};
function initState() {
  Object.assign(S, {
    name: 'Ratchet Demo Assembly', bond: 4n * 10n ** 15n, vote_minutes: 10, challenge_minutes: 5, charter_version: 1,
    motion_count: 0, floor_motion: 0, treasury: 0n, escrow: 0n, claimable_total: 0n,
    n: { filed: 0, enacted: 0, rejected: 0, lapsed: 0, void: 0, raised: 0, upheld: 0 },
    members: new Set(FOUNDERS), motions: new Map(), votes: new Map(), claimable: new Map(), standing: new Map(),
    articles: new Map([
      ['A1', { text: 'Meetings are held on the first Sunday of every month.', tier: 1 }],
      ['A2', { text: 'Membership can only be granted or withdrawn by the assembly itself; no officer may add or remove a member alone.', tier: 4 }],
      ['A3', { text: 'Treasury funds may never be spent on political campaigns.', tier: 3 }],
      ['A4', { text: 'The newsletter is sent by e-mail once a month.', tier: 2 }],
    ]),
    balances: new Map(ACCOUNTS.map((a) => [a.address, 1n * E18])),
  });
}

// ---------------------------------------------------------------- helpers (same math as the contract)
export const thresholdVotes = (tier, n) => (tier === 1 ? Math.floor(n / 2) + 1 : tier === 2 ? Math.floor((2 * n + 2) / 3)
  : tier === 3 ? Math.floor((4 * n + 4) / 5) : n);
const sortedArticles = () => [...S.articles.keys()].sort();
const snapshot = () => sortedArticles().map((id) => ({ id, text: S.articles.get(id).text, tier: S.articles.get(id).tier }));
const deriveTier = (floor, touches, tiers) => Object.keys(touches).sort().reduce((t, id) => (touches[id] ? Math.max(t, tiers[id]) : t), floor);
const validId = (v) => typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,11}$/.test(v);
const validAddr = (v) => { if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Revert('invalid address'); return v.toLowerCase(); };
const bounded = (v, limit, label) => {
  if (typeof v !== 'string') throw new Revert(`${label} must be a string`);
  const t = v.trim();
  if (!t || utf8(t) > limit) throw new Revert(`invalid ${label}: required, at most ${limit} bytes`);
  return t;
};
const num = (v) => Number(v);
const credit = (a, amt) => { if (amt <= 0n) return; S.claimable.set(a, (S.claimable.get(a) ?? 0n) + amt); S.claimable_total += amt; };
const bump = (c, a) => { const k = `${c}:${a}`; S.standing.set(k, (S.standing.get(k) ?? 0) + 1); };

// ---------------------------------------------------------------- the keyword "clerk" (stands in for the LLM validators)
const KEYWORDS = { A1: ['meeting', 'sunday'], A2: ['membership', 'member', 'officer', 'proxy', 'delegate'],
  A3: ['campaign', 'political', 'election', 'candidate', 'party', 'lobby'], A4: ['newsletter', 'e-mail', 'email'] };
const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'only', 'every', 'once', 'month', 'held', 'sent', 'may', 'never', 'itself', 'alone']);
const VERBS = /\b(suspend|suspended|override|overrides|ignore|repeal|abolish|waive|waives|no longer|notwithstanding)\b/i;
function keywordsFor(article) {
  if (KEYWORDS[article.id]) return KEYWORDS[article.id];
  return article.text.toLowerCase().split(/[^a-z-]+/).filter((w) => w.length > 5 && !STOP.has(w));
}
function assess(motion, mode, others) {
  const text = `${motion.text} ${JSON.stringify(motion.detail)}`.toLowerCase();
  const touches = {}; const hit = [];
  for (const a of others) {
    const named = new RegExp(`\\b${a.id.toLowerCase()}\\b`).test(text);
    const overlap = keywordsFor(a).some((k) => text.includes(k));
    const strict = named || (overlap && (VERBS.test(text) || motion.kind === 'GRANT'));
    const v = mode === 'initial' ? strict : strict || overlap;
    touches[a.id] = v; if (v) hit.push(a.id);
  }
  const reason = hit.length
    ? (mode === 'initial'
      ? `The motion clearly overrides or contradicts ${hit.join(', ')}.`
      : `In practice the motion would weaken or bypass ${hit.join(', ')}, even though it is not named.`)
    : 'The motion does not clearly touch any other article.';
  return { touches, reason };
}

// ---------------------------------------------------------------- contract logic
const others = (m) => { const t = m.kind === 'AMEND' ? m.detail.article_id : null; return m.articles.filter((a) => a.id !== t); };
const motionOf = (id) => {
  id = num(id);
  if (!(id >= 1 && id <= S.motion_count)) throw new Revert('motion not found');
  return S.motions.get(id);
};
const requireMember = (who) => { if (!S.members.has(who)) throw new Revert('members only'); };

function fileMotion(who, value, kind, detail, text, floor) {
  requireMember(who);
  if (S.floor_motion !== 0) throw new Revert('the floor is held by another motion');
  if (value !== S.bond) throw new Revert('attach exactly the bond');
  const t = now(); const id = S.motion_count + 1;
  S.motions.set(id, { id, kind, proposer: who, status: 'FILED', text, detail, floor_tier: floor, roster: [...S.members].sort(),
    articles: snapshot(), bond: Number(S.bond), bond_left: S.bond, filed_at: t, stale_at: t + S.vote_minutes * 60, digest: '',
    touches: null, tier: 0, reason: '', classified_at: 0, vote_deadline: 0, yes: 0, no: 0, closed_at: 0, contest_deadline: 0,
    provisional: '', challenge: null, outcome: '', settled_at: 0 });
  S.motion_count = id; S.floor_motion = id; S.escrow += S.bond; S.n.filed += 1; bump('filed', who);
}

function exec(who, fn, args, value) {
  const noValue = () => { if (value !== 0n) throw new Revert('this call does not accept value'); };
  switch (fn) {
    case 'file_amendment': {
      const [id, newTextRaw, newTierRaw] = args; const newTier = num(newTierRaw);
      if (!validId(id)) throw new Revert('article id must be 1-12 chars of A-Z, 0-9, _ starting with a letter');
      const newText = String(newTextRaw ?? '').trim();
      if (utf8(newText) > MAX_TEXT) throw new Revert('new_text too long or invalid');
      const ex = S.articles.get(id); let floor = 1, action;
      if (ex) {
        floor = Math.max(1, ex.tier);
        if (newText === '') { if (newTier !== 0) throw new Revert('repeal requires new_tier 0'); action = 'REPEAL'; }
        else {
          if (!(newTier >= 1 && newTier <= 4)) throw new Revert('new_tier must be 1-4');
          if (newText === ex.text && newTier === ex.tier) throw new Revert('amendment changes nothing');
          action = 'REPLACE';
        }
      } else {
        if (newText === '') throw new Revert('cannot repeal an article that does not exist');
        if (!(newTier >= 1 && newTier <= 4)) throw new Revert('new_tier must be 1-4');
        if (S.articles.size >= MAX_ARTICLES) throw new Revert('charter is full');
        action = 'ADOPT';
      }
      return fileMotion(who, value, 'AMEND', { article_id: id, action, new_text: newText, new_tier: newTier }, newText || `Repeal article ${id}`, floor);
    }
    case 'file_grant': {
      const recipient = validAddr(args[0]); const amount = BigInt(args[1]); const purpose = bounded(args[2], MAX_TEXT, 'purpose');
      if (amount <= 0n || amount > S.treasury) throw new Revert('grant must be positive and within the treasury');
      const floor = amount * 10n <= S.treasury ? 1 : amount * 2n <= S.treasury ? 2 : 3;
      return fileMotion(who, value, 'GRANT', { recipient, amount: amount.toString(), treasury_at_filing: S.treasury.toString() }, purpose, floor);
    }
    case 'file_admission': {
      const c = validAddr(args[0]); const st = bounded(args[1], MAX_TEXT, 'statement');
      if (S.members.has(c)) throw new Revert('already a member');
      if (S.members.size >= MAX_MEMBERS) throw new Revert('roster is full');
      return fileMotion(who, value, 'ADMIT', { candidate: c }, st, KIND_FLOOR.ADMIT);
    }
    case 'file_expulsion': {
      const m = validAddr(args[0]); const g = bounded(args[1], MAX_TEXT, 'grounds');
      if (!S.members.has(m)) throw new Revert('not a member');
      if (S.members.size <= MIN_MEMBERS) throw new Revert('roster cannot drop below the minimum');
      return fileMotion(who, value, 'EXPEL', { member: m }, g, KIND_FLOOR.EXPEL);
    }
    case 'withdraw_motion': {
      noValue(); const m = motionOf(args[0]);
      if (m.status !== 'FILED') throw new Revert('only an unclassified motion can be withdrawn');
      if (who !== m.proposer) throw new Revert('only the proposer can withdraw');
      return closeWithoutVote(m, 'WITHDRAWN');
    }
    case 'expire_motion': {
      noValue(); const m = motionOf(args[0]);
      if (m.status !== 'FILED') throw new Revert('motion is not waiting for classification');
      if (now() < m.stale_at) throw new Revert('motion is not stale yet');
      return closeWithoutVote(m, 'EXPIRED');
    }
    case 'classify': {
      noValue(); const m = motionOf(args[0]); requireMember(who);
      if (m.status !== 'FILED') throw new Revert('motion is not waiting for classification');
      const oth = others(m); let r;
      if (oth.length) {
        const a = assess(m, 'initial', oth); const tiers = Object.fromEntries(oth.map((x) => [x.id, x.tier]));
        r = { touches: a.touches, tier: deriveTier(m.floor_tier, a.touches, tiers), reason: a.reason };
      } else r = { touches: {}, tier: m.floor_tier, reason: 'No other charter article exists; the floor tier applies.' };
      const t = now(); Object.assign(m, { touches: r.touches, tier: r.tier, reason: r.reason, classified_at: t, vote_deadline: t + S.vote_minutes * 60, status: 'VOTING' });
      return;
    }
    case 'vote': {
      noValue(); const m = motionOf(args[0]); const support = args[1];
      if (m.status !== 'VOTING') throw new Revert('voting is not open');
      if (now() >= m.vote_deadline) throw new Revert('voting deadline passed');
      if (!m.roster.includes(who)) throw new Revert('not on the frozen roster');
      if (typeof support !== 'boolean') throw new Revert('support must be a boolean');
      const k = `${m.id}:${who}`; if (S.votes.get(k)) throw new Revert('already voted');
      S.votes.set(k, support ? 1 : 2); m[support ? 'yes' : 'no'] += 1; return;
    }
    case 'close_vote': {
      noValue(); const m = motionOf(args[0]);
      if (m.status !== 'VOTING') throw new Revert('voting is not open');
      const t = now(); const n = m.roster.length; const part = m.yes + m.no; const need = thresholdVotes(m.tier, n);
      const passed = m.yes >= need; const hopeless = m.yes + (n - part) < need;
      if (!(part === n || t >= m.vote_deadline || (hopeless && part * 2 >= n))) throw new Revert('voting is still open');
      m.closed_at = t;
      if (passed) {
        m.provisional = 'PASSED';
        if (others(m).length) { m.status = 'CONTESTABLE'; m.contest_deadline = t + S.challenge_minutes * 60; return; }
        return conclude(m);
      }
      if (part * 2 < n) {
        Object.assign(m, { provisional: 'LAPSED', status: 'LAPSED', outcome: 'LAPSED', settled_at: t });
        S.n.lapsed += 1; release(m); S.treasury += m.bond_left; S.escrow -= m.bond_left; m.bond_left = 0n; return;
      }
      m.provisional = 'REJECTED'; return conclude(m);
    }
    case 'challenge': {
      const m = motionOf(args[0]); requireMember(who);
      if (m.status !== 'CONTESTABLE') throw new Revert('motion is not contestable');
      if (m.challenge) throw new Revert('already challenged');
      if (now() > m.contest_deadline) throw new Revert('contest window closed');
      if (who === m.proposer) throw new Revert('proposer cannot challenge own motion');
      if (!m.roster.includes(who)) throw new Revert('not on the frozen roster');
      if (value !== S.bond) throw new Revert('attach exactly the bond');
      const oth = others(m); if (!oth.length) throw new Revert('nothing to contest: no other article exists');
      const tiers = Object.fromEntries(oth.map((x) => [x.id, x.tier]));
      const a = assess(m, 'challenge', oth);
      const merged = {}; for (const [id, f] of Object.entries(a.touches)) merged[id] = !!f || !!m.touches[id];
      const newTier = deriveTier(m.floor_tier, merged, tiers); const oldTier = m.tier; const raised = newTier > oldTier;
      if (raised) {
        const bounty = m.bond_left / 2n; m.bond_left -= bounty; S.escrow -= bounty; credit(who, S.bond + bounty); S.n.raised += 1; bump('raised', who);
      } else {
        const toProp = S.bond / 2n; credit(m.proposer, toProp); S.treasury += S.bond - toProp; S.n.upheld += 1; bump('lost', who);
      }
      m.challenge = { by: who, at: now(), touches: a.touches, tier_before: oldTier, tier_after: newTier, raised, reason: a.reason };
      m.touches = merged; m.tier = newTier; return;
    }
    case 'finalize': {
      noValue(); const m = motionOf(args[0]);
      if (m.status !== 'CONTESTABLE') throw new Revert('motion is not contestable');
      if (!m.challenge && now() <= m.contest_deadline) throw new Revert('contest window still open');
      return conclude(m);
    }
    case 'donate': if (value <= 0n) throw new Revert('attach a positive amount'); S.treasury += value; return;
    case 'withdraw': {
      noValue(); const amt = S.claimable.get(who) ?? 0n; if (amt <= 0n) throw new Revert('nothing to withdraw');
      S.claimable.set(who, 0n); S.claimable_total -= amt;
      S.balances.set(who, (S.balances.get(who) ?? 0n) + amt); return;
    }
    default: throw new Revert(`unknown method ${fn}`);
  }
}

function release(m) { if (S.floor_motion === m.id) S.floor_motion = 0; }
function refund(m) { if (m.bond_left > 0n) { credit(m.proposer, m.bond_left); S.escrow -= m.bond_left; m.bond_left = 0n; } }
function closeWithoutVote(m, status) { Object.assign(m, { status, outcome: status, settled_at: now() }); release(m); refund(m); }
function conclude(m) {
  const need = thresholdVotes(m.tier, m.roster.length);
  const status = m.yes >= need ? enact(m) : 'REJECTED';
  Object.assign(m, { status, outcome: status, settled_at: now() });
  if (status === 'ENACTED') { S.n.enacted += 1; bump('enacted', m.proposer); } else if (status === 'REJECTED') S.n.rejected += 1; else S.n.void += 1;
  release(m); refund(m);
}
function enact(m) {
  const d = m.detail;
  if (m.kind === 'AMEND') {
    const ex = S.articles.has(d.article_id);
    if (d.action === 'REPEAL') { if (!ex) return 'VOID'; S.articles.delete(d.article_id); }
    else {
      if (d.action === 'ADOPT') { if (ex || S.articles.size >= MAX_ARTICLES) return 'VOID'; } else if (!ex) return 'VOID';
      S.articles.set(d.article_id, { text: d.new_text, tier: d.new_tier });
    }
    S.charter_version += 1; return 'ENACTED';
  }
  if (m.kind === 'GRANT') { const a = BigInt(d.amount); if (a > S.treasury) return 'VOID'; S.treasury -= a; credit(d.recipient, a); return 'ENACTED'; }
  if (m.kind === 'ADMIT') { if (S.members.has(d.candidate) || S.members.size >= MAX_MEMBERS) return 'VOID'; S.members.add(d.candidate); return 'ENACTED'; }
  if (m.kind === 'EXPEL') { if (!S.members.has(d.member) || S.members.size <= MIN_MEMBERS) return 'VOID'; S.members.delete(d.member); return 'ENACTED'; }
  return 'VOID';
}

// ---------------------------------------------------------------- views (same JSON shapes as the contract)
const dump = (o) => JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
const motionJson = (m) => ({ ...m, bond_left: m.bond_left, bond: m.bond });
export async function view(fn, args = []) {
  await sleep(120 + Math.random() * 120);
  switch (fn) {
    case 'get_assembly': return dump({ name: S.name, bond: S.bond.toString(), vote_minutes: S.vote_minutes, challenge_minutes: S.challenge_minutes,
      charter_version: S.charter_version, members: [...S.members].sort(), member_count: S.members.size, article_count: S.articles.size,
      motion_count: S.motion_count, floor_motion: S.floor_motion, treasury: S.treasury.toString(),
      stats: { filed: S.n.filed, enacted: S.n.enacted, rejected: S.n.rejected, lapsed: S.n.lapsed, void: S.n.void, challenges_raised: S.n.raised, challenges_upheld: S.n.upheld } });
    case 'get_charter': return dump({ version: S.charter_version, articles: snapshot() });
    case 'get_motion': {
      const m = JSON.parse(dump(motionJson(motionOf(args[0]))));
      const tier = m.tier || m.floor_tier; m.votes_needed = thresholdVotes(tier, m.roster.length); m.effective_tier_name = TIER_NAMES[tier]; return dump(m);
    }
    case 'list_motions': {
      const off = num(args[0]), lim = num(args[1]); const rows = [];
      for (let id = off + 1; id <= Math.min(S.motion_count, off + lim); id += 1) { const m = S.motions.get(id);
        rows.push({ id: m.id, kind: m.kind, status: m.status, proposer: m.proposer, tier: m.tier, yes: m.yes, no: m.no }); }
      return dump({ total: S.motion_count, motions: rows });
    }
    case 'get_vote': { const m = motionOf(args[0]); return { 0: 'NONE', 1: 'YES', 2: 'NO' }[S.votes.get(`${m.id}:${String(args[1]).toLowerCase()}`) ?? 0]; }
    case 'get_claimable': return (S.claimable.get(String(args[0]).toLowerCase()) ?? 0n).toString();
    case 'get_standing': { const a = String(args[0]).toLowerCase(); const o = {};
      for (const c of ['filed', 'enacted', 'raised', 'lost']) o[c] = S.standing.get(`${c}:${a}`) ?? 0; return dump(o); }
    case 'get_ledger': { const books = S.treasury + S.escrow + S.claimable_total;
      return dump({ balance: books.toString(), treasury: S.treasury.toString(), escrow: S.escrow.toString(), claimable_total: S.claimable_total.toString(), books: books.toString(), solvent: true }); }
    case 'quote_threshold': return thresholdVotes(num(args[0]), num(args[1]));
    default: throw new Error(`unknown view ${fn}`);
  }
}
export async function balance(addr) { return S.balances.get(String(addr).toLowerCase()) ?? 0n; }

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function send({ sender, fn, args, value, onStage }) {
  const hash = '0x' + hex(32); const ai = fn === 'classify' || fn === 'challenge';
  await sleep(500);
  if ((S.balances.get(sender) ?? 0n) < value) return { ok: false, kind: 'SUBMIT_ERROR', errorText: 'insufficient funds', friendly: 'Insufficient GEN balance for this transaction.' };
  onStage('submitted', { hash });
  const stages = ai ? ['PENDING', 'PROPOSING', 'COMMITTING', 'REVEALING'] : ['PENDING', 'PROPOSING'];
  const per = (ai ? 4400 : 1500) / stages.length;
  for (const st of stages) { onStage('consensus', { hash, status: st }); await sleep(per); }
  try {
    exec(sender, fn, args, value);
    S.balances.set(sender, (S.balances.get(sender) ?? 0n) - value);
    save();
    onStage('consensus', { hash, status: 'ACCEPTED' });
    return { ok: true, kind: 'OK', hash, status: 'ACCEPTED' };
  } catch (e) {
    if (e instanceof Revert) return { ok: false, kind: 'EXEC_ERROR', hash, errorText: e.message, friendly: friendlyError(e.message) };
    throw e;
  }
}

// ---------------------------------------------------------------- seed a little history so every page has content
function seed() {
  const [A, B, C, D, E] = FOUNDERS; const bond = S.bond;
  const act = (who, fn, args, v = 0n) => exec(who, fn, args, v);
  offset = -3 * 86400;
  S.treasury += 30n * 10n ** 15n;
  act(B, 'file_amendment', ['ARCHIVE', 'The assembly keeps a public archive of its minutes.', 1n], bond);
  act(A, 'classify', [1n]); offset += 60;
  FOUNDERS.forEach((m) => act(m, 'vote', [1n, true])); act(A, 'close_vote', [1n]);
  offset += S.challenge_minutes * 60 + 30; act(C, 'finalize', [1n]);
  offset += 3600;
  act(D, 'file_amendment', ['A4', 'The newsletter is sent weekly by e-mail.', 2n], bond);
  act(D, 'classify', [2n]); offset += 60;
  [[A, false], [B, true], [C, false], [D, true], [E, false]].forEach(([m, s]) => act(m, 'vote', [2n, s]));
  act(A, 'close_vote', [2n]);
  offset = -1800; // the "present" starts 30 minutes after the seeded history
  offset = 0;
}

// ---- persist across page loads (the site is multi-page) so a demo session survives navigation
const KEY = 'ratchet.sim.v1';
const ser = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? { $b: x.toString() } : x instanceof Map ? { $m: [...x] } : x instanceof Set ? { $s: [...x] } : x));
const de = (t) => JSON.parse(t, (_, x) => (x && typeof x === 'object' ? ('$b' in x ? BigInt(x.$b) : '$m' in x ? new Map(x.$m) : '$s' in x ? new Set(x.$s) : x) : x));
const save = () => { try { sessionStorage.setItem(KEY, ser({ S, offset })); } catch { /* quota */ } };
function restore() {
  try { const t = sessionStorage.getItem(KEY); if (!t) return false; const o = de(t); Object.assign(S, o.S); offset = o.offset; return true; } catch { return false; }
}
export function resetDemo() { sessionStorage.removeItem(KEY); offset = 0; initState(); seed(); save(); }
initState();
if (!restore()) { seed(); save(); }

if (typeof window !== 'undefined') window.__demoSim = { advance, resetDemo, ACCOUNTS, state: S };
