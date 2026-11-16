/**
 * Acordeão de ferramentas na sidebar direita.
 */
import {
  sha256,
  ripemd160,
  hash160,
  hash256,
  keccak256,
  hexToBytes,
  bytesToHex,
} from "./core/hash.js?v=tools2";
import {
  base58Encode,
  base58Decode,
  base58CheckEncode,
  base58CheckDecode,
} from "./core/encoding.js?v=tools2";

function utf8ToBytes(s) {
  return new TextEncoder().encode(String(s ?? ""));
}

function bytesToUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
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

function setOut(el, text, ok = true) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("tool-err", !ok);
  el.classList.toggle("tool-ok", ok);
}

function copyBtn(text) {
  return navigator.clipboard?.writeText(String(text ?? "")).catch(() => {});
}

export function initToolsPanel() {
  const root = document.getElementById("tools-accordion");
  if (!root) return;

  root.querySelectorAll("[data-acc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.acc;
      const panel = root.querySelector(`[data-acc-panel="${id}"]`);
      const open = btn.getAttribute("aria-expanded") === "true";
      root.querySelectorAll("[data-acc]").forEach((b) => b.setAttribute("aria-expanded", "false"));
      root.querySelectorAll("[data-acc-panel]").forEach((p) => {
        p.hidden = true;
      });
      if (!open && panel) {
        btn.setAttribute("aria-expanded", "true");
        panel.hidden = false;
      }
    });
  });

  // Base58
  root.querySelector("#tool-b58-enc")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-b58-out");
    try {
      const mode = root.querySelector("#tool-b58-mode")?.value || "hex";
      const bytes = parseInputBytes(root.querySelector("#tool-b58-in")?.value, mode);
      const check = !!root.querySelector("#tool-b58-check")?.checked;
      const r = check ? base58CheckEncode(bytes) : base58Encode(bytes);
      setOut(out, r, true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });
  root.querySelector("#tool-b58-dec")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-b58-out");
    try {
      const check = !!root.querySelector("#tool-b58-check")?.checked;
      const raw = root.querySelector("#tool-b58-in")?.value;
      const bytes = check ? base58CheckDecode(raw) : base58Decode(raw);
      setOut(out, bytesToHex(bytes), true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });

  // SHA256 / HASH256
  root.querySelector("#tool-sha-run")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-sha-out");
    try {
      const mode = root.querySelector("#tool-sha-mode")?.value || "hex";
      const kind = root.querySelector("#tool-sha-kind")?.value || "sha256";
      const bytes = parseInputBytes(root.querySelector("#tool-sha-in")?.value, mode);
      let dig;
      if (kind === "hash256") dig = hash256(bytes);
      else if (kind === "keccak") dig = keccak256(bytes);
      else dig = sha256(bytes);
      setOut(out, bytesToHex(dig), true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });

  // RIPEMD160 / HASH160
  root.querySelector("#tool-rip-run")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-rip-out");
    try {
      const mode = root.querySelector("#tool-rip-mode")?.value || "hex";
      const kind = root.querySelector("#tool-rip-kind")?.value || "ripemd160";
      const bytes = parseInputBytes(root.querySelector("#tool-rip-in")?.value, mode);
      const dig = kind === "hash160" ? hash160(bytes) : ripemd160(bytes);
      setOut(out, bytesToHex(dig), true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });

  // Calculadora BigInt
  root.querySelector("#tool-calc-run")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-calc-out");
    try {
      const a = parseBig(root.querySelector("#tool-calc-a")?.value);
      const b = parseBig(root.querySelector("#tool-calc-b")?.value);
      const op = root.querySelector("#tool-calc-op")?.value || "+";
      const asHex = root.querySelector("#tool-calc-hex")?.checked;
      let r;
      if (op === "+") r = a + b;
      else if (op === "-") r = a - b;
      else if (op === "*") r = a * b;
      else if (op === "/") {
        if (b === 0n) throw new Error("division by zero");
        r = a / b;
      }
      else if (op === "%") {
        if (b === 0n) throw new Error("mod by zero");
        r = ((a % b) + b) % b;
      }
      else if (op === "^") {
        // modular pow only if %m provided via b as exponent and m field
        const mRaw = root.querySelector("#tool-calc-m")?.value?.trim();
        if (!mRaw) throw new Error("pow: fill modulus m");
        const m = parseBig(mRaw);
        if (m <= 0n) throw new Error("invalid modulus");
        r = modPow(a, b, m);
      }
      else if (op === "gcd") r = bigGcd(a < 0n ? -a : a, b < 0n ? -b : b);
      else if (op === "inv") {
        const m = b;
        if (m <= 0n) throw new Error("invalid modulus");
        r = modInv(a, m);
      }
      else throw new Error("unknown op");
      setOut(out, fmtBig(r, asHex), true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });

  // Hex / UTF-8 / XOR
  root.querySelector("#tool-hex-to-utf8")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-hex-out");
    try {
      const bytes = parseInputBytes(root.querySelector("#tool-hex-in")?.value, "hex");
      setOut(out, bytesToUtf8(bytes), true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });
  root.querySelector("#tool-utf8-to-hex")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-hex-out");
    try {
      const bytes = utf8ToBytes(root.querySelector("#tool-hex-in")?.value);
      setOut(out, bytesToHex(bytes), true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });
  root.querySelector("#tool-hex-rev")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-hex-out");
    try {
      const bytes = parseInputBytes(root.querySelector("#tool-hex-in")?.value, "hex");
      setOut(out, bytesToHex(bytes.slice().reverse()), true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });
  root.querySelector("#tool-hex-xor")?.addEventListener("click", () => {
    const out = root.querySelector("#tool-hex-out");
    try {
      const a = parseInputBytes(root.querySelector("#tool-hex-in")?.value, "hex");
      const b = parseInputBytes(root.querySelector("#tool-hex-b")?.value, "hex");
      const n = Math.max(a.length, b.length);
      const r = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        r[i] = (a[i] || 0) ^ (b[i] || 0);
      }
      setOut(out, bytesToHex(r), true);
    } catch (e) {
      setOut(out, e.message || String(e), false);
    }
  });

  root.querySelectorAll("[data-copy-out]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.copyOut;
      const el = root.querySelector("#" + id);
      if (el?.textContent) copyBtn(el.textContent);
    });
  });
}

function bigGcd(a, b) {
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function modInv(a, m) {
  let t = 0n, newt = 1n;
  let r = m, newr = ((a % m) + m) % m;
  while (newr !== 0n) {
    const q = r / newr;
    [t, newt] = [newt, t - q * newt];
    [r, newr] = [newr, r - q * newr];
  }
  if (r > 1n) throw new Error("not invertible");
  if (t < 0n) t += m;
  return t;
}

function modPow(base, exp, mod) {
  if (mod === 1n) return 0n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  if (e < 0n) {
    b = modInv(b, mod);
    e = -e;
  }
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return r;
}
