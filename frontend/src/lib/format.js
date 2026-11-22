export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const shortAddr = (a, l = 6, r = 4) => (a && a.length > l + r + 2 ? `${a.slice(0, l)}…${a.slice(-r)}` : a || '');
export const sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** wei (string | bigint | number) -> "1.2345" GEN (trimmed) */
export function fmtGEN(wei, maxDp = 6) {
  let v;
  try { v = BigInt(wei ?? 0); } catch { v = 0n; }
  const neg = v < 0n; if (neg) v = -v;
  const base = 10n ** 18n;
  const whole = v / base;
  let frac = (v % base).toString().padStart(18, '0').slice(0, maxDp).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? '.' + frac : ''}`;
}

/** "0.004" -> 4000000000000000n ; returns null when invalid */
export function parseGEN(text) {
  const t = String(text ?? '').trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  if (f.length > 18) return null;
  return BigInt(w || '0') * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18));
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); return true; } catch { return false; } finally { ta.remove(); }
  }
}

export const utf8Len = (s) => new TextEncoder().encode(s).length;
export const nowSec = () => Math.floor(Date.now() / 1000);

/** same math as the contract's threshold_votes() */
export function thresholdVotes(tier, n) {
  n = Number(n); tier = Number(tier);
  if (tier === 1) return Math.floor(n / 2) + 1;
  if (tier === 2) return Math.floor((2 * n + 2) / 3);
  if (tier === 3) return Math.floor((4 * n + 4) / 5);
  return n;
}

/** deterministic gradient avatar for an address */
export function avatar(addr, size = 28) {
  const h = parseInt((addr || '0x0').slice(2, 10) || '0', 16);
  const a = h % 360, b = (h >> 8) % 360;
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:conic-gradient(from ${a}deg,hsl(${a} 90% 60%),hsl(${b} 90% 55%),hsl(${(a + b) % 360} 90% 65%),hsl(${a} 90% 60%))"></span>`;
}
