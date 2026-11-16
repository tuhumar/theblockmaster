/** Modular arithmetic helpers (BigInt). */
export function mod(a, m) {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

export function modAdd(a, b, m) {
  return mod(a + b, m);
}

export function modSub(a, b, m) {
  return mod(a - b, m);
}

export function modMul(a, b, m) {
  return mod(a * b, m);
}

/** Modular inverse via BigInt pow (m prime or coprime). */
export function modInv(a, m) {
  a = mod(a, m);
  if (a === 0n) throw new Error("inverse of 0");
  return modPow(a, m - 2n, m);
}

export function modPow(base, exp, m) {
  base = mod(base, m);
  let result = 1n;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = modMul(result, base, m);
    base = modMul(base, base, m);
    e >>= 1n;
  }
  return result;
}

export function hexToBig(h) {
  h = String(h).trim().toLowerCase().replace(/^0x/, "");
  if (!h) return 0n;
  if (!/^[0-9a-f]+$/.test(h)) throw new Error("invalid hex");
  return BigInt("0x" + h);
}

export function bigToHex(n, width = 0) {
  let h = n.toString(16);
  if (width > 0) h = h.padStart(width, "0");
  return h;
}

export function bigToBin(n, width = 0) {
  let b = n.toString(2);
  if (width > 0) b = b.padStart(width, "0");
  return b;
}
