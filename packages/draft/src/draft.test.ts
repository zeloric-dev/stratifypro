/**
 * A supplier spreadsheet in, a draft out, and nothing invented on the way.
 *
 * Most of this file is about the CSV parser, because a supplier sheet is
 * exactly the document that breaks a naive one. A licence field reading
 * `MIT, Apache-2.0`, a component called `libfoo (bundled, patched)`, a note
 * with a newline in it: each shifts every later column by one, and the result
 * is a draft where versions sit in the supplier field. It still parses, still
 * renders, and is wrong about a device.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAFT_PROPERTY, draftFromCsv, isDraft, parseCsv } from './index.js';

const OPTS = { sourceName: 'supplier.csv', timestamp: '2026-09-23T10:00:00Z' };

function components(csv: string): Array<Record<string, unknown>> {
  return draftFromCsv(csv, OPTS).document['components'] as Array<Record<string, unknown>>;
}

test('a quoted comma stays inside its field', () => {
  const [c] = components('name,license\nOpenSSL,"Apache-2.0, OpenSSL"\n');
  assert.equal(c?.['name'], 'OpenSSL');
  assert.deepEqual(c?.['licenses'], [{ license: { name: 'Apache-2.0, OpenSSL' } }]);
});

test('a quoted comma in the component name does not split the row', () => {
  const [c] = components('name,version\n"libcurl, bundled",7.68.0\n');
  assert.equal(c?.['name'], 'libcurl, bundled');
  assert.equal(c?.['version'], '7.68.0');
});

test('a newline inside a quoted field does not end the row', () => {
  const t = parseCsv('name,notes\nFreeRTOS,"line one\nline two"\n');
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0]?.[1], 'line one\nline two');
});

test('the doubled quote escape is understood', () => {
  const t = parseCsv('name\n"a ""quoted"" name"\n');
  assert.equal(t.rows[0]?.[0], 'a "quoted" name');
});

test('CRLF and a missing final newline both work', () => {
  const crlf = parseCsv('name,version\r\nOpenSSL,1.1.1k\r\n');
  assert.deepEqual(crlf.rows, [['OpenSSL', '1.1.1k']]);
  const noTrailing = parseCsv('name,version\nOpenSSL,1.1.1k');
  assert.deepEqual(noTrailing.rows, [['OpenSSL', '1.1.1k']]);
});

test("Excel's byte order mark does not become part of the first header", () => {
  // Without this, the first column is called "﻿name" and matches nothing,
  // so a sheet from Excel silently produces zero components.
  const t = parseCsv('﻿name,version\nOpenSSL,1.1.1k\n');
  assert.equal(t.header[0], 'name');
  assert.equal(components('﻿name,version\nOpenSSL,1.1.1k\n').length, 1);
});

test('THE ONE THAT MATTERS: no identifier is invented', () => {
  // A purl guessed from a name and a version is a confident wrong answer, and
  // a wrong identifier produces a wrong vulnerability verdict. packages/resolve
  // exists to abstain from exactly this.
  const cs = components('name,version,supplier\nOpenSSL,1.1.1k,The OpenSSL Project\n');
  assert.equal(cs[0]?.['purl'], undefined);
  // But a purl the supplier DID give is kept.
  const given = components('name,purl\nlodash,pkg:npm/lodash@4.17.21\n');
  assert.equal(given[0]?.['purl'], 'pkg:npm/lodash@4.17.21');
});

test('a missing version is absent, not guessed at', () => {
  const [c] = components('name,version\nmbed TLS,\n');
  assert.equal(c?.['name'], 'mbed TLS');
  assert.ok(!('version' in (c ?? {})));
});

test('a licence is recorded as a name, not asserted to be an SPDX id', () => {
  // `{license: {id: ...}}` claims the string is a valid SPDX identifier. Nobody
  // validated it, and a supplier writing "BSD" or "commercial" is common.
  const [c] = components('name,license\nfoo,commercial\n');
  assert.deepEqual(c?.['licenses'], [{ license: { name: 'commercial' } }]);
});

test('columns that were not understood are reported, not silently dropped', () => {
  const r = draftFromCsv('name,Part Number,Notes\nfoo,PN-1,hello\n', OPTS);
  assert.deepEqual(r.unmappedColumns.sort(), ['Notes', 'Part Number']);
});

test('a row with no component name is skipped with a reason', () => {
  const r = draftFromCsv('name,supplier\n,Nobody\nfoo,Somebody\n', OPTS);
  assert.equal(r.componentCount, 1);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0]?.why ?? '', /no component name/);
  assert.equal(r.skipped[0]?.line, 2);
});

test('a sheet with no name column produces nothing, and says why', () => {
  const r = draftFromCsv('Part Number,Notes\nPN-1,hello\n', OPTS);
  assert.equal(r.componentCount, 0);
  assert.match(r.skipped[0]?.why ?? '', /no component-name column/);
  // Still a draft, so it still cannot be bundled.
  assert.equal(isDraft(r.document), true);
});

test('a ragged row is reported rather than padded or dropped', () => {
  const r = draftFromCsv('name,version,supplier\nfoo,1.0\nbar,2.0,Acme\n', OPTS);
  assert.equal(r.ragged.length, 1);
  assert.equal(r.ragged[0]?.line, 2);
  // And it still produced its component, because the name was readable.
  assert.equal(r.componentCount, 2);
});

test('the draft marker is in the document, not only in the console', () => {
  // A draft gets emailed, renamed and handed to another command. The console
  // output does not travel with it; the property does.
  const r = draftFromCsv('name\nfoo\n', OPTS);
  assert.equal(isDraft(r.document), true);
  const props = (r.document['metadata'] as { properties: Array<{ name: string; value: string }> })
    .properties;
  assert.ok(props.some((p) => p.name === DRAFT_PROPERTY && p.value === 'true'));
  assert.ok(props.some((p) => p.name === 'stratifypro:draft-source' && p.value === 'supplier.csv'));
  assert.ok(props.some((p) => /not evidence/i.test(p.value)));
});

test('isDraft does not fire on an ordinary document', () => {
  assert.equal(isDraft({ bomFormat: 'CycloneDX', components: [] }), false);
  assert.equal(isDraft({ metadata: { properties: [{ name: 'other', value: 'true' }] } }), false);
  assert.equal(isDraft(null), false);
  assert.equal(isDraft('nonsense'), false);
});

test('the same sheet produces the same draft', () => {
  const csv = 'name,version\nfoo,1.0\n';
  assert.equal(
    JSON.stringify(draftFromCsv(csv, OPTS).document),
    JSON.stringify(draftFromCsv(csv, OPTS).document),
  );
});
