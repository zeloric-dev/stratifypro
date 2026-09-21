/**
 * The examples the public page ships with, checked against the real dictionary.
 *
 * Doc 4 D5: the sample that decides the eight-second verdict must be named and
 * snapshot-tested, because that one unassigned choice decides what a stranger
 * concludes about the product. My first attempt used names taken from this
 * package's own unit fixtures; none of them existed in the shipped dictionary,
 * so the first paint was an abstention and the tool looked broken.
 *
 * This test lives here rather than in apps/web because the web app has no test
 * runner and the thing being asserted is a property of the resolver and the
 * dictionary, not of React.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolve, type AliasDictionary } from './index.js';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dict = (
  JSON.parse(
    readFileSync(join(ROOT, 'packages', 'rules', 'data', 'alias-dictionary.json'), 'utf8'),
  ) as { entries: AliasDictionary }
).entries;

const FIRST_PAINT = 'openssl 1.1.1k.tar.gz';

const EXAMPLES: { input: string; expect: 'resolves' | 'abstains'; method?: string }[] = [
  { input: 'openssl 1.1.1k.tar.gz', expect: 'resolves', method: 'dictionary' },
  { input: 'libgomodules.xyz/jsonpatch/v2', expect: 'resolves', method: 'heuristic' },
  { input: 'pkg:npm/lodash@4.17.21', expect: 'resolves', method: 'exact' },
  { input: 'mbedtls (custom build)', expect: 'abstains' },
];

test('the first-paint example resolves against the shipped dictionary', () => {
  const r = resolve(FIRST_PAINT, dict);
  assert.ok(r, 'the first screen would show an abstention and look broken');
  assert.match(r.purlBase, /^pkg:/);
});

for (const ex of EXAMPLES) {
  test(`example "${ex.input}" ${ex.expect}`, () => {
    const r = resolve(ex.input, dict);
    if (ex.expect === 'abstains') {
      assert.equal(r, null, 'this example is meant to demonstrate abstention');
      return;
    }
    assert.ok(r, 'example no longer resolves');
    if (ex.method) assert.equal(r.method, ex.method, 'resolved by a different method than advertised');
  });
}

test('the examples demonstrate more than one method, and one honest abstention', () => {
  const methods = new Set<string>();
  let abstentions = 0;
  for (const ex of EXAMPLES) {
    const r = resolve(ex.input, dict);
    if (r) methods.add(r.method);
    else abstentions += 1;
  }
  assert.ok(methods.size >= 3, `only ${methods.size} distinct methods shown`);
  assert.equal(abstentions, 1, 'exactly one example should show "I do not know"');
});
