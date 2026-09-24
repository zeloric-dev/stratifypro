/**
 * The differential test.
 *
 * packages/rules/golden holds one result file per corpus document per pack,
 * produced by the Python reference implementation: 63 files recording 24,747
 * failing JSONPaths. This engine must reproduce every one of them.
 *
 * The fixture suite proves each rule CAN fire. It does not prove WHICH nodes it
 * fires on, and the contract is one Finding per failing node with its exact
 * path. Without this test an engine could satisfy all 156 fixtures while
 * emitting the wrong path set on every rule.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadRulePack, ruleFailures, detectFormat, type Rule } from './check.js';
import type { SourceFormat } from './types.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const RULES = join(ROOT, 'packages', 'rules');
const GOLDEN = join(RULES, 'golden');
const CORPUS = join(ROOT, 'fixtures', 'corpus');

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));

interface GoldenFile {
  corpusFile: string;
  format: SourceFormat;
  rulePackId: string;
  rulePackVersion: string;
  findingsByRule: Record<string, string[]>;
}

const packDirs = readdirSync(GOLDEN);
assert.ok(packDirs.length > 0, 'no golden pack directories found');

let comparedFiles = 0;
let comparedRules = 0;
let comparedPaths = 0;

for (const packId of packDirs) {
  const pack = loadRulePack(readJson(join(RULES, 'packs', `${packId}.json`)));
  const byId = new Map<string, Rule>(pack.rules.map((r) => [r.id, r]));

  for (const name of readdirSync(join(GOLDEN, packId))) {
    test(`${packId} reproduces ${name}`, () => {
      const expected = readJson(join(GOLDEN, packId, name)) as GoldenFile;
      const doc = readJson(join(CORPUS, expected.corpusFile));

      assert.equal(detectFormat(doc).format, expected.format, 'format detection differs');
      assert.equal(pack.version, expected.rulePackVersion, 'rule pack version differs');

      const actual: Record<string, string[]> = {};
      for (const rule of pack.rules) {
        if (!rule.appliesTo.includes(expected.format)) continue;
        const paths = ruleFailures(doc, rule, expected.format);
        if (paths === null) continue;
        actual[rule.id] = paths;
      }

      assert.deepEqual(
        Object.keys(actual).sort(),
        Object.keys(expected.findingsByRule).sort(),
        'different set of evaluated rules',
      );

      for (const [ruleId, want] of Object.entries(expected.findingsByRule)) {
        assert.ok(byId.has(ruleId), `golden names a rule not in the pack: ${ruleId}`);
        assert.deepEqual(
          actual[ruleId],
          want,
          `${ruleId}: failing paths differ (order and content both matter)`,
        );
        comparedRules += 1;
        comparedPaths += want.length;
      }
      comparedFiles += 1;
    });
  }
}

test('the differential actually compared something', () => {
  // A test suite that silently compares nothing passes. This asserts the
  // scale the golden artifact is documented to have.
  // Pinned, and it earned its keep: adding the G7 pack moved this from 42 to
  // 63 and the test said so rather than quietly comparing fewer files. A
  // golden suite that counts whatever it finds proves nothing about what it
  // did not find.
  assert.equal(comparedFiles, 63, 'expected 63 golden files');
  assert.ok(comparedRules > 600, `only ${comparedRules} rule comparisons`);
  // 24,421 of these come from the two software packs and are unchanged. The
  // G7 pack adds 326 over the same corpus, which is small because that corpus
  // holds no AI SBOM: most G7 rules find no model component and fire once at
  // the document rather than per component.
  assert.equal(comparedPaths, 24747, 'expected 24,747 recorded failing paths');
});
