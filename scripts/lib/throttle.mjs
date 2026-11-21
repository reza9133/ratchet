// Studionet's RPC answers at most 30 requests per minute per client, and now and then a gateway in
// front of it answers with an HTML error page ("<!DOCTYPE ...") or a JSON-RPC "Internal error".
//
// genlayer-js (through viem) polls every pending transaction and issues several calls per write
// (gen_call, eth_estimateGas, eth_getTransactionCount, ...), so pacing only the calls this script
// makes itself is not enough: one unpaced poll is refused and the whole run dies halfway.  This
// wraps `fetch` for requests to the RPC address only, which covers EVERY caller, the SDK included:
//
//   * calls are spaced evenly (default 24 a minute, under the limit of 30);
//   * a call refused with "Rate limit exceeded" / HTTP 429 is repeated after a pause (it was never
//     processed, so this is safe for every method, even a transaction submission);
//   * a READ call answered with an HTML page, a 5xx status or "Internal error" is repeated with a
//     growing pause.  A transaction submission is never repeated in that case: the network may
//     already have accepted it, and the caller decides what to do.
//
// Nothing else (other hosts) goes through it.

export const RATE_LIMITED = /rate limit|too many requests/i;
const TRANSIENT_TEXT = /internal error|temporar|try again|bad gateway|service unavailable|gateway time-?out/i;
// methods that only read: always safe to repeat
const IDEMPOTENT = /^(eth_(get|call|estimate|chainId|blockNumber|gasPrice|feeHistory|maxPriority)|net_|web3_|gen_(call|get|estimate)|sim_get)/i;

/** The JSON-RPC method names inside a request body (single or batch). */
export function methodsOf(init) {
  try {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (!body) return [];
    return (Array.isArray(body) ? body : [body]).map((x) => String(x?.method ?? ''));
  } catch {
    return [];
  }
}

export const isIdempotent = (methods) => methods.length > 0 && methods.every((m) => IDEMPOTENT.test(m));

/** 'rate' | 'transient' | null for one response (status + body text). */
export function classifyResponse(status, text) {
  const head = String(text ?? '').trimStart();
  if (status === 429) return 'rate';
  if (head.length < 2000 && RATE_LIMITED.test(head)) return 'rate';
  if (status >= 500 && status < 600) return 'transient';
  if (head.startsWith('<')) return 'transient';                         // an HTML gateway page, not JSON
  if (head.startsWith('{') && head.includes('"error"')) {
    try {
      const err = JSON.parse(head)?.error;
      if (err) {
        const msg = `${err.message ?? ''} ${typeof err.data === 'string' ? err.data : ''}`;
        if (RATE_LIMITED.test(msg)) return 'rate';
        if (err.code === -32603 || TRANSIENT_TEXT.test(msg)) return 'transient';
      }
    } catch { /* not JSON: leave it to the caller */ }
  }
  return null;
}

export function createThrottle({
  fetchFn, rpcUrl, perMinute = 24, maxRateRetries = 8, maxTransientRetries = 6,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), onWait = () => {},
}) {
  const spacing = Math.ceil(60000 / Math.max(1, perMinute));
  const origin = new URL(rpcUrl).origin;
  let next = 0;                                     // the earliest time the next request may start
  const stats = { sent: 0, rateRefused: 0, transient: 0 };

  async function slot() {
    const at = Math.max(now(), next);
    next = at + spacing;                            // reserved synchronously, so concurrent callers queue in order
    const wait = at - now();
    if (wait > 0) await sleep(wait);
  }

  async function throttled(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ?? '';
    if (!url.startsWith(origin)) return fetchFn(input, init);
    const safeToRepeat = isIdempotent(methodsOf(init));
    let rate = 0;
    let transient = 0;
    for (;;) {
      await slot();
      stats.sent += 1;
      let res;
      try {
        res = await fetchFn(input, init);
      } catch (error) {
        // the connection itself failed before any answer: only a read may be repeated
        if (!safeToRepeat || transient >= maxTransientRetries) throw error;
        transient += 1; stats.transient += 1;
        const pause = Math.min(30000, 3000 * 2 ** (transient - 1));
        onWait(pause, transient, 'network');
        next = Math.max(next, now() + pause);
        await sleep(pause);
        continue;
      }
      const text = await res.clone().text().catch(() => '');
      const kind = classifyResponse(res.status, text);
      if (!kind) return res;
      if (kind === 'rate') {
        stats.rateRefused += 1;
        if (rate >= maxRateRetries) return res;
        rate += 1;
        const pause = Math.min(60000, 8000 * rate);
        onWait(pause, rate, 'rate limit');
        next = Math.max(next, now() + pause);       // everyone waits, not only this caller
        await sleep(pause);
        continue;
      }
      // transient gateway / server error
      stats.transient += 1;
      if (!safeToRepeat || transient >= maxTransientRetries) return res;
      transient += 1;
      const pause = Math.min(30000, 3000 * 2 ** (transient - 1));
      onWait(pause, transient, 'gateway error');
      next = Math.max(next, now() + pause);
      await sleep(pause);
    }
  }
  throttled.stats = stats;
  return throttled;
}

let installed = null;

/** Wraps globalThis.fetch once per process. Returns the wrapper (with .stats). */
export function installThrottle(rpcUrl, perMinute = 24, log = console.log) {
  if (installed) return installed;
  const original = globalThis.fetch;
  let lastLine = 0;
  installed = createThrottle({
    fetchFn: original.bind(globalThis), rpcUrl, perMinute,
    onWait: (ms, n, why) => {
      if (Date.now() - lastLine > 30000) {
        log(`   the RPC answered with ${why}; waiting ${Math.round(ms / 1000)}s (retry ${n})`);
        lastLine = Date.now();
      }
    },
  });
  globalThis.fetch = installed;
  return installed;
}

/** For errors that reach us as exceptions (the SDK wraps the HTML page in a JSON parse error). */
export const TRANSIENT_ERROR = /Unexpected token '<'|<!DOCTYPE|is not valid JSON|Internal error|HTTP request failed|fetch failed|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|Bad Gateway|Service Unavailable|Gateway Time-?out|Rate limit/i;

export const isTransientError = (error) => TRANSIENT_ERROR.test(String(error?.message ?? error));

/** Repeats `fn` while it fails with a transient error (reads and waits only, never a submission). */
export async function withTransientRetry(fn, { tries = 5, pause = 15000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= tries || !isTransientError(error)) throw error;
      await sleep(Math.min(60000, pause * attempt));
    }
  }
}
