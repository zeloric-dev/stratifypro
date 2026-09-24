/**
 * The fixture is a real published model, not one this repository wrote.
 *
 * `stories15M-q4_0.metadata.gguf` is the first 723,798 bytes of
 * huggingface.co/ggml-org/models/tinyllamas/stories15M-q4_0.gguf, which is
 * exactly its metadata block: everything after it is tensor weights this
 * package never reads. The prefix is reproducible and hash-checkable, which
 * `fixtures/README.md` records, so the claim "this is a real file" is
 * something a reader can verify rather than take.
 *
 * WHY NOT A GGUF THIS REPOSITORY WROTE. Testing a reader against a writer in
 * the same package proves the two agree and nothing else. Every interesting
 * property of this format is a choice a producer made: that the tokenizer
 * arrays come FIRST and push `general.name` 700 kilobytes into the file, that
 * key order is not the documented order, that a real published model sets
 * almost none of the `general.*` keys. A hand-built fixture would have had the
 * four keys this code wanted, in the order it expected.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  DRAFT_PROPERTY,
  elementCoverage,
  hashModelFile,
  looksLikeGguf,
  modelCardFromGguf,
  NotGguf,
  readGgufMetadata,
} from './index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'fixtures');
const REAL = readFileSync(join(FIXTURES, 'stories15M-q4_0.metadata.gguf'));
const OPTS = { fileName: 'stories15M-q4_0.gguf', timestamp: '2026-09-24T00:00:00Z' };

test('the fixture is a real GGUF v3, with its metadata intact', () => {
  assert.equal(looksLikeGguf(REAL), true);
  const m = readGgufMetadata(REAL);
  assert.equal(m.version, 3);
  assert.equal(m.tensorCount, 57n);
  assert.equal(m.kv.size, 20);
  assert.deepEqual(m.unreadable, []);
  // The whole block was consumed, which is what makes this a complete
  // metadata prefix rather than an arbitrary truncation.
  assert.equal(m.metadataBytes, REAL.length);
});

test('the general keys sit AFTER 700KB of tokenizer, and are still found', () => {
  // The reason a hand-written fixture would have proved nothing. This producer
  // writes tokenizer.ggml.tokens first: 32,000 strings, 466KB, before the file
  // says what the model is called.
  const m = readGgufMetadata(REAL);
  const keys = [...m.kv.keys()];
  assert.equal(keys[0], 'tokenizer.ggml.tokens');
  assert.ok(keys.indexOf('general.architecture') > 3);
  assert.equal(m.kv.get('general.architecture'), 'llama');
  const tokens = m.kv.get('tokenizer.ggml.tokens');
  assert.ok(Array.isArray(tokens) && tokens.length === 32000);
});

test('THE ACCEPTANCE: the card round-trips through the checker with zero errors', async () => {
  // SPEC.md 3.2. Run through the real engine and the real pack, not a mock of
  // either, because the claim is about what the checker says.
  const { check, loadRulePack } = await import('@stratifypro/engine');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const pack = loadRulePack(
    JSON.parse(readFileSync(join(root, 'packages', 'rules', 'packs', 'fda-524b.json'), 'utf8')),
  );

  const card = modelCardFromGguf(REAL, { ...OPTS, fileSha256: hashModelFile(REAL) });
  const result = check(card.document as never, pack, { engineVersion: 't', fileSha256: 'x' });

  assert.equal(result.sourceFormat, 'cyclonedx');
  assert.equal(result.sourceSpec, '1.7');
  assert.equal(
    result.counts.error,
    0,
    'the generated card produced an error-severity finding: ' +
      result.findings.filter((f) => f.severity === 'error').map((f) => f.ruleId).join(', '),
  );
  assert.ok(result.evaluatedRules.length > 0, 'no rule ran against the generated card');
});

test('it is a draft, and says so where a tool will see it', () => {
  const card = modelCardFromGguf(REAL, OPTS);
  const props = (card.document.metadata as { properties: Array<{ name: string; value: string }> })
    .properties;
  assert.ok(props.some((p) => p.name === DRAFT_PROPERTY && p.value === 'true'));
  const warning = props.find((p) => p.name === 'stratifypro:draft-warning');
  assert.match(warning?.value ?? '', /not been confirmed by a person/);
  // The distinction that matters: an absent key means the file did not say,
  // not that the answer is nothing.
  assert.match(warning?.value ?? '', /did not say/);
});

test('NOTHING IS INVENTED: no licence, producer or version is guessed', () => {
  // This real model states none of the three. A generator that filled them
  // from the filename, the repository it was downloaded from, or the
  // architecture would produce a card that reads as authoritative and is not.
  const card = modelCardFromGguf(REAL, OPTS);
  const c = (card.document.components as Array<Record<string, unknown>>)[0]!;
  assert.equal(c.licenses, undefined);
  assert.equal(c.manufacturer, undefined);
  assert.equal(c.version, undefined);
  assert.equal(c.description, undefined);
  assert.equal(c.hashes, undefined, 'a hash was recorded without the caller supplying one');
});

test('what it could not answer is listed, by rule', () => {
  // The honest half of the test above. Absence is reported rather than left
  // for somebody to notice when a reviewer asks.
  const card = modelCardFromGguf(REAL, OPTS);
  const rules = card.unanswered.map((u) => u.split(' ')[0]);
  for (const expected of ['G7-MOD-003', 'G7-MOD-005', 'G7-MOD-007', 'G7-MOD-012']) {
    assert.ok(rules.includes(expected), `${expected} should be reported as unanswered`);
  }
  // And the name IS answered, because there is always a fallback.
  assert.ok(!rules.includes('G7-MOD-001'));
});

test('a hash appears only when the caller hashed the whole file', () => {
  // A hash of the header would look like a model hash and identify nothing.
  const without = modelCardFromGguf(REAL, OPTS);
  assert.ok(without.unanswered.some((u) => u.startsWith('G7-MOD-007')));

  const withHash = modelCardFromGguf(REAL, { ...OPTS, fileSha256: 'd'.repeat(64) });
  const c = (withHash.document.components as Array<Record<string, unknown>>)[0]!;
  assert.deepEqual(c.hashes, [{ alg: 'SHA-256', content: 'd'.repeat(64) }]);
  assert.ok(!withHash.unanswered.some((u) => u.startsWith('G7-MOD-007')));
});

test('the architecture hyperparameters come across, prefixed by their source', () => {
  const card = modelCardFromGguf(REAL, OPTS);
  const c = (card.document.components as Array<Record<string, unknown>>)[0]!;
  const props = c.properties as Array<{ name: string; value: string }>;
  const byName = new Map(props.map((p) => [p.name, p.value]));
  assert.equal(byName.get('gguf:llama.context_length'), '128');
  assert.equal(byName.get('gguf:llama.block_count'), '6');
  assert.equal(byName.get('gguf:quantisation'), 'Q4_0');
  // Prefixed, so nobody reads a value this file stated as one StratifyPro
  // decided.
  assert.ok(props.every((p) => p.name.startsWith('gguf:') || p.name.startsWith('stratifypro:')));
});

test('a file that is not GGUF is refused by name', () => {
  assert.equal(looksLikeGguf(Buffer.from('not a model')), false);
  assert.throws(() => readGgufMetadata(Buffer.from('not a model')), NotGguf);
  assert.throws(() => readGgufMetadata(Buffer.alloc(0)), NotGguf);
});

test('a truncated file says it is truncated, not that the model is empty', () => {
  // The distinction a person acts on: "your download is incomplete" sends them
  // to re-download; "this model states nothing" sends them to the vendor.
  const cut = REAL.subarray(0, 100_000);
  assert.throws(
    () => readGgufMetadata(cut),
    (e: unknown) => {
      assert.ok(e instanceof NotGguf);
      assert.match(e.message, /truncated|ends inside/);
      return true;
    },
  );
});

test('an unknown format version is refused rather than guessed at', () => {
  // Version 1 laid the header out differently. Reading it with these offsets
  // would produce keys and values that are not in the file, which is worse
  // than refusing.
  for (const v of [1, 4, 99]) {
    const b = Buffer.from(REAL.subarray(0, 4096));
    b.writeUInt32LE(v, 4);
    assert.throws(
      () => readGgufMetadata(b),
      (e: unknown) => {
        assert.ok(e instanceof NotGguf);
        assert.match(e.message, new RegExp(`version ${v}`));
        return true;
      },
    );
  }
});

test('the coverage table says what GGUF can and cannot answer', () => {
  // Published so a team can decide whether to bother before running it.
  const cov = elementCoverage();
  assert.ok(cov.length >= 9);
  assert.ok(cov.every((c) => /^G7-MOD-\d{3}$/.test(c.rule)));
  assert.ok(cov.every((c) => c.from.length > 0));
});

test('the same file produces the same card', () => {
  // The timestamp is an argument, so two runs are comparable. A card that
  // differed per run could not be diffed against the one a team filed.
  const a = modelCardFromGguf(REAL, OPTS);
  const b = modelCardFromGguf(REAL, OPTS);
  assert.equal(JSON.stringify(a.document), JSON.stringify(b.document));
});
