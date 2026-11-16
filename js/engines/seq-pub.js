import { bigToHex } from "../core/modular.js";
import {
  G,
  INF,
  isInf,
  decompress,
  compress,
  fmtPt,
  doubleDetailed,
  addDetailed,
  clonePt,
  onCurve,
} from "../core/point.js";

/** Igualdade afim (mod p já nas coords). */
export function samePt(A, B) {
  if (isInf(A) && isInf(B)) return true;
  if (isInf(A) || isInf(B)) return false;
  return A.x === B.x && A.y === B.y;
}

/**
 * Um passo do D&A MSB-first (fim de bit):
 *   next = 2·prev        → bit 0
 *   next = 2·prev + G    → bit 1
 */
export function inferForwardBit(prev, next) {
  const d = doubleDetailed(prev).point;
  if (samePt(d, next)) {
    return { ok: true, bit: 0, via: "2P", doubled: fmtPt(d), added: null };
  }
  const a = addDetailed(d, G()).point;
  if (samePt(a, next)) {
    return {
      ok: true,
      bit: 1,
      via: "2P+G",
      doubled: fmtPt(d),
      added: fmtPt(a),
    };
  }
  return {
    ok: false,
    bit: null,
    via: null,
    doubled: fmtPt(d),
    added: fmtPt(a),
    reason: "next ≠ 2P and ≠ 2P+G (not a contiguous D&A step)",
  };
}

/** bits MSB-first → inteiro k */
export function bitsMsbToK(bits) {
  let k = 0n;
  for (const b of bits) {
    k = (k << 1n) | (BigInt(b) & 1n);
  }
  return k;
}

export function createSeqPubSession() {
  return {
    active: false,
    /** false = ainda sem âncora; true = R válido (null = ∞) */
    hasR: false,
    /** @type {any} */
    R: null,
    baseK: 0n,
    baseKnown: true,
    bits: [],
    points: [],
    steps: [],
  };
}

export function seqPrivHex(session) {
  if (!session.bits.length) {
    if (session.hasR && session.baseKnown) return bigToHex(session.baseK, 0);
    return null;
  }
  const ext = bitsMsbToK(session.bits);
  if (!session.baseKnown) return bigToHex(ext, 0);
  const t = BigInt(session.bits.length);
  const k = (session.baseK << t) | ext;
  return bigToHex(k, 0);
}

export function seqStatus(session) {
  if (!session.active) return "seq mode OFF";
  if (!session.hasR) return "seq mode ON — paste 1st pubkey (anchor) or G to start from ∞";
  const kHex = seqPrivHex(session);
  const bitStr = session.bits.length ? session.bits.join("") : "—";
  const tip = isInf(session.R) ? "∞" : compress(session.R).slice(0, 12) + "…";
  return `seq ON · ${session.bits.length} bit(s) · ${bitStr} · tip=${tip} · k=${kHex || "?"}`;
}

function setAnchor(session, Pt, baseK) {
  session.hasR = true;
  session.R = isInf(Pt) ? INF : clonePt(Pt);
  session.points = [fmtPt(Pt)];
  session.bits = [];
  session.steps = [];
  session.baseK = baseK;
  session.baseKnown = true;
}

/**
 * Aceita próximo compressed/uncompressed hex.
 * - Sem âncora: define base (G→k=1, ∞, ou opts.baseK).
 * - opts.fromInfinity: força partida de ∞ (baseK=0) e trata o pub como 1º passo.
 */
export function seqAcceptPub(session, pubHex, opts = {}) {
  const Pt = decompress(pubHex);
  if (!onCurve(Pt)) throw new Error("point off-curve");

  // Atalho: partir de ∞ e já aplicar o 1º passo
  if (!session.hasR && opts.fromInfinity) {
    setAnchor(session, INF, 0n);
    // fall through to step
  }

  // âncora
  if (!session.hasR) {
    if (opts.baseK != null && opts.baseK >= 0n) {
      setAnchor(session, Pt, opts.baseK);
    } else if (isInf(Pt)) {
      setAnchor(session, INF, 0n);
    } else if (samePt(Pt, G()) && opts.startAsG !== false && opts.baseK == null) {
      // G como âncora com k=1 (continuar a partir de G)
      // Se opts.preferInfinityBootstrap: G = 1º passo desde ∞
      if (opts.bootstrapGFromInf) {
        setAnchor(session, INF, 0n);
        return seqAcceptPub(session, pubHex, {});
      }
      setAnchor(session, Pt, 1n);
    } else if (opts.forceBaseZero) {
      setAnchor(session, Pt, 0n);
    } else {
      return {
        kind: "anchor",
        needBase: true,
        point: fmtPt(Pt),
        message:
          "Anchor pending: set Private = scalar of this point, use G (k=1), or «start from ∞».",
      };
    }
    return {
      kind: "anchor",
      needBase: false,
      point: fmtPt(session.R),
      baseK: session.baseK,
      message: `Anchor ${isInf(session.R) ? "∞" : compress(session.R).slice(0, 18) + "…"} · baseK=${session.baseK.toString(16) || "0"}`,
    };
  }

  const prev = session.R;
  const inf = inferForwardBit(prev, Pt);
  if (!inf.ok) {
    return {
      kind: "reject",
      reason: inf.reason,
      expected2P: inf.doubled?.compressed,
      expected2PG: inf.added?.compressed,
      got: compress(Pt),
    };
  }

  session.bits.push(inf.bit);
  session.R = clonePt(Pt);
  session.points.push(fmtPt(Pt));
  const kHex = seqPrivHex(session);
  const step = {
    bitIndexFromMsb: session.bits.length - 1,
    bit: inf.bit,
    via: inf.via,
    compressed: compress(Pt),
    kHex,
  };
  session.steps.push(step);
  return { kind: "step", ...step, bits: session.bits.slice(), status: seqStatus(session) };
}

export function seqStartInfinity(session) {
  setAnchor(session, INF, 0n);
  return {
    kind: "anchor",
    needBase: false,
    point: fmtPt(INF),
    baseK: 0n,
    message: "Anchor ∞ · baseK=0 — paste next point (2∞=∞ or G if bit=1)",
  };
}

export function seqUndo(session) {
  if (session.steps.length === 0) {
    if (session.hasR) {
      session.hasR = false;
      session.R = null;
      session.points = [];
      session.bits = [];
      session.baseK = 0n;
      session.baseKnown = true;
      return { kind: "cleared_anchor" };
    }
    return { kind: "noop" };
  }
  session.steps.pop();
  session.bits.pop();
  session.points.pop();
  const last = session.points[session.points.length - 1];
  if (!last || last.inf) session.R = INF;
  else session.R = decompress(last.compressed);
  return {
    kind: "undo",
    bits: session.bits.slice(),
    kHex: seqPrivHex(session),
    status: seqStatus(session),
  };
}
