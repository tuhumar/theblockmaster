/** SHA-512 + HMAC-SHA512 (BigInt-free Uint32 path). */

function rotr64(hi, lo, n) {
  n %= 64;
  if (n === 0) return [hi >>> 0, lo >>> 0];
  if (n < 32) {
    return [
      ((hi >>> n) | (lo << (32 - n))) >>> 0,
      ((lo >>> n) | (hi << (32 - n))) >>> 0,
    ];
  }
  n -= 32;
  return [
    ((lo >>> n) | (hi << (32 - n))) >>> 0,
    ((hi >>> n) | (lo << (32 - n))) >>> 0,
  ];
}

function shr64(hi, lo, n) {
  n %= 64;
  if (n === 0) return [hi >>> 0, lo >>> 0];
  if (n < 32) return [hi >>> n, ((lo >>> n) | (hi << (32 - n))) >>> 0];
  return [0, hi >>> (n - 32)];
}

function add64(a, b) {
  const lo = (a[1] + b[1]) >>> 0;
  const c = lo < a[1] ? 1 : 0;
  const hi = (a[0] + b[0] + c) >>> 0;
  return [hi, lo];
}

function xor64(a, b) {
  return [(a[0] ^ b[0]) >>> 0, (a[1] ^ b[1]) >>> 0];
}

function and64(a, b) {
  return [(a[0] & b[0]) >>> 0, (a[1] & b[1]) >>> 0];
}

function not64(a) {
  return [~a[0] >>> 0, ~a[1] >>> 0];
}

const K = [
  [0x428a2f98, 0xd728ae22], [0x71374491, 0x23ef65cd], [0xb5c0fbcf, 0xec4d3b2f], [0xe9b5dba5, 0x8189dbbc],
  [0x3956c25b, 0xf348b538], [0x59f111f1, 0xb605d019], [0x923f82a4, 0xaf194f9b], [0xab1c5ed5, 0xda6d8118],
  [0xd807aa98, 0xa3030242], [0x12835b01, 0x45706fbe], [0x243185be, 0x4ee4b28c], [0x550c7dc3, 0xd5ffb4e2],
  [0x72be5d74, 0xf27b896f], [0x80deb1fe, 0x3b1696b1], [0x9bdc06a7, 0x25c71235], [0xc19bf174, 0xcf692694],
  [0xe49b69c1, 0x9ef14ad2], [0xefbe4786, 0x384f25e3], [0x0fc19dc6, 0x8b8cd5b5], [0x240ca1cc, 0x77ac9c65],
  [0x2de92c6f, 0x592b0275], [0x4a7484aa, 0x6ea6e483], [0x5cb0a9dc, 0xbd41fbd4], [0x76f988da, 0x831153b5],
  [0x983e5152, 0xee66dfab], [0xa831c66d, 0x2db43210], [0xb00327c8, 0x98fb213f], [0xbf597fc7, 0xbeef0ee4],
  [0xc6e00bf3, 0x3da88fc2], [0xd5a79147, 0x930aa725], [0x06ca6351, 0xe003826f], [0x14292967, 0x0a0e6e70],
  [0x27b70a85, 0x46d22ffc], [0x2e1b2138, 0x5c26c926], [0x4d2c6dfc, 0x5ac42aed], [0x53380d13, 0x9d95b3df],
  [0x650a7354, 0x8baf63de], [0x766a0abb, 0x3c77b2a8], [0x81c2c92e, 0x47edaee6], [0x92722c85, 0x1482353b],
  [0xa2bfe8a1, 0x4cf10364], [0xa81a664b, 0xbc423001], [0xc24b8b70, 0xd0f89791], [0xc76c51a3, 0x0654be30],
  [0xd192e819, 0xd6ef5218], [0xd6990624, 0x5565a910], [0xf40e3585, 0x5771202a], [0x106aa070, 0x32bbd1b8],
  [0x19a4c116, 0xb8d2d0c8], [0x1e376c08, 0x5141ab53], [0x2748774c, 0xdf8eeb99], [0x34b0bcb5, 0xe19b48a8],
  [0x391c0cb3, 0xc5c95a63], [0x4ed8aa4a, 0xe3418acb], [0x5b9cca4f, 0x7763e373], [0x682e6ff3, 0xd6b2b8a3],
  [0x748f82ee, 0x5defb2fc], [0x78a5636f, 0x43172f60], [0x84c87814, 0xa1f0ab72], [0x8cc70208, 0x1a6439ec],
  [0x90befffa, 0x23631e28], [0xa4506ceb, 0xde82bde9], [0xbef9a3f7, 0xb2c67915], [0xc67178f2, 0xe372532b],
  [0xca273ece, 0xea26619c], [0xd186b8c7, 0x21c0c207], [0xeada7dd6, 0xcde0eb1e], [0xf57d4f7f, 0xee6ed178],
  [0x06f067aa, 0x72176fba], [0x0a637dc5, 0xa2c898a6], [0x113f9804, 0xbef90dae], [0x1b710b35, 0x131c471b],
  [0x28db77f5, 0x23047d84], [0x32caab7b, 0x40c72493], [0x3c9ebe0a, 0x15c9bebc], [0x431d67c4, 0x9c100d4c],
  [0x4cc5d4be, 0xcb3e42b6], [0x597f299c, 0xfc657e2a], [0x5fcb6fab, 0x3ad6faec], [0x6c44198c, 0x4a475817],
];

export function sha512(bytes) {
  let h = [
    [0x6a09e667, 0xf3bcc908], [0xbb67ae85, 0x84caa73b], [0x3c6ef372, 0xfe94f82b], [0xa54ff53a, 0x5f1d36f1],
    [0x510e527f, 0xade682d1], [0x9b05688c, 0x2b3e6c1f], [0x1f83d9ab, 0xfb41bd6b], [0x5be0cd19, 0x137e2179],
  ];
  const bitLen = BigInt(bytes.length) * 8n;
  const withPad = bytes.length + 1 + 16;
  const nBlocks = Math.ceil(withPad / 128);
  const buf = new Uint8Array(nBlocks * 128);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  // length as 128-bit big-endian; we only need low 64 for practical sizes
  const hi = Number((bitLen >> 32n) & 0xffffffffn);
  const lo = Number(bitLen & 0xffffffffn);
  dv.setUint32(buf.length - 8, hi, false);
  dv.setUint32(buf.length - 4, lo, false);

  const w = Array.from({ length: 80 }, () => [0, 0]);
  for (let i = 0; i < nBlocks; i++) {
    const off = i * 128;
    for (let t = 0; t < 16; t++) {
      w[t] = [dv.getUint32(off + t * 8, false), dv.getUint32(off + t * 8 + 4, false)];
    }
    for (let t = 16; t < 80; t++) {
      const s0 = xor64(xor64(rotr64(w[t - 15][0], w[t - 15][1], 1), rotr64(w[t - 15][0], w[t - 15][1], 8)), shr64(w[t - 15][0], w[t - 15][1], 7));
      const s1 = xor64(xor64(rotr64(w[t - 2][0], w[t - 2][1], 19), rotr64(w[t - 2][0], w[t - 2][1], 61)), shr64(w[t - 2][0], w[t - 2][1], 6));
      w[t] = add64(add64(add64(w[t - 16], s0), w[t - 7]), s1);
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 80; t++) {
      const S1 = xor64(xor64(rotr64(e[0], e[1], 14), rotr64(e[0], e[1], 18)), rotr64(e[0], e[1], 41));
      const ch = xor64(and64(e, f), and64(not64(e), g));
      const t1 = add64(add64(add64(add64(hh, S1), ch), K[t]), w[t]);
      const S0 = xor64(xor64(rotr64(a[0], a[1], 28), rotr64(a[0], a[1], 34)), rotr64(a[0], a[1], 39));
      const maj = xor64(xor64(and64(a, b), and64(a, c)), and64(b, c));
      const t2 = add64(S0, maj);
      hh = g; g = f; f = e; e = add64(d, t1); d = c; c = b; b = a; a = add64(t1, t2);
    }
    h = [
      add64(h[0], a), add64(h[1], b), add64(h[2], c), add64(h[3], d),
      add64(h[4], e), add64(h[5], f), add64(h[6], g), add64(h[7], hh),
    ];
  }
  const out = new Uint8Array(64);
  const o = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    o.setUint32(i * 8, h[i][0], false);
    o.setUint32(i * 8 + 4, h[i][1], false);
  }
  return out;
}

export function hmacSha512(keyBytes, msgBytes) {
  const block = 128;
  let key = keyBytes;
  if (key.length > block) key = sha512(key);
  const kpad = new Uint8Array(block);
  kpad.set(key);
  const ipad = new Uint8Array(block);
  const opad = new Uint8Array(block);
  for (let i = 0; i < block; i++) {
    ipad[i] = kpad[i] ^ 0x36;
    opad[i] = kpad[i] ^ 0x5c;
  }
  const inner = new Uint8Array(block + msgBytes.length);
  inner.set(ipad);
  inner.set(msgBytes, block);
  const ih = sha512(inner);
  const outer = new Uint8Array(block + 64);
  outer.set(opad);
  outer.set(ih, block);
  return sha512(outer);
}

export function pbkdf2HmacSha512(passwordBytes, saltBytes, iterations, dkLen) {
  const blocks = Math.ceil(dkLen / 64);
  const out = new Uint8Array(blocks * 64);
  for (let i = 1; i <= blocks; i++) {
    const block = new Uint8Array(saltBytes.length + 4);
    block.set(saltBytes);
    block[saltBytes.length] = (i >>> 24) & 0xff;
    block[saltBytes.length + 1] = (i >>> 16) & 0xff;
    block[saltBytes.length + 2] = (i >>> 8) & 0xff;
    block[saltBytes.length + 3] = i & 0xff;
    let u = hmacSha512(passwordBytes, block);
    const t = new Uint8Array(u);
    for (let j = 1; j < iterations; j++) {
      u = hmacSha512(passwordBytes, u);
      for (let k = 0; k < 64; k++) t[k] ^= u[k];
    }
    out.set(t, (i - 1) * 64);
  }
  return out.slice(0, dkLen);
}
