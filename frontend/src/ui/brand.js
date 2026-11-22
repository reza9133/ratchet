// Ratchet brand pieces: gear path (12 saw-teeth), logo mark and the themed spinners.
export const GEAR_PATH = "M46.00,22.50 L60.01,18.53 A40,40 0 0 1 62.59,19.60 L60.42,25.76 A33.5,33.5 0 0 1 62.75,26.99 L76.86,30.56 A40,40 0 0 1 78.56,32.77 L73.61,37.03 A33.5,33.5 0 0 1 75.01,39.25 L85.45,49.40 A40,40 0 0 1 85.82,52.17 L79.40,53.37 A33.5,33.5 0 0 1 79.50,56.00 L83.47,70.01 A40,40 0 0 1 82.40,72.59 L76.24,70.42 A33.5,33.5 0 0 1 75.01,72.75 L71.44,86.86 A40,40 0 0 1 69.23,88.56 L64.97,83.61 A33.5,33.5 0 0 1 62.75,85.01 L52.60,95.45 A40,40 0 0 1 49.83,95.82 L48.63,89.40 A33.5,33.5 0 0 1 46.00,89.50 L31.99,93.47 A40,40 0 0 1 29.41,92.40 L31.58,86.24 A33.5,33.5 0 0 1 29.25,85.01 L15.14,81.44 A40,40 0 0 1 13.44,79.23 L18.39,74.97 A33.5,33.5 0 0 1 16.99,72.75 L6.55,62.60 A40,40 0 0 1 6.18,59.83 L12.60,58.63 A33.5,33.5 0 0 1 12.50,56.00 L8.53,41.99 A40,40 0 0 1 9.60,39.41 L15.76,41.58 A33.5,33.5 0 0 1 16.99,39.25 L20.56,25.14 A40,40 0 0 1 22.77,23.44 L27.03,28.39 A33.5,33.5 0 0 1 29.25,26.99 L39.40,16.55 A40,40 0 0 1 42.17,16.18 L43.37,22.60 A33.5,33.5 0 0 1 46.00,22.50 Z";

let uid = 0;
export function logoMark(cls = 'rt-mark') {
  const u = 'lm' + (uid += 1);
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><defs>
<linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B38FF"/><stop offset=".55" stop-color="#110FFF"/><stop offset="1" stop-color="#7B2CFF"/></linearGradient>
<linearGradient id="${u}a" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#19E6D4"/><stop offset="1" stop-color="#7DF3FF"/></linearGradient></defs>
<path d="${GEAR_PATH}" fill="url(#${u}g)" stroke="#110FFF" stroke-width="1.4" stroke-linejoin="round"/>
<circle cx="46" cy="56" r="21.5" fill="#fff" fill-opacity=".16"/><circle cx="46" cy="56" r="17" fill="#070707"/>
<path d="M38.5,60.5 L46,49.5 L53.5,60.5" fill="none" stroke="url(#${u}a)" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M38.5,67.5 L46,60 L53.5,67.5" fill="none" stroke="url(#${u}a)" stroke-opacity=".42" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M89,12.5 L71.5,24 L68,29.5 L74.5,32 L88.5,20.5 Z" fill="url(#${u}a)"/><circle cx="89.5" cy="14.5" r="5.4" fill="url(#${u}a)"/><circle cx="89.5" cy="14.5" r="2.1" fill="#070707"/></svg>`;
}

/** The ratchet wheel that clicks one tooth at a time (the main loading spinner). */
export function gearSpinner(size = 84) {
  const u = 'gs' + (uid += 1);
  return `<svg class="spin-gear" style="width:${size}px;height:${size}px" viewBox="0 0 100 100" role="img" aria-label="Loading"><defs>
<linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B38FF"/><stop offset=".55" stop-color="#110FFF"/><stop offset="1" stop-color="#7B2CFF"/></linearGradient>
<linearGradient id="${u}a" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#19E6D4"/><stop offset="1" stop-color="#7DF3FF"/></linearGradient></defs>
<g class="gear-rot"><g transform="translate(4 -6)"><path d="${GEAR_PATH}" fill="url(#${u}g)" stroke="#110FFF" stroke-width="1.4" stroke-linejoin="round"/>
<circle cx="46" cy="56" r="21.5" fill="#fff" fill-opacity=".16"/><circle cx="46" cy="56" r="14" fill="#070707"/></g></g>
<g class="pawl"><path d="M89,12.5 L71.5,24 L68,29.5 L74.5,32 L88.5,20.5 Z" fill="url(#${u}a)"/><circle cx="89.5" cy="14.5" r="5.4" fill="url(#${u}a)"/><circle cx="89.5" cy="14.5" r="2.1" fill="#070707"/></g>
<path d="M42.5,54 L50,45 L57.5,54" transform="translate(0 2)" fill="none" stroke="url(#${u}a)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Five validator nodes agreeing: used while the AI consensus runs. */
export function consensusSpinner() {
  const pts = [0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return [60 + 44 * Math.cos(a), 60 + 44 * Math.sin(a)]; });
  const links = [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]].map(([a, b]) => `<line class="link" x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}"/>`).join('');
  const nodes = pts.map((p, i) => `<circle class="node" style="--i:${i}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="6"/>`).join('');
  return `<svg class="spin-consensus" viewBox="0 0 120 120" role="img" aria-label="Validators reaching consensus"><defs><radialGradient id="cg"><stop offset="0" stop-color="#19E6D4"/><stop offset="1" stop-color="#110FFF"/></radialGradient></defs><circle class="ring" cx="60" cy="60" r="54"/>${links}<circle class="core" cx="60" cy="60" r="13"/>${nodes}</svg>`;
}

export const orbitSpinner = (small = false) => `<span class="spin-orbit${small ? ' sm' : ''}" role="img" aria-label="Loading"><i></i></span>`;
export const loadingBlock = (text = 'Reading the chain…') => `<div class="inline-load">${orbitSpinner()}<span>${text}</span></div>`;
