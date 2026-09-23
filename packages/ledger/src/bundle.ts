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
    '   If a seal file (manifest.json.sig) was published alongside this bundle,',
    '   verify it against the published public key:',
    '',
    '     cosign verify-blob --key <public-key> --signature manifest.json.sig manifest.json',
    '',
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
