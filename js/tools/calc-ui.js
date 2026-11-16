/**
 * Calculators tab — hashes, Base58, hex/dec, modular arithmetic.
 */
import {
  sha256,
  ripemd160,
  hash160,
  hash256,
  keccak256,
  hexToBytes,
  bytesToHex,
} from "../core/hash.js";
import {
  base58Encode,
  base58Decode,
  base58CheckEncode,
  base58CheckDecode,
} from "../core/encoding.js";

const $ = (id) => document.getElementById(id);

function utf8ToBytes(s) {
  return new TextEncoder().encode(String(s ?? ""));
}

function parseInputBytes(raw, mode) {
  const s = String(raw ?? "");
  if (mode === "utf8") return utf8ToBytes(s);
  const hex = s.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!hex) return new Uint8Array(0);
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2) {
    throw new Error("invalid hex (digit pairs)");
  }
  return hexToBytes(hex);
}

function parseBig(raw) {
  const s = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!s) throw new Error("empty value");
  if (/^0x[0-9a-fA-F]+$/i.test(s)) return BigInt(s);
  if (/^[0-9a-fA-F]+$/i.test(s) && /[a-fA-F]/.test(s)) return BigInt("0x" + s);
  if (/^-?\d+$/.test(s)) return BigInt(s);
  throw new Error("invalid number (dec or hex)");
}

function fmtBig(n, asHex) {
  if (n < 0n) return "-" + fmtBig(-n, asHex);
  if (asHex) {
    let h = n.toString(16);
    if (h.length % 2) h = "0" + h;
    return h;
  }
  return n.toString(10);
}

function setOut(id, text, ok = true) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("tool-err", !ok);
  el.classList.toggle("tool-ok", ok);
}

function modPow(base, exp, m) {
  if (m <= 0n) throw new Error("invalid modulus");
  let b = ((base % m) + m) % m;
  let e = exp;
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

function egcd(a, b) {
  let [old_r, r] = [a, b];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return { g: old_r < 0n ? -old_r : old_r, x: old_s };
}

function invMod(a, m) {
  const { g, x } = egcd(((a % m) + m) % m, m);
  if (g !== 1n) throw new Error("not invertible");
  return ((x % m) + m) % m;
}

export function initCalcUi() {
  if (!$("calc-hash-in")) return;

  // Hash suite
  $("btn-calc-hash")?.addEventListener("click", () => {
    try {
      const mode = $("calc-hash-mode")?.value || "utf8";
      const bytes = parseInputBytes($("calc-hash-in")?.value, mode);
      const kind = $("calc-hash-kind")?.value || "sha256";
      let out;
      if (kind === "sha256") out = sha256(bytes);
      else if (kind === "hash256") out = hash256(bytes);
      else if (kind === "ripemd160") out = ripemd160(bytes);
      else if (kind === "hash160") out = hash160(bytes);
      else if (kind === "keccak256") out = keccak256(bytes);
      else throw new Error("unknown hash");
      setOut("calc-hash-out", bytesToHex(out), true);
    } catch (e) {
      setOut("calc-hash-out", e.message || String(e), false);
    }
  });

  // Base58
  $("btn-calc-b58-enc")?.addEventListener("click", () => {
    try {
      const mode = $("calc-b58-mode")?.value || "hex";
      const bytes = parseInputBytes($("calc-b58-in")?.value, mode);
      const check = !!$("calc-b58-check")?.checked;
      setOut(
        "calc-b58-out",
        check ? base58CheckEncode(bytes) : base58Encode(bytes),
        true
      );
    } catch (e) {
      setOut("calc-b58-out", e.message || String(e), false);
    }
  });
  $("btn-calc-b58-dec")?.addEventListener("click", () => {
    try {
      const check = !!$("calc-b58-check")?.checked;
      const bytes = check
        ? base58CheckDecode($("calc-b58-in")?.value)
        : base58Decode($("calc-b58-in")?.value);
      setOut("calc-b58-out", bytesToHex(bytes), true);
    } catch (e) {
      setOut("calc-b58-out", e.message || String(e), false);
    }
  });

  // Hex / UTF-8 / XOR
  $("btn-calc-hex-utf8")?.addEventListener("click", () => {
    try {
      const bytes = parseInputBytes($("calc-hex-in")?.value, "hex");
      setOut("calc-hex-out", new TextDecoder().decode(bytes), true);
    } catch (e) {
      setOut("calc-hex-out", e.message || String(e), false);
    }
  });
  $("btn-calc-utf8-hex")?.addEventListener("click", () => {
    try {
      setOut("calc-hex-out", bytesToHex(utf8ToBytes($("calc-hex-in")?.value)), true);
    } catch (e) {
      setOut("calc-hex-out", e.message || String(e), false);
    }
  });
  $("btn-calc-hex-rev")?.addEventListener("click", () => {
    try {
      const bytes = parseInputBytes($("calc-hex-in")?.value, "hex");
      setOut("calc-hex-out", bytesToHex(bytes.slice().reverse()), true);
    } catch (e) {
      setOut("calc-hex-out", e.message || String(e), false);
    }
  });
  $("btn-calc-hex-xor")?.addEventListener("click", () => {
    try {
      const a = parseInputBytes($("calc-hex-in")?.value, "hex");
      const b = parseInputBytes($("calc-hex-b")?.value, "hex");
      const n = Math.max(a.length, b.length);
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = (a[i] || 0) ^ (b[i] || 0);
      setOut("calc-hex-out", bytesToHex(out), true);
    } catch (e) {
      setOut("calc-hex-out", e.message || String(e), false);
    }
  });

  // Hex ↔ decimal
  $("btn-calc-hex2dec")?.addEventListener("click", () => {
    try {
      const n = parseBig($("calc-num-in")?.value);
      setOut("calc-num-out", `dec: ${fmtBig(n, false)}\nhex: ${fmtBig(n, true)}`, true);
    } catch (e) {
      setOut("calc-num-out", e.message || String(e), false);
    }
  });
  $("btn-calc-dec2hex")?.addEventListener("click", () => {
    try {
      const n = parseBig($("calc-num-in")?.value);
      setOut("calc-num-out", fmtBig(n, true), true);
    } catch (e) {
      setOut("calc-num-out", e.message || String(e), false);
    }
  });
  $("btn-calc-pad32")?.addEventListener("click", () => {
    try {
      const n = parseBig($("calc-num-in")?.value);
      if (n < 0n) throw new Error("negative");
      setOut("calc-num-out", n.toString(16).padStart(64, "0"), true);
    } catch (e) {
      setOut("calc-num-out", e.message || String(e), false);
    }
  });

  // BigInt calculator
  $("btn-calc-math")?.addEventListener("click", () => {
    try {
      const a = parseBig($("calc-math-a")?.value);
      const bRaw = $("calc-math-b")?.value;
      const op = $("calc-math-op")?.value || "+";
      const asHex = !!$("calc-math-hex")?.checked;
      let r;
      if (op === "+") r = a + parseBig(bRaw);
      else if (op === "-") r = a - parseBig(bRaw);
      else if (op === "*") r = a * parseBig(bRaw);
      else if (op === "/") {
        const b = parseBig(bRaw);
        if (b === 0n) throw new Error("division by zero");
        r = a / b;
      } else if (op === "%") {
        const b = parseBig(bRaw);
        if (b === 0n) throw new Error("mod by zero");
        r = ((a % b) + b) % b;
      } else if (op === "^") {
        const m = parseBig($("calc-math-m")?.value);
        r = modPow(a, parseBig(bRaw), m);
      } else if (op === "inv") {
        r = invMod(a, parseBig(bRaw));
      } else if (op === "gcd") {
        let x = a < 0n ? -a : a;
        let y = parseBig(bRaw);
        y = y < 0n ? -y : y;
        while (y) [x, y] = [y, x % y];
        r = x;
      } else throw new Error("unknown op");
      setOut("calc-math-out", fmtBig(r, asHex), true);
    } catch (e) {
      setOut("calc-math-out", e.message || String(e), false);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCalcUi);
} else {
  initCalcUi();
}
