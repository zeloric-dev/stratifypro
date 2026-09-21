/**
 * The override path, exercised the way a user reaches it: a real file, the
 * real binary, a real corpus document.
 *
 * The unit tests in packages/engine prove the engine records overrides. They
 * do not prove a person can get one in, and for most of this project's life
 * they could not: SPEC.md defined severityOverrides, the engine honoured it,
 * the report had a table for it, and there was no flag. The feature existed
 * everywhere except where someone could use it.
 *
 * So this spawns the built CLI rather than importing anything.
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
const DOC = join(ROOT, 'fixtures', 'corpus', 'cyclonedx__ascii-boxes-sbom-cdx.json');

const REASON =
  'This device predates the 2026 guidance and the field is supplied out of band in the submission letter.';

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

/**
 * A document that actually fails FDA-STAT-001 and FDA-STAT-002: CycloneDX with
 * no components at all, so both fire at severity error.
 *
 * The corpus file above is a clean, well-formed SBOM. An override aimed at a
 * rule that finds nothing in it is inert by design, so these tests would have
 * been asserting against a rule that had nothing to change.
 */
const BAD = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'sp-bad-'));
  const p = join(dir, 'bad.json');
  writeFileSync(p, JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5' }));
  return p;
})();

function overridesFile(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'sp-ov-'));
  const p = join(dir, 'overrides.json');
  writeFileSync(p, JSON.stringify(body, null, 2));
  return p;
}

test('an override supplied on the command line reaches the result', () => {
  const file = overridesFile({
    overrides: [{ ruleId: 'FDA-STAT-001', to: 'warning', reason: REASON }],
  });
  const r = run(['check', BAD, '--pack', 'fda-524b', '--overrides', file, '--format', 'json']);
  assert.notEqual(r.status, 70, `internal error: ${r.stderr}`);

  const result = JSON.parse(r.stdout) as {
    overrides: { ruleId: string; from: string; to: string; reason: string }[];
    inertOverrides: { ruleId: string }[];
  };

  // Asserted unconditionally. This used to accept the override landing in
  // EITHER list, behind an `if`, so a regression that made applying fail
  // entirely and everything fall through to inert would still have passed.
  const applied = result.overrides.find((o) => o.ruleId === 'FDA-STAT-001');
  assert.ok(applied, 'the override did not apply; it must not be silently inert here');
  assert.equal(applied.to, 'warning');
  assert.equal(applied.reason, REASON, 'the reason must survive into the machine-readable result');
  assert.equal(applied.from, 'error', 'the engine, not the caller, supplies the severity it came from');
});

test('the text output names the override rather than applying it quietly', () => {
  const file = overridesFile({
    overrides: [{ ruleId: 'FDA-STAT-001', to: 'warning', reason: REASON }],
  });
  const r = run(['check', BAD, '--pack', 'fda-524b', '--overrides', file]);
  // Scoped to the override summary. FDA-STAT-001 appears in the findings
  // section of stdout whether or not any override was applied, so matching the
  // whole document proved nothing.
  const start = r.stdout.indexOf('severity override(s) applied');
  assert.notEqual(start, -1, 'no override summary block in stdout');
  const block = r.stdout.slice(start, r.stdout.indexOf('\n\n', start));
  assert.match(block, /FDA-STAT-001/, 'the summary does not name the affected rule');
  assert.match(block, /error -> warning/, 'the summary does not show the change');
});

test('a reason too short is refused, with a stable code, and nothing is checked', () => {
  const file = overridesFile({ overrides: [{ ruleId: 'FDA-STAT-001', to: 'info', reason: 'nope' }] });
  const r = run(['check', DOC, '--pack', 'fda-524b', '--overrides', file]);
  assert.equal(r.status, 3, 'a refused override must not exit 0 or 1');
  assert.match(r.stderr, /SP-OVERRIDE-004/);
  assert.equal(r.stdout.trim(), '', 'a partial check is worse than none');
});

test('a mistyped rule id is refused rather than silently doing nothing', () => {
  const file = overridesFile({ overrides: [{ ruleId: 'FDA-STAT-999', to: 'info', reason: REASON }] });
  const r = run(['check', DOC, '--pack', 'fda-524b', '--overrides', file]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /SP-OVERRIDE-001/);
});

test('a malformed overrides file says what shape it wanted', () => {
  const file = overridesFile({ notOverrides: [] });
  const r = run(['check', DOC, '--pack', 'fda-524b', '--overrides', file]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /SP-OVERRIDE-005/);
  assert.match(r.stderr, /overrides/);
});

test('an overrides file that is not there is a readable error, not a stack trace', () => {
  const r = run(['check', DOC, '--pack', 'fda-524b', '--overrides', join(tmpdir(), 'sp-absent.json')]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /SP-OVERRIDE-000/);
  assert.doesNotMatch(r.stderr, /at Object\.|at Module\./, 'a stack trace leaked to the user');
});

test('without --overrides nothing changes', () => {
  const r = run(['check', DOC, '--pack', 'fda-524b', '--format', 'json']);
  const result = JSON.parse(r.stdout) as { overrides: unknown[]; inertOverrides: unknown[] };
  assert.equal(result.overrides.length, 0);
  assert.equal(result.inertOverrides.length, 0);
});

// ---------------------------------------------------------------------------
// The exit code is the whole output in CI. Nobody reads stdout on a green
// build, so an override that turns a red gate green has to say so on stderr,
// next to the existing banner for a gate that can never fail.
//
// Found by review, not by design: the inert-gate banner read pack.rules
// directly, so overriding every error rule down to warning produced a gate
// that could never fail with the banner still silent. Measured at the time:
// --fail-on error exited 1 on this document, and 0 with the overrides, with
// nothing on stderr either way.
// ---------------------------------------------------------------------------

const DOWNGRADE_ALL = {
  overrides: [
    { ruleId: 'FDA-STAT-001', to: 'warning', reason: REASON },
    { ruleId: 'FDA-STAT-002', to: 'warning', reason: REASON },
  ],
};

test('the document used by these tests really does fail at --fail-on error', () => {
  // Without this, every assertion below would pass on a document that was
  // never going to fail, and the tests would prove nothing.
  const r = run(['check', BAD, '--pack', 'fda-524b', '--fail-on', 'error']);
  assert.equal(r.status, 1, 'the fixture stopped producing error findings');
  assert.equal(r.stderr.trim(), '', 'no banner is expected on a gate that works');
});

test('an override that turns the gate green says so on stderr', () => {
  const file = overridesFile(DOWNGRADE_ALL);
  const r = run(['check', BAD, '--pack', 'fda-524b', '--fail-on', 'error', '--overrides', file]);
  assert.equal(r.status, 0, 'the override is supposed to change the exit code');
  assert.match(r.stderr, /exits 0 because of a severity override/);
  assert.match(r.stderr, /2 finding/, 'the number moved below the threshold is not stated');
});

test('a gate made unfailable by overrides raises the inert-gate banner', () => {
  const file = overridesFile(DOWNGRADE_ALL);
  const r = run(['check', BAD, '--pack', 'fda-524b', '--fail-on', 'error', '--overrides', file]);
  assert.match(r.stderr, /can never report a failure/);
  assert.match(
    r.stderr,
    /overrides file moved every one/,
    'the banner blames the pack rather than naming the override as the cause',
  );
});

test('neither banner fires while the gate can still fail', () => {
  // Same overrides, lower threshold: the findings are warnings now and
  // --fail-on warning still catches them. Nothing is being hidden, so nothing
  // should be announced. A banner that fires when it should not gets muted.
  const file = overridesFile(DOWNGRADE_ALL);
  const r = run(['check', BAD, '--pack', 'fda-524b', '--fail-on', 'warning', '--overrides', file]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Read 2 override/, 'the file that was read must still be stated');
  assert.doesNotMatch(r.stderr, /can never report a failure/, `unexpected banner: ${r.stderr}`);
  assert.doesNotMatch(r.stderr, /exits 0 because/, `unexpected banner: ${r.stderr}`);
});

test('overriding only some of the rules at the threshold leaves the gate alone', () => {
  const file = overridesFile({
    overrides: [{ ruleId: 'FDA-STAT-001', to: 'warning', reason: REASON }],
  });
  const r = run(['check', BAD, '--pack', 'fda-524b', '--fail-on', 'error', '--overrides', file]);
  assert.equal(r.status, 1, 'FDA-STAT-002 is still an error and should still fail the build');
  assert.doesNotMatch(r.stderr, /can never report a failure/, 'the gate can still fail');
});

// ---------------------------------------------------------------------------
// An overrides file that yields nothing. Before this, supplying one produced
// output byte-identical to not supplying one: an empty array, a stale path in
// CI, a shell that word-split the argument, or a hand-merged file with a
// duplicate top-level "overrides" key (JSON.parse keeps the last) all read
// successfully and then vanished. That is this feature's own headline failure
// happening one level above the feature.
// ---------------------------------------------------------------------------

test('an empty overrides file still says it was read', () => {
  const file = overridesFile({ overrides: [] });
  const r = run(['check', BAD, '--pack', 'fda-524b', '--overrides', file]);
  assert.match(r.stderr, /Read 0 override\(s\)/, 'an empty file left no trace at all');
  assert.match(r.stderr, /overrides\.json/, 'the file that was read is not named');
});

test('a duplicate top-level key that silently empties the file is still reported', () => {
  // JSON.parse keeps the last occurrence. A hand-merged file can have two.
  const dir = mkdtempSync(join(tmpdir(), 'sp-dup-'));
  const p = join(dir, 'overrides.json');
  writeFileSync(
    p,
    `{"overrides":[{"ruleId":"FDA-STAT-001","to":"warning","reason":${JSON.stringify(REASON)}}],"overrides":[]}`,
  );
  const r = run(['check', BAD, '--pack', 'fda-524b', '--overrides', p]);
  assert.match(r.stderr, /Read 0 override\(s\)/, 'the user would believe an override was applied');
});

test('the machine-readable result records the overrides file and its hash', () => {
  const file = overridesFile({ overrides: [] });
  const r = run(['check', BAD, '--pack', 'fda-524b', '--overrides', file, '--format', 'json']);
  const result = JSON.parse(r.stdout) as {
    overridesSource?: { path: string; sha256: string; requested: number };
  };
  assert.ok(result.overridesSource, 'the result does not say an overrides file was involved');
  assert.equal(result.overridesSource.requested, 0);
  assert.match(result.overridesSource.sha256, /^[0-9a-f]{64}$/);
});

test('no overrides file means no overridesSource, not an empty one', () => {
  const r = run(['check', BAD, '--pack', 'fda-524b', '--format', 'json']);
  const result = JSON.parse(r.stdout) as { overridesSource?: unknown };
  assert.equal(result.overridesSource, undefined);
});

test('a value-taking flag given no value is refused, not read as a filename', () => {
  // --overrides used to collapse to the string "true" and then be opened as a
  // file, producing a tidy error naming a file the user never typed.
  const r = run(['check', BAD, '--pack', 'fda-524b', '--overrides']);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /SP-ARG-002/);
  assert.doesNotMatch(r.stderr, /overrides file true/, 'it still invented a filename');
});

test('a flag followed by another flag does not swallow it', () => {
  // `--overrides --format json` used to set overrides="true" and drop --format
  // entirely, silently ignoring an argument the user did type.
  const r = run(['check', BAD, '--pack', 'fda-524b', '--overrides', '--format', 'json']);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /SP-ARG-002/);
});

test('a finding moved by an override carries the severity it came from in JSON', () => {
  const file = overridesFile({
    overrides: [{ ruleId: 'FDA-STAT-001', to: 'info', reason: REASON }],
  });
  const r = run(['check', BAD, '--pack', 'fda-524b', '--overrides', file, '--format', 'json']);
  const result = JSON.parse(r.stdout) as {
    findings: { ruleId: string; severity: string; overriddenFrom?: string }[];
  };
  const moved = result.findings.find((f) => f.ruleId === 'FDA-STAT-001');
  assert.ok(moved, 'the rule stopped firing');
  assert.equal(moved.severity, 'info');
  assert.equal(moved.overriddenFrom, 'error', 'a per-finding renderer has no way to know');
  const untouched = result.findings.find((f) => f.ruleId !== 'FDA-STAT-001');
  assert.equal(untouched?.overriddenFrom, undefined, 'the marker leaked onto an untouched finding');
});
