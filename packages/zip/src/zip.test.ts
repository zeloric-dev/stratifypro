/**
 * The zip reader, tested on the case that fails silently.
 *
 * OSV's npm export holds 229,185 entries. The classic end-of-central-directory
 * record stores the entry count in sixteen bits, so a reader that trusts it
 * stops at 65,535 WITHOUT ERROR: it returns entries, they all parse, the
 * mirror builds, every test goes green, and two thirds of npm's advisories are
 * missing. Components then come back clear because nothing was there to match
 * them. That is the exact failure this project keeps meeting, so the Zip64
 * path is tested with a real Zip64 archive rather than asserted in a comment.
 *
 * The archives here are written by the helper below rather than committed,
 * because a 70,000-entry fixture is not something to put in git and a
 * hand-trimmed small one would not have the property under test.
 */
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { readZip } from './index.js';

interface Written {
  name: string;
  body: Buffer;
  method: 0 | 8;
}

/**
 * Write a zip. `forceZip64` writes the Zip64 records even for a small archive,
 * and `declaredCount` lies about the entry count so the cross-check can be
 * tested.
 */
function writeZip(
  files: Written[],
  opts: { forceZip64?: boolean; declaredCount?: number } = {},
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = f.method === 8 ? deflateRawSync(f.body) : f.body;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(f.method, 8);
    local.writeUInt32LE(0, 14); // crc, which this reader does not check
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(f.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(f.method, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(f.body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const body = Buffer.concat(locals);
  const dir = Buffer.concat(centrals);
  const count = opts.declaredCount ?? files.length;
  const zip64 = opts.forceZip64 || count > 0xffff;
  const parts = [body, dir];

  if (zip64) {
    const rec = Buffer.alloc(56);
    rec.writeUInt32LE(0x06064b50, 0);
    rec.writeBigUInt64LE(BigInt(44), 4);
    rec.writeBigUInt64LE(BigInt(count), 24);
    rec.writeBigUInt64LE(BigInt(count), 32);
    rec.writeBigUInt64LE(BigInt(dir.length), 40);
    rec.writeBigUInt64LE(BigInt(body.length), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    loc.writeBigUInt64LE(BigInt(body.length + dir.length), 8);
    loc.writeUInt32LE(1, 16);
    parts.push(rec, loc);
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  // The sentinel: past 65,535 the real count only exists in the Zip64 record.
  eocd.writeUInt16LE(zip64 ? 0xffff : count, 8);
  eocd.writeUInt16LE(zip64 ? 0xffff : count, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(zip64 ? 0xffffffff : body.length, 16);
  parts.push(eocd);

  return Buffer.concat(parts);
}

const one = (name: string, text: string, method: 0 | 8 = 8): Written => ({
  name,
  body: Buffer.from(text, 'utf8'),
  method,
});

test('a plain archive round-trips, deflated and stored alike', () => {
  const zip = writeZip([one('a.json', '{"id":"A"}'), one('b.json', '{"id":"B"}', 0)]);
  const entries = readZip(zip);
  assert.deepEqual(
    entries.map((e) => e.name),
    ['a.json', 'b.json'],
  );
  assert.equal(entries[0]?.read().toString('utf8'), '{"id":"A"}');
  assert.equal(entries[1]?.read().toString('utf8'), '{"id":"B"}');
});

test('THE ONE THAT MATTERS: more than 65,535 entries are all returned', () => {
  // 70,000 entries, which cannot be counted in sixteen bits. A reader that
  // stops at the classic record returns 65,535 of them and reports success.
  const n = 70000;
  const files: Written[] = [];
  for (let i = 0; i < n; i += 1) files.push(one(`adv-${i}.json`, `{"id":"GHSA-${i}"}`, 0));
  const entries = readZip(writeZip(files));
  assert.equal(entries.length, n, 'the Zip64 entry count was not honoured');
  assert.equal(entries[0]?.name, 'adv-0.json');
  assert.equal(entries[n - 1]?.name, `adv-${n - 1}.json`);
  assert.equal(entries[n - 1]?.read().toString('utf8'), `{"id":"GHSA-${n - 1}"}`);
});

test('the Zip64 records are used even when the archive is small enough not to need them', () => {
  const zip = writeZip([one('a.json', '{}'), one('b.json', '{}')], { forceZip64: true });
  assert.equal(readZip(zip).length, 2);
});

test('a declared count that does not match the walk is refused, not trusted', () => {
  // A truncated or rewritten central directory would otherwise produce a
  // short mirror, and a short mirror reports components as clean.
  const zip = writeZip([one('a.json', '{}'), one('b.json', '{}')], { declaredCount: 5 });
  assert.throws(() => readZip(zip), /declares 5 entries but the central directory walk found 2/);
  assert.throws(() => readZip(zip), /Refusing a partial read/);
});

test('directory entries count toward the declared total without becoming files', () => {
  // They are entries as far as the central directory is concerned but they are
  // not files. Dropping them silently would make the count cross-check fire on
  // a perfectly good archive; counting them as files would put a directory in
  // the mirror.
  const zip = writeZip([one('a.json', '{}'), { name: 'sub/', body: Buffer.alloc(0), method: 0 }]);
  const entries = readZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ['a.json']);
});

test('a file that is not a zip is refused', () => {
  assert.throws(() => readZip(Buffer.from('not a zip at all')), /no end-of-central-directory/);
});

test('a Zip64 sentinel with no Zip64 record is refused rather than read short', () => {
  const zip = writeZip([one('a.json', '{}')]);
  // Set the sentinel without adding the records behind it.
  zip.writeUInt16LE(0xffff, zip.length - 22 + 8);
  zip.writeUInt16LE(0xffff, zip.length - 22 + 10);
  assert.throws(() => readZip(zip), /carries no Zip64 locator/);
});

test('an unsupported compression method throws on read rather than returning garbage', () => {
  const zip = writeZip([one('a.json', '{}')]);
  // Method 12 (bzip2) in both the local and central headers.
  const dirStart = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt16LE(12, dirStart + 10);
  const entries = readZip(zip);
  assert.throws(() => entries[0]?.read(), /compression method 12 is not supported/);
});
