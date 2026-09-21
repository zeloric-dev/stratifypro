/**
 * Overrides: the applied ones, and the ones that quietly did nothing.
 *
 * SPEC.md step 4.2 makes severity an input. That is a loaded gun in a tool
 * whose output is submission evidence, so the tests that matter here are not
 * "does the severity change" but "can anything about an override be invisible".
 *
 * The regression this file exists for: before it, check() looked up the
 * override AFTER the two continue statements that skip a rule, so an override
 * aimed at a rule that did not apply to the document format produced exactly
 * the output you would get having never written it. No error, no record, no
 * difference. A user could keep an override file with a mistyped format for
 * years and believe it was doing something.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check, loadRulePack } from './check.js';
import { MIN_REASON, OverrideError } from './overrides.js';

const REASON =
  'Our SPDX producer cannot emit this field before the Q3 toolchain upgrade; tracked internally as SUP-1421.';
assert.ok(REASON.trim().length >= MIN_REASON, 'the test reason must itself clear the floor');

/** A two-rule pack: one that applies to CycloneDX, one that applies only to SPDX. */
const PACK = loadRulePack({
  id: 'test-pack',
  version: '1.0.0',
  title: 'Test pack',
  compiled: '2026-09-20',
  sourceDocuments: [
    {
      id: 'test-doc',
      title: 'A test source document',
      citation: 'none',
      publisher: 'StratifyPro tests',
      published: '2026-01-01',
      effective: '2026-01-01',
      url: 'https://example.invalid/',
      normativeLanguage: true,
      normativeLanguageEvidence: 'Declared normative so this fixture may carry severity error.',
    },
  ],
  severityModel: 'Test fixture.',
  conformanceNote: 'Test fixture.',
  rules: [
    {
      id: 'TEST-CDX',
      title: 'Every component carries a package URL',
      severity: 'error',
      severityJustification: 'Fixture rule, present so that an override has something to change.',
      onEmptySelector: 'fire',
      onEmptySelectorJustification:
        'A document with no components at all fails this rule, which is the conservative reading and is what the real packs do.',
      appliesTo: ['cyclonedx'],
      selector: { cyclonedx: '$.components[*]' },
      assert: { exists: 'purl' },
      fix: 'Add a purl to every component.',
      sourceDocument: 'test-doc',
      sourceLocation: 'Fixture',
    },
    {
      id: 'TEST-SPDX-ONLY',
      title: 'A rule that never runs against CycloneDX',
      severity: 'warning',
      severityJustification:
        'Fixture rule, present so an override can be aimed at a rule that does not run.',
      onEmptySelector: 'skip',
      onEmptySelectorJustification:
        'This rule exists to be skipped on a CycloneDX document, which is the exact case the inert-override record was added for.',
      appliesTo: ['spdx'],
      selector: { spdx: '$.packages[*]' },
      assert: { exists: 'licenseConcluded' },
      fix: 'Not applicable; fixture only.',
      sourceDocument: 'test-doc',
      sourceLocation: 'Fixture',
    },
  ],
});

const DOC = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  components: [{ name: 'openssl', version: '1.1.1k' }],
};

test('with no overrides, both records are empty and the pack severity stands', () => {
  const r = check(DOC, PACK);
  assert.equal(r.overrides.length, 0);
  assert.equal(r.inertOverrides.length, 0);
  assert.equal(r.findings[0]?.severity, 'error');
});

test('an applied override changes the finding and is recorded with the severity it came from', () => {
  const r = check(DOC, PACK, {
    severityOverrides: [{ ruleId: 'TEST-CDX', to: 'warning', reason: REASON }],
  });
  assert.equal(r.findings[0]?.severity, 'warning', 'the finding did not change');
  assert.equal(r.overrides.length, 1);
  assert.deepEqual(r.overrides[0], {
    ruleId: 'TEST-CDX',
    from: 'error',
    to: 'warning',
    reason: REASON,
  });
  assert.equal(r.inertOverrides.length, 0);
  assert.equal(r.counts.error, 0, 'counts must follow the override, not the pack');
  assert.equal(r.counts.warning, 1);
});

test('REGRESSION: an override on a rule that does not run is recorded, not dropped', () => {
  // This is the bug. TEST-SPDX-ONLY never runs against a CycloneDX document, so
  // before inertOverrides existed this call returned a result identical to the
  // one with no override at all.
  const r = check(DOC, PACK, {
    severityOverrides: [{ ruleId: 'TEST-SPDX-ONLY', to: 'info', reason: REASON }],
  });
  assert.equal(r.overrides.length, 0, 'nothing was applied, so nothing may be reported as applied');
  assert.equal(r.inertOverrides.length, 1, 'the override vanished without trace');
  assert.equal(r.inertOverrides[0]?.ruleId, 'TEST-SPDX-ONLY');
  assert.equal(r.inertOverrides[0]?.to, 'info');
  assert.equal(r.inertOverrides[0]?.reason, REASON, 'the reason must survive into the record');
  assert.match(r.inertOverrides[0]?.whyInert ?? '', /cyclonedx/i);
});

test('an override to the severity the pack already assigns counts as inert, not applied', () => {
  const r = check(DOC, PACK, {
    severityOverrides: [{ ruleId: 'TEST-CDX', to: 'error', reason: REASON }],
  });
  assert.equal(r.overrides.length, 0, 'a change of nothing is not an applied override');
  assert.equal(r.inertOverrides.length, 1);
  assert.match(r.inertOverrides[0]?.whyInert ?? '', /already assigns/);
  assert.equal(r.findings[0]?.severity, 'error');
});

test('a reason shorter than the floor refuses the whole run', () => {
  assert.throws(
    () =>
      check(DOC, PACK, {
        severityOverrides: [{ ruleId: 'TEST-CDX', to: 'info', reason: 'because' }],
      }),
    (e: unknown) => e instanceof OverrideError && e.code === 'SP-OVERRIDE-004',
  );
});

test('an empty reason is refused, not treated as a present field', () => {
  // The same defect class check-claims.py was fixed for: a key that exists and
  // holds nothing is not a filled-in field.
  assert.throws(
    () =>
      check(DOC, PACK, {
        severityOverrides: [{ ruleId: 'TEST-CDX', to: 'info', reason: '   ' }],
      }),
    (e: unknown) => e instanceof OverrideError && e.code === 'SP-OVERRIDE-004',
  );
});

test('an unknown rule id refuses the run rather than silently doing nothing', () => {
  assert.throws(
    () =>
      check(DOC, PACK, {
        severityOverrides: [{ ruleId: 'TEST-TYPO', to: 'info', reason: REASON }],
      }),
    (e: unknown) => e instanceof OverrideError && e.code === 'SP-OVERRIDE-001',
  );
});

test('the same rule overridden twice is refused, because the winner would be invisible', () => {
  assert.throws(
    () =>
      check(DOC, PACK, {
        severityOverrides: [
          { ruleId: 'TEST-CDX', to: 'info', reason: REASON },
          { ruleId: 'TEST-CDX', to: 'warning', reason: REASON },
        ],
      }),
    (e: unknown) => e instanceof OverrideError && e.code === 'SP-OVERRIDE-002',
  );
});

test('a severity that is not a severity is refused', () => {
  assert.throws(
    () =>
      check(DOC, PACK, {
        // Deliberately outside the type: the CLI reads this from a JSON file
        // that TypeScript never sees, so the runtime guard is the only guard.
        severityOverrides: [{ ruleId: 'TEST-CDX', to: 'critical' as never, reason: REASON }],
      }),
    (e: unknown) => e instanceof OverrideError && e.code === 'SP-OVERRIDE-003',
  );
});

test('validation runs over the whole list before any rule is evaluated', () => {
  // Not a partial result. packInvalid takes the same position for the same
  // reason: half a check on submission evidence is worse than no check.
  //
  // The bad entry is deliberately SECOND. If validation ran lazily, per rule,
  // the first override would apply and the document would be half checked
  // before anything complained. As written this was a bare assert.throws with
  // no error filter, duplicating the SP-OVERRIDE-001 test above and passing on
  // any throw at all, including a TypeError.
  assert.throws(
    () =>
      check(DOC, PACK, {
        severityOverrides: [
          { ruleId: 'TEST-CDX', to: 'warning', reason: REASON },
          { ruleId: 'TEST-TYPO', to: 'info', reason: REASON },
        ],
      }),
    (e: unknown) => e instanceof OverrideError && e.code === 'SP-OVERRIDE-001',
  );
});

test('a null or non-object entry is an OverrideError, not a TypeError', () => {
  // This engine is the published contract and other callers build the array
  // from parsed JSON that TypeScript never saw. A raw TypeError escapes the
  // CLI's error mapping and surfaces as an internal error with a stack trace.
  for (const bad of [null, 'a string', 42] as unknown[]) {
    assert.throws(
      () => check(DOC, PACK, { severityOverrides: [bad as never] }),
      (e: unknown) => e instanceof OverrideError && e.code === 'SP-OVERRIDE-005',
      `entry ${JSON.stringify(bad)} did not produce an OverrideError`,
    );
  }
});

test('a non-string ruleId is refused without being stringified into the message', () => {
  assert.throws(
    () =>
      check(DOC, PACK, {
        severityOverrides: [{ ruleId: { a: 1 } as never, to: 'info', reason: REASON }],
      }),
    (e: unknown) =>
      e instanceof OverrideError &&
      e.code === 'SP-OVERRIDE-005' &&
      !/No rule called "\[object Object\]"/.test(e.message),
  );
});

test('an override on a rule that ran and found nothing is inert, not applied', () => {
  // The push used to sit outside the findings loop, so this was recorded as
  // applied and the report header then said the counts were not the pack's
  // when they were identical to them.
  const clean = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [{ name: 'openssl', version: '1.1.1k', purl: 'pkg:deb/debian/openssl@1.1.1k' }],
  };
  const r = check(clean, PACK, {
    severityOverrides: [{ ruleId: 'TEST-CDX', to: 'info', reason: REASON }],
  });
  assert.equal(r.findings.length, 0, 'the fixture is supposed to pass the rule');
  assert.equal(r.overrides.length, 0, 'nothing was changed, so nothing may be reported as applied');
  assert.equal(r.inertOverrides.length, 1);
  assert.match(r.inertOverrides[0]?.whyInert ?? '', /found nothing/);
});

test('a moved finding carries the severity it came from', () => {
  // A renderer showing findings one at a time has no reason to read the
  // sibling overrides array, and severityJustification still argues for the
  // pack's severity.
  const r = check(DOC, PACK, {
    severityOverrides: [{ ruleId: 'TEST-CDX', to: 'info', reason: REASON }],
  });
  assert.equal(r.findings[0]?.severity, 'info');
  assert.equal(r.findings[0]?.overriddenFrom, 'error');
});

test('a finding nobody overrode carries no marker at all', () => {
  const r = check(DOC, PACK);
  assert.equal(r.findings[0]?.overriddenFrom, undefined);
});
