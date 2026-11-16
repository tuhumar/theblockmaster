/**
 * Pollard's Kangaroo (lambda) — BigInt + point.js (EQIR).
 * R_i = a_i·G + b_i·Q  (wild starts at Q with a=0,b=1; tame at hi·G with a=hi,b=0)
 */
import { G, addDetailed, scalarMulFast, compress, eq, isInf } from "../core/point.js";
import { emptyState, setKangaroo } from "../core/state.js";
import { bigToHex } from "../core/modular.js";

function isqrt(n) {
  if (n < 0n) throw new Error("isqrt neg");
  if (n < 2n) return n;
  let x0 = n;
  let x1 = (n >> 1n) + 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x1 + n / x1) >> 1n;
  }
  return x0;
}

export function makeJumps(width) {
  const w = BigInt(width);
  const m = isqrt(w);
  const bitLen = m === 0n ? 1 : m.toString(2).length;
  const k = Math.max(4, bitLen);
  const sizes = [];
  for (let i = 0; i < k; i++) sizes.push(1n << BigInt(i));
  const points = sizes.map((s) => scalarMulFast(s, G()));
  return { sizes, points, m };
}

function jumpIdx(Pt, nj) {
  if (isInf(Pt)) return 0;
  return Number(Pt.x % BigInt(nj));
}

function isDp(Pt, dpMod) {
  if (isInf(Pt)) return false;
  return Pt.x % dpMod === 0n;
}

function dpKey(Pt) {
  return compress(Pt);
}

function addPts(A, B) {
  return addDetailed(A, B).point;
}

/**
 * @param {{Q: object, lo: bigint, hi: bigint, maxFactor?: number, trailLimit?: number}} opts
 */
export function kangarooSolve({
  Q,
  lo,
  hi,
  maxFactor = 20,
  trailLimit = 200,
} = {}) {
  if (hi < lo) throw new Error("hi < lo");
  const width = hi - lo + 1n;
  const { sizes, points, m } = makeJumps(width);
  const nj = sizes.length;
  const meanJump =
    sizes.reduce((a, b) => a + b, 0n) / BigInt(Math.max(1, nj));
  const dpMod = m / 2n > 16n ? m / 2n : 16n;
  const maxDist = width * 2n + 8n * m;
  const maxSteps =
    Number((maxDist * BigInt(Math.ceil(maxFactor)) * 1n) / (meanJump * 4n)) +
    1000;

  const trail = [];
  const pushTrail = (herd, Pt, a, b, dist, jIdx) => {
    if (trail.length >= trailLimit) return;
    let st = emptyState({
      x: Pt && !isInf(Pt) ? bigToHex(Pt.x) : "",
      y: Pt && !isInf(Pt) ? bigToHex(Pt.y) : "",
      compressed: isInf(Pt) ? "∞" : compress(Pt),
      prevOp: "kangaroo-jump",
      doubles: 0,
      adds: trail.length,
    });
    st = setKangaroo(st, {
      a: a.toString(10),
      b: b.toString(10),
      herd,
      dist: dist.toString(10),
      jumpIdx: jIdx,
    });
    trail.push(st);
  };

  const tame = new Map(); // compressed → dist
  let P = scalarMulFast(hi, G());
  let dist = 0n;
  let stepsT = 0;
  let adds = 0;

  while (dist <= maxDist && stepsT <= maxSteps) {
    if (isDp(P, dpMod)) tame.set(dpKey(P), dist);
    const j = jumpIdx(P, nj);
    pushTrail("tame", P, hi + dist, 0n, dist, j);
    P = addPts(P, points[j]);
    dist += sizes[j];
    stepsT += 1;
    adds += 1;
  }

  P = Q;
  let distW = 0n;
  let stepsW = 0;
  let found = null;
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  while (distW <= maxDist && stepsW <= maxSteps) {
    const key = dpKey(P);
    if (isDp(P, dpMod) && tame.has(key)) {
      const kCand = hi + tame.get(key) - distW;
      if (kCand >= lo && kCand <= hi) {
        const check = scalarMulFast(kCand, G());
        if (eq(check, Q)) {
          found = kCand;
          pushTrail("wild-hit", P, distW, 1n, distW, jumpIdx(P, nj));
          break;
        }
      }
    }
    const j = jumpIdx(P, nj);
    pushTrail("wild", P, distW, 1n, distW, j);
    P = addPts(P, points[j]);
    distW += sizes[j];
    stepsW += 1;
    adds += 1;
  }

  const t1 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const stats = {
    steps: stepsT + stepsW,
    stepsTame: stepsT,
    stepsWild: stepsW,
    adds,
    doubles: 0,
    jumps: stepsT + stepsW,
    collisions: found != null ? 1 : 0,
    dps: tame.size,
    sqrtWidth: Number(m),
    ms: t1 - t0,
    success: found != null,
    k: found != null ? found.toString(16) : null,
    kDec: found != null ? found.toString(10) : null,
  };
  return { k: found, stats, trail, lo, hi };
}

/** Selftest: random k in [2^{bits-1}, 2^bits-1]. */
export function kangarooSelftest(bits = 16, maxFactor = 30) {
  if (bits < 8 || bits > 28) throw new Error("bits in [8,28] for JS lab");
  const lo = 1n << BigInt(bits - 1);
  const hi = (1n << BigInt(bits)) - 1n;
  const span = hi - lo + 1n;
  const rnd =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? (() => {
          const buf = new Uint8Array(8);
          crypto.getRandomValues(buf);
          let v = 0n;
          for (const b of buf) v = (v << 8n) | BigInt(b);
          return v;
        })()
      : BigInt(Math.floor(Math.random() * 1e15));
  const k = lo + (rnd % span);
  const Q = scalarMulFast(k, G());
  const res = kangarooSolve({ Q, lo, hi, maxFactor });
  return {
    ...res,
    expected: k,
    ok: res.k === k,
    bits,
  };
}
