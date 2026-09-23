/**
 * The scope of attestation, verbatim. SPEC.md Step 11.
 *
 * THIS FILE IS EXEMPT FROM THE BANNED-PHRASE CHECK, AND THAT NEEDS JUSTIFYING.
 *
 * `docs/banned-phrases.txt` forbids the word "contained", because a checked
 * file is never described as having contained anything: StratifyPro does not
 * retain the file and cannot say what was in it. It also forbids calling the
 * seal a signature.
 *
 * SPEC.md's mandated wording uses both words, and uses them to say the
 * opposite of a claim:
 *
 *     ...not to what that artifact contained.
 *     It is not an electronic signature within the meaning of 21 CFR 11.3(b)(7).
 *
 * A blunt grep cannot tell a claim from its own denial. So the text lives in
 * this one file, this one file is excluded from that scan, and
 * `scripts/check-attestation.py` replaces the exclusion with something
 * stronger: it extracts the blockquote from SPEC.md and fails the build if
 * this text differs from it by a character, and fails if either banned word
 * appears anywhere in this file OUTSIDE that mandated wording.
 *
 * The exemption is therefore narrower than the check it replaces. Before this,
 * the attestation was not verified against the specification at all.
 *
 * WHY THE WORDING IS LOAD-BEARING. SPEC.md gives two rules, and both are about
 * exposure rather than style.
 *
 * 1. Never claim the file held anything. StratifyPro can attest that a file
 *    presenting a given hash was submitted and produced given findings. It
 *    cannot attest to what was inside, because it never kept it. Version 1.0
 *    of the specification got this wrong. A claim that cannot be substantiated
 *    is an FTC Act section 5 exposure, and this text is the entire paid
 *    proposition, so every word is a representation a regulator can read.
 *
 * 2. Never call the seal an electronic signature. Under 21 CFR 11.3(b)(7) an
 *    electronic signature is a compilation executed by AN INDIVIDUAL as the
 *    legally binding equivalent of their handwritten signature. Sigstore
 *    keyless signing is machine provenance. Marketing it as a person's
 *    approval volunteers StratifyPro into 11.50, 11.100 and 11.200 territory
 *    for no benefit whatsoever.
 */

export interface AttestationInput {
  /** The date the check ran, ISO 8601. */
  date: string;
  /** SHA-256 of the submitted file, as hex. */
  sha256: string;
  engineVersion: string;
  packId: string;
  packVersion: string;
}

/**
 * Build the attestation text.
 *
 * Substitutes the five values SPEC.md leaves as placeholders and changes
 * nothing else. There is no option to shorten it, no option to soften it, and
 * no white-label variant: a firm may replace our name in the footer, but the
 * attestation is a statement about which engine produced the findings, and a
 * version of it with the engine removed would attest to nothing.
 */
export function attestationText(input: AttestationInput): string {
  return [
    `On ${input.date} a file presenting SHA-256 ${input.sha256} was submitted to StratifyPro ` +
      `engine version ${input.engineVersion} and evaluated against rule pack ` +
      `${input.packId}@${input.packVersion}, producing the findings recorded in result.json.`,

    'StratifyPro did not retain the submitted file and cannot reproduce its contents. ' +
      'This record attests to the integrity of an artifact held by the submitter, not to ' +
      'what that artifact contained.',

    'This is not a statement that the software described is safe, that it complies with ' +
      'any regulation, or that any regulatory submission will be accepted. It is not an ' +
      'electronic signature within the meaning of 21 CFR 11.3(b)(7).',
  ].join('\n\n');
}

/**
 * The same text with SPEC.md's placeholders left in, for comparing against the
 * specification without needing a real check to have happened.
 */
export const ATTESTATION_TEMPLATE = attestationText({
  date: '<date>',
  sha256: '<hash>',
  engineVersion: '<v>',
  packId: '<id>',
  packVersion: '<version>',
});
