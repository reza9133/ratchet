import { CONTRACT_ADDRESS, CHAIN, LINKS, explorerAddress } from '../lib/config.js';
import { $, $$, esc, copyText } from '../lib/format.js';

const code = (txt) => `<pre class="code"><button class="copy-code" type="button">Copy</button><code>${esc(txt)}</code></pre>`;
const callout = (icon, html, cls = '') => `<div class="callout ${cls}"><span class="ci">${icon}</span><p>${html}</p></div>`;
const tbl = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const SECTIONS = [
  { id: 'overview', title: 'Overview', html: () => `
    <p class="lead">RATCHET is a self-tightening constitution for small assemblies, written as a single <b>GenLayer intelligent contract</b> (GenVM v0.2.16) and deployed on <b>Studionet</b>.</p>
    <p>An assembly governs itself through a written <b>charter</b> of tiered articles. Every motion (amend the charter, spend treasury funds, admit or expel a member) needs a supermajority that depends on <b>how entrenched the articles it touches are</b>.</p>
    <p>Whether a motion touches an article is a question of <i>meaning</i>, not syntax. GenLayer validators answer it with an LLM, and the answer is binding only if the validators reproduce it <b>exactly</b>. A member who thinks the first reading was too lenient can <b>challenge</b> it with a bond: the tier can be ratcheted <b>up, never down</b>, and a successful challenger is paid a bounty out of the proposer’s bond.</p>
    ${callout('🧩', 'No owner, no admin, no upgrade path, no oracle. Parameters are fixed at deployment; the charter changes only through motions.')}
    ${tbl(['Item', 'Value'], [['Network', `GenLayer ${CHAIN.short} (chain id ${CHAIN.id})`], ['Contract', `<code>${CONTRACT_ADDRESS}</code>`], ['Runtime', 'GenVM v0.2.16, one file: <code>contracts/Ratchet.py</code>'], ['Source', `<a href="${LINKS.github}" target="_blank" rel="noopener">github.com/reza9133/ratchet</a>`]])}` },

  { id: 'quickstart', title: 'Quick start (this app)', html: () => `
    <ol>
      <li><b>Connect a wallet.</b> Press <i>Connect wallet</i> in the header. Every installed wallet appears through <a href="#wallet">EIP-6963</a>; pick one and approve.</li>
      <li><b>Switch to Studionet.</b> If your wallet is on another chain a banner and a dialog offer <i>Switch network</i>. The app asks your wallet to add “${CHAIN.name}” (chain ${CHAIN.id}) first when it does not know it.</li>
      <li><b>Get test GEN.</b> Filing a motion or a challenge attaches a <b>bond</b> in GEN. Use the GenLayer Studio faucet to fund your account; the bond comes back when the motion ends.</li>
      <li><b>Be a member.</b> Filing, classifying, voting and challenging are member-only. Members are fixed at deployment (3–15 founders) and change only via ADMIT / EXPEL motions.</li>
      <li><b>File → Classify → Vote → (Challenge) → Finalize.</b> Open <a href="motions.html">Motions</a> and follow the lifecycle on each motion page.</li>
      <li><b>Withdraw payouts.</b> Refunds, bounties and grants are pull payments: use <i>Withdraw</i> on the <a href="assembly.html">Assembly</a> page.</li>
    </ol>
    ${callout('🎬', 'Prefer to look first? The <a href="index.html#demo">demo video</a> shows the whole flow, and <a href="assembly.html?demo=1">simulation mode</a> lets you click through it with no wallet and no gas.')}` },

  { id: 'concepts', title: 'Core concepts', html: () => `
    <h3 id="charter">The charter</h3><p>A list of up to 12 articles <code>{id, text, tier}</code>. Article ids are 1–12 characters of <code>A–Z 0–9 _</code> starting with a letter; text is at most 500 bytes.</p>
    <h3 id="tiers">Tiers and thresholds</h3>
    ${tbl(['Tier', 'Name', 'Rule', 'Roster of 5', 'Roster of 9'], [['1', 'ORDINARY', 'strict majority (&gt; 1/2)', '3', '5'], ['2', 'QUALIFIED', 'two thirds (≥ 2/3)', '4', '6'], ['3', 'ENTRENCHED', 'four fifths (≥ 4/5)', '4', '8'], ['4', 'FOUNDATIONAL', 'unanimity', '5', '9']])}
    <p class="muted">Exact formulas: tier 1 → <code>n//2 + 1</code>; tier 2 → <code>(2n+2)//3</code>; tier 3 → <code>(4n+4)//5</code>; tier 4 → <code>n</code>. (<code>quote_threshold(tier, roster_size)</code> exposes them.)</p>
    <h3 id="kinds">Motion kinds and their floor tier</h3>
    ${tbl(['Kind', 'Effect when enacted', 'Floor tier'], [['<code>AMEND</code>', 'adopt a new article, replace one, or repeal one', 'the current tier of the edited article (new article: 1)'], ['<code>GRANT</code>', 'pay commons funds to an address', 'by size: ≤ 10% of the treasury → 1, ≤ 50% → 2, more → 3'], ['<code>ADMIT</code>', 'add a member (max 15)', '2'], ['<code>EXPEL</code>', 'remove a member (never below 3)', '3']])}
    <p>The effective tier is <code>max(floor tier, tier of every article the validators flagged)</code>, <b>computed in code</b>. The edited article is not sent to the AI (it already counts through the floor); the AI answers for every <i>other</i> article. A grant for a political campaign, for example, climbs to tier 3 because it contradicts an entrenched article, however small it is.</p>
    <h3 id="floor">The floor lock</h3><p>Only one motion can be on the floor at a time. The charter, roster and treasury therefore cannot change between classification and settlement, so the frozen evidence the validators judge is the evidence the vote and the effect apply to.</p>` },

  { id: 'lifecycle', title: 'Motion lifecycle', html: () => `
    <div class="lifecycle"><div class="lc"><b>FILED</b>exact bond attached</div><div class="lc"><b>VOTING</b>after <code>classify</code> (strict AI)</div><div class="lc"><b>CONTESTABLE</b>vote passed; challenge window</div><div class="lc end"><b>ENACTED</b>still meets the (maybe higher) threshold</div></div>
    <div class="lifecycle"><div class="lc bad"><b>REJECTED</b>threshold missed</div><div class="lc warn"><b>LAPSED</b>fewer than half voted</div><div class="lc warn"><b>WITHDRAWN</b>by proposer, before classify</div><div class="lc warn"><b>EXPIRED</b>never classified in time</div><div class="lc bad"><b>VOID</b>effect no longer applicable</div></div>
    ${tbl(['Step', 'Who', 'What happens'], [
      ['<code>file_*</code>', 'member', 'attaches exactly the bond; charter, roster and evidence digest are frozen into the motion'],
      ['<code>classify</code>', 'member', 'AI consensus with the <b>STRICT</b> reading → touched articles → tier → vote deadline'],
      ['<code>vote</code>', 'frozen-roster member', 'one vote each, until the deadline'],
      ['<code>close_vote</code>', 'anyone', 'when everyone voted, the deadline passed, or the motion is hopeless with ≥ half the roster voted. <b>A passing count never ends voting early.</b>'],
      ['<code>challenge</code>', 'roster member ≠ proposer', 'once per motion, with a bond; AI re-reads with the <b>INCLUSIVE</b> reading; the tier can only go up'],
      ['<code>finalize</code>', 'anyone', 'after the challenge window, or right after a challenge: enact or reject; release the floor; refund the bond']])}
    <p><b>Two readings.</b> <i>STRICT</i> (first assessment): true only when the motion’s own words clearly amend, repeal, suspend, override or contradict the article. <i>INCLUSIVE</i> (a challenge): also true when the literal effect would in practice weaken, bypass or empty the article’s rule. Both use identical frozen evidence (SHA-256 digest checked before every assessment).</p>` },

  { id: 'money', title: 'Money: bonds, bounties, payouts', html: () => `
    <p>All amounts are in wei of the native GEN token. Payouts are <b>pull payments</b> (<code>withdraw</code>), so a failing recipient can never block the assembly.</p>
    ${tbl(['Event', 'What happens'], [
      ['filing', 'the proposer attaches <b>exactly</b> the bond (held in escrow)'],
      ['ENACTED / REJECTED / VOID / WITHDRAWN / EXPIRED', 'bond returns to the proposer (as a claimable balance)'],
      ['LAPSED (fewer than half of the roster voted)', 'bond is <b>forfeited to the treasury</b>'],
      ['challenge <b>raises</b> the tier', 'challenger gets their bond back <b>plus half of the proposer’s bond</b>; the other half returns to the proposer'],
      ['challenge <b>fails</b> (tier unchanged)', 'half the challenger’s bond compensates the proposer, half goes to the treasury'],
      ['<code>donate</code>', 'straight to the treasury'],
      ['GRANT enacted', 'treasury → recipient’s pull balance'],
      ['bounced payout (<code>__on_errored_message__</code>)', 'returns to the treasury; nothing is ever lost']])}
    <p><code>get_ledger</code> exposes the conservation law checked by every test and live run: <code>balance ≥ treasury + escrow + sum(claimable)</code>, equal once payouts have finalized.</p>
    ${callout('⏳', 'Payouts to accounts are EVM messages that execute when the <code>withdraw</code> transaction is <b>finalized</b>, not merely accepted. After withdrawing, your wallet balance can take a few minutes to move.', 'warn')}` },

  { id: 'consensus', title: 'The consensus rule', html: () => `
    ${callout('🎯', 'Every value that is stored, counted, or decides a path or payout (statuses, booleans, scores, levels) must be <b>exactly equal</b> between leader and validator. No tolerance, no “one level stricter”, no adjacent level. Flexible comparison exists <b>only</b> for the free-text <code>reason</code>.')}
    <ul>
      <li>Validators assess <b>independently</b>; they never see the leader’s answer.</li>
      <li>They approve only if the full per-article boolean map <b>and</b> the derived tier are identical.</li>
      <li>The level is <b>computed from the booleans in code</b>, then compared anyway and re-checked for consistency, so a forged level cannot ride on correct booleans.</li>
      <li>A leader error, a malformed answer or a validator exception is a vote <b>against</b>.</li>
      <li>No consensus means <b>no state change</b> (<code>UNDETERMINED</code>); the caller may simply send the transaction again.</li>
    </ul>
    ${tbl(['Value', 'Compared how'], [['touch boolean per article', '<b>exact</b>, key for key, bool for bool (real booleans only: <code>1</code>, <code>"true"</code>, <code>null</code> are rejected)'], ['derived tier (1–4)', '<b>exact</b> and recomputed from the booleans'], ['set of article ids', '<b>exact</b>: nothing missing, invented or renamed'], ['<code>reason</code> (free text)', 'not compared; sanitised and capped at 400 characters']])}
    <p>The test-suite checks all 16 × 16 leader/validator pairs, both adjacent-tier directions, 14 kinds of forgery, and 49 mutants (every tolerance-style mutant is killed). See <a href="${LINKS.github}/blob/main/docs/CONSENSUS.md" target="_blank" rel="noopener">docs/CONSENSUS.md</a>.</p>
    ${callout('🔁', 'If you see <b>“No exact agreement”</b> in the app, that is the safe failure mode: <i>nothing happened, try again</i>. Borderline wording can fail consensus more often.')}` },

  { id: 'api', title: 'Contract API', html: () => `
    <p>Addresses are accepted as <code>0x</code> hex strings and stored lower-case.</p>
    <h3 id="api-writes">Write methods</h3>
    ${tbl(['Method', 'Who', 'Payable', 'Notes'], [
      ['<code>__init__(name, founders, charter_json, bond, vote_minutes, challenge_minutes)</code>', 'deployer', 'no', '3–15 distinct founders; ≤ 12 articles <code>{"id","text","tier"}</code>; windows 2–10080 min'],
      ['<code>file_amendment(article_id, new_text, new_tier)</code>', 'member', '<b>bond</b>', 'existing id + empty text + tier <code>0</code> = repeal; unknown id = adopt (tier 1–4)'],
      ['<code>file_grant(recipient, amount, purpose)</code>', 'member', '<b>bond</b>', '<code>0 &lt; amount ≤ treasury</code>'],
      ['<code>file_admission(candidate, statement)</code>', 'member', '<b>bond</b>', 'candidate must not be a member; roster ≤ 15'],
      ['<code>file_expulsion(member, grounds)</code>', 'member', '<b>bond</b>', 'roster stays ≥ 3'],
      ['<code>withdraw_motion(motion_id)</code>', 'proposer', 'no', 'only before classification'],
      ['<code>expire_motion(motion_id)</code>', 'anyone', 'no', 'unclassified motion older than the vote window'],
      ['<code>classify(motion_id)</code>', 'member', 'no', '<b>AI consensus</b>, STRICT reading; opens the vote'],
      ['<code>vote(motion_id, support)</code>', 'frozen-roster member', 'no', 'once; closed at the deadline'],
      ['<code>close_vote(motion_id)</code>', 'anyone', 'no', 'see lifecycle'],
      ['<code>challenge(motion_id)</code>', 'roster member ≠ proposer', '<b>bond</b>', '<b>AI consensus</b>, INCLUSIVE reading; once per motion'],
      ['<code>finalize(motion_id)</code>', 'anyone', 'no', 'after the window, or right after a challenge'],
      ['<code>donate()</code>', 'anyone', 'value', 'to the treasury'],
      ['<code>withdraw()</code>', 'anyone', 'no', 'pays the caller’s whole pull balance']])}
    <h3 id="api-views">Views</h3>
    ${tbl(['View', 'Returns'], [['<code>get_assembly()</code>', 'JSON: name, bond, windows, charter_version, members, counts, floor_motion, treasury, stats'], ['<code>get_charter()</code>', 'JSON: version + articles'], ['<code>get_motion(id)</code>', 'JSON: the full self-contained motion record (+ <code>votes_needed</code>, <code>effective_tier_name</code>)'], ['<code>list_motions(offset, limit)</code>', 'JSON page (limit ≤ 20)'], ['<code>get_vote(id, voter)</code>', '<code>"NONE" | "YES" | "NO"</code>'], ['<code>get_claimable(address)</code>', 'wei string'], ['<code>get_standing(address)</code>', 'JSON counters: filed, enacted, raised, lost'], ['<code>get_ledger()</code>', 'JSON: balance, treasury, escrow, claimable_total, books, solvent'], ['<code>quote_threshold(tier, roster_size)</code>', 'int']])}
    <h3 id="api-js">Calling it from JavaScript</h3>
    ${code(`import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const client = createClient({ chain: studionet });
const asm = JSON.parse(await client.readContract({
  address: '${CONTRACT_ADDRESS}',
  functionName: 'get_assembly', args: [],
}));

// with a browser wallet (EIP-6963 provider) as signer:
const signer = createClient({ chain: studionet, account: '0xYourAddress', provider });
const hash = await signer.writeContract({
  address: '${CONTRACT_ADDRESS}',
  functionName: 'file_amendment',
  args: ['ARCHIVE', 'The assembly keeps a public archive.', 1n],
  value: 4_000_000_000_000_000n, // exactly the bond, in wei (BigInt)
});`)}` },

  { id: 'wallet', title: 'Wallet & network (EIP-6963)', html: () => `
    <p>This app does not guess <code>window.ethereum</code>. It uses <b>EIP-6963</b> multi-wallet discovery:</p>
    <ol>
      <li>The page listens for <code>eip6963:announceProvider</code> events and then dispatches <code>eip6963:requestProvider</code>.</li>
      <li>Each wallet answers with <code>{ info: { uuid, name, icon, rdns }, provider }</code>; the picker lists all of them.</li>
      <li>Connecting calls <code>eth_requestAccounts</code> on the <b>chosen</b> provider only, and that same provider signs every transaction (it is handed to <code>genlayer-js</code> as <code>provider</code>).</li>
      <li>The app subscribes to <code>accountsChanged</code>, <code>chainChanged</code> and <code>disconnect</code>.</li>
    </ol>
    <h3>Connect / disconnect</h3>
    <p><b>Disconnect</b> is real: the app asks the wallet to revoke the site’s permission (<code>wallet_revokePermissions</code>, where supported), drops the session, and remembers not to auto-reconnect. Without the button, your previous wallet is reconnected silently on the next visit (<code>eth_accounts</code>, no prompt).</p>
    <h3>Switching network</h3>
    <p>Studionet is chain <code>${CHAIN.id}</code> (<code>${CHAIN.hex}</code>). When the wallet is on another chain you will see a red <b>Wrong network</b> pill, a banner, and a dialog. <i>Switch network</i> sends <code>wallet_switchEthereumChain</code>; if the wallet answers “unknown chain” (code 4902) the app sends <code>wallet_addEthereumChain</code> with:</p>
    ${code(`chainId:          ${CHAIN.hex}   (${CHAIN.id})
chainName:        ${CHAIN.name}
rpcUrls:          ["${CHAIN.rpc}"]
nativeCurrency:   { name: "${CHAIN.currency.name}", symbol: "${CHAIN.currency.symbol}", decimals: 18 }
blockExplorerUrls:["${CHAIN.explorer}"]`)}
    <p>Writes are blocked until you are on the right chain.</p>
    <h3>What a transaction looks like</h3>
    <ol><li><b>Confirm in your wallet</b> (spinner: the ratchet wheel).</li><li><b>Submitted</b> (hash with explorer link).</li><li><b>Validators reach consensus</b> (spinner: five nodes). For <code>classify</code> and <code>challenge</code> each validator calls the LLM on its own and the answers must match exactly.</li><li><b>Done</b>, or a clear reason: a contract revert in plain English, <i>No exact agreement</i> (UNDETERMINED, safe to retry), or <i>Request rejected</i>.</li></ol>
    <h3>RPC limits</h3><p>Studionet’s RPC allows about 30 requests per minute and sometimes answers with a gateway page. The app paces all RPC traffic (token bucket), caches views for a few seconds, repeats refused reads with back-off, and never blindly re-sends a transaction.</p>` },

  { id: 'demo', title: 'Simulation mode', html: () => `
    <p>Append <code>?demo=1</code> to any page (for example <a href="assembly.html?demo=1">assembly.html?demo=1</a>) to run the whole UI against an <b>in-browser simulation</b> of the contract and two fake EIP-6963 wallets. A control panel lets you act as any member and fast-forward the clock. Use <i>Exit demo</i> (<code>?demo=0</code>) to return to the real chain.</p>
    ${callout('⚠️', 'Simulation data is <b>not</b> on-chain. The built-in “clerk” is a keyword matcher standing in for the LLM validators. The demo video on the home page was recorded this way.', 'warn')}` },

  { id: 'run', title: 'Running the project', html: () => `
    <p>Requirements: Python 3.12+, Node 20+, network access. A GitHub Codespace works out of the box.</p>
    ${code(`bash run.sh                # setup, lint, 190 tests, mutation proof, then a live Studionet run
bash run.sh --fast         # skip the slow mutation suites
bash run.sh --offline      # last step runs on the local simulator (no network)
bash run.sh --live-only    # only the live run (after a previous full setup)`)}
    ${tbl(['Suite', 'Count', 'What'], [['tests/direct', '190', 'constructor, filing, guards, classification, consensus strictness, voting & timing, challenge/ratchet, settlement, money, thresholds, defensive VOID paths, views, 30 randomized walks × 260 steps with 8 invariants'], ['tests/mutation', '49 mutants', '48 killed, 1 documented equivalent'], ['e2e self-check', '10', 'the live script must fail against each broken contract'], ['e2e --sim', '278 checks / 75 txs', 'the whole live scenario on real contract code']])}
    <h3>Build this frontend</h3>
    ${code(`cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (works from any folder or sub-path)

# point it at another deployment:
VITE_RATCHET_ADDRESS=0x... npm run build`)}` },

  { id: 'security', title: 'Security notes', html: () => `
    <ul>
      <li><b>Not audited.</b> Treat it as a reference implementation.</li>
      <li><b>The AI is a witness, not an authority.</b> It only answers true/false per article against frozen evidence; levels, thresholds and money are computed by code. The motion text is passed as JSON data and the prompt tells the clerk to treat it as untrusted.</li>
      <li><b>Floor squatting.</b> A member can hold the floor for at most one vote window without classification (anyone can then expire it), or longer by classifying and not voting (the motion then lapses and the bond is forfeited).</li>
      <li><b>Roster = sybil boundary.</b> Admission needs tier 2, expulsion tier 3; the roster is frozen per motion.</li>
      <li><b>Time</b> comes from the transaction timestamp; windows are whole minutes (2–10080). Countdowns in this app use your clock and may differ by a few seconds.</li>
      <li><b>No upgrade, no admin.</b> Parameters are fixed at deployment.</li>
    </ul>` },

  { id: 'faq', title: 'FAQ', html: () => `
    <h3>Why did my transaction say “No exact agreement”?</h3><p>Validators answered differently on at least one article, so nothing changed (UNDETERMINED). Press <i>Try again</i>. Clearer, less borderline motion text helps.</p>
    <h3>Why can’t I file a motion?</h3><p>Check: you are a member; another motion isn’t on the floor; you are on Studionet; you hold at least the bond plus network fees.</p>
    <h3>A passing count did not end the vote. Why?</h3><p>By design. Voting ends when everyone has voted or the deadline passes, so a motion can’t be rushed through before the others see it.</p>
    <h3>Why does the tier of a motion sometimes jump after I challenge?</h3><p>The inclusive re-read found extra articles the motion effectively touches. That is the ratchet: the threshold rises, and the motion must still meet it at <code>finalize</code>.</p>
    <h3>Where is my money?</h3><p>Bonds, bounties and grants are credited to your claimable balance. Press <i>Withdraw</i> on the Assembly page; the transfer lands once the withdraw transaction is finalized.</p>` },

  { id: 'glossary', title: 'Glossary', html: () => tbl(['Term', 'Meaning'], [['Assembly', 'the set of members, treasury and charter held by the contract'], ['Charter', 'the list of tiered articles'], ['Tier', 'entrenchment level 1–4 (ordinary → foundational)'], ['Floor', 'the single motion currently being processed (“floor lock”)'], ['Bond', 'exact deposit attached to filing a motion or a challenge'], ['Roster', 'members frozen into a motion when it is filed'], ['Touch', 'a motion would amend, repeal, suspend, override or contradict an article'], ['UNDETERMINED', 'validators did not agree exactly; no state change'], ['Pull payment', 'credit now, <code>withdraw</code> later']]) },

  { id: 'contract', title: 'Contract & links', html: () => `
    ${tbl(['', ''], [['Contract address', `<code>${CONTRACT_ADDRESS}</code> <button class="copy" id="doc-copy">⧉</button>`], ['Explorer', `<a href="${esc(explorerAddress(CONTRACT_ADDRESS))}" target="_blank" rel="noopener">open ↗</a>`], ['Network', `${CHAIN.name} · chain ${CHAIN.id} · RPC <code>${CHAIN.rpc}</code>`], ['Repository', `<a href="${LINKS.github}" target="_blank" rel="noopener">${LINKS.github}</a>`], ['Author on X', `<a href="${LINKS.x}" target="_blank" rel="noopener">${LINKS.xHandle}</a>`], ['GenLayer', `<a href="${LINKS.genlayer}" target="_blank" rel="noopener">genlayer.com</a> · <a href="${LINKS.genlayerDocs}" target="_blank" rel="noopener">docs</a>`]])}` },
];

export default function init() {
  $('#toc').innerHTML = `<input type="search" id="toc-q" placeholder="Search the docs…" aria-label="Search the docs"><nav id="toc-nav">${SECTIONS.map((s) => `<a href="#${s.id}" data-id="${s.id}">${s.title}</a>`).join('')}</nav>`;
  $('#doc').innerHTML = SECTIONS.map((s) => `<section id="${s.id}"><h2>${s.title}</h2>${s.html()}</section>`).join('');
  $$('#doc pre.code').forEach((pre) => pre.querySelector('.copy-code').addEventListener('click', async (e) => { await copyText(pre.querySelector('code').textContent); e.target.textContent = 'Copied ✓'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1500); }));
  $('#doc-copy')?.addEventListener('click', async () => { await copyText(CONTRACT_ADDRESS); });

  const links = $$('#toc-nav a');
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { links.forEach((l) => l.classList.toggle('on', l.dataset.id === e.target.id)); } }), { rootMargin: '-20% 0px -70% 0px' });
  $$('#doc section').forEach((s) => io.observe(s));

  $('#toc-q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('#doc section').forEach((s) => { const hit = !q || s.textContent.toLowerCase().includes(q); s.style.display = hit ? '' : 'none'; $(`#toc-nav a[data-id="${s.id}"]`).style.display = hit ? '' : 'none'; });
  });
}
