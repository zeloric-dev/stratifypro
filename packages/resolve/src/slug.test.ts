/**
 * Every permanent URL gives back the name it was made from.
 *
 * Doc 6 step 1.13 is "permanent URL per resolution, prerendered and indexable".
 * A URL that comes back as a different name is not a permanent URL for that
 * name, and the first two schemes both failed here without failing anything
 * else: the resolver normalises hyphens and spaces alike, so the ANSWER on the
 * page stayed correct while the heading, the title and the meta description all
 * named something the user never typed.
 *
 * 827 of 1,854 aliases were affected. Nothing caught it because nothing
 * compared the name in to the name out.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolve, type AliasDictionary } from './index.js';
import { addressable, slugPath, slugify, unslug } from './slug.js';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dict = (
  JSON.parse(
    readFileSync(join(ROOT, 'packages', 'rules', 'data', 'alias-dictionary.json'), 'utf8'),
  ) as { entries: AliasDictionary }
).entries;

const ALIASES = Object.keys(dict);

test('the dictionary is loaded, so the sweep below means something', () => {
  assert.ok(ALIASES.length > 1000, `only ${ALIASES.length} aliases loaded`);
});

test('every addressable alias round-trips through its URL', () => {
  const broken: string[] = [];
  for (const name of ALIASES) {
    if (!addressable(name)) continue;
    const back = unslug(slugPath(name));
    if (back !== name.trim().toLowerCase()) broken.push(`${name} -> ${slugify(name)} -> ${back}`);
  }
  assert.deepEqual(broken, [], `${broken.length} aliases do not round-trip`);
});

test('a hyphen survives, which is the defect this file exists for', () => {
  // The old scheme turned every hyphen into a space on the way out.
  for (const name of ['accessors-smart', 'antlr-runtime', 'base-passwd', 'animal-sniffer']) {
    assert.equal(unslug(slugPath(name)), name, `${name} lost its hyphen`);
  }
});

test('a slash stays a slash and becomes path structure, not an escape', () => {
  assert.deepEqual(slugPath('go.uber.org/atomic'), ['go.uber.org', 'atomic']);
  assert.equal(slugify('cloud.google.com/go/storage'), 'cloud.google.com/go/storage');
  assert.equal(unslug(['cloud.google.com', 'go', 'storage']), 'cloud.google.com/go/storage');
  assert.doesNotMatch(slugify('go.uber.org/atomic'), /%2F/i, 'a slash was escaped');
});

test('a name a URL cannot carry is refused rather than published wrong', () => {
  // Every URL handler normalises these away before routing, so the page would
  // answer at an address that is not the one it claims.
  for (const bad of ['./api', '../x', 'a//b', '.', '..', '', '   ']) {
    assert.equal(addressable(bad), false, `${JSON.stringify(bad)} was accepted`);
  }
});

test('the corpus contains exactly one unaddressable alias, and it resolves', () => {
  // Stated so that this number changing is a decision rather than a surprise.
  // `./api` has an answer and cannot have a permanent page, which is the whole
  // reason addressable() is separate from resolving.
  const unaddressable = ALIASES.filter((n) => !addressable(n));
  assert.deepEqual(unaddressable, ['./api']);
  assert.ok(resolve('./api', dict), 'the one excluded alias no longer resolves');
});

test('case is normalised, because the resolver normalises it too', () => {
  assert.equal(slugify('OpenSSL'), 'openssl');
  assert.equal(unslug(slugPath('OpenSSL')), 'openssl');
});

test('a name with a space percent-encodes rather than being mangled', () => {
  // No alias carries a space, but a user can paste one into the box and then
  // share the permanent link.
  const name = 'openssl 1.1.1k.tar.gz';
  assert.equal(slugify(name), 'openssl%201.1.1k.tar.gz');
  assert.equal(unslug(slugPath(name)), name);
  assert.ok(addressable(name));
});

test('every name with an answer either gets an address or is knowingly excluded', () => {
  // The set the sitemap and generateStaticParams are built from. If this ever
  // drops, a page that used to be citable stopped being citable.
  const answered = ALIASES.filter((n) => resolve(n, dict) !== null);
  const indexed = answered.filter(addressable);
  assert.ok(answered.length > 400, `only ${answered.length} aliases resolve`);
  assert.equal(
    answered.length - indexed.length,
    1,
    'the count of answered-but-unaddressable names changed',
  );
});
