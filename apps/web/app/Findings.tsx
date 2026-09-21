'use client';

import type { CheckResult, Coverage, Finding, Severity } from '@stratifypro/engine';
import { COPY } from './copy';

const RANK: Record<Severity, number> = { error: 4, warning: 3, info: 2, advisory: 1 };

/** How many instances of one rule are listed before the count takes over. */
const LISTED = 5;

interface Group {
  ruleId: string;
  title: string;
  severity: Severity;
  fix: string;
  sourceRef: string;
  overriddenFrom?: Severity;
  instances: Finding[];
}

/**
 * One row per rule, not one row per node.
 *
 * Doc 3 flow B: "Findings, aggregated per rule with an instance count. Never
 * 20,000 raw rows." The corpus has a single file producing 4,140 instances of
 * one rule, and a list of those is not a finding, it is a denial of service
 * against the reader.
 */
export function groupByRule(findings: Finding[]): Group[] {
  const map = new Map<string, Group>();
  for (const f of findings) {
    const g = map.get(f.ruleId);
    if (g) {
      g.instances.push(f);
      continue;
    }
    map.set(f.ruleId, {
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      fix: f.fix,
      sourceRef: f.sourceRef,
      ...(f.overriddenFrom === undefined ? {} : { overriddenFrom: f.overriddenFrom }),
      instances: [f],
    });
  }
  return [...map.values()].sort(
    (a, b) => RANK[b.severity] - RANK[a.severity] || b.instances.length - a.instances.length,
  );
}

function Bar({
  result,
  cover,
  filename,
}: {
  result: CheckResult;
  cover: Coverage;
  filename: string;
}) {
  // Three numbers, and all three show even at zero. A reader who sees one
  // "skipped" figure cannot tell a pack that half covers their format from a
  // file missing the structures those rules look at, and those call for
  // different actions. See SkipKind in the engine.
  const notApplicable = result.skippedRules.filter((s) => s.kind === 'not-applicable').length;
  const noPath = result.skippedRules.filter((s) => s.kind === 'no-path').length;
  const unidentified = cover.total - cover.identified;
  const nested = cover.total - cover.topLevel;

  return (
    <div className="cover">
      {filename ? <div className="counts">{filename}</div> : null}
      <div className="big">
        {cover.total.toLocaleString()} components &middot; {result.findings.length.toLocaleString()}{' '}
        findings
      </div>
      <div className="counts">
        {result.evaluatedRules.length} rules ran &middot; {notApplicable} not applicable to{' '}
        {result.sourceFormat} &middot; {noPath} skipped
      </div>
      {unidentified > 0 ? (
        // Doc 3 calls this the conversion moment and doc 4 section 7 requires it
        // above the findings. It is a measurement of the document, not a claim
        // about what this tool could find: see coverage.ts in the engine.
        //
        // Doc 3 words it "so they were not checked against advisories". Said on
        // this page that would imply the other components WERE, and this page
        // matches nothing against anything. The gap is real either way, so it is
        // stated as what any matching tool would do, and the line below says
        // plainly what this page did.
        <div className="note">
          {unidentified.toLocaleString()} of {cover.total.toLocaleString()} components could not be
          identified from this file alone. A component with no package URL and no CPE is invisible
          to every advisory database, so any tool matching this file would skip it. That is a gap in
          the file, not a clean result.
        </div>
      ) : (
        <div className="note">
          All {cover.total.toLocaleString()} components carry a package URL or a CPE. That is the
          identifier an advisory database needs. Whether each one is correct is a separate question,
          and this page does not answer it.
        </div>
      )}
      {nested > 0 ? (
        // Every per-component selector in both packs is $.components[*], and
        // the JSONPath subset has no descendant operator, so a nested component
        // is counted above and examined by no rule. Printing the nested total
        // beside a finding count said they had all been looked at: a container
        // SBOM whose one parent passes every rule, with a thousand bare
        // "1,001 components. 16 rules ran. Nothing flagged."
        <div className="note">
          {nested.toLocaleString()} of these are nested inside other components. The rules in this
          pack select top level components, so nested entries were counted but not checked
          individually.
        </div>
      ) : null}
      {/*
        Always shown. Without it a reader can take the coverage line above as a
        statement that the identified components came back clean, when nothing
        on this page queries an advisory source at all.
      */}
      <div className="note">
        This page checks the file against the rule pack only. It does not match components against
        advisory sources.
      </div>
    </div>
  );
}

export function Findings({
  result,
  cover,
  packId,
  filename,
}: {
  result: CheckResult;
  cover: Coverage;
  packId: string;
  filename: string;
}) {
  const groups = groupByRule(result.findings);
  const counts = result.counts;
  const allSkipped = result.evaluatedRules.length === 0;

  const headline = allSkipped
    ? COPY.allSkipped(packId, result.sourceFormat)
    : result.findings.length === 0
      ? COPY.zeroFindings(result.evaluatedRules.length, packId)
      : COPY.findings(
          result.findings.length,
          groups.length,
          counts.error,
          counts.warning,
          counts.info,
        );

  return (
    <section aria-label="Results">
      <Bar result={result} cover={cover} filename={filename} />

      <h2>{headline.heading}</h2>
      <p className="lede">{headline.body}</p>

      {groups.map((g) => (
        <div className="card" key={g.ruleId}>
          <div className="meta">
            <span className={`chip sev-${g.severity}`}>{g.severity}</span>{' '}
            {g.overriddenFrom ? (
              <span className="chip m-abstain">moved from {g.overriddenFrom}</span>
            ) : null}{' '}
            <b>{g.ruleId}</b> {g.title}
          </div>
          <div className="meta">
            {g.instances.length.toLocaleString()}{' '}
            {g.instances.length === 1 ? 'instance' : 'instances'} &middot; {g.sourceRef}
          </div>
          <ul className="paths">
            {g.instances.slice(0, LISTED).map((f, i) => (
              <li key={`${f.path}-${i}`}>
                <code>{f.path}</code>
                {f.component ? <span className="meta"> {f.component}</span> : null}
              </li>
            ))}
          </ul>
          {g.instances.length > LISTED ? (
            <p className="meta">
              and {(g.instances.length - LISTED).toLocaleString()} further instances not listed
            </p>
          ) : null}
          <p className="abstain-why">
            <b>Fix.</b> {g.fix}
          </p>
        </div>
      ))}

      {/*
        The rules that ran, shown on a clean pass. docs/copy.md: "A clean pass
        and a broken tool must never look the same, which is why the rule list
        is shown rather than a tick."
      */}
      {result.findings.length > 0 || allSkipped ? null : (
        <details>
          <summary className="meta">
            The {result.evaluatedRules.length} rules that ran against this file
          </summary>
          <ul className="paths">
            {result.evaluatedRules.map((id) => (
              <li key={id}>
                <code>{id}</code>
              </li>
            ))}
          </ul>
        </details>
      )}

      {result.skippedRules.length > 0 ? (
        <details>
          <summary className="meta">
            The {result.skippedRules.length} rules that did not run, and why
          </summary>
          <ul className="paths">
            {result.skippedRules.map((s) => (
              <li key={s.ruleId}>
                <code>{s.ruleId}</code> <span className="meta">{s.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
