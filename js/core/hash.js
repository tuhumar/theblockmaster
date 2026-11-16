/** Sync SHA-256 / RIPEMD-160 / Keccak-256 (Uint8Array). */

function rotr(n, x) {
  return (x >>> n) | (x << (32 - n));
}

export function sha256(bytes) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const l = bytes.length;
  const bitLen = l * 8;
  const withPad = l + 1 + 8;
  const nBlocks = (withPad + 63) >> 6;
  const buf = new Uint8Array(nBlocks * 64);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(buf.length - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let i = 0; i < nBlocks; i++) {
    const off = i * 64;
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const o = new DataView(out.buffer);
  o.setUint32(0, h0, false); o.setUint32(4, h1, false); o.setUint32(8, h2, false); o.setUint32(12, h3, false);
  o.setUint32(16, h4, false); o.setUint32(20, h5, false); o.setUint32(24, h6, false); o.setUint32(28, h7, false);
  return out;
}

export function ripemd160(bytes) {
  const zl = [
    0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,
    3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,
    4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13,
  ];
  const zr = [
    5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,
    15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,
    12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11,
  ];
  const sl = [
    11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,
    11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,
    9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6,
  ];
  const sr = [
    8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,
    9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,
    8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11,
  ];
  const hl = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
  const hr = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

  function f(j, x, y, z) {
    if (j < 16) return x ^ y ^ z;
    if (j < 32) return (x & y) | (~x & z);
    if (j < 48) return (x | ~y) ^ z;
    if (j < 64) return (x & z) | (y & ~z);
    return x ^ (y | ~z);
  }
  function rotl(n, x) {
    return (x << n) | (x >>> (32 - n));
  }

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const l = bytes.length;
  const nBlocks = (l + 1 + 8 + 63) >> 6;
  const buf = new Uint8Array(nBlocks * 64);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  const bitLen = l * 8;
  dv.setUint32(buf.length - 8, bitLen >>> 0, true);
  dv.setUint32(buf.length - 4, Math.floor(bitLen / 0x100000000), true);

  for (let i = 0; i < nBlocks; i++) {
    const off = i * 64;
    const X = new Uint32Array(16);
    for (let t = 0; t < 16; t++) X[t] = dv.getUint32(off + t * 4, true);
    let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
    let ar = h0, br = h1, cr = h2, dr = h3, er = h4;
    for (let j = 0; j < 80; j++) {
      let t = (al + f(j, bl, cl, dl) + X[zl[j]] + hl[(j / 16) | 0]) >>> 0;
      t = (rotl(sl[j], t) + el) >>> 0;
      al = el; el = dl; dl = rotl(10, cl); cl = bl; bl = t;
      t = (ar + f(79 - j, br, cr, dr) + X[zr[j]] + hr[(j / 16) | 0]) >>> 0;
      t = (rotl(sr[j], t) + er) >>> 0;
      ar = er; er = dr; dr = rotl(10, cr); cr = br; br = t;
    }
    const t = (h1 + cl + dr) >>> 0;
    h1 = (h2 + dl + er) >>> 0;
    h2 = (h3 + el + ar) >>> 0;
    h3 = (h4 + al + br) >>> 0;
    h4 = (h0 + bl + cr) >>> 0;
    h0 = t;
  }
  const out = new Uint8Array(20);
  const o = new DataView(out.buffer);
  o.setUint32(0, h0, true); o.setUint32(4, h1, true); o.setUint32(8, h2, true);
  o.setUint32(12, h3, true); o.setUint32(16, h4, true);
  return out;
}

export function hash160(bytes) {
  return ripemd160(sha256(bytes));
}

export function hash256(bytes) {
  return sha256(sha256(bytes));
}

/** Keccak-256 (Ethereum). */
export function keccak256(input) {
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];
  const R = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
  ];
  const s = Array.from({ length: 5 }, () => new BigUint64Array(5));
  const rate = 136;
  const msg = input instanceof Uint8Array ? input : new Uint8Array(input);

  function rot(x, n) {
    n %= 64;
    return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & 0xffffffffffffffffn;
  }

  function keccakF() {
    for (let round = 0; round < 24; round++) {
      const C = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) C[x] = s[x][0] ^ s[x][1] ^ s[x][2] ^ s[x][3] ^ s[x][4];
      const D = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rot(C[(x + 1) % 5], 1);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x][y] ^= D[x];
      const B = Array.from({ length: 5 }, () => new BigUint64Array(5));
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) B[y][(2 * x + 3 * y) % 5] = rot(s[x][y], R[x][y]);
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          s[x][y] = B[x][y] ^ (~B[(x + 1) % 5][y] & B[(x + 2) % 5][y]);
        }
      }
      s[0][0] ^= RC[round];
    }
  }

  let offset = 0;
  while (offset < msg.length) {
    const take = Math.min(rate, msg.length - offset);
    for (let i = 0; i < take; i++) {
      const lane = (i / 8) | 0;
      s[lane % 5][(lane / 5) | 0] ^= BigInt(msg[offset + i]) << BigInt(8 * (i % 8));
    }
    offset += take;
    if (take === rate) keccakF();
  }
  {
    const i = msg.length % rate;
    const lane = (i / 8) | 0;
    s[lane % 5][(lane / 5) | 0] ^= 0x01n << BigInt(8 * (i % 8));
  }
  {
    const i = rate - 1;
    const lane = (i / 8) | 0;
    s[lane % 5][(lane / 5) | 0] ^= 0x80n << BigInt(8 * (i % 8));
  }
  keccakF();

  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const lane = (i / 8) | 0;
    out[i] = Number((s[lane % 5][(lane / 5) | 0] >> BigInt(8 * (i % 8))) & 0xffn);
  }
  return out;
}

export function bytesToHex(b) {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(h) {
  h = String(h).trim().toLowerCase().replace(/^0x/, "");
  if (h.length % 2) h = "0" + h;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
