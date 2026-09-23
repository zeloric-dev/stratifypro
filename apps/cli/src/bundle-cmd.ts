/**
 * `bundle <file>` — write an evidence bundle for a check.
 *
 * SPEC.md Step 11. Wired to the CLI in the same change that built it, because
 * three times this session a capability was finished everywhere except where
 * somebody could invoke it: the advisory mirror, the attestation, and the
 * resolver. A library nobody calls is a claim.
 *
 * This is also what makes SPEC.md 2.7 reachable. The attestation text has
 * existed, pinned to the specification and guarded by a check, and has been
 * stated to nobody, because the bundle is where SPEC.md puts it.
 *
 * THE SUBMITTED FILE IS READ AND NOT COPIED. Its SHA-256 goes into the
 * manifest; its bytes do not go into the bundle. `attestation.txt` says the
 * file was not retained, and a bundle containing it would make its own
 * attestation false in the same directory.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBundle, type BundleInput } from '@stratifypro/ledger';

export interface WriteBundleOptions {
  outDir: string;
  input: BundleInput;
}

export interface WrittenBundle {
  directory: string;
  digest: string;
  written: string[];
}

/** A stable check id from the inputs, so two identical checks bundle identically. */
export function checkIdFor(fileSha256: string, packId: string, packVersion: string, timestamp: string): string {
  return createHash('sha256')
    .update([fileSha256, packId, packVersion, timestamp].join('\u0000'), 'utf8')
    .digest('hex')
    .slice(0, 16);
}

export function writeBundle(opts: WriteBundleOptions): WrittenBundle {
  const bundle = buildBundle(opts.input);
  const dir = join(opts.outDir, bundle.directory);
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const f of bundle.files) {
    const path = join(dir, f.name);
    writeFileSync(path, f.content, 'utf8');
    written.push(f.name);
  }
  return { directory: dir, digest: bundle.digest, written };
}

export function renderBundle(b: WrittenBundle, sealed: boolean): string {
  const lines = ['', `  ${b.directory}`, ''];
  for (const name of b.written) lines.push(`    ${name}`);
  lines.push('');
  lines.push(`  bundle digest: ${b.digest}`);
  lines.push('');
  if (!sealed) {
    // Said plainly, every time. A bundle without a seal is still useful: it
    // detects accidental change and it records what was checked. It does not
    // prove who made it, and letting a reader assume otherwise would be the
    // kind of overstatement the attestation inside it exists to prevent.
    lines.push('  NOT SEALED. These files hash to what manifest.json says, which detects');
    lines.push('  accidental change. Nothing here proves who produced the bundle. Sign');
    lines.push('  manifest.json with a key a verifier trusts to add that:');
    lines.push('');
    lines.push('    cosign sign-blob --key <key> manifest.json > manifest.json.sig');
    lines.push('');
  }
  lines.push('  README.txt in the bundle explains how a recipient verifies it.');
  lines.push('');
  return lines.join('\n');
}
