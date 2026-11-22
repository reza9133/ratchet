// Data layer: reads (gen_call through genlayer-js) and writes (wallet-signed, EIP-6963 provider).
// In demo mode (?demo=1) every call is answered by the in-browser simulation instead.
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { CONTRACT_ADDRESS, CHAIN, DEMO } from './config.js';
import { installThrottle, isTransientError } from './throttle.js';
import { classifyReceipt, statusOf, friendlyError } from './receipt.js';
import { wallet } from './wallet.js';

let sim = null;
if (DEMO) sim = await import('../demo/sim.js');
else installThrottle(CHAIN.rpc);

let readClient = null;
const reader = () => (readClient ??= createClient({ chain: studionet }));

// ---- tiny cache with in-flight de-duplication ------------------------------------------------
const cache = new Map();
const TTL = 8000;
export function invalidate() { cache.clear(); }
async function cached(key, fn, ttl = TTL) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 4, pause = 4000) {
  for (let i = 1; ; i += 1) {
    try { return await fn(); }
    catch (e) { if (i >= tries || !isTransientError(e)) throw e; await sleep(pause * i); }
  }
}
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Raw contract view call. */
export function view(fn, args = [], { force = false } = {}) {
  if (sim) return sim.view(fn, args);
  const key = fn + JSON.stringify(args, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  if (force) cache.delete(key);
  return cached(key, () => withRetry(() => reader().readContract({ address: CONTRACT_ADDRESS, functionName: fn, args })));
}

export const api = {
  assembly: (o) => view('get_assembly', [], o).then(parse),
  charter: (o) => view('get_charter', [], o).then(parse),
  ledger: (o) => view('get_ledger', [], o).then(parse),
  motion: (id, o) => view('get_motion', [BigInt(id)], o).then(parse),
  motions: (offset, limit, o) => view('list_motions', [BigInt(offset), BigInt(limit)], o).then(parse),
  vote: (id, who, o) => view('get_vote', [BigInt(id), who], o).then(String),
  claimable: (who, o) => view('get_claimable', [who], o).then((v) => BigInt(v)),
  standing: (who, o) => view('get_standing', [who], o).then(parse),
  quote: (tier, n) => view('quote_threshold', [BigInt(tier), BigInt(n)]).then(Number),
  async balance(addr) {
    if (sim) return sim.balance(addr);
    return cached('bal' + addr, () => withRetry(() => reader().getBalance({ address: addr })), 6000);
  },
};

const isRejection = (e) => e?.code === 4001 || /user rejected|user denied|rejected the request|denied transaction/i.test(String(e?.message ?? e));
const shortMsg = (e) => String(e?.shortMessage ?? e?.details ?? e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300);

const DECIDED = new Set(['ACCEPTED', 'FINALIZED', 'UNDETERMINED', 'CANCELED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT']);

/**
 * Sends a write transaction with the connected wallet and waits for consensus.
 * onStage(stage, info): 'wallet' (waiting for the signature) -> 'submitted' (hash) -> 'consensus' (polling) -> resolves.
 * Resolves with { ok, kind, hash, errorText, friendly, rejected, status }.
 *   kind: OK | EXEC_ERROR | UNDETERMINED | CANCELED | TIMEOUT | SUBMIT_ERROR | REJECTED
 */
export async function send({ fn, args = [], value = 0n, onStage = () => {} }) {
  const { account, provider } = wallet.state;
  if (!account || !provider) return { ok: false, kind: 'SUBMIT_ERROR', errorText: 'Connect a wallet first.', friendly: 'Connect a wallet first.' };
  onStage('wallet', {});
  if (sim) {
    const out = await sim.send({ sender: account, fn, args, value, onStage });
    invalidate();
    return out;
  }
  const client = createClient({ chain: studionet, account, provider });
  let hash;
  try {
    hash = await client.writeContract({ address: CONTRACT_ADDRESS, functionName: fn, args, value });
  } catch (e) {
    const rejected = isRejection(e);
    return { ok: false, kind: rejected ? 'REJECTED' : 'SUBMIT_ERROR', rejected, errorText: shortMsg(e), friendly: rejected ? 'You rejected the request in your wallet.' : friendlyError(shortMsg(e)) };
  }
  onStage('submitted', { hash });
  const deadline = Date.now() + 20 * 60 * 1000;
  let tx = null, status = 'PENDING';
  while (Date.now() < deadline) {
    try {
      tx = await client.getTransaction({ hash });
      status = statusOf(tx) || 'PENDING';
      onStage('consensus', { hash, status });
      if (DECIDED.has(status)) break;
    } catch (e) {
      if (!isTransientError(e)) { /* keep polling: the node may not know the hash yet */ }
    }
    await sleep(6000);
  }
  let receipt = tx;
  if (tx && (status === 'ACCEPTED' || status === 'FINALIZED')) {
    try { receipt = await client.waitForTransactionReceipt({ hash, status: 'ACCEPTED', retries: 0, interval: 500 }); } catch { receipt = tx; }
  }
  const c = receipt ? classifyReceipt(receipt) : { ok: false, kind: 'TIMEOUT', errorText: '' };
  invalidate();
  return { ...c, hash, friendly: c.ok ? '' : c.kind === 'UNDETERMINED'
    ? 'The validators did not reach exact agreement (UNDETERMINED). Nothing changed on-chain — you can simply try again.'
    : c.kind === 'TIMEOUT' && !receipt ? 'Still waiting for the network. Check the explorer for the final result.'
    : friendlyError(c.errorText) };
}

export const simulation = sim;
/** Chain clock in seconds (the simulation has its own, fast-forwardable clock). */
export const chainNow = () => (sim ? sim.simNow() : Math.floor(Date.now() / 1000));
