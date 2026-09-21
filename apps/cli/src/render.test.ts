import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CheckResult, Finding, Severity } from '@stratifypro/engine';
import { groupByRule, renderText, SEVERITY_RANK } from './render.js';

function finding(ruleId: string, path: string, severity: Severity = 'warning'): Finding {
  return {
    ruleId,
    title: `title for ${ruleId}`,
    severity,
    severityJustification: 'because',
    path,
    fix: 'do the thing',
    sourceRef: 'doc: section',
    code: `SP-RULE-${ruleId}`,
  };
}

function result(findings: Finding[], over: Partial<CheckResult> = {}): CheckResult {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0, advisory: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return {
    engineVersion: '0.0.0',
    rulePackId: 'test',
    rulePackVersion: '1.0.0',
    sourceFormat: 'cyclonedx',
    sourceSpec: '1.5',
    fileSha256: 'abc',
    findings,
    counts,
    evaluatedRules: ['R1'],
    skippedRules: [],
    overrides: [],
    inertOverrides: [],
    ...over,
  };
}

test('findings are grouped by rule, not printed one per node', () => {
  const f = [finding('R1', '$.components[0]'), finding('R1', '$.components[1]'), finding('R2', '$.metadata')];
  const groups = groupByRule(f);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.ruleId === 'R1')?.instances.length, 2);
});

test('groups sort by severity, most serious first', () => {
  const groups = groupByRule([
    finding('LOW', '$.a', 'info'),
    finding('HIGH', '$.b', 'error'),
    finding('MID', '$.c', 'warning'),
  ]);
  assert.deepEqual(groups.map((g) => g.ruleId), ['HIGH', 'MID', 'LOW']);
});

test('a large group prints a bounded sample and says how many more', () => {
  const many = Array.from({ length: 141 }, (_, i) => finding('R1', `$.components[${i}]`));
  const text = renderText(result(many), { packId: 'test' });
  assert.match(text, /141 instances/);
  assert.match(text, /and 138 more/);
  // 141 findings must not become 141 lines.
  assert.ok(text.split('\n').length < 20, 'output grew with the finding count');
});

test('a clean result never reads as a failure to load', () => {
  const text = renderText(result([]), { packId: 'test' });
  assert.match(text, /real result, not a failure to load/);
  assert.match(text, /1 rules ran/);
});

test('the summary separates not-applicable from skipped, and both from findings', () => {
  // Three numbers, not two. A rule that does not apply to this format is a
  // fact about the pack; a rule that applies and found no node to look at is a
  // fact about the file. One number cannot carry both, and a reader seeing
  // "2 skipped" cannot tell which situation they are in.
  const text = renderText(
    result([finding('R1', '$.a')], {
      skippedRules: [
        { ruleId: 'R8', reason: 'does not apply to cyclonedx', kind: 'not-applicable' as const },
        { ruleId: 'R9', reason: 'no path for this rule', kind: 'no-path' as const },
      ],
    }),
    { packId: 'test' },
  );
  assert.match(text, /1 rules ran/);
  assert.match(text, /1 not applicable to cyclonedx/);
  assert.match(text, /1 skipped/);
  assert.match(text, /1 findings/);
  assert.match(text, /Skipped rules \(2\)/);
});

test('the three counts stay distinct when only one kind is present', () => {
  const text = renderText(
    result([finding('R1', '$.a')], {
      skippedRules: [
        { ruleId: 'R8', reason: 'does not apply to cyclonedx', kind: 'not-applicable' as const },
      ],
    }),
    { packId: 'test' },
  );
  assert.match(text, /1 not applicable/);
  assert.match(text, /0 skipped/, 'zero must be printed, not omitted');
});

test('severity ranking orders error above warning above info above advisory', () => {
  assert.ok(SEVERITY_RANK.error > SEVERITY_RANK.warning);
  assert.ok(SEVERITY_RANK.warning > SEVERITY_RANK.info);
  assert.ok(SEVERITY_RANK.info > SEVERITY_RANK.advisory);
});
