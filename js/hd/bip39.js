/**
 * BIP39 — mnemonic ↔ seed (English).
 * UX inspired by Ian Coleman BIP39 tool (MIT).
 */
import { sha256, bytesToHex, hexToBytes } from "../core/hash.js";
import { pbkdf2HmacSha512 } from "./sha512.js";
import { WORDLIST_EN } from "./wordlist-en.js";

const enc = new TextEncoder();

function bytesToBits(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(2).padStart(8, "0");
  return s;
}

function bitsToBytes(bits) {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return out;
}

/** strength bits: 128|160|192|224|256 → 12..24 words */
export function generateMnemonic(strength = 128) {
  if (![128, 160, 192, 224, 256].includes(strength)) {
    throw new Error("strength must be 128/160/192/224/256");
  }
  const ent = new Uint8Array(strength / 8);
  crypto.getRandomValues(ent);
  return entropyToMnemonic(ent);
}

export function entropyToMnemonic(entropyBytes) {
  const entBits = entropyBytes.length * 8;
  if (![128, 160, 192, 224, 256].includes(entBits)) {
    throw new Error("invalid entropy length");
  }
  const csLen = entBits / 32;
  const hash = sha256(entropyBytes);
  const bits = bytesToBits(entropyBytes) + bytesToBits(hash).slice(0, csLen);
  const words = [];
  for (let i = 0; i < bits.length; i += 11) {
    const idx = parseInt(bits.slice(i, i + 11), 2);
    words.push(WORDLIST_EN[idx]);
  }
  return words.join(" ");
}

export function mnemonicToEntropy(phrase) {
  const words = normalizeMnemonic(phrase);
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    throw new Error("mnemonic must be 12/15/18/21/24 words");
  }
  const bits = words
    .map((w) => {
      const i = WORDLIST_EN.indexOf(w);
      if (i < 0) throw new Error(`unknown word: ${w}`);
      return i.toString(2).padStart(11, "0");
    })
    .join("");
  const entLen = (bits.length * 32) / 33;
  const entBits = bits.slice(0, entLen);
  const csBits = bits.slice(entLen);
  const entropy = bitsToBytes(entBits);
  const hash = sha256(entropy);
  const expect = bytesToBits(hash).slice(0, csBits.length);
  if (csBits !== expect) throw new Error("invalid checksum");
  return entropy;
}

export function validateMnemonic(phrase) {
  try {
    mnemonicToEntropy(phrase);
    return true;
  } catch {
    return false;
  }
}

export function normalizeMnemonic(phrase) {
  return String(phrase || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** BIP39 seed = PBKDF2-HMAC-SHA512(mnemonic, "mnemonic"+passphrase, 2048, 64) */
export function mnemonicToSeed(phrase, passphrase = "") {
  const norm = normalizeMnemonic(phrase).join(" ");
  mnemonicToEntropy(norm); // validate
  const pw = enc.encode(norm);
  const salt = enc.encode("mnemonic" + String(passphrase || ""));
  return pbkdf2HmacSha512(pw, salt, 2048, 64);
}

export function mnemonicToSeedHex(phrase, passphrase = "") {
  return bytesToHex(mnemonicToSeed(phrase, passphrase));
}

export { WORDLIST_EN, hexToBytes, bytesToHex };
