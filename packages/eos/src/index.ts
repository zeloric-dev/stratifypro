/**
 * @stratifypro/eos
 *
 * End-of-support dates, and an honest account of how rarely one is available.
 *
 * FDA asks for a software level of support and an end-of-support date per
 * component. Neither CycloneDX nor SPDX has a field for either, so both rule
 * packs fire on their absence: FDA-SUP-001 and FDA-SUP-002 are the two largest
 * finding groups in the corpus, 1,160 instances each on one file. This package
 * is the part that can sometimes answer them.
 *
 * SOMETIMES IS THE WORD. The only public source, endoflife.date, tracks
 * products: operating systems, runtimes, databases, frameworks. Real bills of
 * material are made of packages. Measured across the corpus with deliberately
 * generous matching, this dataset can speak to 2.5 percent of component
 * instances. That figure is in the data file, recomputed by the check that
 * guards it, and stated on the page that renders it.
 *
 * The 2.5 percent is not evenly distributed, and that is the case for building
 * it at all: what it reaches is OpenSSL, Debian, PostgreSQL, Elasticsearch,
 * Rails. A device running an OpenSSL that passed end of support is a finding a
 * reviewer will raise. A Go module with no end-of-support date is not.
 *
 * Depends on engine types only, never the reverse. The engine must stay fully
 * usable with this package absent, because the free browser checker ships the
 * engine and the rule packs alone.
 */
import data from './data/eos.json' with { type: 'json' };

export const PACKAGE_NAME = '@stratifypro/eos' as const;

/** One release line of one product, as its vendor published it. */
export interface Cycle {
  cycle: string;
  /**
   * The published end-of-support date, or a boolean.
   *
   * `true` means the source says this line is still supported and gives no
   * date. `false` means support has ended and no date was published. Neither is
   * a date, and flattening either into one would invent a fact. Callers must
   * handle all three.
   */
  eol: string | boolean | null;
  lts: boolean;
  latest?: string | null;
}

export interface Product {
  product: string;
  cycles: Cycle[];
  /** The exact URL this row came from. A date with no provenance is a rumour. */
  source: string;
  sourceName: string;
  sourceLicence: string;
  capturedAt: string;
}

export interface Coverage {
  corpusFiles: number;
  distinctNames: number;
  distinctNamesWithData: number;
  componentInstances: number;
  componentInstancesWithData: number;
  method: string;
}

interface Dataset {
  capturedAt: string;
  source: { name: string; repository: string; licence: string };
  coverage: Coverage;
  matches: Record<string, string>;
  products: Product[];
}

const DATA = data as unknown as Dataset;

export function coverage(): Coverage {
  return DATA.coverage;
}

export function attribution(): { name: string; repository: string; licence: string; capturedAt: string } {
  return { ...DATA.source, capturedAt: DATA.capturedAt };
}

export function products(): Product[] {
  return DATA.products;
}

/**
 * What this dataset knows about one component name, if anything.
 *
 * `null` when it knows nothing, which is the answer for roughly 39 components
 * in 40 and is not a failure. The same rule the resolver follows: an honest
 * "I do not know" beats a confident guess, because a wrong end-of-support date
 * on a submission is worse than an acknowledged gap.
 */
export function lookup(componentName: string): Product | null {
  const product = DATA.matches[componentName];
  if (!product) return null;
  return DATA.products.find((p) => p.product === product) ?? null;
}

/** Compare two dotted version strings. Returns negative, zero or positive. */
function compare(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10));
  const pb = b.split('.').map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
    if (x !== y) return x - y;
  }
  return 0;
}

export type SupportState =
  | { known: false; why: string }
  | {
      known: true;
      cycle: string;
      /** Absent when the source says "ended" without publishing a date. */
      endOfSupport?: string;
      pastEndOfSupport: boolean;
      source: string;
      capturedAt: string;
    };

/**
 * Which release line a version belongs to, and whether that line has ended.
 *
 * Matches the longest cycle prefix, so 1.1.1k lands on cycle 1.1.1 rather than
 * on 1.1, and an unparseable version is refused rather than guessed at.
 *
 * `asOf` is a parameter rather than a call to the clock. A function that reads
 * the current date returns a different answer tomorrow, which makes the report
 * built on it unreproducible, and this project pins every input for exactly
 * that reason.
 */
export function supportState(
  componentName: string,
  version: string,
  asOf: string,
): SupportState {
  const p = lookup(componentName);
  if (!p) {
    return {
      known: false,
      why: `No end-of-support data is published for ${componentName}. That is the usual case: the only public source covers products rather than packages, and reaches 2.5 percent of the components in our corpus.`,
    };
  }

  const v = version.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+)*/.test(v)) {
    return { known: false, why: `"${version}" is not a version this can place in a release line.` };
  }

  // A version belongs to a cycle when what follows the cycle is not another
  // digit. `1.1.1k` is in cycle `1.1.1`, because OpenSSL and others suffix a
  // letter; `1.1.10` is NOT, because that is a different release. Requiring a
  // following dot got the first case wrong and dropped OpenSSL entirely, which
  // is the one component every reviewer asks about.
  const inCycle = (version: string, cycle: string): boolean => {
    if (version === cycle) return true;
    if (!version.startsWith(cycle)) return false;
    const next = version.charAt(cycle.length);
    return next === '.' || !/[0-9]/.test(next);
  };

  const candidates = p.cycles
    .filter((c) => inCycle(v, c.cycle))
    .sort((a, b) => b.cycle.length - a.cycle.length);
  const cycle = candidates[0];
  if (!cycle) {
    return {
      known: false,
      why: `${componentName} ${version} does not fall in any release line ${p.sourceName} publishes for ${p.product}.`,
    };
  }

  // `true` means supported with no date given; `false` means ended with no date
  // given. Only a string is a date.
  if (typeof cycle.eol !== 'string') {
    return {
      known: true,
      cycle: cycle.cycle,
      pastEndOfSupport: cycle.eol === false,
      source: p.source,
      capturedAt: p.capturedAt,
    };
  }

  return {
    known: true,
    cycle: cycle.cycle,
    endOfSupport: cycle.eol,
    pastEndOfSupport: compare(cycle.eol.replace(/-/g, '.'), asOf.replace(/-/g, '.')) < 0,
    source: p.source,
    capturedAt: p.capturedAt,
  };
}
