/**
 * XMR EQIR Lab — Monero ed25519 · spend/view · address · scalar chain.
 */
import {
  deriveWallet,
  randomSpendPriv,
  scReduce32,
  scalarMulTrace,
  decodeStandardAddress,
  encodeStandardAddress,
  pubFromPriv,
  viewPrivFromSpend,
  leBytesToBig,
  bigToLeBytes,
  bytesToHex,
  hexToBytes,
  NET,
  L,
  ExtendedPoint,
} from "./monero-keys.js";

const $ = (id) => document.getElementById(id);

function setVal(id, v) {
  const el = $(id);
  if (el) el.value = v == null ? "" : String(v);
}

function flash(msg, kind = "info") {
  const el = $("xmr-flash");
  if (!el) return;
  el.innerHTML = `<div class="msg ${kind}">${msg}</div>`;
}

function activateMod(id) {
  document.querySelectorAll("#xmr-mod-nav [data-xmr-mod]").forEach((b) => {
    b.classList.toggle("active", b.dataset.xmrMod === id);
  });
  document.querySelectorAll(".xmr-panel").forEach((p) => {
    p.hidden = p.dataset.xmrPanel !== id;
  });
  const hints = {
    curve: "Ed25519 twisted Edwards · order ℓ · basepoint G (noble-ed25519).",
    scalar: "MSB-first Double-and-Add on ed25519 — same educational view as BTC EQIR.",
    keys: "Spend → view (Keccak·sc_reduce32) → pubs → standard address.",
    address: "Decode / verify Monero standard addresses (network + pubs + checksum).",
    kangaroo: "Tiny Pollard-style walk sandbox on ed25519 scalars (lab bits only).",
    xor: "XOR / fingerprint helpers on XMR key material.",
  };
  const h = $("xmr-mod-hint");
  if (h) h.textContent = hints[id] || "";
}

function parseSpendInput() {
  const raw = ($("xmr-spend")?.value || "").trim().replace(/^0x/i, "");
  if (!raw) throw new Error("enter spend private key (64 hex)");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("spend key: 64 hex chars");
  return scReduce32(hexToBytes(raw));
}

function refreshKeys() {
  try {
    const netName = $("xmr-net")?.value || "mainnet";
    const network = NET[netName] ?? NET.mainnet;
    const spend = parseSpendInput();
    const w = deriveWallet(spend, network);
    setVal("xmr-spend", w.spendPrivHex);
    setVal("xmr-view", w.viewPrivHex);
    setVal("xmr-pub-spend", w.pubSpendHex);
    setVal("xmr-pub-view", w.pubViewHex);
    setVal("xmr-address", w.address);
    setVal("xmr-scalar-dec", leBytesToBig(w.spendPriv).toString(10));
    $("xmr-keys-status").textContent = `OK · ${netName} · ${w.address.slice(0, 8)}…`;
    flash("Keys + address derived locally.", "ok");
    return w;
  } catch (e) {
    $("xmr-keys-status").textContent = e.message || String(e);
    flash(e.message || String(e), "warn");
    return null;
  }
}

function runScalar() {
  try {
    const spend = parseSpendInput();
    const tr = scalarMulTrace(spend);
    setVal("xmr-scalar-pub", tr.pubHex);
    const body = $("xmr-chain");
    body.innerHTML = "";
    const max = Math.min(tr.ops.length, 80);
    for (let i = 0; i < max; i++) {
      const op = tr.ops[i];
      const row = document.createElement("div");
      row.className = "xmr-op " + op.kind;
      row.innerHTML = `<span class="mono">#${i}</span> <b>${op.kind}</b> bit[${op.bitIndex}]=${op.bit}
        <div class="mono muted">${op.after.slice(0, 20)}…</div>`;
      body.appendChild(row);
    }
    if (tr.ops.length > max) {
      const more = document.createElement("div");
      more.className = "muted";
      more.textContent = `… ${tr.ops.length - max} more ops (truncated)`;
      body.appendChild(more);
    }
    $("xmr-scalar-stats").textContent = `bits=${tr.bitLength} · ops=${tr.ops.length} · doubles+adds`;
    flash("Ed25519 scalar mul trace ready.", "ok");
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function decodeAddr() {
  try {
    const addr = ($("xmr-addr-in")?.value || "").trim();
    const d = decodeStandardAddress(addr);
    const net =
      d.network === 0x12 ? "mainnet" : d.network === 0x18 ? "stagenet" : d.network === 0x35 ? "testnet" : `0x${d.network.toString(16)}`;
    setVal("xmr-addr-net", net);
    setVal("xmr-addr-ps", bytesToHex(d.pubSpend));
    setVal("xmr-addr-pv", bytesToHex(d.pubView));
    const rebuilt = encodeStandardAddress(d.pubSpend, d.pubView, d.network);
    setVal("xmr-addr-rebuild", rebuilt);
    $("xmr-addr-status").textContent = rebuilt === addr ? "checksum OK · round-trip OK" : "decoded (normalized encode differs)";
    flash("Address decoded.", "ok");
  } catch (e) {
    $("xmr-addr-status").textContent = e.message || String(e);
    flash(e.message || String(e), "warn");
  }
}

function runXor() {
  try {
    const a = ($("xmr-xor-a")?.value || "").trim().replace(/^0x/i, "");
    const b = ($("xmr-xor-b")?.value || "").trim().replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]*$/.test(a) || !/^[0-9a-fA-F]*$/.test(b) || a.length % 2 || b.length % 2) {
      throw new Error("hex pairs required");
    }
    const A = hexToBytes(a);
    const B = hexToBytes(b);
    const n = Math.max(A.length, B.length);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (A[i] || 0) ^ (B[i] || 0);
    setVal("xmr-xor-out", bytesToHex(out));
    flash("XOR done.", "ok");
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function runKangarooSelftest() {
  try {
    const bits = Math.min(20, Math.max(8, parseInt($("xmr-kang-bits")?.value || "12", 10) || 12));
    const lo = 1n << BigInt(bits - 1);
    const hi = (1n << BigInt(bits)) - 1n;
    const secret = lo + BigInt(Math.floor(Math.random() * Number(hi - lo)));
    const target = ExtendedPoint.BASE.multiply(secret);
    // naive kangaroo-ish: walk with random jumps until hit (tiny bit widths only)
    const jumps = [1n, 2n, 3n, 5n, 7n, 11n, 13n, 17n];
    let tame = ExtendedPoint.BASE.multiply(lo);
    let tameDist = lo;
    const table = new Map();
    const maxSteps = 1 << (bits + 2);
    for (let i = 0; i < maxSteps; i++) {
      const h = bytesToHex(tame.toRawBytes()).slice(0, 8);
      if (!table.has(h)) table.set(h, tameDist);
      const j = jumps[Number(leBytesToBig(tame.toRawBytes().slice(0, 8)) % BigInt(jumps.length))];
      tame = tame.add(ExtendedPoint.BASE.multiply(j));
      tameDist += j;
      if (tameDist > hi + (1n << BigInt(bits))) break;
    }
    let wild = target;
    let wildDist = 0n;
    let found = null;
    for (let i = 0; i < maxSteps; i++) {
      const h = bytesToHex(wild.toRawBytes()).slice(0, 8);
      if (table.has(h)) {
        const cand = table.get(h) - wildDist;
        if (cand >= lo && cand <= hi && ExtendedPoint.BASE.multiply(cand).equals(target)) {
          found = cand;
          break;
        }
      }
      const j = jumps[Number(leBytesToBig(wild.toRawBytes().slice(0, 8)) % BigInt(jumps.length))];
      wild = wild.add(ExtendedPoint.BASE.multiply(j));
      wildDist += j;
    }
    const pre = $("xmr-kang-out");
    if (found != null) {
      pre.textContent = `OK bits=${bits}\nsecret=${secret.toString(16)}\nfound=${found.toString(16)}\nmatch=${found === secret}`;
      flash("Kangaroo selftest OK.", "ok");
    } else {
      pre.textContent = `MISS bits=${bits} secret=${secret.toString(16)} (retry / raise bits carefully)`;
      flash("No collision this run — retry.", "warn");
    }
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function fillCurveSpec() {
  setVal("xmr-curve-name", "ed25519 (twisted Edwards)");
  setVal("xmr-curve-eq", "−x² + y² = 1 + d·x²·y²  (a=−1)");
  setVal("xmr-curve-p", CURVE_P());
  setVal("xmr-curve-l", L.toString(16));
  setVal("xmr-curve-gx", ExtendedPoint.BASE.toHex().slice(0, 64));
}

function CURVE_P() {
  return (2n ** 255n - 19n).toString(16);
}

function sendSpendToBtcEqir() {
  // cross-link: park spend hex in BTC priv for inspection (different curve!)
  flash("XMR spend is ed25519 — use XMR Scalar/Keys, not BTC secp256k1.", "info");
}

export function initXmrUi() {
  if (!$("xmr-mod-nav")) return;

  document.querySelectorAll("#xmr-mod-nav [data-xmr-mod]").forEach((btn) => {
    btn.addEventListener("click", () => activateMod(btn.dataset.xmrMod));
  });

  $("btn-xmr-random")?.addEventListener("click", () => {
    setVal("xmr-spend", bytesToHex(randomSpendPriv()));
    refreshKeys();
  });
  $("btn-xmr-derive")?.addEventListener("click", () => {
    refreshKeys();
  });
  $("btn-xmr-scalar")?.addEventListener("click", () => {
    refreshKeys();
    runScalar();
    activateMod("scalar");
  });
  $("btn-xmr-decode")?.addEventListener("click", decodeAddr);
  $("btn-xmr-xor")?.addEventListener("click", runXor);
  $("btn-xmr-kang")?.addEventListener("click", runKangarooSelftest);
  $("btn-xmr-load-view")?.addEventListener("click", () => {
    try {
      const spend = parseSpendInput();
      setVal("xmr-xor-a", bytesToHex(spend));
      setVal("xmr-xor-b", bytesToHex(viewPrivFromSpend(spend)));
      flash("Loaded spend ⊕ view into XOR panel.", "ok");
      activateMod("xor");
    } catch (e) {
      flash(e.message || String(e), "warn");
    }
  });

  ["xmr-spend", "xmr-net"].forEach((id) => {
    $(id)?.addEventListener("change", refreshKeys);
  });

  fillCurveSpec();
  activateMod("keys");
  // seed demo empty — user generates
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initXmrUi);
} else {
  initXmrUi();
}
