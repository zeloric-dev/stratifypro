/**
 * The evidence bundle. SPEC.md Step 11.
 *
 * What a firm hands to a regulator, or keeps so it can answer a question about
 * a submission eighteen months later. Five files:
 *
 *     report.html        the rendered report
 *     result.json        the CheckResult verbatim
 *     manifest.json      engine version, pack id and version, file sha256, timestamp
 *     attestation.txt    the scope of attestation, verbatim
 *     README.txt         how to verify this bundle yourself
 *
 * THE SUBMITTED FILE IS NOT IN IT, and that is the whole design rather than an
 * omission. `attestation.txt` says StratifyPro did not retain the submitted
 * file and cannot reproduce its contents. A bundle that shipped the file would
 * make its own attestation false in the same directory. What is recorded is
 * the SHA-256 the submitter's file presented, which is what lets them prove
 * later that the artifact they hold is the one that was checked.
 *
 * DETERMINISTIC. The same inputs produce the same bytes. Nothing here reads a
 * clock, generates a uuid or sorts by insertion order: the timestamp is an
 * argument, and every object is serialised with sorted keys. An evidence
 * artifact that differs on every build cannot be compared to the copy a
 * customer kept, which is most of the point of having one.
 *
 * WHAT SEALS IT. The bundle digest covers the manifest, and the manifest
 * covers every other file by hash, so altering one byte of any file breaks
 * verification. SPEC.md asks for a Sigstore integrity seal over that digest,
 * and is emphatic about what such a seal must never be called.
 *
 * That reasoning, and the regulation behind it, lives in exactly one place:
 * `packages/report/src/attestation.ts`. It is not restated here, both because
 * two copies of an argument drift and because the words needed to restate it
 * are on the banned list in `docs/banned-phrases.txt` for good reasons. That
 * file is the single exemption, guarded by `scripts/check-attestation.py`
 * against the specification itself.
 */
import { createHash } from 'node:crypto';
import { SEAL_FILENAME, sealManifest, verifySeal, type SealVerdict } from './seal.js';

export interface BundleInput {
  /** A stable identifier for this check. Supplied, never generated here. */
  checkId: string;
  /** ISO 8601. An argument, because a bundle that reads the clock is not reproducible. */
  timestamp: string;
  /** SHA-256 the submitted file presented, as lowercase hex. */
  fileSha256: string;
  /** The name as the submitter gave it, recorded but never trusted. */
  fileName: string;
  engineVersion: string;
  packId: string;
  packVersion: string;
  /** The rendered report, as produced by @stratifypro/report. */
  reportHtml: string;
  /** The CheckResult, exactly as the engine returned it. */
  result: unknown;
  /** The attestation text, from @stratifypro/report. Passed in, never rebuilt here. */
  attestation: string;
  /**
   * Fingerprint of the key this bundle is about to be sealed with, when there
   * is one.
   *
   * It is an INPUT rather than something sealing writes back, because README.txt
   * has to name the key a reader should fetch, and the README is built here.
   * Passing it in keeps `buildBundle` pure: the same inputs still produce the
   * same bytes, and a bundle that will be sealed differs from one that will not
   * only in the instructions it carries, which is exactly the difference a
   * reader needs to see.
   */
  sealPublicKeyFingerprint?: string;
}

export interface BundleFile {
  name: string;
  content: string;
  sha256: string;
}

export interface Bundle {
  checkId: string;
  files: BundleFile[];
  /** The digest a seal is applied to. Covers the manifest, which covers the rest. */
  digest: string;
  /** The directory name a caller should write these into. */
  directory: string;
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * JSON with sorted keys and a trailing newline, every time.
 *
 * `JSON.stringify` preserves insertion order, so two runs that built an object
 * in a different order produce different bytes and therefore a different
 * digest, for identical content. That would make a bundle unverifiable against
 * a copy built a minute earlier.
 */
function stableJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) throw new Error('cannot serialise a cycle into an evidence bundle');
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(sort);
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
    );
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function readme(input: BundleInput, digest: string): string {
  return [
    'HOW TO VERIFY THIS BUNDLE',
    '',
    'This directory records that a file presenting a particular SHA-256 was',
    'checked, what was found, and by which versions. It does NOT contain the',
    'file itself. Read attestation.txt for exactly what is and is not claimed.',
    '',
    '1. CHECK THE FILES ARE THE ONES THAT WERE RECORDED.',
    '',
    '   manifest.json lists a SHA-256 for every other file here. Recompute them:',
    '',
    '     sha256sum report.html result.json attestation.txt README.txt',
    '',
    '   and compare against manifest.json. Any difference means a file in this',
    '   directory has changed since the bundle was made.',
    '',
    '2. CHECK THE MANIFEST ITSELF HAS NOT CHANGED.',
    '',
    '   The bundle digest is the SHA-256 of manifest.json:',
    '',
    `     ${digest}`,
    '',
    '     sha256sum manifest.json',
    '',
    ...(input.sealPublicKeyFingerprint
      ? [
          '   THIS BUNDLE IS SEALED. manifest.json.sig is a cryptographic seal over',
          '   manifest.json, made with the key whose SHA-256 fingerprint is:',
          '',
          `     ${input.sealPublicKeyFingerprint}`,
          '',
          '   Obtain that public key from the publisher, confirm the fingerprint',
          '   matches, and verify:',
          '',
          '     cosign verify-blob --key cosign.pub --signature manifest.json.sig manifest.json',
          '',
          '   Or with openssl, which needs the raw signature rather than base64:',
          '',
          '     base64 -d manifest.json.sig > manifest.sig.der',
          '     openssl dgst -sha256 -verify cosign.pub \\',
          '       -signature manifest.sig.der manifest.json',
          '',
          '   Checking the fingerprint is not optional. A seal verifies against',
          '   whatever key you hand it, so a seal made by an attacker verifies',
          '   perfectly against that attacker’s key. What the seal establishes is',
          '   that the manifest has not changed since the holder of ONE PARTICULAR',
          '   key sealed it, and the fingerprint is how you know which key that is.',
          '',
        ]
      : [
          '   THIS BUNDLE IS NOT SEALED. Nothing in this directory establishes who',
          '   produced it. The hashes above detect accidental change, not a',
          '   deliberate one made by somebody who also rewrote the manifest.',
          '',
          '   A sealed bundle carries manifest.json.sig beside the manifest and',
          '   names the signing key in this file.',
          '',
        ]),
    '3. CHECK THE FILE YOU HOLD IS THE FILE THAT WAS CHECKED.',
    '',
    '   This is the step only you can do, and it is the reason the bundle',
    '   records a hash rather than a copy:',
    '',
    `     sha256sum <your-file>          expected: ${input.fileSha256}`,
    '',
    'WHAT A SUCCESSFUL VERIFICATION MEANS.',
    '',
    'That this record is intact and refers to an artifact you hold. It does not',
    'mean the software described is safe, that it complies with any regulation,',
    'or that any submission will be accepted. attestation.txt states the limits',
    'in full and they are not decorative.',
    '',
  ].join('\n');
}

/** Assemble a bundle. Pure: no clock, no filesystem, no randomness. */
export function buildBundle(input: BundleInput): Bundle {
  const resultJson = stableJson(input.result);
  const attestation = input.attestation.endsWith('\n')
    ? input.attestation
    : `${input.attestation}\n`;

  // The manifest is built before the README so the README can quote the
  // digest, and the README is hashed into the manifest afterwards. Those two
  // facts cannot both be true, so the README is deliberately NOT covered by
  // the manifest and says so: it is instructions, not evidence.
  const covered: BundleFile[] = [
    { name: 'report.html', content: input.reportHtml, sha256: sha256(input.reportHtml) },
    { name: 'result.json', content: resultJson, sha256: sha256(resultJson) },
    { name: 'attestation.txt', content: attestation, sha256: sha256(attestation) },
  ];

  const manifest = {
    schema: 1,
    checkId: input.checkId,
    timestamp: input.timestamp,
    submitted: {
      // The name is recorded because a reader needs to know what they are
      // looking at. The hash is what the claim rests on.
      fileName: input.fileName,
      sha256: input.fileSha256,
    },
    versions: {
      engine: input.engineVersion,
      rulePackId: input.packId,
      rulePackVersion: input.packVersion,
    },
    files: Object.fromEntries(covered.map((f) => [f.name, f.sha256])),
    note:
      'README.txt is instructions rather than evidence and is deliberately not ' +
      'listed above: it quotes the digest of this manifest, which cannot also be ' +
      'computed over it.',
  };

  const manifestJson = stableJson(manifest);
  const digest = sha256(manifestJson);

  const files: BundleFile[] = [
    ...covered,
    { name: 'manifest.json', content: manifestJson, sha256: digest },
  ];
  const readmeText = readme(input, digest);
  files.push({ name: 'README.txt', content: readmeText, sha256: sha256(readmeText) });

  files.sort((a, b) => a.name.localeCompare(b.name));
  return { checkId: input.checkId, files, digest, directory: `evidence-${input.checkId}` };
}

/**
 * Seal a built bundle, producing the file that goes beside the manifest.
 *
 * SEPARATE FROM buildBundle ON PURPOSE. `buildBundle` is pure and its output
 * is byte-identical across runs, which is what lets a customer compare an
 * eighteen-month-old copy against a fresh one. ECDSA draws a random nonce, so
 * sealing is the one step that cannot be deterministic: seal the same manifest
 * twice and the two files differ, both valid. Keeping it out of `buildBundle`
 * means the determinism claim stays true of everything `buildBundle` returns,
 * rather than becoming "deterministic except for one file" that somebody has
 * to remember when comparing two directories.
 */
export function sealBundle(bundle: Bundle, privateKeyPem: string): BundleFile {
  const manifest = bundle.files.find((f) => f.name === 'manifest.json');
  if (!manifest) throw new Error('this bundle has no manifest.json to seal');
  const seal = sealManifest(manifest.content, privateKeyPem);
  // A trailing newline so the file is a well-formed text line, and because
  // `cosign verify-blob --signature` tolerates surrounding whitespace.
  const content = `${seal.signature}\n`;
  return { name: SEAL_FILENAME, content, sha256: sha256(content) };
}

export interface SealedVerifyResult {
  /** The hash chain: every file matches the manifest, the manifest matches the digest. */
  integrity: VerifyResult;
  /** Absent when the bundle carries no seal file. */
  seal?: SealVerdict;
  /** True only when the hashes hold AND a seal verified against the given key. */
  ok: boolean;
}

/**
 * Verify a bundle completely: the hash chain, and the seal over it.
 *
 * THE TWO ANSWERS ARE KEPT APART because they mean different things. Intact
 * hashes with no seal is an honest, useful state: the bundle has not been
 * damaged. A valid seal over a broken hash chain is impossible by construction
 * and would indicate a bug rather than an attack. What a reader must never see
 * is one word covering both, because "verified" over an unsealed bundle claims
 * an origin nothing established.
 *
 * Passing no public key checks the hashes and says the seal was not examined,
 * rather than quietly reporting success on the half that was.
 */
export function verifySealedBundle(
  files: BundleFile[],
  publicKeyPem?: string,
  expectedDigest?: string,
): SealedVerifyResult {
  const integrity = verifyBundle(
    files.filter((f) => f.name !== SEAL_FILENAME),
    expectedDigest,
  );
  const sealFile = files.find((f) => f.name === SEAL_FILENAME);
  const manifest = files.find((f) => f.name === 'manifest.json');

  if (!sealFile) {
    return { integrity, ok: false, seal: { ok: false, why: 'this bundle carries no seal file' } };
  }
  if (!publicKeyPem) {
    return {
      integrity,
      ok: false,
      seal: { ok: false, why: 'a seal is present but no public key was supplied to check it against' },
    };
  }
  if (!manifest) {
    return { integrity, ok: false, seal: { ok: false, why: 'this bundle has no manifest.json' } };
  }

  const seal = verifySeal(manifest.content, sealFile.content, publicKeyPem);
  return { integrity, seal, ok: integrity.ok && seal.ok };
}

export type VerifyResult =
  | { ok: true; digest: string }
  | { ok: false; problems: string[] };

/**
 * Re-derive everything a bundle claims about itself.
 *
 * Does NOT check a cryptographic seal: that needs the published public key and
 * a verifier, and README.txt gives the command. This answers the question
 * underneath it, which is whether the files still hash to what the manifest
 * says and whether the manifest still hashes to the digest that was sealed.
 */
export function verifyBundle(files: BundleFile[], expectedDigest?: string): VerifyResult {
  const problems: string[] = [];
  const byName = new Map(files.map((f) => [f.name, f]));

  const manifestFile = byName.get('manifest.json');
  if (!manifestFile) return { ok: false, problems: ['manifest.json is missing'] };

  const digest = sha256(manifestFile.content);
  if (expectedDigest && digest !== expectedDigest) {
    problems.push(
      `manifest.json hashes to ${digest}, but the expected bundle digest is ${expectedDigest}`,
    );
  }

  let manifest: { files?: Record<string, string> };
  try {
    manifest = JSON.parse(manifestFile.content) as { files?: Record<string, string> };
  } catch (e) {
    return { ok: false, problems: [`manifest.json is not readable JSON: ${(e as Error).message}`] };
  }

  for (const [name, want] of Object.entries(manifest.files ?? {})) {
    const f = byName.get(name);
    if (!f) {
      problems.push(`${name} is listed in the manifest and is missing from the bundle`);
      continue;
    }
    const got = sha256(f.content);
    if (got !== want) problems.push(`${name} has changed: expected ${want}, found ${got}`);
  }

  return problems.length === 0 ? { ok: true, digest } : { ok: false, problems };
}
