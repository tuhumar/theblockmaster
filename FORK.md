# EQIR Lab — lineage

**Product name:** TheBlockMaster (EQIR Lab tab)  
**Repo:** [github.com/tuhumar/theblockmaster](https://github.com/tuhumar/theblockmaster)  
**License:** GPL-3.0  
**Origin:** evolved from a local ECC Double-and-Add laboratory fork (2026).

## Guiding hypothesis

Can ECC operation structure + reversible XOR transforms + classical
quantum-inspired walks reduce redundant work across Pollard kangaroo
trajectories on classical hardware?

Testable. **No claim** to break known ECDLP hardness.

## Engines (shared STATE)

| Engine | Role |
|---|---|
| ECC Explorer | Double, Add, Halving, reconstruction |
| Kangaroo Engine | Trajectories, jumps, collisions, intervals |
| XOR Engine | Reversible binary transforms + fingerprints |
| Quantum-Inspired | Classical amplitude walks over jumps |

## UI modules

1. Curve Explorer  
2. Scalar Explorer (Double-and-Add)  
3. Reverse Explorer  
4. Kangaroo Lab  
5. XOR Lab  
6. Quantum-Inspired Lab  
7. Trajectory Comparator  

## Shared STATE contract

```
STATE
 ├── Point X / Y / compressed
 ├── Scalar index / bits
 ├── Previous operation
 ├── Double count / Add count
 ├── XOR transformations
 ├── Kangaroo trajectory {a,b, herd}
 └── State fingerprint
```

## Ports (local)

- Reference ECC lab (if present): `:8765`
- TheBlockMaster / EQIR: `:8770`
