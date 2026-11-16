import { P, N, A, B, GX, GY } from "./secp256k1.js";
import { fAdd, fSub, fMul, fInv, fSqrt, fMod } from "./field.js";
import { mod, modInv, bigToHex } from "./modular.js";

export const INF = null;

export function isInf(Pt) {
  return Pt === null || Pt === undefined;
}

export function point(x, y) {
  return { x: fMod(x), y: fMod(y) };
}

export function G() {
  return point(GX, GY);
}

export function onCurve(Pt) {
  if (isInf(Pt)) return true;
  const { x, y } = Pt;
  const yy = fMul(y, y);
  const xxx = fAdd(fMul(fMul(x, x), x), B);
  return yy === xxx;
}

export function neg(Pt) {
  if (isInf(Pt)) return INF;
  return point(Pt.x, fSub(0n, Pt.y));
}

export function eq(A, B) {
  if (isInf(A) && isInf(B)) return true;
  if (isInf(A) || isInf(B)) return false;
  return A.x === B.x && A.y === B.y;
}

/**
 * Point add/double with full intermediate trace for the lab UI.
 * Returns { point, trace }.
 */
export function addDetailed(P1, P2) {
  const trace = {
    op: null,
    formula: "",
    why: "",
    P1: clonePt(P1),
    P2: clonePt(P2),
    lambda: null,
    invDenom: null,
    denom: null,
    numer: null,
    x3: null,
    y3: null,
    steps: [],
  };

  if (isInf(P1)) {
    trace.op = "copy";
    trace.formula = "O + P = P";
    trace.why = "first operand is infinity";
    trace.x3 = P2?.x ?? null;
    trace.y3 = P2?.y ?? null;
    trace.steps.push("branch: isInf(P1) → return clone(P2)");
    if (!isInf(P2)) {
      trace.steps.push(`P2.x = ${hex(P2.x)}`);
      trace.steps.push(`P2.y = ${hex(P2.y)}`);
      trace.steps.push(`P2.compressed = ${compress(P2)}`);
    }
    const out = clonePt(P2);
    trace.resultPt = out;
    trace.onCurveOk = onCurve(out);
    return { point: out, trace };
  }
  if (isInf(P2)) {
    trace.op = "copy";
    trace.formula = "P + O = P";
    trace.why = "second operand is infinity";
    trace.x3 = P1.x;
    trace.y3 = P1.y;
    trace.steps.push("branch: isInf(P2) → return clone(P1)");
    trace.steps.push(`P1.x = ${hex(P1.x)}`);
    trace.steps.push(`P1.y = ${hex(P1.y)}`);
    trace.steps.push(`P1.compressed = ${compress(P1)}`);
    const out = clonePt(P1);
    trace.resultPt = out;
    trace.onCurveOk = onCurve(out);
    return { point: out, trace };
  }

  if (P1.x === P2.x && fAdd(P1.y, P2.y) === 0n) {
    trace.op = "inf";
    trace.formula = "P + (−P) = O";
    trace.why = "opposite points (same x, y₁+y₂≡0 mod p)";
    trace.steps.push(`P1.x = P2.x = ${hex(P1.x)}`);
    trace.steps.push(`y₁ + y₂ = ${hex(fAdd(P1.y, P2.y))} ≡ 0 (mod p)`);
    trace.steps.push("result = O");
    trace.resultPt = INF;
    trace.onCurveOk = true;
    return { point: INF, trace };
  }

  let lam, denom, numer;
  if (eq(P1, P2)) {
    trace.op = "double";
    trace.formula =
      "λ = (3x₁²+a)·(2y₁)⁻¹ ;  x₃ = λ²−2x₁ ;  y₃ = λ(x₁−x₃)−y₁   (mod p)";
    trace.why = "P1 = P2 → dobrar (chord = tangent)";
    trace.steps.push(`P1 = P2  x=${hex(P1.x)}`);
    trace.steps.push(`         y=${hex(P1.y)}`);
    trace.steps.push(`a = 0 (secp256k1) ⇒ numer = 3·x₁² + a = 3·x₁²`);
    const x1sq = fMul(P1.x, P1.x);
    numer = fMul(3n, x1sq);
    denom = fMul(2n, P1.y);
    const invD = fInv(denom);
    lam = fMul(numer, invD);
    trace.numer = numer;
    trace.denom = denom;
    trace.invDenom = invD;
    trace.lambda = lam;
    trace.steps.push(`x₁² = ${hex(x1sq)}`);
    trace.steps.push(`numer = 3·x₁² = ${hex(numer)}`);
    trace.steps.push(`denom = 2·y₁ = ${hex(denom)}`);
    trace.steps.push(`denom⁻¹ mod p = ${hex(invD)}`);
    trace.steps.push(`λ = numer·denom⁻¹ = ${hex(lam)}`);
  } else {
    trace.op = "add";
    trace.formula =
      "λ = (y₂−y₁)·(x₂−x₁)⁻¹ ;  x₃ = λ²−x₁−x₂ ;  y₃ = λ(x₁−x₃)−y₁   (mod p)";
    trace.why = "P1 ≠ ±P2 → somar (chord)";
    trace.steps.push(`P1.x = ${hex(P1.x)}`);
    trace.steps.push(`P1.y = ${hex(P1.y)}`);
    trace.steps.push(`P2.x = ${hex(P2.x)}`);
    trace.steps.push(`P2.y = ${hex(P2.y)}`);
    numer = fSub(P2.y, P1.y);
    denom = fSub(P2.x, P1.x);
    const invD = fInv(denom);
    lam = fMul(numer, invD);
    trace.numer = numer;
    trace.denom = denom;
    trace.invDenom = invD;
    trace.lambda = lam;
    trace.steps.push(`numer = y₂−y₁ = ${hex(numer)}`);
    trace.steps.push(`denom = x₂−x₁ = ${hex(denom)}`);
    trace.steps.push(`denom⁻¹ mod p = ${hex(invD)}`);
    trace.steps.push(`λ = numer·denom⁻¹ = ${hex(lam)}`);
  }

  const lamSq = fMul(lam, lam);
  trace.lambdaSq = lamSq;
  trace.steps.push(`λ² = ${hex(lamSq)}`);

  const x3 = fSub(fSub(lamSq, P1.x), P2.x);
  const y3 = fSub(fMul(lam, fSub(P1.x, x3)), P1.y);
  trace.x3 = x3;
  trace.y3 = y3;
  if (trace.op === "double") {
    // x₃ = λ² − 2x₁  (same as λ²−x₁−x₁)
    trace.steps.push(`x₃ = λ² − 2·x₁ = ${hex(x3)}`);
  } else {
    trace.steps.push(`x₃ = λ² − x₁ − x₂ = ${hex(x3)}`);
  }
  trace.steps.push(`y₃ = λ·(x₁ − x₃) − y₁ = ${hex(y3)}`);

  const out = point(x3, y3);
  if (!onCurve(out)) throw new Error("result off-curve");
  trace.resultPt = out;
  trace.onCurveOk = true;
  trace.steps.push(`result.compressed = ${compress(out)}`);
  trace.steps.push(`onCurve(result) = true`);
  return { point: out, trace };
}

export function doubleDetailed(Pt) {
  return addDetailed(Pt, Pt);
}

export function subDetailed(P1, P2) {
  return addDetailed(P1, neg(P2));
}

/** Fast scalar mul (no per-op lab trace). */
export function scalarMulFast(k, Pt = G()) {
  k = mod(k, N);
  if (k === 0n || isInf(Pt)) return INF;
  let R = INF;
  let Q = Pt;
  let kk = k;
  while (kk > 0n) {
    if (kk & 1n) {
      const r = addDetailed(R, Q);
      R = r.point;
    }
    const d = addDetailed(Q, Q);
    Q = d.point;
    kk >>= 1n;
  }
  return R;
}

/** Unique halving in the prime-order subgroup: H = (2^{-1} mod n) · P. */
export function halfDetailed(Pt) {
  const inv2 = modInv(2n, N);
  const steps = [];
  steps.push("algorithm: H ← scalarMul(2⁻¹ mod n, P)  [BigInt, deterministic]");
  steps.push(`input P = ${isInf(Pt) ? "∞" : compress(Pt)}`);
  if (!isInf(Pt)) {
    steps.push(`P.x = ${hex(Pt.x)}`);
    steps.push(`P.y = ${hex(Pt.y)}`);
  }
  steps.push(`n = ${hex(N)}`);
  steps.push(`2⁻¹ mod n = ${hex(inv2)}   (porque 2·inv2 ≡ 1 mod n)`);
  steps.push("H = inv2 · P   (binary method LSB on the fast engine)");

  const Hpt = scalarMulFast(inv2, Pt);
  steps.push(`H = ${isInf(Hpt) ? "∞" : compress(Hpt)}`);
  if (!isInf(Hpt)) {
    steps.push(`H.x = ${hex(Hpt.x)}`);
    steps.push(`H.y = ${hex(Hpt.y)}`);
  }

  // Verificação algorítmica: 2·H deve recuperar P
  let verify2H = INF;
  let verifyOk = false;
  if (isInf(Pt) && isInf(Hpt)) {
    verifyOk = true;
    steps.push("check: P=O ∧ H=O → OK");
  } else {
    const d = addDetailed(Hpt, Hpt);
    verify2H = d.point;
    verifyOk = eq(verify2H, Pt);
    steps.push(`check: 2·H = ${isInf(verify2H) ? "∞" : compress(verify2H)}`);
    steps.push(`2·H == P ? ${verifyOk ? "YES ✓" : "NO ✗"}`);
  }

  return {
    point: Hpt,
    trace: {
      op: "half",
      formula: "H = (2⁻¹ mod n) · P   (unique in the order-n subgroup)",
      why:
        "order n odd ⇒ 2 invertible mod n; reverse ambiguity comes from Add, not half",
      inv2,
      input: clonePt(Pt),
      steps,
      result: clonePt(Hpt),
      verify2H: clonePt(verify2H),
      verifyOk,
    },
  };
}

/**
 * Scalar multiplication with optional full D&A MSB-first trace.
 * opts.traceSteps = true to record every double/add.
 */
export function scalarMulDetailed(k, Pt = G(), opts = {}) {
  k = mod(k, N);
  if (k === 0n) return { point: INF, steps: ["k≡0 → O"], ops: [] };

  const bits = [];
  let tmp = k;
  while (tmp > 0n) {
    bits.push(Number(tmp & 1n));
    tmp >>= 1n;
  }
  // bits[0]=LSB … bits[L-1]=MSB
  const L = bits.length;
  const ops = [];
  const steps = [];
  let R = INF;
  let doubles = 0;
  let adds = 0;

  // MSB-first binary method
  for (let i = L - 1; i >= 0; i--) {
    const bit = bits[i];
    const Rbefore = clonePt(R);

    // Double (always except conceptually when R=O first times)
    const d = addDetailed(R, R);
    doubles++;
    R = d.point;
    const doubleOp = {
      stage: ops.length,
      bitIndex: i,
      bit,
      kind: "double",
      why: `MSB-first: always Double before reading bit[${i}]`,
      R_before: Rbefore,
      R_after: clonePt(R),
      trace: d.trace,
      doublesSoFar: doubles,
      addsSoFar: adds,
    };
    ops.push(doubleOp);
    steps.push(`[${ops.length - 1}] DOUBLE bitIdx=${i}  (prep)`);

    if (bit === 1) {
      const Rb = clonePt(R);
      const a = addDetailed(R, Pt);
      adds++;
      R = a.point;
      const addOp = {
        stage: ops.length,
        bitIndex: i,
        bit,
        kind: "add",
        why: `bit[${i}]=1 → Add G (ou P)`,
        R_before: Rb,
        R_after: clonePt(R),
        addend: clonePt(Pt),
        trace: a.trace,
        doublesSoFar: doubles,
        addsSoFar: adds,
      };
      ops.push(addOp);
      steps.push(`[${ops.length - 1}] ADD    bitIdx=${i}  bit=1`);
    } else {
      steps.push(`      (skip ADD) bit[${i}]=0`);
    }
  }

  return {
    point: R,
    k,
    bitLength: L,
    bitsMSB: [...bits].reverse(), // index 0 = MSB visually
    bitsLSB: bits,
    setBits: bits.map((b, i) => (b ? i : -1)).filter((i) => i >= 0),
    doubles,
    adds,
    ops,
    steps,
  };
}

export function decompress(hex) {
  let h = String(hex).trim().toLowerCase().replace(/^0x/, "");
  if (h.length === 66 && (h.startsWith("02") || h.startsWith("03"))) {
    const x = BigInt("0x" + h.slice(2));
    const prefix = parseInt(h.slice(0, 2), 16);
    const y2 = fAdd(fMul(fMul(x, x), x), B);
    let y = fSqrt(y2);
    if (fMul(y, y) !== y2) throw new Error("not a quadratic residue");
    const odd = y % 2n === 1n;
    if ((prefix === 2 && odd) || (prefix === 3 && !odd)) y = fSub(0n, y);
    const Pt = point(x, y);
    if (!onCurve(Pt)) throw new Error("invalid point");
    return Pt;
  }
  if (h.length === 130 && h.startsWith("04")) {
    const Pt = point(BigInt("0x" + h.slice(2, 66)), BigInt("0x" + h.slice(66)));
    if (!onCurve(Pt)) throw new Error("invalid point");
    return Pt;
  }
  throw new Error("pubkey: 02/03||X or 04||X||Y");
}

export function compress(Pt) {
  if (isInf(Pt)) return "∞";
  return (Pt.y % 2n === 0n ? "02" : "03") + bigToHex(Pt.x, 64);
}

export function clonePt(Pt) {
  if (isInf(Pt)) return INF;
  return { x: Pt.x, y: Pt.y };
}

export function fmtPt(Pt) {
  if (isInf(Pt)) return { inf: true, x: null, y: null, compressed: "∞" };
  return {
    inf: false,
    x: bigToHex(Pt.x, 64),
    y: bigToHex(Pt.y, 64),
    compressed: compress(Pt),
  };
}

function hex(n) {
  return bigToHex(n, 64);
}
