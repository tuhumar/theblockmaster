/**
 * EQIR shared STATE — ponto + escalar + auditoria D&A / XOR / Kangaroo.
 */
import { sha256, bytesToHex, hexToBytes } from "./hash.js";

export function emptyState(partial = {}) {
  return {
    id: partial.id || uid(),
    x: "",
    y: "",
    compressed: "",
    scalar: "",
    scalarDec: "",
    bits: "",
    bitIndex: null,
    bit: null,
    prevOp: "",
    doubles: 0,
    adds: 0,
    xorTrail: [],
    kangaroo: null, // { a, b, herd, dist, jumpIdx }
    fingerprint: "",
    label: "",
    notes: "",
    ...partial,
  };
}

function uid() {
  return "s" + Math.random().toString(36).slice(2, 10);
}

/** Pack stable bytes for fingerprint. */
export function packStateBytes(st) {
  const parts = [
    st.compressed || "",
    st.x || "",
    st.y || "",
    st.scalar || "",
    String(st.bitIndex ?? ""),
    String(st.bit ?? ""),
    st.prevOp || "",
    String(st.doubles ?? 0),
    String(st.adds ?? 0),
    JSON.stringify(st.xorTrail || []),
    JSON.stringify(st.kangaroo || null),
  ];
  return new TextEncoder().encode(parts.join("|"));
}

export function fingerprintState(st) {
  const dig = sha256(packStateBytes(st));
  return bytesToHex(dig).slice(0, 16);
}

export function withFingerprint(st) {
  const next = { ...st };
  next.fingerprint = fingerprintState(next);
  return next;
}

/** Build STATE from a chain row (D&A / reverse). */
export function stateFromChainRow(row, counters = {}) {
  return withFingerprint(
    emptyState({
      id: row.id,
      x: row.x || "",
      y: row.y || "",
      compressed: row.compressed || "",
      bitIndex: row.bitIndex ?? null,
      bit: row.bit ?? null,
      prevOp: row.kind || "",
      doubles: counters.doubles ?? 0,
      adds: counters.adds ?? 0,
      label: row.label || "",
      notes: (row.notes || "").slice(0, 200),
      xorTrail: row.xorTrail ? [...row.xorTrail] : [],
      kangaroo: row.kangaroo ? { ...row.kangaroo } : null,
      scalar: row.scalar || "",
      scalarDec: row.scalarDec || "",
      bits: row.bits || "",
    })
  );
}

/** Map full chain → STATE[]. */
export function statesFromChain(chain, lastForward = null) {
  let doubles = 0;
  let adds = 0;
  const out = [];
  for (const row of chain || []) {
    if (row.kind === "double") doubles += 1;
    if (row.kind === "add") adds += 1;
    out.push(
      stateFromChainRow(row, {
        doubles,
        adds,
        // prefer forward counters if available at end
      })
    );
  }
  if (lastForward?.counters && out.length) {
    const last = out[out.length - 1];
    last.doubles = lastForward.counters.doubles;
    last.adds = lastForward.counters.adds;
    out[out.length - 1] = withFingerprint(last);
  }
  return out;
}

export function exportStatesJSON(states, meta = {}) {
  return JSON.stringify(
    {
      lab: "eqir",
      exportedAt: new Date().toISOString(),
      meta,
      states,
    },
    null,
    2
  );
}

/** Append XOR step (reversible if same mask reapplied). */
export function pushXor(st, { op, mask, before, after }) {
  const trail = [...(st.xorTrail || [])];
  trail.push({
    t: Date.now(),
    op,
    mask: String(mask ?? ""),
    before: String(before ?? ""),
    after: String(after ?? ""),
  });
  return withFingerprint({ ...st, xorTrail: trail });
}

export function setKangaroo(st, kang) {
  return withFingerprint({
    ...st,
    kangaroo: kang
      ? {
          a: String(kang.a ?? ""),
          b: String(kang.b ?? ""),
          herd: kang.herd || "",
          dist: String(kang.dist ?? "0"),
          jumpIdx: kang.jumpIdx ?? null,
        }
      : null,
  });
}
