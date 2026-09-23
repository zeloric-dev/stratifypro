/**
 * Just enough of PKZIP to read an OSV export.
 *
 * WHY NOT A DEPENDENCY. This repository has no runtime dependencies outside
 * the workspace, and the reason is not minimalism for its own sake. Everything
 * here ends up quoted in a regulatory submission, so every line that shapes an
 * answer should be one somebody here can be asked about. Adding a package to
 * unzip a file, in the one app that already holds the network permission, is
 * the trade going the wrong way.
 *
 * WHY ZIP64. OSV's npm export holds 229,185 entries. The end-of-central-
 * directory record stores its entry count in sixteen bits, so anything past
 * 65,535 is written as 0xFFFF and the real count lives in a Zip64 record. An
 * implementation that reads only the classic record does not fail on npm: it
 * reads 65,535 entries and returns them, and the mirror is quietly missing
 * two thirds of its advisories with every test still green. That is the exact
 * shape of failure this project keeps meeting, so the count is cross-checked
 * against the number of entries actually walked, and a mismatch throws.
 */
import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const EOCD64 = 0x06064b50;
const CENTRAL = 0x02014b50;

export interface Entry {
  name: string;
  read(): Buffer;
  /** True when a 32-bit field held the Zip64 sentinel and the real value is elsewhere. */
  overflowed: boolean;
}

function findEocd(buf: Buffer): number {
  // The record ends with a variable-length comment, so scan back for the
  // signature. 22 bytes is the record with an empty comment.
  const earliest = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= earliest; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD) return i;
  }
  throw new Error('not a zip file: no end-of-central-directory record');
}

export function readZip(buf: Buffer): Entry[] {
  const eocd = findEocd(buf);
  let count = buf.readUInt16LE(eocd + 10);
  let start = buf.readUInt32LE(eocd + 16);

  // Zip64 appears 20 bytes before the classic record when either field
  // overflowed. Both sentinels are checked, not just the count.
  if (count === 0xffff || start === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== EOCD64_LOCATOR) {
      throw new Error('zip declares Zip64 fields but carries no Zip64 locator');
    }
    const rec = Number(buf.readBigUInt64LE(loc + 8));
    if (buf.readUInt32LE(rec) !== EOCD64) {
      throw new Error('Zip64 locator does not point at a Zip64 end-of-central-directory record');
    }
    count = Number(buf.readBigUInt64LE(rec + 32));
    start = Number(buf.readBigUInt64LE(rec + 48));
  }

  const entries: Entry[] = [];
  // Counted separately: directory entries are real entries as far as the
  // central directory's count is concerned, but they are not files. Folding
  // them into `entries` would be wrong and dropping them silently would make
  // the count cross-check below fire on a perfectly good archive.
  let directories = 0;
  let p = start;
  while (p < buf.length && buf.readUInt32LE(p) === CENTRAL) {
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) {
      directories += 1;
      continue;
    }
    entries.push({
      name,
      overflowed: compressedSize === 0xffffffff || localOffset === 0xffffffff,
      read(): Buffer {
        // The local header repeats the name and carries its own extra field,
        // which is usually a different length from the central one.
        const lnameLen = buf.readUInt16LE(localOffset + 26);
        const lextraLen = buf.readUInt16LE(localOffset + 28);
        const from = localOffset + 30 + lnameLen + lextraLen;
        const raw = buf.subarray(from, from + compressedSize);
        if (method === 0) return Buffer.from(raw);
        if (method === 8) return inflateRawSync(raw);
        throw new Error(`${name}: compression method ${method} is not supported`);
      },
    });
  }

  if (entries.length === 0) throw new Error('zip central directory is empty or unreadable');
  // The cross-check that catches a truncated read rather than trusting it.
  if (count !== 0 && entries.length + directories !== count) {
    throw new Error(
      `zip declares ${count} entries but the central directory walk found ` +
        `${entries.length + directories} (${entries.length} files, ${directories} directories). ` +
        `Refusing a partial read: a mirror short of advisories reports components as clean.`,
    );
  }

  // A 32-bit sentinel in a local-header offset or a compressed size means the
  // real value lives in the entry's Zip64 extra field, which this does not
  // parse. Reading the sentinel as a number would seek to 4 GB and return
  // rubbish, so refuse instead. No OSV export is near this today; the largest
  // is 205 MB.
  for (const e of entries) {
    if (e.overflowed) {
      throw new Error(
        `${e.name}: this entry needs Zip64 extended information, which this reader does not parse. ` +
          `Refusing rather than reading a wrong offset.`,
      );
    }
  }
  return entries;
}
