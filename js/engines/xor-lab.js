/**
 * XOR Lab — transformações binárias reversíveis sobre escalares / fingerprints.
 */
import { emptyState, pushXor, withFingerprint, fingerprintState } from "../core/state.js";
import { bigToHex } from "../core/modular.js";

function parseHexOrDec(raw) {
  const s = String(raw ?? "").trim().replace(/^0x/i, "");
  if (!s) throw new Error("empty");
  if (/^[0-9a-fA-F]+$/.test(s) && /[a-fA-F]/.test(s)) return BigInt("0x" + s);
  if (/^\d+$/.test(s)) return BigInt(s);
  if (/^[0-9a-fA-F]+$/.test(s)) return BigInt("0x" + s);
  throw new Error("invalid hex/dec");
}

function padHex(n, width = 0) {
  let h = n.toString(16);
  if (width && h.length < width) h = h.padStart(width, "0");
  if (h.length % 2) h = "0" + h;
  return h;
}

/** XOR two integers (hex/dec). Reversible: a ⊕ m ⊕ m = a. */
export function xorScalars(aRaw, maskRaw) {
  const a = parseHexOrDec(aRaw);
  const m = parseHexOrDec(maskRaw);
  const after = a ^ m;
  return {
    before: padHex(a),
    mask: padHex(m),
    after: padHex(after),
    beforeDec: a.toString(10),
    afterDec: after.toString(10),
    reversible: true,
  };
}

/** XOR bitstring (MSB-left) with repeating mask bits. */
export function xorBits(bits, maskBits) {
  const b = String(bits || "").replace(/[^01]/g, "");
  const m = String(maskBits || "").replace(/[^01]/g, "");
  if (!b) throw new Error("empty bits");
  if (!m) throw new Error("empty mask");
  let out = "";
  for (let i = 0; i < b.length; i++) {
    const x = b[i] === "1" ? 1 : 0;
    const y = m[i % m.length] === "1" ? 1 : 0;
    out += String(x ^ y);
  }
  return { before: b, mask: m, after: out, reversible: true };
}

/** Hamming distance between two hex scalars. */
export function hammingHex(aRaw, bRaw) {
  const a = parseHexOrDec(aRaw);
  const b = parseHexOrDec(bRaw);
  let x = a ^ b;
  let c = 0;
  while (x) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

/** Apply XOR to a STATE scalar and record trail. */
export function applyXorToState(st, maskRaw) {
  const before = st.scalar || st.x || "0";
  const r = xorScalars(before, maskRaw);
  let next = {
    ...st,
    scalar: r.after,
    scalarDec: r.afterDec,
  };
  next = pushXor(next, {
    op: "xor-scalar",
    mask: r.mask,
    before: r.before,
    after: r.after,
  });
  return next;
}

/** Fingerprint of scalar list after XOR — for redundancy checks. */
export function xorFingerprintCloud(scalars, maskRaw) {
  const rows = [];
  for (const s of scalars) {
    try {
      const r = xorScalars(s, maskRaw);
      const st = withFingerprint(
        emptyState({ scalar: r.after, prevOp: "xor-cloud" })
      );
      rows.push({
        before: r.before,
        after: r.after,
        fingerprint: st.fingerprint,
      });
    } catch {
      /* skip */
    }
  }
  const fps = new Map();
  for (const r of rows) {
    fps.set(r.fingerprint, (fps.get(r.fingerprint) || 0) + 1);
  }
  let collisions = 0;
  for (const n of fps.values()) if (n > 1) collisions += n - 1;
  return { rows, uniqueFingerprints: fps.size, collisions };
}
