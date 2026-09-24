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
import {
  buildBundle,
  sealBundle,
  SEAL_FILENAME,
  type BundleInput,
} from '@stratifypro/ledger';

export interface WriteBundleOptions {
  outDir: string;
  input: BundleInput;
  /**
   * PKCS#8 PEM. Read by the caller and passed in, never a path read here.
   *
   * A private key has one safe lifetime: as short as possible. Handing this
   * function a path would make it the thing that decides when to open a key
   * file, and that decision belongs where the user's intent is, next to the
   * flag they typed.
   */
  privateKeyPem?: string;
}

export interface WrittenBundle {
  directory: string;
  digest: string;
  written: string[];
  sealed: boolean;
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

  // Sealed after the five files are on disk, because the seal covers the
  // manifest exactly as written. Re-serialising it here to sign it would risk
  // signing bytes that differ from the bytes a verifier will hash.
  let sealed = false;
  if (opts.privateKeyPem) {
    const seal = sealBundle(bundle, opts.privateKeyPem);
    writeFileSync(join(dir, seal.name), seal.content, 'utf8');
    written.push(seal.name);
    sealed = true;
  }

  return { directory: dir, digest: bundle.digest, written, sealed };
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
    lines.push('  accidental change. Nothing here proves who produced the bundle. Seal it');
    lines.push('  with a key a verifier trusts:');
    lines.push('');
    lines.push('    stratifypro keygen --out ./keys          (once, then publish keys/cosign.pub)');
    lines.push('    stratifypro bundle <file> --key ./keys/cosign.key');
    lines.push('');
  } else {
    lines.push(`  SEALED. ${SEAL_FILENAME} is a cryptographic seal over manifest.json.`);
    lines.push('  A recipient needs the matching public key AND its fingerprint, which');
    lines.push('  README.txt records. A seal verifies against whatever key it is given,');
    lines.push('  so the fingerprint is what ties it to you rather than to anyone.');
    lines.push('');
  }
  lines.push('  README.txt in the bundle explains how a recipient verifies it.');
  lines.push('');
  return lines.join('\n');
}
