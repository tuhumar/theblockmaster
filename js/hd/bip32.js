/**
 * BIP32 HD keys — UX inspired by bip32.org (public domain brainwallet lineage).
 */
import { hmacSha512 } from "./sha512.js";
import { hash160, bytesToHex, hexToBytes } from "../core/hash.js";
import { N } from "../core/secp256k1.js";
import { G, scalarMulFast, compress, decompress, addDetailed, isInf } from "../core/point.js";
import { mod, bigToHex, hexToBig } from "../core/modular.js";
import { base58CheckEncode, base58CheckDecode } from "../core/encoding.js";
import { deriveFromPrivate, wifEncode } from "../core/formats.js";

export const HARDENED = 0x80000000;

const VERSIONS = {
  xprv: 0x0488ade4,
  xpub: 0x0488b2fe,
};

function concat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function ser32(i) {
  return new Uint8Array([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]);
}

function ser256(k) {
  return hexToBytes(bigToHex(k, 64));
}

function parse256(bytes) {
  return hexToBig(bytesToHex(bytes));
}

function ensurePub(node) {
  if (node.publicKey) return node.publicKey;
  const Q = scalarMulFast(node.privateKey, G());
  node.publicKey = hexToBytes(compress(Q));
  return node.publicKey;
}

export function fromSeed(seedBytes) {
  if (seedBytes.length < 16 || seedBytes.length > 64) {
    throw new Error("seed length must be 16..64 bytes");
  }
  const I = hmacSha512(new TextEncoder().encode("Bitcoin seed"), seedBytes);
  const k = parse256(I.slice(0, 32));
  if (k === 0n || k >= N) throw new Error("invalid master key from seed");
  return {
    depth: 0,
    parentFingerprint: new Uint8Array(4),
    index: 0,
    chainCode: I.slice(32),
    privateKey: k,
    publicKey: null,
  };
}

export function neuter(node) {
  const pub = ensurePub(node).slice();
  return {
    depth: node.depth,
    parentFingerprint: node.parentFingerprint.slice(),
    index: node.index,
    chainCode: node.chainCode.slice(),
    privateKey: null,
    publicKey: pub,
  };
}

export function deriveChild(node, index) {
  index = index >>> 0;
  const hardened = index >= HARDENED;
  let data;
  if (hardened) {
    if (node.privateKey == null) throw new Error("cannot derive hardened child from xpub");
    data = concat(new Uint8Array([0]), ser256(node.privateKey), ser32(index));
  } else {
    data = concat(ensurePub(node), ser32(index));
  }
  const I = hmacSha512(node.chainCode, data);
  const IL = parse256(I.slice(0, 32));
  const IR = I.slice(32);
  if (IL >= N) throw new Error("invalid child IL ≥ n");

  const fp = hash160(ensurePub(node)).slice(0, 4);

  if (node.privateKey != null) {
    const ki = mod(IL + node.privateKey, N);
    if (ki === 0n) throw new Error("invalid child private key");
    return {
      depth: node.depth + 1,
      parentFingerprint: fp,
      index,
      chainCode: IR,
      privateKey: ki,
      publicKey: null,
    };
  }

  const Pi = scalarMulFast(IL, G());
  const Kpar = decompress(bytesToHex(node.publicKey));
  const Ki = addDetailed(Pi, Kpar).point;
  if (isInf(Ki)) throw new Error("invalid child point ∞");
  return {
    depth: node.depth + 1,
    parentFingerprint: fp,
    index,
    chainCode: IR,
    privateKey: null,
    publicKey: hexToBytes(compress(Ki)),
  };
}

/** Parse m/44'/0'/0'/0/0 */
export function parsePath(path) {
  const s = String(path || "").trim();
  if (!s || s === "m") return [];
  if (!s.startsWith("m/") && !s.startsWith("M/")) {
    throw new Error("path must start with m/");
  }
  return s
    .slice(2)
    .split("/")
    .filter(Boolean)
    .map((p) => {
      const hard = p.endsWith("'") || p.endsWith("h") || p.endsWith("H");
      const n = parseInt(hard ? p.slice(0, -1) : p, 10);
      if (!Number.isFinite(n) || n < 0) throw new Error(`bad path segment: ${p}`);
      return hard ? (n + HARDENED) >>> 0 : n >>> 0;
    });
}

export function derivePath(node, path) {
  let cur = node;
  for (const i of parsePath(path)) cur = deriveChild(cur, i);
  return cur;
}

export function toBase58(node, { private: wantPriv = true } = {}) {
  const hasPriv = node.privateKey != null;
  if (wantPriv && !hasPriv) throw new Error("no private key");
  const version = wantPriv ? VERSIONS.xprv : VERSIONS.xpub;
  const payload = new Uint8Array(78);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, version, false);
  payload[4] = node.depth & 0xff;
  payload.set(node.parentFingerprint, 5);
  dv.setUint32(9, node.index >>> 0, false);
  payload.set(node.chainCode, 13);
  if (wantPriv) {
    payload[45] = 0;
    payload.set(ser256(node.privateKey), 46);
  } else {
    payload.set(ensurePub(node), 45);
  }
  return base58CheckEncode(payload);
}

export function fromBase58(xkey) {
  const payload = base58CheckDecode(String(xkey || "").trim());
  if (payload.length !== 78) throw new Error("invalid extended key length");
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const version = dv.getUint32(0, false);
  const isPriv = version === VERSIONS.xprv;
  const isPub = version === VERSIONS.xpub;
  if (!isPriv && !isPub) throw new Error("unsupported version (need xprv/xpub)");
  const depth = payload[4];
  const parentFingerprint = payload.slice(5, 9);
  const index = dv.getUint32(9, false);
  const chainCode = payload.slice(13, 45);
  let privateKey = null;
  let publicKey = null;
  if (isPriv) {
    if (payload[45] !== 0) throw new Error("invalid xprv key prefix");
    privateKey = parse256(payload.slice(46, 78));
    if (privateKey === 0n || privateKey >= N) throw new Error("invalid xprv scalar");
  } else {
    publicKey = payload.slice(45, 78);
    decompress(bytesToHex(publicKey)); // validate
  }
  return { depth, parentFingerprint, index, chainCode, privateKey, publicKey };
}

export function nodeInfo(node) {
  const pub = ensurePub(node);
  const hasPriv = node.privateKey != null;
  return {
    version: hasPriv ? "xprv" : "xpub",
    depth: node.depth,
    parentFingerprint: bytesToHex(node.parentFingerprint),
    index: node.index,
    indexDisplay:
      node.index >= HARDENED ? `${node.index - HARDENED}'` : String(node.index),
    chainCode: bytesToHex(node.chainCode),
    key: hasPriv ? bigToHex(node.privateKey, 64) : bytesToHex(pub),
    xprv: hasPriv ? toBase58(node, { private: true }) : "",
    xpub: toBase58(hasPriv ? neuter(node) : node, { private: false }),
    publicKey: bytesToHex(pub),
  };
}

export function nodeToDerived(node) {
  if (node.privateKey == null) {
    const pub = bytesToHex(ensurePub(node));
    return {
      priv_hex: "",
      wif_compressed: "",
      pubkey_compressed: pub,
      btc_p2pkh_compressed: "",
      btc_p2wpkh: "",
      eth_address: "",
    };
  }
  const d = deriveFromPrivate(bigToHex(node.privateKey, 64));
  return {
    priv_hex: d.priv_hex,
    wif_compressed: d.wif_compressed,
    pubkey_compressed: d.pubkey_compressed,
    btc_p2pkh_compressed: d.btc_p2pkh_compressed,
    btc_p2wpkh: d.btc_p2wpkh,
    eth_address: d.eth_address,
  };
}

export function pathIndexLabel(i) {
  return i >= HARDENED ? `${i - HARDENED}'` : String(i);
}

export { wifEncode, bytesToHex, bigToHex };
