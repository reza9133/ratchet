// Header wallet button, EIP-6963 wallet picker, account menu, network pill + "switch network" banner/modal.
import { wallet, connect, disconnect, switchToStudionet, startDiscovery, autoReconnect } from '../lib/wallet.js';
import { CHAIN, CONTRACT_ADDRESS, explorerAddress, DEMO } from '../lib/config.js';
import { esc, shortAddr, avatar, fmtGEN, copyText, $ } from '../lib/format.js';
import { api } from '../lib/chain.js';
import { openModal, toast } from './kit.js';
import { orbitSpinner } from './brand.js';

let menuOpen = false;
let autoPrompted = false;

const walletIcon = (w) => `<img alt="" src="${esc(w.info.icon)}">`;

export function openWalletModal() {
  const m = openModal({ title: 'Connect a wallet', html: '<div id="wl"></div>' });
  const paint = () => {
    const list = wallet.wallets;
    const el = m.body.querySelector('#wl'); if (!el) return;
    if (!list.length) {
      el.innerHTML = `<div class="wallet-empty"><img src="./assets/mochi.webp" alt="Mochi"><h4 style="margin:0 0 6px">No wallet detected</h4>
        <p class="muted" style="font-size:.92rem">Install a browser wallet such as <a href="https://metamask.io/download/" target="_blank" rel="noopener">MetaMask</a> or <a href="https://rabby.io/" target="_blank" rel="noopener">Rabby</a>, then reload this page. Wallets announce themselves through <b>EIP-6963</b>, so every installed wallet will show up here.</p></div>`;
      return;
    }
    el.innerHTML = `<p class="muted" style="margin:0 0 4px;font-size:.92rem">${list.length} wallet${list.length > 1 ? 's' : ''} found via <b>EIP-6963</b>. Pick the one you want to use.</p>
      <div class="wallet-list">${list.map((w) => `<button class="wallet-item" data-id="${esc(w.info.uuid)}">${walletIcon(w)}<span><b>${esc(w.info.name)}</b><small>${esc(w.info.rdns || '')}</small></span><span class="go">Connect →</span></button>`).join('')}</div>
      <div class="note" id="wl-err" style="display:none"></div>
      <p class="muted" style="font-size:.8rem;margin:12px 0 0">Ratchet never asks for your keys. Signing happens inside your wallet.</p>`;
    el.querySelectorAll('.wallet-item').forEach((b) => b.addEventListener('click', async () => {
      b.innerHTML = `${orbitSpinner(true)}<span><b>Waiting for your wallet…</b><small>Approve the connection request</small></span>`;
      m.locked = true;
      try { await connect(b.dataset.id); m.locked = false; m.close(); toast({ title: 'Wallet connected', msg: shortAddr(wallet.state.account), kind: 'ok' }); }
      catch (e) { m.locked = false; paint(); const er = el.querySelector('#wl-err'); if (er) { er.style.display = 'block'; er.classList.add('bad'); er.textContent = wallet.state.error || 'Could not connect.'; } }
    }));
  };
  paint();
  const unsub = wallet.subscribe(paint);
  const orig = m.close; m.close = () => { unsub(); orig(); };
  return m;
}

export function openNetworkModal() {
  const m = openModal({
    title: 'Switch to GenLayer Studionet',
    html: `<p class="muted" style="margin-top:0">Your wallet is on <b>chain ${wallet.state.chainId ?? '?'}</b>. Ratchet lives on <b>${CHAIN.name}</b>, so transactions must be signed there.</p>
      <dl class="kv"><dt>Network</dt><dd>${CHAIN.name}</dd><dt>Chain ID</dt><dd>${CHAIN.id} (${CHAIN.hex})</dd><dt>RPC</dt><dd>${CHAIN.rpc}</dd><dt>Currency</dt><dd>${CHAIN.currency.symbol}</dd></dl>
      <div class="note">If the network is not in your wallet yet, we will ask your wallet to add it first, then switch.</div>
      <div id="net-err" class="err-text" style="margin-top:10px"></div>
      <div class="modal-ft"><button class="btn btn-ghost" id="net-later">Not now</button><button class="btn btn-primary" id="net-go">Switch network</button></div>`,
  });
  m.body.querySelector('#net-later').addEventListener('click', () => m.close());
  m.body.querySelector('#net-go').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.innerHTML = '<span class="btn-spin"></span> Check your wallet…'; b.disabled = true;
    try { await switchToStudionet(); m.close(); toast({ title: 'Network switched', msg: `Connected to ${CHAIN.short}`, kind: 'ok' }); }
    catch (err) {
      b.disabled = false; b.textContent = 'Switch network';
      m.body.querySelector('#net-err').textContent = err?.code === 4001 ? 'You rejected the request in your wallet.' : (err?.message || 'The wallet could not switch networks.').slice(0, 160);
    }
  });
  return m;
}

function accountMenu(anchor) {
  const s = wallet.state;
  const el = document.createElement('div'); el.className = 'menu'; el.id = 'acct-menu';
  const right = wallet.onRightChain;
  el.innerHTML = `
    <div class="who">${avatar(s.account, 42)}<div><b>${esc(shortAddr(s.account, 8, 6))}</b><small>${esc(s.info?.name || 'Wallet')}</small></div>
      <button class="copy" id="m-copy" title="Copy address" style="margin-left:auto">⧉</button></div>
    <div class="row"><span class="muted">Balance</span><b id="m-bal" class="mono">…</b></div>
    <div class="row"><span class="muted">Network</span>${right ? `<span class="chip"><span class="dot"></span>${CHAIN.short}</span>` : '<span class="chip" style="background:var(--err-bg);color:var(--err)">Wrong network</span>'}</div>
    <div class="acts">
      ${right ? '' : '<button class="btn btn-primary btn-sm" id="m-switch">Switch to Studionet</button>'}
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(explorerAddress(s.account))}">View on explorer ↗</a>
      <button class="btn btn-ghost btn-sm" id="m-change">Use another wallet</button>
      <button class="btn btn-sm btn-danger" id="m-disc">Disconnect</button>
    </div>`;
  anchor.appendChild(el);
  api.balance(s.account).then((b) => { const x = $('#m-bal', el); if (x) x.textContent = `${fmtGEN(b, 4)} GEN`; }).catch(() => { const x = $('#m-bal', el); if (x) x.textContent = '—'; });
  $('#m-copy', el).addEventListener('click', async () => { await copyText(s.account); toast({ title: 'Address copied', msg: s.account, kind: 'ok', ttl: 2500 }); });
  $('#m-switch', el)?.addEventListener('click', () => { closeMenu(); openNetworkModal(); });
  $('#m-change', el).addEventListener('click', () => { closeMenu(); openWalletModal(); });
  $('#m-disc', el).addEventListener('click', async () => { closeMenu(); await disconnect(); toast({ title: 'Disconnected', msg: 'Your wallet is no longer connected to this site.', kind: 'info' }); });
}
function closeMenu() { document.getElementById('acct-menu')?.remove(); menuOpen = false; }

function renderHeaderRight() {
  const s = wallet.state;
  const host = $('#hdr-right'); if (!host) return;
  const pillCls = s.status !== 'connected' ? 'off' : wallet.onRightChain ? 'ok' : 'bad';
  const pillTxt = s.status !== 'connected' ? 'Not connected' : wallet.onRightChain ? CHAIN.short : 'Wrong network';
  const btn = s.status === 'connected'
    ? `<button class="btn btn-ghost btn-sm wallet-btn connected" id="wallet-btn">${avatar(s.account, 22)}<span class="lab mono">${esc(shortAddr(s.account, 6, 4))}</span><span aria-hidden="true">▾</span></button>`
    : s.status === 'connecting'
      ? '<button class="btn btn-primary btn-sm wallet-btn" disabled><span class="btn-spin"></span><span class="lab">Connecting…</span></button>'
      : `<button class="btn btn-primary btn-sm wallet-btn" id="wallet-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="3"/><path d="M16 13h3M2 10h20M6 6l9-3 2 3"/></svg><span class="lab">Connect wallet</span></button>`;
  host.innerHTML = `<span class="net-pill ${pillCls}" id="net-pill" title="${pillCls === 'bad' ? 'Click to switch network' : ''}"><span class="dot"></span><span class="t">${pillTxt}</span></span><span class="menu-anchor" id="menu-anchor">${btn}</span>`;
  $('#net-pill').addEventListener('click', () => { if (pillCls === 'bad') openNetworkModal(); });
  $('#wallet-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wallet.state.status !== 'connected') { openWalletModal(); return; }
    if (menuOpen) { closeMenu(); return; }
    menuOpen = true; accountMenu($('#menu-anchor'));
  });
}

function renderBanner() {
  const s = wallet.state; const el = $('#net-banner'); if (!el) return;
  const bad = s.status === 'connected' && !wallet.onRightChain;
  el.classList.toggle('show', bad);
  document.body.classList.toggle('net-bad', bad);
  el.innerHTML = bad ? `<div class="net-banner-in"><div class="container"><span>⚠️ <b>Wrong network.</b> Your wallet is on chain ${s.chainId}. Switch to <b>${CHAIN.name}</b> (chain ${CHAIN.id}) to use Ratchet.</span><span class="sp"></span><button class="btn btn-primary btn-sm" id="banner-switch">Switch network</button></div></div>` : '';
  $('#banner-switch')?.addEventListener('click', openNetworkModal);
}

export function initWalletUI() {
  startDiscovery();
  let lastKey = '';
  wallet.subscribe((s) => {
    renderHeaderRight(); renderBanner();
    const key = `${s.status}|${s.account}|${s.chainId}`;
    if (key !== lastKey) { lastKey = key; window.dispatchEvent(new CustomEvent('ratchet:wallet')); }
    if (s.status === 'connected' && !wallet.onRightChain && !autoPrompted) { autoPrompted = true; setTimeout(openNetworkModal, 350); }
    if (s.status !== 'connected') autoPrompted = false;
  });
  document.addEventListener('click', (e) => { if (menuOpen && !e.target.closest('#menu-anchor')) closeMenu(); });
  renderHeaderRight(); renderBanner();
  autoReconnect();
}
