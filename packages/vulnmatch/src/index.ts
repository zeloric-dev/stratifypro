/**
 * @stratifypro/vulnmatch
 *
 * Cross-references components against the local advisory mirror. Depends on
 * engine types and @stratifypro/mirror, never the reverse.
 *
 * THREE ANSWERS, NEVER TWO. `affected`, `clear`, and `unknown`. Almost every
 * scanner in this space collapses the third into the second: it could not
 * parse the version, could not place the ecosystem, could not evaluate the
 * range, and prints a component with no findings beside it. The reader cannot
 * tell that apart from a component that was genuinely examined and is
 * genuinely fine. On a 524B submission that difference is the whole document.
 *
 * So `clear` is a claim with conditions attached, and it is only ever returned
 * when a real comparison actually ran. Every other path returns `unknown` with
 * the reason in prose. The same rule the resolver follows, for the same
 * reason: a wrong identifier produces a confident wrong vulnerability verdict,
 * and an acknowledged gap is worth more than a guess.
 *
 * NO NETWORK PRIMITIVE APPEARS IN THIS PACKAGE. Everything it needs was
 * fetched by apps/sync and written to disk with a date on it. That is asserted
 * statically by verify.sh and at runtime by a test that makes fetch,
 * XMLHttpRequest, http.request and https.request throw, then runs the full
 * corpus through this module and requires it to finish.
 */
import {
  Mirror,
  type Advisory,
  type SourceStatus,
  affectedBy,
  goModuleCandidates,
  purlToKey,
} from '@stratifypro/mirror';

export const PACKAGE_NAME = '@stratifypro/vulnmatch' as const;

export { componentsFrom } from './document.js';

/** How a version was compared. Reported per hit so the reasoning is visible. */
export type Method = 'enumerated-version' | 'semver-range';

/**
 * How the identifier that was looked up came to be known.
 *
 * SPEC.md 1.14 accepts on "every match carries its resolution provenance and
 * confidence". This is that, and it is a plain structure rather than an import
 * from @stratifypro/resolve on purpose: SPEC.md says resolve, vulnmatch and eos
 * depend on engine types only and never on each other. The caller resolves and
 * passes the answer in, so the two packages stay independent and a resolution
 * from any source can be carried.
 *
 * THERE IS NO NUMERIC CONFIDENCE, and that is deliberate rather than missing.
 * packages/resolve already settled this: "the method is the confidence". An
 * exact purl declared in the document and a heuristic guess are different in
 * kind, not in degree, and a 0.82 next to the second one invites arithmetic
 * that the underlying evidence does not support.
 */
export interface IdentifierProvenance {
  /**
   * `declared` when the document itself carried the package URL. Anything else
   * is whatever the resolver called it: `exact`, `dictionary`, `heuristic`.
   */
  method: string;
  /** The form that actually matched, so a reader can check the answer. */
  matchedOn?: string;
  /** How many times the dictionary observed the mapping, when it came from there. */
  observations?: number;
}

export interface Hit {
  id: string;
  aliases: string[];
  summary?: string;
  /** True when a CVE in this advisory's aliases is on the CISA KEV catalog. */
  knownExploited: boolean;
  method: Method;
  /** The OSV key that matched. Differs from the component when a Go prefix answered. */
  matchedName: string;
  /**
   * True when the document already listed this advisory in its own
   * `vulnerabilities` array.
   *
   * SPEC.md 1.14 asks for "advisories the file did not declare", so the two
   * have to be told apart rather than merged. A supplier who declared a CVE
   * and shipped a fix note is in a different position from one who did not
   * mention it, and a report that flattens them tells a reviewer the wrong
   * thing about the supplier.
   *
   * Across the 21-file corpus this is false for every hit, because not one of
   * those files declares a single vulnerability. That is a finding about the
   * state of published SBOMs, not a reason to drop the field.
   */
  alreadyDeclared: boolean;
}

export interface Examined {
  ecosystem: string;
  name: string;
  version: string;
  /** Set when a Go package path was answered by its parent module. */
  viaGoModule?: string;
  /** How the identifier that was looked up came to be known. Always present. */
  identifiedBy: IdentifierProvenance;
}

export type Verdict =
  | { status: 'affected'; hits: Hit[]; malicious: Hit[]; examined: Examined }
  | { status: 'clear'; examined: Examined; malicious: Hit[] }
  | { status: 'unknown'; why: string };

export interface Component {
  name: string;
  version: string | null;
  purl: string | null;
  /**
   * How `purl` was established. Defaults to `declared`, which is what it is
   * when the document carried it.
   *
   * A caller that ran @stratifypro/resolve over a component with no purl
   * passes the resolver's own method here, and every hit then says so.
   */
  provenance?: IdentifierProvenance;
  /** Advisory ids the document already declared for this component. */
  declared?: readonly string[];
}

/** One advisory against one version: did it match, miss, or resist evaluation? */
type Outcome = 'affected' | 'clear' | 'indeterminate';

function evaluate(advisory: Advisory, ecosystem: string, name: string, version: string): {
  outcome: Outcome;
  method?: Method;
} {
  let sawEvaluable = false;
  let sawIndeterminate = false;

  for (const af of advisory.affected) {
    if (af.ecosystem !== ecosystem || af.name !== name) continue;

    let entryEvaluable = false;

    // An enumerated list answers a hit outright. It does NOT answer a miss on
    // its own, which is the correction below.
    if (af.versions && af.versions.length > 0) {
      entryEvaluable = true;
      if (af.versions.includes(version)) return { outcome: 'affected', method: 'enumerated-version' };
    }

    // THE RANGES ARE CONSULTED EVEN WHEN A VERSION LIST EXISTS, and this is a
    // fix rather than a preference.
    //
    // The first version of this function treated `versions` as authoritative
    // and skipped the ranges whenever it was present. OSV's `versions` is not
    // authoritative: it is a convenience list materialised from the ranges
    // against the versions that were known when the advisory was last
    // exported. A release published after that is inside the range and absent
    // from the list.
    //
    // Measured on the real mirror: 508 affected-entries carry both, and on 85
    // of them a semver range calls a version affected that the list omits. At
    // 65 of those version points the whole component came back `clear`,
    // go.opentelemetry.io/otel/baggage among them. That is the one thing this
    // package exists to never do.
    //
    // The corpus tally did not move: 838 affected, 3,952 clear, 298 unknown
    // before and after. None of the 21 corpus documents happens to pin a
    // version in the gap. That is luck, it is not a defence, and it is exactly
    // why the number to fix on was the one from the advisory data rather than
    // the one from our own fixtures.
    if (af.ranges && af.ranges.length > 0) {
      for (const r of af.ranges) {
        const hit = affectedBy(version, r);
        if (hit === null) continue; // this range abstains; another may not
        entryEvaluable = true;
        if (hit) return { outcome: 'affected', method: 'semver-range' };
      }
    }

    // Nothing in this entry could be compared: no version list, and no range
    // in an ordering this implements. It names the package and says nothing
    // about which versions, so it cannot clear anything.
    if (entryEvaluable) sawEvaluable = true;
    else sawIndeterminate = true;
  }

  if (sawIndeterminate && !sawEvaluable) return { outcome: 'indeterminate' };
  if (!sawEvaluable) return { outcome: 'indeterminate' };
  return { outcome: sawIndeterminate ? 'indeterminate' : 'clear' };
}

function toHit(
  a: Advisory,
  method: Method,
  matchedName: string,
  kev: Set<string>,
  declared: ReadonlySet<string>,
): Hit {
  const aliases = a.aliases ?? [];
  return {
    id: a.id,
    aliases,
    ...(a.summary ? { summary: a.summary } : {}),
    knownExploited: [a.id, ...aliases].some((x) => kev.has(x)),
    method,
    matchedName,
    // Matched on the id OR any alias: a document that declared CVE-2021-44228
    // has declared the GHSA that aliases it, and reporting it as undeclared
    // would accuse the supplier of an omission they did not make.
    alreadyDeclared: [a.id, ...aliases].some((x) => declared.has(x)),
  };
}

/**
 * Check one component against the mirror. Makes no outbound call.
 *
 * Every early return is an abstention with its reason, and there is no path
 * from "could not look this up" to `clear`.
 */
export function check(mirror: Mirror, component: Component): Verdict {
  if (!component.purl) {
    return {
      status: 'unknown',
      why: `${component.name} carries no package URL. Without one there is no ecosystem and no key, and a name alone matches the wrong package as often as the right one.`,
    };
  }

  const mapping = purlToKey(component.purl);
  if (!mapping.mapped) return { status: 'unknown', why: mapping.why };

  const { ecosystem } = mapping.key;
  let { name, version } = mapping.key;
  version = version ?? component.version;

  if (!version) {
    return {
      status: 'unknown',
      why: `${name} has no version. "Affected" is a statement about a version, and there is none here to make it about.`,
    };
  }

  if (!mirror.hasEcosystem(ecosystem)) {
    return {
      status: 'unknown',
      why: `${ecosystem} is not in this mirror, so ${name} was not examined. Rebuild the mirror with that ecosystem to get an answer.`,
    };
  }

  let advisories = mirror.advisoriesFor(ecosystem, name);
  if (advisories === null) {
    return {
      status: 'unknown',
      why: `The ${ecosystem} index did not load, so ${name} was not examined. See the source status for this run.`,
    };
  }

  // OSV files Go advisories by module, and most corpus Go components name a
  // package inside one. Walk back to the parent module, accepting only a
  // prefix that is itself a key in the index, and report which one answered.
  let viaGoModule: string | undefined;
  if (ecosystem === 'Go' && advisories.length === 0) {
    for (const candidate of goModuleCandidates(name).slice(1)) {
      if (mirror.isKnownGoModule(candidate)) {
        viaGoModule = candidate;
        name = candidate;
        advisories = mirror.advisoriesFor(ecosystem, candidate) ?? [];
        break;
      }
    }
  }

  const examined: Examined = {
    ecosystem,
    name,
    version,
    ...(viaGoModule ? { viaGoModule } : {}),
    // Always present. A match with no account of how its identifier was
    // established is a match a reviewer cannot check, and SPEC.md 1.14 accepts
    // this step on exactly that.
    identifiedBy: component.provenance ?? { method: 'declared', matchedOn: component.purl },
  };
  const kev = mirror.kevIds();
  const declared = new Set(component.declared ?? []);

  const malicious = (mirror.maliciousFor(ecosystem, name) ?? []).map((a) =>
    toHit(a, 'enumerated-version', name, kev, declared),
  );

  const hits: Hit[] = [];
  let indeterminate = 0;
  for (const a of advisories) {
    const r = evaluate(a, ecosystem, name, version);
    if (r.outcome === 'affected') hits.push(toHit(a, r.method as Method, name, kev, declared));
    else if (r.outcome === 'indeterminate') indeterminate += 1;
  }

  if (hits.length > 0) return { status: 'affected', hits, malicious, examined };

  if (indeterminate > 0) {
    return {
      status: 'unknown',
      why: `${name} ${version} has ${indeterminate} advisor${indeterminate === 1 ? 'y' : 'ies'} whose affected versions this cannot evaluate: they are stated as ${ecosystem.startsWith('Debian') ? 'dpkg' : ecosystem} version ranges with no enumerated version list, and ${ecosystem} ordering is not semantic versioning. Reporting this component as clear would be claiming a comparison that did not happen.`,
    };
  }

  return { status: 'clear', examined, malicious };
}

export interface RunResult {
  results: Array<{ component: Component; verdict: Verdict }>;
  sources: SourceStatus[];
  tally: {
    affected: number;
    clear: number;
    unknown: number;
    knownExploited: number;
    malicious: number;
    /**
     * Advisories matched that the document did not declare.
     *
     * This is the number SPEC.md 1.14 is actually about. A file that declares
     * its known vulnerabilities and one that stays silent both produce
     * "advisories found"; only this tells them apart.
     */
    undeclared: number;
  };
}

/**
 * Check every component, and report the source status alongside.
 *
 * The status is taken after the run, not before: a shard that fails to parse
 * is only discovered when something asks for it, and a status read up front
 * would report the failure as healthy.
 */
export function run(mirror: Mirror, components: Component[]): RunResult {
  const results = components.map((component) => ({ component, verdict: check(mirror, component) }));
  const tally = {
    affected: 0, clear: 0, unknown: 0, knownExploited: 0, malicious: 0, undeclared: 0,
  };
  for (const { verdict } of results) {
    tally[verdict.status] += 1;
    if (verdict.status === 'affected') {
      tally.knownExploited += verdict.hits.filter((h) => h.knownExploited).length;
      tally.undeclared += verdict.hits.filter((h) => !h.alreadyDeclared).length;
    }
    if (verdict.status !== 'unknown') tally.malicious += verdict.malicious.length;
  }
  return { results, sources: mirror.status(), tally };
}
