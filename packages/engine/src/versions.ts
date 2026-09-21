/**
 * Which specification versions this engine actually reads.
 *
 * SPEC step 1.2's acceptance test is "unsupported versions refused by name, not
 * generically", and nothing enforced it: detectFormat returned whatever version
 * string it found and every rule then ran against the document regardless. A
 * CycloneDX 1.0 file would have been checked by rules written for 1.4 selectors
 * and reported as a clean pass, which is the exact shape of failure this
 * project exists to argue against.
 *
 * The ranges are the ones docs/copy.md states to users, so the two cannot
 * disagree: CycloneDX 1.2 to 1.7, SPDX 2.2 to 2.3.
 *
 * SPDX 3.0 IS NOT IN THAT RANGE, AND USED TO BE. Both the engine and the copy
 * said "SPDX 2.2 to 3.0.1", and no 3.0 document can be read here: 3.0 is
 * JSON-LD, its elements live under @graph rather than a `packages` array, and
 * every SPDX selector in both packs is a 2.x shape. A 3.0.1 file with an
 * spdxVersion key was told "This file parsed, but it lists no components",
 * which is false about the file. A real 3.0 document has no spdxVersion key at
 * all, so it got "it has no CycloneDX or SPDX markers. StratifyPro reads ...
 * SPDX 2.2 to 3.0.1", denying and asserting 3.0 support in consecutive
 * sentences. Claiming a version is cheap; reading it is not.
 *
 * Refusing is the conservative choice. An unread version produces no result
 * rather than a result built on selectors that may mean something else, on the
 * same argument packInvalid makes: a partial answer on submission evidence is
 * worse than no answer.
 */
import type { SourceFormat } from './types.js';

export const SUPPORTED: Record<SourceFormat, { min: string; max: string; label: string }> = {
  cyclonedx: { min: '1.2', max: '1.7', label: 'CycloneDX 1.2 to 1.7' },
  spdx: { min: '2.2', max: '2.3', label: 'SPDX 2.2 to 2.3' },
};

/** Dotted numeric compare. Returns negative, zero or positive, like a sort. */
function compare(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10));
  const pb = b.split('.').map((n) => Number.parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * True when this engine reads that version.
 *
 * A version string it cannot parse is NOT supported. "unknown" reaches here
 * from detectFormat when a document carries an SPDXID but no spdxVersion, and
 * guessing that such a file is probably fine is how an unreadable document
 * becomes a clean report.
 */
export function isSupportedVersion(format: SourceFormat, spec: string): boolean {
  const range = SUPPORTED[format];
  const v = spec.replace(/^SPDX-/, '').trim();
  if (!/^\d+(\.\d+)*$/.test(v)) return false;
  const lo = compare(v, range.min);
  const hi = compare(v, range.max);
  if (Number.isNaN(lo) || Number.isNaN(hi)) return false;
  return lo >= 0 && hi <= 0;
}
