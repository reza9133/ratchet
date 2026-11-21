// Throw-away test accounts.  Live runs persist them in .e2e/keys.json (git-ignored) so the
// same funded addresses are reused; dry runs use ephemeral keys.
import fs from 'node:fs';
import path from 'node:path';
import { createAccount, generatePrivateKey } from 'genlayer-js';

function build(names, source) {
  const out = {};
  for (const name of names) {
    const privateKey = source[name] ?? generatePrivateKey();
    out[name] = { name, privateKey, address: createAccount(privateKey).address.toLowerCase() };
  }
  return out;
}

export function ephemeralKeys(names) {
  return build(names, {});
}

// Roles of a live run (five founders, an outsider who is admitted later, a grant recipient) and the
// least GEN each must hold.  Peak spend is about 0.045 GEN (F2: a 0.03 donation plus three bonds);
// bonds come back to the account at the end of the run.  Override with E2E_MIN_GEN.
export const ROLE_NAMES = ['F0', 'F1', 'F2', 'F3', 'F4', 'O', 'G'];
export const MIN_GEN = Number(process.env.E2E_MIN_GEN || 0.1);
export const MIN_BALANCE = BigInt(Math.round(MIN_GEN * 1e9)) * 1_000_000_000n;
export const FUND_AMOUNT = 1_000_000_000_000_000_000n;   // asked from sim_fundAccount when it exists (1 GEN)

/** E2E_KEYS="0xkey1,0xkey2,..." (in role order) reuses accounts that are already funded. */
export function givenKeys(names, env = process.env.E2E_KEYS || '') {
  const list = env.split(',').map((k) => k.trim()).filter(Boolean);
  if (!list.length) return {};
  if (list.length < names.length) throw new Error(`E2E_KEYS holds ${list.length} keys but a run needs ${names.length} (${names.join(', ')}).`);
  if (list.some((k) => !/^0x[0-9a-fA-F]{64}$/.test(k))) throw new Error('E2E_KEYS must hold 0x-prefixed 32-byte private keys.');
  return Object.fromEntries(names.map((n, i) => [n, list[i]]));
}

export function loadKeys(file, names, given = givenKeys(names)) {
  let stored = {};
  if (fs.existsSync(file)) stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = build(names, Object.keys(given).length ? given : stored);
  if (Object.keys(given).length) return keys;     // explicit keys are never written to disk
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const toStore = Object.fromEntries(Object.values(keys).map((k) => [k.name, k.privateKey]));
  fs.writeFileSync(file, JSON.stringify(toStore, null, 2), { mode: 0o600 });
  return keys;
}
