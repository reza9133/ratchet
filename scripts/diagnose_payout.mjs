#!/usr/bin/env node
// Which delivery mode does this network actually honour for contract -> EOA value transfers?
//
//   npm run diagnose:payout            on Studionet (about 5-35 minutes, it waits for finalization)
//   node scripts/diagnose_payout.mjs --sim     dry run of this script on the local bridge
//
// It deploys tools/PayoutProbe.py, funds it, then emits the SAME small transfer three ways:
//   R1  funded account,   on="accepted"
//   R2  funded account,   on="finalized"
//   R3  never-seen address, on="accepted"
// and prints, every 20 s, the probe's balance and each recipient's balance until the numbers stop moving.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LiveChain, SimChain } from './lib/chain.mjs';
import { ephemeralKeys, loadKeys } from './lib/keys.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = process.argv.includes('--sim');
const CODE_PATH = path.join(ROOT, 'tools', 'PayoutProbe.py');
const AMOUNT = 1_000_000_000_000n;          // 0.000001 GEN per transfer
const FUND_PROBE = 10_000_000_000_000n;
const MAX_WAIT = SIM ? 5 : 35 * 60;

async function startSim() {
  const port = 8900 + Math.floor(Math.random() * 100);
  const venvPython = path.join(ROOT, '.venv', 'bin', 'python');
  const python = process.env.PYTHON || (fs.existsSync(venvPython) ? venvPython : 'python3');
  const child = spawn(python, [path.join(ROOT, 'scripts', 'sim_bridge.py'), '--port', String(port), '--contract', CODE_PATH],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (c) => { if (String(c).includes('listening')) resolve(); });
    child.on('exit', (code) => reject(new Error(`sim bridge exited early (${code})`)));
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => child.kill() };
}

const sim = SIM ? await startSim() : null;
const chain = SIM ? new SimChain({ url: sim.url }) : new LiveChain();
const names = ['P0', 'R1', 'R2'];
const keys = SIM ? ephemeralKeys(names) : loadKeys(path.join(ROOT, '.e2e', 'probe-keys.json'), names);
const never = '0x' + 'd1a9'.repeat(10);        // an address nobody ever funded or used
const code = fs.readFileSync(CODE_PATH, 'utf8');

try {
  for (const n of names) {
    if ((await chain.balance(keys[n].address)) < 100_000_000_000_000_000n) {
      try { await chain.fund(keys[n].address, 500_000_000_000_000_000n); } catch (e) { console.log(`funding ${n} failed: ${e.message}`); }
    }
  }
  console.log('deploying PayoutProbe ...');
  const dep = await chain.deploy({ from: keys.P0, code, args: [] });
  if (!dep.ok || !dep.address) throw new Error(`deploy failed: ${dep.kind} ${dep.errorText ?? ''}`);
  const probe = dep.address;
  console.log('probe contract', probe);
  const fund = await chain.write({ from: keys.P0, address: probe, fn: 'fund', args: [], value: FUND_PROBE });
  console.log('fund        ', fund.ok ? 'ok' : `${fund.kind} ${fund.errorText ?? ''}`);

  const plan = [
    ['R1 funded account, on=accepted ', keys.R1.address, 'accepted'],
    ['R2 funded account, on=finalized', keys.R2.address, 'finalized'],
    ['R3 never-seen addr, on=accepted', never, 'accepted'],
  ];
  const before = {};
  for (const [label, to] of plan) before[label] = await chain.balance(to);
  const outs = [];
  for (const [label, to, on] of plan) {
    const out = await chain.write({ from: keys.P0, address: probe, fn: 'pay', args: [to, AMOUNT, on] });
    console.log(`pay ${label}: ${out.ok ? 'accepted by consensus' : `${out.kind} ${out.errorText ?? ''}`}`);
    outs.push(out);
  }
  const finalizedFlags = [];
  for (const out of outs) {
    const fin = await chain.waitFinalized(out, { maxWaitSeconds: MAX_WAIT });
    finalizedFlags.push(fin.finalized === true);
  }
  console.log(`pay transactions finalized: ${finalizedFlags.join(', ')}`);

  const t0 = Date.now();
  let last = '';
  let stable = 0;
  const started = await chain.balance(probe);
  for (;;) {
    const row = [`probe ${await chain.balance(probe)}`];
    for (const [label, to] of plan) row.push(`${label.slice(0, 2)} +${(await chain.balance(to)) - before[label]}`);
    const line = row.join('  |  ');
    console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${line}`);
    stable = line === last ? stable + 1 : 0;
    last = line;
    if (stable >= 6 || (Date.now() - t0) / 1000 > MAX_WAIT) break;
    await chain.sleep(20);
  }

  console.log('\n=== verdict ===');
  const probeNow = await chain.balance(probe);
  console.log(`probe balance: ${started} -> ${probeNow} (total emitted: ${3n * AMOUNT})`);
  for (const [label, to, on] of plan) {
    const gained = (await chain.balance(to)) - before[label];
    console.log(`${label}: recipient gained ${gained} of ${AMOUNT} wei -> ${gained === AMOUNT ? 'CREDITED' : gained === 0n ? 'NOT credited' : 'partial'}`);
  }
  console.log('\nIf only on="accepted" is CREDITED, change the one emit_transfer line in contracts/Ratchet.py to on="accepted"');
  console.log('and tell me the numbers; if neither is credited, the network does not deliver contract->EOA transfers at all.');
} catch (error) {
  console.error('probe failed:', error.stack ?? error);
  process.exitCode = 1;
} finally {
  if (sim) sim.stop();
}
