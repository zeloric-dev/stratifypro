/**
 * Range evaluation, with the third answer tested as hard as the other two.
 *
 * `affectedBy` returns true, false, or null, and null is the one that carries
 * the project's posture: a range it cannot evaluate must never become a false.
 * False means "this version was compared and is not affected" and ends up in
 * front of a reviewer as a clean component. Null becomes a stated abstention.
 * Most of this file is about the boundary between those two.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affectedBy, type Range } from './ranges.js';

const semver = (events: Array<Record<string, string>>): Range => ({ type: 'SEMVER', events });

test('introduced and fixed bound a half-open window', () => {
  const r = semver([{ introduced: '1.0.0' }, { fixed: '1.5.0' }]);
  assert.equal(affectedBy('0.9.0', r), false);
  assert.equal(affectedBy('1.0.0', r), true, 'the introduced version is itself affected');
  assert.equal(affectedBy('1.4.9', r), true);
  assert.equal(affectedBy('1.5.0', r), false, 'the fixed version is not affected');
  assert.equal(affectedBy('2.0.0', r), false);
});

test('introduced: 0 means from the beginning', () => {
  // "0" is a sentinel, not a version: it does not parse as semver, and an
  // implementation that tries to parse it abstains on every advisory that
  // uses it, which is most of them.
  const r = semver([{ introduced: '0' }, { fixed: '2.0.0' }]);
  assert.equal(affectedBy('0.0.1', r), true);
  assert.equal(affectedBy('1.99.99', r), true);
  assert.equal(affectedBy('2.0.0', r), false);
});

test('last_affected includes its own version, unlike fixed', () => {
  const r = semver([{ introduced: '1.0.0' }, { last_affected: '1.5.0' }]);
  assert.equal(affectedBy('1.5.0', r), true, 'last_affected is affected');
  assert.equal(affectedBy('1.5.1', r), false);
});

test('several windows in one range are each honoured', () => {
  // The common shape for a vulnerability patched on two maintained branches.
  const r = semver([
    { introduced: '1.0.0' },
    { fixed: '1.2.0' },
    { introduced: '2.0.0' },
    { fixed: '2.1.0' },
  ]);
  assert.equal(affectedBy('1.1.0', r), true);
  assert.equal(affectedBy('1.2.0', r), false);
  assert.equal(affectedBy('1.9.0', r), false, 'the gap between windows is not affected');
  assert.equal(affectedBy('2.0.5', r), true);
  assert.equal(affectedBy('2.1.0', r), false);
});

test('events are sorted before they are walked', () => {
  // Real advisories do not always list events in order, and walking them as
  // given turns a fixed version into an affected one.
  const scrambled = semver([
    { fixed: '2.1.0' },
    { introduced: '1.0.0' },
    { fixed: '1.2.0' },
    { introduced: '2.0.0' },
  ]);
  assert.equal(affectedBy('1.1.0', scrambled), true);
  assert.equal(affectedBy('1.5.0', scrambled), false);
  assert.equal(affectedBy('2.0.5', scrambled), true);
  assert.equal(affectedBy('2.1.0', scrambled), false);
});

test('introduced and fixed at the same version is an empty window', () => {
  const r = semver([{ introduced: '1.0.0' }, { fixed: '1.0.0' }]);
  assert.equal(affectedBy('1.0.0', r), false);
});

test('a pre-release sits below the release it precedes', () => {
  const r = semver([{ introduced: '1.0.0' }, { fixed: '2.0.0' }]);
  assert.equal(affectedBy('2.0.0-rc.1', r), true, '2.0.0-rc.1 is before the fix');
  assert.equal(affectedBy('1.0.0-rc.1', r), false, 'and before the introduction');
});

test('a non-SEMVER range is never evaluated, it abstains', () => {
  // Maven, NuGet and dpkg each order versions by their own algorithm. dpkg
  // alone has epochs and a tilde that sorts BELOW the empty string, so
  // 1.0~rc1 precedes 1.0. Treating any of them as near enough to semver is
  // how a scanner reports a vulnerable Debian package as clean.
  for (const type of ['ECOSYSTEM', 'GIT', 'DEBIAN', '']) {
    const r: Range = { type, events: [{ introduced: '0' }, { fixed: '1.0.0' }] };
    assert.equal(affectedBy('0.5.0', r), null, `${type} must abstain`);
  }
});

test('an unparseable version abstains instead of returning false', () => {
  const r = semver([{ introduced: '0' }, { fixed: '2.0.0' }]);
  for (const bad of ['1.2', 'latest', '', '2021.03.04.1']) {
    assert.equal(affectedBy(bad, r), null, `${bad} must abstain`);
  }
});

test('an unparseable BOUND abstains for the whole range', () => {
  // The tempting shortcut is to skip the event that will not parse. Skipping
  // a `fixed` leaves a patched version inside the window and reports it as
  // vulnerable; skipping an `introduced` does the reverse. Neither is a
  // result worth printing, so the whole range abstains.
  assert.equal(affectedBy('1.5.0', semver([{ introduced: '0' }, { fixed: 'nonsense' }])), null);
  assert.equal(affectedBy('1.5.0', semver([{ introduced: '1.x' }, { fixed: '2.0.0' }])), null);
});

test('an unknown event kind abstains rather than being ignored', () => {
  // `limit` exists today and the schema will gain more. An evaluator that
  // ignores what it does not recognise is one that confidently answers using
  // half the advisory.
  const r: Range = { type: 'SEMVER', events: [{ introduced: '1.0.0' }, { limit: '2.0.0' }] };
  assert.equal(affectedBy('1.5.0', r), null);
});

test('an empty event list abstains', () => {
  assert.equal(affectedBy('1.0.0', semver([])), null);
});

test('REGRESSION: a range that never opens a window abstains rather than returning false', () => {
  // Every OSV range starts with an `introduced` event. One that does not is
  // malformed, and the walk returns a confident `false` for it: nothing opens
  // the window, so nothing is affected at any version. In the report that
  // reads as "compared and clean" for an advisory this never understood.
  assert.equal(affectedBy('1.0.0', semver([{ fixed: '2.0.0' }])), null);
  assert.equal(affectedBy('3.0.0', semver([{ fixed: '2.0.0' }])), null);
  assert.equal(affectedBy('1.0.0', semver([{ last_affected: '2.0.0' }])), null);
});
