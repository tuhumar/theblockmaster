import { bigToHex } from "../core/modular.js";
import {
  G, INF, isInf, decompress, fmtPt,
  subDetailed, halfDetailed, onCurve, clonePt,
} from "../core/point.js";
import {
  formatHalfTraceNotes,
  formatHalf1Notes,
} from "../core/lab-notes.js";

/**
 * REVERSE ENGINE — MSB-first Double-and-Add undo.
 *
 * Forward (i = L-1 .. 0):  R ← 2R;  if bit_i: R ← R+G
 * Reverse undoes i = 0 .. L-1:
 *   bit=1 → R ← half(R − G)
 *   bit=0 → R ← half(R)
 *
 * Halving is unique in the prime-order subgroup.
 * Ambiguity = whether the previous forward step included Add.
 * NOT an ECDLP solver — path reconstruction with known/candidate bits.
 */
export function createReverseSession(pubHex, maxBit) {
  const Q = decompress(pubHex);
  if (!onCurve(Q)) throw new Error("Q off-curve");
  maxBit = Number(maxBit);
  if (!(maxBit >= 0 && maxBit <= 255)) throw new Error("maxBit 0..255");

  return {
    Q,
    maxBit,
    cursor: 0,
    R: clonePt(Q),
    decided: {},
    order: [],
    history: [],
  };
}

export function listCandidates(session) {
  const out = [];
  if (session.cursor <= session.maxBit && session.decided[session.cursor] === undefined) {
    out.push({
      bitIndex: session.cursor,
      role: "cursor (next to decide)",
      options: [
        { bit: 0, label: "bit=0 → half(R)" },
        { bit: 1, label: "bit=1 → half(R−G)" },
      ],
    });
  }
  for (let i = 0; i <= session.maxBit; i++) {
    if (session.decided[i] !== undefined) continue;
    if (i === session.cursor) continue;
    out.push({
      bitIndex: i,
      role: i < session.cursor ? "atrasado" : "futuro",
      warning: "MSB-first reverse correto: siga o cursor em ordem 0,1,2,…",
      options: [
        { bit: 0, label: "bit=0" },
        { bit: 1, label: "bit=1" },
      ],
    });
  }
  return out;
}

export function peekBranches(session) {
  const i = session.cursor;
  if (i > session.maxBit) {
    return { done: true, bitIndex: null, branches: [] };
  }
  const R = session.R;
  const b0 = halfDetailed(R);
  const sub = subDetailed(R, G());
  const b1 = halfDetailed(sub.point);
  return {
    done: false,
    bitIndex: i,
    branches: [
      {
        bit: 0,
        label: "bit=0 → half(R)",
        next: fmtPt(b0.point),
        formula: b0.trace.formula,
      },
      {
        bit: 1,
        label: "bit=1 → half(R−G)",
        afterSubG: fmtPt(sub.point),
        next: fmtPt(b1.point),
        formula: "R←R−G; then half",
      },
    ],
  };
}

export function applyReverseStep(session, bitIndex, bit) {
  bitIndex = Number(bitIndex);
  bit = Number(bit);
  if (bit !== 0 && bit !== 1) throw new Error("bit must be 0 or 1");
  if (bitIndex < 0 || bitIndex > session.maxBit) throw new Error("bitIndex out of range");
  if (session.decided[bitIndex] !== undefined) throw new Error(`bit ${bitIndex} already decided`);

  const before = clonePt(session.R);
  let afterSub = before;
  let subTrace = null;
  let halfPack;

  if (bit === 1) {
    const s = subDetailed(before, G());
    afterSub = s.point;
    subTrace = s.trace;
    halfPack = halfDetailed(afterSub);
  } else {
    halfPack = halfDetailed(before);
  }

  const after = halfPack.point;
  const labNotes =
    bit === 1
      ? formatHalf1Notes(subTrace, halfPack.trace, { bitIndex })
      : formatHalfTraceNotes(halfPack.trace, { bit: 0, bitIndex });

  session.history.push({
    bitIndex,
    bit,
    R_before: fmtPt(before),
    afterSub: bit === 1 ? fmtPt(afterSub) : null,
    R_after: fmtPt(after),
    subLambda: subTrace?.lambda != null ? bigToHex(subTrace.lambda, 64) : null,
    subSteps: subTrace?.steps || [],
    halfSteps: halfPack.trace.steps || [],
    halfFormula: halfPack.trace.formula,
    labNotes,
  });
  session.R = after;
  session.decided[bitIndex] = bit;
  session.order.push(bitIndex);

  if (bitIndex === session.cursor) {
    let c = bitIndex + 1;
    while (c <= session.maxBit && session.decided[c] !== undefined) c++;
    session.cursor = c;
  }
  return summarize(session);
}

export function undoLast(session) {
  if (!session.order.length) return summarize(session);
  session.order.pop();
  session.history.pop();
  // rebuild
  const steps = session.history.map((h) => ({ i: h.bitIndex, b: h.bit }));
  session.R = clonePt(session.Q);
  session.decided = {};
  session.order = [];
  session.history = [];
  session.cursor = 0;
  for (const s of steps) applyReverseStep(session, s.i, s.b);
  return summarize(session);
}

/** Apply a known list of set-bit indices (ADD positions). Zeros fill the rest. */
export function applyKnownSetBits(session, setBits) {
  const ones = new Set(setBits.map(Number));
  for (let i = 0; i <= session.maxBit; i++) {
    const bit = ones.has(i) ? 1 : 0;
    if (session.decided[i] === undefined) {
      applyReverseStep(session, i, bit);
    }
  }
  return summarize(session);
}

export function summarize(session) {
  let k = 0n;
  for (const [i, b] of Object.entries(session.decided)) {
    if (Number(b) === 1) k |= 1n << BigInt(i);
  }
  const nDecided = Object.keys(session.decided).length;
  const allDecided = nDecided === session.maxBit + 1;
  const atInf = isInf(session.R);

  let privateHex = null;
  let status = "em progresso";
  if (allDecided && atInf) {
    privateHex = bigToHex(k, 64);
    status = "★ R=O and bits complete → private reconstructed";
  } else if (allDecided && !atInf) {
    status = "bits complete but R≠O → incompatible path";
  } else if (atInf) {
    status = "R=O too early — revise bits";
  }

  return {
    status,
    cursor: session.cursor,
    maxBit: session.maxBit,
    decided: { ...session.decided },
    order: [...session.order],
    kPartialHex: bigToHex(k, 64),
    R: fmtPt(session.R),
    Q: fmtPt(session.Q),
    history: session.history,
    candidates: listCandidates(session),
    branches: peekBranches(session),
    privateHex,
    disclaimer:
      "Reconstruction with given indices. Does not solve ECDLP from pubkey alone.",
  };
}
