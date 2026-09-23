/**
 * The PDF path of SPEC.md 2A.3, tested through the draft package rather than
 * through the reader.
 *
 * packages/pdf already proves the table comes off the page correctly. What is
 * proved here is what the draft package adds: that a PDF draft carries the
 * same draft marker as a spreadsheet draft, that nothing is invented when the
 * page has no table, and that a scan is refused rather than turned into an
 * empty component list that reads like a supplier who declared nothing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { draftFromPdf, draftFromXlsx, isDraft, NoTextLayer } from './index.js';

// The PDF fixtures live with the reader that they exercise most.
const PDFS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'pdf', 'src', 'fixtures');
const XLSX = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'fixtures');
const fx = (n: string): Buffer => readFileSync(join(PDFS, n));
const OPTS = { sourceName: 'supplier.pdf', timestamp: '2026-09-23T10:00:00Z' };

test('a supplier PDF becomes a draft, and the draft says so', () => {
  const r = draftFromPdf(fx('supplier-parts-list.pdf'), OPTS);
  assert.equal(r.componentCount, 24);
  assert.ok(isDraft(r.document), 'the document is not marked as a draft');
  assert.deepEqual(r.source, { kind: 'layout', pageCount: 1, columns: 4, recovered: false });
});

test('the same sheet as xlsx and as PDF produces the same components', () => {
  // supplier-sheet-excel.pdf is supplier.xlsx printed by Excel. If the two
  // paths disagree, one of them is wrong, and this is the only test in the
  // repository that can say which formats were read consistently.
  const fromPdf = draftFromPdf(fx('supplier-sheet-excel.pdf'), OPTS);
  const fromXlsx = draftFromXlsx(readFileSync(join(XLSX, 'supplier.xlsx')), OPTS);

  const names = (d: { document: Record<string, unknown> }): string[] =>
    (d.document.components as Array<{ name: string }>).map((c) => c.name);
  const versions = (d: { document: Record<string, unknown> }): Array<string | undefined> =>
    (d.document.components as Array<{ version?: string }>).map((c) => c.version);

  assert.deepEqual(names(fromPdf), names(fromXlsx));
  assert.deepEqual(versions(fromPdf), versions(fromXlsx));
});

test('no package URL is constructed from a name and a version', () => {
  // The rule the whole package is built on. A guessed identifier is what
  // produces a confident wrong vulnerability verdict later.
  const r = draftFromPdf(fx('supplier-parts-list.pdf'), OPTS);
  const comps = r.document.components as Array<{ purl?: string }>;
  assert.ok(comps.every((c) => c.purl === undefined), 'a purl was invented');
});

test('a PDF with no table produces no components', () => {
  const r = draftFromPdf(fx('supplier-declaration.pdf'), OPTS);
  assert.equal(r.componentCount, 0);
  assert.ok(isDraft(r.document));
  // And the prose it refused to read is reported, not silently discarded.
  assert.ok(r.droppedText.some((t) => t.includes('Haldane Instruments')));
});

test('a scan is refused rather than read as an empty declaration', () => {
  // Returning zero components here would be indistinguishable from a supplier
  // who listed nothing, which is the one outcome that must not be guessable.
  assert.throws(() => draftFromPdf(fx('scanned-page.pdf'), OPTS), NoTextLayer);
});

test('text that reached no column is reported', () => {
  const r = draftFromPdf(fx('supplier-parts-list.pdf'), OPTS);
  assert.ok(r.droppedText.length > 0);
  assert.ok(r.droppedText.some((t) => t.includes('Software Bill of Materials')));
});
