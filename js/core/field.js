import { mod, modAdd, modSub, modMul, modInv, modPow } from "./modular.js";
import { P } from "./secp256k1.js";

export function fAdd(a, b) { return modAdd(a, b, P); }
export function fSub(a, b) { return modSub(a, b, P); }
export function fMul(a, b) { return modMul(a, b, P); }
export function fInv(a) { return modInv(a, P); }
export function fPow(a, e) { return modPow(a, e, P); }
export function fMod(a) { return mod(a, P); }

/** Tonelli for p ≡ 3 (mod 4). */
export function fSqrt(a) {
  a = fMod(a);
  return fPow(a, (P + 1n) / 4n);
}
