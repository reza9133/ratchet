#!/usr/bin/env node
// RATCHET live end-to-end run.
//
//   node scripts/e2e.mjs            deploy a fresh contract on GenLayer Studionet and run every scenario
//   node scripts/e2e.mjs --sim      same script against the local Direct-Mode bridge (no network)
//
// Flags: --full (adds the expiry scenario)  --chaos (sim only: inject a failed consensus)
//        --ai-attempts N (default 2: how often an AI transaction may be re-sent after an
//        UNDETERMINED consensus; the failed attempt must have changed nothing)
//
// Philosophy.  An LLM is not under our control, so the AI-dependent expectations ("the strict
// reading should flag A3") are SOFT (warnings).  What is HARD is everything the contract itself
// guarantees about whatever consensus decided: the stored booleans cover exactly the right
// articles, tier = max(floor, touched tiers), the vote threshold follows the tier, bonds and
// bounties route exactly, money is conserved, and a failed consensus changes nothing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LiveChain, SimChain } from './lib/chain.mjs';
import { ephemeralKeys, loadKeys, FUND_AMOUNT, MIN_BALANCE, ROLE_NAMES } from './lib/keys.mjs';
import { ensureFunded } from './lib/funding.mjs';
import { Report } from './lib/report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const opt = (flag, fallback) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : fallback; };
const SIM = has('--sim');
const FULL = has('--full');
const CHAOS = has('--chaos');
const SETTLE_MINUTES = Number(opt('--settle-minutes', process.env.SETTLE_MINUTES ?? (SIM ? 0 : 10)));   // how long the final sweep waits for delayed payouts
const PAYOUT_WAIT_MINUTES = Number(opt('--payout-wait-minutes', process.env.PAYOUT_WAIT_MINUTES ?? (SIM ? 0 : 10)));   // how long a withdraw may take to finalize
const PAYOUT_CREDIT_SECONDS = Number(opt('--payout-credit-seconds', process.env.PAYOUT_CREDIT_SECONDS ?? (SIM ? 5 : 180)));   // after finalization the credit must be visible within this
const FUND_WAIT_SECONDS = Number(opt('--fund-wait-seconds', process.env.E2E_FUND_WAIT_SECS ?? (SIM ? 0 : 600)));   // wait for faucet funding when sim_fundAccount is unavailable
const FEE_ALLOWANCE = 1_000_000_000_000_000n;   // 0.001 GEN per account: tolerated if the network ever charges fees
const AI_ATTEMPTS = Math.max(1, Number(opt('--ai-attempts', process.env.AI_ATTEMPTS ?? 2)));
const CONTRACT_PATH = path.resolve(opt('--contract', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'contracts', 'Ratchet.py')));

const BOND = 4_000_000_000_000_000n;            // 0.004 GEN
const DONATION = 30_000_000_000_000_000n;       // 0.03 GEN
const GRANT = 1_000_000_000_000_000n;           // 0.001 GEN (<= 10% of the treasury: floor tier 1)
const VOTE_MIN = 2;
const CHALLENGE_MIN = 2;
const VOTE_SECONDS = VOTE_MIN * 60;
const CHARTER = [
  { id: 'A1', tier: 1, text: 'Meetings are held on the first Sunday of every month.' },
  { id: 'A2', tier: 4, text: 'Membership can only be granted or withdrawn by the assembly itself; no officer may add or remove a member alone.' },
  { id: 'A3', tier: 3, text: 'Treasury funds may never be spent on political campaigns.' },
  { id: 'A4', tier: 2, text: 'The newsletter is sent by e-mail once a month.' },
];
const FOUNDERS = ['F0', 'F1', 'F2', 'F3', 'F4'];
const NAMES = ROLE_NAMES;                       // F0..F4, O, G (shared with scripts/keys.mjs)
const ALL_FINAL = ['ENACTED', 'REJECTED', 'LAPSED', 'VOID', 'WITHDRAWN', 'EXPIRED'];
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const max = (list) => list.reduce((a, b) => (b > a ? b : a), list[0]);
const fmt = (wei) => `${Number(wei) / 1e18} GEN`;

async function startSim() {
  if (process.env.SIM_URL) return { url: process.env.SIM_URL, stop() {} };
  const port = 8700 + Math.floor(Math.random() * 200);
  const venvPython = path.join(ROOT, '.venv', 'bin', 'python');
  const python = process.env.PYTHON || (fs.existsSync(venvPython) ? venvPython : 'python3');
  const child = spawn(python, [path.join(ROOT, 'scripts', 'sim_bridge.py'), '--port', String(port), '--contract', CONTRACT_PATH],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sim bridge did not start within 180 s')), 180_000);
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); } });
    child.on('exit', (code) => reject(new Error(`sim bridge exited early (${code})`)));
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => child.kill() };
}

async function main() {
  const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
  if (source.includes('\r') || source.charCodeAt(0) === 0xfeff) {
    throw new Error('contracts/Ratchet.py must use LF endings and no BOM (deployed bytes must match the repo).');
  }
  const sim = SIM ? await startSim() : null;
  const chain = SIM ? new SimChain({ url: sim.url }) : new LiveChain();
  const keys = SIM ? ephemeralKeys(NAMES) : loadKeys(path.join(ROOT, '.e2e', 'keys.json'), NAMES);
  const A = (name) => keys[name].address;
  const report = new Report({
    mode: SIM ? 'sim (local Direct Mode bridge, real contract code)' : 'live', network: SIM ? 'simulated' : chain.rpc,
    sourceSha256: sha256(source), address: null });
  let address = null;
  let orphan = 0n;     // wei held by the contract that its books do not know about (measured, expected 0)
  const spent = Object.fromEntries(NAMES.map((n) => [n, 0n]));      // value attached to accepted transactions
  const received = Object.fromEntries(NAMES.map((n) => [n, 0n]));   // value pulled out with withdraw
  let deliveryBroken = false;   // set when a FINALIZED withdraw never credited its recipient: later waits are cut short
  const startBalance = {};

  const rj = async (fn, args = []) => JSON.parse(await chain.read(address, fn, args));
  const getAsm = () => rj('get_assembly');
  const getMotion = (id) => rj('get_motion', [BigInt(id)]);
  const getLedger = () => rj('get_ledger');
  const claimable = async (name) => BigInt(await chain.read(address, 'get_claimable', [A(name)]));
  const treasury = async () => BigInt((await getAsm()).treasury);
  const quote = async (tier, n = 5) => Number(await chain.read(address, 'quote_threshold', [BigInt(tier), BigInt(n)]));
  const eventually = async (read, done, { timeout = 90, step = 3 } = {}) => {
    const t0 = Date.now();
    let last;
    for (;;) {
      last = await read();
      if (done(last) || (Date.now() - t0) / 1000 > timeout) return last;
      await chain.sleep(step);
    }
  };

  async function send(name, fn, args = [], { value = 0n, label, attempt = 1 } = {}) {
    const t0 = Date.now();
    const out = await chain.write({ from: keys[name], address, fn, args, value });
    report.tx({ label: label ?? `${name}.${fn}`, ok: out.ok, kind: out.kind, hash: out.hash, attempt,
      seconds: Math.round((Date.now() - t0) / 1000) });
    if (out.ok) spent[name] += BigInt(value);
    return out;
  }

  const snapshot = async (mid) => JSON.stringify([await getAsm(), mid ? await getMotion(mid) : null]);

  /** AI transactions may fail to reach consensus; that is allowed, but it must change nothing. */
  async function aiTx(name, fn, mid, { value = 0n } = {}) {
    let out;
    const attempts = [];
    for (let attempt = 1; attempt <= AI_ATTEMPTS; attempt += 1) {
      const before = await snapshot(mid);
      out = await send(name, fn, [BigInt(mid)], { value, attempt });
      attempts.push(out.ok ? 'OK' : out.kind);
      if (out.ok || out.kind !== 'UNDETERMINED') break;
      const after = await snapshot(mid);
      report.check(`${fn}: a failed consensus changed nothing (attempt ${attempt})`, before === after,
        'state differs after an UNDETERMINED transaction');
    }
    out.attempts = attempts;
    return out;
  }

  /** Time-dependent calls: retry a few times if the chain clock is a little behind ours. */
  async function timed(name, fn, mid, stillOpen) {
    let out;
    for (let i = 0; i < 4; i += 1) {
      out = await send(name, fn, [BigInt(mid)], { label: `${name}.${fn}${i ? ` (retry ${i})` : ''}` });
      const text = out.errorText ?? '';
      // a "window still open" revert (or a revert whose text the receipt does not expose) means our clock ran ahead
      if (out.ok || out.kind !== 'EXEC_ERROR' || !(text === '' || text.includes(stillOpen))) return out;
      await chain.sleep(30);
    }
    return out;
  }

  const expectRevert = async (name, fn, args, match, { value = 0n } = {}) => {
    // Measure what THIS reverted transaction leaves in the contract: Studionet may keep the value of a
    // failed call. It belongs to whoever sent it, so the whole-run conservation check charges it to
    // that sender (blaming one fixed account moved the difference between two accounts).
    const held0 = value > 0n ? await chain.balance(address) : 0n;
    const out = await send(name, fn, args, { value, label: `${name}.${fn} (must revert)` });
    const reverted = !out.ok && (out.kind === 'EXEC_ERROR' || out.kind === 'SUBMIT_ERROR');
    report.check(`${fn} by ${name} reverts`, reverted, `${out.kind} ${out.errorText ?? ''}`);
    if (reverted && out.errorText) report.check(`  revert reason mentions \"${match}\"`, out.errorText.includes(match), out.errorText, { soft: true });
    if (value > 0n) {
      const kept = (await chain.balance(address)) - held0;
      if (kept > 0n) {
        orphan += kept;
        spent[name] += kept;
        report.note(`Studionet kept ${kept} wei of the reverted ${name}.${fn}; charged to ${name} in the final conservation check`);
      }
    }
    return out;
  };

  const expectOk = (out, label) => report.check(label, out.ok, `${out.kind} ${out.errorText ?? ''}`);

  async function claimsTotal() {
    let total = 0n;
    for (const name of NAMES) total += await claimable(name);
    return total;
  }

  async function ledgerCheck(label, { settled = false, hardSettled = false } = {}) {
    const read = async () => {
      const ledger = await getLedger();
      return { ledger, chainBalance: await chain.balance(address) };
    };
    let state = await read();
    const books = (l) => BigInt(l.treasury) + BigInt(l.escrow) + BigInt(l.claimable_total);
    if (settled) {
      const wait = (hardSettled ? SETTLE_MINUTES : PAYOUT_WAIT_MINUTES) * 60;
      state = await eventually(read, (s) => BigInt(s.ledger.balance) - orphan === books(s.ledger), { timeout: SIM ? 5 : wait, step: 15 });
    }
    const { ledger, chainBalance } = state;
    report.check(`${label}: contract is solvent (balance >= books)`, BigInt(ledger.balance) - orphan >= books(ledger),
      `balance=${ledger.balance} books=${books(ledger)}`);
    report.check(`${label}: ledger balance equals the chain balance`, BigInt(ledger.balance) === chainBalance,
      `ledger=${ledger.balance} chain=${chainBalance}`);
    report.check(`${label}: pull-payment total equals the sum of member balances`,
      BigInt(ledger.claimable_total) === (await claimsTotal()), `total=${ledger.claimable_total}`);
    if (settled) {
      report.check(`${label}: books fully settled (balance == treasury + escrow + claimable)`,
        BigInt(ledger.balance) - orphan === books(ledger), `balance=${ledger.balance} books=${books(ledger)} (emitted transfers execute at finalization)`,
        { soft: !hardSettled });
    }
  }

  /** HARD: whatever consensus stored must be internally consistent. */
  function verifyClassified(m, label) {
    const tierOf = Object.fromEntries(m.articles.map((a) => [a.id, a.tier]));
    const target = m.kind === 'AMEND' ? m.detail.article_id : null;
    const others = m.articles.map((a) => a.id).filter((id) => id !== target).sort();
    const keysSeen = Object.keys(m.touches ?? {}).sort();
    report.check(`${label}: stored touches cover exactly the other articles`, JSON.stringify(keysSeen) === JSON.stringify(others), JSON.stringify(keysSeen));
    report.check(`${label}: every stored touch is a real boolean`, Object.values(m.touches ?? {}).every((v) => typeof v === 'boolean'));
    const touched = Object.entries(m.touches ?? {}).filter(([, v]) => v).map(([k]) => k).sort();
    const expected = max([m.floor_tier, ...touched.map((id) => tierOf[id])]);
    report.check(`${label}: tier = max(floor, touched tiers) = ${expected}`, m.tier === expected, `stored tier ${m.tier}`);
    report.check(`${label}: reason is stored as free text`, typeof m.reason === 'string' && m.reason.length > 0);
    return { touched, tier: m.tier };
  }

  async function voteAll(mid, ballots) {
    const results = await Promise.all(ballots.map(([name, support]) =>
      send(name, 'vote', [BigInt(mid), support], { label: `${name}.vote(${support ? 'yes' : 'no'})` })));
    results.forEach((out, i) => expectOk(out, `${ballots[i][0]} vote accepted`));
  }

  async function waitFor(ts, why) {
    report.note(`waiting for chain time ${ts} (${why})`);
    await chain.waitUntil(ts, (left) => { if (!SIM) process.stdout.write(`\r  … ${left}s left   `); });
    if (!SIM) process.stdout.write('\r' + ' '.repeat(40) + '\r');
  }

  async function payoutCheck(name, expected, label) {
    const before = await chain.balance(A(name));
    const owed = await claimable(name);
    report.check(`${label}: ledger owes exactly ${fmt(expected)}`, owed === expected, String(owed));
    const out = await send(name, 'withdraw', [], { label: `${name}.withdraw` });
    expectOk(out, `${label}: withdraw accepted`);
    if (!out.ok) return;
    received[name] += owed;
    report.check(`${label}: ledger zeroed immediately`, (await claimable(name)) === 0n);
    // Emitted transfers execute at FINALIZATION, so the balance lags the accepted transaction.
    const fin = await chain.waitFinalized(out, { maxWaitSeconds: (deliveryBroken ? 1 : PAYOUT_WAIT_MINUTES) * 60 });
    report.check(`${label}: withdraw transaction finalized`, fin.finalized === true, fin.finalizeError ?? fin.status, { soft: true });
    // Once finalized, the credit has to be visible within PAYOUT_CREDIT_SECONDS (a few polls, not half an hour).
    const credit = deliveryBroken ? 15 : PAYOUT_CREDIT_SECONDS;
    const after = await eventually(() => chain.balance(A(name)), (b) => b - before >= expected, { timeout: SIM ? 5 : credit, step: 10 });
    const delta = after - before;
    if (fin.finalized === true && delta === 0n && !deliveryBroken) {
      deliveryBroken = true;
      report.note(`${label}: the withdraw FINALIZED but the recipient was not credited. The contract paid with an EVM external message; if this repeats, the network is not delivering contract->account transfers and the remaining waits are shortened`);
    }
    report.check(`${label}: payout arrived (${fmt(expected)})`, delta === expected, `delta=${delta} expected=${expected}; the final reconciliation re-checks every balance`, { soft: true });
  }

  /** File -> classify (strict) -> vote -> close -> challenge (inclusive) -> finalize, outcome-aware. */
  async function challengeScenario({ tag, proposer, classifier, challenger, finalizer, id, text, ballots, expectRaised, why }) {
    expectOk(await send(proposer, 'file_amendment', [id, text, 1n], { value: BOND }), `${proposer} files "${id}"`);
    const mid = (await getAsm()).motion_count;
    expectOk(await aiTx(classifier, 'classify', mid), `${classifier} classifies (STRICT reading)`);
    let m = await getMotion(mid);
    const initial = verifyClassified(m, `${tag} initial`);
    report.note(`AI (strict) touched [${initial.touched.join(', ')}] -> tier ${initial.tier}`);
    await voteAll(mid, ballots);
    expectOk(await send(classifier, 'close_vote', [BigInt(mid)]), 'close_vote');
    m = await getMotion(mid);
    const yesVotes = ballots.filter(([, v]) => v).length;
    if (m.status !== 'CONTESTABLE') {
      report.note(`${tag}: the strict reading already required tier ${m.tier}; the motion ended ${m.status} and the challenge path is not exercised here`);
      report.check(`${tag}: motion ended consistently with its tier`, m.status === (yesVotes >= (await quote(m.tier)) ? 'ENACTED' : 'REJECTED'), m.status);
      return;
    }
    const before = { proposer: await claimable(proposer), challenger: await claimable(challenger), treasury: await treasury(), initial: m };
    expectOk(await aiTx(challenger, 'challenge', mid, { value: BOND }), `${challenger} challenges (INCLUSIVE reading, bond attached)`);
    const mc = await getMotion(mid);
    report.check(`${tag}: exactly one challenge is recorded, by the challenger`, !!mc.challenge && mc.challenge.by === A(challenger));
    verifyClassified(mc, `${tag} after challenge`);
    const raised = mc.challenge.raised;
    const touchedNow = Object.entries(mc.challenge.touches).filter(([, v]) => v).map(([k]) => k);
    report.note(`AI (inclusive) touched [${touchedNow.join(', ')}]: tier ${before.initial.tier} => ${mc.challenge.tier_after}; challenge ${raised ? 'RAISED the tier' : 'was UPHELD (tier unchanged)'}`);
    report.check(`AI expectation: ${why}`, raised === expectRaised, `raised=${raised}`, { soft: true });
    report.check(`${tag} ratchet: no article that was touched before became untouched`, Object.entries(before.initial.touches).every(([k, v]) => !v || mc.touches[k] === true));
    report.check(`${tag} ratchet: the tier never went down`, mc.tier >= before.initial.tier && mc.challenge.tier_after === mc.tier);
    report.check(`${tag}: raised flag equals (tier after > tier before)`, raised === (mc.challenge.tier_after > mc.challenge.tier_before));
    const half = BOND / 2n;
    const dProp = (await claimable(proposer)) - before.proposer;
    const dChal = (await claimable(challenger)) - before.challenger;
    const dTreasury = (await treasury()) - before.treasury;
    if (raised) {
      report.check(`${tag} raised: challenger recovers own bond plus half of the proposer's bond`, dChal === BOND + half, String(dChal));
      report.check(`${tag} raised: the commons is untouched`, dTreasury === 0n, String(dTreasury));
      report.check(`${tag} raised: half the proposer bond stays in escrow`, BigInt((await getLedger()).escrow) === BOND - half);
    } else {
      report.check(`${tag} upheld: the proposer is compensated with half the challenger bond`, dProp === half, String(dProp));
      report.check(`${tag} upheld: the other half goes to the commons`, dTreasury === BOND - half, String(dTreasury));
      report.check(`${tag} upheld: the challenger is not refunded`, dChal === 0n, String(dChal));
    }
    await ledgerCheck(`${tag} after challenge`);
    expectOk(await send(finalizer, 'finalize', [BigInt(mid)]), 'finalize right after the challenge (no waiting)');
    const mf = await getMotion(mid);
    const needF = await quote(mf.tier);
    const expectedStatus = mf.yes >= needF ? 'ENACTED' : 'REJECTED';
    report.check(`${tag}: ${mf.yes} yes votes vs ${needF} needed at tier ${mf.tier}: motion is ${expectedStatus}`, mf.status === expectedStatus, mf.status);
    const finalProp = (await claimable(proposer)) - before.proposer;
    report.check(`${tag}: proposer bond routing after settlement`, finalProp === (raised ? BOND - half : half + BOND), String(finalProp));
    report.note(`${tag} challenge game: ${raised ? 'tier raised' : 'upheld'}, motion ${mf.status}`);
  }

  // ------------------------------------------------------------------------------------- //
  try {
    report.section('Setup: accounts, funding, deployment');
    const funding = await ensureFunded(chain, keys, { minWei: MIN_BALANCE, fundWei: FUND_AMOUNT, waitSeconds: FUND_WAIT_SECONDS,
      log: (line) => { console.log(line); } });
    for (const row of funding) {
      startBalance[row.name] = row.balance;
      report.check(`${row.name} ${row.address} holds ${fmt(row.balance)} (${row.how})`, row.ok,
        `send at least ${fmt(MIN_BALANCE)} from the Studionet faucet (sim_fundAccount is often unavailable) and re-run, or raise --fund-wait-seconds`);
    }
    if (report.checks.some((c) => c.status === 'FAIL')) throw new Error('accounts are not funded; see above');

    const t0 = Date.now();
    const dep = await chain.deploy({ from: keys.F0, code: source, args: [
      'Ratchet E2E Assembly', FOUNDERS.map(A), JSON.stringify(CHARTER), BOND, BigInt(VOTE_MIN), BigInt(CHALLENGE_MIN)] });
    report.tx({ label: 'F0.deploy', ok: dep.ok, kind: dep.kind, hash: dep.hash, attempt: 1, seconds: Math.round((Date.now() - t0) / 1000) });
    expectOk(dep, 'deployment accepted');
    address = dep.address;
    report.check('deployed contract address found in the receipt', !!address, JSON.stringify(dep.receipt ?? {}).slice(0, 300));
    if (!dep.ok || !address) throw new Error('deployment failed');
    report.meta.address = address;
    report.note(`contract ${address}`);

    const deployed = await chain.deployedCode(address).catch((e) => `unavailable: ${e.message}`);
    report.check('deployed source is byte-identical to contracts/Ratchet.py', deployed === source,
      `sha256 deployed=${sha256(String(deployed)).slice(0, 16)} repo=${sha256(source).slice(0, 16)}`);

    // -------------------------------------------------------------------------------- //
    report.section('S0  Baseline reads');
    const asm0 = await getAsm();
    report.check('name, bond and windows were stored', asm0.name === 'Ratchet E2E Assembly' && asm0.bond === String(BOND)
      && asm0.vote_minutes === VOTE_MIN && asm0.challenge_minutes === CHALLENGE_MIN, JSON.stringify(asm0).slice(0, 200));
    report.check('roster equals the five founders', JSON.stringify(asm0.members) === JSON.stringify(FOUNDERS.map(A).sort()));
    report.check('four articles, no motions, floor free', asm0.article_count === 4 && asm0.motion_count === 0 && asm0.floor_motion === 0);
    const charter0 = await rj('get_charter');
    report.check('charter tiers are 1,4,3,2 for A1..A4', JSON.stringify(charter0.articles.map((a) => a.tier)) === '[1,4,3,2]');
    const ladder = [await quote(1), await quote(2), await quote(3), await quote(4)];
    report.check('threshold ladder for 5 members is 3,4,4,5', JSON.stringify(ladder) === '[3,4,4,5]', JSON.stringify(ladder));
    await ledgerCheck('baseline');

    // -------------------------------------------------------------------------------- //
    report.section('S1  Guards (each of these transactions must revert and move no money)');
    await expectRevert('O', 'file_amendment', ['NEWS', 'A news article.', 1n], 'members only', { value: BOND });
    await expectRevert('F1', 'file_amendment', ['NEWS', 'A news article.', 1n], 'attach exactly the bond', { value: BOND + 1n });
    await expectRevert('F1', 'file_amendment', ['bad id', 'A news article.', 1n], 'article id must be', { value: BOND });
    await expectRevert('F2', 'classify', [99n], 'motion not found');
    const asm1 = await getAsm();
    report.check('no motion was created by the failed attempts', asm1.motion_count === 0);
    const bal1 = await chain.balance(address);
    report.check('failed transactions did not leave value in the contract', bal1 === 0n, `contract holds ${bal1} wei`, { soft: true });
    report.check('every wei left by failed transactions was attributed to its sender', bal1 === orphan, `contract holds ${bal1} wei, attributed ${orphan}`);

    // -------------------------------------------------------------------------------- //
    report.section('S2  Treasury donation and bond withdrawal');
    expectOk(await send('F2', 'donate', [], { value: DONATION }), 'donation accepted');
    report.check('treasury holds the donation', (await treasury()) === DONATION);
    expectOk(await send('F1', 'file_amendment', ['NEWS', 'The assembly will think about a news page.', 1n], { value: BOND }), 'F1 files a motion');
    let m = await getMotion(1);
    report.check('motion 1 is FILED with a frozen five-member roster and four-article snapshot',
      m.status === 'FILED' && m.roster.length === 5 && m.articles.length === 4 && m.digest.length === 64);
    expectOk(await send('F1', 'withdraw_motion', [1n]), 'F1 withdraws it before classification');
    m = await getMotion(1);
    report.check('motion 1 is WITHDRAWN and its bond is claimable', m.status === 'WITHDRAWN' && (await claimable('F1')) === BOND);
    report.check('the floor is free again', (await getAsm()).floor_motion === 0);
    await ledgerCheck('after S2');

    // -------------------------------------------------------------------------------- //
    report.section('S3  Happy path: adopt an article (AI strict reading, unanimous vote)');
    expectOk(await send('F1', 'file_amendment', ['ARCHIVE', 'The assembly keeps a public archive of its minutes.', 1n], { value: BOND }), 'F1 files the adoption');
    const mid3 = (await getAsm()).motion_count;
    if (CHAOS && SIM) { await chain.chaos('classify', 1); report.note('chaos: the first classify attempt will fail to reach consensus'); }
    const out3 = await aiTx('F2', 'classify', mid3);
    expectOk(out3, 'F2 classifies (validators must reproduce the booleans exactly)');
    if (CHAOS && SIM) {
      report.check('chaos: dissenting validators prevented the first attempt from committing', out3.attempts[0] === 'UNDETERMINED', JSON.stringify(out3.attempts));
      report.check('chaos: the retry after the failed consensus succeeded', out3.attempts[1] === 'OK', JSON.stringify(out3.attempts));
    }
    m = await getMotion(mid3);
    report.check('motion is VOTING', m.status === 'VOTING', m.status);
    report.check('vote window is exactly the configured two minutes', m.vote_deadline - m.classified_at === VOTE_SECONDS);
    const c3 = verifyClassified(m, 'S3');
    report.note(`AI (strict) touched [${c3.touched.join(', ')}] -> tier ${c3.tier}`);
    report.check('AI expectation: an unrelated archive article touches nothing (tier 1)', c3.touched.length === 0 && c3.tier === 1, `touched=${c3.touched} tier=${c3.tier}`, { soft: true });
    await voteAll(mid3, FOUNDERS.map((n) => [n, true]));
    expectOk(await send('F3', 'close_vote', [BigInt(mid3)]), 'close_vote (everyone voted)');
    m = await getMotion(mid3);
    report.check('motion is CONTESTABLE with a two-minute challenge window', m.status === 'CONTESTABLE' && m.contest_deadline - m.closed_at === CHALLENGE_MIN * 60, `${m.status}`);
    await waitFor(m.contest_deadline + 20, 'challenge window');
    expectOk(await timed('F4', 'finalize', mid3, 'still open'), 'finalize after the window');
    m = await getMotion(mid3);
    report.check('motion is ENACTED', m.status === 'ENACTED', m.status);
    const charter3 = await rj('get_charter');
    report.check('ARCHIVE is in the charter and the version advanced', charter3.articles.some((a) => a.id === 'ARCHIVE' && a.tier === 1) && charter3.version === 2);
    report.check('both of F1\'s bonds are claimable (2 x bond)', (await claimable('F1')) === 2n * BOND, String(await claimable('F1')));
    await ledgerCheck('after S3');
    await payoutCheck('F1', 2n * BOND, 'F1 payout');
    await ledgerCheck('after F1 payout', { settled: true });

    // -------------------------------------------------------------------------------- //
    report.section('S4  Threshold boundary with an AI-derived tier');
    expectOk(await send('F2', 'file_amendment', ['A1', 'Meetings are held on the first Sunday of every month. Article A3 is suspended during elections.', 1n], { value: BOND }), 'F2 files a replacement of A1 that names A3');
    const mid4 = (await getAsm()).motion_count;
    expectOk(await aiTx('F3', 'classify', mid4), 'F3 classifies');
    m = await getMotion(mid4);
    const c4 = verifyClassified(m, 'S4');
    report.note(`AI (strict) touched [${c4.touched.join(', ')}] -> tier ${c4.tier}`);
    report.check('AI expectation: the strict reading flags the explicitly suspended A3 (tier 3)', c4.touched.includes('A3') && c4.tier === 3, `touched=${c4.touched} tier=${c4.tier}`, { soft: true });
    const need4 = await quote(c4.tier);
    report.check(`stored votes_needed equals the on-chain threshold for tier ${c4.tier} (${need4})`, m.votes_needed === need4);
    const yes4 = need4 - 1;
    await voteAll(mid4, FOUNDERS.map((n, i) => [n, i < yes4]));
    expectOk(await send('F0', 'close_vote', [BigInt(mid4)]), 'close_vote');
    m = await getMotion(mid4);
    report.check(`${yes4} yes votes are one short of ${need4}: the motion is REJECTED`, m.status === 'REJECTED' && m.yes === yes4, `${m.status} yes=${m.yes}`);
    report.check('a rejected motion returns the proposer\'s bond', (await claimable('F2')) === BOND);
    report.check('the charter is unchanged', (await getAsm()).article_count === 5 && (await rj('get_charter')).version === 2);
    await ledgerCheck('after S4');

    // -------------------------------------------------------------------------------- //
    report.section('S5  The ratchet: challenging a strict reading (stealth motion)');
    await challengeScenario({
      tag: 'S5', proposer: 'F1', classifier: 'F2', challenger: 'F3', finalizer: 'F4',
      id: 'TREASURER', text: 'The treasurer may spend any amount of the treasury on any purpose chosen by the treasurer alone.',
      ballots: [['F0', true], ['F1', true], ['F2', true], ['F3', false], ['F4', false]],
      expectRaised: true, why: 'the inclusive reading should see that unrestricted spending bypasses A3' });
    await ledgerCheck('after S5');

    report.section('S5b  A challenge that fails: the challenger forfeits half the bond');
    await challengeScenario({
      tag: 'S5b', proposer: 'F2', classifier: 'F3', challenger: 'F4', finalizer: 'F0',
      id: 'ALBUM', text: 'The assembly keeps a shared photo album of its events.',
      ballots: [['F0', true], ['F1', true], ['F2', true], ['F3', true], ['F4', false]],
      expectRaised: false, why: 'an unrelated photo album touches no article under either reading' });
    await ledgerCheck('after S5b');

    // -------------------------------------------------------------------------------- //
    report.section('S6  Treasury grant (size raises the floor tier) and payout');
    const treasuryBefore = await treasury();
    expectOk(await send('F3', 'file_grant', [A('G'), GRANT, 'Pay the hall rental for the spring assembly.'], { value: BOND }), 'F3 files a grant to G');
    const mid6 = (await getAsm()).motion_count;
    m = await getMotion(mid6);
    report.check('a grant of at most 10% of the treasury has floor tier 1', m.floor_tier === 1, `floor ${m.floor_tier}`);
    expectOk(await aiTx('F4', 'classify', mid6), 'F4 classifies');
    m = await getMotion(mid6);
    const c6 = verifyClassified(m, 'S6');
    report.note(`AI (strict) touched [${c6.touched.join(', ')}] -> tier ${c6.tier}`);
    report.check('AI expectation: paying a hall rental touches nothing', c6.touched.length === 0, `touched=${c6.touched}`, { soft: true });
    await voteAll(mid6, FOUNDERS.map((n) => [n, true]));
    expectOk(await send('F0', 'close_vote', [BigInt(mid6)]), 'close_vote');
    m = await getMotion(mid6);
    await waitFor(m.contest_deadline + 20, 'challenge window');
    expectOk(await timed('F1', 'finalize', mid6, 'still open'), 'finalize');
    m = await getMotion(mid6);
    report.check('grant motion is ENACTED', m.status === 'ENACTED', m.status);
    report.check('treasury paid out exactly the grant', treasuryBefore - (await treasury()) === GRANT);
    report.check('G is owed exactly the grant', (await claimable('G')) === GRANT);
    await ledgerCheck('after grant');
    await payoutCheck('G', GRANT, 'G payout');
    await ledgerCheck('after G payout', { settled: true });

    // -------------------------------------------------------------------------------- //
    report.section('S7  Admission: the roster grows, the new member can act');
    expectOk(await send('F0', 'file_admission', [A('O'), 'A long-time volunteer who ran every meeting this year.'], { value: BOND }), 'F0 proposes to admit O');
    const mid7 = (await getAsm()).motion_count;
    m = await getMotion(mid7);
    report.check('admission has floor tier 2', m.floor_tier === 2);
    expectOk(await aiTx('F1', 'classify', mid7), 'F1 classifies');
    m = await getMotion(mid7);
    const c7 = verifyClassified(m, 'S7');
    report.note(`AI (strict) touched [${c7.touched.join(', ')}] -> tier ${c7.tier}`);
    await voteAll(mid7, FOUNDERS.map((n) => [n, true]));
    expectOk(await send('F2', 'close_vote', [BigInt(mid7)]), 'close_vote');
    m = await getMotion(mid7);
    await waitFor(m.contest_deadline + 20, 'challenge window');
    expectOk(await timed('F3', 'finalize', mid7, 'still open'), 'finalize');
    m = await getMotion(mid7);
    report.check('admission is ENACTED', m.status === 'ENACTED', m.status);
    const asm7 = await getAsm();
    report.check('the roster now has six members including O', asm7.member_count === 6 && asm7.members.includes(A('O')));
    expectOk(await send('O', 'file_amendment', ['WELCOME', 'New members are welcomed with a short handbook.', 1n], { value: BOND }), 'O, now a member, can file a motion');
    const midW = (await getAsm()).motion_count;
    expectOk(await send('O', 'withdraw_motion', [BigInt(midW)]), 'O withdraws it');
    await ledgerCheck('after S7');

    // -------------------------------------------------------------------------------- //
    report.section('S8  Lapse: a motion nobody votes on forfeits its bond to the commons');
    const treasury8 = await treasury();
    expectOk(await send('F2', 'file_amendment', ['LAPSE', 'A test article that nobody will vote on.', 1n], { value: BOND }), 'F2 files');
    const mid8 = (await getAsm()).motion_count;
    expectOk(await aiTx('F3', 'classify', mid8), 'F3 classifies');
    m = await getMotion(mid8);
    verifyClassified(m, 'S8');
    await waitFor(m.vote_deadline + 20, 'voting window');
    expectOk(await timed('F4', 'close_vote', mid8, 'still open'), 'close_vote after the deadline');
    m = await getMotion(mid8);
    report.check('motion LAPSED', m.status === 'LAPSED', m.status);
    report.check('its bond went to the treasury', (await treasury()) - treasury8 === BOND);
    report.check('the floor is free again', (await getAsm()).floor_motion === 0);
    await ledgerCheck('after S8');

    if (FULL) {
      report.section('S9  Expiry of an unclassified motion');
      expectOk(await send('F4', 'file_amendment', ['STALE', 'A motion that nobody classifies.', 1n], { value: BOND }), 'F4 files');
      const mid9 = (await getAsm()).motion_count;
      m = await getMotion(mid9);
      await waitFor(m.stale_at + 20, 'stale window');
      expectOk(await timed('G', 'expire_motion', mid9, 'not stale yet'), 'a non-member expires it');
      m = await getMotion(mid9);
      report.check('motion EXPIRED and its bond is claimable', m.status === 'EXPIRED' && (await claimable('F4')) >= BOND);
    }

    // -------------------------------------------------------------------------------- //
    report.section('Final reconciliation');
    const asm = await getAsm();
    const list = JSON.parse(await chain.read(address, 'list_motions', [0n, 20n]));
    report.check('every motion is in a final state', list.motions.every((x) => ALL_FINAL.includes(x.status)), JSON.stringify(list.motions.map((x) => x.status)));
    report.check('the floor is free and escrow is empty', asm.floor_motion === 0 && BigInt((await getLedger()).escrow) === 0n);
    const motions = [];
    for (let id = 1; id <= asm.motion_count; id += 1) motions.push(await getMotion(id));
    const countOf = (s) => motions.filter((x) => x.status === s).length;
    report.check('stats.filed equals the number of motions', asm.stats.filed === motions.length);
    report.check('stats.enacted / rejected / lapsed / void match the records', asm.stats.enacted === countOf('ENACTED') && asm.stats.rejected === countOf('REJECTED') && asm.stats.lapsed === countOf('LAPSED') && asm.stats.void === countOf('VOID'));
    const raisedN = motions.filter((x) => x.challenge && x.challenge.raised).length;
    const upheldN = motions.filter((x) => x.challenge && !x.challenge.raised).length;
    report.check('challenge counters match the records', asm.stats.challenges_raised === raisedN && asm.stats.challenges_upheld === upheldN);
    for (const x of motions.filter((y) => y.touches !== null)) verifyClassified(x, `motion ${x.id} (${x.kind}/${x.status})`);
    report.check('no final motion still holds a bond', motions.every((x) => x.bond_left === 0));
    const decided = motions.filter((x) => ['ENACTED', 'REJECTED'].includes(x.status));
    report.check('every ENACTED/REJECTED motion obeys its threshold exactly (yes >= votes_needed <=> ENACTED)',
      decided.every((x) => (x.status === 'ENACTED') === (x.yes >= x.votes_needed)),
      JSON.stringify(decided.map((x) => [x.id, x.status, x.yes, x.votes_needed])));
    report.check('every LAPSED motion had less than half the roster voting',
      motions.filter((x) => x.status === 'LAPSED').every((x) => (x.yes + x.no) * 2 < x.roster.length));

    const outs = [];
    for (const name of NAMES) {
      if ((await claimable(name)) > 0n) outs.push(name);
    }
    const sweepStart = Date.now();
    let lastOut = null;
    for (const name of outs) {
      const owed = await claimable(name);
      const out = await send(name, 'withdraw', [], { label: `${name}.withdraw (cleanup)` });
      expectOk(out, `${name} withdraws ${fmt(owed)}`);
      if (out.ok) { received[name] += owed; lastOut = out; }
    }
    await ledgerCheck('final (ledger side)');
    if (lastOut) await chain.waitFinalized(lastOut, { maxWaitSeconds: (deliveryBroken ? 1 : SETTLE_MINUTES) * 60 });

    // Whole-run conservation: every wei an account attached or pulled out must be accounted for.
    report.section('Whole-run conservation of funds (waits for delayed payouts)');
    const expectedBalance = (name) => startBalance[name] - spent[name] + received[name];
    const settled = async () => {
      const rows = [];
      for (const name of NAMES) rows.push([name, await chain.balance(A(name)), expectedBalance(name)]);
      return rows;
    };
    const rows = await eventually(settled, (r) => r.every(([, actual, expected]) => actual >= expected - FEE_ALLOWANCE), { timeout: deliveryBroken ? 30 : SETTLE_MINUTES * 60, step: 20 });
    for (const [name, actual, expected] of rows) {
      const diff = actual - expected;
      if (diff === 0n) report.check(`${name}: balance equals start - attached + withdrawn (exact)`, true);
      else if (diff < 0n && -diff <= FEE_ALLOWANCE) report.check(`${name}: balance is ${-diff} wei below expectation (network fees?)`, false, `diff=${diff}`, { soft: true });
      else report.check(`${name}: balance equals start - attached + withdrawn`, false, `actual=${actual} expected=${expected} diff=${diff}${diff < 0n ? ' (a payout may still be in flight: increase --settle-minutes)' : ' (MORE than expected: money from nowhere)'}`);
    }
    const finalLedger = await getLedger();
    await ledgerCheck('final', { settled: true, hardSettled: true });
    report.check('after every payout the contract holds exactly the commons treasury', BigInt(finalLedger.balance) - orphan === BigInt(finalLedger.treasury) && BigInt(finalLedger.claimable_total) === 0n,
      `balance=${finalLedger.balance} treasury=${finalLedger.treasury} claimable=${finalLedger.claimable_total}`);
    report.note(`delayed-payout sweep took ${Math.round((Date.now() - sweepStart) / 1000)} s`);
  } catch (error) {
    report.check('run completed without a fatal error', false, error.stack ?? String(error));
  } finally {
    const stem = `e2e-${SIM ? 'sim' : 'live'}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const file = report.write(path.join(ROOT, 'reports'), stem);
    const c = report.counts();
    console.log(`\n${c.passed} passed, ${c.failed} failed, ${c.warnings} warnings (${c.total} checks, ${report.txs.length} transactions)`);
    if (address) console.log(`contract: ${address}`);
    console.log(`report: ${path.relative(ROOT, file)}`);
    if (sim) sim.stop();
    process.exitCode = c.failed > 0 ? 1 : 0;
  }
}

main();
