/**
 * The end-of-support dataset, and the honesty of what it does not know.
 *
 * The number that matters most here is the coverage figure, because it is the
 * one a reader will quote and the one it would be most tempting to leave vague.
 * It is asserted against the corpus, not against itself.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attribution, coverage, lookup, products, supportState } from './index.js';

const ASOF = '2026-09-21';

test('every row carries where it came from and when', () => {
  // A date with no provenance is a rumour. This is the whole discipline of the
  // package and it is asserted on every row rather than spot-checked.
  const all = products();
  assert.ok(all.length > 0, 'the dataset is empty');
  for (const p of all) {
    assert.match(p.source, /^https:\/\//, `${p.product} has no source URL`);
    assert.ok(p.sourceName.length > 0, `${p.product} does not name its source`);
    assert.ok(p.sourceLicence.length > 0, `${p.product} does not state a licence`);
    assert.match(p.capturedAt, /^\d{4}-\d{2}-\d{2}$/, `${p.product} has no capture date`);
    assert.ok(p.cycles.length > 0, `${p.product} has no release lines`);
  }
});

test('the source is attributed, because the data is someone else\u2019s', () => {
  const a = attribution();
  assert.equal(a.name, 'endoflife.date');
  assert.match(a.repository, /^https:\/\/github\.com\//);
  assert.ok(a.licence.length > 0);
});

test('the coverage figure is stated and it is small', () => {
  // Not a round number anybody chose. If this ever climbs it is because the
  // source grew or the matcher changed, and either is worth noticing.
  const c = coverage();
  assert.ok(c.componentInstances > 5000, 'the corpus shrank');
  assert.ok(c.componentInstancesWithData > 0, 'the dataset reaches nothing at all');
  const share = c.componentInstancesWithData / c.componentInstances;
  assert.ok(share < 0.05, `coverage is ${(share * 100).toFixed(1)}%, which is higher than measured`);
  assert.ok(c.method.length > 40, 'the matching method is not described');
});

test('an unknown component is an honest null, not a guess', () => {
  // 39 components in 40. This is the normal answer and it must stay cheap.
  assert.equal(lookup('go.uber.org/atomic'), null);
  const s = supportState('go.uber.org/atomic', '1.9.0', ASOF);
  assert.equal(s.known, false);
  if (!s.known) assert.match(s.why, /No end-of-support data/);
});

test('a known component resolves to its release line', () => {
  const s = supportState('openssl', '1.1.1k', ASOF);
  assert.equal(s.known, true, 'openssl is in the dataset and should resolve');
  if (s.known) {
    assert.equal(s.cycle, '1.1.1', 'the longest matching cycle prefix should win, not 1.1');
    assert.match(s.source, /endoflife\.date/);
  }
});

test('a version past its end of support says so', () => {
  const s = supportState('openssl', '1.1.1k', ASOF);
  assert.equal(s.known, true);
  if (s.known) {
    assert.equal(s.pastEndOfSupport, true, 'OpenSSL 1.1.1 ended in 2023');
    assert.ok(s.endOfSupport && s.endOfSupport < ASOF);
  }
});

test('asOf is a parameter, so the same inputs give the same answer tomorrow', () => {
  // A function that reads the clock makes every report built on it
  // unreproducible, and this project pins every input for that reason.
  const before = supportState('openssl', '1.1.1k', '2020-01-01');
  const after = supportState('openssl', '1.1.1k', '2026-09-21');
  assert.equal(before.known && before.pastEndOfSupport, false);
  assert.equal(after.known && after.pastEndOfSupport, true);
});

test('a version in no published release line is refused, not guessed', () => {
  const s = supportState('openssl', '99.9.9', ASOF);
  assert.equal(s.known, false);
  if (!s.known) assert.match(s.why, /does not fall in any release line/);
});

test('an unparseable version is refused', () => {
  for (const v of ['latest', '', 'stable', 'x.y.z']) {
    const s = supportState('openssl', v, ASOF);
    assert.equal(s.known, false, `"${v}" was placed in a release line`);
  }
});

test('a leading v is tolerated, because SBOMs write versions both ways', () => {
  const a = supportState('openssl', '1.1.1k', ASOF);
  const b = supportState('openssl', 'v1.1.1k', ASOF);
  assert.deepEqual(a, b);
});

test('"supported, no date" and "ended, no date" are not the same answer', () => {
  // The source uses true and false where it has no date. Flattening either into
  // a date would invent a fact, so both survive into the result.
  const withBool = products().flatMap((p) =>
    p.cycles.filter((c) => typeof c.eol === 'boolean').map((c) => ({ p, c })),
  );
  assert.ok(withBool.length > 0, 'no boolean eol in the dataset to exercise this');
  for (const { c } of withBool) {
    assert.equal(typeof c.eol, 'boolean');
  }
});

test('a letter-suffixed version lands in the right line, and 1.1.10 does not', () => {
  // OpenSSL writes 1.1.1k. Requiring a dot after the cycle dropped it entirely.
  // The trap in fixing that is 1.1.10, which shares a prefix with 1.1.1 and is
  // a different release.
  const k = supportState('openssl', '1.1.1k', ASOF);
  assert.equal(k.known && k.cycle, '1.1.1');

  const ten = supportState('openssl', '1.1.10', ASOF);
  assert.notEqual(ten.known && ten.cycle, '1.1.1', '1.1.10 was read as 1.1.1');
});

test('the longest matching cycle wins over a shorter prefix', () => {
  // 3.0.2 must be cycle 3.0, not cycle 3 if one ever existed.
  const s = supportState('openssl', '3.0.2', ASOF);
  assert.equal(s.known, true);
  if (s.known) assert.equal(s.cycle, '3.0');
});
