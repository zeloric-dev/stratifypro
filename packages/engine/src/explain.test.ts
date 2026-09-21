/**
 * One rule, described once.
 *
 * Doc 3 flow C: "`explain <ruleId>` in the CLI and `/rules/<ruleId>` on the web
 * render the same content from the same source. Two renderings of one rule is
 * the drift pattern this project has already been bitten by twice."
 *
 * The acceptance test for that is not "both look right today". It is that
 * neither surface can hold its own list of fields, because a list in two places
 * is the drift. These tests hold the shared view to the pack, and a check in
 * verify.sh greps both renderers for a hand-written field list.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadRulePack } from './check.js';
import { explainLabels, explainRule } from './explain.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const packs = ['fda-524b', 'cisa-2026-v2.1'].map((id) =>
  loadRulePack(JSON.parse(readFileSync(join(ROOT, 'packages', 'rules', 'packs', `${id}.json`), 'utf8'))),
);

test('every rule in every shipped pack produces a view', () => {
  let n = 0;
  for (const pack of packs) {
    for (const rule of pack.rules) {
      const v = explainRule(rule, pack);
      assert.equal(v.ruleId, rule.id);
      assert.equal(v.packId, pack.id);
      assert.ok(v.fields.length >= 6, `${rule.id} produced only ${v.fields.length} fields`);
      n += 1;
    }
  }
  assert.ok(n >= 30, `only ${n} rules seen; the packs did not load`);
});

test('the severity justification is carried, never dropped', () => {
  // A severity with no written argument behind it is the competitor's root
  // error and the reason this project exists. A renderer that showed the
  // severity and not its justification would look complete.
  for (const pack of packs) {
    for (const rule of pack.rules) {
      const v = explainRule(rule, pack);
      const sev = v.fields.find((f) => f.label === 'Severity');
      assert.ok(sev, `${rule.id} has no severity field`);
      assert.equal(sev.value, rule.severity);
      assert.equal(sev.note, rule.severityJustification, `${rule.id} lost its justification`);
      assert.ok((sev.note ?? '').length > 40, `${rule.id} justification is too short to be one`);
    }
  }
});

test('the empty-selector behaviour and its justification are both carried', () => {
  for (const pack of packs) {
    for (const rule of pack.rules) {
      const f = explainRule(rule, pack).fields.find((x) => x.label === 'On an empty selector');
      assert.ok(f, `${rule.id} does not say what it does on an empty selector`);
      assert.equal(f.value, rule.onEmptySelector);
      assert.equal(f.note, rule.onEmptySelectorJustification);
    }
  }
});

test('the source clause is named, so a reader can go and disagree with it', () => {
  for (const pack of packs) {
    for (const rule of pack.rules) {
      const f = explainRule(rule, pack).fields.find((x) => x.label === 'Source');
      assert.ok(f);
      assert.ok(f.value.includes(rule.sourceDocument), `${rule.id} does not name its document`);
      assert.ok(f.value.includes(rule.sourceLocation), `${rule.id} does not name its clause`);
    }
  }
});

test('a note is shown when the rule has one and absent when it does not', () => {
  const withNote = packs.flatMap((p) => p.rules.map((r) => ({ r, p }))).filter((x) => x.r.note);
  const without = packs.flatMap((p) => p.rules.map((r) => ({ r, p }))).filter((x) => !x.r.note);
  assert.ok(withNote.length > 0 && without.length > 0, 'the packs do not exercise both branches');
  for (const { r, p } of withNote) {
    assert.ok(explainLabels(explainRule(r, p)).includes('Note'), `${r.id} dropped its note`);
  }
  for (const { r, p } of without) {
    assert.ok(!explainLabels(explainRule(r, p)).includes('Note'), `${r.id} invented a note`);
  }
});

test('the label order is fixed, because order is part of the contract', () => {
  // Severity and its argument come first: a reader deciding whether to argue
  // with a finding needs the argument before the mechanics.
  const rule = packs[0]!.rules[0]!;
  const labels = explainLabels(explainRule(rule, packs[0]!));
  assert.deepEqual(labels.slice(0, 5), [
    'Severity',
    'Applies to',
    'Selector',
    'On an empty selector',
    'Fix',
  ]);
});

test('a selector object is rendered, not printed as [object Object]', () => {
  const both = packs
    .flatMap((p) => p.rules.map((r) => ({ r, p })))
    .find((x) => typeof x.r.selector !== 'string');
  assert.ok(both, 'no per-format selector in either pack to exercise this');
  const f = explainRule(both.r, both.p).fields.find((x) => x.label === 'Selector');
  assert.ok(f);
  assert.doesNotMatch(f.value, /\[object Object\]/);
  assert.match(f.value, /cyclonedx|spdx/);
  assert.equal(f.mono, true, 'a selector is not prose and must not render as prose');
});

test('no field renders a label with nothing under it', () => {
  // Adversarial review noted this gap: the tests asserted structure and one
  // note's length, so a future rule with "fix": "" would have rendered a "Fix"
  // heading above a blank cell on a public page and every test would pass.
  for (const pack of packs) {
    for (const rule of pack.rules) {
      for (const f of explainRule(rule, pack).fields) {
        assert.ok(
          f.value.trim().length > 0,
          `${rule.id} field "${f.label}" would render an empty value`,
        );
        if (f.note !== undefined) {
          assert.ok(
            f.note.trim().length > 0,
            `${rule.id} field "${f.label}" carries an empty note`,
          );
        }
      }
    }
  }
});

test('a rule with an empty field is caught, not rendered blank', () => {
  // The assertion above only proves the shipped packs are clean. This proves
  // the assertion would fire, which is the half that makes it a test.
  const rule = { ...packs[0]!.rules[0]!, fix: '   ' };
  const view = explainRule(rule, packs[0]!);
  const fix = view.fields.find((f) => f.label === 'Fix');
  assert.ok(fix);
  assert.equal(fix.value.trim().length, 0, 'the fixture did not produce an empty field');
});
