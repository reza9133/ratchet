#!/usr/bin/env node
// Prints (and creates on first use) the throw-away Studionet accounts used by the live e2e run.
//   npm run keys            show addresses and balances
//   npm run keys -- --fund  also ask Studionet (sim_fundAccount) to top each one up to 1 GEN
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveChain } from './lib/chain.mjs';
import { loadKeys } from './lib/keys.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['F0', 'F1', 'F2', 'F3', 'F4', 'O', 'G'];
const keys = loadKeys(path.join(ROOT, '.e2e', 'keys.json'), NAMES);
const chain = new LiveChain();
const fund = process.argv.includes('--fund');
console.log(`network: ${chain.rpc}\nkeys file: .e2e/keys.json (git-ignored, throw-away accounts)\n`);
for (const name of NAMES) {
  let balance = '?';
  try {
    let wei = await chain.balance(keys[name].address);
    if (fund && wei < 200_000_000_000_000_000n) wei = await chain.fund(keys[name].address, 1_000_000_000_000_000_000n);
    balance = `${Number(wei) / 1e18} GEN`;
  } catch (error) {
    balance = `unavailable (${String(error.message).slice(0, 60)})`;
  }
  console.log(`${name.padEnd(3)} ${keys[name].address}  ${balance}`);
}
console.log('\nEach account needs about 0.2 GEN. If --fund fails, send GEN to these addresses from the Studionet faucet.');
