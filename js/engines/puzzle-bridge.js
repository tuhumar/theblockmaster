import { bigToHex, hexToBig, mod, modInv } from "../core/modular.js";
import { fAdd, fSub, fMul, fInv } from "../core/field.js";
import { N } from "../core/secp256k1.js";
import {
  G,
  INF,
  isInf,
  decompress,
  compress,
  point,
  neg,
  eq,
  onCurve,
  clonePt,
  scalarMulFast,
} from "../core/point.js";
import { samePt } from "./seq-pub.js";

/** Add/double sem trace (rápido). */
function addFast(P1, P2) {
  if (isInf(P1)) return isInf(P2) ? INF : clonePt(P2);
  if (isInf(P2)) return clonePt(P1);
  if (P1.x === P2.x && fAdd(P1.y, P2.y) === 0n) return INF;
  let lam;
  if (eq(P1, P2)) {
    const numer = fMul(3n, fMul(P1.x, P1.x));
    const denom = fMul(2n, P1.y);
    lam = fMul(numer, fInv(denom));
  } else {
    lam = fMul(fSub(P2.y, P1.y), fInv(fSub(P2.x, P1.x)));
  }
  const x3 = fSub(fSub(fMul(lam, lam), P1.x), P2.x);
  const y3 = fSub(fMul(lam, fSub(P1.x, x3)), P1.y);
  return point(x3, y3);
}

function doubleFast(P) {
  return addFast(P, P);
}

function subFast(P1, P2) {
  return addFast(P1, neg(P2));
}

/**
 * Ponte mínima ka → kb:
 *   u × half (LSB) + v × (2P|2P+G) com bits de s
 */
export function bestBridge(ka, kb) {
  let best = null;
  const maxU = ka === 0n ? 0 : ka.toString(2).length;
  for (let u = 0; u <= maxU; u++) {
    const m = ka >> BigInt(u);
    const maxV = Math.max(kb.toString(2).length + 2, u + 2);
    for (let v = 0; v <= maxV; v++) {
      const base = m << BigInt(v);
      const s = kb - base;
      const lim = 1n << BigInt(v);
      if (s >= 0n && s < lim) {
        const cost = u + v;
        if (!best || cost < best.cost) best = { u, v, s, m, cost };
      }
    }
  }
  if (!best) throw new Error(`no bridge ${ka.toString(16)} → ${kb.toString(16)}`);
  return best;
}

function pushStep(out, Pt, k, op, bit, meta = {}) {
  out.push({
    op,
    bit,
    kHex: bigToHex(k, 0),
    compressed: isInf(Pt) ? "∞" : compress(Pt),
    ...meta,
  });
}

function forwardBits(R, k, v, s) {
  const steps = [];
  let curR = R;
  let curK = k;
  for (let i = v - 1; i >= 0; i--) {
    const bit = Number((s >> BigInt(i)) & 1n);
    const d = doubleFast(curR);
    curR = bit ? addFast(d, G()) : d;
    curK = (curK << 1n) | BigInt(bit);
    steps.push({
      R: curR,
      k: curK,
      op: bit ? "add" : "double",
      bit,
      via: bit ? "2P+G" : "2P",
    });
  }
  return { R: curR, k: curK, steps };
}

/**
 * u reverses LSB de kStart→m: 1× (m·G) + forward barato; emite half na ordem certa.
 * bits LSB de kStart: b0,b1,… — forward desde m com s = kStart - (m<<u) reconstrói.
 */
function reverseSteps(kStart, u) {
  const m = kStart >> BigInt(u);
  const s = kStart - (m << BigInt(u)); // valor dos u bits baixos
  const R0 = m === 0n ? INF : scalarMulFast(m, G());
  // pontos após cada forward bit (do m até kStart)
  const fw = forwardBits(R0, m, u, s);
  // cadeia de pontos: [mG, ..., kStart G]
  const pts = [R0, ...fw.steps.map((st) => st.R)];
  const ks = [m, ...fw.steps.map((st) => st.k)];
  // bits LSB-first usados no reverse: bit i ao descer de ks[i+1]→ks[i]
  const out = [];
  for (let i = pts.length - 1; i >= 1; i--) {
    const bit = Number(ks[i] & 1n);
    out.push({
      R: pts[i - 1],
      k: ks[i - 1],
      op: bit === 1 ? "half1" : "half",
      bit,
    });
  }
  return { steps: out, R: R0, k: m };
}

/**
 * Caminho contínuo ∞ → Q1 → … → Q70 (ops EC reais).
 */
export function buildPuzzlesPath(puzzles) {
  const out = [];
  let R = INF;
  let k = 0n;
  pushStep(out, R, k, "anchor", null, { label: "∞", landmark: true });

  for (let i = 0; i < puzzles.length; i++) {
    const pz = puzzles[i];
    const target = hexToBig(pz.priv);
    const Q = decompress(pz.pub);

    if (i === 0) {
      const vUse = target === 0n ? 0 : target.toString(2).length;
      const fw = forwardBits(R, k, vUse, target);
      for (const st of fw.steps) {
        pushStep(out, st.R, st.k, st.op, st.bit, { via: st.via, bridge: `#0→#1` });
        R = st.R;
        k = st.k;
      }
    } else {
      const prev = hexToBig(puzzles[i - 1].priv);
      const br = bestBridge(prev, target);
      if (br.u > 0) {
        const rev = reverseSteps(k, br.u);
        for (const rv of rev.steps) {
          R = rv.R;
          k = rv.k;
          pushStep(out, R, k, rv.op, rv.bit, {
            bridge: `#${pz.n - 1}→#${pz.n}`,
            phase: "up",
          });
        }
      }
      if (k !== br.m) {
        throw new Error(
          `ponte #${pz.n}: k=${k.toString(16)} ≠ m=${br.m.toString(16)}`
        );
      }
      const fw = forwardBits(R, k, br.v, br.s);
      for (const st of fw.steps) {
        pushStep(out, st.R, st.k, st.op, st.bit, {
          via: st.via,
          bridge: `#${pz.n - 1}→#${pz.n}`,
          phase: "down",
        });
        R = st.R;
        k = st.k;
      }
    }

    if (k !== target) {
      throw new Error(`#${pz.n}: k=${k.toString(16)} ≠ ${target.toString(16)}`);
    }
    if (!samePt(R, Q)) throw new Error(`#${pz.n}: point ≠ pubkey`);

    const last = out[out.length - 1];
    last.landmark = true;
    last.puzzle = pz.n;
    last.label = `#${pz.n}`;
    last.addr = pz.addr;
    last.priv_dec = pz.priv_dec;
    last.x = bigToHex(R.x, 64);
    last.y = bigToHex(R.y, 64);
  }

  return {
    steps: out,
    finalK: bigToHex(k, 0),
    finalPub: compress(R),
    count: out.length,
    landmarks: out.filter((s) => s.landmark).length,
  };
}

export function verifyPath(steps) {
  let R = INF;
  let k = 0n;
  const errors = [];
  for (let i = 1; i < steps.length; i++) {
    const st = steps[i];
    const next = st.compressed === "∞" ? INF : decompress(st.compressed);
    const expectK = hexToBig(st.kHex);
    if (st.op === "double" || st.op === "add") {
      const d = doubleFast(R);
      const got = st.bit === 1 ? addFast(d, G()) : d;
      if (!samePt(got, next)) errors.push({ i, op: st.op, msg: "fwd" });
      R = got;
      k = (k << 1n) | BigInt(st.bit & 1);
    } else if (st.op === "half" || st.op === "half1") {
      // verifica: double(next)=R (bit0) ou double(next)+G=R (bit1)
      const d = doubleFast(next);
      const got = st.bit === 1 ? addFast(d, G()) : d;
      if (!samePt(got, R)) errors.push({ i, op: st.op, msg: "rev" });
      R = next;
      k = k >> 1n;
    } else if (st.op === "anchor" || st.op === "copy") {
      R = next;
      k = expectK;
      continue;
    }
    if (k !== expectK) errors.push({ i, op: st.op, msg: "k" });
  }
  return { ok: errors.length === 0, errors, steps: steps.length };
}
