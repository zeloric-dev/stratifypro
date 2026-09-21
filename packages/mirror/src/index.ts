/**
 * @stratifypro/mirror
 *
 * A local advisory index, and the reader that answers from it without touching
 * the network. Depends on engine types only, never the reverse.
 *
 * WHY A MIRROR AT ALL. The alternative is querying an API per component. A
 * corpus file with 1,160 components would make 1,160 outbound calls carrying
 * the contents of a device manufacturer's bill of materials to a third party,
 * one component at a time. For a customer whose submission is confidential
 * before filing, that is the product being unusable, not a performance note.
 * It is also unreproducible: the same file checked twice gives two answers and
 * neither can be defended six months later in front of a reviewer. So the data
 * comes here first, with a date on it, and every query is local.
 *
 * WHY IT IS NOT COMMITTED. Measured: the OSV exports for the five ecosystems
 * the corpus uses are 297 MB raw, and 12.8 MB after dropping the prose and
 * gzipping. Small enough to commit once, far too large to commit weekly, which
 * is the cadence advisories actually move at. So apps/sync builds it into a
 * gitignored directory and the tests here run against a small committed
 * fixture instead.
 *
 * WHY VULNERABILITIES AND MALICIOUS PACKAGES ARE IN SEPARATE FILES. Of the
 * 229,185 advisories in OSV's npm export, 221,756 are MAL- records: reports of
 * malicious packages, largely typosquats. Only 7,429 are vulnerabilities.
 * "Checked against 229,000 npm advisories" would be true and would mislead
 * every reader of it, because a reviewer reading a 524B submission means CVEs.
 * Both are mirrored, because a malicious package inside a medical device is
 * worse news than a CVE, not lesser news. They are kept in separate files so
 * that summing them takes a deliberate act rather than a careless one.
 *
 * NO NETWORK PRIMITIVE APPEARS IN THIS PACKAGE OR IN @stratifypro/vulnmatch.
 * verify.sh asserts that statically and a test asserts it at runtime by making
 * every network entry point throw before a full corpus run.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const PACKAGE_NAME = '@stratifypro/mirror' as const;

export * from './purl.js';
export * as semver from './semver.js';
export { affectedBy } from './ranges.js';
export type { Range, RangeEvent } from './ranges.js';

/** The on-disk layout version. A reader refuses a mirror it does not understand. */
export const SCHEMA = 1;

export interface AffectedPackage {
  name: string;
  ecosystem: string;
  /** Explicit affected versions. Present on 95% of NuGet and 87% of Maven entries. */
  versions?: string[];
  ranges?: import('./ranges.js').Range[];
}

export interface Advisory {
  id: string;
  aliases?: string[];
  summary?: string;
  severity?: Array<{ type: string; score: string }>;
  affected: AffectedPackage[];
  modified?: string;
}

export interface SourceRecord {
  name: string;
  url: string;
  fetchedAt: string;
  /** Of the bytes actually downloaded, so a rebuild can prove it read the same thing. */
  sha256: string;
  ecosystems: string[];
  vulnerabilities: number;
  maliciousPackageReports: number;
}

export interface Manifest {
  schema: number;
  builtAt: string;
  sources: SourceRecord[];
  kev?: { url: string; fetchedAt: string; catalogVersion: string; count: number };
}

/**
 * What one source contributed to this run, reported alongside every result.
 *
 * Doc 6 step 2.2 asks for this per run and the reason is the honest-gap rule:
 * a report that says "no vulnerabilities" while the Debian index failed to
 * load is a lie the reader cannot detect. A result set is only as complete as
 * the sources behind it, so the sources travel with it.
 */
export interface SourceStatus {
  name: string;
  present: boolean;
  fetchedAt: string | null;
  ecosystems: string[];
  vulnerabilities: number;
  maliciousPackageReports: number;
  /** Set when the source is named in the manifest but its file is missing or unreadable. */
  problem?: string;
}

interface EcosystemFile {
  ecosystem: string;
  kind: 'vulnerability' | 'malicious';
  advisories: Record<string, Advisory[]>;
}

/** `Debian:11` is not a filename on every platform this runs on. */
export function ecosystemSlug(ecosystem: string): string {
  return ecosystem.replace(/[^A-Za-z0-9._-]/g, '-');
}

export class Mirror {
  readonly dir: string;
  readonly manifest: Manifest;

  #cache = new Map<string, EcosystemFile | null>();
  #kev: Set<string> | null = null;
  #problems = new Map<string, string>();

  constructor(dir: string, manifest: Manifest) {
    this.dir = dir;
    this.manifest = manifest;
  }

  /** Every ecosystem any source in this mirror claims to cover. */
  ecosystems(): string[] {
    const out = new Set<string>();
    for (const s of this.manifest.sources) for (const e of s.ecosystems) out.add(e);
    return [...out].sort();
  }

  hasEcosystem(ecosystem: string): boolean {
    return this.ecosystems().includes(ecosystem);
  }

  #load(ecosystem: string, kind: 'vulnerability' | 'malicious'): EcosystemFile | null {
    const key = `${kind}:${ecosystem}`;
    if (this.#cache.has(key)) return this.#cache.get(key) ?? null;
    const path = join(
      this.dir,
      kind === 'vulnerability' ? 'advisories' : 'malicious',
      `${ecosystemSlug(ecosystem)}.json`,
    );
    let file: EcosystemFile | null = null;
    if (existsSync(path)) {
      try {
        file = JSON.parse(readFileSync(path, 'utf8')) as EcosystemFile;
      } catch (e) {
        // Recorded rather than thrown. A corrupt shard must degrade this
        // ecosystem to "unknown" in the report, not abort a run over the other
        // four, and must never read as "nothing found".
        this.#problems.set(ecosystem, `${path} could not be read: ${(e as Error).message}`);
      }
    } else if (this.hasEcosystem(ecosystem)) {
      this.#problems.set(ecosystem, `${path} is named in the manifest but is not on disk`);
    }
    this.#cache.set(key, file);
    return file;
  }

  /**
   * Advisories filed against this exact name, or null when the ecosystem is
   * not mirrored at all.
   *
   * The null matters. An empty array means "this snapshot holds no advisory for
   * this package", which is a finding. Null means "this was never looked at",
   * which is an abstention. Collapsing the two is how a scanner reports clean
   * on something it never examined.
   */
  advisoriesFor(ecosystem: string, name: string): Advisory[] | null {
    const f = this.#load(ecosystem, 'vulnerability');
    if (!f) return null;
    return f.advisories[name] ?? [];
  }

  maliciousFor(ecosystem: string, name: string): Advisory[] | null {
    const f = this.#load(ecosystem, 'malicious');
    if (!f) return null;
    return f.advisories[name] ?? [];
  }

  /** Whether a Go module path is a key in the index, which gates prefix matching. */
  isKnownGoModule(name: string): boolean {
    const f = this.#load('Go', 'vulnerability');
    return f !== null && Object.prototype.hasOwnProperty.call(f.advisories, name);
  }

  /**
   * CISA Known Exploited Vulnerabilities, by CVE id. 1,717 entries, 1.7 MB.
   *
   * A MISSING FILE IS RECORDED, NOT SHRUGGED OFF. Returning an empty set
   * quietly turns every `knownExploited` flag false, and that flag is the
   * highest-signal field in the whole report: a reviewer escalates on a
   * known-exploited CVE. Deleting kev.json used to produce a run where no
   * source reported a problem and nothing was flagged as exploited, which is
   * the report being wrong in the one place it is most read.
   */
  kevIds(): Set<string> {
    if (this.#kev) return this.#kev;
    const path = join(this.dir, 'kev.json');
    const out = new Set<string>();
    if (!existsSync(path)) {
      this.#problems.set('kev', `${path} is not on disk, so no component can be marked known-exploited`);
    } else {
      try {
        const d = JSON.parse(readFileSync(path, 'utf8')) as { vulnerabilities?: Array<{ cveID?: string }> };
        for (const v of d.vulnerabilities ?? []) if (v.cveID) out.add(v.cveID);
        if (out.size === 0) {
          this.#problems.set('kev', `${path} parsed but carries no CVE ids`);
        }
      } catch (e) {
        this.#problems.set('kev', `${path} could not be read: ${(e as Error).message}`);
      }
    }
    this.#kev = out;
    return out;
  }

  /**
   * One row per source, for the report.
   *
   * Call this AFTER a run rather than before: a shard that failed to parse is
   * only discovered when something asks for it, and a status taken up front
   * would report the failure as healthy.
   */
  status(): SourceStatus[] {
    // Force the KEV load so its absence is reported rather than inferred from
    // whether anything happened to ask for it during the run.
    const kevCount = this.kevIds().size;
    const kevProblem = this.#problems.get('kev');
    const kev: SourceStatus[] = this.manifest.kev
      ? [
          {
            name: 'CISA KEV',
            present: kevProblem === undefined,
            fetchedAt: this.manifest.kev.fetchedAt,
            ecosystems: [],
            vulnerabilities: kevCount,
            maliciousPackageReports: 0,
            ...(kevProblem ? { problem: kevProblem } : {}),
          },
        ]
      : [];

    return [
      ...kev,
      ...this.manifest.sources.map((s) => {
      const problem = s.ecosystems.map((e) => this.#problems.get(e)).find((p) => p !== undefined);
      return {
        name: s.name,
        present: problem === undefined,
        fetchedAt: s.fetchedAt,
        ecosystems: s.ecosystems,
        vulnerabilities: s.vulnerabilities,
        maliciousPackageReports: s.maliciousPackageReports,
          ...(problem ? { problem } : {}),
        };
      }),
    ];
  }
}

export class MirrorError extends Error {}

/** Open a mirror directory built by apps/sync. Throws when there is nothing to open. */
export function openMirror(dir: string): Mirror {
  const path = join(dir, 'manifest.json');
  if (!existsSync(path)) {
    throw new MirrorError(
      `No advisory mirror at ${dir}. Build one with \`pnpm --filter @stratifypro/sync start\`. ` +
        `It is not committed: the five ecosystems the corpus uses are 297 MB of OSV export, ` +
        `and a file that size rebuilt weekly does not belong in git history.`,
    );
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  } catch (e) {
    throw new MirrorError(`${path} is not readable JSON: ${(e as Error).message}`);
  }
  if (manifest.schema !== SCHEMA) {
    throw new MirrorError(
      `${path} is schema ${manifest.schema}; this reader understands ${SCHEMA}. Rebuild the mirror.`,
    );
  }
  return new Mirror(dir, manifest);
}
