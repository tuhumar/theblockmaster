/**
 * Derive WIF / pubkeys / BTC addresses / ETH from private key.
 * Algoritmo puro — zero IA.
 */
import { hexToBig, bigToHex, mod } from "./modular.js";
import { N } from "./secp256k1.js";
import {
  G,
  scalarMulFast,
  compress,
  fmtPt,
  point,
  addDetailed,
  isInf,
} from "./point.js";
import { fSub } from "./field.js";
import { hash160, sha256, keccak256, hexToBytes, bytesToHex } from "./hash.js";
import {
  base58CheckEncode,
  base58CheckDecode,
  bech32Encode,
  bech32mEncode,
} from "./encoding.js";

function privToBytes32(k) {
  return hexToBytes(bigToHex(k, 64));
}

function concatBytes(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function wifEncode(k, compressed) {
  const body = compressed
    ? concatBytes(new Uint8Array([0x80]), privToBytes32(k), new Uint8Array([0x01]))
    : concatBytes(new Uint8Array([0x80]), privToBytes32(k));
  return base58CheckEncode(body);
}

/** Decode WIF → { privHex, compressed }. Throws on bad checksum / version. */
export function wifDecode(wif) {
  const payload = base58CheckDecode(String(wif || "").trim());
  if (payload[0] !== 0x80) throw new Error("not a mainnet WIF (expected 0x80)");
  let compressed = false;
  let key;
  if (payload.length === 33) {
    key = payload.slice(1);
  } else if (payload.length === 34 && payload[33] === 0x01) {
    key = payload.slice(1, 33);
    compressed = true;
  } else {
    throw new Error("invalid WIF payload length");
  }
  const privHex = bytesToHex(key);
  const k = hexToBig(privHex);
  if (k <= 0n || k >= N) throw new Error("WIF private out of range");
  return { privHex, compressed };
}

function p2pkh(h160) {
  return base58CheckEncode(concatBytes(new Uint8Array([0x00]), h160));
}

function p2sh(h160) {
  return base58CheckEncode(concatBytes(new Uint8Array([0x05]), h160));
}

function p2wpkh(h160) {
  return bech32Encode("bc", 0, h160);
}

function p2tr(xOnly32) {
  return bech32mEncode("bc", 1, xOnly32);
}

function evenY(Pt) {
  if (Pt.y % 2n === 0n) return Pt;
  return point(Pt.x, fSub(0n, Pt.y));
}

/** BIP340 tagged hash. */
function taggedHash(tagStr, msgBytes) {
  const tag = new TextEncoder().encode(tagStr);
  const th = sha256(tag);
  return sha256(concatBytes(th, th, msgBytes));
}

/** BIP341 key-path: Q = P_even + hash_TapTweak(x(P))·G */
function taprootXOnly(Pt) {
  const evenP = evenY(Pt);
  const xonly = hexToBytes(bigToHex(evenP.x, 64));
  const tweak = taggedHash("TapTweak", xonly);
  const t = mod(BigInt("0x" + bytesToHex(tweak)), N);
  const T = scalarMulFast(t, G());
  const Q = addDetailed(evenP, T).point;
  return hexToBytes(bigToHex(evenY(Q).x, 64));
}

/**
 * @param {string} privHex
 */
export function deriveFromPrivate(privHex) {
  const k = hexToBig(privHex);
  if (k <= 0n || k >= N) throw new Error("private out of [1, n−1]");

  const Q = scalarMulFast(k, G());
  if (isInf(Q)) throw new Error("Q=∞");

  const pubC = compress(Q);
  const pubU = "04" + bigToHex(Q.x, 64) + bigToHex(Q.y, 64);
  const pubCbytes = hexToBytes(pubC);
  const pubUbytes = hexToBytes(pubU);

  const h160c = hash160(pubCbytes);
  const h160u = hash160(pubUbytes);

  const redeem = concatBytes(new Uint8Array([0x00, 0x14]), h160c);
  const h160redeem = hash160(redeem);

  const ethHash = keccak256(pubUbytes.slice(1));
  const eth = "0x" + bytesToHex(ethHash.slice(12));

  return {
    priv_hex: bigToHex(k, 64),
    priv_dec: k.toString(10),
    wif_compressed: wifEncode(k, true),
    wif_uncompressed: wifEncode(k, false),
    pubkey_compressed: pubC,
    pubkey_uncompressed: pubU,
    hash160_compressed: bytesToHex(h160c),
    hash160_uncompressed: bytesToHex(h160u),
    btc_p2pkh_compressed: p2pkh(h160c),
    btc_p2pkh_uncompressed: p2pkh(h160u),
    btc_p2sh_p2wpkh: p2sh(h160redeem),
    btc_p2wpkh: p2wpkh(h160c),
    btc_p2tr: p2tr(taprootXOnly(Q)),
    eth_address: eth,
    // mesmo endereço 0x (secp256k1 + keccak); saldo em outra chain
    bnb_address: eth,
    point: fmtPt(Q),
  };
}

export function emptyDerived() {
  return {
    priv_hex: "",
    priv_dec: "",
    wif_compressed: "",
    wif_uncompressed: "",
    pubkey_compressed: "",
    pubkey_uncompressed: "",
    hash160_compressed: "",
    hash160_uncompressed: "",
    btc_p2pkh_compressed: "",
    btc_p2pkh_uncompressed: "",
    btc_p2sh_p2wpkh: "",
    btc_p2wpkh: "",
    btc_p2tr: "",
    eth_address: "",
    bnb_address: "",
  };
}
