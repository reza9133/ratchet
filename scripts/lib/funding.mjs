// Making sure the throw-away test accounts hold GEN.
//
// Studionet may not offer `sim_fundAccount`.  Then the accounts must be funded by hand from the
// faucet (GenLayer Studio) and this module waits for the balances to arrive instead of failing the
// run on the spot.  Pure of any network detail: it only needs chain.balance() and chain.fund().
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (wei) => `${Number(wei) / 1e18} GEN`;

/**
 * @param chain    { balance(addr), fund(addr, wei) }
 * @param accounts { NAME: { name, address } }
 * @param opts     minWei (required balance), fundWei (amount asked from sim_fundAccount),
 *                 waitSeconds (how long to wait for outside funding), stepSeconds, log, sleep
 * @returns        rows { name, address, balance, how, ok }
 */
export async function ensureFunded(chain, accounts, { minWei, fundWei, waitSeconds = 0, stepSeconds = 10, log = console.log, sleep = sleepMs } = {}) {
  const rows = [];
  for (const account of Object.values(accounts)) {
    let balance = await chain.balance(account.address);
    let how = 'already funded';
    if (balance < minWei) {
      try {
        await chain.fund(account.address, fundWei ?? minWei);
        how = 'funded by sim_fundAccount';
      } catch (error) {
        how = `faucet call refused (${String(error?.message ?? error).slice(0, 70)})`;
      }
      balance = await chain.balance(account.address);
    }
    rows.push({ name: account.name, address: account.address, balance, how, ok: balance >= minWei });
  }
  let low = rows.filter((r) => !r.ok);
  if (low.length && waitSeconds > 0) {
    log(`\nThese accounts need at least ${fmt(minWei)} each. Send GEN from the Studionet faucet (GenLayer Studio):`);
    for (const r of low) log(`  ${r.name.padEnd(3)} ${r.address}`);
    log(`Waiting up to ${waitSeconds}s for the balances to arrive...`);
    const until = Date.now() + waitSeconds * 1000;
    while (low.length && Date.now() < until) {
      await sleep(stepSeconds * 1000);
      for (const r of low) {
        r.balance = await chain.balance(r.address);
        if (r.balance >= minWei) { r.ok = true; if (r.how.startsWith('faucet call refused')) r.how = 'funded from outside'; }
      }
      low = low.filter((r) => !r.ok);
    }
  }
  return rows;
}
