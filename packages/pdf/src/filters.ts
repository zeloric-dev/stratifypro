/**
 * Stream filters. Enough of them to read a text layer and an attachment.
 *
 * FlateDecode covers almost everything a real producer emits. The others are
 * here because they are cheap and because a stream this cannot decode has to
 * be reported as undecodable rather than returned as garbage: a parts table
 * read out of mis-decoded bytes is the failure mode this package exists to
 * avoid.
 *
 * ENCRYPTION IS NOT HANDLED, and that is a stated refusal rather than a gap.
 * An encrypted PDF needs the document key applied to every string and stream,
 * and a reader that ignored /Encrypt would return plausible-looking rubbish.
 * document.ts detects /Encrypt and refuses the file by name.
 */
import { inflateSync, inflateRawSync, unzipSync } from 'node:zlib';
import { Name, type PdfDict, type PdfObject } from './syntax.js';

export class UndecodableStream extends Error {
  constructor(readonly filter: string, cause?: unknown) {
    super(`this PDF stream uses ${filter}, which this reader cannot decode`);
    this.name = 'UndecodableStream';
    if (cause instanceof Error) this.cause = cause;
  }
}

function flate(data: Buffer): Buffer {
  // Producers disagree about the zlib header. Try it the documented way, then
  // raw, then let zlib decide, rather than failing on a file that opens
  // everywhere else.
  try {
    return inflateSync(data);
  } catch {
    try {
      return inflateRawSync(data);
    } catch {
      try {
        return unzipSync(data);
      } catch (e) {
        // A truncated stream still holds everything before the break, and for
        // text extraction that is usually the whole page. Salvage it.
        const partial = salvageInflate(data);
        if (partial && partial.length > 0) return partial;
        throw new UndecodableStream('a damaged FlateDecode stream', e);
      }
    }
  }
}

/** Inflate as much as possible of a stream that ends early. */
function salvageInflate(data: Buffer): Buffer | undefined {
  for (const fn of [inflateSync, inflateRawSync]) {
    try {
      return fn(data, { finishFlush: 2 /* Z_SYNC_FLUSH */ });
    } catch {
      /* try the next */
    }
  }
  return undefined;
}

function asciiHex(data: Buffer): Buffer {
  const out: number[] = [];
  let hi = -1;
  for (const b of data) {
    if (b === 0x3e) break; // >
    let v = -1;
    if (b >= 0x30 && b <= 0x39) v = b - 0x30;
    else if (b >= 0x41 && b <= 0x46) v = b - 55;
    else if (b >= 0x61 && b <= 0x66) v = b - 87;
    else continue;
    if (hi < 0) hi = v;
    else {
      out.push((hi << 4) | v);
      hi = -1;
    }
  }
  if (hi >= 0) out.push(hi << 4);
  return Buffer.from(out);
}

function ascii85(data: Buffer): Buffer {
  const out: number[] = [];
  let tuple: number[] = [];
  let i = 0;
  if (data[0] === 0x3c && data[1] === 0x7e) i = 2; // an optional <~ prefix
  for (; i < data.length; i++) {
    const b = data[i] as number;
    if (b === 0x7e) break; // ~>
    if (b <= 0x20 || b === 0) continue;
    if (b === 0x7a && tuple.length === 0) {
      out.push(0, 0, 0, 0); // z is four zero bytes
      continue;
    }
    if (b < 0x21 || b > 0x75) continue;
    tuple.push(b - 0x21);
    if (tuple.length === 5) {
      let v = 0;
      for (const t of tuple) v = v * 85 + t;
      out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
      tuple = [];
    }
  }
  if (tuple.length > 1) {
    const n = tuple.length;
    while (tuple.length < 5) tuple.push(84);
    let v = 0;
    for (const t of tuple) v = v * 85 + t;
    const bytes = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    out.push(...bytes.slice(0, n - 1));
  }
  return Buffer.from(out);
}

function runLength(data: Buffer): Buffer {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const n = data[i++] as number;
    if (n === 128) break;
    if (n < 128) {
      for (let k = 0; k <= n; k++) out.push(data[i++] as number);
    } else {
      const b = data[i++] as number;
      for (let k = 0; k < 257 - n; k++) out.push(b);
    }
  }
  return Buffer.from(out);
}

/**
 * Undo a PNG or TIFF predictor.
 *
 * Cross-reference streams almost always carry one, because their columns are
 * near-identical integers that a predictor turns into runs of zero. A reader
 * that skipped this step would read every object offset wrong while looking
 * like it worked, so it is not optional in practice.
 */
function unpredict(data: Buffer, predictor: number, colors: number, bpc: number, columns: number): Buffer {
  if (predictor <= 1) return data;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);

  if (predictor === 2) {
    // TIFF. Only the 8-bit case is defined here; anything else is left alone
    // rather than half-applied.
    if (bpc !== 8) return data;
    for (let r = 0; r + rowLen <= data.length; r += rowLen) {
      for (let i = bpp; i < rowLen; i++) {
        data[r + i] = ((data[r + i] as number) + (data[r + i - bpp] as number)) & 0xff;
      }
    }
    return data;
  }

  // PNG predictors carry a filter-type byte per row.
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = Buffer.alloc(rows * rowLen);
  let prev = Buffer.alloc(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)] as number;
    const src = data.subarray(r * (rowLen + 1) + 1, r * (rowLen + 1) + 1 + rowLen);
    const cur = Buffer.alloc(rowLen);
    for (let i = 0; i < rowLen; i++) {
      const raw = src[i] ?? 0;
      const left = i >= bpp ? (cur[i - bpp] as number) : 0;
      const up = prev[i] as number;
      const upLeft = i >= bpp ? (prev[i - bpp] as number) : 0;
      let v: number;
      switch (type) {
        case 0: v = raw; break;
        case 1: v = raw + left; break;
        case 2: v = raw + up; break;
        case 3: v = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: v = raw;
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, r * rowLen);
    prev = cur;
  }
  return out;
}

const NAMES: Record<string, (b: Buffer) => Buffer> = {
  FlateDecode: flate,
  Fl: flate,
  ASCIIHexDecode: asciiHex,
  AHx: asciiHex,
  ASCII85Decode: ascii85,
  A85: ascii85,
  RunLengthDecode: runLength,
  RL: runLength,
};

/** Image filters. Recognised so they can be refused by name. */
const IMAGE_ONLY = new Set(['DCTDecode', 'DCT', 'JPXDecode', 'JBIG2Decode', 'CCITTFaxDecode', 'CCF']);

function num(o: PdfObject | undefined, fallback: number): number {
  return typeof o === 'number' ? o : fallback;
}

/** Apply every filter on a stream, in order, and return the bytes. */
export function decodeStream(
  dict: PdfDict,
  raw: Buffer,
  resolve: (o: PdfObject) => PdfObject,
): Buffer {
  const fRaw = resolve(dict.get('Filter') ?? dict.get('F') ?? null);
  const filters: Name[] =
    fRaw instanceof Name ? [fRaw] : Array.isArray(fRaw) ? (fRaw.map(resolve).filter((x) => x instanceof Name) as Name[]) : [];

  const pRaw = resolve(dict.get('DecodeParms') ?? dict.get('DP') ?? null);
  const parms: Array<PdfDict | null> = Array.isArray(pRaw)
    ? pRaw.map((p) => (resolve(p) instanceof Map ? (resolve(p) as PdfDict) : null))
    : pRaw instanceof Map
      ? [pRaw]
      : [];

  let data = raw;
  filters.forEach((f, i) => {
    if (IMAGE_ONLY.has(f.value)) throw new UndecodableStream(f.value);
    const fn = NAMES[f.value];
    if (!fn) throw new UndecodableStream(f.value);
    data = fn(data);
    const p = parms[i];
    if (p) {
      const predictor = num(resolve(p.get('Predictor') ?? null), 1);
      if (predictor > 1) {
        data = unpredict(
          data,
          predictor,
          num(resolve(p.get('Colors') ?? null), 1),
          num(resolve(p.get('BitsPerComponent') ?? null), 8),
          num(resolve(p.get('Columns') ?? null), 1),
        );
      }
    }
  });
  return data;
}
