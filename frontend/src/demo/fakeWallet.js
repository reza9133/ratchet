// Fake EIP-1193 wallets that announce themselves through EIP-6963 — demo mode only.
// They behave like a real wallet: connect prompt, chain switching (unknown chain -> 4902 -> add), revoke permissions, events.
import { ACCOUNTS, advance, resetDemo } from './sim.js';

const ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#19E6D4"/><stop offset="1" stop-color="#7B2CFF"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><path d="M9 20l7-9 7 9" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
const ICON2 = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#FF3EA5"/><circle cx="16" cy="16" r="7" fill="#fff"/><circle cx="16" cy="16" r="3" fill="#FF3EA5"/></svg>');

const SK = 'ratchet.fakewallet';
const shared = (() => { try { return { accIdx: 0, connected: false, chainHex: '0x1', added: false, ...JSON.parse(sessionStorage.getItem(SK) || '{}') }; } catch { return { accIdx: 0, connected: false, chainHex: '0x1', added: false }; } })();
const persist = () => { try { sessionStorage.setItem(SK, JSON.stringify(shared)); } catch { /* ignore */ } };
const handlers = new Map();   // event -> Set<fn>
const emit = (evt, payload) => { persist(); (handlers.get(evt) ?? []).forEach((f) => f(payload)); };
export const currentAccount = () => ACCOUNTS[shared.accIdx].address;

function makeProvider() {
  return {
    isDemo: true,
    async request({ method, params = [] }) {
      await new Promise((r) => setTimeout(r, 250));
      switch (method) {
        case 'eth_requestAccounts': shared.connected = true; persist(); return [currentAccount()];
        case 'eth_accounts': return shared.connected ? [currentAccount()] : [];
        case 'eth_chainId': return shared.chainHex;
        case 'net_version': return String(parseInt(shared.chainHex, 16));
        case 'wallet_switchEthereumChain': {
          const id = params[0]?.chainId?.toLowerCase();
          if (id !== '0x1' && !shared.added) { const e = new Error('Unrecognized chain ID. Try adding the chain using wallet_addEthereumChain first.'); e.code = 4902; throw e; }
          shared.chainHex = id; emit('chainChanged', id); return null;
        }
        case 'wallet_addEthereumChain': shared.added = true; persist(); return null;
        case 'wallet_revokePermissions': shared.connected = false; emit('accountsChanged', []); return null;
        default: { const e = new Error(`Demo wallet: unsupported method ${method}`); e.code = 4200; throw e; }
      }
    },
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, new Set()); handlers.get(evt).add(fn); },
    removeListener(evt, fn) { handlers.get(evt)?.delete(fn); },
  };
}

export function installDemoWallets() {
  const p1 = makeProvider(), p2 = makeProvider();
  const list = [
    { info: { uuid: 'demo-wallet-mochi-0001', name: 'Mochi Demo Wallet', icon: ICON, rdns: 'app.ratchet.demo.mochi' }, provider: p1 },
    { info: { uuid: 'demo-wallet-test-0002', name: 'Test Wallet (second)', icon: ICON2, rdns: 'app.ratchet.demo.test' }, provider: p2 },
  ];
  const announce = () => list.forEach((d) => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze(d) })));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();

  window.__demo = {
    accounts: ACCOUNTS,
    setAccount(i) { shared.accIdx = i; if (shared.connected) emit('accountsChanged', [currentAccount()]); },
    setSpeed(n) { sessionStorage.setItem('ratchet.sim.speed', String(n)); },
    advance, reset() { resetDemo(); sessionStorage.removeItem(SK); location.reload(); },
    get chain() { return shared.chainHex; },
  };
}
