/**
 * Which versions this engine admits to reading.
 *
 * SPEC step 1.2's acceptance is "unsupported versions refused by name, not
 * generically". Nothing enforced it: detectFormat returned whatever version
 * string it found and every rule ran regardless, so a CycloneDX 1.0 document
 * would have been checked by rules written against 1.4 selectors and reported
 * as a clean pass.
 *
 * The ranges must match docs/copy.md, which states them to users. A test that
 * only checked the code against itself would let the two drift.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { detectFormat } from './check.js';
import { isSupportedVersion, SUPPORTED } from './versions.js';

test('the documented ranges are the implemented ranges', () => {
  assert.equal(SUPPORTED.cyclonedx.label, 'CycloneDX 1.2 to 1.7');
  assert.equal(SUPPORTED.spdx.label, 'SPDX 2.2 to 2.3');
});

test('the ends of each range are inside it', () => {
  for (const [format, r] of Object.entries(SUPPORTED)) {
    const f = format as 'cyclonedx' | 'spdx';
    assert.ok(isSupportedVersion(f, r.min), `${format} ${r.min} should be supported`);
    assert.ok(isSupportedVersion(f, r.max), `${format} ${r.max} should be supported`);
  }
});

test('versions below the floor are refused', () => {
  assert.equal(isSupportedVersion('cyclonedx', '1.1'), false);
  assert.equal(isSupportedVersion('cyclonedx', '1.0'), false);
  assert.equal(isSupportedVersion('spdx', '2.1'), false);
  assert.equal(isSupportedVersion('spdx', '1.2'), false);
});

test('versions above the ceiling are refused rather than assumed compatible', () => {
  // A newer version is not a safe guess. It is the case where selectors are
  // most likely to have moved.
  assert.equal(isSupportedVersion('cyclonedx', '1.8'), false);
  assert.equal(isSupportedVersion('spdx', '3.1'), false);
});

test('SPDX 3.0 is refused, because nothing here can read its shape', () => {
  // 3.0 is JSON-LD: elements live under @graph, not a packages array, and every
  // SPDX selector in both packs is a 2.x shape. This range said 3.0.1 for a
  // while and the result was a file being told it lists no components.
  assert.equal(isSupportedVersion('spdx', '3.0'), false);
  assert.equal(isSupportedVersion('spdx', '3.0.1'), false);
  assert.equal(isSupportedVersion('spdx', 'SPDX-3.0.1'), false);
});

test('the SPDX- prefix is tolerated, because that is how documents write it', () => {
  assert.ok(isSupportedVersion('spdx', 'SPDX-2.2'));
  assert.ok(isSupportedVersion('spdx', 'SPDX-2.3'));
  assert.equal(isSupportedVersion('spdx', 'SPDX-2.1'), false);
});

test('a version with more segments than the bound still compares correctly', () => {
  // Segment-count asymmetry in both directions. "2.3.0" must read as equal to
  // the "2.3" ceiling, not as unparseable or as above it.
  assert.ok(isSupportedVersion('spdx', '2.3.0'));
  assert.ok(isSupportedVersion('spdx', '2.2.0.0'));
  assert.ok(isSupportedVersion('cyclonedx', '1.2.0'));
  assert.equal(isSupportedVersion('spdx', '2.3.1'), false);
});

test('a version string that is not a version is refused, never assumed', () => {
  // "unknown" reaches here from detectFormat when a document carries an SPDXID
  // and no spdxVersion. Guessing that such a file is probably fine is how an
  // unreadable document becomes a clean report.
  for (const v of ['unknown', '', 'v1.4', '1.4-beta', 'latest', '1..4']) {
    assert.equal(isSupportedVersion('cyclonedx', v), false, `"${v}" was admitted`);
  }
});

test('every corpus file is a version this engine admits to reading', () => {
  // If this goes red, either the corpus gained a file outside the supported
  // range or the range moved. Both are worth stopping for: the golden results
  // are measured on these files.
  const dir = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'corpus');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'provenance.json');
  assert.ok(files.length > 0, 'no corpus files found');
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const { format, spec } = detectFormat(doc);
    assert.ok(isSupportedVersion(format, spec), `${f} is ${format} ${spec}, which is refused`);
  }
});
