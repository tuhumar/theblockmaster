# FORK — EQIR lineage & research contract

How **TheBlockMaster / EQIR Lab** came to be, what it is testing, and what it deliberately is **not**.

| | |
|---|---|
| **Product** | [TheBlockMaster](https://github.com/tuhumar/theblockmaster) |
| **Lab tab** | EQIR (*ECC & Quantum-Inspired Research*) |
| **Online** | https://tuhumar.github.io/theblockmaster/#lab |
| **License** | GPL-3.0 |
| **Roadmap** | [ROADMAP.md](./ROADMAP.md) |

---

## Origin

EQIR started as a **local fork** of an ECC Double-and-Add laboratory (2026): same idea — make every scalar-multiplication step **visible** as state transitions — then grew into a full browser workspace (BTC / ETH·BSC derived, BIP39/32, brainwallet, calculators, XMR).

TheBlockMaster is the public English shell around that lab. The research core remains the EQIR tab.

There is **no claim** of continuity with any upstream git history; this document is the lineage note.

---

## Guiding hypothesis

> Can the **structure of ECC operations** + **reversible XOR transforms** + **classical quantum-inspired walks** reduce *redundant work* across Pollard kangaroo trajectories on ordinary hardware?

| Allowed | Forbidden (as product claims) |
|---|---|
| Testable experiments on small bit-widths | “Breaks Bitcoin / ECDLP” |
| Metrics, collisions, trajectory compare | Marketing as a key cracker |
| Exportable STATE for agents / notebooks | Pretending incomplete search = recovered key |

Hardness of ECDLP on secp256k1 is **unchanged**. EQIR is an **exploration layer**, not a solver.

---

## Four engines (one shared STATE)

| Engine | Role |
|---|---|
| **ECC Explorer** | Double, Add, Halving, reconstruction from known indices |
| **Kangaroo Engine** | Trajectories, jumps, distinguished points, intervals |
| **XOR Engine** | Reversible bit/scalar transforms + fingerprints |
| **Quantum-Inspired** | Classical amplitude simulation over kangaroo jumps |

All engines read/write the same **STATE** object so modules stay interoperable.

---

## UI modules (Advanced mode)

1. **Curve** — secp256k1 SPEC fields  
2. **Scalar** — private → public + MSB-first Double-and-Add chain  
3. **Reverse** — half / half(R−G) when indices are known  
4. **Kangaroo** — Pollard λ sandbox (small bits in-browser)  
5. **XOR** — reversible transforms + fingerprint cloud  
6. **QI Walk** — classical walk over jumps (no quantum speedup claim)  
7. **Compare** — side-by-side trajectory metrics  
8. **STATE** — export `eqir-states.json`

**Simple mode** (`#lab/simple`) hides research chrome and shows priv → pub + BTC **and** ETH/BSC addresses together.

---

## Shared STATE contract

```
STATE
 ├── Point          X / Y / compressed
 ├── Scalar         value / bits / bitIndex
 ├── Previous op    double | add | …
 ├── Counters       doubles / adds
 ├── XOR trail[]    reversible transforms
 ├── Kangaroo       { a, b, herd, dist, jumpIdx }
 └── fingerprint    short hash of the slice
```

App-level snapshots for automation live in `localStorage["tbm-shared-state"]` and `window.TheBlockMaster` — see in-app Docs (`#doc-state`, `#doc-agents`).

---

## What V1 already proves useful for

- Teaching / auditing Double-and-Add (every row of the chain)
- Comparing forward vs reverse with **known** bit indices
- Sandboxing kangaroo / XOR / QI ideas on **toy** bit lengths
- Deriving BTC + ETH/BSC formats from one secp256k1 key, 100% local

What it does **not** do: give an asymptotic advantage on full-size secp256k1 ECDLP.

---

## Local ports (dev)

| Service | Port |
|---|---|
| TheBlockMaster / EQIR | `:8770` |
| Older reference ECC lab (if present) | `:8765` |

```bash
python3 -m http.server 8770 --bind 127.0.0.1
```

---

## Related docs

- [README.md](./README.md) — product overview, run online/local, Home search map  
- [ROADMAP.md](./ROADMAP.md) — investigation lines and milestones  
- In-app `#docs` — live reference inside the UI  
