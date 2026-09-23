/**
 * `bundle`, exercised the way a firm reaches it.
 *
 * The unit tests in packages/ledger prove the bundle assembles and detects
 * tampering. They do not prove a person can produce one, and this session has
 * three separate records of a capability finished everywhere except where
 * somebody could invoke it.
 *
 * This is also where SPEC.md 2.7 stops being partial. The attestation text has
 * existed for several commits, pinned to the specification character for
 * character and guarded by a check, and has been stated to nobody. A bundle is
 * where SPEC.md puts it, so the test that matters most here is the one
 * asserting the attestation actually lands in a file on disk.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const HERE = import.meta.dirname;
const CLI = resolve(HERE, 'index.js');
const ROOT = resolve(HERE, '..', '..', '..');
const DOC = join(ROOT, 'fixtures', 'corpus', 'cyclonedx__ascii-boxes-sbom-cdx.json');
const TS = '2026-09-23T10:00:00Z';

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function bundleInto(dir: string, extra: string[] = []): string {
  const r = run(['bundle', DOC, '--out', dir, '--timestamp', TS, ...extra]);
  assert.equal(r.status, 0, `bundle failed: ${r.stderr}`);
  const made = readdirSync(dir).filter((d) => d.startsWith('evidence-'));
  assert.equal(made.length, 1, 'expected exactly one bundle directory');
  return join(dir, made[0] as string);
}

test('a bundle is written, with the five files and nothing else', () => {
  const dir = bundleInto(mkdtempSync(join(tmpdir(), 'bundle-')));
  assert.deepEqual(
    readdirSync(dir).sort(),
    ['README.txt', 'attestation.txt', 'manifest.json', 'report.html', 'result.json'].sort(),
  );
});

test('SPEC 2.7 stops being partial: the attestation is stated in a file', () => {
  const dir = bundleInto(mkdtempSync(join(tmpdir(), 'bundle-')));
  const text = readFileSync(join(dir, 'attestation.txt'), 'utf8');

  // The two load-bearing denials, whose exact wording scripts/check-attestation.py
  // holds against SPEC.md. What matters here is that they reached a user.
  assert.match(text, /did not retain the submitted file and cannot reproduce its contents/);
  assert.match(text, /not an electronic signature within the meaning of 21 CFR 11\.3\(b\)\(7\)/);
  assert.match(text, /was submitted to StratifyPro engine version/);
  // And the placeholders are substituted, not shipped.
  assert.ok(!text.includes('<date>'));
  assert.ok(!text.includes('<hash>'));
});

test('the recorded hash is the real hash of the file that was checked', () => {
  const dir = bundleInto(mkdtempSync(join(tmpdir(), 'bundle-')));
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
    submitted: { sha256: string };
  };
  const actual = createHash('sha256').update(readFileSync(DOC)).digest('hex');
  assert.equal(manifest.submitted.sha256, actual, 'the manifest records a hash nobody can reproduce');
});

test('the bundle does not contain the file it checked', () => {
  const dir = bundleInto(mkdtempSync(join(tmpdir(), 'bundle-')));
  const source = readFileSync(DOC, 'utf8');
  // A distinctive run of the real document, long enough that an accidental
  // match is not plausible.
  const fingerprint = source.slice(200, 320);
  assert.ok(fingerprint.length > 50, 'the fixture changed; pick a new fingerprint');
  for (const name of readdirSync(dir)) {
    const content = readFileSync(join(dir, name), 'utf8');
    assert.ok(!content.includes(fingerprint), `${name} contains the submitted file`);
  }
});

test('two runs of the same check produce byte-identical bundles', () => {
  // The customer keeps a copy. Eighteen months later they compare it against
  // one we produce. If those differ for reasons that are not the findings,
  // "reproduce it yourself" was never true.
  const a = bundleInto(mkdtempSync(join(tmpdir(), 'bundle-')));
  const b = bundleInto(mkdtempSync(join(tmpdir(), 'bundle-')));
  for (const name of readdirSync(a)) {
    const ca = readFileSync(join(a, name), 'utf8');
    const cb = readFileSync(join(b, name), 'utf8');
    // report.html names the input path, which differs between temp dirs only
    // if the caller passed a different path. It did not.
    assert.equal(ca, cb, `${name} differs between two identical runs`);
  }
});

test('altering one byte after the fact is detectable from the manifest alone', () => {
  // SPEC.md Step 11's VERIFY, minus the seal: "alter one byte and confirm it
  // fails". A recipient with only sha256sum can do this.
  const dir = bundleInto(mkdtempSync(join(tmpdir(), 'bundle-')));
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
    files: Record<string, string>;
  };

  const before = createHash('sha256').update(readFileSync(join(dir, 'report.html'), 'utf8'), 'utf8').digest('hex');
  assert.equal(before, manifest.files['report.html']);

  writeFileSync(join(dir, 'report.html'), `${readFileSync(join(dir, 'report.html'), 'utf8')} `);
  const after = createHash('sha256').update(readFileSync(join(dir, 'report.html'), 'utf8'), 'utf8').digest('hex');
  assert.notEqual(after, manifest.files['report.html'], 'a changed file still matches its recorded hash');
});

test('the output says plainly that an unsealed bundle proves no authorship', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  const r = run(['bundle', DOC, '--out', dir, '--timestamp', TS]);
  assert.match(r.stdout, /NOT SEALED/);
  assert.match(r.stdout, /Nothing here proves who produced the bundle/);
  assert.match(r.stdout, /bundle digest: [0-9a-f]{64}/);
});

test('a missing file is a usage error', () => {
  const r = run(['bundle']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: bundle/);
});

test('the command appears in help, once', () => {
  const r = run(['help']);
  assert.equal(r.stdout.split('\n').filter((l) => l.includes('bundle <file>')).length, 1);
});
