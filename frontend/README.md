# RATCHET · frontend

A multi-page dApp for the **RATCHET** intelligent contract on **GenLayer Studionet**.

| | |
|---|---|
| Contract | `0xA0a4fB98Da65a8e43B7b8bccb8431FEebEd0AEEe` (Studionet, chain `61999` / `0xf22f`) |
| Stack | Vite · vanilla JS (no framework) · `genlayer-js` 1.1.8 · three.js · EIP-6963 |
| Pages | Home · Assembly · Charter · Motions (+ detail) · Docs · About |
| Theme | Light (dark hero banners use the supplied artwork) |

## Run it

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/  (relative paths: works from any folder / sub-path)
npm run preview      # serve dist/ on :4173
```

Use another deployment: `VITE_RATCHET_ADDRESS=0x… npm run build`
(the default lives in `src/lib/config.js`, together with the GitHub / X links and the network constants).

## What is wired to the contract

* **Reads** (`gen_call` through genlayer-js): `get_assembly`, `get_charter`, `get_ledger`, `get_motion`, `list_motions`,
  `get_vote`, `get_claimable`, `get_standing`, `quote_threshold`.
* **Writes** (signed by the connected wallet): `file_amendment`, `file_grant`, `file_admission`, `file_expulsion`,
  `withdraw_motion`, `expire_motion`, `classify`, `vote`, `close_vote`, `challenge`, `finalize`, `donate`, `withdraw`.
  Bond-bearing calls attach **exactly** the bond read from `get_assembly().bond`.

## Wallet (EIP-6963)

`src/lib/wallet.js` discovers wallets through `eip6963:announceProvider` / `eip6963:requestProvider`, connects the
chosen provider only, listens to `accountsChanged` / `chainChanged` / `disconnect`, and hands that same provider to
`genlayer-js` for signing. **Disconnect** revokes the permission (`wallet_revokePermissions` when supported) and remembers
not to auto-reconnect. A wrong chain shows a red pill, a banner and a dialog; **Switch network** sends
`wallet_switchEthereumChain` and falls back to `wallet_addEthereumChain` (code 4902).

## Transaction UX

`src/ui/tx.js`: confirm in wallet → submitted (hash) → validators reach consensus → result.
`UNDETERMINED` (validators did not agree exactly) is shown as a safe, retryable outcome; contract reverts are translated
to plain English (`src/lib/receipt.js`).

## RPC friendliness

Studionet allows ~30 requests/min. `src/lib/throttle.js` paces RPC traffic (token bucket), repeats rate-limited reads with
back-off, and never re-sends a transaction blindly. Views are cached for a few seconds (`src/lib/chain.js`).

## Simulation mode (`?demo=1`)

`assembly.html?demo=1` runs the whole UI against an in-browser simulation of the contract (`src/demo/sim.js`) and two fake
EIP-6963 wallets, with a control panel to act as any member and fast-forward the clock. Nothing touches a network.
`?demo=0` returns to the real chain. The demo video (`public/media/demo.mp4`) was recorded in this mode
(`?demo=1&panel=0`). Keyword "clerk" in the simulation stands in for the LLM validators.

## Assets

* `src/assets/hero-bg.webp` – supplied background artwork (hero banner).
* `src/assets/mochi.webp` – the Mochi mascot, cut out from the artwork.
* `src/assets/genlayer-*.svg` – GenLayer logos from the media kit.
* Logo: `src/ui/brand.js` (ratchet wheel + pawl + chevron) and `public/favicon.svg`.
* Demo video: `public/media/demo.mp4` / `demo.webm`, poster `demo-poster.jpg`; chapters in `src/pages/chapters.js`.

## Publish on GitHub Pages (optional)

```yaml
# .github/workflows/frontend-pages.yml
name: frontend-pages
on: { push: { branches: [main] }, workflow_dispatch: {} }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd frontend && npm ci && npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: frontend/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.d.outputs.page_url }}" }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```

> Not audited. Studionet GEN has no monetary value.
