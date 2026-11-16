/**
 * Quantum-Inspired walk — simulação clássica de amplitudes sobre saltos Kangaroo.
 * NÃO implica vantagem quântica; só estrutura de interferência / seleção.
 */
import { makeJumps } from "./kangaroo.js";
import { G, addDetailed, scalarMulFast, compress, isInf } from "../core/point.js";
import { emptyState, setKangaroo } from "../core/state.js";
import { bigToHex } from "../core/modular.js";

function addPts(A, B) {
  return addDetailed(A, B).point;
}

function jumpIdx(Pt, nj) {
  if (isInf(Pt)) return 0;
  return Number(Pt.x % BigInt(nj));
}

/**
 * Classical walk with complex amplitudes on jump graph.
 * At each step: amplitude spreads to jump destinations with phase e^{i·θ·j}.
 * Measurement: pick destination with |amp|².
 *
 * @returns {{path: object[], measured: number[], entropy: number, ms: number}}
 */
export function qiWalk({
  startPoint,
  width,
  steps = 32,
  phaseScale = 0.35,
  seed = 1,
} = {}) {
  const w = BigInt(width);
  const { sizes, points } = makeJumps(w);
  const nj = sizes.length;
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  // RNG (mulberry32)
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let P = startPoint;
  let dist = 0n;
  const path = [];
  const measured = [];

  // amplitudes over jump index
  let amp = Array.from({ length: nj }, () => ({ re: 1 / Math.sqrt(nj), im: 0 }));

  for (let step = 0; step < steps; step++) {
    // unitary-ish phase kick based on current point
    const xMod = isInf(P) ? 0 : Number(P.x % 10007n);
    const nextAmp = amp.map((a, j) => {
      const theta = phaseScale * (xMod + j * 1.618);
      const c = Math.cos(theta);
      const sn = Math.sin(theta);
      return {
        re: a.re * c - a.im * sn,
        im: a.re * sn + a.im * c,
      };
    });
    // renormalize
    let norm2 = nextAmp.reduce((s, a) => s + a.re * a.re + a.im * a.im, 0);
    if (norm2 < 1e-15) {
      amp = Array.from({ length: nj }, () => ({
        re: 1 / Math.sqrt(nj),
        im: 0,
      }));
    } else {
      const inv = 1 / Math.sqrt(norm2);
      amp = nextAmp.map((a) => ({ re: a.re * inv, im: a.im * inv }));
    }

    // interference bias: mix with deterministic kangaroo jump
    const det = jumpIdx(P, nj);
    const probs = amp.map((a, j) => {
      const p = a.re * a.re + a.im * a.im;
      return j === det ? p * 1.15 : p;
    });
    const sumP = probs.reduce((a, b) => a + b, 0) || 1;
    let r = rnd() * sumP;
    let choice = 0;
    for (let j = 0; j < nj; j++) {
      r -= probs[j];
      if (r <= 0) {
        choice = j;
        break;
      }
    }
    measured.push(choice);

    P = addPts(P, points[choice]);
    dist += sizes[choice];

    let st = emptyState({
      x: isInf(P) ? "" : bigToHex(P.x),
      y: isInf(P) ? "" : bigToHex(P.y),
      compressed: isInf(P) ? "∞" : compress(P),
      prevOp: "qi-walk",
      adds: step + 1,
    });
    st = setKangaroo(st, {
      a: dist.toString(10),
      b: "0",
      herd: "qi",
      dist: dist.toString(10),
      jumpIdx: choice,
    });
    // attach amplitude snapshot (compact)
    st.notes = amp
      .map((a, j) => `j${j}=(${a.re.toFixed(3)},${a.im.toFixed(3)})`)
      .join(" ");
    path.push(st);
  }

  // Shannon entropy of measured jump distribution
  const counts = new Array(nj).fill(0);
  for (const j of measured) counts[j]++;
  let entropy = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / measured.length;
    entropy -= p * Math.log2(p);
  }

  const t1 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    path,
    measured,
    entropy,
    nj,
    steps,
    ms: t1 - t0,
    finalCompressed: path.length ? path[path.length - 1].compressed : "",
  };
}

/** Compare QI selection vs pure deterministic kangaroo jump sequence length. */
export function qiVsDeterministic({ startPoint, width, steps = 32 }) {
  const w = BigInt(width);
  const { sizes, points } = makeJumps(w);
  const nj = sizes.length;

  let P = startPoint;
  let distDet = 0n;
  for (let i = 0; i < steps; i++) {
    const j = jumpIdx(P, nj);
    P = addPts(P, points[j]);
    distDet += sizes[j];
  }

  const qi = qiWalk({ startPoint, width, steps, seed: 42 });
  const distQi = qi.path.length
    ? BigInt(qi.path[qi.path.length - 1].kangaroo?.dist || "0")
    : 0n;

  return {
    qi,
    distDet: distDet.toString(10),
    distQi: distQi.toString(10),
    entropy: qi.entropy,
    sameEndpoint:
      compress(P) === (qi.finalCompressed || ""),
  };
}
