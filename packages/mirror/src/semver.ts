/**
 * Semantic version ordering, to the letter of semver.org 2.0.0.
 *
 * WHY THIS IS HERE AND NOT A DEPENDENCY. Half the corpus is Go, and 98.8
 * percent of the Go advisories OSV publishes carry no enumerated version list
 * at all: 14,270 SEMVER ranges against 271 affected-package entries with an
 * explicit `versions` array. Exact string matching, which answers NuGet and
 * Maven almost completely, reaches essentially nothing in Go. So a range
 * evaluator is not an optimisation here, it is the difference between
 * answering half the corpus and abstaining on it.
 *
 * WHY THAT IS DANGEROUS. A comparator that is subtly wrong does not throw. It
 * returns a boolean, and the boolean becomes "this device does not ship a
 * vulnerable OpenSSL" in a regulatory submission. The failure mode is a
 * confident wrong answer, which is the one failure mode this project treats as
 * worse than no answer. Everything below is therefore written against the
 * specification clause by clause rather than by intuition, and
 * semver.test.ts walks the ordering the specification states in clause 11.
 *
 * SCOPE. This orders SEMVER ranges only. Maven's scheme, NuGet's, and dpkg's
 * are different algorithms with different rules, and guessing that they are
 * "close enough to semver" is exactly the confident wrong answer above. Where
 * a range is not SEMVER, the matcher abstains instead of reaching for this.
 */

export interface Parsed {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated identifiers. Empty means this is a release, not a pre-release. */
  prerelease: string[];
}

/**
 * Parse a version, or return null.
 *
 * Tolerates the leading `v` that Go module versions carry and that OSV's Go
 * ranges omit, and the `+build` metadata that clause 10 says is ignored when
 * determining precedence. Returns null rather than a guess for anything else,
 * because a version this cannot place must become an abstention upstream and
 * not a zero.
 */
export function parse(input: string): Parsed | null {
  const v = input.trim().replace(/^v/, '');
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v);
  if (!m) return null;
  const [, major, minor, patch, pre] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: pre === undefined || pre === '' ? [] : pre.split('.'),
  };
}

const NUMERIC = /^(0|[1-9]\d*)$/;

/**
 * Order two pre-release identifier lists, per clause 11.4.
 *
 * The four rules, in the order the specification gives them:
 *   1. identifiers consisting of only digits compare numerically
 *   2. identifiers with letters or hyphens compare lexically in ASCII order
 *   3. numeric identifiers always have lower precedence than non-numeric ones
 *   4. a larger set of fields has higher precedence, if all preceding are equal
 *
 * Rule 3 is the one that gets dropped by implementations written from memory,
 * and it is why 1.0.0-alpha.1 is below 1.0.0-alpha.beta rather than above it.
 */
function comparePrerelease(a: string[], b: string[]): number {
  // Clause 11.3: a release ranks above a pre-release of the same triple.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x === y) continue;
    const xn = NUMERIC.test(x);
    const yn = NUMERIC.test(y);
    if (xn && yn) {
      // Compared as numbers, so 2 is below 10. String order would say otherwise.
      const d = Number(x) - Number(y);
      if (d !== 0) return d < 0 ? -1 : 1;
      continue;
    }
    if (xn !== yn) return xn ? -1 : 1; // rule 3
    return x < y ? -1 : 1; // rule 2, ASCII
  }
  // rule 4
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}

/** Negative, zero or positive. Throws on an unparseable input rather than guessing. */
export function compare(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) {
    throw new Error(`not a semantic version: ${!pa ? a : b}`);
  }
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** True when both sides parse. Callers abstain rather than compare when this is false. */
export function comparable(a: string, b: string): boolean {
  return parse(a) !== null && parse(b) !== null;
}
