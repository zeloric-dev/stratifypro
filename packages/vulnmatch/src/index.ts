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

/** How a version was compared. Reported per hit so the reasoning is visible. */
export type Method = 'enumerated-version' | 'semver-range';

export interface Hit {
  id: string;
  aliases: string[];
  summary?: string;
  /** True when a CVE in this advisory's aliases is on the CISA KEV catalog. */
  knownExploited: boolean;
  method: Method;
  /** The OSV key that matched. Differs from the component when a Go prefix answered. */
  matchedName: string;
}

export interface Examined {
  ecosystem: string;
  name: string;
  version: string;
  /** Set when a Go package path was answered by its parent module. */
  viaGoModule?: string;
}

export type Verdict =
  | { status: 'affected'; hits: Hit[]; malicious: Hit[]; examined: Examined }
  | { status: 'clear'; examined: Examined; malicious: Hit[] }
  | { status: 'unknown'; why: string };

export interface Component {
  name: string;
  version: string | null;
  purl: string | null;
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

    // An enumerated list is authoritative when present: OSV publishes it as
    // the complete set of affected versions, so absence from it is a real
    // negative rather than a failure to find.
    if (af.versions && af.versions.length > 0) {
      sawEvaluable = true;
      if (af.versions.includes(version)) return { outcome: 'affected', method: 'enumerated-version' };
      continue;
    }

    if (af.ranges && af.ranges.length > 0) {
      for (const r of af.ranges) {
        const hit = affectedBy(version, r);
        if (hit === null) sawIndeterminate = true;
        else {
          sawEvaluable = true;
          if (hit) return { outcome: 'affected', method: 'semver-range' };
        }
      }
      continue;
    }

    // An affected entry with neither versions nor ranges names the package and
    // says nothing about which versions. It cannot clear anything.
    sawIndeterminate = true;
  }

  if (sawIndeterminate && !sawEvaluable) return { outcome: 'indeterminate' };
  if (!sawEvaluable) return { outcome: 'indeterminate' };
  return { outcome: sawIndeterminate ? 'indeterminate' : 'clear' };
}

function toHit(a: Advisory, method: Method, matchedName: string, kev: Set<string>): Hit {
  const aliases = a.aliases ?? [];
  return {
    id: a.id,
    aliases,
    ...(a.summary ? { summary: a.summary } : {}),
    knownExploited: [a.id, ...aliases].some((x) => kev.has(x)),
    method,
    matchedName,
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

  const examined: Examined = { ecosystem, name, version, ...(viaGoModule ? { viaGoModule } : {}) };
  const kev = mirror.kevIds();

  const malicious = (mirror.maliciousFor(ecosystem, name) ?? []).map((a) =>
    toHit(a, 'enumerated-version', name, kev),
  );

  const hits: Hit[] = [];
  let indeterminate = 0;
  for (const a of advisories) {
    const r = evaluate(a, ecosystem, name, version);
    if (r.outcome === 'affected') hits.push(toHit(a, r.method as Method, name, kev));
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
  tally: { affected: number; clear: number; unknown: number; knownExploited: number; malicious: number };
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
  const tally = { affected: 0, clear: 0, unknown: 0, knownExploited: 0, malicious: 0 };
  for (const { verdict } of results) {
    tally[verdict.status] += 1;
    if (verdict.status === 'affected') {
      tally.knownExploited += verdict.hits.filter((h) => h.knownExploited).length;
    }
    if (verdict.status !== 'unknown') tally.malicious += verdict.malicious.length;
  }
  return { results, sources: mirror.status(), tally };
}
