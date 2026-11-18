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

export function loadKeys(file, names) {
  let stored = {};
  if (fs.existsSync(file)) stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = build(names, stored);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const toStore = Object.fromEntries(Object.values(keys).map((k) => [k.name, k.privateKey]));
  fs.writeFileSync(file, JSON.stringify(toStore, null, 2), { mode: 0o600 });
  return keys;
}
