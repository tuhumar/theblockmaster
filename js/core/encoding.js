import { hash256 } from "./hash.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let s = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) s += B58[digits[i]];
  return s;
}

export function base58Decode(str) {
  const s = String(str || "").trim();
  if (!s) throw new Error("empty base58");
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros++;
  const digits = [0];
  for (let i = zeros; i < s.length; i++) {
    const v = B58.indexOf(s[i]);
    if (v < 0) throw new Error(`invalid base58: '${s[i]}'`);
    let carry = v;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 58;
      digits[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      digits.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + digits.length);
  for (let i = 0; i < digits.length; i++) out[out.length - 1 - i] = digits[i];
  return out;
}

export function base58CheckEncode(versionedPayload) {
  const checksum = hash256(versionedPayload).slice(0, 4);
  const full = new Uint8Array(versionedPayload.length + 4);
  full.set(versionedPayload);
  full.set(checksum, versionedPayload.length);
  return base58Encode(full);
}

export function base58CheckDecode(str) {
  const full = base58Decode(str);
  if (full.length < 5) throw new Error("base58check too short");
  const payload = full.slice(0, -4);
  const checksum = full.slice(-4);
  const expect = hash256(payload).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expect[i]) throw new Error("invalid checksum");
  }
  return payload;
}

/** Bech32 / Bech32m (BIP173 / BIP350). */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GENERATOR[i];
  }
  return chk;
}

function hrpExpand(hrp) {
  const out = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits) ret.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    throw new Error("convertBits");
  }
  return ret;
}

function encodeBech(hrp, witver, witprog, spec /* "bech32" | "bech32m" */) {
  const data = [witver].concat(convertBits(witprog, 8, 5, true));
  const constXor = spec === "bech32m" ? 0x2bc830a3 : 1;
  const values = hrpExpand(hrp).concat(data);
  const mod = polymod(values.concat([0, 0, 0, 0, 0, 0])) ^ constXor;
  const checksum = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + data.concat(checksum).map((d) => CHARSET[d]).join("");
}

export function bech32Encode(hrp, witver, witprog) {
  return encodeBech(hrp, witver, [...witprog], "bech32");
}

export function bech32mEncode(hrp, witver, witprog) {
  return encodeBech(hrp, witver, [...witprog], "bech32m");
}
