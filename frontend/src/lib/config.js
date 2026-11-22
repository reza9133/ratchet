// ---------------------------------------------------------------------------
// Single place to change the deployment.  The contract address can also be
// overridden at build time:  VITE_RATCHET_ADDRESS=0x... npm run build
// ---------------------------------------------------------------------------
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_RATCHET_ADDRESS || '0xA0a4fB98Da65a8e43B7b8bccb8431FEebEd0AEEe';

export const LINKS = {
  github: 'https://github.com/reza9133/ratchet',
  x: 'https://x.com/amirhp771',
  xHandle: '@amirhp771',
  genlayer: 'https://www.genlayer.com',
  genlayerDocs: 'https://docs.genlayer.com',
  studio: 'https://studio.genlayer.com',
};

// GenLayer Studionet (chain id 61999 = 0xF22F)
export const CHAIN = {
  id: 61999,
  hex: '0xf22f',
  name: 'GenLayer Studio Network',
  short: 'Studionet',
  rpc: 'https://studio.genlayer.com/api',
  explorer: 'https://explorer-studio.genlayer.com',
  currency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
};

export const explorerAddress = (a) => `${CHAIN.explorer}/address/${a}`;
export const explorerTx = (h) => `${CHAIN.explorer}/transactions/${h}`;

// Demo / simulation mode (?demo=1): the whole UI runs against an in-browser simulation of the
// contract and a fake EIP-6963 wallet, so the flow can be explored (and recorded) without gas.
const q = new URLSearchParams(location.search);
if (q.get('demo') === '1') sessionStorage.setItem('ratchet.demo', '1');
if (q.get('demo') === '0') sessionStorage.removeItem('ratchet.demo');
export const DEMO = sessionStorage.getItem('ratchet.demo') === '1';

export const TIERS = {
  1: { name: 'ORDINARY', rule: 'Strict majority', short: '> 1/2' },
  2: { name: 'QUALIFIED', rule: 'Two thirds', short: '≥ 2/3' },
  3: { name: 'ENTRENCHED', rule: 'Four fifths', short: '≥ 4/5' },
  4: { name: 'FOUNDATIONAL', rule: 'Unanimity', short: 'all' },
};
