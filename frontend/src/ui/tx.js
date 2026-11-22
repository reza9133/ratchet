// Transaction flow modal: wallet confirmation -> submitted -> validator consensus -> result.
import { send } from '../lib/chain.js';
import { wallet } from '../lib/wallet.js';
import { explorerTx, CONTRACT_ADDRESS } from '../lib/config.js';
import { esc, shortAddr } from '../lib/format.js';
import { openModal, toast } from './kit.js';
import { gearSpinner, consensusSpinner } from './brand.js';
import { openNetworkModal, openWalletModal } from './wallet-ui.js';

const CHECK = `<svg class="check-anim" viewBox="0 0 100 100"><circle cx="50" cy="50" r="41" fill="none" stroke="#00A653" stroke-width="6" stroke-linecap="round"/><path d="M31 52l13 13 25-28" fill="none" stroke="#00A653" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CROSS = `<svg class="check-anim" viewBox="0 0 100 100"><circle cx="50" cy="50" r="41" fill="none" stroke="#E5231F" stroke-width="6"/><path d="M34 34l32 32M66 34L34 66" fill="none" stroke="#E5231F" stroke-width="7" stroke-linecap="round"/></svg>`;

/**
 * Preconditions every write shares. Returns true when the user may proceed.
 */
export function ensureReady() {
  const s = wallet.state;
  if (s.status !== 'connected') { openWalletModal(); return false; }
  if (!wallet.onRightChain) { openNetworkModal(); return false; }
  return true;
}

/**
 * runTx({ title, intro, fn, args, value, ai })  -> Promise<outcome | null>
 */
export function runTx({ title, intro = '', fn, args = [], value = 0n, ai = false }) {
  if (!ensureReady()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const m = openModal({ title, hideX: true, html: '<div id="tx-root"></div>' });
    m.locked = true;
    const root = m.body.querySelector('#tx-root');
    const steps = [
      { k: 'wallet', t: 'Confirm in your wallet', d: `${shortAddr(wallet.state.account)} · ${wallet.state.info?.name || 'wallet'}` },
      { k: 'submitted', t: 'Transaction submitted', d: 'Waiting for the network to pick it up' },
      { k: 'consensus', t: ai ? 'Validators reach consensus' : 'Validators accept the transaction',
        d: ai ? 'Each validator asks the LLM on its own; their answers must match exactly.' : 'Leader proposes, validators confirm.' },
    ];
    let cur = 0, hash = null, status = '';
    const paint = (final = null) => {
      const stage = final ? '' : cur === 0 ? gearSpinner(92) : consensusSpinner();
      root.innerHTML = `
        ${intro ? `<p class="muted" style="margin:0 0 6px">${esc(intro)}</p>` : ''}
        ${final ? `<div class="tx-result">${final.ok ? CHECK : CROSS}<h4>${esc(final.heading)}</h4><p class="muted">${esc(final.msg)}</p></div>`
          : `<div class="tx-stage">${stage}</div>`}
        <ol class="tx-steps">${steps.map((s, i) => {
          const st = final ? (final.ok || i < cur ? 'done' : i === cur ? 'fail' : '') : i < cur ? 'done' : i === cur ? 'active' : '';
          const extra = i === 1 && hash ? `<a href="${esc(explorerTx(hash))}" target="_blank" rel="noopener" class="mono">${esc(shortAddr(hash, 10, 8))} ↗</a>`
            : i === 2 && status && !final ? `status: <span class="mono">${esc(status)}</span>` : esc(s.d);
          return `<li class="${st}"><span class="n">${st === 'done' ? '✓' : st === 'fail' ? '✕' : i + 1}</span><div>${esc(s.t)}<small>${extra}</small></div></li>`;
        }).join('')}</ol>
        <div class="modal-ft" id="tx-ft"></div>`;
    };
    paint();
    send({
      fn, args, value,
      onStage: (stage, info = {}) => {
        if (stage === 'wallet') cur = 0;
        if (stage === 'submitted') { cur = 1; hash = info.hash; }
        if (stage === 'consensus') { cur = 2; hash = info.hash || hash; status = info.status || ''; }
        paint();
      },
    }).then((out) => {
      m.locked = false;
      const ft = () => root.querySelector('#tx-ft');
      if (out.ok) {
        cur = 3;
        paint({ ok: true, heading: 'Done', msg: ai ? 'The validators agreed and the result is on-chain.' : 'Your transaction was accepted.' });
        ft().innerHTML = `${hash ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="${esc(explorerTx(hash))}">View on explorer ↗</a>` : ''}<button class="btn btn-primary" id="tx-close">Close</button>`;
        toast({ title: title, msg: 'Confirmed on-chain.', kind: 'ok' });
        window.dispatchEvent(new CustomEvent('ratchet:refresh'));
      } else {
        const head = out.kind === 'REJECTED' ? 'Request rejected' : out.kind === 'UNDETERMINED' ? 'No exact agreement' : out.kind === 'TIMEOUT' ? 'Still pending' : 'Transaction failed';
        paint({ ok: false, heading: head, msg: out.friendly || out.errorText || 'Something went wrong.' });
        const retry = out.kind === 'UNDETERMINED' || out.kind === 'REJECTED' || out.kind === 'SUBMIT_ERROR';
        ft().innerHTML = `${retry ? '<button class="btn btn-primary" id="tx-retry">Try again</button>' : ''}<button class="btn btn-ghost" id="tx-close">Close</button>`;
        root.querySelector('#tx-retry')?.addEventListener('click', () => { m.close(); runTx({ title, intro, fn, args, value, ai }).then(resolve); });
        if (out.kind !== 'REJECTED') toast({ title: `${title} failed`, msg: out.friendly || out.errorText, kind: 'bad' });
      }
      root.querySelector('#tx-close')?.addEventListener('click', () => { m.close(); resolve(out); });
    });
  });
}
