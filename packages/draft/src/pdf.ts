/**
 * A supplier's PDF to a draft bill of materials. SPEC.md 2A.3, the last format.
 *
 * AN ATTACHMENT BEATS AN INFERENCE, ALWAYS. A supplier who attached the
 * spreadsheet to the PDF has sent the exact data. Reading that is not a
 * shortcut, it is the correct answer, and inferring the same table from glyph
 * positions when the real one is sitting inside the file would be choosing the
 * worse source on purpose. So attachments are checked first and the draft
 * records which route was taken.
 *
 * WHAT THIS DOES NOT DO IS THE PART THAT MATTERS. A PDF of a scan is refused,
 * not guessed at. A PDF with no table in it produces no components, not a
 * plausible list. Neither is a limitation to apologise for: the output of this
 * function is the starting point for a regulatory submission, and a component
 * nobody wrote is worse in that document than a component that is missing,
 * because a missing one gets noticed.
 */
import {
  NoTextLayer,
  tableFromPdf,
  type TableShape,
} from '@stratifypro/pdf';
import { draftFromCsv, draftFromTable, type DraftOptions, type DraftResult } from './index.js';

/** Where the components in a PDF draft actually came from. */
export type PdfSource =
  /** An exact file carried inside the PDF. Nothing was inferred. */
  | { kind: 'attachment'; fileName: string }
  /** Inferred from where text sits on the page. */
  | { kind: 'layout'; pageCount: number; columns: number; recovered: boolean };

export interface PdfDraftResult extends DraftResult {
  source: PdfSource;
  /** Text on the page that landed in no column. Each one was not read. */
  droppedText: string[];
}

/**
 * Convert a supplier PDF into a draft CycloneDX document.
 *
 * Throws NoTextLayer when the file is a scan, because there is no honest
 * answer in that case and returning an empty draft would look like a supplier
 * who listed nothing rather than a file nobody could read.
 */
export function draftFromPdf(buf: Buffer, opts: DraftOptions): PdfDraftResult {
  let table: TableShape;
  let read: { pageCount: number; recovered: boolean; attachments: Array<{ name: string; bytes: Buffer }> };
  try {
    const r = tableFromPdf(buf);
    table = r.table;
    read = r.read;
  } catch (e) {
    if (e instanceof NoTextLayer) throw e;
    throw e;
  }

  // A csv attachment is the supplier's own data, not our reading of their page.
  const csv = read.attachments.find((a) => /\.csv$/i.test(a.name));
  if (csv) {
    const base = draftFromCsv(csv.bytes.toString('utf8'), {
      ...opts,
      sourceName: `${opts.sourceName} (attached ${csv.name})`,
    });
    return { ...base, source: { kind: 'attachment', fileName: csv.name }, droppedText: [] };
  }

  const base = draftFromTable(
    {
      header: table.header,
      rows: table.rows.map((r) => r.cells),
      ragged: table.ragged.map((r) => ({ line: Math.round(r.y), cells: r.cells })),
    },
    opts,
  );

  return {
    ...base,
    source: {
      kind: 'layout',
      pageCount: read.pageCount,
      columns: table.columnStarts.length,
      recovered: read.recovered,
    },
    // Reported rather than discarded. Text on the page that reached no column
    // is the most likely place for a component this missed.
    droppedText: table.orphans.map((o) => o.text),
  };
}

export { NoTextLayer, EncryptedPdf, NotAPdf, looksLikePdf } from '@stratifypro/pdf';
