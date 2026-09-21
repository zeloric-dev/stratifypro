/**
 * The coverage port, checked against the published baseline.
 *
 * coverage.ts is a port of scripts/coverage.py, and the whole value of the
 * number it produces is that it agrees with docs/coverage-baseline.json, which
 * is what docs/coverage-baseline.md publishes. Two implementations of one
 * definition drift silently, so this compares per file rather than trusting the
 * port to be careful.
 *
 * The baseline document records what happens without this. The 13 September run
 * came from a script that was never committed, so its counting rules could not
 * be recovered; when they were rewritten, two of ten figures moved, one of them
 * by a factor of three. Operating rule 8: take the number from the thing that
 * runs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { coverage } from './coverage.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));

interface Baseline {
  summary: { n: number; purl: number; cpe: number };
  perFile: { file: string; n: number; purl: number; cpe: number }[];
}

const baseline = readJson(join(ROOT, 'docs', 'coverage-baseline.json')) as Baseline;

assert.ok(baseline.perFile.length > 0, 'the baseline is empty, so this test proves nothing');

let comparedFiles = 0;
for (const row of baseline.perFile) {
  test(`coverage reproduces the baseline for ${row.file}`, () => {
    const doc = readJson(join(ROOT, 'fixtures', 'corpus', row.file));
    const c = coverage(doc);
    assert.equal(c.total, row.n, 'component count differs from scripts/coverage.py');
    assert.equal(c.purl, row.purl, 'purl count differs from scripts/coverage.py');
    assert.equal(c.cpe, row.cpe, 'cpe count differs from scripts/coverage.py');
    comparedFiles += 1;
  });
}

test('the coverage differential actually compared something', () => {
  assert.equal(comparedFiles, baseline.perFile.length);
});

test('the corpus totals reproduce too', () => {
  let n = 0;
  let purl = 0;
  let cpe = 0;
  for (const row of baseline.perFile) {
    const c = coverage(readJson(join(ROOT, 'fixtures', 'corpus', row.file)));
    n += c.total;
    purl += c.purl;
    cpe += c.cpe;
  }
  assert.equal(n, baseline.summary.n);
  assert.equal(purl, baseline.summary.purl);
  assert.equal(cpe, baseline.summary.cpe);
});

// ---------------------------------------------------------------------------
// The rules the corpus does not happen to exercise. A differential against real
// files proves the port agrees on those files; it does not prove it agrees on a
// case none of them contain.
// ---------------------------------------------------------------------------

test('NOASSERTION is not an identifier', () => {
  // The single most common way an SBOM tool overstates coverage. SPDX producers
  // emit NOASSERTION by the thousand and a non-empty check reads every one as
  // an answer: one corpus file carries 4,140 of them.
  const doc = {
    spdxVersion: 'SPDX-2.3',
    packages: [
      { name: 'a', externalRefs: [{ referenceType: 'purl', referenceLocator: 'NOASSERTION' }] },
      { name: 'b', externalRefs: [{ referenceType: 'purl', referenceLocator: 'pkg:npm/x@1' }] },
    ],
  };
  const c = coverage(doc);
  assert.equal(c.total, 2);
  assert.equal(c.identified, 1, 'NOASSERTION was counted as an identifier');
  assert.equal(c.purl, 1);
});

test('NONE and whitespace are not identifiers either', () => {
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [{ name: 'a', purl: 'NONE' }, { name: 'b', purl: '   ' }, { name: 'c', purl: '' }],
  };
  assert.equal(coverage(doc).identified, 0);
});

test('nested CycloneDX components are counted, not just the top level', () => {
  // Container and application SBOMs put most of their entries in sub-components.
  // A top-level count would report a 400-component image as having 3.
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [
      {
        name: 'app',
        purl: 'pkg:npm/app@1',
        components: [
          { name: 'dep', purl: 'pkg:npm/dep@1' },
          { name: 'deep', components: [{ name: 'deeper', purl: 'pkg:npm/deeper@1' }] },
        ],
      },
    ],
  };
  const c = coverage(doc);
  assert.equal(c.total, 4, 'nested components were not walked');
  assert.equal(c.identified, 3);
});

test('a cpe alone counts as identified', () => {
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [{ name: 'a', cpe: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*' }],
  };
  assert.equal(coverage(doc).identified, 1);
  assert.equal(coverage(doc).purl, 0);
});

test('both cpe22Type and cpe23Type count on the SPDX side', () => {
  const doc = {
    spdxVersion: 'SPDX-2.3',
    packages: [
      { name: 'a', externalRefs: [{ referenceType: 'cpe22Type', referenceLocator: 'cpe:/a:v:p' }] },
      { name: 'b', externalRefs: [{ referenceType: 'cpe23Type', referenceLocator: 'cpe:2.3:a:v:p' }] },
    ],
  };
  assert.equal(coverage(doc).cpe, 2);
});

test('a component with both a purl and a cpe is one identified component', () => {
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [{ name: 'a', purl: 'pkg:npm/a@1', cpe: 'cpe:2.3:a:v:p:1:*:*:*:*:*:*:*' }],
  };
  const c = coverage(doc);
  assert.equal(c.identified, 1, 'double counted');
  assert.equal(c.purl, 1);
  assert.equal(c.cpe, 1);
});

test('a document that is not an object does not throw', () => {
  for (const bad of [null, 'text', 42, []] as unknown[]) {
    assert.deepEqual(coverage(bad), { total: 0, topLevel: 0, identified: 0, purl: 0, cpe: 0 });
  }
});

// ---------------------------------------------------------------------------
// The cases the corpus does not contain, found by adversarial review of the
// merged commit. Each one is an input where this port disagreed with
// scripts/coverage.py, or where the number it produced was true but misleading.
// ---------------------------------------------------------------------------

test('a CycloneDX document that also carries a packages key is CycloneDX', () => {
  // The branch order was inverted relative to coverage.py, which tests
  // `"components" in doc or doc.get("bomFormat")` FIRST. With `packages` first,
  // this file counted as SPDX.
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    packages: [],
    components: [
      { name: 'a', purl: 'pkg:npm/a@1' },
      { name: 'b', purl: 'pkg:npm/b@1' },
    ],
  };
  const c = coverage(doc);
  assert.equal(c.total, 2, 'the file was read as SPDX and its components vanished');
  assert.equal(c.identified, 2);
});

test('an empty packages key does not make a CycloneDX file look empty', () => {
  // The worst shape of the bug above: cover.total === 0 makes the worker tell
  // the user "This file parsed, but it lists no components" about a file that
  // lists two, and nothing is checked.
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    packages: [],
    components: [{ name: 'a', purl: 'pkg:npm/a@1' }],
  };
  assert.notEqual(coverage(doc).total, 0, 'the user would be told the file is empty');
});

test('a components key that is not an array does not throw', () => {
  // `[...(doc.components ?? [])]` threw a TypeError on an object, which the
  // worker reports as "Something in the checker broke" for a parseable file.
  for (const bad of [{ a: 1 }, 5, 'abc', true] as unknown[]) {
    const doc = { bomFormat: 'CycloneDX', specVersion: '1.5', components: bad };
    assert.doesNotThrow(() => coverage(doc), `components: ${JSON.stringify(bad)} threw`);
    assert.equal(coverage(doc).total, 0);
  }
});

test('a nested components key that is not an array does not throw', () => {
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [{ name: 'a', purl: 'pkg:npm/a@1', components: { nope: true } }],
  };
  assert.doesNotThrow(() => coverage(doc));
  assert.equal(coverage(doc).total, 1);
});

test('topLevel separates what the rules can reach from what the file lists', () => {
  // Every per-component selector in both packs is $.components[*], and the
  // JSONPath subset has no descendant operator, so nested components are
  // counted and examined by nothing. A renderer printing total beside a finding
  // count implies all of them were checked.
  const kids = Array.from({ length: 1000 }, (_, i) => ({ name: `child-${i}` }));
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [{ name: 'app', purl: 'pkg:npm/app@1', components: kids }],
  };
  const c = coverage(doc);
  assert.equal(c.total, 1001);
  assert.equal(c.topLevel, 1, 'the rules can only reach the top level');
});

test('SPDX packages do not nest, so topLevel equals total', () => {
  const doc = {
    spdxVersion: 'SPDX-2.3',
    packages: [{ name: 'a' }, { name: 'b' }],
  };
  const c = coverage(doc);
  assert.equal(c.total, 2);
  assert.equal(c.topLevel, 2);
});
