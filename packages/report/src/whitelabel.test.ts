/**
 * SPEC.md 2.4: "White-label report: firm logo, firm footer, no mention of us
 * unless they want it." Acceptance: "Two firms produce visibly different
 * reports from the same file."
 *
 * And SPEC.md 2.7, the scope of attestation, whose wording the specification
 * marks in bold as not open to paraphrase. That one is guarded by
 * scripts/check-attestation.py against SPEC.md itself; what is tested here is
 * the part a firm can reach: branding must not be able to weaken what the
 * document claims, and a logo must not be able to execute.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CheckResult } from '@stratifypro/engine';
import { attestationText, firmLogoSafe, renderHtml } from './index.js';

// A real CheckResult shape, matching the one html.test.ts builds. Hand-writing
// a partial stub produced a TypeError on a field the renderer reads and this
// file never declared, which is the hazard with a fixture written to agree
// with its author.
const RESULT: CheckResult = {
  engineVersion: '1.2.3',
  rulePackId: 'fda-524b',
  rulePackVersion: '1.0.0',
  sourceFormat: 'cyclonedx',
  sourceSpec: '1.5',
  fileSha256: 'deadbeef',
  findings: [
    {
      ruleId: 'FDA-NTIA-001',
      title: 'Supplier name is present for every component',
      severity: 'warning',
      severityJustification: 'Returned as a review deficiency rather than a filing block.',
      path: '$.components[0]',
      fix: 'Add a supplier to each component.',
      sourceRef: 'FDA 524B',
      code: 'SP-RULE-FDA-NTIA-001',
    },
  ],
  counts: { error: 0, warning: 1, info: 0, advisory: 0 },
  evaluatedRules: ['FDA-NTIA-001'],
  skippedRules: [],
  overrides: [],
  inertOverrides: [],
} as unknown as CheckResult;

const BASE = { fileName: 'device.cdx.json', generatedAt: '2026-09-23' };

test('two firms produce visibly different reports from the same file', () => {
  const a = renderHtml(RESULT, { ...BASE, firmName: 'Northgate Regulatory', firmFooter: 'Prepared for client use only.' });
  const b = renderHtml(RESULT, { ...BASE, firmName: 'Calder Medical Advisors', firmFooter: 'Confidential draft.' });

  assert.notEqual(a, b, 'the two reports are byte-identical');
  assert.ok(a.includes('Northgate Regulatory'));
  assert.ok(b.includes('Calder Medical Advisors'));
  assert.ok(!a.includes('Calder'), 'one firm leaked into the other report');
  assert.ok(a.includes('Prepared for client use only.'));
  assert.ok(b.includes('Confidential draft.'));
});

test('whiteLabel removes every mention of us', () => {
  // A consultancy sending a deliverable to its own client has not agreed to
  // advertise its subcontractor.
  const html = renderHtml(RESULT, { ...BASE, firmName: 'Northgate Regulatory', whiteLabel: true });
  assert.ok(!/StratifyPro/i.test(html), 'the vendor name survived white labelling');
  assert.ok(html.includes('Northgate Regulatory'));
});

test('without whiteLabel our name is still there, because the default is not a white label', () => {
  const html = renderHtml(RESULT, { ...BASE, firmName: 'Northgate Regulatory' });
  assert.match(html, /StratifyPro/);
});

test('branding cannot delete the sentences that limit what the report claims', () => {
  // THE ONE THAT MATTERS. A firm may replace our name and add its own words.
  // It may not quietly turn a conformance check into an endorsement by
  // dropping the limits, because the report is what gets attached to a
  // submission and those sentences are what keep it honest.
  for (const opts of [
    { ...BASE },
    { ...BASE, firmName: 'Northgate Regulatory' },
    { ...BASE, firmName: 'Northgate Regulatory', whiteLabel: true },
    { ...BASE, firmFooter: 'Nothing else matters.', whiteLabel: true },
  ]) {
    const html = renderHtml(RESULT, opts);
    assert.match(html, /records what the named rule pack found in a file presenting the SHA-256/);
    assert.match(html, /No regulator has reviewed this tool/);
    assert.match(html, /cannot (be reproduced|reproduce)/);
  }
});

test('a logo is rendered only when it cannot execute', () => {
  // The report is a standalone file that gets emailed to a regulator and
  // opened from disk. A javascript: or data:text/html value in src is code
  // execution in the reader's browser, delivered by the firm, with the firm's
  // name on it.
  assert.equal(firmLogoSafe('https://example.com/logo.png'), 'https://example.com/logo.png');
  assert.equal(firmLogoSafe('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');

  for (const bad of [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'http://example.com/logo.png',
    'vbscript:msgbox(1)',
    '/etc/passwd',
    'https://example.com/a" onerror="alert(1)',
    '',
  ]) {
    assert.equal(firmLogoSafe(bad), null, `${bad} should be refused`);
  }
});

test('a refused logo renders nothing rather than a broken image', () => {
  const html = renderHtml(RESULT, { ...BASE, firmLogo: 'javascript:alert(1)' });
  assert.ok(!html.includes('javascript:'), 'a refused logo reached the document');
  // Not `!includes('firm-logo')`: that class name is in the stylesheet on
  // every report whether a logo was supplied or not. The property that
  // matters is that no image element exists at all.
  assert.ok(!/<img/.test(html), 'a refused logo left an image element behind');
});

test('an accepted logo is escaped into the document', () => {
  const html = renderHtml(RESULT, { ...BASE, firmName: 'Northgate', firmLogo: 'https://example.com/l.png' });
  assert.match(html, /<img class="firm-logo" src="https:\/\/example\.com\/l\.png" alt="Northgate">/);
});

test('firm names and footers are escaped, because a firm name is input too', () => {
  const html = renderHtml(RESULT, {
    ...BASE,
    firmName: '<script>alert(1)</script>',
    firmFooter: '<img src=x onerror=alert(2)>',
  });
  // The property is that no ELEMENT is created, not that the characters are
  // absent. `&lt;img src=x onerror=alert(2)&gt;` renders as visible text: the
  // bracket is escaped, so there is no tag for a browser to run. Asserting the
  // substring is missing would be asserting something untrue about safe output.
  assert.ok(!/<script/i.test(html), 'a script element was created from a firm name');
  assert.ok(!/<img/i.test(html), 'an image element was created from a firm footer');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'the name should appear as text');
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/, 'the footer should appear as text');
});

test('the attestation names what produced the findings, and claims nothing about contents', () => {
  const text = attestationText({
    date: '2026-09-23',
    sha256: 'abc123',
    engineVersion: '1.2.3',
    packId: 'fda-524b',
    packVersion: '1.0.0',
  });
  assert.match(text, /a file presenting SHA-256 abc123 was submitted/);
  assert.match(text, /fda-524b@1\.0\.0/);
  // The two load-bearing denials. Their exact wording is checked against
  // SPEC.md by scripts/check-attestation.py; what is asserted here is that
  // they are present at all.
  assert.match(text, /did not retain the submitted file and cannot reproduce its contents/);
  assert.match(text, /not an electronic signature within the meaning of 21 CFR 11\.3\(b\)\(7\)/);
  // And the thing it must never say: that the file held anything.
  assert.ok(!/file contained/i.test(text));
  assert.ok(!/contents were/i.test(text));
});
