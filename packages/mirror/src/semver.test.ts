/**
 * The ordering semver.org specifies, walked clause by clause.
 *
 * A comparator is the wrong place to trust intuition. It never throws when it
 * is wrong; it returns a boolean, and that boolean becomes "this device does
 * not ship an affected version" on a regulatory submission. Half the corpus is
 * Go, and 98.8 percent of Go advisories state their affected versions as
 * semver ranges and nothing else, so this file decides the answer for roughly
 * 2,600 components.
 *
 * Clause 11.4 example 2 is the one that catches implementations written from
 * memory: 1.0.0-alpha.1 sits BELOW 1.0.0-alpha.beta, because a numeric
 * identifier always ranks under a non-numeric one. Sorting the identifiers as
 * plain strings gets that backwards and gets almost everything else right,
 * which is why it survives a casual test suite.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparable, compare, parse } from './semver.js';

test('the precedence chain from clause 11.4, in order', () => {
  // Every adjacent pair must be strictly increasing, and the whole chain is
  // the example the specification prints.
  const chain = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
  ];
  for (let i = 0; i + 1 < chain.length; i += 1) {
    const a = chain[i] as string;
    const b = chain[i + 1] as string;
    assert.ok(compare(a, b) < 0, `${a} should precede ${b}`);
    assert.ok(compare(b, a) > 0, `${b} should follow ${a}`);
  }
  // And sorting the shuffled chain must reproduce it exactly.
  const shuffled = [...chain].reverse();
  assert.deepEqual([...shuffled].sort(compare), chain);
});

test('numeric identifiers compare as numbers, not as strings', () => {
  // beta.11 above beta.2 is the whole point; string order says otherwise.
  assert.ok(compare('1.0.0-beta.2', '1.0.0-beta.11') < 0);
  assert.ok(compare('1.0.0-rc.9', '1.0.0-rc.10') < 0);
  assert.ok(compare('1.9.0', '1.10.0') < 0);
  assert.ok(compare('1.0.9', '1.0.10') < 0);
});

test('a numeric identifier ranks below a non-numeric one (clause 11.4.3)', () => {
  assert.ok(compare('1.0.0-alpha.1', '1.0.0-alpha.beta') < 0);
  assert.ok(compare('1.0.0-1', '1.0.0-alpha') < 0);
});

test('more identifiers rank above fewer when all preceding are equal (clause 11.4.4)', () => {
  assert.ok(compare('1.0.0-alpha', '1.0.0-alpha.1') < 0);
  assert.equal(compare('1.0.0-alpha.1', '1.0.0-alpha.1'), 0);
});

test('a release outranks any pre-release of the same triple (clause 11.3)', () => {
  assert.ok(compare('1.0.0-rc.1', '1.0.0') < 0);
  assert.ok(compare('2.0.0', '2.0.0-anything') > 0);
});

test('build metadata is ignored for precedence (clause 10)', () => {
  assert.equal(compare('1.0.0+build.1', '1.0.0+build.999'), 0);
  assert.equal(compare('1.0.0', '1.0.0+20130313144700'), 0);
  assert.ok(compare('1.0.0-alpha+x', '1.0.0+y') < 0);
});

test('the leading v that Go module versions carry is accepted', () => {
  // OSV states Go ranges without it and the SBOM states versions with it, so
  // a comparator that rejected one of the two spellings would abstain on
  // every Go component in the corpus.
  assert.equal(compare('v1.2.3', '1.2.3'), 0);
  assert.ok(compare('v1.2.3', 'v1.2.4') < 0);
});

test('an unparseable version is refused rather than guessed at', () => {
  // Every one of these appears in real bills of material. None of them has a
  // defensible semver ordering, and inventing one produces a confident wrong
  // verdict instead of an abstention.
  for (const bad of ['1.2', '1', 'latest', '', '2021-03-04', '1.2.3.4', 'v1.2.x', '1.0.0-']) {
    assert.equal(parse(bad), null, `${bad} should not parse`);
    assert.throws(() => compare(bad, '1.0.0'), `${bad} should refuse to compare`);
    assert.equal(comparable(bad, '1.0.0'), false);
  }
});

test('Go pseudo-versions order by their timestamp component', () => {
  // v0.0.0-20210101... is how Go names an untagged commit, and the corpus is
  // full of them. They are valid semver pre-releases and must order sensibly.
  const a = 'v0.0.0-20210101000000-abcdefabcdef';
  const b = 'v0.0.0-20220101000000-abcdefabcdef';
  assert.ok(compare(a, b) < 0);
  assert.ok(compare(a, 'v0.1.0') < 0);
});
