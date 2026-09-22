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
import { mkdtempSync } from 'node:fs';
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
