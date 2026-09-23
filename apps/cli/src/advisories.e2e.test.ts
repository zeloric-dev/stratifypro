/**
 * The advisories command, exercised the way a user reaches it.
 *
 * SPEC.md 1.14 accepts on "given a corpus file, returns advisories the file
 * did not declare. Every match carries its resolution provenance and
 * confidence." The unit tests in packages/vulnmatch prove the matcher does
 * that. They do not prove a person can get to it, and that distinction has
 * already cost this repository once: severityOverrides was defined in the
 * spec, honoured by the engine, rendered by the report, and had no flag. The
 * feature existed everywhere except where someone could use it.
 *
 * `packages/mirror` and `packages/vulnmatch` were in exactly that state when
 * these tests were written: 254 tests green, and nothing a person could run.
 *
 * So this spawns the built binary against the committed fixture mirror.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const HERE = import.meta.dirname;
const CLI = resolve(HERE, 'index.js');
const ROOT = resolve(HERE, '..', '..', '..');
const MIRROR = join(ROOT, 'packages', 'mirror', 'src', 'fixtures', 'mini');
const DOC = join(ROOT, 'fixtures', 'corpus', 'spdx__lab-syft.json');
const SMALL = join(ROOT, 'fixtures', 'corpus', 'cyclonedx__ascii-boxes-sbom-cdx.json');

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

test('advisories reports matches against a real document', () => {
  const r = run(['advisories', DOC, '--mirror', MIRROR]);
  assert.match(r.stdout, /affected, \d+ clear, \d+ not examined/);
  assert.match(r.stdout, /advisor(y|ies) the file did not declare/);
  // Exit 1 on findings, the same contract `check` uses, so CI can gate on it.
  assert.equal(r.status, 1, 'a document with advisories exits nonzero');
});

test('every affected component says how its identifier was established', () => {
  // SPEC 1.14's "resolution provenance and confidence". A match a reviewer
  // cannot trace back to an identifier is a match they cannot check.
  const r = run(['advisories', DOC, '--mirror', MIRROR]);
  const blocks = r.stdout.split('\n').filter((l) => l.includes('identified by:'));
  assert.ok(blocks.length > 0, 'no component reported its provenance');
  for (const b of blocks) assert.match(b, /identified by: \w+/);
});

test('the source status is printed every time, healthy or not', () => {
  // A result set is only as complete as the sources behind it. "No advisories
  // found" against a mirror whose shard failed to load is true and useless.
  const r = run(['advisories', SMALL, '--mirror', MIRROR]);
  assert.match(r.stdout, /Sources, and when each was captured:/);
  assert.match(r.stdout, /CISA KEV/);
  // Every row carries a capture date: a mirror is a snapshot and the reader
  // needs to know which one.
  for (const line of r.stdout.split('\n').filter((l) => /^\s{4}(ok|PROBLEM)\s/.test(l))) {
    assert.match(line, /\d{4}-\d{2}-\d{2}|no date/, `source row has no date: ${line}`);
  }
});

test('components that were not examined are counted, not silently dropped', () => {
  // The whole point of the third answer. A component with no purl must appear
  // in the arithmetic rather than vanishing into the clear column.
  const r = run(['advisories', SMALL, '--mirror', MIRROR]);
  const m = /(\d+) affected, (\d+) clear, (\d+) not examined, of (\d+) components/.exec(r.stdout);
  assert.ok(m, 'no tally line');
  const [, a, c, u, total] = m.map(Number) as [number, number, number, number, number];
  assert.equal(a + c + u, total, 'the three answers must account for every component');
});

test('json output carries the full result, including the source status', () => {
  const r = run(['advisories', DOC, '--mirror', MIRROR, '--format', 'json']);
  const parsed = JSON.parse(r.stdout) as {
    tally: { affected: number; undeclared: number };
    sources: Array<{ name: string; fetchedAt: string | null }>;
    results: Array<{ verdict: { status: string; why?: string } }>;
  };
  assert.ok(parsed.sources.length > 0);
  assert.ok(parsed.results.length > 0);
  // The reason each abstention happened is in the JSON, which is what the text
  // output points the reader at.
  const unknown = parsed.results.find((x) => x.verdict.status === 'unknown');
  assert.ok(unknown?.verdict.why, 'an abstention must carry its reason');
});

test('a missing mirror explains how to build one instead of reporting nothing found', () => {
  // The dangerous failure: no mirror, zero advisories, exit 0, and a reader
  // who concludes the file is clean.
  const empty = mkdtempSync(join(tmpdir(), 'nomirror-'));
  const r = run(['advisories', DOC, '--mirror', empty]);
  assert.notEqual(r.status, 0, 'a missing mirror must not look like a clean result');
  assert.match(r.stderr, /No advisory mirror/);
  assert.match(r.stderr, /pnpm --filter @stratifypro\/sync start/);
});

test('a declared advisory drops out of the undeclared count, through the real command', () => {
  // The whole of SPEC 1.14's "advisories the file did not declare", end to
  // end: document on disk, real binary, real mirror. Every other test of this
  // feature passes `declared: [...]` straight into the matcher and never
  // exercises the code that reads a `vulnerabilities` array, and no corpus
  // file declares anything, so without this the declaring half of that
  // sentence is untested outside unit tests of the walker.
  //
  // The declaration here is a CVE and the advisory it silences is a GHSA. A
  // supplier who declared the CVE has declared the GHSA that aliases it, and
  // matching only on the primary id would accuse them of an omission they did
  // not make.
  const dir = mkdtempSync(join(tmpdir(), 'declared-'));
  const component = {
    type: 'library',
    'bom-ref': 'l4j',
    name: 'log4j-core',
    version: '2.17.1',
    purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1',
  };
  const base = { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1, components: [component] };

  const silent = join(dir, 'silent.json');
  const declaring = join(dir, 'declaring.json');
  writeFileSync(silent, JSON.stringify(base));

  const first = JSON.parse(
    run(['advisories', silent, '--mirror', MIRROR, '--format', 'json']).stdout,
  ) as { tally: { undeclared: number; affected: number }; results: Array<{ verdict: { hits?: Array<{ id: string; aliases: string[] }> } }> };
  assert.ok(first.tally.undeclared > 0, 'nothing to declare, so nothing to test');

  // Declare ONE of them, by an alias rather than by its id.
  const hit = first.results[0]?.verdict.hits?.find((h) => h.aliases.length > 0);
  assert.ok(hit, 'no advisory with an alias to declare');
  writeFileSync(
    declaring,
    JSON.stringify({
      ...base,
      vulnerabilities: [{ id: hit.aliases[0], affects: [{ ref: 'l4j' }] }],
    }),
  );

  const second = JSON.parse(
    run(['advisories', declaring, '--mirror', MIRROR, '--format', 'json']).stdout,
  ) as { tally: { undeclared: number; affected: number } };

  assert.equal(
    second.tally.undeclared,
    first.tally.undeclared - 1,
    'declaring one advisory by its alias must remove exactly one from the undeclared count',
  );
  assert.equal(second.tally.affected, first.tally.affected, 'the component is still affected');
});

test('an unknown format is refused by name', () => {
  const r = run(['advisories', DOC, '--mirror', MIRROR, '--format', 'yaml']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Unknown format "yaml"/);
});

test('the command appears in help, once', () => {
  const r = run(['help']);
  const mentions = r.stdout.split('\n').filter((l) => l.includes('advisories <file>'));
  assert.equal(mentions.length, 1, 'help should list the command exactly once');
});
