/**
 * @stratifypro/pdf
 *
 * Just enough of PDF to read a supplier's parts table, and to refuse clearly
 * when there is no table to read.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A DEPENDENCY. SPEC.md 2A.3 wants a
 * supplier document turned into a draft bill of materials. The market fact
 * behind it is in SPEC.md: 39 percent of surveyed firms never receive an SBOM
 * from a supplier, and 2 percent always do. What arrives is a document
 * somebody retypes by hand. `packages/zip` already sets the pattern here: the
 * format is read directly, with no runtime dependency, because a parts table
 * is evidence and the chain from bytes to component has to be inspectable.
 *
 * THE REFUSALS ARE THE FEATURE. A PDF of a scan has no text in it at all, only
 * a picture of text. A reader that ran OCR and handed back component names
 * would be inventing the contents of a regulatory submission from pixels. So
 * a PDF with no text layer is refused by name, and the message says what to do
 * about it: ask the supplier for the file they printed from. Encrypted files
 * are refused for the same reason.
 *
 * WHAT IT CANNOT DO, stated rather than discovered:
 *   - no OCR, so a scanned document produces NoTextLayer
 *   - no encryption, so a password-protected file produces EncryptedPdf
 *   - no ruling-line detection, so columns are inferred from text positions
 *     and a table whose columns overlap horizontally will be read wrong
 *   - text drawn invisibly or clipped away is still returned as text
 */
import { PdfDocument, NotAPdf, EncryptedPdf } from './document.js';
import { pageTextRuns, type TextRun } from './text.js';
import { tableFromRuns, type TableShape, type TableRow } from './table.js';
import { Name, PdfStream, type PdfDict, type PdfObject } from './syntax.js';

export const PACKAGE_NAME = '@stratifypro/pdf' as const;

export { NotAPdf, EncryptedPdf } from './document.js';
export { type TextRun } from './text.js';
export { type TableShape, type TableRow } from './table.js';

export class NoTextLayer extends Error {
  constructor(readonly pageCount: number) {
    super(
      'this PDF contains no text, only images. It is a scan, so nothing can be read from it ' +
        'without optical character recognition, and a component list produced by guessing at ' +
        'pixels is not something to file with a regulator. Ask the supplier for the ' +
        'spreadsheet or document they printed from.',
    );
    this.name = 'NoTextLayer';
  }
}

/** A file carried inside the PDF, which is exact rather than inferred. */
export interface Attachment {
  name: string;
  bytes: Buffer;
}

export interface PdfReadResult {
  pageCount: number;
  /** Text runs per page, in the order the pages appear. */
  pages: TextRun[][];
  /** True when the cross-reference table was unusable and the file was scanned. */
  recovered: boolean;
  /** Files carried inside the PDF. Exact content, not inferred from any layout. */
  attachments: Attachment[];
}

/**
 * Read a PDF's text and attachments.
 *
 * Throws NotAPdf, EncryptedPdf or NoTextLayer. Each one names the reason and
 * what can be done about it, because "could not read file" sends a person back
 * to a supplier with nothing to ask for.
 */
export function readPdf(buf: Buffer): PdfReadResult {
  const doc = PdfDocument.read(buf);
  const pageDicts = doc.pages();
  const pages = pageDicts.map((p) => pageTextRuns(doc, p));
  const attachments = attachmentsOf(doc);

  const anyText = pages.some((runs) => runs.some((r) => r.text.trim() !== ''));
  if (!anyText && attachments.length === 0) throw new NoTextLayer(pageDicts.length);

  return { pageCount: pageDicts.length, pages, recovered: doc.recovered, attachments };
}

/** Read a PDF and infer a table from where its text sits. */
export function tableFromPdf(buf: Buffer): { table: TableShape; read: PdfReadResult } {
  const read = readPdf(buf);
  return { table: tableFromRuns(read.pages), read };
}

/**
 * Files embedded in the PDF.
 *
 * Worth having for a reason beyond completeness: a supplier who attaches the
 * spreadsheet to the PDF has given us the exact data, and reading that beats
 * inferring the same table from glyph positions every time. Both the modern
 * name tree and the older file-annotation form are checked, because which one
 * a producer uses is not the supplier's choice.
 */
export function attachmentsOf(doc: PdfDocument): Attachment[] {
  const out: Attachment[] = [];
  const seen = new Set<string>();

  const take = (name: string, fileSpec: PdfObject): void => {
    const fs = doc.resolve(fileSpec);
    if (!(fs instanceof Map)) return;
    const ef = doc.at(fs, 'EF');
    if (!(ef instanceof Map)) return;
    const stream = doc.at(ef, 'F') ?? doc.at(ef, 'UF') ?? doc.at(ef, 'DOS');
    if (!(stream instanceof PdfStream)) return;
    const bytes = doc.streamBytes(stream);
    if (!bytes) return;
    const uf = doc.at(fs, 'UF');
    const f = doc.at(fs, 'F');
    const label = typeof uf === 'string' ? uf : typeof f === 'string' ? f : name;
    const key = `${label}:${bytes.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: label, bytes });
  };

  // The name tree: Root -> Names -> EmbeddedFiles -> Names/Kids.
  const root = doc.resolve(doc.trailer.get('Root') ?? null);
  const names = root instanceof Map ? doc.at(root, 'Names') : undefined;
  const embedded = names instanceof Map ? doc.at(names, 'EmbeddedFiles') : undefined;

  const walkNameTree = (node: PdfObject, depth: number): void => {
    if (depth > 16) return;
    const d = doc.resolve(node);
    if (!(d instanceof Map)) return;
    const arr = doc.at(d, 'Names');
    if (Array.isArray(arr)) {
      for (let i = 0; i + 1 < arr.length; i += 2) {
        const n = doc.resolve(arr[i] as PdfObject);
        take(typeof n === 'string' ? n : `attachment-${out.length + 1}`, arr[i + 1] as PdfObject);
      }
    }
    const kids = doc.at(d, 'Kids');
    if (Array.isArray(kids)) for (const k of kids) walkNameTree(k, depth + 1);
  };
  if (embedded) walkNameTree(embedded, 0);

  // The older form: a FileAttachment annotation on a page.
  for (const page of doc.pages()) {
    const annots = doc.at(page, 'Annots');
    if (!Array.isArray(annots)) continue;
    for (const a of annots) {
      const ad = doc.resolve(a);
      if (!(ad instanceof Map)) continue;
      if ((doc.at(ad, 'Subtype') as Name | undefined)?.value !== 'FileAttachment') continue;
      take(`attachment-${out.length + 1}`, ad.get('FS') ?? null);
    }
  }

  return out;
}

/** Does this file have any text at all? Answers without throwing. */
export function hasTextLayer(buf: Buffer): boolean {
  try {
    const doc = PdfDocument.read(buf);
    return doc.pages().some((p) => pageTextRuns(doc, p).some((r) => r.text.trim() !== ''));
  } catch {
    return false;
  }
}

/** The first bytes of every PDF. Cheap enough to check before anything else. */
export function looksLikePdf(buf: Buffer): boolean {
  return buf.subarray(0, 1024).toString('latin1').includes('%PDF-');
}

export { PdfDocument } from './document.js';
export type { PdfDict, PdfObject } from './syntax.js';
