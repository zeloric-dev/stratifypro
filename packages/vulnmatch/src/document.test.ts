/**
 * The document walker, which shipped with no tests at all.
 *
 * Caught in review of its own pull request. `componentsFrom` is 110 lines with
 * the fiddliest logic in that change, and every test that exercised the
 * feature it feeds bypassed it: the matcher tests pass `declared: [...]`
 * straight into `check()`, so the code that reads a document's
 * `vulnerabilities` array had never run outside a build.
 *
 * It had also never run against a document that declares anything, because
 * NOT ONE of the 21 corpus files carries a `vulnerabilities` array. The corpus
 * cannot cover this path, which is exactly why it needs written cases: SPEC.md
 * 1.14 accepts on "advisories the file did not declare", and the half of that
 * sentence about declaring was resting on code nothing executed.
 *
 * The walk itself turned out to be correct. That is not the point. A correct
 * implementation nobody checks is one edit away from an incorrect one nobody
 * checks.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { coverage } from '@stratifypro/engine';
import { componentsFrom } from './document.js';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORPUS = join(ROOT, 'fixtures', 'corpus');

test('a vulnerability naming one component marks only that component', () => {
  const [a, b] = componentsFrom({
    bomFormat: 'CycloneDX',
    components: [
      { name: 'log4j-core', version: '2.14.0', 'bom-ref': 'a' },
      { name: 'guava', version: '19.0', 'bom-ref': 'b' },
    ],
    vulnerabilities: [{ id: 'CVE-2021-44228', affects: [{ ref: 'a' }] }],
  });
  assert.deepEqual(a?.declared, ['CVE-2021-44228']);
  assert.equal(b?.declared, undefined, 'an unaffected component must not inherit the declaration');
});

test('a vulnerability with no affects is declared about the whole document', () => {
  // A supplier who writes "we know about CVE-X" without a bom-ref has still
  // said it. Holding them to a reference they did not write would turn a
  // disclosure into an omission.
  const cs = componentsFrom({
    bomFormat: 'CycloneDX',
    components: [
      { name: 'x', version: '1.0.0', 'bom-ref': 'a' },
      { name: 'y', version: '1.0.0', 'bom-ref': 'b' },
    ],
    vulnerabilities: [{ id: 'CVE-9999-1' }],
  });
  for (const c of cs) assert.deepEqual(c.declared, ['CVE-9999-1']);
});

test('aliases in references are declared too', () => {
  // Declaring the GHSA declares the CVE it aliases. The matcher compares
  // against both, so both have to arrive here.
  const [c] = componentsFrom({
    bomFormat: 'CycloneDX',
    components: [{ name: 'x', version: '1.0.0', 'bom-ref': 'a' }],
    vulnerabilities: [
      { id: 'GHSA-aaaa', affects: [{ ref: 'a' }], references: [{ id: 'CVE-2021-1' }] },
    ],
  });
  assert.deepEqual(c?.declared, ['GHSA-aaaa', 'CVE-2021-1']);
});

test('nested components are walked, and keep their own declarations', () => {
  // A component nested inside another is as much a part of the device as its
  // parent, and a walk that stops at the top level silently checks less.
  const cs = componentsFrom({
    bomFormat: 'CycloneDX',
    components: [
      {
        name: 'parent',
        version: '1.0.0',
        'bom-ref': 'p',
        components: [{ name: 'child', version: '2.0.0', 'bom-ref': 'c' }],
      },
    ],
    vulnerabilities: [{ id: 'CVE-1', affects: [{ ref: 'c' }] }],
  });
  assert.deepEqual(
    cs.map((c) => c.name),
    ['parent', 'child'],
  );
  assert.equal(cs.find((c) => c.name === 'parent')?.declared, undefined);
  assert.deepEqual(cs.find((c) => c.name === 'child')?.declared, ['CVE-1']);
});

test('SPDX packages are read, with the purl out of externalRefs', () => {
  const [c] = componentsFrom({
    spdxVersion: 'SPDX-2.3',
    packages: [
      {
        name: 'openssl',
        versionInfo: '1.1.1k',
        SPDXID: 'SPDXRef-1',
        externalRefs: [
          { referenceType: 'cpe23Type', referenceLocator: 'cpe:2.3:a:openssl:openssl:1.1.1k' },
          { referenceType: 'purl', referenceLocator: 'pkg:generic/openssl@1.1.1k' },
        ],
      },
    ],
    vulnerabilities: [{ id: 'CVE-2022-1', affects: [{ ref: 'SPDXRef-1' }] }],
  });
  assert.equal(c?.purl, 'pkg:generic/openssl@1.1.1k', 'the purl ref, not the first ref');
  assert.equal(c?.version, '1.1.1k');
  assert.deepEqual(c?.declared, ['CVE-2022-1']);
});

test('a CycloneDX document with an empty component list is not read as SPDX', () => {
  // The branch order, which has been wrong here before. A CycloneDX file
  // carrying an empty `packages` key was once counted as SPDX and the user was
  // told it listed no components, which is false about the file. This is the
  // same trap facing the other way.
  const cs = componentsFrom({
    bomFormat: 'CycloneDX',
    components: [],
    packages: [{ name: 'should-not-appear', versionInfo: '1.0' }],
  });
  assert.deepEqual(cs, [], 'a CycloneDX document has no SPDX packages to read');
});

test('a missing version is null rather than an empty string', () => {
  // `null` becomes a stated abstention downstream: "affected" is a claim about
  // a version and there is none. An empty string would look like a version.
  const [c] = componentsFrom({
    bomFormat: 'CycloneDX',
    components: [{ name: 'libdosemath' }],
  });
  assert.equal(c?.version, null);
  assert.equal(c?.purl, null);
});

test('nonsense in, empty out, rather than a throw', () => {
  for (const junk of [null, undefined, 42, 'a string', [], {}]) {
    assert.deepEqual(componentsFrom(junk), [], `${JSON.stringify(junk)} should walk to nothing`);
  }
});

test('this walk agrees with the engine on every corpus file', () => {
  // Two independent walks over the same documents: this one, and the engine's
  // coverage counter. They exist separately because they answer different
  // questions, and that is exactly how they drift. 5,088 components across 21
  // files; a disagreement means one of the two is miscounting a real document.
  let checked = 0;
  for (const fn of readdirSync(CORPUS).sort()) {
    if (!fn.endsWith('.json') || fn === 'provenance.json') continue;
    const doc = JSON.parse(readFileSync(join(CORPUS, fn), 'utf8')) as unknown;
    assert.equal(
      componentsFrom(doc).length,
      coverage(doc).total,
      `${fn}: the two component walks disagree`,
    );
    checked += 1;
  }
  assert.ok(checked > 15, `expected the whole corpus, walked ${checked}`);
});

test('not one corpus file declares a vulnerability, which is why the cases above are written', () => {
  // The finding published in docs/corpus-results.md, pinned here so that it
  // stays true or stops being claimed. If a corpus file ever does declare one,
  // this fails and the document that states "0 of 21" has to be regenerated.
  let declaring = 0;
  for (const fn of readdirSync(CORPUS).sort()) {
    if (!fn.endsWith('.json') || fn === 'provenance.json') continue;
    const doc = JSON.parse(readFileSync(join(CORPUS, fn), 'utf8')) as unknown;
    if (componentsFrom(doc).some((c) => c.declared)) declaring += 1;
  }
  assert.equal(declaring, 0, 'a corpus file now declares a vulnerability; regenerate corpus-results.md');
});
