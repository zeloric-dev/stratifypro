/**
 * The fixtures are printed by Chrome, not written by hand.
 *
 * That matters more than it sounds. A hand-written PDF fixture has an
 * uncompressed cross-reference table, one font, no object streams and no CID
 * encoding, so a reader tested only against one is a reader tested against its
 * author's idea of the format. Chrome emits cross-reference streams, object
 * streams, subset fonts with ToUnicode CMaps, and one show operation per
 * glyph. Every one of those broke an early draft of this package.
 *
 * scripts/make-pdf-fixtures.py regenerates them.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  EncryptedPdf,
  NoTextLayer,
  NotAPdf,
  PdfDocument,
  attachmentsOf,
  hasTextLayer,
  looksLikePdf,
  readPdf,
  tableFromPdf,
} from './index.js';

// The fixtures live in src and are read from there, because tsc does not copy
// binary files into dist. Same arrangement as packages/draft.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'fixtures');
const fx = (n: string): Buffer => readFileSync(join(FIXTURES, n));

/** Exactly what went into the HTML the fixture was printed from. */
const EXPECTED: Array<[string, string, string, string]> = [
  ['openssl', '3.0.11', 'The OpenSSL Project', 'Apache-2.0'],
  ['zlib', '1.2.13', 'Jean-loup Gailly', 'Zlib'],
  ['libcurl', '8.4.0', 'Haxx AB', 'curl'],
  ['FreeRTOS', '10.5.1', 'Amazon Web Services', 'MIT'],
  ['lwIP', '2.1.3', 'Swedish Institute of Computer Science', 'BSD-3-Clause'],
  ['mbedTLS', '3.4.1', 'Arm Limited', 'Apache-2.0'],
  ['SQLite', '3.43.2', 'Hwaci', 'blessing'],
  ['libpng', '1.6.40', 'PNG Development Group', 'libpng-2.0'],
  ['Newlib', '4.3.0', 'Red Hat', 'BSD-3-Clause'],
  ['STM32Cube HAL', '1.28.0', 'STMicroelectronics', 'BSD-3-Clause'],
  ['TinyUSB', '0.15.0', 'Ha Thach', 'MIT'],
  ['CMSIS', '5.9.0', 'Arm Limited', 'Apache-2.0'],
  ['protobuf-c', '1.4.1', 'Dave Benson', 'BSD-2-Clause'],
  ['wolfSSL', '5.6.4', 'wolfSSL Inc', 'GPL-2.0-or-later'],
  ['littlefs', '2.8.1', 'Arm Limited', 'BSD-3-Clause'],
  ['cJSON', '1.7.16', 'Dave Gamble', 'MIT'],
  ['micro-ecc', '1.0', 'Ken MacKay', 'BSD-2-Clause'],
  ['nanopb', '0.4.7', 'Petteri Aimonen', 'Zlib'],
  ['u8g2', '2.34.22', 'Oliver Kraus', 'BSD-2-Clause'],
  ['SEGGER RTT', '7.92', 'SEGGER Microcontroller', 'SEGGER-BSD'],
  ['Unity', '2.5.2', 'ThrowTheSwitch', 'MIT'],
  ['libsodium', '1.0.19', 'Frank Denis', 'ISC'],
  ['tinycbor', '0.6.0', 'Intel Corporation', 'MIT'],
  ['Mongoose', '7.12', 'Cesanta Software', 'GPL-2.0-only'],
];

test('the fixtures are two different real producers, not one simplified file', () => {
  // If either is later replaced with something hand-written, the suite still
  // passes while testing a fraction of the format. This pins what each one is
  // here to exercise.
  //
  // Chrome's Skia writes PDF 1.4: a classic cross-reference table, and CID
  // fonts with ToUnicode CMaps. Excel writes PDF 1.7: cross-reference streams
  // and object streams, which nothing else here produces. Two producers were
  // not belt and braces. Excel's file is what showed that sorting a line's
  // runs by x interleaves a clipped cell with its neighbours, which the Chrome
  // file cannot reveal because Chrome never overflows a cell.
  const chrome = fx('supplier-parts-list.pdf').toString('latin1');
  assert.ok(chrome.includes('Skia/PDF'), 'the Chrome fixture was not made by Chrome');
  assert.ok(chrome.includes('/Identity-H'), 'the Chrome fixture has no CID font');
  assert.ok(chrome.includes('/ToUnicode'), 'the Chrome fixture has no ToUnicode CMap');
  assert.ok(/^%PDF-1\.4/.test(chrome), 'the Chrome fixture is not PDF 1.4');

  const excel = fx('supplier-sheet-excel.pdf').toString('latin1');
  assert.ok(/^%PDF-1\.7/.test(excel), 'the Excel fixture is not PDF 1.7');
  assert.ok(excel.includes('/ObjStm'), 'the Excel fixture has no object streams');
  assert.ok(excel.includes('/XRef'), 'the Excel fixture has no cross-reference stream');
});

/**
 * The Excel fixture is the same sheet as packages/draft's supplier.xlsx,
 * printed to PDF. Same data, two formats, one producer that clips.
 */
const SHEET: string[][] = [
  ['OpenSSL', '1.1.1k', 'The OpenSSL Project', 'Apache-2.0, OpenSSL', 'Statically linked'],
  ['libcurl, bundled', '7.68.0', '', 'curl', 'Patched'],
  ['FreeRTOS', '10.4.3', 'Amazon', 'MIT', ''],
  ['', '', 'Nobody', '', 'orphan'],
  ['mbed TLS', '', 'Arm', 'Apache-2.0', 'No version supplied'],
];

test('an Excel-printed sheet reads exactly, clipped overflow and all', () => {
  const { table } = tableFromPdf(fx('supplier-sheet-excel.pdf'));
  assert.deepEqual(table.header, ['Component Name', 'Version', 'Supplier', 'License', 'Notes']);
  assert.equal(table.columnStarts.length, 5);
  assert.equal(table.rows.length, SHEET.length);
  table.rows.forEach((row, i) => {
    assert.deepEqual(row.cells, SHEET[i], `row ${i + 1} was read wrong`);
  });
});

test('a cell wider than its column stays one cell', () => {
  // "The OpenSSL Project" is drawn across the two columns to its right,
  // because Excel draws the whole value and clips it. Reading the page as a
  // grid of x positions splits it into "The OpenSS" and "L Project", and
  // welds the second half onto the licence. The regression this guards is a
  // component whose supplier and licence are silently swapped.
  const { table } = tableFromPdf(fx('supplier-sheet-excel.pdf'));
  const first = table.rows[0]?.cells ?? [];
  assert.equal(first[2], 'The OpenSSL Project');
  assert.equal(first[3], 'Apache-2.0, OpenSSL');
});

test('a value that nearly fills its column does not swallow the next one', () => {
  // "FreeRTOS" leaves a third of an em before the version in the next column,
  // narrower than the space inside "mbed TLS". A gap threshold cannot tell
  // those apart, so the cell boundary comes from the column start instead.
  const { table } = tableFromPdf(fx('supplier-sheet-excel.pdf'));
  const row = table.rows.find((r) => r.cells[0] === 'FreeRTOS');
  assert.ok(row, 'FreeRTOS was not read as its own cell');
  assert.equal(row?.cells[1], '10.4.3');
});

test('every row of the supplier parts list, character for character', () => {
  const { table } = tableFromPdf(fx('supplier-parts-list.pdf'));
  assert.deepEqual(table.header, ['Component Name', 'Version', 'Supplier', 'License']);
  assert.equal(table.columnStarts.length, 4);
  assert.equal(table.rows.length, EXPECTED.length);
  table.rows.forEach((row, i) => {
    assert.deepEqual(row.cells, EXPECTED[i], `row ${i + 1} was read wrong`);
  });
  assert.equal(table.ragged.length, 0);
});

test('the title and the subtitle are reported as orphans, not as rows', () => {
  // They are text on the page that is not in the table. Silently dropping them
  // would be the same behaviour as silently dropping a component.
  const { table } = tableFromPdf(fx('supplier-parts-list.pdf'));
  const texts = table.orphans.map((o) => o.text);
  assert.ok(texts.some((t) => t.includes('Software Bill of Materials')));
  assert.ok(texts.some((t) => t.includes('HX-4100')));
  assert.ok(
    !texts.some((t) => EXPECTED.some((r) => t.includes(r[0]))),
    'a component name was dropped into the orphan list',
  );
});

test('a document with no table produces no table', () => {
  // The failure this guards against is the tempting one: finding "a table" in
  // running prose and handing back components nobody wrote.
  const { table } = tableFromPdf(fx('supplier-declaration.pdf'));
  assert.equal(table.rows.length, 0);
  assert.deepEqual(table.header, []);
});

test('a scan is refused, and the message says what to ask the supplier for', () => {
  assert.throws(
    () => readPdf(fx('scanned-page.pdf')),
    (e: unknown) => {
      assert.ok(e instanceof NoTextLayer);
      assert.match(e.message, /scan/i);
      assert.match(e.message, /ask the supplier/i);
      return true;
    },
  );
  assert.equal(hasTextLayer(fx('scanned-page.pdf')), false);
  assert.equal(hasTextLayer(fx('supplier-parts-list.pdf')), true);
});

test('a file that is not a PDF is refused as such', () => {
  assert.throws(() => readPdf(Buffer.from('PK\x03\x04 this is a zip')), NotAPdf);
  assert.throws(() => readPdf(Buffer.alloc(0)), NotAPdf);
  assert.equal(looksLikePdf(Buffer.from('%PDF-1.7\n')), true);
  assert.equal(looksLikePdf(Buffer.from('%!PS-Adobe')), false);
});

test('a truncated PDF is recovered by scanning, not abandoned', () => {
  // Real supplier documents arrive truncated by a mail gateway often enough
  // that giving up loses data that is plainly still in the file.
  const full = fx('supplier-parts-list.pdf');
  const cut = full.subarray(0, Math.floor(full.length * 0.97));
  const read = readPdf(cut);
  assert.ok(read.recovered, 'the reader did not fall back to scanning');
  assert.ok(read.pages.some((p) => p.length > 0), 'nothing was recovered');
});

test('a PDF whose xref offsets are wrong still reads', () => {
  // Corrupt startxref so the documented route points at nothing. The file is
  // otherwise intact, so a reader that trusted the table alone returns empty.
  const full = Buffer.from(fx('supplier-parts-list.pdf'));
  const at = full.lastIndexOf('startxref', undefined, 'latin1');
  assert.ok(at > 0);
  full.write('startxref\n999999999\n', at, 'latin1');
  const { table, read } = tableFromPdf(full);
  assert.ok(read.recovered);
  assert.equal(table.rows.length, EXPECTED.length, 'recovery lost rows');
});

test('junk before %PDF- does not shift every offset', () => {
  // A mail gateway prepending a banner is the usual cause. Offsets inside are
  // relative to the header, so the reader has to find it rather than assume 0.
  const withJunk = Buffer.concat([Buffer.from('X-Scanned-By: nothing\r\n\r\n'), fx('supplier-parts-list.pdf')]);
  const { table } = tableFromPdf(withJunk);
  assert.equal(table.rows.length, EXPECTED.length);
});

test('an encrypted PDF is refused rather than read as rubbish', () => {
  // The shape of the refusal is what matters: an /Encrypt entry in the
  // trailer means every string is ciphertext, and a reader that carried on
  // would return component names that are not in the document.
  const pdf = handBuilt(
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    { extraTrailer: '/Encrypt 9 0 R ' },
  );
  assert.throws(() => readPdf(pdf), EncryptedPdf);
});

test('an attached file is returned exactly, not inferred', () => {
  // A supplier who attaches the spreadsheet has given us the data itself.
  // Reading that beats inferring the same table from glyph positions.
  const payload = 'name,version\nopenssl,3.0.11\n';
  const pdf = attachmentPdf('parts.csv', payload);
  const doc = PdfDocument.read(pdf);
  const files = attachmentsOf(doc);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.name, 'parts.csv');
  assert.equal(files[0]?.bytes.toString('utf8'), payload);
});

test('a PDF with only an attachment is not refused as a scan', () => {
  // It has no text layer, but it has the data. Refusing it would send a person
  // back to a supplier who already sent the right thing.
  const pdf = attachmentPdf('parts.csv', 'name,version\nzlib,1.2.13\n');
  const read = readPdf(pdf);
  assert.equal(read.attachments.length, 1);
});

// ---- small hand-built PDFs, for structures Chrome will not produce --------

function handBuilt(...objs: Array<string | { extraTrailer: string }>): Buffer {
  const extra = typeof objs[objs.length - 1] === 'object' ? (objs.pop() as { extraTrailer: string }).extraTrailer : '';
  const bodies = objs as string[];
  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R ${extra}>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function attachmentPdf(name: string, content: string): Buffer {
  return handBuilt(
    `<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(${name}) 4 0 R] >> >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    `<< /Type /Filespec /F (${name}) /UF (${name}) /EF << /F 5 0 R >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  );
}
