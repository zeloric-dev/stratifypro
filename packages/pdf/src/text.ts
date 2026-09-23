/**
 * Content stream to positioned text.
 *
 * A PDF has no paragraphs, no lines and no table cells. It has instructions to
 * paint glyphs at coordinates. Everything that looks like structure in a
 * viewer is something the reader infers from where the ink landed, which is
 * why this file returns positions and refuses to return a "table": the
 * inference belongs in one place, in table.ts, where it can be wrong in a way
 * somebody can see.
 *
 * WHAT IS TRACKED. The text matrix and the graphics-state matrix, because a
 * cell's position is the product of the two and a reader ignoring `cm` gets
 * everything right until it meets a producer that scales the page. Character
 * and word spacing, horizontal scaling and the font size, because they change
 * where the next glyph goes. Glyph widths from the font, because a run of text
 * inside one `Tj` advances by its own width, and a reader that assumed a fixed
 * advance produces columns that drift across the page.
 *
 * WHAT IS NOT. Colour, clipping, rendering mode, and whether the glyph is
 * actually visible. Text drawn in white on white, or clipped away, is returned
 * here as text. That is the right trade for a parts table and the wrong one
 * for a redaction tool, so it is written down rather than assumed.
 */
import { Lexer, Name, Operator, PdfStream, type PdfDict, type PdfObject } from './syntax.js';
import type { PdfDocument } from './document.js';

/** One show operation: what was drawn, and where it started. */
export interface TextRun {
  text: string;
  /** Device-space position of the start of the run, y increasing upward. */
  x: number;
  y: number;
  /** Effective font size after the text and graphics matrices. */
  size: number;
  /** Width of the run in device space, so a column's extent is knowable. */
  width: number;
  font: string;
}

type Matrix = [number, number, number, number, number, number];

const ID: Matrix = [1, 0, 0, 1, 0, 0];

function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

interface Font {
  /** code -> unicode, from a ToUnicode CMap or an encoding. */
  toUnicode: Map<number, string>;
  /** code -> width in glyph space (1000 per em). */
  widths: Map<number, number>;
  defaultWidth: number;
  /** Identity-H and friends: codes are two bytes, not one. */
  twoByte: boolean;
  name: string;
}

/** Latin-1 is close enough to WinAnsi for the range a parts table uses. */
function winAnsi(code: number): string {
  // The 0x80-0x9f block is where WinAnsi and Latin-1 disagree, and the few
  // characters there that matter in a supplier document are the quotes and
  // the dash a word processor substitutes.
  const SPECIAL: Record<number, string> = {
    0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026',
    0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160',
    0x8b: '\u2039', 0x8c: '\u0152', 0x8e: '\u017d', 0x91: '\u2018', 0x92: '\u2019',
    0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
    0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a', 0x9c: '\u0153',
    0x9e: '\u017e', 0x9f: '\u0178',
  };
  return SPECIAL[code] ?? String.fromCharCode(code);
}

/** Parse a ToUnicode CMap: the bfchar and bfrange sections. */
function parseToUnicode(data: Buffer): Map<number, string> {
  const out = new Map<number, string>();
  const text = data.toString('latin1');

  const hexToStr = (h: string): string => {
    // UTF-16BE, which is what a bfrange destination always is.
    let s = '';
    for (let i = 0; i + 3 < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    if (h.length === 2) s = String.fromCharCode(parseInt(h, 16));
    return s;
  };

  for (const m of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of (m[1] as string).matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      out.set(parseInt(p[1] as string, 16), hexToStr(p[2] as string));
    }
  }
  for (const m of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = m[1] as string;
    // `<lo> <hi> <dst>` walks the destination forward with the code.
    for (const p of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(p[1] as string, 16);
      const hi = parseInt(p[2] as string, 16);
      const dst = p[3] as string;
      const base = parseInt(dst.slice(-4), 16);
      const prefix = dst.slice(0, -4);
      for (let c = lo; c <= hi && c - lo < 65536; c++) {
        out.set(c, hexToStr(prefix + (base + (c - lo)).toString(16).padStart(4, '0')));
      }
    }
    // `<lo> <hi> [ <d1> <d2> ... ]` names each destination separately.
    for (const p of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(p[1] as string, 16);
      let i = 0;
      for (const d of (p[3] as string).matchAll(/<([0-9A-Fa-f]*)>/g)) {
        out.set(lo + i, hexToStr(d[1] as string));
        i++;
      }
    }
  }
  return out;
}

function loadFont(doc: PdfDocument, dict: PdfDict, name: string): Font {
  const widths = new Map<number, number>();
  const subtype = (doc.at(dict, 'Subtype') as Name | undefined)?.value ?? '';
  const encoding = doc.at(dict, 'Encoding');
  const encName = encoding instanceof Name ? encoding.value : '';
  const twoByte = subtype === 'Type0' && /Identity|UCS2|UTF16/.test(encName || 'Identity');

  let toUnicode = new Map<number, string>();
  const tu = doc.at(dict, 'ToUnicode');
  if (tu instanceof PdfStream) {
    const b = doc.streamBytes(tu);
    if (b) toUnicode = parseToUnicode(b);
  }

  // Simple font widths: one entry per code from FirstChar.
  const first = doc.at(dict, 'FirstChar');
  const w = doc.at(dict, 'Widths');
  if (typeof first === 'number' && Array.isArray(w)) {
    w.forEach((x, i) => {
      const v = doc.resolve(x);
      if (typeof v === 'number') widths.set(first + i, v);
    });
  }

  let defaultWidth = 500;
  // Composite font widths live on the descendant, in the /W array.
  const desc = doc.at(dict, 'DescendantFonts');
  const d0 = Array.isArray(desc) ? doc.resolve(desc[0] as PdfObject) : undefined;
  if (d0 instanceof Map) {
    const dw = doc.at(d0, 'DW');
    if (typeof dw === 'number') defaultWidth = dw;
    else defaultWidth = 1000;
    const wArr = doc.at(d0, 'W');
    if (Array.isArray(wArr)) {
      for (let i = 0; i < wArr.length; ) {
        const a = doc.resolve(wArr[i] as PdfObject);
        const b = doc.resolve(wArr[i + 1] as PdfObject);
        if (typeof a === 'number' && Array.isArray(b)) {
          b.forEach((x, k) => {
            const v = doc.resolve(x);
            if (typeof v === 'number') widths.set(a + k, v);
          });
          i += 2;
        } else if (typeof a === 'number' && typeof b === 'number') {
          const c = doc.resolve(wArr[i + 2] as PdfObject);
          if (typeof c === 'number') for (let k = a; k <= b && k - a < 65536; k++) widths.set(k, c);
          i += 3;
        } else i += 1;
      }
    }
  }

  // An encoding with /Differences renames individual codes. Only the glyph
  // names that map cleanly to a character are used; the rest keep the default,
  // because inventing a character from a glyph name is a guess.
  if (encoding instanceof Map) {
    const diffs = doc.at(encoding, 'Differences');
    if (Array.isArray(diffs)) {
      let code = 0;
      for (const item of diffs) {
        const v = doc.resolve(item);
        if (typeof v === 'number') code = v;
        else if (v instanceof Name) {
          const ch = glyphNameToChar(v.value);
          if (ch && !toUnicode.has(code)) toUnicode.set(code, ch);
          code++;
        }
      }
    }
  }

  return { toUnicode, widths, defaultWidth, twoByte, name };
}

/** The glyph names a word processor actually emits. Nothing is invented. */
function glyphNameToChar(n: string): string | undefined {
  const KNOWN: Record<string, string> = {
    space: ' ', hyphen: '-', period: '.', comma: ',', colon: ':', semicolon: ';',
    slash: '/', backslash: '\\', underscore: '_', parenleft: '(', parenright: ')',
    bracketleft: '[', bracketright: ']', plus: '+', equal: '=', at: '@',
    numbersign: '#', percent: '%', ampersand: '&', asterisk: '*', quotesingle: "'",
    quotedbl: '"', endash: '\u2013', emdash: '\u2014', bullet: '\u2022',
    zero: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  };
  if (KNOWN[n]) return KNOWN[n];
  if (/^[A-Za-z]$/.test(n)) return n;
  // uniXXXX and uXXXX[XX] are unambiguous.
  const m = /^uni([0-9A-Fa-f]{4})$/.exec(n) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(n);
  if (m) return String.fromCodePoint(parseInt(m[1] as string, 16));
  return undefined;
}

/** Every show operation on one page, with where it landed. */
export function pageTextRuns(doc: PdfDocument, page: PdfDict): TextRun[] {
  const content = doc.pageContent(page);
  const resources = doc.at(page, 'Resources');
  const fontRes = resources instanceof Map ? doc.at(resources, 'Font') : undefined;
  const fonts = new Map<string, Font>();
  const fontFor = (n: string): Font | undefined => {
    if (fonts.has(n)) return fonts.get(n);
    const d = fontRes instanceof Map ? doc.at(fontRes, n) : undefined;
    const f = d instanceof Map ? loadFont(doc, d, n) : undefined;
    if (f) fonts.set(n, f);
    return f;
  };

  const runs: TextRun[] = [];
  const lex = new Lexer(content, 0);
  const stack: PdfObject[] = [];
  const gsStack: Matrix[] = [];

  let ctm: Matrix = ID;
  let tm: Matrix = ID;
  let tlm: Matrix = ID;
  let font: Font | undefined;
  let fontSize = 0;
  let charSpacing = 0;
  let wordSpacing = 0;
  let hScale = 1;
  let leading = 0;
  let rise = 0;

  const n = (i: number): number => {
    const v = stack[stack.length - i];
    return typeof v === 'number' ? v : 0;
  };

  const show = (raw: string): void => {
    if (!font || fontSize === 0) {
      // Still advance nothing; a show with no font selected paints nothing.
      return;
    }
    const codes: number[] = [];
    if (font.twoByte) {
      for (let i = 0; i + 1 < raw.length; i += 2) {
        codes.push((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
      }
    } else {
      for (let i = 0; i < raw.length; i++) codes.push(raw.charCodeAt(i));
    }

    let text = '';
    let advance = 0;
    for (const c of codes) {
      text += font.toUnicode.get(c) ?? (font.twoByte ? '' : winAnsi(c));
      const w = (font.widths.get(c) ?? font.defaultWidth) / 1000;
      // Word spacing applies to the single byte 32, and only in a simple font.
      const ws = !font.twoByte && c === 32 ? wordSpacing : 0;
      advance += (w * fontSize + charSpacing + ws) * hScale;
    }

    // A run of only spaces is kept, not discarded. A producer that positions
    // every glyph draws the space between two words as a glyph like any other,
    // and dropping it turns "OpenSSL Project" into "OpenSSLProject" while
    // leaving the geometry looking contiguous. Callers that want visible text
    // can filter; a caller that needs the space cannot get it back.
    if (text !== '') {
      const m = mul(mul([fontSize * hScale, 0, 0, fontSize, 0, rise], tm), ctm);
      const scale = Math.hypot(ctm[0], ctm[1]) || 1;
      runs.push({
        text,
        x: m[4],
        y: m[5],
        size: Math.abs(fontSize * Math.hypot(tm[0], tm[1]) * scale),
        width: advance * Math.hypot(tm[0], tm[1]) * scale,
        font: font.name,
      });
    }
    tm = mul([1, 0, 0, 1, advance, 0], tm);
  };

  for (;;) {
    lex.skipWhitespace();
    if (lex.pos >= content.length) break;
    const before = lex.pos;
    const obj = lex.readObject();
    if (lex.pos === before) {
      lex.pos++;
      continue;
    }
    if (!(obj instanceof Operator)) {
      stack.push(obj);
      if (stack.length > 64) stack.shift();
      continue;
    }

    const op = obj.value;
    switch (op) {
      case 'q': gsStack.push(ctm); break;
      case 'Q': ctm = gsStack.pop() ?? ctm; break;
      case 'cm': ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], ctm); break;
      case 'BT': tm = ID; tlm = ID; break;
      case 'ET': break;
      case 'Tf': {
        fontSize = n(1);
        const f = stack[stack.length - 2];
        if (f instanceof Name) font = fontFor(f.value);
        break;
      }
      case 'Td': tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm); tm = tlm; break;
      case 'TD': leading = -n(1); tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm); tm = tlm; break;
      case 'Tm': tlm = [n(6), n(5), n(4), n(3), n(2), n(1)]; tm = tlm; break;
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case 'TL': leading = n(1); break;
      case 'Tc': charSpacing = n(1); break;
      case 'Tw': wordSpacing = n(1); break;
      case 'Tz': hScale = n(1) / 100; break;
      case 'Ts': rise = n(1); break;
      case 'Tj': {
        const s = stack[stack.length - 1];
        if (typeof s === 'string') show(s);
        break;
      }
      case "'": {
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm;
        const s = stack[stack.length - 1];
        if (typeof s === 'string') show(s);
        break;
      }
      case '"': {
        wordSpacing = n(3);
        charSpacing = n(2);
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm;
        const s = stack[stack.length - 1];
        if (typeof s === 'string') show(s);
        break;
      }
      case 'TJ': {
        const arr = stack[stack.length - 1];
        if (Array.isArray(arr)) {
          for (const el of arr) {
            if (typeof el === 'string') show(el);
            else if (typeof el === 'number') {
              // A negative number moves the text forward. This is how a
              // producer kerns, and also how many produce the gap between two
              // table columns, so it has to move the matrix rather than be
              // ignored.
              tm = mul([1, 0, 0, 1, (-el / 1000) * fontSize * hScale, 0], tm);
            }
          }
        }
        break;
      }
      default:
        break;
    }
    stack.length = 0;
  }

  return runs;
}
