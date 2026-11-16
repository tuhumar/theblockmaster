# TheBlockMaster

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](./LICENSE)
[![Online](https://img.shields.io/badge/use-online-2ea44f.svg)](https://tuhumar.github.io/theblockmaster/)
[![Repo](https://img.shields.io/badge/github-tuhumar%2Ftheblockmaster-181717.svg)](https://github.com/tuhumar/theblockmaster)

**ECC research workspace** that runs entirely in your browser.

Inspect private keys, public keys, addresses, HD wallets, hashes, and elliptic-curve trails — **without a backend**. Private material never leaves the tab.

| | |
|---|---|
| **Use online** | https://tuhumar.github.io/theblockmaster/ |
| **Source** | https://github.com/tuhumar/theblockmaster |
| **In-app docs** | `#docs` → tabs **Use online** · **Run local** |
| **License** | [GPL-3.0](./LICENSE) |

> Educational / research tool. **Not a wallet.** No AI claim to break ECDLP.

---

## Quick start

### Use online

Open the official static host:

**https://tuhumar.github.io/theblockmaster/**

Same app as local. Deep links (`#lab/simple`, `#bip39`, `#docs`, …) work. Crypto still runs only on your machine — the host serves files, nothing else.

### Run local

```bash
git clone https://github.com/tuhumar/theblockmaster.git
cd theblockmaster
python3 -m http.server 8770 --bind 127.0.0.1
```

Then open **http://127.0.0.1:8770/**

- ES modules need HTTP — do **not** use `file://`
- Any static server works (`npx serve`, Caddy, nginx, …)
- Preferred local port in this project: **8770**

---

## What you get

| Tab | Hash | What it does |
|---|---|---|
| **Home** | `#home` | Smart search — detects type and opens the right surface |
| **EQIR Lab** | `#lab/simple` · `#lab/btc` · `#lab/eth` | secp256k1 lab + derived BTC / ETH·BSC |
| **BIP39** | `#bip39` | Mnemonic → seed → HD addresses |
| **BIP32** | `#bip32` | xprv/xpub **or** passphrase → derivation |
| **Brainwallet** | `#brainwallet` | Passphrase → SHA-256 → key *(lab only)* |
| **Calculators** | `#calculators` | SHA / HASH160 / Keccak / Base58 / BigInt |
| **XMR** | `#xmr` | Monero ed25519 spend / view / address / scalar |
| **Docs** | `#docs` | Full reference + agent bridge |

Light / dark theme is persisted in `localStorage`.

### Home search routing

Paste almost anything on Home and press Search:

| You paste | You land on |
|---|---|
| Priv hex / WIF | EQIR Simple → derive BTC + ETH/BSC |
| Pubkey `02` / `03` / `04` | EQIR Advanced |
| BTC or `0x` ETH address | EQIR Simple (correct chain) |
| 12–24 word mnemonic | BIP39 |
| `xprv` / `xpub` / `ypub` / … | BIP32 |
| Monero address | XMR → Address decode |
| Free text / vanity phrase | Brainwallet |
| Keywords (`seed`, `calc`, `xmr`, …) | Matching tab |

---

## EQIR Lab

**EQIR** = *ECC & Quantum-Inspired Research* — the main lab tab.

Shared **STATE** across modules:

**Curve · Scalar · Reverse · Kangaroo · XOR · QI Walk · Compare · STATE export**

| Mode | Hash | UI |
|---|---|---|
| **Simple** | `#lab/simple` | Priv → pub + **BTC and ETH/BSC together** (no research chrome) |
| **Advanced** | `#lab/btc` · `#lab/eth` | Full Double-and-Add chain, modules, sidebars, tools |

Derived formats:

- **BTC** — WIF, hash160, P2PKH / P2SH-P2WPKH / P2WPKH / Taproot  
- **ETH / BSC** — same secp256k1 key as `0x` (optional explorer links)

Research framing (hypothesis, engines, STATE contract): **[FORK.md](./FORK.md)**  
Longer investigation plan: **[ROADMAP.md](./ROADMAP.md)**

---

## Agent bridge

For Cursor Agent, Playwright, CDP, or any same-origin automation:

```js
TheBlockMaster.getSnapshot()
TheBlockMaster.getSnapshot({ includeSecrets: false })
TheBlockMaster.publish()          // localStorage["tbm-shared-state"]
TheBlockMaster.goto("lab", { chain: "btc" })
TheBlockMaster.setPriv("1")
```

Also: `BroadcastChannel`, `CustomEvent("tbm:state")`, and `postMessage`.  
Full protocol → in-app **Docs → AI agents** (`#doc-agents`).

---

## Stack

- Vanilla **HTML / CSS / ES modules** — no bundler, no build step
- secp256k1 BigInt math (EQIR)
- BIP39 / BIP32 (Ian Coleman lineage, MIT)
- Monero ed25519 via noble-ed25519 (MIT)

---

## Security & limits

- Crypto is **local**. Optional balance / explorer fetches are the only network calls.
- Brainwallet and low-entropy passphrases are **unsafe for real funds**.
- Kangaroo / QI modules are **small-bit sandboxes**, not puzzle solvers.
- Agent snapshots may contain secrets — strip them before logging.
- No warranty. Not financial advice.

---

## GitHub Pages (maintainers)

Static site — `index.html` at repo root + `.nojekyll`.

1. **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` · folder: **/ (root)**
4. Site: `https://tuhumar.github.io/theblockmaster/`

Collaborators with push can update the code; enabling Pages usually needs **owner/admin**.

---

## License

**GPL-3.0** — see [LICENSE](./LICENSE).

Third-party pieces keep their own notices (Ian Coleman BIP39 MIT, noble-ed25519 MIT, bip32.org public-domain lineage) in UI footers where applicable.

---

## Contributing

Issues and PRs welcome on [github.com/tuhumar/theblockmaster](https://github.com/tuhumar/theblockmaster).

Keep the app **offline-first**. Do not add a backend, accounts, or telemetry.
