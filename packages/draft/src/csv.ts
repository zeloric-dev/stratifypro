/**
 * RFC 4180 comma-separated values, parsed properly.
 *
 * Written rather than split on commas because supplier spreadsheets are full
 * of the cases that breaks. A licence field reading `MIT, Apache-2.0`, a
 * component described as `libfoo (bundled, patched)`, a note containing a
 * newline: each one silently shifts every later column by one, and the result
 * is a draft bill of materials where versions land in the supplier column.
 *
 * Nobody would notice. That is the problem: the output still parses, still
 * renders, and is wrong about a device.
 */

export interface CsvTable {
  header: string[];
  rows: string[][];
  /** Rows whose column count did not match the header, with their line number. */
  ragged: Array<{ line: number; cells: number }>;
}

/**
 * Parse CSV into a header and rows.
 *
 * Handles quoted fields, embedded commas, embedded newlines, and the doubled
 * quote escape. Accepts CRLF and LF. A ragged row is kept AND reported rather
 * than dropped or padded silently: a supplier sheet with a stray comma is
 * exactly the document this exists to read, and pretending it was clean is how
 * a wrong component reaches a submission.
 */
export function parseCsv(text: string): CsvTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let started = false;

  // Strip a UTF-8 byte order mark. Excel writes one, and it would otherwise
  // become part of the first header name, so `name` would not match `name`.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = (): void => {
    row.push(field);
    field = '';
    started = false;
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] as string;

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"' && !started) {
      inQuotes = true;
      started = true;
      continue;
    }
    if (c === ',') {
      endField();
      continue;
    }
    if (c === '\r') {
      if (s[i + 1] === '\n') i += 1;
      endRow();
      continue;
    }
    if (c === '\n') {
      endRow();
      continue;
    }
    field += c;
    started = true;
  }

  // A trailing newline should not produce a final empty row, but a file with
  // no trailing newline must not lose its last row.
  if (field !== '' || row.length > 0) endRow();

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) return { header: [], rows: [], ragged: [] };

  const header = (nonEmpty[0] as string[]).map((h) => h.trim());
  const body: string[][] = [];
  const ragged: Array<{ line: number; cells: number }> = [];
  for (let i = 1; i < nonEmpty.length; i += 1) {
    const r = nonEmpty[i] as string[];
    if (r.length !== header.length) ragged.push({ line: i + 1, cells: r.length });
    body.push(r);
  }
  return { header, rows: body, ragged };
}
