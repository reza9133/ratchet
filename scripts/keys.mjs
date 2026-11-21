#!/usr/bin/env node
// Prints (and creates on first use) the throw-away Studionet accounts used by the live e2e run.
//   npm run keys                     show addresses and balances
//   npm run keys -- --fund           also try Studionet's sim_fundAccount for accounts below the minimum
//   npm run keys -- --fund --wait 600  ... and wait up to 600 s for balances sent from the faucet
// E2E_KEYS="0x..,0x.."  (role order F0,F1,F2,F3,F4,O,G) uses accounts you already funded.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveChain } from './lib/chain.mjs';
import { ensureFunded } from './lib/funding.mjs';
import { FUND_AMOUNT, MIN_BALANCE, ROLE_NAMES, loadKeys } from './lib/keys.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keys = loadKeys(path.join(ROOT, '.e2e', 'keys.json'), ROLE_NAMES);
const chain = new LiveChain();
const fund = process.argv.includes('--fund');
const waitIdx = process.argv.indexOf('--wait');
const waitSeconds = waitIdx >= 0 ? Number(process.argv[waitIdx + 1]) || 0 : 0;
const gen = (wei) => `${Number(wei) / 1e18} GEN`;
console.log(`network: ${chain.rpc}\nkeys file: .e2e/keys.json (git-ignored, throw-away accounts)\n`);

let rows;
try {
  rows = fund
    ? await ensureFunded(chain, keys, { minWei: MIN_BALANCE, fundWei: FUND_AMOUNT, waitSeconds })
    : await Promise.all(ROLE_NAMES.map(async (name) => ({ name, address: keys[name].address, balance: await chain.balance(keys[name].address), how: '', ok: true })));
} catch (error) {
  console.error(`could not reach Studionet: ${String(error.message).slice(0, 160)}`);
  process.exit(1);
}
for (const r of rows) console.log(`${r.name.padEnd(3)} ${r.address}  ${gen(r.balance)}${fund ? `  (${r.how})` : ''}`);
const low = rows.filter((r) => r.balance < MIN_BALANCE);
if (low.length) {
  console.log(`\n${low.map((r) => r.name).join(', ')} hold less than ${gen(MIN_BALANCE)}. Studionet's sim_fundAccount is often unavailable:`);
  console.log('send GEN to those addresses from the faucet in GenLayer Studio, or re-run with  --fund --wait 600  to wait for it.');
} else {
  console.log(`\nAll accounts hold at least ${gen(MIN_BALANCE)}: ready for  bash run.sh --live-only`);
}
