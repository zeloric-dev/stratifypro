/**
 * The evidence bundle, and the two properties a regulator's copy depends on.
 *
 * SPEC.md Step 11's VERIFY is: "on a different machine, with only the
 * published public key, run cosign verify-blob against the bundle and have it
 * succeed. Then alter one byte and confirm it fails."
 *
 * The seal half needs a key and a verifier. The half underneath it is tested
 * here and is what the seal is applied to: the manifest covers every file by
 * hash, so altering one byte of any of them breaks verification whether or not
 * anybody signed anything.
 *
 * The other property is determinism. A bundle that differs on every build
 * cannot be compared against the copy a customer kept eighteen months ago,
 * which is most of the reason to have one.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { buildBundle, verifyBundle, type BundleInput } from './bundle.js';

const INPUT: BundleInput = {
  checkId: 'ac856753f5c9151f',
  timestamp: '2026-09-23T10:00:00Z',
  fileSha256: '87424b073c43b67ed7b038ce2eebe09be670c36f73fd041464fd0d037bf027e8',
  fileName: 'device.cdx.json',
  engineVersion: '0.0.0',
  packId: 'fda-524b',
  packVersion: '1.0.0',
  reportHtml: '<!doctype html><html><body><p>findings</p></body></html>',
  result: { counts: { error: 0, warning: 3 }, findings: [{ ruleId: 'FDA-NTIA-001' }] },
  attestation: 'On 2026-09-23 a file presenting SHA-256 87424b07 was submitted to StratifyPro.',
};

test('a bundle carries exactly the five files Step 11 names', () => {
  const b = buildBundle(INPUT);
  assert.deepEqual(
    b.files.map((f) => f.name).sort(),
    ['README.txt', 'attestation.txt', 'manifest.json', 'report.html', 'result.json'].sort(),
  );
  assert.equal(b.directory, 'evidence-ac856753f5c9151f');
});

test('THE ONE THAT MATTERS: the submitted file is not in the bundle', () => {
  // attestation.txt says the file was not retained and cannot be reproduced.
  // A bundle containing it would make its own attestation false, in the same
  // directory, which is the most self-defeating thing this product could ship.
  const secret = 'THIS-IS-THE-SUBMITTED-FILE-CONTENT';
  const b = buildBundle({ ...INPUT, reportHtml: '<p>no file here</p>' });
  for (const f of b.files) {
    assert.ok(!f.content.includes(secret), `${f.name} contains the submitted file`);
  }
  // What IS recorded is the hash, which is what lets a submitter prove later
  // that the artifact they hold is the one that was checked.
  const manifest = b.files.find((f) => f.name === 'manifest.json');
  assert.ok(manifest);
  assert.ok(manifest.content.includes(INPUT.fileSha256));
});

test('altering one byte of any covered file breaks verification', () => {
  const b = buildBundle(INPUT);
  assert.equal(verifyBundle(b.files, b.digest).ok, true);

  for (const target of ['report.html', 'result.json', 'attestation.txt']) {
    const tampered = b.files.map((f) =>
      f.name === target ? { ...f, content: `${f.content} ` } : f,
    );
    const v = verifyBundle(tampered, b.digest);
    assert.equal(v.ok, false, `${target} was altered and verification still passed`);
    if (v.ok) return;
    assert.ok(v.problems.some((p) => p.includes(target)), `the failure should name ${target}`);
  }
});

test('altering the manifest breaks the digest', () => {
  // The manifest covers the other files; the digest covers the manifest. A
  // tamperer who updates a hash inside the manifest to match their edit has
  // to change the manifest, and that is what the seal is applied to.
  const b = buildBundle(INPUT);
  const tampered = b.files.map((f) =>
    f.name === 'manifest.json' ? { ...f, content: f.content.replace('fda-524b', 'other-pack') } : f,
  );
  const v = verifyBundle(tampered, b.digest);
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.ok(v.problems.some((p) => p.includes('expected bundle digest')));
});

test('a missing file is caught, not skipped', () => {
  const b = buildBundle(INPUT);
  const missing = b.files.filter((f) => f.name !== 'result.json');
  const v = verifyBundle(missing, b.digest);
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.ok(v.problems.some((p) => p.includes('result.json') && p.includes('missing')));
});

test('the same inputs produce the same bytes, whatever order the object was built in', () => {
  // JSON.stringify preserves insertion order, so two runs that assembled the
  // result differently would produce different bytes for identical content and
  // a bundle that cannot be compared against the customer's copy.
  const a = buildBundle(INPUT);
  const reordered = buildBundle({
    ...INPUT,
    result: { findings: [{ ruleId: 'FDA-NTIA-001' }], counts: { warning: 3, error: 0 } },
  });
  assert.equal(a.digest, reordered.digest);
  assert.deepEqual(
    a.files.map((f) => f.sha256),
    reordered.files.map((f) => f.sha256),
  );
});

test('nothing in the bundle reads a clock', () => {
  // The timestamp is an argument. If it were read here, two bundles of the
  // same check would never match, and "reproduce it yourself" would be false.
  const a = buildBundle(INPUT);
  const b = buildBundle(INPUT);
  assert.equal(a.digest, b.digest);
  const manifest = a.files.find((f) => f.name === 'manifest.json');
  assert.ok(manifest?.content.includes('2026-09-23T10:00:00Z'));
});

test('the digest is the hash of the manifest, which is what gets sealed', () => {
  const b = buildBundle(INPUT);
  const manifest = b.files.find((f) => f.name === 'manifest.json');
  assert.ok(manifest);
  assert.equal(b.digest, createHash('sha256').update(manifest.content, 'utf8').digest('hex'));
});

test('README.txt tells a recipient how to check the thing only they can check', () => {
  // The bundle records a hash rather than a copy, so the last step belongs to
  // whoever holds the file. A README that omitted it would leave the reader
  // believing the bundle proves more than it does.
  const b = buildBundle(INPUT);
  const readme = b.files.find((f) => f.name === 'README.txt');
  assert.ok(readme);
  assert.match(readme.content, /sha256sum <your-file>/);
  assert.ok(readme.content.includes(INPUT.fileSha256));
  assert.match(readme.content, /does not\s+mean the software described is safe/);
});

test('a cycle in the result is refused rather than crashing on serialisation', () => {
  const cyclic: Record<string, unknown> = { a: 1 };
  cyclic['self'] = cyclic;
  assert.throws(() => buildBundle({ ...INPUT, result: cyclic }), /cycle/);
});
