/**
 * SPDX 3.0 reads as the same document as SPDX 2.3. SPEC step 1.2.
 *
 * THE EQUIVALENCE TEST IS THE ONE THAT MATTERS. Everything else here checks a
 * mapping in isolation, and a mapping can be individually right and
 * collectively lossy. The pair below says the same thing twice, once in each
 * version, and requires both to produce the identical set of findings. If the
 * converter drops a field, the 3.0 side reports a missing CISA element that the
 * 2.3 side does not, and this test names the rule.
 *
 * That failure mode is not hypothetical. The SPDX project's own 3.0.1 example
 * writes `originatedBy` as an array, the first draft of the converter read only
 * a scalar, and every package in that file silently lost its originator. The
 * report would have told a supplier they had not stated who produced their
 * software, in a document that states it plainly.
 *
 * The pair is CONSTRUCTED, not taken from the corpus, and deliberately so.
 * fixtures/corpus holds real files whose bytes are hash-verified evidence and
 * which are never edited. A semantically identical pair cannot be found in the
 * wild, because it has to be identical by construction for the comparison to
 * mean anything.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { check, detectFormat, loadRulePack } from './check.js';
import { isSpdx3, normaliseSpdx3 } from './spdx3.js';
import { isSupportedVersion, SUPPORTED } from './versions.js';
import type { Json } from './jsonpath.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const PACKS = join(ROOT, 'packages', 'rules', 'packs');
const pack = (name: string) =>
  loadRulePack(JSON.parse(readFileSync(join(PACKS, name), 'utf8')) as Json);

const NS = 'https://example.invalid/spdxdocs/hx4100';

/** The same SBOM, written the 2.3 way. */
const AS_2_3: Json = {
  spdxVersion: 'SPDX-2.3',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: 'HX-4100 firmware',
  documentNamespace: NS,
  creationInfo: {
    created: '2026-03-06T00:00:00Z',
    creators: ['Organization: Haldane Instruments Ltd', 'Tool: stratifypro-test'],
  },
  packages: [
    {
      SPDXID: 'SPDXRef-openssl',
      name: 'openssl',
      versionInfo: '3.0.11',
      supplier: 'Organization: The OpenSSL Project',
      licenseDeclared: 'Apache-2.0',
      licenseConcluded: 'Apache-2.0',
      checksums: [{ algorithm: 'SHA256', checksumValue: 'a'.repeat(64) }],
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: 'pkg:generic/openssl@3.0.11',
        },
      ],
    },
    {
      SPDXID: 'SPDXRef-zlib',
      name: 'zlib',
      versionInfo: '1.2.13',
      supplier: 'Organization: Jean-loup Gailly',
      licenseDeclared: 'Zlib',
      licenseConcluded: 'Zlib',
      checksums: [{ algorithm: 'SHA256', checksumValue: 'b'.repeat(64) }],
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: 'pkg:generic/zlib@1.2.13',
        },
      ],
    },
  ],
  relationships: [
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relatedSpdxElement: 'SPDXRef-openssl',
      relationshipType: 'DESCRIBES',
    },
    {
      spdxElementId: 'SPDXRef-openssl',
      relatedSpdxElement: 'SPDXRef-zlib',
      relationshipType: 'CONTAINS',
    },
  ],
};

/** The same SBOM, written the 3.0.1 way: a graph of elements that refer to each other. */
const AS_3_0_1: Json = {
  '@context': 'https://spdx.org/rdf/3.0.1/spdx-context.jsonld',
  '@graph': [
    {
      type: 'CreationInfo',
      '@id': '_:creationinfo',
      specVersion: '3.0.1',
      created: '2026-03-06T00:00:00Z',
      createdBy: [`${NS}#Haldane`],
      createdUsing: [`${NS}#Tool`],
    },
    { type: 'Organization', spdxId: `${NS}#Haldane`, name: 'Haldane Instruments Ltd' },
    { type: 'Tool', spdxId: `${NS}#Tool`, name: 'stratifypro-test' },
    { type: 'Organization', spdxId: `${NS}#OpenSSLProject`, name: 'The OpenSSL Project' },
    { type: 'Organization', spdxId: `${NS}#Gailly`, name: 'Jean-loup Gailly' },
    {
      type: 'SpdxDocument',
      spdxId: NS,
      name: 'HX-4100 firmware',
      creationInfo: '_:creationinfo',
      rootElement: [`${NS}#Sbom`],
      profileConformance: ['core', 'software'],
    },
    {
      type: 'software_Sbom',
      spdxId: `${NS}#Sbom`,
      creationInfo: '_:creationinfo',
      software_sbomType: ['build'],
      rootElement: [`${NS}#openssl`],
    },
    {
      type: 'software_Package',
      spdxId: `${NS}#openssl`,
      creationInfo: '_:creationinfo',
      name: 'openssl',
      software_packageVersion: '3.0.11',
      software_packageUrl: 'pkg:generic/openssl@3.0.11',
      suppliedBy: [`${NS}#OpenSSLProject`],
      verifiedUsing: [{ type: 'Hash', algorithm: 'sha256', hashValue: 'a'.repeat(64) }],
    },
    {
      type: 'software_Package',
      spdxId: `${NS}#zlib`,
      creationInfo: '_:creationinfo',
      name: 'zlib',
      software_packageVersion: '1.2.13',
      software_packageUrl: 'pkg:generic/zlib@1.2.13',
      suppliedBy: [`${NS}#Gailly`],
      verifiedUsing: [{ type: 'Hash', algorithm: 'sha256', hashValue: 'b'.repeat(64) }],
    },
    { type: 'simplelicensing_LicenseExpression', spdxId: `${NS}#lic-apache`, simplelicensing_licenseExpression: 'Apache-2.0' },
    { type: 'simplelicensing_LicenseExpression', spdxId: `${NS}#lic-zlib`, simplelicensing_licenseExpression: 'Zlib' },
    { type: 'Relationship', spdxId: `${NS}#r1`, from: `${NS}#openssl`, relationshipType: 'hasDeclaredLicense', to: [`${NS}#lic-apache`] },
    { type: 'Relationship', spdxId: `${NS}#r2`, from: `${NS}#openssl`, relationshipType: 'hasConcludedLicense', to: [`${NS}#lic-apache`] },
    { type: 'Relationship', spdxId: `${NS}#r3`, from: `${NS}#zlib`, relationshipType: 'hasDeclaredLicense', to: [`${NS}#lic-zlib`] },
    { type: 'Relationship', spdxId: `${NS}#r4`, from: `${NS}#zlib`, relationshipType: 'hasConcludedLicense', to: [`${NS}#lic-zlib`] },
    { type: 'Relationship', spdxId: `${NS}#r5`, from: NS, relationshipType: 'describes', to: [`${NS}#openssl`] },
    { type: 'Relationship', spdxId: `${NS}#r6`, from: `${NS}#openssl`, relationshipType: 'contains', to: [`${NS}#zlib`] },
  ],
};

test('SPDX 3 is detected by its @context, and reports the version it declares', () => {
  assert.equal(isSpdx3(AS_3_0_1), true);
  assert.equal(isSpdx3(AS_2_3), false);
  assert.deepEqual(detectFormat(AS_3_0_1), { format: 'spdx', spec: '3.0.1' });
  assert.deepEqual(detectFormat(AS_2_3), { format: 'spdx', spec: '2.3' });
});

test('3.0.1 is inside the supported range, and 3.1 is not', () => {
  assert.equal(SUPPORTED.spdx.label, 'SPDX 2.2 to 3.0.1');
  assert.equal(isSupportedVersion('spdx', '3.0.1'), true);
  assert.equal(isSupportedVersion('spdx', '3.0'), true);
  assert.equal(isSupportedVersion('spdx', '2.3'), true);
  // Refused rather than attempted. A version nobody has read is not supported
  // just because its number is larger.
  assert.equal(isSupportedVersion('spdx', '3.1'), false);
  assert.equal(isSupportedVersion('spdx', '2.1'), false);
});

for (const packName of ['cisa-2026-v2.1.json', 'fda-524b.json']) {
  test(`THE EQUIVALENCE: the same SBOM in 2.3 and 3.0.1 gives identical findings (${packName})`, () => {
    const p = pack(packName);
    const a = check(AS_2_3, p, { engineVersion: 't', fileSha256: 'x' });
    const b = check(AS_3_0_1, p, { engineVersion: 't', fileSha256: 'x' });

    const ids = (r: typeof a): string[] => r.findings.map((f) => f.ruleId).sort();
    assert.deepEqual(
      ids(b),
      ids(a),
      'the 3.0.1 document produced different findings from the identical 2.3 document',
    );
    assert.deepEqual(b.counts, a.counts);
    assert.deepEqual(b.evaluatedRules.sort(), a.evaluatedRules.sort());
  });
}

test('a converted document says so on the result, with what it did not use', () => {
  // A reader of the report is entitled to know the findings came from a
  // converted view of their file rather than from the file itself.
  const r = check(AS_3_0_1, pack('cisa-2026-v2.1.json'), { engineVersion: 't', fileSha256: 'x' });
  assert.ok(r.normalisation, 'the result does not record that it normalised');
  assert.equal(r.normalisation?.from, 'SPDX 3.0.1 (JSON-LD)');
  assert.equal(r.normalisation?.counts.packages, 2);
  assert.deepEqual(r.normalisation?.unmappedTypes, []);

  // And a 2.3 document carries no such record, because nothing was converted.
  const two = check(AS_2_3, pack('cisa-2026-v2.1.json'), { engineVersion: 't', fileSha256: 'x' });
  assert.equal(two.normalisation, undefined);
});

test('references are resolved, not copied as identifiers', () => {
  const n = normaliseSpdx3(AS_3_0_1);
  const pkgs = n.view.packages as Array<Record<string, Json>>;
  const openssl = pkgs.find((x) => x.name === 'openssl');
  // The supplier is an Agent somewhere else in the graph. A converter that
  // copied the reference would put a URL where a company name belongs, and
  // CISA-CD-001 would pass while the report named nobody.
  assert.equal(openssl?.supplier, 'Organization: The OpenSSL Project');
  assert.equal(openssl?.licenseDeclared, 'Apache-2.0');
  assert.equal(openssl?.licenseConcluded, 'Apache-2.0');
  assert.equal(openssl?.versionInfo, '3.0.11');
  assert.deepEqual(openssl?.checksums, [{ algorithm: 'SHA256', checksumValue: 'a'.repeat(64) }]);
  assert.deepEqual(n.view.creationInfo, {
    creators: ['Organization: Haldane Instruments Ltd', 'Tool: stratifypro-test'],
    created: '2026-03-06T00:00:00Z',
  });
});

test('an agent reference given as an array is read, not dropped', () => {
  // The SPDX project's own 3.0.1 example writes originatedBy as an array. A
  // converter that took only a scalar dropped the originator from every
  // package, and the report then said the document did not state who produced
  // the software, which the document plainly did.
  const doc: Json = {
    '@context': 'https://spdx.org/rdf/3.0.1/spdx-context.jsonld',
    '@graph': [
      { type: 'CreationInfo', '@id': '_:c', specVersion: '3.0.1', created: '2026-01-01T00:00:00Z' },
      { type: 'Person', spdxId: `${NS}#p`, name: 'Joshua Watt' },
      { type: 'software_Package', spdxId: `${NS}#pkg`, name: 'my-package', originatedBy: [`${NS}#p`] },
    ],
  };
  const pkgs = normaliseSpdx3(doc).view.packages as Array<Record<string, Json>>;
  assert.equal(pkgs[0]?.originator, 'Person: Joshua Watt');
});

test('licence relationships do not become component dependencies', () => {
  // hasDeclaredLicense is a Relationship like any other in 3.0. Copying it
  // into `relationships` would make a licence look like a dependency, and
  // CISA-CD-002 would then pass on a document with no dependency data at all.
  const n = normaliseSpdx3(AS_3_0_1);
  const rels = n.view.relationships as Array<Record<string, Json>>;
  assert.equal(rels.length, 2);
  assert.deepEqual(
    rels.map((r) => r.relationshipType).sort(),
    ['CONTAINS', 'DESCRIBES'],
  );
});

test('element types and package keys this converter ignores are reported', () => {
  // The guard against a silent "missing element". A key that is not read is
  // countable rather than invisible.
  const doc: Json = {
    '@context': 'https://spdx.org/rdf/3.0.1/spdx-context.jsonld',
    '@graph': [
      { type: 'CreationInfo', '@id': '_:c', specVersion: '3.0.1' },
      { type: 'software_Package', spdxId: `${NS}#p`, name: 'x', builtTime: '2026-01-01T00:00:00Z' },
      { type: 'build_Build', spdxId: `${NS}#b`, name: 'a build element' },
    ],
  };
  const n = normaliseSpdx3(doc);
  assert.deepEqual(n.unmappedPackageKeys, ['builtTime']);
  assert.deepEqual(n.unmappedTypes, ['build']);
});

test('a 3.0 document with no packages is not read as a clean file', () => {
  // The empty-document trap: zero components must reach the rules as zero,
  // so that onEmptySelector: fire does its job.
  const doc: Json = {
    '@context': 'https://spdx.org/rdf/3.0.1/spdx-context.jsonld',
    '@graph': [{ type: 'CreationInfo', '@id': '_:c', specVersion: '3.0.1' }],
  };
  const r = check(doc, pack('fda-524b.json'), { engineVersion: 't', fileSha256: 'x' });
  assert.ok(
    r.findings.some((f) => f.ruleId === 'FDA-STAT-002'),
    'a document listing no components did not fail the rule that requires at least one',
  );
});
