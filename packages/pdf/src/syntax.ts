/**
 * PDF object syntax: the tokenizer and the object parser.
 *
 * A PDF file is a set of numbered objects built from eight types, and almost
 * everything else in the format is those objects pointing at each other. This
 * file reads them and nothing more: no pages, no text, no cross-reference
 * table. Those are built on top, in document.ts and text.ts.
 *
 * WHITESPACE AND DELIMITERS ARE THE WHOLE TRICK. PDF has six whitespace bytes
 * (including NUL, which is easy to forget) and eight delimiter bytes that end
 * a token without being consumed by it. `/Type/Page` is two tokens with no
 * space between them, and a tokenizer that splits on whitespace reads it as
 * one. Every scan here ends on a delimiter as well as on whitespace.
 */

/** ( ) < > [ ] { } / % */
const DELIMITER = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
/** NUL, tab, newline, form feed, carriage return, space. */
const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);

export function isWhitespace(b: number): boolean {
  return WHITESPACE.has(b);
}
export function isDelimiter(b: number): boolean {
  return DELIMITER.has(b);
}

/** A reference to another object: `12 0 R`. */
export class Ref {
  constructor(
    readonly num: number,
    readonly gen: number,
  ) {}
  get key(): string {
    return `${this.num}/${this.gen}`;
  }
}

/** A name: `/Type`. Distinct from a string, because `/Foo` and `(Foo)` differ. */
export class Name {
  constructor(readonly value: string) {}
}

/**
 * A bare keyword: `Tj`, `BT`, `re`. Only content streams contain these.
 *
 * It is a separate type from Name because the lexer strips the slash, so
 * `/F1` and the operator `F1` would otherwise be the same value. In a content
 * stream `/F1 12 Tf` that ambiguity turns a font name into an operator and
 * silently drops every glyph the page draws.
 */
export class Operator {
  constructor(readonly value: string) {}
}

/** A stream: its dictionary, and the raw bytes before any filter is applied. */
export class PdfStream {
  constructor(
    readonly dict: PdfDict,
    readonly raw: Buffer,
  ) {}
}

export type PdfDict = Map<string, PdfObject>;
export type PdfObject =
  | Operator
  | number
  | boolean
  | null
  | string // a PDF string, already unescaped
  | Name
  | Ref
  | PdfObject[]
  | PdfDict
  | PdfStream;

export class Lexer {
  pos: number;
  constructor(
    readonly buf: Buffer,
    start = 0,
  ) {
    this.pos = start;
  }

  /** Move past whitespace and comments. A `%` runs to end of line. */
  skipWhitespace(): void {
    while (this.pos < this.buf.length) {
      const b = this.buf[this.pos] as number;
      if (WHITESPACE.has(b)) {
        this.pos++;
      } else if (b === 0x25) {
        while (this.pos < this.buf.length) {
          const c = this.buf[this.pos] as number;
          if (c === 0x0a || c === 0x0d) break;
          this.pos++;
        }
      } else {
        return;
      }
    }
  }

  /** The next bare token: a number, a keyword, or an operator. */
  readToken(): string {
    this.skipWhitespace();
    const start = this.pos;
    while (this.pos < this.buf.length) {
      const b = this.buf[this.pos] as number;
      if (WHITESPACE.has(b) || DELIMITER.has(b)) break;
      this.pos++;
    }
    // A delimiter with no preceding regular character is a token in itself,
    // otherwise a lexer facing `<<` would spin forever returning nothing.
    if (this.pos === start && this.pos < this.buf.length) {
      const b = this.buf[this.pos] as number;
      if (b === 0x3c && this.buf[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return '<<';
      }
      if (b === 0x3e && this.buf[this.pos + 1] === 0x3e) {
        this.pos += 2;
        return '>>';
      }
      this.pos++;
      return String.fromCharCode(b);
    }
    return this.buf.toString('latin1', start, this.pos);
  }

  /** Look at the next token without consuming it. */
  peekToken(): string {
    const save = this.pos;
    const t = this.readToken();
    this.pos = save;
    return t;
  }

  /**
   * A literal string: `(text)`, with balanced inner parentheses and escapes.
   *
   * Returned as latin1, deliberately. The bytes of a PDF string mean nothing
   * until a font's encoding is applied, and decoding them as UTF-8 here would
   * corrupt anything outside ASCII before text.ts gets the chance to map it.
   */
  readLiteralString(): string {
    this.pos++; // the opening paren
    let depth = 1;
    const out: number[] = [];
    while (this.pos < this.buf.length) {
      let b = this.buf[this.pos++] as number;
      if (b === 0x5c) {
        // backslash
        const e = this.buf[this.pos++] as number;
        switch (e) {
          case 0x6e: out.push(0x0a); break; // n
          case 0x72: out.push(0x0d); break; // r
          case 0x74: out.push(0x09); break; // t
          case 0x62: out.push(0x08); break; // b
          case 0x66: out.push(0x0c); break; // f
          case 0x0a: break; // a line continuation produces nothing
          case 0x0d:
            if (this.buf[this.pos] === 0x0a) this.pos++;
            break;
          default:
            if (e >= 0x30 && e <= 0x37) {
              // up to three octal digits
              let v = e - 0x30;
              for (let i = 0; i < 2; i++) {
                const d = this.buf[this.pos] as number;
                if (d >= 0x30 && d <= 0x37) {
                  v = v * 8 + (d - 0x30);
                  this.pos++;
                } else break;
              }
              out.push(v & 0xff);
            } else {
              out.push(e);
            }
        }
        continue;
      }
      if (b === 0x28) depth++;
      else if (b === 0x29) {
        depth--;
        if (depth === 0) break;
      }
      out.push(b);
    }
    return Buffer.from(out).toString('latin1');
  }

  /** A hex string: `<48656C6C6F>`. An odd final digit is padded with zero. */
  readHexString(): string {
    this.pos++; // <
    const digits: number[] = [];
    while (this.pos < this.buf.length) {
      const b = this.buf[this.pos++] as number;
      if (b === 0x3e) break;
      const v = hexVal(b);
      if (v >= 0) digits.push(v);
    }
    if (digits.length % 2 === 1) digits.push(0);
    const out = Buffer.alloc(digits.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = ((digits[i * 2] as number) << 4) | (digits[i * 2 + 1] as number);
    }
    return out.toString('latin1');
  }

  /** A name: `/Type`, with `#xx` hex escapes. */
  readName(): Name {
    this.pos++; // /
    const out: number[] = [];
    while (this.pos < this.buf.length) {
      const b = this.buf[this.pos] as number;
      if (WHITESPACE.has(b) || DELIMITER.has(b)) break;
      this.pos++;
      if (b === 0x23) {
        const hi = hexVal(this.buf[this.pos] as number);
        const lo = hexVal(this.buf[this.pos + 1] as number);
        if (hi >= 0 && lo >= 0) {
          out.push((hi << 4) | lo);
          this.pos += 2;
          continue;
        }
      }
      out.push(b);
    }
    return new Name(Buffer.from(out).toString('latin1'));
  }

  /**
   * One object.
   *
   * `resolveLength` is how a stream learns its own size when `/Length` is an
   * indirect reference, which is common because a producer does not know the
   * length until it has written the stream. Without it the only recourse is to
   * scan for `endstream`, which is a guess that binary data can defeat.
   */
  readObject(resolveLength?: (r: Ref) => PdfObject | undefined): PdfObject {
    this.skipWhitespace();
    if (this.pos >= this.buf.length) return null;
    const b = this.buf[this.pos] as number;

    if (b === 0x2f) return this.readName();
    if (b === 0x28) return this.readLiteralString();
    if (b === 0x5b) {
      // [
      this.pos++;
      const arr: PdfObject[] = [];
      for (;;) {
        this.skipWhitespace();
        if (this.pos >= this.buf.length) break;
        if (this.buf[this.pos] === 0x5d) {
          this.pos++;
          break;
        }
        arr.push(this.readObject(resolveLength));
      }
      return arr;
    }
    if (b === 0x3c) {
      if (this.buf[this.pos + 1] === 0x3c) return this.readDictOrStream(resolveLength);
      return this.readHexString();
    }

    const token = this.readToken();
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    if (token === '') return null;

    if (/^[+-]?[\d.]+$/.test(token)) {
      // `12 0 R` is a reference and `12 0` is two numbers, and the only way to
      // tell is to look two tokens ahead and put them back if it is not.
      if (/^\d+$/.test(token)) {
        const save = this.pos;
        const genTok = this.readToken();
        if (/^\d+$/.test(genTok)) {
          const rTok = this.readToken();
          if (rTok === 'R') return new Ref(parseInt(token, 10), parseInt(genTok, 10));
        }
        this.pos = save;
      }
      const n = parseFloat(token);
      return Number.isNaN(n) ? 0 : n;
    }

    // An unrecognised keyword. Content streams are full of them: they are
    // operators, and text.ts is what gives them meaning.
    return new Operator(token);
  }

  private readDictOrStream(resolveLength?: (r: Ref) => PdfObject | undefined): PdfObject {
    this.pos += 2; // <<
    const dict: PdfDict = new Map();
    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.buf.length) break;
      if (this.buf[this.pos] === 0x3e && this.buf[this.pos + 1] === 0x3e) {
        this.pos += 2;
        break;
      }
      if (this.buf[this.pos] !== 0x2f) {
        // Not a name where a key must be. Skip one object rather than loop.
        this.readObject(resolveLength);
        continue;
      }
      const key = this.readName().value;
      dict.set(key, this.readObject(resolveLength));
    }

    const save = this.pos;
    if (this.peekToken() !== 'stream') {
      this.pos = save;
      return dict;
    }
    this.readToken();
    // The bytes after `stream` are CRLF or LF, never CR alone, and never
    // anything else: the first data byte follows immediately.
    if (this.buf[this.pos] === 0x0d) this.pos++;
    if (this.buf[this.pos] === 0x0a) this.pos++;

    let len = dict.get('Length');
    if (len instanceof Ref && resolveLength) len = resolveLength(len);
    const start = this.pos;
    let end: number;
    if (typeof len === 'number' && len >= 0 && start + len <= this.buf.length) {
      end = start + len;
      // A wrong /Length is common enough in the wild to be worth checking
      // rather than trusting. If `endstream` is not where it should be, fall
      // back to searching for it.
      const after = this.buf.toString('latin1', end, Math.min(end + 20, this.buf.length));
      if (!/^\s*endstream/.test(after)) end = this.findEndstream(start);
    } else {
      end = this.findEndstream(start);
    }
    const raw = this.buf.subarray(start, end);
    this.pos = end;
    this.skipWhitespace();
    if (this.peekToken() === 'endstream') this.readToken();
    return new PdfStream(dict, raw);
  }

  private findEndstream(start: number): number {
    const at = this.buf.indexOf('endstream', start, 'latin1');
    if (at < 0) return this.buf.length;
    let end = at;
    // The EOL before `endstream` belongs to the keyword, not to the data.
    if (this.buf[end - 1] === 0x0a) end--;
    if (this.buf[end - 1] === 0x0d) end--;
    return end;
  }
}

function hexVal(b: number): number {
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  if (b >= 0x61 && b <= 0x66) return b - 0x61 + 10;
  return -1;
}

/** Read a dictionary entry, following a reference if that is what is there. */
export function dictGet(
  dict: PdfDict | undefined,
  key: string,
  resolve: (o: PdfObject) => PdfObject,
): PdfObject | undefined {
  if (!dict) return undefined;
  const v = dict.get(key);
  return v === undefined ? undefined : resolve(v);
}
