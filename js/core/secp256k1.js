/** secp256k1 curve constants. */
export const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export const A = 0n;
export const B = 7n;
export const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
export const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

export const CURVE = {
  name: "secp256k1",
  p: P,
  n: N,
  a: A,
  b: B,
  Gx: GX,
  Gy: GY,
};
