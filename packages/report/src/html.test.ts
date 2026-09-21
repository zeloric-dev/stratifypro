import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CheckResult, Finding, Severity } from '@stratifypro/engine';
import { escapeHtml, renderHtml } from './html.js';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'R1',
    title: 'A rule',
    severity: 'warning',
    severityJustification: 'because',
    path: '$.components[0]',
    fix: 'do the thing',
    sourceRef: 'doc: section',
    code: 'SP-RULE-R1',
    ...over,
  };
}

function result(findings: Finding[], over: Partial<CheckResult> = {}): CheckResult {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0, advisory: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return {
    engineVersion: '1.2.3',
    rulePackId: 'fda-524b',
    rulePackVersion: '1.0.0',
    sourceFormat: 'cyclonedx',
    sourceSpec: '1.5',
    fileSha256: 'deadbeef',
    findings,
    counts,
    evaluatedRules: ['R1'],
    skippedRules: [],
    overrides: [],
    inertOverrides: [],
    ...over,
  };
}

const opts = { fileName: 'sbom.json', generatedAt: '2026-09-20T12:00:00Z' };

test('the document is self-contained: no network request of any kind', () => {
  const html = renderHtml(result([finding()]), opts);
  // It gets attached to a submission, forwarded, and opened years later,
  // possibly offline. Anything it fetches is something that can fail in front
  // of a regulator.
  assert.doesNotMatch(html, /<script/i, 'no script');
  assert.doesNotMatch(html, /https?:\/\//i, 'no absolute URL');
  assert.doesNotMatch(html, /<link/i, 'no linked stylesheet');
  assert.doesNotMatch(html, /@import/i, 'no CSS import');
  assert.doesNotMatch(html, /url\(/i, 'no url() reference');
});

test('component names from the checked file are escaped', () => {
  // A bill of materials is somebody else's input and this opens in a browser.
  const nasty = '<img src=x onerror=alert(1)>';
  const html = renderHtml(result([finding({ component: nasty })]), opts);
  assert.doesNotMatch(html, /<img src=x/, 'raw markup reached the document');
  assert.match(html, /&lt;img src=x/, 'expected the escaped form');
});

test('escaping covers quotes and ampersands, not just angle brackets', () => {
  assert.equal(escapeHtml(`a&b"c'd<e>`), 'a&amp;b&quot;c&#39;d&lt;e&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('coverage is stated before any finding', () => {
  const html = renderHtml(result([finding()]), { ...opts, componentsTotal: 5088, componentsResolved: 4102 });
  const coverAt = html.indexOf('4102 of 5088');
  const findingAt = html.indexOf('R1 &mdash;');
  assert.ok(coverAt > -1, 'coverage line missing');
  assert.ok(coverAt < findingAt, 'a finding appeared before the coverage statement');
  assert.match(html, /986 could not be identified/);
  assert.match(html, /not a clean result/);
});

test('a large group lists a bounded sample and says how many more', () => {
  const many = Array.from({ length: 141 }, (_, i) => finding({ path: `$.components[${i}]` }));
  const html = renderHtml(result(many), opts);
  assert.match(html, /141 instances/);
  assert.match(html, /and 131 further instances not listed/);
});

test('a clean result never reads as a failure to load', () => {
  const html = renderHtml(result([]), opts);
  assert.match(html, /No findings/);
  assert.match(html, /real result, not a failure to load/);
});

test('every pinned input appears, so the artifact is re-runnable', () => {
  const html = renderHtml(result([finding()]), {
    ...opts,
    inputs: {
      engineVersion: '1.2.3',
      dictionaryVersion: 'dict-2026-09-13',
      eosVersion: 'eos-2026-09-01',
      advisorySnapshotId: 'osv-abc123',
    },
  });
  for (const pin of ['deadbeef', 'fda-524b', 'dict-2026-09-13', 'eos-2026-09-01', 'osv-abc123']) {
    assert.match(html, new RegExp(pin), `missing pinned input: ${pin}`);
  }
});

test('overrides are rendered with their reasons, not hidden', () => {
  const html = renderHtml(
    result([finding()], {
      overrides: [{ ruleId: 'R1', from: 'error', to: 'warning', reason: 'compensating control in place' }],
    }),
    opts,
  );
  assert.match(html, /Severity overrides applied/);
  assert.match(html, /compensating control in place/);
});

test('the retention sentence is present and unaltered', () => {
  // docs/copy.md owns this wording. Claiming we hold the file would be a false
  // statement in the core value proposition.
  const html = renderHtml(result([]), opts);
  assert.match(html, /did not retain the submitted file and cannot reproduce its contents/);
});

test('no coloured accent rail on cards', () => {
  // docs/ui-stack.md lists a coloured left accent rail among the things that
  // give a generated interface away, and the design brief's notice component
  // says no accent rail. Severity is carried by the chip, which stays legible
  // in print and does not depend on colour alone.
  const html = renderHtml(result([finding({ severity: 'error' })]), opts);
  assert.doesNotMatch(html, /border-(left|right)-color/, 'accent rail reintroduced');
  assert.doesNotMatch(html, /border-left-width/, 'side-weighted border reintroduced');
  assert.match(html, /class="chip error"/, 'severity must still be conveyed');
});

test('no dark-mode block ships', () => {
  // A reviewer on a dark operating system must see what the sender saw.
  const html = renderHtml(result([finding()]), opts);
  assert.doesNotMatch(html, /prefers-color-scheme/);
});

// ---------------------------------------------------------------------------
// Overrides. Doc 6 step 1.6 acceptance: "An override appears in the result and
// in the report." The result half is tested in packages/engine; this is the
// report half, and it is the half that matters most, because the report is the
// artefact that leaves the building.
// ---------------------------------------------------------------------------

const APPLIED = {
  ruleId: 'R1',
  from: 'error' as Severity,
  to: 'warning' as Severity,
  reason: 'The field is supplied out of band in the submission letter, section 4.2.',
};

/** The overrides table only, so an assertion cannot be satisfied by the stylesheet. */
function overridesTable(html: string, heading: string): string {
  // Anchored on the <h2>, not the bare text: the coverage header names this
  // heading in its caveat, so indexOf on the words alone finds that instead.
  const start = html.indexOf(`<h2>${heading}</h2>`);
  assert.notEqual(start, -1, `no "${heading}" section in the report`);
  const end = html.indexOf('</table>', start);
  assert.notEqual(end, -1, 'the section has no table');
  return html.slice(start, end);
}

test('an applied override is printed with the severity it came from', () => {
  // Scoped to the table. As first written this matched the whole document, and
  // /error/ hit `.error{color:...}` in the always-emitted stylesheet while
  // /warning/ hit both `.warning{...}` and the fixture's own severity chip.
  // Deleting the `from` column entirely left the test green, which made it
  // useless for the one field it is named after.
  const html = renderHtml(result([finding()], { overrides: [APPLIED] }), opts);
  const table = overridesTable(html, 'Severity overrides applied');
  assert.match(table, /<td>R1<\/td>/);
  assert.match(table, /<td>error<\/td>/, 'the severity it came from is not rendered');
  assert.match(table, /<td>warning<\/td>/, 'the severity it was moved to is not rendered');
  assert.match(table, /supplied out of band/, 'the reason is the point and it is absent');
});

test('the overrides file and its hash appear in the provenance block', () => {
  // The report is the artifact that leaves the building. An auditor holding it
  // should be able to ask which overrides file produced it.
  const html = renderHtml(
    result([finding()], {
      overrides: [APPLIED],
      overridesSource: { path: 'conf/overrides.json', sha256: 'a'.repeat(64), requested: 3 },
    }),
    opts,
  );
  assert.match(html, /conf\/overrides\.json/);
  assert.match(html, new RegExp('a'.repeat(64)));
  assert.match(html, /3 requested, 1 applied, 0 changed nothing/, 'the counts are not reconciled');
});

test('a report with no overrides file has no provenance row for one', () => {
  const html = renderHtml(result([finding()]), opts);
  assert.doesNotMatch(html, /Overrides file/);
});

test('the reason is escaped like any other untrusted string', () => {
  // It comes from a user-authored file. The corpus taught this lesson once.
  const html = renderHtml(
    result([finding()], { overrides: [{ ...APPLIED, reason: '<script>alert(1)</script>' }] }),
    opts,
  );
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('an override that changed nothing is shown, and shown as separate', () => {
  const html = renderHtml(
    result([finding()], {
      inertOverrides: [
        {
          ruleId: 'R9',
          to: 'info',
          reason: 'Left over from the 2025 pack; kept pending review by regulatory affairs.',
          whyInert: 'the rule did not apply to cyclonedx, so there was no severity to change',
        },
      ],
    }),
    opts,
  );
  assert.match(html, /R9/, 'the inert override vanished from the report');
  assert.match(html, /changed nothing/i, 'nothing distinguishes it from an applied override');
  assert.match(html, /did not apply to cyclonedx/, 'the reader is not told why it did nothing');
});

test('a report with no overrides prints neither table', () => {
  const html = renderHtml(result([finding()]), opts);
  assert.doesNotMatch(html, /Severity overrides/);
});

test('the header says the counts were overridden, where the counts are believed', () => {
  // A reader who takes in the coverage block and stops would otherwise see
  // "0 error" with nothing to suggest a person moved something out of it.
  const f = finding({ severity: 'warning' });
  const html = renderHtml(result([f], { overrides: [APPLIED] }), opts);
  const headerEnd = html.indexOf('<h2>Findings</h2>');
  assert.ok(headerEnd > 0, 'findings heading not found');
  const header = html.slice(0, headerEnd);
  assert.match(header, /override/i, 'the caveat is below the fold, where it will not be read');
});
