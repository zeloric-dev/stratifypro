/**
 * Read the first worksheet of an xlsx file into rows of strings.
 *
 * WHY THIS IS BUILT AND PDF IS NOT. When the csv path shipped, this said xlsx
 * and PDF were both unbuilt because "an extractor that usually works is the
 * exact shape of tool this project refuses". That was right about PDF and
 * wrong about xlsx, and the distinction is worth stating: an xlsx file is a
 * zip of XML with a defined schema. Reading it is careful work, not guesswork.
 * A PDF is a page-description language where a table is lines and glyphs at
 * coordinates, and recovering columns from it is inference. One can be correct;
 * the other can only be usually right.
 *
 * WHAT MAKES THIS SUBTLE, and each of these silently misaligns a table:
 *
 *   Shared strings. Most text lives in xl/sharedStrings.xml and a cell holds
 *   an INDEX into it. A reader that takes the literal <v> gets "0", "1", "2"
 *   where the names should be.
 *
 *   Sparse cells. An empty cell is usually absent from the XML rather than
 *   present and empty. Reading cells in document order shifts every later
 *   column left, so a sheet with a blank supplier puts the licence in the
 *   supplier field. Cells are placed by their reference, A1 and B1, not by the
 *   order they appear.
 *
 *   Sparse rows. The same, one dimension up: r="5" after r="3" means row 4 was
 *   empty, not that it does not exist.
 *
 *   Inline strings and rich text. <is><t> holds text directly, and a styled
 *   cell splits its text across several <r><t> runs that have to be joined.
 *
 * No entity beyond the five XML predefined ones is decoded, and no external
 * entity is ever fetched: this is a supplier's file and XML parsers that
 * resolve entities are how a spreadsheet reads a local file.
 */
import { readZip, type Entry } from '@stratifypro/zip';

/** `A` is 1, `Z` is 26, `AA` is 27. Used to place a cell in its column. */
export function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase());
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[1] as string) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The row number from a cell reference, 1-based as the file writes it. */
export function rowNumber(ref: string): number {
  const digits = /(\d+)$/.exec(ref);
  return digits ? Number(digits[1]) : -1;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeXmlText(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}

/** Every `<t>` inside a fragment, joined. Rich text splits one string across runs. */
function textOf(fragment: string): string {
  let out = '';
  for (const m of fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
    out += decodeXmlText(m[1] ?? '');
  }
  return out;
}

function sharedStrings(entries: Entry[]): string[] {
  const e = entries.find((x) => x.name === 'xl/sharedStrings.xml');
  if (!e) return [];
  const xml = e.read().toString('utf8');
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) out.push(textOf(m[1] ?? ''));
  return out;
}

/**
 * Which worksheet part holds the first sheet.
 *
 * Not "the file called sheet1.xml". A workbook whose first sheet was renamed,
 * reordered or deleted can have its first sheet stored as sheet3.xml, and
 * reading the wrong one would silently transcribe somebody else's table.
 */
function firstSheetPart(entries: Entry[]): string | null {
  const wb = entries.find((x) => x.name === 'xl/workbook.xml');
  const rels = entries.find((x) => x.name === 'xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb.read().toString('utf8'));
    if (first) {
      const relsXml = rels.read().toString('utf8');
      const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${first[1]}"[^>]*\\bTarget="([^"]+)"`)
        .exec(relsXml);
      if (rel) {
        const target = (rel[1] as string).replace(/^\/?(xl\/)?/, '');
        const name = `xl/${target}`;
        if (entries.some((x) => x.name === name)) return name;
      }
    }
  }
  const fallback = entries
    .filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return fallback[0]?.name ?? null;
}

export interface XlsxTable {
  rows: string[][];
  /** The worksheet part that was read, so a surprising result can be traced. */
  sheetPart: string;
}

/** Read the first worksheet. Throws with a readable reason when it cannot. */
export function readXlsx(buf: Buffer): XlsxTable {
  let entries: Entry[];
  try {
    entries = readZip(buf);
  } catch (e) {
    throw new Error(`this is not a readable xlsx file: ${(e as Error).message}`);
  }

  const part = firstSheetPart(entries);
  if (!part) throw new Error('this xlsx file contains no worksheet');

  const shared = sharedStrings(entries);
  const xml = (entries.find((x) => x.name === part) as Entry).read().toString('utf8');

  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const attrs = rowMatch[1] ?? '';
    const body = rowMatch[2] ?? '';
    const rAttr = /\br="(\d+)"/.exec(attrs);
    const rowIdx = rAttr ? Number(rAttr[1]) - 1 : rows.length;

    const cells: string[] = [];
    for (const cellMatch of body.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cAttrs = cellMatch[1] ?? '';
      const cBody = cellMatch[2] ?? '';
      const refMatch = /\br="([A-Za-z]+\d+)"/.exec(cAttrs);
      const col = refMatch ? columnIndex(refMatch[1] as string) : cells.length;
      const type = /\bt="([^"]+)"/.exec(cAttrs)?.[1];

      let value = '';
      if (type === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(cBody)?.[1] ?? '-1');
        value = shared[idx] ?? '';
      } else if (type === 'inlineStr') {
        value = textOf(cBody);
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(cBody)?.[1];
        value = v === undefined ? textOf(cBody) : decodeXmlText(v);
      }

      // Placed by reference. An absent cell leaves a gap rather than shifting
      // every later column left, which is the failure that puts a licence in
      // the supplier field.
      if (col >= 0) {
        while (cells.length < col) cells.push('');
        cells[col] = value;
      }
    }

    while (rows.length < rowIdx) rows.push([]);
    rows[rowIdx] = cells;
  }

  // Trailing empty rows carry no information; interior ones were preserved
  // above because a gap inside a table is a fact about the table.
  while (rows.length > 0 && (rows[rows.length - 1] ?? []).every((c) => c === '')) rows.pop();

  return { rows, sheetPart: part };
}

/** Is this buffer an xlsx? Both zip magic numbers, not the file extension. */
export function looksLikeXlsx(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  const magic = buf.readUInt32LE(0);
  // "PK\3\4" for a normal archive, "PK\5\6" for an empty one.
  return magic === 0x04034b50 || magic === 0x06054b50;
}
