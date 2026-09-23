/**
 * The document: cross-reference table, objects, and the page tree.
 *
 * TWO WAYS IN, AND THE SECOND ONE IS NOT A FALLBACK NOBODY EXERCISES. The
 * documented route is the cross-reference table at the end of the file. The
 * other is to scan the whole file for `N G obj` and build the index from what
 * is actually there. Real PDFs arrive with wrong offsets often enough that
 * every serious reader has both, and a supplier's parts table is exactly the
 * kind of file that has been through three tools before it reaches us. So the
 * scan runs whenever the table is missing, unreadable, or points at an object
 * that is not where it says, and `recovered` records which route was taken.
 *
 * ENCRYPTED FILES ARE REFUSED BY NAME. An /Encrypt dictionary means every
 * string and stream is ciphertext. A reader that ignored it would return
 * confident rubbish, and a parts list nobody can tell is rubbish is worse than
 * an error message.
 */
import { decodeStream, UndecodableStream } from './filters.js';
import { Lexer, Name, PdfStream, Ref, type PdfDict, type PdfObject } from './syntax.js';

export class NotAPdf extends Error {
  constructor(why: string) {
    super(why);
    this.name = 'NotAPdf';
  }
}
export class EncryptedPdf extends Error {
  constructor() {
    super(
      'this PDF is encrypted. Its text cannot be read without the password, and a reader ' +
        'that guessed would return text that is not in the document.',
    );
    this.name = 'EncryptedPdf';
  }
}

interface Entry {
  /** Byte offset, for an ordinary object. */
  offset?: number;
  /** Or the object stream holding it, and its index within. */
  inStream?: { num: number; index: number };
}

export class PdfDocument {
  private entries = new Map<number, Entry>();
  private cache = new Map<number, PdfObject>();
  private objStmCache = new Map<number, Map<number, PdfObject>>();
  trailer: PdfDict = new Map();
  /** True when the cross-reference table was not usable and the file was scanned. */
  recovered = false;

  private constructor(readonly buf: Buffer) {}

  static read(buf: Buffer): PdfDocument {
    const head = buf.subarray(0, 1024).toString('latin1');
    const at = head.indexOf('%PDF-');
    if (at < 0) throw new NotAPdf('this file does not begin with %PDF-, so it is not a PDF');
    // Some files carry junk before the header. Offsets inside are relative to
    // the header, not to the file, so slice it off rather than compensating
    // at every read.
    const doc = new PdfDocument(at === 0 ? buf : buf.subarray(at));

    try {
      doc.readXref();
    } catch {
      doc.entries.clear();
    }
    if (doc.entries.size === 0 || !doc.trailer.has('Root')) doc.scanForObjects();

    if (doc.trailer.has('Encrypt')) throw new EncryptedPdf();
    if (!doc.trailer.has('Root')) {
      // The scan finds a catalog even when no trailer survived.
      const root = doc.findCatalog();
      if (!root) throw new NotAPdf('this PDF has no document catalog, so it has no pages');
      doc.trailer.set('Root', root);
    }
    return doc;
  }

  // ---- cross-reference ---------------------------------------------------

  private readXref(): void {
    const tail = this.buf.subarray(Math.max(0, this.buf.length - 2048)).toString('latin1');
    const m = /startxref\s+(\d+)\s*%%EOF\s*$/.exec(tail) ?? /startxref\s+(\d+)/.exec(tail);
    if (!m) throw new NotAPdf('no startxref');
    let next: number | undefined = parseInt(m[1] as string, 10);
    const seen = new Set<number>();
    while (next !== undefined && next >= 0 && next < this.buf.length && !seen.has(next)) {
      seen.add(next);
      next = this.readXrefSection(next);
    }
  }

  /** One xref section. Returns the offset of the previous one, if any. */
  private readXrefSection(offset: number): number | undefined {
    const lex = new Lexer(this.buf, offset);
    if (lex.peekToken() === 'xref') {
      lex.readToken();
      for (;;) {
        const t = lex.peekToken();
        if (t === 'trailer') {
          lex.readToken();
          const tr = lex.readObject();
          if (tr instanceof Map) {
            for (const [k, v] of tr) if (!this.trailer.has(k)) this.trailer.set(k, v);
            // A hybrid file keeps the real index in an xref stream and leaves
            // the table as a stub for old readers. Follow it or miss objects.
            const x = tr.get('XRefStm');
            if (typeof x === 'number') {
              try {
                this.readXrefSection(x);
              } catch {
                /* the table alone may still be enough */
              }
            }
            const prev = tr.get('Prev');
            return typeof prev === 'number' ? prev : undefined;
          }
          return undefined;
        }
        if (!/^\d+$/.test(t)) return undefined;
        const start = parseInt(lex.readToken(), 10);
        const count = parseInt(lex.readToken(), 10);
        if (!Number.isFinite(count)) return undefined;
        for (let i = 0; i < count; i++) {
          const off = parseInt(lex.readToken(), 10);
          lex.readToken(); // generation
          const type = lex.readToken();
          const num = start + i;
          if (type === 'n' && !this.entries.has(num)) this.entries.set(num, { offset: off });
        }
      }
    }

    // An xref stream: `N G obj << /Type /XRef ... >> stream`.
    lex.readToken();
    lex.readToken();
    if (lex.readToken() !== 'obj') throw new NotAPdf('no xref at the offset startxref names');
    const obj = lex.readObject();
    if (!(obj instanceof PdfStream)) throw new NotAPdf('the xref is neither a table nor a stream');
    return this.readXrefStream(obj);
  }

  private readXrefStream(stm: PdfStream): number | undefined {
    const d = stm.dict;
    for (const [k, v] of d) if (!this.trailer.has(k)) this.trailer.set(k, v);

    const w = d.get('W');
    if (!Array.isArray(w)) throw new NotAPdf('the xref stream has no /W');
    const widths = w.map((x) => (typeof x === 'number' ? x : 0));
    const size = typeof d.get('Size') === 'number' ? (d.get('Size') as number) : 0;
    const indexRaw = d.get('Index');
    const index: number[] = Array.isArray(indexRaw)
      ? (indexRaw.filter((x) => typeof x === 'number') as number[])
      : [0, size];

    const data = decodeStream(d, stm.raw, (o) => this.resolve(o));
    const rowLen = widths.reduce((a, b) => a + b, 0);
    let p = 0;
    for (let s = 0; s + 1 < index.length; s += 2) {
      const first = index[s] as number;
      const count = index[s + 1] as number;
      for (let i = 0; i < count && p + rowLen <= data.length; i++, p += rowLen) {
        let q = p;
        const field = (width: number, dflt: number): number => {
          if (width === 0) return dflt;
          let v = 0;
          for (let k = 0; k < width; k++) v = v * 256 + (data[q++] as number);
          return v;
        };
        // A zero-width first field means type 1, per the specification. Getting
        // this default wrong makes every object look free.
        const type = field(widths[0] as number, 1);
        const f2 = field(widths[1] as number, 0);
        const f3 = field(widths[2] as number, 0);
        const num = first + i;
        if (this.entries.has(num)) continue;
        if (type === 1) this.entries.set(num, { offset: f2 });
        else if (type === 2) this.entries.set(num, { inStream: { num: f2, index: f3 } });
      }
    }
    const prev = d.get('Prev');
    return typeof prev === 'number' ? prev : undefined;
  }

  /** Build the index by looking at the file rather than at what it claims. */
  private scanForObjects(): void {
    this.recovered = true;
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    const text = this.buf.toString('latin1');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Later definitions win: an incrementally updated PDF appends the new
      // version of an object after the old one.
      this.entries.set(parseInt(m[1] as string, 10), { offset: m.index });
    }
    const t = text.lastIndexOf('trailer');
    if (t >= 0) {
      const tr = new Lexer(this.buf, t + 7).readObject();
      if (tr instanceof Map) for (const [k, v] of tr) if (!this.trailer.has(k)) this.trailer.set(k, v);
    }
    // Objects inside object streams are invisible to the scan above, so open
    // every one that turned up.
    for (const num of [...this.entries.keys()]) {
      let o: PdfObject;
      try {
        o = this.get(num);
      } catch {
        continue;
      }
      if (o instanceof PdfStream && (o.dict.get('Type') as Name | undefined)?.value === 'ObjStm') {
        let inner: Map<number, PdfObject>;
        try {
          inner = this.readObjStm(num);
        } catch {
          continue;
        }
        let i = 0;
        for (const innerNum of inner.keys()) {
          if (!this.entries.has(innerNum)) {
            this.entries.set(innerNum, { inStream: { num, index: i } });
          }
          i++;
        }
      }
    }
  }

  private findCatalog(): Ref | undefined {
    for (const num of this.entries.keys()) {
      try {
        const o = this.get(num);
        const d = o instanceof PdfStream ? o.dict : o instanceof Map ? o : undefined;
        if (d && (d.get('Type') as Name | undefined)?.value === 'Catalog') return new Ref(num, 0);
      } catch {
        /* a broken object is not the catalog */
      }
    }
    return undefined;
  }

  // ---- objects -----------------------------------------------------------

  /** Follow a reference until it is something else. */
  resolve(o: PdfObject): PdfObject {
    let cur = o;
    for (let i = 0; i < 32 && cur instanceof Ref; i++) cur = this.get(cur.num);
    return cur instanceof Ref ? null : cur;
  }

  get(num: number): PdfObject {
    const hit = this.cache.get(num);
    if (hit !== undefined) return hit;
    const e = this.entries.get(num);
    if (!e) return null;

    this.cache.set(num, null); // break cycles while this one is being read
    let value: PdfObject = null;
    if (e.inStream) {
      value = this.readObjStm(e.inStream.num).get(num) ?? null;
    } else if (e.offset !== undefined && e.offset < this.buf.length) {
      value = this.readObjectAt(e.offset, num);
      if (value === null && !this.recovered) {
        // The table pointed somewhere wrong. One bad offset means the rest are
        // suspect, so rebuild the whole index from the file.
        this.cache.clear();
        this.scanForObjects();
        const again = this.entries.get(num);
        if (again?.offset !== undefined) value = this.readObjectAt(again.offset, num);
        else if (again?.inStream) value = this.readObjStm(again.inStream.num).get(num) ?? null;
      }
    }
    this.cache.set(num, value);
    return value;
  }

  /** Read `num G obj <object> endobj`, checking the number really matches. */
  private readObjectAt(offset: number, expect: number): PdfObject {
    const lex = new Lexer(this.buf, offset);
    const numTok = lex.readToken();
    if (parseInt(numTok, 10) !== expect) return null;
    lex.readToken(); // generation
    if (lex.readToken() !== 'obj') return null;
    return lex.readObject((r) => {
      // /Length as a reference. Read it directly: going through get() here
      // would recurse into the object currently being parsed.
      const le = this.entries.get(r.num);
      if (le?.offset === undefined) return undefined;
      const l = new Lexer(this.buf, le.offset);
      l.readToken();
      l.readToken();
      if (l.readToken() !== 'obj') return undefined;
      return l.readObject();
    });
  }

  /** The objects packed inside one object stream. */
  private readObjStm(num: number): Map<number, PdfObject> {
    const hit = this.objStmCache.get(num);
    if (hit) return hit;
    const out = new Map<number, PdfObject>();
    this.objStmCache.set(num, out);

    const e = this.entries.get(num);
    const stm = e?.offset !== undefined ? this.readObjectAt(e.offset, num) : null;
    if (!(stm instanceof PdfStream)) return out;

    const data = decodeStream(stm.dict, stm.raw, (o) => this.resolve(o));
    const n = this.resolve(stm.dict.get('N') ?? null);
    const first = this.resolve(stm.dict.get('First') ?? null);
    if (typeof n !== 'number' || typeof first !== 'number') return out;

    const head = new Lexer(data, 0);
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const objNum = parseInt(head.readToken(), 10);
      const rel = parseInt(head.readToken(), 10);
      if (!Number.isFinite(objNum) || !Number.isFinite(rel)) break;
      pairs.push([objNum, rel]);
    }
    for (const [objNum, rel] of pairs) {
      out.set(objNum, new Lexer(data, first + rel).readObject());
    }
    return out;
  }

  /** A dictionary entry, with references followed. */
  at(dict: PdfDict | undefined, key: string): PdfObject | undefined {
    if (!dict) return undefined;
    const v = dict.get(key);
    return v === undefined ? undefined : this.resolve(v);
  }

  /** A stream's decoded bytes, or undefined when no reader could decode it. */
  streamBytes(stm: PdfStream): Buffer | undefined {
    try {
      return decodeStream(stm.dict, stm.raw, (o) => this.resolve(o));
    } catch (e) {
      if (e instanceof UndecodableStream) return undefined;
      throw e;
    }
  }

  // ---- pages -------------------------------------------------------------

  /** Every page dictionary, in order. */
  pages(): PdfDict[] {
    const root = this.resolve(this.trailer.get('Root') ?? null);
    const out: PdfDict[] = [];
    const seen = new Set<PdfDict>();

    const walk = (node: PdfObject, inherited: PdfDict): void => {
      const d = node instanceof Map ? node : undefined;
      if (!d || seen.has(d) || out.length > 5000) return;
      seen.add(d);
      // Resources and MediaBox are inherited down the tree, so a page often
      // carries neither and means the one from its parent.
      const carried: PdfDict = new Map(inherited);
      for (const k of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
        if (d.has(k)) carried.set(k, d.get(k) as PdfObject);
      }
      const type = (this.at(d, 'Type') as Name | undefined)?.value;
      const kids = this.at(d, 'Kids');
      if (type === 'Page' || (!kids && d.has('Contents'))) {
        const page: PdfDict = new Map(d);
        for (const [k, v] of carried) if (!page.has(k)) page.set(k, v);
        out.push(page);
        return;
      }
      if (Array.isArray(kids)) for (const kid of kids) walk(this.resolve(kid), carried);
    };

    if (root instanceof Map) walk(this.at(root, 'Pages') ?? null, new Map());
    if (out.length === 0) {
      // No usable page tree. Take every object that calls itself a page.
      for (const num of this.entries.keys()) {
        const o = this.get(num);
        if (o instanceof Map && (this.at(o, 'Type') as Name | undefined)?.value === 'Page') out.push(o);
      }
    }
    return out;
  }

  /** A page's content streams, concatenated as the specification requires. */
  pageContent(page: PdfDict): Buffer {
    const c = this.at(page, 'Contents');
    const parts: Buffer[] = [];
    const add = (o: PdfObject): void => {
      const r = this.resolve(o);
      if (r instanceof PdfStream) {
        const b = this.streamBytes(r);
        if (b) parts.push(b);
      }
    };
    if (Array.isArray(c)) for (const x of c) add(x);
    else if (c) add(c);
    // A newline between streams: the specification says an operator may not be
    // split across them, and joining without one can weld two tokens together.
    return Buffer.concat(parts.flatMap((p, i) => (i === 0 ? [p] : [Buffer.from('\n'), p])));
  }
}
