# TheBlockMaster

**ECC research workspace** — inspect keys, addresses, HD paths, and elliptic-curve trails **100% in the browser**. Private keys never leave the tab.

| | |
|---|---|
| **Repo** | [github.com/tuhumar/theblockmaster](https://github.com/tuhumar/theblockmaster) |
| **Use online** | [tuhumar.github.io/theblockmaster](https://tuhumar.github.io/theblockmaster/) |
| **Docs in app** | `#docs` (tabs: **Use online** · **Run local**) |

> No backend. No accounts. No AI claim to break ECDLP. Educational / research only.

---

## Get started

### Use online (official)

Open the GitHub Pages build:

**https://tuhumar.github.io/theblockmaster/**

Deep links work the same as local (`#lab`, `#bip39`, `#docs`, …). Crypto still runs only in your browser — hosting is static files.

### Run local

```bash
git clone https://github.com/tuhumar/theblockmaster.git
cd theblockmaster
python3 -m http.server 8770 --bind 127.0.0.1
```

Open **http://127.0.0.1:8770/**  
ES modules need HTTP — do **not** open `index.html` via `file://`.

Any static server works (`npx serve`, Caddy, nginx, etc.).

---

## Site map

| Tab | Hash | Purpose |
|---|---|---|
| Home | `#home` | Search → route pubkey / priv / address / mnemonic / xprv |
| **EQIR Lab** | `#lab` · `#lab/simple` · `#lab/btc` · `#lab/eth` | secp256k1 Double-and-Add lab + derived BTC / ETH·BSC |
| BIP39 | `#bip39` | Mnemonic · seed · HD addresses |
| BIP32 | `#bip32` | xprv/xpub or passphrase → derivation |
| Brainwallet | `#brainwallet` | Passphrase → SHA-256 → key (lab only) |
| Calculators | `#calculators` | SHA / HASH160 / Keccak / Base58 / BigInt |
| XMR | `#xmr` | Monero ed25519 spend/view/address/scalar |
| Docs | `#docs` | Full in-app reference |

Theme: light / dark toggle (persisted in `localStorage`).

---

## EQIR Lab

Shared **STATE** engine across modules: **Curve · Scalar · Reverse · Kangaroo · XOR · QI Walk · Compare · STATE export**.

| Mode | Hash | What you see |
|---|---|---|
| **Simple** | `#lab/simple` | Priv → pub + BTC **and** ETH/BSC addresses (no chain modules / sidebars) |
| **Advanced** | `#lab/btc` · `#lab/eth` | Full lab: Double-and-Add chain, research modules, tools |

- **BTC** — WIF, hash160, P2PKH / P2SH-P2WPKH / P2WPKH / Taproot  
- **ETH / BSC** — same secp256k1 key as `0x` (+ optional explorer links)

Hypothesis (research, not a product claim): structure of ECC ops + XOR + classical “quantum-inspired” walks may reduce redundant work across Pollard kangaroo trajectories. See [FORK.md](./FORK.md) and [ROADMAP.md](./ROADMAP.md).

---

## GitHub Pages (maintainers)

This repo is static (`index.html` at root). Official host:

1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` (or `gh-pages`) · folder: **/ (root)**
4. Wait for the Actions/Pages deploy; site URL: `https://tuhumar.github.io/theblockmaster/`

A `.nojekyll` file is included so GitHub does not process `_` paths or skip assets.

Optional custom domain: set **Custom domain** in Pages settings and add a `CNAME` file if needed.

---

## Agent bridge

For Cursor Agent / Playwright / CDP:

```js
TheBlockMaster.getSnapshot()
TheBlockMaster.publish()          // → localStorage["tbm-shared-state"]
TheBlockMaster.goto("lab", { chain: "btc" })
TheBlockMaster.setPriv("1")
```

Channels: `localStorage` · `BroadcastChannel` · `tbm:state` · `postMessage`.  
Full protocol: open **Docs → AI agents** (`#doc-agents`).

---

## Security & limits

- Crypto is **local**. Optional balance / explorer fetches are the only network calls.
- Brainwallet and low-entropy passphrases are **unsafe for real funds**.
- Kangaroo / QI modules are **small-bit sandboxes**, not puzzle solvers.
- Agent snapshots can contain secrets — use `getSnapshot({ includeSecrets: false })` when logging.
- Not a wallet. Not financial advice. No warranty.

---

## Stack

- Vanilla HTML / CSS / ES modules (no build step)
- secp256k1 BigInt math (EQIR)
- BIP39 / BIP32 (Ian Coleman lineage, MIT)
- Monero ed25519 via noble-ed25519 (MIT)

---

## License

**GPL-3.0** — see [LICENSE](./LICENSE).

Third-party components keep their own licenses (e.g. Ian Coleman BIP39 lineage MIT, noble-ed25519 MIT); notices remain in UI footers where applicable.

---

## Contributing

Issues and PRs welcome on [github.com/tuhumar/theblockmaster](https://github.com/tuhumar/theblockmaster). Keep the app **offline-first** and avoid shipping backend or telemetry.
