/**
 * Trajectory Comparator — vários runners no mesmo [lo,hi].
 */
import { kangarooSolve } from "./kangaroo.js";
import { G, scalarMulFast } from "../core/point.js";
import { xorScalars } from "./xor-lab.js";
import { qiWalk } from "./qi-walk.js";

function memApprox(trail) {
  // rough: each state ~ 400 bytes JSON
  return (trail?.length || 0) * 400;
}

/**
 * Run classic kangaroo.
 */
function runClassic(Q, lo, hi, maxFactor) {
  const r = kangarooSolve({ Q, lo, hi, maxFactor, trailLimit: 80 });
  return {
    name: "kangaroo-classic",
    success: r.stats.success,
    k: r.stats.k,
    opsEcc: r.stats.steps,
    doubles: r.stats.doubles,
    adds: r.stats.adds,
    jumps: r.stats.jumps,
    collisions: r.stats.collisions,
    repeatedStates: 0,
    memoryBytes: memApprox(r.trail),
    ms: r.stats.ms,
    notes: `dps=${r.stats.dps}`,
  };
}

/**
 * Adaptive: bump maxFactor if first try fails (still same algorithm family).
 */
function runAdaptive(Q, lo, hi) {
  let r = kangarooSolve({ Q, lo, hi, maxFactor: 12, trailLimit: 60 });
  if (!r.stats.success) {
    const r2 = kangarooSolve({ Q, lo, hi, maxFactor: 40, trailLimit: 60 });
    r2.stats.ms += r.stats.ms;
    r2.stats.steps += r.stats.steps;
    r = r2;
  }
  return {
    name: "kangaroo-adaptive",
    success: r.stats.success,
    k: r.stats.k,
    opsEcc: r.stats.steps,
    doubles: r.stats.doubles,
    adds: r.stats.adds,
    jumps: r.stats.jumps,
    collisions: r.stats.collisions,
    repeatedStates: 0,
    memoryBytes: memApprox(r.trail),
    ms: r.stats.ms,
    notes: "retry with higher budget if miss",
  };
}

/**
 * XOR-preprocessed interval map: hunt k' = k ⊕ mask then undo.
 * Only works if we XOR the scalar space consistently — here we transform
 * the secret by hunting Q' = (k⊕m)G is NOT equal to Q⊕something on curve.
 * So instead: XOR is applied to DP keys (fingerprint of compressed) for
 * table lookup obfuscation — same kangaroo, XOR'd DP map keys.
 */
function runXorDp(Q, lo, hi, maskHex = "a5a5") {
  // Reuse classic solve; annotate XOR mask used on DP keys conceptually
  // by post-hashing trail fingerprints with xorScalars on fingerprint hex.
  const r = kangarooSolve({ Q, lo, hi, maxFactor: 20, trailLimit: 80 });
  let collisions = 0;
  const seen = new Map();
  for (const st of r.trail || []) {
    try {
      const fp = st.fingerprint || st.compressed || "0";
      const x = xorScalars(fp.replace(/[^0-9a-f]/gi, "").slice(0, 16) || "1", maskHex);
      const k = x.after;
      seen.set(k, (seen.get(k) || 0) + 1);
    } catch {
      /* ignore */
    }
  }
  for (const n of seen.values()) if (n > 1) collisions += n - 1;
  return {
    name: "kangaroo-xor-dp",
    success: r.stats.success,
    k: r.stats.k,
    opsEcc: r.stats.steps,
    doubles: r.stats.doubles,
    adds: r.stats.adds,
    jumps: r.stats.jumps,
    collisions: r.stats.collisions,
    repeatedStates: collisions,
    memoryBytes: memApprox(r.trail),
    ms: r.stats.ms,
    notes: `xorMask=${maskHex} fpCollisions=${collisions}`,
  };
}

/**
 * QI-inspired: use qiWalk to pick jump sequence warm-start length, then classic.
 */
function runQiHybrid(Q, lo, hi) {
  const width = hi - lo + 1n;
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const walk = qiWalk({
    startPoint: Q,
    width,
    steps: 24,
    seed: 7,
  });
  const r = kangarooSolve({ Q, lo, hi, maxFactor: 20, trailLimit: 80 });
  const t1 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    name: "kangaroo-qi-hybrid",
    success: r.stats.success,
    k: r.stats.k,
    opsEcc: r.stats.steps + walk.steps,
    doubles: r.stats.doubles,
    adds: r.stats.adds + walk.steps,
    jumps: r.stats.jumps + walk.steps,
    collisions: r.stats.collisions,
    repeatedStates: 0,
    memoryBytes: memApprox(r.trail) + memApprox(walk.path),
    ms: t1 - t0,
    notes: `qiEntropy=${walk.entropy.toFixed(3)}`,
  };
}

/**
 * Experimental combo: adaptive + xor annotation.
 */
function runExperimental(Q, lo, hi) {
  const a = runAdaptive(Q, lo, hi);
  const x = runXorDp(Q, lo, hi, "c3c3");
  return {
    name: "experimental-combo",
    success: a.success || x.success,
    k: a.k || x.k,
    opsEcc: a.opsEcc + x.opsEcc,
    doubles: a.doubles + x.doubles,
    adds: a.adds + x.adds,
    jumps: a.jumps + x.jumps,
    collisions: a.collisions + x.collisions,
    repeatedStates: x.repeatedStates,
    memoryBytes: a.memoryBytes + x.memoryBytes,
    ms: a.ms + x.ms,
    notes: "adaptive + xor-dp sequential",
  };
}

/**
 * @param {{bits?: number, mask?: string}} opts
 */
export function compareTrajectories(opts = {}) {
  const bits = opts.bits || 14;
  const lo = 1n << BigInt(bits - 1);
  const hi = (1n << BigInt(bits)) - 1n;
  const span = hi - lo + 1n;
  const buf = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < 8; i++) buf[i] = (Math.random() * 256) | 0;
  }
  let rnd = 0n;
  for (const b of buf) rnd = (rnd << 8n) | BigInt(b);
  const k = lo + (rnd % span);
  const Q = scalarMulFast(k, G());

  const runners = [
    runClassic,
    runAdaptive,
    (Q, lo, hi) => runXorDp(Q, lo, hi, opts.mask || "a5a5"),
    runQiHybrid,
    runExperimental,
  ];

  const results = [];
  for (const run of runners) {
    try {
      results.push(run(Q, lo, hi));
    } catch (e) {
      results.push({
        name: run.name || "runner",
        success: false,
        error: e.message || String(e),
        opsEcc: 0,
        doubles: 0,
        adds: 0,
        jumps: 0,
        collisions: 0,
        repeatedStates: 0,
        memoryBytes: 0,
        ms: 0,
      });
    }
  }

  return {
    bits,
    lo: lo.toString(16),
    hi: hi.toString(16),
    expected: k.toString(16),
    results,
  };
}

export function metricsTable(compareResult) {
  const header = [
    "name",
    "success",
    "opsEcc",
    "doubles",
    "adds",
    "jumps",
    "collisions",
    "repeatedStates",
    "memoryBytes",
    "ms",
  ];
  const rows = (compareResult.results || []).map((r) =>
    header.map((h) => (h === "success" ? (r.success ? "yes" : "no") : r[h] ?? ""))
  );
  return { header, rows, expected: compareResult.expected, bits: compareResult.bits };
}
