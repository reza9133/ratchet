// EIP-6963 multi-wallet discovery + EIP-1193 provider handling.
//   * discovers every injected wallet via `eip6963:announceProvider`
//   * real connect / real disconnect (wallet_revokePermissions where supported + local session wipe)
//   * network guard: detects chain, asks the wallet to switch / add GenLayer Studionet
import { CHAIN, DEMO } from './config.js';

const LS_WALLET = 'ratchet.wallet';
const LS_OFF = 'ratchet.disconnected';

const listeners = new Set();
const found = new Map();            // uuid -> { info, provider }
let started = false;
let activeProvider = null;
let bound = null;

export const wallet = {
  state: { status: 'disconnected', account: null, chainId: null, info: null, provider: null, error: '' },
  get wallets() { return [...found.values()]; },
  get onRightChain() { return this.state.chainId === CHAIN.id; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
const emit = () => listeners.forEach((fn) => { try { fn(wallet.state); } catch (e) { console.error(e); } });
const set = (patch) => { Object.assign(wallet.state, patch); emit(); };
const hexToInt = (h) => (h == null ? null : parseInt(h, 16));
const lower = (a) => (a ? a.toLowerCase() : a);

function announce(detail) {
  if (!detail?.info?.uuid || !detail?.provider) return;
  if (found.has(detail.info.uuid)) return;
  found.set(detail.info.uuid, { info: detail.info, provider: detail.provider });
  emit();
}

export function startDiscovery() {
  if (started) return;
  started = true;
  window.addEventListener('eip6963:announceProvider', (e) => announce(e.detail));
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // legacy fallback: a wallet that never learned EIP-6963 still exposes window.ethereum
  setTimeout(() => {
    if (found.size === 0 && window.ethereum && !DEMO) {
      found.set('legacy-injected', {
        info: { uuid: 'legacy-injected', name: 'Browser wallet', rdns: 'legacy.injected',
          icon: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#110FFF"/><path d="M8 12h16v10H8z" fill="#fff"/><circle cx="21" cy="17" r="2" fill="#110FFF"/></svg>') },
        provider: window.ethereum,
      });
      emit();
    }
  }, 700);
}

function unbind() {
  if (activeProvider && bound) {
    const p = activeProvider;
    try { p.removeListener?.('accountsChanged', bound.accounts); p.removeListener?.('chainChanged', bound.chain); p.removeListener?.('disconnect', bound.disc); } catch { /* ignore */ }
  }
  bound = null; activeProvider = null;
}

function bind(provider) {
  unbind();
  activeProvider = provider;
  bound = {
    accounts: (accs) => {
      if (!accs || accs.length === 0) { hardReset(); return; }
      set({ account: lower(accs[0]) });
    },
    chain: (id) => set({ chainId: hexToInt(id) }),
    disc: () => hardReset(),
  };
  provider.on?.('accountsChanged', bound.accounts);
  provider.on?.('chainChanged', bound.chain);
  provider.on?.('disconnect', bound.disc);
}

function hardReset() {
  unbind();
  set({ status: 'disconnected', account: null, chainId: null, info: null, provider: null, error: '' });
}

export async function connect(uuid) {
  const entry = found.get(uuid);
  if (!entry) throw new Error('Wallet not found');
  set({ status: 'connecting', error: '' });
  try {
    const accounts = await entry.provider.request({ method: 'eth_requestAccounts' });
    if (!accounts?.length) throw new Error('The wallet returned no account.');
    const chainId = hexToInt(await entry.provider.request({ method: 'eth_chainId' }));
    bind(entry.provider);
    localStorage.setItem(LS_WALLET, entry.info.rdns || entry.info.uuid);
    localStorage.removeItem(LS_OFF);
    set({ status: 'connected', account: lower(accounts[0]), chainId, info: entry.info, provider: entry.provider, error: '' });
    return wallet.state;
  } catch (e) {
    const rejected = e?.code === 4001 || /rejected|denied/i.test(String(e?.message));
    set({ status: 'disconnected', error: rejected ? 'Connection request rejected.' : String(e?.message ?? e).slice(0, 200) });
    throw e;
  }
}

/** Real disconnect: revoke the site's permission when the wallet supports it, then drop the session. */
export async function disconnect() {
  const p = wallet.state.provider;
  try { await p?.request?.({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch { /* not supported: local reset is enough */ }
  localStorage.removeItem(LS_WALLET);
  localStorage.setItem(LS_OFF, '1');
  hardReset();
}

/** Silent reconnect on page load (no prompt): only if the user did not press Disconnect. */
export async function autoReconnect() {
  if (localStorage.getItem(LS_OFF) === '1') return;
  const want = localStorage.getItem(LS_WALLET);
  if (!want) return;
  await new Promise((r) => setTimeout(r, 900));
  const entry = [...found.values()].find((w) => (w.info.rdns || w.info.uuid) === want);
  if (!entry) return;
  try {
    const accounts = await entry.provider.request({ method: 'eth_accounts' });
    if (!accounts?.length) return;
    const chainId = hexToInt(await entry.provider.request({ method: 'eth_chainId' }));
    bind(entry.provider);
    set({ status: 'connected', account: lower(accounts[0]), chainId, info: entry.info, provider: entry.provider });
  } catch { /* stay disconnected */ }
}

/** Ask the wallet to switch to Studionet, adding the network first when it is unknown. */
export async function switchToStudionet() {
  const p = wallet.state.provider;
  if (!p) throw new Error('Connect a wallet first.');
  const params = {
    chainId: CHAIN.hex, chainName: CHAIN.name, rpcUrls: [CHAIN.rpc],
    nativeCurrency: CHAIN.currency, blockExplorerUrls: [CHAIN.explorer],
  };
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] });
  } catch (e) {
    const unknown = e?.code === 4902 || e?.code === -32603 || /unrecognized chain|not been added|add the chain|unknown chain/i.test(String(e?.message));
    if (!unknown) throw e;
    await p.request({ method: 'wallet_addEthereumChain', params: [params] });
    try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] }); } catch { /* some wallets switch automatically after adding */ }
  }
  const id = hexToInt(await p.request({ method: 'eth_chainId' }));
  set({ chainId: id });
  return id;
}

export const requireMember = (assembly) => !!assembly && !!wallet.state.account &&
  assembly.members.map((m) => m.toLowerCase()).includes(wallet.state.account);
