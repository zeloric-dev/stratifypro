/**
 * The join between a bill of materials and an advisory database.
 *
 * Every failure here is silent. A purl mapped to the wrong ecosystem string
 * finds no advisories and the component is reported clean, which looks exactly
 * like a component that was checked and is fine. So the mapping is tested
 * against the spellings that actually appear in the corpus, and every refusal
 * is tested for being a refusal rather than a wrong answer.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goModuleCandidates, purlToKey } from './purl.js';

function key(purl: string) {
  const m = purlToKey(purl);
  assert.ok(m.mapped, `expected ${purl} to map: ${m.mapped ? '' : m.why}`);
  return m.key;
}

function refusal(purl: string) {
  const m = purlToKey(purl);
  assert.equal(m.mapped, false, `expected ${purl} to be refused`);
  return (m as { mapped: false; why: string }).why;
}

test('golang purls map to the Go ecosystem, qualifiers and all', () => {
  // ?type=package and ?type=module both appear in the corpus, along with 1,873
  // golang purls carrying no type qualifier at all.
  assert.deepEqual(key('pkg:golang/filippo.io/age@v1.0.0?type=module'), {
    ecosystem: 'Go',
    name: 'filippo.io/age',
    version: 'v1.0.0',
  });
  assert.deepEqual(key('pkg:golang/filippo.io/age/armor@v1.0.0?type=package'), {
    ecosystem: 'Go',
    name: 'filippo.io/age/armor',
    version: 'v1.0.0',
  });
  assert.equal(key('pkg:golang/github.com/gogo/protobuf@v1.3.2').name, 'github.com/gogo/protobuf');
});

test('maven purls become the group:artifact key OSV files them under', () => {
  // OSV uses one string, not two fields, and the group is dot-separated while
  // the purl separates it with slashes.
  assert.deepEqual(key('pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1'), {
    ecosystem: 'Maven',
    name: 'org.apache.logging.log4j:log4j-core',
    version: '2.17.1',
  });
  assert.equal(key('pkg:maven/com.google.guava/guava@19.0').name, 'com.google.guava:guava');
});

test('a maven purl with no group is refused, not half-mapped', () => {
  assert.match(refusal('pkg:maven/log4j-core@2.17.1'), /no Maven group/);
});

test('scoped npm packages keep their @scope/name spelling', () => {
  assert.deepEqual(key('pkg:npm/lodash@4.17.21'), {
    ecosystem: 'npm',
    name: 'lodash',
    version: '4.17.21',
  });
  assert.equal(key('pkg:npm/%40babel/traverse@7.0.0').name, '@babel/traverse');
  assert.equal(key('pkg:npm/@babel/traverse@7.0.0').name, '@babel/traverse');
});

test('debian purls carry the release, because OSV files Debian per release', () => {
  // openssl in Debian:11 is a different record from openssl in Debian:12.
  assert.deepEqual(key('pkg:deb/debian/openssl@1.1.1n?distro=debian-11'), {
    ecosystem: 'Debian:11',
    name: 'openssl',
    version: '1.1.1n',
  });
  assert.equal(key('pkg:deb/debian/curl@7.74.0?distro=debian-11.2').ecosystem, 'Debian:11');
  assert.equal(key('pkg:deb/debian/curl@7.74.0?distro=bullseye').ecosystem, 'Debian:11');
});

test('a debian purl with no release abstains instead of guessing one', () => {
  // Guessing the current stable would answer a question about a device that
  // is running something else.
  assert.match(refusal('pkg:deb/debian/openssl@1.1.1n'), /files Debian advisories per release/);
});

test('an ecosystem the mirror does not hold is refused by name', () => {
  // The reader has to be able to tell "not checked" from "checked and clean",
  // so the refusal names the ecosystem and what is actually covered.
  assert.match(refusal('pkg:cargo/serde@1.0.0'), /pkg:cargo is not an ecosystem this mirror holds/);
  assert.match(refusal('pkg:gem/rails@7.0.0'), /pkg:gem/);
});

test('versions and qualifiers are separated correctly', () => {
  assert.equal(key('pkg:nuget/Newtonsoft.Json@13.0.1').version, '13.0.1');
  assert.equal(key('pkg:nuget/Newtonsoft.Json').version, null, 'no version is null, not empty string');
  // A version containing a slash-free @ must not be confused by a subpath.
  assert.equal(key('pkg:golang/example.com/x@v1.0.0#sub/dir').version, 'v1.0.0');
});

test('nonsense is refused rather than parsed into something', () => {
  assert.match(refusal('not-a-purl'), /not a package URL/);
  assert.match(refusal('pkg:'), /not a package URL/);
  assert.match(refusal('pkg:npm'), /not a package URL/);
});

test('Go module candidates walk back one segment at a time and stop at two', () => {
  // The floor matters: without it a package path reduces to `github.com`,
  // and any advisory filed there would match everything on GitHub.
  assert.deepEqual(goModuleCandidates('filippo.io/age/internal/format'), [
    'filippo.io/age/internal/format',
    'filippo.io/age/internal',
    'filippo.io/age',
  ]);
  assert.deepEqual(goModuleCandidates('github.com/a/b'), ['github.com/a/b', 'github.com/a']);
  assert.deepEqual(goModuleCandidates('single'), []);
});
