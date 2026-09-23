/**
 * The xlsx reader, against a workbook a real library wrote.
 *
 * `supplier.xlsx` was produced by openpyxl rather than hand-assembled, and
 * that matters: a fixture I built myself would encode my assumptions about the
 * format and agree with whatever the reader does. The same reasoning the
 * advisory mirror's fixture carries.
 *
 * The sheet is built to contain the cases that silently misalign a table
 * rather than fail:
 *
 *   a row with a GAP           no supplier, so the licence must not slide left
 *   a row with no name         must be skipped, with a reason
 *   a second sheet             must NOT be read
 *   a quoted comma in a name   "libcurl, bundled" survives as one value
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { columnIndex, draftFromXlsx, looksLikeXlsx, readXlsx, rowNumber } from './index.js';

// The fixture lives in src and is read from there, because tsc does not copy
// binary files into dist.
const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'fixtures',
  'supplier.xlsx',
);
const BUF = readFileSync(FIXTURE);
const OPTS = { sourceName: 'supplier.xlsx', timestamp: '2026-09-23T10:00:00Z' };

test('column references become indices', () => {
  assert.equal(columnIndex('A1'), 0);
  assert.equal(columnIndex('B2'), 1);
  assert.equal(columnIndex('Z9'), 25);
  assert.equal(columnIndex('AA1'), 26);
  assert.equal(columnIndex('AB1'), 27);
  assert.equal(columnIndex('BA1'), 52);
  assert.equal(rowNumber('A1'), 1);
  assert.equal(rowNumber('AA123'), 123);
});

test('a real workbook reads into rows', () => {
  const t = readXlsx(BUF);
  assert.match(t.sheetPart, /^xl\/worksheets\/sheet\d+\.xml$/);
  assert.deepEqual(t.rows[0], ['Component Name', 'Version', 'Supplier', 'License', 'Notes']);
  assert.equal(t.rows[1]?.[0], 'OpenSSL');
});

test('THE ONE THAT MATTERS: an empty cell leaves a gap, it does not shift the row', () => {
  // Row 3 has no supplier. An empty cell is usually ABSENT from the XML, so a
  // reader taking cells in document order puts the licence in the supplier
  // column and every later field moves left. The table still looks fine.
  const t = readXlsx(BUF);
  const row = t.rows[2] as string[];
  assert.equal(row[0], 'libcurl, bundled');
  assert.equal(row[1], '7.68.0');
  assert.equal(row[2], '', 'the missing supplier should be an empty cell');
  assert.equal(row[3], 'curl', 'the licence slid into the supplier column');
});

test('shared strings are resolved, not left as indices', () => {
  // Most text in an xlsx lives in xl/sharedStrings.xml and the cell holds an
  // index. A reader taking the literal <v> gets "0", "1", "2" where the
  // component names should be.
  const t = readXlsx(BUF);
  for (const row of t.rows) {
    for (const cell of row) {
      assert.ok(!/^\d+$/.test(cell) || cell === '', `"${cell}" looks like an unresolved index`);
    }
  }
  assert.equal(t.rows[1]?.[2], 'The OpenSSL Project');
});

test('only the first sheet is read', () => {
  // The workbook has a second sheet containing WRONG-SHEET-COMPONENT. Reading
  // the wrong worksheet would transcribe somebody else's table in silence.
  const t = readXlsx(BUF);
  const flat = t.rows.flat().join('|');
  assert.ok(!flat.includes('WRONG-SHEET-COMPONENT'), 'a second sheet was read');
});

test('the xlsx path produces the same draft the csv path would', () => {
  // Both formats reduce to a header and rows, and everything after the reader
  // is shared. Two transcribers with two sets of rules would be two things to
  // keep honest.
  const d = draftFromXlsx(BUF, OPTS);
  assert.equal(d.componentCount, 4);
  const names = (d.document['components'] as Array<{ name: string }>).map((c) => c.name);
  assert.deepEqual(names, ['OpenSSL', 'libcurl, bundled', 'FreeRTOS', 'mbed TLS']);
  assert.deepEqual(d.unmappedColumns, ['Notes']);
  assert.equal(d.skipped.length, 1);
  assert.match(d.skipped[0]?.why ?? '', /no component name/);
});

test('no identifier is invented from a spreadsheet either', () => {
  const d = draftFromXlsx(BUF, OPTS);
  for (const c of d.document['components'] as Array<Record<string, unknown>>) {
    assert.equal(c['purl'], undefined, `${String(c['name'])} was given an invented purl`);
  }
});

test('an xlsx draft is still a draft', () => {
  const d = draftFromXlsx(BUF, OPTS);
  const props = (d.document['metadata'] as { properties: Array<{ name: string; value: string }> })
    .properties;
  assert.ok(props.some((p) => p.name === 'stratifypro:draft' && p.value === 'true'));
});

test('xlsx is recognised by its bytes, not its name', () => {
  // A supplier emailing a workbook named components.csv is common, and reading
  // a zip as text produces a draft full of mojibake rather than an error.
  assert.equal(looksLikeXlsx(BUF), true);
  assert.equal(looksLikeXlsx(Buffer.from('name,version\nfoo,1.0\n')), false);
  assert.equal(looksLikeXlsx(Buffer.alloc(0)), false);
  assert.equal(looksLikeXlsx(Buffer.from([0x50, 0x4b])), false);
});

test('a file that is not really a workbook is refused with a reason', () => {
  assert.throws(() => readXlsx(Buffer.from('not a zip')), /not a readable xlsx/);
});
