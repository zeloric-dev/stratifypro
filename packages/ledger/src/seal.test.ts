/**
 * The seal, checked against something that is not itself.
 *
 * THE OBVIOUS TEST IS NEARLY WORTHLESS. Signing with this module and verifying
 * with this module passes if both halves share a mistake, and the mistakes
 * available here are exactly the shared kind: signing the wrong bytes, using a
 * hash the ecosystem does not expect, emitting a signature in a container
 * nothing else reads. All three produce a perfectly self-consistent seal that
 * `cosign verify-blob` would reject, and SPEC.md 2.5's acceptance is that
 * cosign accepts it.
 *
 * So the load-bearing test here shells out to OpenSSL, which knows nothing
 * about this repository, and asks it to verify the same signature against the
 * same public key. OpenSSL and cosign implement the same primitive: ECDSA on
 * P-256 over SHA-256, ASN.1 DER. If OpenSSL accepts the DER that this module
 * base64-decodes to, the format is right.
 *
 * WHAT THAT STILL DOES NOT PROVE, stated rather than glossed: cosign itself has
 * not been run here, because it is not installed and it is a 189 MB binary.
 * `scripts/check-seal-interop.py` runs it when it IS present and says so when
 * it is not, so the gap closes on any machine that has it without anyone
 * having to remember.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  buildBundle,
  fingerprintOf,
  generateSealingKey,
  publicKeyFrom,
  SEAL_ALGORITHM,
  SEAL_FILENAME,
  sealBundle,
  sealManifest,
  verifySeal,
  verifySealedBundle,
} from './index.js';

const INPUT = {
  checkId: 'check-0001',
  timestamp: '2026-09-23T10:00:00Z',
  fileSha256: 'a'.repeat(64),
  fileName: 'device.cdx.json',
  engineVersion: '1.0.0',
  packId: 'fda-524b',
  packVersion: '1.0.0',
  reportHtml: '<!doctype html><title>r</title>',
  result: { findings: [], counts: { error: 0, warning: 0, info: 0 } },
  attestation: 'Scope of attestation.',
};

/** Is openssl on this machine, and does it speak the subcommands used here? */
function opensslAvailable(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

test('a seal verifies against the manifest it covers', () => {
  const key = generateSealingKey();
  const seal = sealManifest('the manifest bytes\n', key.privateKeyPem);
  assert.equal(seal.algorithm, SEAL_ALGORITHM);
  assert.equal(seal.publicKeyFingerprint, key.fingerprint);
  assert.equal(verifySeal('the manifest bytes\n', seal.signature, key.publicKeyPem).ok, true);
});

test('one changed byte breaks the seal', () => {
  const key = generateSealingKey();
  const seal = sealManifest('the manifest bytes\n', key.privateKeyPem);
  const v = verifySeal('the manifest bytes \n', seal.signature, key.publicKeyPem);
  assert.equal(v.ok, false);
  assert.match(v.why, /has changed|different key/);
});

test('a seal made by another key does not verify', () => {
  // The attack a fingerprint exists to stop: a valid seal, by the wrong hand.
  const mine = generateSealingKey();
  const theirs = generateSealingKey();
  const seal = sealManifest('m\n', theirs.privateKeyPem);
  assert.equal(verifySeal('m\n', seal.signature, mine.publicKeyPem).ok, false);
  // And it verifies perfectly against the key that made it, which is the point
  // README.txt makes about checking the fingerprint.
  assert.equal(verifySeal('m\n', seal.signature, theirs.publicKeyPem).ok, true);
  assert.notEqual(mine.fingerprint, theirs.fingerprint);
});

test('a truncated seal says so rather than reporting tampering', () => {
  const key = generateSealingKey();
  const seal = sealManifest('m\n', key.privateKeyPem);
  const v = verifySeal('m\n', seal.signature.slice(0, 6), key.publicKeyPem);
  assert.equal(v.ok, false);
  assert.match(v.why, /truncated|DER/);
});

test('a public key of the wrong type is refused by name', () => {
  // An RSA key verifies nothing here, and "does not verify" would send someone
  // looking for a changed file rather than a wrong key.
  const v = verifySeal('m\n', 'MEQCIB', 'not a pem at all');
  assert.equal(v.ok, false);
  assert.match(v.why, /could not be read/);
});

test('the public key derives from the private one', () => {
  const key = generateSealingKey();
  assert.equal(publicKeyFrom(key.privateKeyPem).trim(), key.publicKeyPem.trim());
  assert.equal(fingerprintOf(key.publicKeyPem), key.fingerprint);
});

test('THE INTEROP TEST: openssl verifies what this module signs', (t) => {
  if (!opensslAvailable()) {
    t.skip('openssl is not on this machine');
    return;
  }
  const key = generateSealingKey();
  const manifest = '{\n  "schema": 1\n}\n';
  const seal = sealManifest(manifest, key.privateKeyPem);

  const dir = mkdtempSync(join(tmpdir(), 'seal-interop-'));
  try {
    writeFileSync(join(dir, 'manifest.json'), manifest, 'utf8');
    writeFileSync(join(dir, 'cosign.pub'), key.publicKeyPem, 'utf8');
    // The signature on disk is base64, which is what cosign wants. OpenSSL
    // wants the raw DER, so it is decoded here exactly as README.txt tells a
    // reader to decode it.
    writeFileSync(join(dir, 'manifest.sig.der'), Buffer.from(seal.signature, 'base64'));

    const out = execFileSync(
      'openssl',
      [
        'dgst', '-sha256', '-verify', join(dir, 'cosign.pub'),
        '-signature', join(dir, 'manifest.sig.der'),
        join(dir, 'manifest.json'),
      ],
      { stdio: 'pipe' },
    ).toString();
    assert.match(out, /Verified OK/i, 'openssl did not accept the signature');

    // And it must REJECT a manifest that changed, or the test above would pass
    // on an openssl that accepts anything.
    writeFileSync(join(dir, 'manifest.json'), `${manifest} `, 'utf8');
    let rejected = false;
    try {
      execFileSync(
        'openssl',
        [
          'dgst', '-sha256', '-verify', join(dir, 'cosign.pub'),
          '-signature', join(dir, 'manifest.sig.der'),
          join(dir, 'manifest.json'),
        ],
        { stdio: 'pipe' },
      );
    } catch {
      rejected = true;
    }
    assert.ok(rejected, 'openssl accepted a manifest that had changed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the public key is a PEM SPKI block, which is what a cosign.pub file is', () => {
  const key = generateSealingKey();
  assert.match(key.publicKeyPem, /^-----BEGIN PUBLIC KEY-----\r?\n/);
  assert.match(key.publicKeyPem, /-----END PUBLIC KEY-----\r?\n?$/);
  // Base64 of a DER SEQUENCE. A P-256 SPKI key is 91 bytes.
  const der = Buffer.from(
    key.publicKeyPem.replace(/-----[^-]+-----|\s/g, ''),
    'base64',
  );
  assert.equal(der[0], 0x30);
  assert.equal(der.length, 91);
});

// ---- the bundle, sealed ------------------------------------------------

test('a sealed bundle verifies as a whole', () => {
  const key = generateSealingKey();
  const bundle = buildBundle({ ...INPUT, sealPublicKeyFingerprint: key.fingerprint });
  const sealFile = sealBundle(bundle, key.privateKeyPem);
  const files = [...bundle.files, sealFile];

  const v = verifySealedBundle(files, key.publicKeyPem, bundle.digest);
  assert.equal(v.integrity.ok, true);
  assert.equal(v.seal?.ok, true);
  assert.equal(v.ok, true);
});

test('altering any covered file breaks the sealed verification', () => {
  const key = generateSealingKey();
  const bundle = buildBundle({ ...INPUT, sealPublicKeyFingerprint: key.fingerprint });
  const sealFile = sealBundle(bundle, key.privateKeyPem);
  const files = [...bundle.files, sealFile].map((f) =>
    f.name === 'result.json' ? { ...f, content: `${f.content} ` } : f,
  );
  const v = verifySealedBundle(files, key.publicKeyPem, bundle.digest);
  assert.equal(v.integrity.ok, false);
  assert.equal(v.ok, false);
});

test('rewriting the manifest to match a changed file still breaks the seal', () => {
  // This is the attack the seal exists for, and the one the hash chain alone
  // cannot stop. Change a file, then recompute the manifest so the hashes
  // agree again: integrity passes, and only the seal notices.
  const key = generateSealingKey();
  const tampered = buildBundle({
    ...INPUT,
    result: { findings: [], counts: { error: 0, warning: 0, info: 0 }, note: 'added later' },
    sealPublicKeyFingerprint: key.fingerprint,
  });
  const original = buildBundle({ ...INPUT, sealPublicKeyFingerprint: key.fingerprint });
  const originalSeal = sealBundle(original, key.privateKeyPem);

  // A wholly self-consistent bundle, carrying the seal from the real one.
  const files = [...tampered.files, originalSeal];
  const v = verifySealedBundle(files, key.publicKeyPem, tampered.digest);
  assert.equal(v.integrity.ok, true, 'the hash chain should still be internally consistent');
  assert.equal(v.seal?.ok, false, 'the seal should not cover a rewritten manifest');
  assert.equal(v.ok, false);
});

test('an unsealed bundle is never reported as verified', () => {
  const bundle = buildBundle(INPUT);
  const v = verifySealedBundle(bundle.files, undefined, bundle.digest);
  assert.equal(v.integrity.ok, true);
  assert.equal(v.ok, false, 'an unsealed bundle came back as verified');
  assert.match(v.seal?.why ?? '', /no seal file/);
});

test('a seal with no key to check it against is not a pass', () => {
  const key = generateSealingKey();
  const bundle = buildBundle({ ...INPUT, sealPublicKeyFingerprint: key.fingerprint });
  const files = [...bundle.files, sealBundle(bundle, key.privateKeyPem)];
  const v = verifySealedBundle(files, undefined, bundle.digest);
  assert.equal(v.ok, false);
  assert.match(v.seal?.why ?? '', /no public key/);
});

test('the bundle stays byte-identical across runs; the seal does not', () => {
  // Both halves of the determinism claim, in one place, because the honest
  // version of it is conditional. ECDSA draws a random nonce, so two seals of
  // the same manifest differ and both verify. A caller comparing two bundle
  // directories must exclude the seal file, and this is where that is written
  // down.
  const key = generateSealingKey();
  const a = buildBundle({ ...INPUT, sealPublicKeyFingerprint: key.fingerprint });
  const b = buildBundle({ ...INPUT, sealPublicKeyFingerprint: key.fingerprint });
  assert.deepEqual(
    a.files.map((f) => [f.name, f.sha256]),
    b.files.map((f) => [f.name, f.sha256]),
  );

  const s1 = sealBundle(a, key.privateKeyPem);
  const s2 = sealBundle(b, key.privateKeyPem);
  assert.notEqual(s1.content, s2.content, 'two ECDSA seals were identical, which should not happen');
  const m = a.files.find((f) => f.name === 'manifest.json')!;
  assert.equal(verifySeal(m.content, s1.content, key.publicKeyPem).ok, true);
  assert.equal(verifySeal(m.content, s2.content, key.publicKeyPem).ok, true);
});

test('the README tells the reader which key to fetch, and says when there is none', () => {
  const key = generateSealingKey();
  const sealed = buildBundle({ ...INPUT, sealPublicKeyFingerprint: key.fingerprint });
  const readme = sealed.files.find((f) => f.name === 'README.txt')!.content;
  assert.ok(readme.includes(key.fingerprint), 'the README does not name the signing key');
  assert.ok(readme.includes('cosign verify-blob'));
  assert.ok(readme.includes(SEAL_FILENAME));

  const plain = buildBundle(INPUT).files.find((f) => f.name === 'README.txt')!.content;
  assert.ok(plain.includes('NOT SEALED'), 'an unsealed bundle does not say so');
  assert.ok(!plain.includes(key.fingerprint));
});

test('the seal file is not listed in the manifest, and cannot be', () => {
  // The manifest is what the seal covers, so the manifest cannot also contain
  // the seal's hash. A reader who expects every file to appear in `files`
  // should find the reason stated rather than assume an omission.
  const key = generateSealingKey();
  const bundle = buildBundle({ ...INPUT, sealPublicKeyFingerprint: key.fingerprint });
  const manifest = JSON.parse(bundle.files.find((f) => f.name === 'manifest.json')!.content);
  assert.ok(!(SEAL_FILENAME in manifest.files));
  assert.ok(!('README.txt' in manifest.files));
});
