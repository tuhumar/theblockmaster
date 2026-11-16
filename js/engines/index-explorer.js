import { bigToHex, bigToBin } from "../core/modular.js";

/**
 * INDEX EXPLORER — inspect each bit index from a forward run or reverse session.
 */
export function exploreFromForward(forwardRecord, bitIndex) {
  const i = Number(bitIndex);
  const row = forwardRecord.indexMap.find((r) => r.bitIndex === i);
  if (!row) throw new Error(`index ${i} not in map (bitlen=${forwardRecord.private.bitLength})`);

  const ops = forwardRecord.operations.filter((o) => o.bitIndex === i);
  const doubles = ops.filter((o) => o.kind === "double").length;
  const adds = ops.filter((o) => o.kind === "add").length;

  return {
    bitIndex: i,
    decimal: i,
    hexadecimal: "0x" + i.toString(16),
    binaryPos: `2^${i}`,
    bitValue: row.bit,
    doublesAtIndex: doubles,
    addsAtIndex: adds,
    operations: ops,
    predecessors: i < forwardRecord.private.bitLength - 1
      ? [`bit ${i + 1} (processed earlier in MSB-first)`]
      : ["(MSB — start of loop)"],
    successors: i > 0
      ? [`bit ${i - 1} (processed later in MSB-first)`]
      : ["(LSB — fim do loop)"],
    note: row.bit === 1
      ? "This index produced an ADD (bit=1)."
      : "This index only had DOUBLE (bit=0, skip ADD).",
  };
}

export function exploreFromReverse(summary, bitIndex) {
  const i = Number(bitIndex);
  const decided = summary.decided[i];
  const hist = summary.history.filter((h) => h.bitIndex === i);
  return {
    bitIndex: i,
    decimal: i,
    hexadecimal: "0x" + i.toString(16),
    binaryPos: `2^${i}`,
    bitValue: decided === undefined ? null : Number(decided),
    status: decided === undefined ? "undetermined" : decided === 1 ? "ADD undone" : "skip (bit0)",
    history: hist,
    predecessors: i > 0 ? [`bit ${i - 1} (undone earlier in reverse)`] : ["(first in reverse)"],
    successors: i < summary.maxBit ? [`bit ${i + 1}`] : ["(last in range)"],
    candidatesNow: summary.candidates.filter((c) => c.bitIndex === i),
  };
}

export function bitGrid(forwardRecord) {
  const L = forwardRecord.private.bitLength;
  const k = BigInt("0x" + forwardRecord.private.hex);
  const cells = [];
  for (let i = L - 1; i >= 0; i--) {
    const bit = Number((k >> BigInt(i)) & 1n);
    cells.push({
      i,
      bit,
      hex: "0x" + i.toString(16),
      bin: String(bit),
    });
  }
  return cells;
}
