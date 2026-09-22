import { check, coverage } from '@stratifypro/engine';
import sample from '../../../fixtures/sample/meridian-infusion-pump.cdx.json';
import fdaPack from '../../../packages/rules/packs/fda-524b.json';

/**
 * SPEC.md 1.9: "A defective sample preloaded on arrival."
 * Acceptance: "First paint shows real findings before the visitor does anything."
 *
 * FIRST PAINT MEANS FIRST PAINT. The findings below are computed by running the
 * real engine over the sample AT BUILD TIME, in this server component, and the
 * result is baked into the static HTML. There is no worker round trip, no
 * effect that fills the table in afterwards, and no request. A visitor on a
 * slow connection sees the findings in the same paint as the heading.
 *
 * Doing it in the browser instead would have satisfied the words and missed the
 * point: the page would show an empty table first and the findings a moment
 * later, which is the thing the acceptance test is written to prevent.
 *
 * It also keeps SPEC.md 1.8 intact, "network tab shows zero requests after page
 * load", because nothing here runs after page load at all.
 *
 * THE SAMPLE IS FICTIONAL AND THE PAGE SAYS SO. Using a real project's bill of
 * material as the example of a defective document would mean publishing, on a
 * site selling a tool that finds defects, a page naming a real company's
 * software as deficient. The corpus projects published their SBOMs as a public
 * good. See fixtures/sample/README.md.
 */
const RESULT = check(sample as never, fdaPack as never);
const COVERAGE = coverage(sample as never);

const SEVERITY_ORDER = ['error', 'warning', 'info', 'advisory'] as const;

export function Sample() {
  const byRule = new Map<string, { title: string; severity: string; count: number }>();
  for (const f of RESULT.findings) {
    const seen = byRule.get(f.ruleId);
    if (seen) seen.count += 1;
    else byRule.set(f.ruleId, { title: f.title, severity: f.severity, count: 1 });
  }
  const rows = [...byRule.entries()].sort((a, b) => {
    const s = SEVERITY_ORDER.indexOf(a[1].severity as never) - SEVERITY_ORDER.indexOf(b[1].severity as never);
    return s !== 0 ? s : b[1].count - a[1].count;
  });

  return (
    <section>
      <h2>Here is one that has problems</h2>
      <p className="lede">
        A bill of material for an infusion pump controller, checked against the FDA section 524B
        profile. {RESULT.findings.length} findings across {rows.length} rules, on{' '}
        {COVERAGE.total} components. Nothing was uploaded to produce this: it was checked when the
        page was built, and your own file is checked the same way, in your browser.
      </p>

      <table>
        <thead>
          <tr>
            <th scope="col">Rule</th>
            <th scope="col">Severity</th>
            <th scope="col">Components</th>
            <th scope="col">What it asks for</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([ruleId, r]) => (
            <tr key={ruleId}>
              <th scope="row">
                <a href={`/rules/${ruleId}`}>
                  <code>{ruleId}</code>
                </a>
              </th>
              <td>{r.severity}</td>
              <td>{r.count}</td>
              <td>{r.title}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted">
        Meridian Medical Systems and the MX-40 do not exist. The document is invented so that this
        page does not present a real project&apos;s published bill of material as an example of a
        defective one. The findings are real: they come from running the engine over that invented
        file, so they change when the rules change.
      </p>
    </section>
  );
}
