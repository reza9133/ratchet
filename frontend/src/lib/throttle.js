// Studionet's RPC allows ~30 requests/minute and sometimes answers with an HTML gateway page or
// "Internal error".  This wraps window.fetch for requests to the RPC origin only (so genlayer-js's own
// calls are covered too): token-bucket pacing (burst 10, 24/min sustained), automatic repeat after
// a rate-limit answer, and growing back-off for transient gateway errors on READ calls.
// A transaction submission is never repeated after a gateway error (it may already be accepted).
const RATE_LIMITED = /rate limit|too many requests/i;
const TRANSIENT_TEXT = /internal error|temporar|try again|bad gateway|service unavailable|gateway time-?out/i;
const IDEMPOTENT = /^(eth_(get|call|estimate|chainId|blockNumber|gasPrice|feeHistory|maxPriority)|net_|web3_|gen_(call|get|estimate)|sim_get)/i;

const methodsOf = (init) => {
  try {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (!body) return [];
    return (Array.isArray(body) ? body : [body]).map((x) => String(x?.method ?? ''));
  } catch { return []; }
};

function classify(status, text) {
  const head = String(text ?? '').trimStart();
  if (status === 429) return 'rate';
  if (head.length < 2000 && RATE_LIMITED.test(head)) return 'rate';
  if (status >= 500 && status < 600) return 'transient';
  if (head.startsWith('<')) return 'transient';
  if (head.startsWith('{') && head.includes('"error"')) {
    try {
      const err = JSON.parse(head)?.error;
      if (err) {
        const msg = `${err.message ?? ''} ${typeof err.data === 'string' ? err.data : ''}`;
        if (RATE_LIMITED.test(msg)) return 'rate';
        if (err.code === -32603 || TRANSIENT_TEXT.test(msg)) return 'transient';
      }
    } catch { /* ignore */ }
  }
  return null;
}

let installed = null;
export const rpcStatus = { waiting: false, listeners: new Set() };
const setWaiting = (v, why = '') => { rpcStatus.waiting = v; rpcStatus.why = why; rpcStatus.listeners.forEach((f) => f(rpcStatus)); };

export function installThrottle(rpcUrl, { burst = 10, perMinute = 24 } = {}) {
  if (installed) return installed;
  const original = window.fetch.bind(window);
  const origin = new URL(rpcUrl).origin;
  const refill = perMinute / 60000;          // tokens per ms
  let tokens = burst, last = Date.now(), blockedUntil = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function take() {
    for (;;) {
      const now = Date.now();
      tokens = Math.min(burst, tokens + (now - last) * refill); last = now;
      const wait = Math.max(blockedUntil - now, tokens >= 1 ? 0 : Math.ceil((1 - tokens) / refill));
      if (wait <= 0) { tokens -= 1; return; }
      await sleep(Math.min(wait, 4000));
    }
  }

  installed = async function throttled(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ?? '';
    if (!url.startsWith(origin)) return original(input, init);
    const safe = (() => { const m = methodsOf(init); return m.length > 0 && m.every((x) => IDEMPOTENT.test(x)); })();
    let rate = 0, transient = 0;
    for (;;) {
      await take();
      let res;
      try { res = await original(input, init); }
      catch (e) {
        if (!safe || transient >= 5) throw e;
        transient += 1; const pause = Math.min(20000, 2500 * 2 ** (transient - 1));
        setWaiting(true, 'network'); blockedUntil = Date.now() + pause; await sleep(pause); setWaiting(false); continue;
      }
      const text = await res.clone().text().catch(() => '');
      const kind = classify(res.status, text);
      if (!kind) return res;
      if (kind === 'rate') {
        if (rate >= 6) return res;
        rate += 1; const pause = Math.min(45000, 7000 * rate);
        setWaiting(true, 'rate limit'); blockedUntil = Date.now() + pause; await sleep(pause); setWaiting(false); continue;
      }
      if (!safe || transient >= 5) return res;
      transient += 1; const pause = Math.min(20000, 2500 * 2 ** (transient - 1));
      setWaiting(true, 'gateway'); blockedUntil = Date.now() + pause; await sleep(pause); setWaiting(false);
    }
  };
  window.fetch = installed;
  return installed;
}

export const TRANSIENT_ERROR = /Unexpected token '<'|<!DOCTYPE|is not valid JSON|Internal error|HTTP request failed|Failed to fetch|NetworkError|Bad Gateway|Service Unavailable|Gateway Time-?out|Rate limit/i;
export const isTransientError = (e) => TRANSIENT_ERROR.test(String(e?.message ?? e));
