import { hexToBig, bigToHex, bigToBin } from "../core/modular.js";
import { N } from "../core/secp256k1.js";
import { G, scalarMulDetailed, compress, fmtPt, onCurve } from "../core/point.js";

/**
 * FORWARD ENGINE — private → full MSB-first Double-and-Add lab record.
 */
export function forwardFromPrivate(privHex) {
  const k = hexToBig(privHex);
  if (k <= 0n || k >= N) throw new Error("private key out of [1, n-1]");

  const run = scalarMulDetailed(k, G());
  const Q = run.point;
  if (!onCurve(Q)) throw new Error("Q off-curve");

  const bitlen = run.bitLength;
  const bin = bigToBin(k, bitlen);

  return {
    mode: "forward",
    private: {
      hex: bigToHex(k, 64),
      dec: k.toString(10),
      bin,
      bitLength: bitlen,
      hamming: run.setBits.length,
      setBitsLSB: run.setBits,
    },
    public: fmtPt(Q),
    counters: {
      doubles: run.doubles,
      adds: run.adds,
      totalOps: run.ops.length,
    },
    algorithm: {
      name: "Double-and-Add MSB-first",
      rule: "R=O; for i=L-1..0: R←2R; if bit_i=1: R←R+G",
      whyDouble: "Always — each bit requires a Double before deciding Add.",
      whyAdd: "Only when bit[i]=1 in scalar k.",
    },
    operations: run.ops.map((op) => serializeOp(op)),
    indexMap: buildIndexMap(k, bitlen, run.ops),
  };
}

function serializeOp(op) {
  return {
    stage: op.stage,
    bitIndex: op.bitIndex,
    bit: op.bit,
    kind: op.kind,
    why: op.why,
    doublesSoFar: op.doublesSoFar,
    addsSoFar: op.addsSoFar,
    R_before: fmtPt(op.R_before),
    R_after: fmtPt(op.R_after),
    addend: op.addend ? fmtPt(op.addend) : null,
    math: {
      opBranch: op.trace.op,
      formula: op.trace.formula,
      lambda: op.trace.lambda != null ? bigToHex(op.trace.lambda, 64) : null,
      numer: op.trace.numer != null ? bigToHex(op.trace.numer, 64) : null,
      denom: op.trace.denom != null ? bigToHex(op.trace.denom, 64) : null,
      invDenom: op.trace.invDenom != null ? bigToHex(op.trace.invDenom, 64) : null,
      lambdaSq: op.trace.lambdaSq != null ? bigToHex(op.trace.lambdaSq, 64) : null,
      steps: op.trace.steps || [],
      whyMath: op.trace.why,
      onCurveOk: op.trace.onCurveOk ?? null,
    },
  };
}

function buildIndexMap(k, bitlen, ops) {
  const map = [];
  for (let i = bitlen - 1; i >= 0; i--) {
    const bit = Number((k >> BigInt(i)) & 1n);
    const related = ops.filter((o) => o.bitIndex === i).map((o) => ({
      stage: o.stage,
      kind: o.kind,
      result: fmtPt(o.R_after),
    }));
    map.push({
      bitIndex: i,
      hexIndex: "0x" + i.toString(16),
      bit,
      relatedOps: related,
    });
  }
  return map;
}

export function exportJSON(record) {
  return JSON.stringify(record, null, 2);
}
