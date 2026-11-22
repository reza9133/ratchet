// Small UI kit: modal, toast, confirm.
import { esc } from '../lib/format.js';

export function openModal({ title = '', html = '', wide = false, onClose, hideX = false } = {}) {
  const root = document.getElementById('overlay-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-hd"><h3>${esc(title)}</h3>${hideX ? '' : '<button class="modal-x" type="button" aria-label="Close">✕</button>'}</div>
    <div class="modal-bd">${html}</div></div>`;
  root.appendChild(back);
  document.body.style.overflow = 'hidden';
  const api = {
    el: back, body: back.querySelector('.modal-bd'), box: back.querySelector('.modal'),
    setTitle: (t) => { back.querySelector('h3').textContent = t; },
    close() { document.removeEventListener('keydown', onKey); back.remove(); if (!root.children.length) document.body.style.overflow = ''; onClose?.(); },
    locked: false,
  };
  const onKey = (e) => { if (e.key === 'Escape' && !api.locked) api.close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back && !api.locked) api.close(); });
  back.querySelector('.modal-x')?.addEventListener('click', () => { if (!api.locked) api.close(); });
  return api;
}

export function toast({ title, msg = '', kind = 'info', href = '', ttl = 6500 }) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const icon = { ok: '✓', bad: '!', warn: '!', info: 'i' }[kind] || 'i';
  el.innerHTML = `<i>${icon}</i><div><b>${esc(title)}</b><span>${esc(msg)}${href ? ` <a href="${esc(href)}" target="_blank" rel="noopener">View ↗</a>` : ''}</span></div>`;
  host.appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  setTimeout(kill, ttl); el.addEventListener('click', kill);
  return el;
}
