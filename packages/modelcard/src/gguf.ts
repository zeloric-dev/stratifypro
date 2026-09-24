/**
 * Just enough of GGUF to read a model's metadata.
 *
 * GGUF is the container local models ship in: llama.cpp writes it, Ollama and
 * LM Studio consume it, and a medical device running a model on its own
 * hardware is running one of these rather than calling an API. SPEC.md 3.2
 * asks for a CycloneDX model card generated "from a Hugging Face or GGUF
 * model", and GGUF is the half that needs no network and no account.
 *
 * ONLY THE HEADER IS READ, and that is the whole trick. A GGUF file is a
 * metadata block followed by tensor data, and the tensor data is gigabytes of
 * weights this has no use for. Everything a model card needs sits in the first
 * few hundred kilobytes, so the reader stops when the key-value block ends and
 * never allocates the rest. It also means a TRUNCATED file is a perfectly good
 * input, which is what the committed fixture is: the first 723,798 bytes of a
 * real model, being exactly its metadata block.
 *
 * NOTHING IS INVENTED. A key that is absent produces an absent field, not a
 * plausible one. In particular no licence is guessed from a model name and no
 * supplier is inferred from a repository URL, for the same reason
 * packages/resolve abstains rather than guessing: a model card is filed as
 * evidence, and a confident wrong licence is worse than a missing one.
 */

/** GGUF metadata value types, from the format's own enumeration. */
export const enum GgufType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

export type GgufValue = string | number | boolean | bigint | GgufValue[];

export interface GgufMetadata {
  /** Format version. 2 and 3 are in the wild; 1 predates the current layout. */
  version: number;
  tensorCount: bigint;
  /** Every key-value pair, in file order. */
  kv: Map<string, GgufValue>;
  /** Byte offset where the metadata block ended. */
  metadataBytes: number;
  /** Keys whose type this reader does not know. Reported, never skipped silently. */
  unreadable: string[];
}

export class NotGguf extends Error {
  constructor(why: string) {
    super(why);
    this.name = 'NotGguf';
  }
}

const MAGIC = 0x46554747; // "GGUF" little-endian

/** The first four bytes of every GGUF file. Cheap enough to check first. */
export function looksLikeGguf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.readUInt32LE(0) === MAGIC;
}

class Cursor {
  offset = 0;
  constructor(readonly buf: Buffer) {}

  private need(n: number): void {
    if (this.offset + n > this.buf.length) {
      throw new NotGguf(
        `this GGUF file ends inside its own metadata: ${this.buf.length} bytes, but a value ` +
          `at offset ${this.offset} needs ${n} more. The file is truncated above the point ` +
          `where the model's own description begins.`,
      );
    }
  }

  u32(): number {
    this.need(4);
    const v = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  u64(): bigint {
    this.need(8);
    const v = this.buf.readBigUInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  /**
   * A GGUF string: a 64-bit length then raw UTF-8, with no terminator.
   *
   * The length is read as a bigint and converted, because a corrupt file can
   * claim a length larger than any allocation. Converting first and checking
   * against the buffer turns that into the stated error above rather than an
   * out-of-memory.
   */
  str(): string {
    const len = Number(this.u64());
    if (!Number.isSafeInteger(len) || len < 0) {
      throw new NotGguf(`a string in this GGUF claims an impossible length (${len})`);
    }
    this.need(len);
    const s = this.buf.toString('utf8', this.offset, this.offset + len);
    this.offset += len;
    return s;
  }

  value(type: number): GgufValue {
    switch (type) {
      case GgufType.UINT8: this.need(1); return this.buf.readUInt8(this.offset++);
      case GgufType.INT8: this.need(1); return this.buf.readInt8(this.offset++);
      case GgufType.UINT16: { this.need(2); const v = this.buf.readUInt16LE(this.offset); this.offset += 2; return v; }
      case GgufType.INT16: { this.need(2); const v = this.buf.readInt16LE(this.offset); this.offset += 2; return v; }
      case GgufType.UINT32: return this.u32();
      case GgufType.INT32: { this.need(4); const v = this.buf.readInt32LE(this.offset); this.offset += 4; return v; }
      case GgufType.FLOAT32: { this.need(4); const v = this.buf.readFloatLE(this.offset); this.offset += 4; return v; }
      case GgufType.BOOL: { this.need(1); return this.buf.readUInt8(this.offset++) !== 0; }
      case GgufType.STRING: return this.str();
      case GgufType.UINT64: return this.u64();
      case GgufType.INT64: { this.need(8); const v = this.buf.readBigInt64LE(this.offset); this.offset += 8; return v; }
      case GgufType.FLOAT64: { this.need(8); const v = this.buf.readDoubleLE(this.offset); this.offset += 8; return v; }
      case GgufType.ARRAY: {
        const elementType = this.u32();
        const count = Number(this.u64());
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new NotGguf(`an array in this GGUF claims an impossible length (${count})`);
        }
        const out: GgufValue[] = [];
        for (let i = 0; i < count; i += 1) out.push(this.value(elementType));
        return out;
      }
      default:
        throw new NotGguf(`unknown GGUF value type ${type}`);
    }
  }
}

/**
 * Read a GGUF file's metadata block.
 *
 * The tensor index and the weights that follow it are not read and not
 * required to be present.
 */
export function readGgufMetadata(buf: Buffer): GgufMetadata {
  if (!looksLikeGguf(buf)) {
    throw new NotGguf(
      'this file does not begin with the four bytes GGUF, so it is not a GGUF model.',
    );
  }
  const c = new Cursor(buf);
  c.offset = 4;
  const version = c.u32();
  if (version < 2 || version > 3) {
    // Refused by name rather than attempted. Version 1 laid the header out
    // differently, and a future version may again; reading it with these
    // offsets would produce keys and values that are not in the file.
    throw new NotGguf(
      `this is GGUF version ${version}. This reader knows versions 2 and 3, and guessing at ` +
        `another version's layout would produce metadata that is not in the file.`,
    );
  }
  const tensorCount = c.u64();
  const kvCount = Number(c.u64());

  const kv = new Map<string, GgufValue>();
  const unreadable: string[] = [];
  for (let i = 0; i < kvCount; i += 1) {
    const key = c.str();
    const type = c.u32();
    try {
      kv.set(key, c.value(type));
    } catch (e) {
      if (e instanceof NotGguf && /unknown GGUF value type/.test(e.message)) {
        // The type is unknown, so its length is unknown, so the rest of the
        // block cannot be walked. Stop and say which key, rather than
        // resyncing onto whatever happens to look like a key next.
        unreadable.push(key);
        break;
      }
      throw e;
    }
  }

  return { version, tensorCount, kv, metadataBytes: c.offset, unreadable };
}

/** A string-valued key, when it is present and is actually a string. */
export function ggufString(m: GgufMetadata, key: string): string | undefined {
  const v = m.kv.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/** A numeric key, normalised from whichever width the producer used. */
export function ggufNumber(m: GgufMetadata, key: string): number | undefined {
  const v = m.kv.get(key);
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return undefined;
}

/** A string array, with non-strings dropped rather than coerced. */
export function ggufStrings(m: GgufMetadata, key: string): string[] | undefined {
  const v = m.kv.get(key);
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return out.length > 0 ? out : undefined;
}

/**
 * The architecture, which is also the prefix its own hyperparameters use.
 *
 * A llama model puts its context length under `llama.context_length`, a gptneox
 * one under `gptneox.context_length`. Reading them needs the architecture
 * first, which is why this is separate from the rest.
 */
export function ggufArchitecture(m: GgufMetadata): string | undefined {
  return ggufString(m, 'general.architecture');
}
