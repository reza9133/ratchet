// Chain adapters used by scripts/e2e.mjs.
//
//   LiveChain : GenLayer Studionet through genlayer-js 1.1.8 (the real thing).
//   SimChain  : the local Direct-Mode bridge in scripts/sim_bridge.py (dry run, no network).
//
// Both expose the same small surface so the scenario code is identical in both modes:
//   fund(addr, wei) balance(addr) deploy({from, code, args}) write({from, address, fn, args, value})
//   read(address, fn, args) waitFinalized(outcome) now() sleep(seconds) waitUntil(ts)
//
// `from` is an account record { name, address, privateKey }.
import { createAccount, createClient, abi } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';
import { classifyReceipt, deployedAddress } from './receipt.mjs';
import { installThrottle, isTransientError, withTransientRetry } from './throttle.mjs';

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (u8) => Buffer.from(u8).toString('hex');

function outcomeOf(receipt, hash) {
  const c = classifyReceipt(receipt);
  return { hash, receipt, ...c };
}

export class LiveChain {
  constructor({ rpc = process.env.GENLAYER_RPC || '', pollMs = Math.max(1, Number(process.env.E2E_POLL_SECS) || 15) * 1000,
    maxWaitSeconds = 1500, perMinute = Math.max(1, Number(process.env.E2E_RPC_PER_MIN) || 24) } = {}) {
    this.mode = 'live';
    this.rpc = rpc || studionet.rpcUrls?.default?.http?.[0] || 'https://studio.genlayer.com/api';
    this.pollMs = pollMs;
    this.retries = Math.ceil((maxWaitSeconds * 1000) / pollMs);
    this.clients = new Map();
    // Every request to the RPC (ours AND the SDK's own polling) goes through one shared throttle.
    this.throttle = installThrottle(this.rpc, perMinute);
  }

  client(account) {
    const key = account?.address ?? 'anon';
    if (!this.clients.has(key)) {
      const opts = { chain: studionet };
      if (process.env.GENLAYER_RPC) opts.endpoint = process.env.GENLAYER_RPC;
      if (account?.privateKey) opts.account = createAccount(account.privateKey);
      this.clients.set(key, createClient(opts));
    }
    return this.clients.get(key);
  }

  /** Plain JSON-RPC (throttled and retried like every other request). */
  async rpcCall(method, params) {
    return withTransientRetry(async () => {
      const response = await fetch(this.rpc, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch { throw new Error(`${method}: non-JSON answer (${response.status}) ${text.slice(0, 80).replace(/\s+/g, ' ')}`); }
      if (!response.ok || payload.error) throw new Error(`${method}: ${JSON.stringify(payload.error ?? payload).slice(0, 200)}`);
      return payload.result;
    });
  }

  async fund(address, wei) {
    // Studionet may expose sim_fundAccount (amount in wei as a JSON number); when it does not, the
    // caller falls back to waiting for the faucet (see lib/funding.mjs).
    await this.rpcCall('sim_fundAccount', [address, Number(wei)]);
    return this.balance(address);
  }

  async balance(address) {
    return BigInt(await this.rpcCall('eth_getBalance', [address, 'latest']));
  }

  /** Waits for a receipt; a transient RPC failure while polling resumes the wait instead of aborting the run. */
  async waitReceipt(client, hash, status, maxWaitSeconds) {
    const deadline = Date.now() + maxWaitSeconds * 1000;
    for (;;) {
      const left = Math.max(1, Math.ceil((deadline - Date.now()) / this.pollMs));
      try {
        return await client.waitForTransactionReceipt({ hash, status, interval: this.pollMs, retries: left });
      } catch (error) {
        if (!isTransientError(error) || Date.now() > deadline) throw error;
        await sleepMs(Math.min(30000, this.pollMs * 2));
      }
    }
  }

  async deploy({ from, code, args }) {
    const client = this.client(from);
    const hash = await client.deployContract({ code, args, leaderOnly: false });
    const receipt = await this.waitReceipt(client, hash, TransactionStatus.ACCEPTED, this.retries * this.pollMs / 1000);
    const out = outcomeOf(receipt, hash);
    out.address = deployedAddress(receipt);
    return out;
  }

  async write({ from, address, fn, args = [], value = 0n }) {
    const client = this.client(from);
    let hash;
    try {
      // A submission is never blindly repeated (it may already have been accepted); the throttle only
      // repeats it when the RPC refused it for rate-limit reasons, which means it was not processed.
      hash = await client.writeContract({ address, functionName: fn, args, value: BigInt(value) });
    } catch (error) {
      return { ok: false, kind: 'SUBMIT_ERROR', errorText: String(error?.shortMessage ?? error?.message ?? error), hash: null };
    }
    try {
      const receipt = await this.waitReceipt(client, hash, TransactionStatus.ACCEPTED, this.retries * this.pollMs / 1000);
      return outcomeOf(receipt, hash);
    } catch (error) {
      return { ok: false, kind: 'TIMEOUT', errorText: String(error?.message ?? error), hash };
    }
  }

  async waitFinalized(outcome, { maxWaitSeconds = 1800 } = {}) {
    if (!outcome?.hash) return outcome;
    const client = this.client();
    try {
      const receipt = await this.waitReceipt(client, outcome.hash, TransactionStatus.FINALIZED, maxWaitSeconds);
      return outcomeOf(receipt, outcome.hash);
    } catch (error) {
      return { ...outcome, finalized: false, finalizeError: String(error?.message ?? error) };
    }
  }

  async read(address, fn, args = []) {
    return withTransientRetry(() => this.client().readContract({ address, functionName: fn, args }));
  }

  /** Deployed source bytes as a utf8 string (JSON-RPC gen_getContractCode returns base64). */
  async deployedCode(address) {
    const result = await this.rpcCall('gen_getContractCode', [address]);
    if (typeof result !== 'string') throw new Error('gen_getContractCode returned no source');
    return Buffer.from(result, 'base64').toString('utf8');
  }

  async now() { return Math.floor(Date.now() / 1000); }

  async sleep(seconds) { await sleepMs(seconds * 1000); }

  async waitUntil(ts, log = () => {}) {
    for (;;) {
      const left = ts - (await this.now());
      if (left <= 0) return;
      log(left);
      await this.sleep(Math.min(left + 1, 20));
    }
  }
}

export class SimChain {
  constructor({ url = process.env.SIM_URL || 'http://127.0.0.1:8765' } = {}) {
    this.mode = 'sim';
    this.url = url;
  }

  async post(path, body) {
    const res = await fetch(this.url + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok || json.error && path !== '/read') throw new Error(`sim ${path}: ${json.error ?? res.status}`);
    return json;
  }

  async fund(address, wei) { return BigInt((await this.post('/fund', { address, wei: String(wei) })).balance); }

  async balance(address) { return BigInt((await this.post('/balance', { address })).balance); }

  async deploy({ from, code, args }) {
    this.sourceForParity = code;
    const argsHex = hex(abi.calldata.encode({ args }));
    const receipt = await this.post('/deploy', { sender: from.address, code, args_hex: argsHex });
    const out = outcomeOf(receipt, receipt.hash);
    out.address = deployedAddress(receipt);
    return out;
  }

  async write({ from, address, fn, args = [], value = 0n }) {
    const dataHex = hex(abi.calldata.encode({ method: fn, args, kwargs: {} }));
    const receipt = await this.post('/write', {
      sender: from.address, address, data_hex: dataHex, value: String(BigInt(value)) });
    return outcomeOf(receipt, receipt.hash);
  }

  async waitFinalized(outcome) {
    const receipt = await this.post('/finalize', { hash: outcome.hash });
    return outcomeOf(receipt, outcome.hash);
  }

  async read(address, fn, args = []) {
    const dataHex = hex(abi.calldata.encode({ method: fn, args, kwargs: {} }));
    const res = await this.post('/read', { address, data_hex: dataHex });
    if (res.error) throw new Error(res.error);
    if (res.type === 'int') return BigInt(res.value);
    return res.value;
  }

  async deployedCode() { return this.sourceForParity; }

  async now() { return (await this.post('/now', {})).now; }

  async sleep(seconds) { await this.post('/advance', { seconds }); }

  async waitUntil(ts, log = () => {}) {
    for (;;) {
      const left = ts - (await this.now());
      if (left <= 0) return;
      log(left);
      await this.sleep(Math.min(left + 1, 60));
    }
  }

  async chaos(method, times) { return this.post('/chaos', { method, times }); }
}
