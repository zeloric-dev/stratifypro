import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidates, norm, resolve, type AliasDictionary } from './index.js';

const dict: AliasDictionary = {
  'openssl': { purlBase: 'pkg:generic/openssl', observations: 9 },
  'yargs-parser': { purlBase: 'pkg:npm/yargs-parser', observations: 4 },
  'seen-once': { purlBase: 'pkg:npm/seen-once', observations: 1 },
  'left': { purlBase: 'pkg:npm/left', observations: 3 },
  'right': { purlBase: 'pkg:npm/right', observations: 3 },
};

test('an exact hit resolves and says so', () => {
  const r = resolve('openssl', dict);
  assert.equal(r?.purlBase, 'pkg:generic/openssl');
  assert.equal(r?.method, 'exact');
});

test('an input that is already an identifier is returned, version stripped', () => {
  const r = resolve('pkg:npm/lodash@4.17.21', dict);
  assert.equal(r?.purlBase, 'pkg:npm/lodash');
});

test('combined perturbations are reversed', () => {
  // archive + vendor prefix + parenthetical + version, all at once
  for (const input of [
    'libyargs-parser',
    'yargs-parser.jar',
    'yargs parser',
    'yargs-parser (bundled)',
    'yargs-parser 18.1.3',
    'libyargs parser (vendored) 18.1.3.tar.gz',
  ]) {
    const r = resolve(input, dict);
    assert.equal(r?.purlBase, 'pkg:npm/yargs-parser', `failed on ${input}`);
  }
});

test('a single-observation entry is not trusted by default', () => {
  // 76 percent of the real dictionary rests on one observation, and the
  // dictionary's own warning calls it a floor rather than a finished thing.
  assert.equal(resolve('seen-once', dict), null);
  assert.equal(resolve('seen-once', dict, { minObservations: 1 })?.purlBase, 'pkg:npm/seen-once');
});

test('an exact or normalised hit wins without consulting speculative forms', () => {
  // Tiers 1 and 2 are single deterministic lookups on what the author actually
  // wrote. They short-circuit on purpose: ambiguity guarding belongs where we
  // are speculating about shapes, not where the author's own string matched.
  const d: AliasDictionary = {
    'foo bar': { purlBase: 'pkg:npm/exactly-this', observations: 5 },
    'foo': { purlBase: 'pkg:npm/something-else', observations: 5 },
  };
  assert.equal(resolve('foo bar', d)?.method, 'exact');
  assert.equal(resolve('foo bar', d)?.purlBase, 'pkg:npm/exactly-this');
});

test('ambiguity among speculative forms is abstention, never a guess', () => {
  // Tier 3 explores reversed shapes. If two of them hit and disagree, we do not
  // know which the author meant. Picking one would be a guess wearing a method
  // name, and a wrong identifier produces a confident wrong vulnerability
  // verdict. This is the semver case: the real dictionary maps it to nuget on a
  // single observation while the benchmark expects npm, and every baseline
  // answers it wrong rather than abstaining.
  const ambiguous: AliasDictionary = {
    'foo': { purlBase: 'pkg:npm/one', observations: 5 },
    'foo.jar': { purlBase: 'pkg:maven/two', observations: 5 },
  };
  // 'lib-foo' is not present, so tiers 1 and 2 both miss and tier 3 runs.
  assert.equal(resolve('lib Foo.jar', ambiguous), null);
});

test('an unknown name abstains rather than reaching for the nearest thing', () => {
  assert.equal(resolve('completely-unheard-of-component', dict), null);
  assert.equal(resolve('', dict), null);
  assert.equal(resolve('x', dict), null);
});

test('a destroyed module path is correctly unanswerable', () => {
  // github.com/golang/groupcache reduced to "groupcache 8.14.1" cannot be
  // recovered by anything. Abstaining is the right answer, not a failure.
  const goDict: AliasDictionary = {
    'github.com/golang/groupcache': { purlBase: 'pkg:golang/github.com/golang/groupcache', observations: 6 },
  };
  assert.equal(resolve('groupcache 8.14.1', goDict), null);
});

test('norm matches the published baseline definition', () => {
  assert.equal(norm('OpenSSL_1.1.1k.zip'), 'openssl');
  assert.equal(norm('crypto js'), 'crypto-js');
  assert.equal(norm('thing (FIPS)'), 'thing');
});

test('candidates are bounded and nearest first', () => {
  const c = candidates('libFoo (x) 1.2.3.tar.gz');
  assert.ok(c.length <= 64, 'candidate list is unbounded');
  assert.equal(c[0], 'libFoo (x) 1.2.3.tar.gz', 'the input itself should be tried first');
});
