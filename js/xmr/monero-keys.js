/**
 * Monero keys + standard address (mainnet/stagenet/testnet).
 * Ed25519 via noble-ed25519 (MIT · Paul Miller).
 */
import { ExtendedPoint, CURVE } from "./noble-ed25519.js";
import { keccak256, bytesToHex, hexToBytes } from "../core/hash.js";

export const L = CURVE.n; // ed25519 group order
export const NET = { mainnet: 0x12, stagenet: 0x18, testnet: 0x35 };

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BLOCK_OUT = [0, 2, 3, 5, 6, 7, 9, 10, 11];

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

/** Little-endian 32 bytes → BigInt */
export function leBytesToBig(bytes) {
  let n = 0n;
  for (let i = 31; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  return n;
}

export function bigToLeBytes(n, len = 32) {
  const out = new Uint8Array(len);
  let x = n;
  for (let i = 0; i < len; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Monero sc_reduce32 */
export function scReduce32(bytes32) {
  const n = leBytesToBig(bytes32) % L;
  return bigToLeBytes(n);
}

export function randomSpendPriv() {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return scReduce32(raw);
}

export function viewPrivFromSpend(spendPrivLE) {
  return scReduce32(keccak256(spendPrivLE));
}

export function pubFromPriv(privLE) {
  const a = leBytesToBig(privLE);
  if (a === 0n || a >= L) throw new Error("invalid scalar");
  return ExtendedPoint.BASE.multiply(a).toRawBytes();
}

export function xmrBase58Encode(data) {
  let result = "";
  const full = Math.floor(data.length / 8);
  for (let i = 0; i < full; i++) {
    result += encodeBlock(data.slice(i * 8, i * 8 + 8), 11);
  }
  const rem = data.length % 8;
  if (rem) result += encodeBlock(data.slice(full * 8), BLOCK_OUT[rem]);
  return result;
}

function encodeBlock(data, padLen) {
  let n = 0n;
  for (let i = 0; i < data.length; i++) n = (n << 8n) | BigInt(data[i]);
  let s = "";
  while (n > 0n) {
    s = ALPHA[Number(n % 58n)] + s;
    n /= 58n;
  }
  while (s.length < padLen) s = "1" + s;
  return s;
}

export function xmrBase58Decode(str) {
  const s = String(str || "").trim();
  // full address 95 chars → 69 bytes: 8*8 + 5 → 8*11 + 7 = 95
  const fullBlocks = Math.floor(s.length / 11);
  const remChars = s.length % 11;
  const remBytes = BLOCK_OUT.indexOf(remChars);
  if (remChars && remBytes < 0) throw new Error("invalid base58 length");
  const out = [];
  for (let i = 0; i < fullBlocks; i++) {
    out.push(...decodeBlock(s.slice(i * 11, i * 11 + 11), 8));
  }
  if (remChars) {
    out.push(...decodeBlock(s.slice(fullBlocks * 11), remBytes));
  }
  return new Uint8Array(out);
}

function decodeBlock(block, outLen) {
  let n = 0n;
  for (const ch of block) {
    const v = ALPHA.indexOf(ch);
    if (v < 0) throw new Error(`bad base58 char: ${ch}`);
    n = n * 58n + BigInt(v);
  }
  const bytes = [];
  for (let i = 0; i < outLen; i++) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  if (n !== 0n) throw new Error("base58 overflow");
  return bytes.reverse();
}

export function encodeStandardAddress(pubSpend, pubView, network = NET.mainnet) {
  const body = new Uint8Array(65);
  body[0] = network;
  body.set(pubSpend, 1);
  body.set(pubView, 33);
  const checksum = keccak256(body).slice(0, 4);
  return xmrBase58Encode(concat(body, checksum));
}

export function decodeStandardAddress(addr) {
  const raw = xmrBase58Decode(addr);
  if (raw.length !== 69) throw new Error(`expected 69 bytes, got ${raw.length}`);
  const body = raw.slice(0, 65);
  const checksum = raw.slice(65);
  const expect = keccak256(body).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expect[i]) throw new Error("bad checksum");
  }
  return {
    network: body[0],
    pubSpend: body.slice(1, 33),
    pubView: body.slice(33, 65),
  };
}

export function deriveWallet(spendPrivHexOrBytes, network = NET.mainnet) {
  let spend =
    typeof spendPrivHexOrBytes === "string"
      ? hexToBytes(spendPrivHexOrBytes.replace(/^0x/i, ""))
      : spendPrivHexOrBytes;
  if (spend.length !== 32) throw new Error("spend key must be 32 bytes");
  spend = scReduce32(spend);
  const view = viewPrivFromSpend(spend);
  const pubSpend = pubFromPriv(spend);
  const pubView = pubFromPriv(view);
  const address = encodeStandardAddress(pubSpend, pubView, network);
  return {
    spendPriv: spend,
    viewPriv: view,
    pubSpend,
    pubView,
    address,
    spendPrivHex: bytesToHex(spend),
    viewPrivHex: bytesToHex(view),
    pubSpendHex: bytesToHex(pubSpend),
    pubViewHex: bytesToHex(pubView),
  };
}

/** Educational MSB-first scalar mul chain on ed25519 (like EQIR D&A). */
export function scalarMulTrace(scalarLE) {
  let k = leBytesToBig(scalarLE) % L;
  if (k === 0n) return { point: ExtendedPoint.ZERO, ops: [], bits: [] };
  const bits = [];
  let t = k;
  while (t > 0n) {
    bits.push(Number(t & 1n));
    t >>= 1n;
  }
  const ops = [];
  let R = ExtendedPoint.ZERO;
  for (let i = bits.length - 1; i >= 0; i--) {
    const before = R;
    R = R.add(R);
    ops.push({
      kind: "double",
      bitIndex: i,
      bit: bits[i],
      before: before.toHex(),
      after: R.toHex(),
    });
    if (bits[i] === 1) {
      const b2 = R;
      R = R.add(ExtendedPoint.BASE);
      ops.push({
        kind: "add",
        bitIndex: i,
        bit: 1,
        before: b2.toHex(),
        after: R.toHex(),
      });
    }
  }
  return {
    point: R,
    pub: R.toRawBytes(),
    pubHex: bytesToHex(R.toRawBytes()),
    bitLength: bits.length,
    bitsLSB: bits,
    bitsMSB: [...bits].reverse(),
    ops,
  };
}

export { bytesToHex, hexToBytes, ExtendedPoint };
