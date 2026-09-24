/**
 * The cryptographic seal over an evidence bundle. SPEC.md 2.5.
 *
 * SPEC.md's acceptance is one command: `cosign verify-blob` succeeds against
 * the published public key. So this produces exactly what cosign produces, and
 * exactly what cosign accepts, rather than a private format with a similar
 * shape:
 *
 *     key        ECDSA on P-256, which is what `cosign generate-key-pair` makes
 *     digest     SHA-256 over the manifest bytes as written
 *     signature  ASN.1 DER, base64 encoded, which is cosign's blob signature
 *     public key PEM SPKI, which is the format of a cosign.pub file
 *
 * Node's `crypto.sign('sha256', data, ecKey)` emits DER ECDSA over SHA-256 of
 * the data, so the compatibility is by construction rather than by adaptation.
 * The private key is written as ordinary PKCS#8 PEM. cosign's own key file is
 * additionally password-encrypted with scrypt and NaCl secretbox, which is a
 * storage choice rather than part of the signature format; nothing about
 * verification depends on it.
 *
 * WHAT IS SIGNED IS THE MANIFEST, AND THAT IS ENOUGH. The manifest names a
 * SHA-256 for every other file in the bundle, so a seal over the manifest
 * covers the report, the result and the attestation transitively. Signing four
 * files separately would produce four things to check and three ways to check
 * only some of them.
 *
 * THE SEAL IS NOT DETERMINISTIC, AND THE BUNDLE STILL IS. ECDSA draws a random
 * nonce per signature, so sealing the same manifest twice yields two different
 * signature files, both valid. That does not weaken the bundle's reproducibility
 * claim, which is about the five files a customer compares against their kept
 * copy: those stay byte-identical. It does mean `manifest.json.sig` must never
 * be included in a byte-comparison of two bundles, and a test asserts both
 * halves of that.
 *
 * NAMING. 21 CFR 11.3(b)(7) reserves its own term for something executed by a
 * named individual. This is a machine seal over a record and is never that, so
 * the regulation's phrase is banned repository-wide by
 * `docs/banned-phrases.txt`; the words used here are "cryptographic seal" and
 * "signed manifest". The distinction is not pedantry: a device maker who
 * believes this is a Part 11 signature has been misled about what they can
 * file. `packages/report/src/attestation.json` is the one file allowed to
 * write the phrase out, because it is the file that disclaims it.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

/** The one curve and hash this reads or writes. cosign's default. */
export const SEAL_ALGORITHM = 'ecdsa-p256-sha256' as const;

/** The file a seal is written to, beside the manifest it covers. */
export const SEAL_FILENAME = 'manifest.json.sig' as const;

export interface SealingKey {
  /** PKCS#8 PEM. Never written into the repository, never into a bundle. */
  privateKeyPem: string;
  /** SPKI PEM. This is a cosign.pub file, byte for byte. */
  publicKeyPem: string;
  /** SHA-256 of the DER public key, as lowercase hex. Short-form identity. */
  fingerprint: string;
}

/**
 * A new sealing key.
 *
 * P-256 because that is what cosign generates and therefore what every
 * verifier in that ecosystem already handles. A stronger curve that cosign
 * would refuse is not stronger in any way that matters here.
 */
export function generateSealingKey(): SealingKey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return { privateKeyPem, publicKeyPem, fingerprint: fingerprintOf(publicKeyPem) };
}

/** SHA-256 over the DER form, so the same key fingerprints the same everywhere. */
export function fingerprintOf(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
}

/** The public half of a private key, so a caller never has to carry both. */
export function publicKeyFrom(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'pem' }).toString();
}

export interface Seal {
  /** Base64 ASN.1 DER. The exact bytes `cosign verify-blob --signature` wants. */
  signature: string;
  algorithm: typeof SEAL_ALGORITHM;
  /** Which key sealed it, so a verifier can tell it has the right one. */
  publicKeyFingerprint: string;
}

/**
 * Seal the manifest.
 *
 * `manifestText` must be the bytes written to disk, not a re-serialisation of
 * the same object. Two serialisers that sort keys differently produce the same
 * document and different bytes, and a seal over the second does not verify
 * against the first. The bundle builder passes the string it wrote.
 */
export function sealManifest(manifestText: string, privateKeyPem: string): Seal {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ec') {
    throw new Error(
      `this key is ${key.asymmetricKeyType ?? 'of an unknown type'}, and a bundle seal is ` +
        `${SEAL_ALGORITHM}. Generate one with \`stratifypro keygen\`.`,
    );
  }
  const signature = sign('sha256', Buffer.from(manifestText, 'utf8'), key).toString('base64');
  return {
    signature,
    algorithm: SEAL_ALGORITHM,
    publicKeyFingerprint: fingerprintOf(publicKeyFrom(privateKeyPem)),
  };
}

export interface SealVerdict {
  ok: boolean;
  /** Plain words. This is read by somebody deciding whether to trust a record. */
  why: string;
}

/**
 * Check a seal against the manifest it claims to cover.
 *
 * Returns a verdict rather than throwing, because "this seal does not verify"
 * is an ordinary answer to an ordinary question and the caller has to report
 * it either way. A malformed key or an unreadable signature is still a false
 * verdict, not an exception: to the person holding the bundle, "the seal is
 * not valid" and "the seal is not even well formed" both mean do not rely on
 * this record.
 */
export function verifySeal(
  manifestText: string,
  signatureBase64: string,
  publicKeyPem: string,
): SealVerdict {
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    return { ok: false, why: 'the public key could not be read as a PEM public key' };
  }
  if (key.asymmetricKeyType !== 'ec') {
    return { ok: false, why: `the public key is ${key.asymmetricKeyType ?? 'of an unknown type'}, not EC P-256` };
  }

  let der: Buffer;
  try {
    der = Buffer.from(signatureBase64.trim(), 'base64');
  } catch {
    return { ok: false, why: 'the seal is not valid base64' };
  }
  // A base64 decode of nonsense yields bytes rather than an error, so the
  // shape is checked here: an ECDSA signature is a DER SEQUENCE of two
  // INTEGERs, and 0x30 is SEQUENCE. Without this a truncated file reports
  // "does not verify", which sounds like tampering rather than a damaged file.
  if (der.length < 8 || der[0] !== 0x30) {
    return { ok: false, why: 'the seal is not a DER ECDSA signature; the file may be truncated' };
  }

  const ok = verify('sha256', Buffer.from(manifestText, 'utf8'), key, der);
  return ok
    ? { ok: true, why: 'the manifest is sealed by this key and has not changed since' }
    : {
        ok: false,
        why:
          'the seal does not verify against this manifest and this key. Either the manifest ' +
          'has changed, or the seal was made by a different key.',
      };
}
