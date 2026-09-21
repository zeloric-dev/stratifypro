/**
 * Does a version fall inside an OSV affected range?
 *
 * Three answers, and the third is the point: true, false, and "this cannot be
 * evaluated". A matcher that folds the third into false reports a clean
 * component it never actually checked, which is the failure this whole project
 * is built to avoid. Every path that cannot reach a real answer returns null
 * and the caller turns it into a stated abstention.
 *
 * WHAT IS EVALUATED. SEMVER ranges only. Measured across the OSV exports for
 * the five ecosystems the corpus uses:
 *
 *   Go       14,270 SEMVER    140 ECOSYSTEM
 *   npm     218,486 SEMVER    433 ECOSYSTEM       1 GIT
 *   NuGet       119 SEMVER  6,720 ECOSYSTEM
 *   Maven       102 SEMVER 13,180 ECOSYSTEM
 *   Debian        0 SEMVER 179,493 ECOSYSTEM      3 GIT
 *
 * So SEMVER answers Go and npm, which is 73 percent of the corpus, and the
 * ECOSYSTEM-heavy three are answered instead by the enumerated `versions`
 * array, which 95 percent of NuGet and 87 percent of Maven affected-package
 * entries carry. The two methods are complementary by ecosystem, which is why
 * both exist and why neither is a fallback for the other.
 *
 * ECOSYSTEM ranges are NOT approximated with the semver comparator. Maven's
 * ordering, NuGet's, and dpkg's are separate algorithms: dpkg alone has epochs
 * and the tilde that sorts BELOW the empty string, so 1.0~rc1 precedes 1.0.
 * Treating any of them as "near enough to semver" would produce a confident
 * wrong verdict on a device submission. They abstain.
 */
import { compare, parse } from './semver.js';

export interface RangeEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface Range {
  type: string;
  events: RangeEvent[];
}

/** The `introduced: "0"` sentinel: before every version, and not itself a version. */
const ZERO = Symbol('zero');
type Bound = string | typeof ZERO;

type Kind = 'introduced' | 'fixed' | 'last_affected';

function events(range: Range): Array<{ kind: Kind; at: Bound }> | null {
  const out: Array<{ kind: Kind; at: Bound }> = [];
  for (const e of range.events) {
    let kind: Kind;
    let raw: string;
    if (e.introduced !== undefined) {
      kind = 'introduced';
      raw = e.introduced;
    } else if (e.fixed !== undefined) {
      kind = 'fixed';
      raw = e.fixed;
    } else if (e.last_affected !== undefined) {
      kind = 'last_affected';
      raw = e.last_affected;
    } else {
      // A `limit` event, or an event kind added to the schema after this was
      // written. Either way this range is not fully understood, and a range
      // that is not fully understood cannot produce a false.
      return null;
    }
    if (kind === 'introduced' && raw === '0') {
      out.push({ kind, at: ZERO });
      continue;
    }
    // An unparseable bound is not skipped. Skipping a `fixed` would leave a
    // patched version inside the window and report it as vulnerable; skipping
    // an `introduced` would do the reverse. Abstain on the whole range.
    if (parse(raw) === null) return null;
    out.push({ kind, at: raw });
  }
  return out;
}

/**
 * True, false, or null when the range cannot be evaluated.
 *
 * Events are sorted by version and walked in order, which is what the OSV
 * schema says to do: a version is affected when the last event at or before it
 * opened the window rather than closed it. Events are not assumed to arrive
 * sorted, because several real advisories do not sort them.
 */
export function affectedBy(version: string, range: Range): boolean | null {
  if (range.type !== 'SEMVER') return null;
  if (parse(version) === null) return null;

  const evs = events(range);
  if (evs === null || evs.length === 0) return null;

  // Every OSV range opens with an `introduced` event. One that does not is
  // malformed, and the walk below would return a confident `false` for it:
  // nothing ever opens the window, so nothing is ever affected. That reads in
  // the report as "compared and clean" for an advisory this never understood.
  if (!evs.some((e) => e.kind === 'introduced')) return null;

  const cmp = (a: Bound, b: Bound): number => {
    if (a === ZERO && b === ZERO) return 0;
    if (a === ZERO) return -1;
    if (b === ZERO) return 1;
    return compare(a, b);
  };

  // At one version, open the window before closing it: an advisory that
  // introduces and fixes at the same version describes an empty window.
  const order: Record<Kind, number> = { introduced: 0, fixed: 1, last_affected: 2 };
  const sorted = [...evs].sort((a, b) => cmp(a.at, b.at) || order[a.kind] - order[b.kind]);

  let affected = false;
  for (const e of sorted) {
    // Only events at or before the version under test can change its status.
    if (cmp(e.at, version) > 0) break;
    if (e.kind === 'introduced') affected = true;
    else if (e.kind === 'fixed') affected = false;
    else if (compare(version, e.at as string) > 0) affected = false;
  }
  return affected;
}
