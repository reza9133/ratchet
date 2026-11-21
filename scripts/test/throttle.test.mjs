import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyResponse, createThrottle, isIdempotent, methodsOf, isTransientError, withTransientRetry } from '../lib/throttle.mjs';

const RPC = 'https://studio.example/api';
const body = (method) => ({ method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }) });
const reply = (status, text) => ({ status, ok: status < 400, clone() { return this; }, async text() { return text; } });
const json = (result) => reply(200, JSON.stringify({ jsonrpc: '2.0', id: 1, result }));

function harness(responses, opts = {}) {
  const calls = [];
  const sleeps = [];
  let t = 0;
  const fetchFn = async (url, init) => {
    calls.push({ url, method: methodsOf(init)[0] });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  const throttled = createThrottle({ fetchFn, rpcUrl: RPC, sleep: async (ms) => { sleeps.push(ms); t += ms; }, now: () => t, ...opts });
  return { throttled, calls, sleeps };
}

test('classifies every failure shape seen on Studionet', () => {
  assert.equal(classifyResponse(200, '{"error":{"message":"Rate limit exceeded"}}'), 'rate');
  assert.equal(classifyResponse(429, ''), 'rate');
  assert.equal(classifyResponse(200, '<!DOCTYPE html><html>bad gateway</html>'), 'transient');
  assert.equal(classifyResponse(502, 'Bad Gateway'), 'transient');
  assert.equal(classifyResponse(200, '{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"Internal error"}}'), 'transient');
  assert.equal(classifyResponse(200, '{"jsonrpc":"2.0","id":1,"result":"0x1"}'), null);
  assert.equal(classifyResponse(200, '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"execution reverted"}}'), null);
});

test('only reads are idempotent', () => {
  for (const m of ['gen_call', 'eth_getBalance', 'eth_estimateGas', 'eth_getTransactionByHash', 'eth_call', 'gen_getContractCode']) assert.equal(isIdempotent([m]), true, m);
  for (const m of ['eth_sendRawTransaction', 'sim_fundAccount', 'gen_sendTransaction']) assert.equal(isIdempotent([m]), false, m);
  assert.equal(isIdempotent([]), false);
});

test('calls are spaced under the per-minute limit', async () => {
  const { throttled, sleeps } = harness([json('0x1'), json('0x2'), json('0x3')], { perMinute: 24 });
  for (let i = 0; i < 3; i += 1) await throttled(RPC, body('eth_getBalance'));
  assert.deepEqual(sleeps, [2500, 2500]);
});

test('a rate-limited call is repeated, even a transaction submission', async () => {
  const { throttled, calls } = harness([reply(200, '{"error":{"message":"Rate limit exceeded"}}'), json('0xabc')]);
  const res = await throttled(RPC, body('eth_sendRawTransaction'));
  assert.equal(JSON.parse(await res.text()).result, '0xabc');
  assert.equal(calls.length, 2);
});

test('an HTML gateway page on a read is repeated and the run survives', async () => {
  const { throttled, calls, stats } = (() => { const h = harness([reply(200, '<!DOCTYPE html><html></html>'), reply(200, '{"error":{"code":-32603,"message":"Internal error"}}'), json('0x5')]); return { ...h, stats: h.throttled.stats }; })();
  const res = await throttled(RPC, body('gen_call'));
  assert.equal(JSON.parse(await res.text()).result, '0x5');
  assert.equal(calls.length, 3);
  assert.equal(stats.transient, 2);
});

test('an HTML page on a transaction submission is NOT repeated (it may have been accepted)', async () => {
  const { throttled, calls } = harness([reply(200, '<!DOCTYPE html><html></html>'), json('0xnever')]);
  const res = await throttled(RPC, body('eth_sendRawTransaction'));
  assert.ok((await res.text()).startsWith('<!DOCTYPE'));
  assert.equal(calls.length, 1);
});

test('gives up after the retry budget and hands the failure to the caller', async () => {
  const page = () => reply(200, '<!DOCTYPE html>');
  const { throttled, calls } = harness(Array.from({ length: 10 }, page), { maxTransientRetries: 3 });
  const res = await throttled(RPC, body('eth_getBalance'));
  assert.ok((await res.text()).startsWith('<!DOCTYPE'));
  assert.equal(calls.length, 4);
});

test('requests to other hosts bypass the throttle', async () => {
  const { throttled, sleeps, calls } = harness([json('x'), json('y')]);
  await throttled('https://example.org/a', body('eth_getBalance'));
  await throttled('https://example.org/b', body('eth_getBalance'));
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, []);
});

test('withTransientRetry repeats transient errors only', async () => {
  let n = 0;
  const ok = await withTransientRetry(async () => { n += 1; if (n < 3) throw new Error(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`); return 'done'; }, { sleep: async () => {} });
  assert.equal(ok, 'done');
  assert.equal(n, 3);
  let m = 0;
  await assert.rejects(withTransientRetry(async () => { m += 1; throw new Error('execution reverted: members only'); }, { sleep: async () => {} }), /members only/);
  assert.equal(m, 1);
  assert.equal(isTransientError(new Error('Rate limit exceeded')), true);
});
