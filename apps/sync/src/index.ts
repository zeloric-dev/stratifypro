/**
 * @stratifypro/sync
 *
 * Builds the local advisory mirror. THE ONLY CODE IN THIS REPOSITORY THAT
 * TOUCHES THE NETWORK, and the separation is the point rather than a tidiness
 * preference: @stratifypro/mirror and @stratifypro/vulnmatch answer questions
 * about a customer's bill of materials, and a bill of materials before filing
 * is confidential. Keeping every outbound call in a separate app that a
 * customer runs deliberately, on data that is public either way, is what makes
 * "your components are never sent anywhere" a structural claim instead of a
 * promise.
 *
 *     pnpm --filter @stratifypro/sync start            build into ./.mirror
 *     pnpm --filter @stratifypro/sync start -- --out D put it somewhere else
 *
 * WHAT IT WRITES, AND WHY THE SHAPE. Measured from the real exports:
 *
 *   ecosystem   raw export   compacted   gzipped   corpus instances
 *   npm            205.4 MB    57.9 MB     5.0 MB   1,145
 *   Debian          67.9 MB   135.4 MB     4.5 MB     200
 *   Go              11.2 MB     4.7 MB     0.9 MB   2,605
 *   Maven            9.8 MB    10.8 MB     2.1 MB     603
 *   NuGet            2.4 MB     6.4 MB     0.4 MB     262
 *
 * Most of the raw size is prose: an OSV advisory carries a markdown `details`
 * body that no matching decision reads. Dropping it and keeping only what the
 * matcher touches is what turns 297 MB into something a laptop rebuilds in a
 * couple of minutes.
 *
 * AN ADVISORY IS INDEXED UNDER ITS OWN ECOSYSTEM, NOT THE FILE IT CAME IN.
 * OSV files a multi-ecosystem advisory in every affected ecosystem's export,
 * so Go/all.zip contains crates.io, npm and PyPI records. Indexing by source
 * file would let a Go lookup return an npm advisory, which is a confident
 * wrong answer of exactly the kind the rest of this project refuses.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ecosystemSlug, SCHEMA, type Advisory, type Manifest, type SourceRecord } from '@stratifypro/mirror';
import { readZip } from '@stratifypro/zip';

export const APP_NAME = '@stratifypro/sync' as const;

const OSV = 'https://osv-vulnerabilities.storage.googleapis.com';
const KEV = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

/** The exports to fetch. Chosen from the corpus: these five are 94.6% of it. */
export const EXPORTS = ['npm', 'Go', 'Maven', 'NuGet', 'Debian'] as const;

/**
 * Ecosystems to keep once parsed.
 *
 * Debian is per release, so this is a predicate rather than a list: OSV
 * publishes Debian:10 through Debian:14 today and will add releases without
 * asking.
 */
function keep(ecosystem: string): boolean {
  return (
    ecosystem === 'npm' ||
    ecosystem === 'Go' ||
    ecosystem === 'Maven' ||
    ecosystem === 'NuGet' ||
    ecosystem.startsWith('Debian:')
  );
}

interface RawAdvisory {
  id: string;
  aliases?: string[];
  summary?: string;
  severity?: Array<{ type: string; score: string }>;
  modified?: string;
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    versions?: string[];
    ranges?: Array<{ type: string; events: Array<Record<string, string>> }>;
  }>;
}

/** Keep only the fields a matching decision reads. Everything else is prose. */
function compact(a: RawAdvisory): Advisory | null {
  const affected = (a.affected ?? [])
    .map((af) => ({
      name: af.package?.name ?? '',
      ecosystem: af.package?.ecosystem ?? '',
      ...(af.versions && af.versions.length > 0 ? { versions: af.versions } : {}),
      ...(af.ranges && af.ranges.length > 0 ? { ranges: af.ranges } : {}),
    }))
    .filter((af) => af.name !== '' && keep(af.ecosystem));
  if (affected.length === 0) return null;
  return {
    id: a.id,
    ...(a.aliases && a.aliases.length > 0 ? { aliases: a.aliases } : {}),
    ...(a.summary ? { summary: a.summary } : {}),
    ...(a.severity && a.severity.length > 0 ? { severity: a.severity } : {}),
    affected,
    ...(a.modified ? { modified: a.modified } : {}),
  };
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'stratifypro-sync' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

type Index = Map<string, Map<string, Advisory[]>>;

function insert(index: Index, ecosystem: string, name: string, advisory: Advisory, seen: Set<string>): void {
  // An advisory reaches this twice when two exports both carry it. Dedupe on
  // the pair, not on the id: the same advisory legitimately lands under
  // several package names.
  const dedupe = `${ecosystem}\u0000${name}\u0000${advisory.id}`;
  if (seen.has(dedupe)) return;
  seen.add(dedupe);
  let eco = index.get(ecosystem);
  if (!eco) {
    eco = new Map();
    index.set(ecosystem, eco);
  }
  const list = eco.get(name);
  if (list) list.push(advisory);
  else eco.set(name, [advisory]);
}

export interface BuildOptions {
  out: string;
  log?: (line: string) => void;
  /**
   * How bytes are obtained. Defaults to the network.
   *
   * A seam, not a loophole. It exists so the indexing can be tested against
   * real exports already on disk rather than against a hand-made fixture that
   * agrees with whatever the code does. The default is the only thing shipped,
   * and nothing outside this app passes an override.
   */
  fetchBytes?: (url: string) => Promise<Buffer>;
}

export async function build(options: BuildOptions): Promise<Manifest> {
  const log = options.log ?? ((l: string) => process.stdout.write(`${l}\n`));
  const get = options.fetchBytes ?? fetchBytes;
  const today = new Date().toISOString().slice(0, 10);

  const vulnerabilities: Index = new Map();
  const malicious: Index = new Map();
  const seenVuln = new Set<string>();
  const seenMal = new Set<string>();
  const sources: SourceRecord[] = [];

  for (const eco of EXPORTS) {
    const url = `${OSV}/${eco}/all.zip`;
    log(`  fetching ${url}`);
    const bytes = await get(url);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const entries = readZip(bytes);

    let nVuln = 0;
    let nMal = 0;
    const touched = new Set<string>();
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      const raw = JSON.parse(entry.read().toString('utf8')) as RawAdvisory;
      const adv = compact(raw);
      if (!adv) continue;
      const isMalicious = adv.id.startsWith('MAL-');
      if (isMalicious) nMal += 1;
      else nVuln += 1;
      for (const af of adv.affected) {
        touched.add(af.ecosystem);
        insert(
          isMalicious ? malicious : vulnerabilities,
          af.ecosystem,
          af.name,
          adv,
          isMalicious ? seenMal : seenVuln,
        );
      }
    }

    log(
      `    ${entries.length} entries, ${nVuln} vulnerabilities, ${nMal} malicious-package reports, ` +
        `${(bytes.length / 1e6).toFixed(1)} MB`,
    );
    sources.push({
      name: `OSV ${eco}`,
      url,
      fetchedAt: today,
      sha256,
      ecosystems: [...touched].sort(),
      vulnerabilities: nVuln,
      maliciousPackageReports: nMal,
    });
  }

  log(`  fetching ${KEV}`);
  const kevBytes = await get(KEV);
  const kev = JSON.parse(kevBytes.toString('utf8')) as {
    catalogVersion?: string;
    vulnerabilities?: unknown[];
  };

  // Every ecosystem gets BOTH shards, even when one of them is empty.
  //
  // Debian has 67,952 vulnerabilities and zero malicious-package reports, so
  // the first build wrote no malicious/Debian-11.json, and the reader reported
  // the whole Debian source as absent: it cannot tell "this ecosystem has none
  // of that kind" from "this file failed to write". Writing the empty shard
  // makes a missing file unambiguously a fault, which is the only way the
  // source status is worth reading.
  const everywhere = new Set<string>();
  for (const s of sources) for (const e of s.ecosystems) everywhere.add(e);
  for (const e of everywhere) {
    if (!vulnerabilities.has(e)) vulnerabilities.set(e, new Map());
    if (!malicious.has(e)) malicious.set(e, new Map());
  }

  // Written fresh. A stale shard left behind from a previous build is a source
  // the manifest does not name and the reader would still happily answer from.
  rmSync(options.out, { recursive: true, force: true });
  mkdirSync(join(options.out, 'advisories'), { recursive: true });
  mkdirSync(join(options.out, 'malicious'), { recursive: true });

  const write = (kind: 'advisories' | 'malicious', index: Index): void => {
    for (const [ecosystem, byName] of index) {
      writeFileSync(
        join(options.out, kind, `${ecosystemSlug(ecosystem)}.json`),
        JSON.stringify({
          ecosystem,
          kind: kind === 'advisories' ? 'vulnerability' : 'malicious',
          advisories: Object.fromEntries(byName),
        }),
      );
    }
  };
  write('advisories', vulnerabilities);
  write('malicious', malicious);
  writeFileSync(join(options.out, 'kev.json'), kevBytes);

  const manifest: Manifest = {
    schema: SCHEMA,
    builtAt: new Date().toISOString(),
    sources,
    kev: {
      url: KEV,
      fetchedAt: today,
      catalogVersion: kev.catalogVersion ?? 'unknown',
      count: (kev.vulnerabilities ?? []).length,
    },
  };
  writeFileSync(join(options.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  log('');
  log(`  wrote ${options.out}`);
  for (const [ecosystem, byName] of vulnerabilities) {
    log(`    ${ecosystem.padEnd(12)} ${String(byName.size).padStart(7)} packages with an advisory`);
  }
  log(`    CISA KEV     ${String(manifest.kev?.count ?? 0).padStart(7)} known exploited vulnerabilities`);
  return manifest;
}
