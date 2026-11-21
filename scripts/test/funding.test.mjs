import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureFunded } from '../lib/funding.mjs';
import { givenKeys } from '../lib/keys.mjs';

const WEI = 10n ** 18n;
const accounts = { A: { name: 'A', address: '0xa' }, B: { name: 'B', address: '0xb' } };

test('funds an account with sim_fundAccount when the network offers it', async () => {
  const bal = { '0xa': 0n, '0xb': 5n * WEI };
  const chain = { balance: async (a) => bal[a], fund: async (a, w) => { bal[a] += w; } };
  const rows = await ensureFunded(chain, accounts, { minWei: WEI, fundWei: 2n * WEI });
  assert.deepEqual(rows.map((r) => [r.name, r.ok, r.how]), [['A', true, 'funded by sim_fundAccount'], ['B', true, 'already funded']]);
});

test('without sim_fundAccount it waits for the faucet instead of failing at once', async () => {
  const bal = { '0xa': 0n, '0xb': 0n };
  let polls = 0;
  const chain = { balance: async (a) => { if (a === '0xa' && polls++ > 3) bal['0xa'] = 2n * WEI; return bal[a]; }, fund: async () => { throw new Error('Method not found'); } };
  const sleeps = [];
  const rows = await ensureFunded(chain, accounts, { minWei: WEI, waitSeconds: 600, log: () => {}, sleep: async (ms) => { sleeps.push(ms); bal['0xb'] = 2n * WEI; } });
  assert.ok(rows.every((r) => r.ok), JSON.stringify(rows.map((r) => [r.name, r.ok])));
  assert.equal(rows.find((r) => r.name === 'A').how, 'funded from outside');
  assert.ok(sleeps.length >= 1);
});

test('with no wait it reports the shortfall and lets the caller decide', async () => {
  const chain = { balance: async () => 0n, fund: async () => { throw new Error('nope'); } };
  const rows = await ensureFunded(chain, accounts, { minWei: WEI, waitSeconds: 0 });
  assert.ok(rows.every((r) => !r.ok && r.how.startsWith('faucet call refused')));
});

test('E2E_KEYS needs one valid key per role', () => {
  const k = '0x' + '1'.repeat(64);
  assert.deepEqual(givenKeys(['X', 'Y'], ''), {});
  assert.deepEqual(givenKeys(['X', 'Y'], `${k},${k}`), { X: k, Y: k });
  assert.throws(() => givenKeys(['X', 'Y'], k), /needs 2/);
  assert.throws(() => givenKeys(['X'], 'nothex'), /32-byte/);
});
