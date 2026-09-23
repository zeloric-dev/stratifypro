import type { CheckResult, Finding, Severity } from '@stratifypro/engine';

const ORDER: Severity[] = ['error', 'warning', 'info', 'advisory'];

export const SEVERITY_RANK: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1,
  advisory: 0,
};

/**
 * Findings grouped by rule, with a count, rather than one line per node.
 *
 * Measured: 12 of 39 rules select every component, supplier coverage is 5.1
 * percent and hash coverage 33.3 percent, so several rules fire on nearly every
 * component. One 3 MB corpus file produces on the order of 20,000 to 40,000
 * findings. Printing one line each is not a report, it is a denial of service
 * against the reader.
 */
export interface RuleGroup {
  ruleId: string;
  title: string;
  severity: Severity;
  fix: string;
  sourceRef: string;
  code: string;
  instances: { path: string; component?: string }[];
}

export function groupByRule(findings: Finding[]): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const f of findings) {
    let g = groups.get(f.ruleId);
    if (!g) {
      g = {
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity,
        fix: f.fix,
        sourceRef: f.sourceRef,
        code: f.code,
        instances: [],
      };
      groups.set(f.ruleId, g);
    }
    g.instances.push(f.component === undefined ? { path: f.path } : { path: f.path, component: f.component });
  }
  return [...groups.values()].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.ruleId.localeCompare(b.ruleId),
  );
}

/** How many instances to print before saying how many more there are. */
const SHOWN = 3;

export function renderText(result: CheckResult, opts: { packId: string; maxInstances?: number }): string {
  const max = opts.maxInstances ?? SHOWN;
  const lines: string[] = [];

  // The summary comes first, always. ran / skipped are three different numbers
  // and all of them print, because a file that looks complete and is not is the
  // founding observation of this tool.
  const counts = ORDER.filter((s) => result.counts[s] > 0)
    .map((s) => `${result.counts[s]} ${s}`)
    .join(', ');

  const notApplicable = result.skippedRules.filter((s) => s.kind === 'not-applicable').length;
  const noPath = result.skippedRules.filter((s) => s.kind === 'no-path').length;

  lines.push('');
  lines.push(`  ${result.sourceFormat} ${result.sourceSpec}   pack ${opts.packId} ${result.rulePackVersion}`);
  // An SPDX 3 document is a graph and had to be converted before any rule
  // could read it. Whoever reads these findings is entitled to know they came
  // from a converted view of their file rather than from the file itself, and
  // to see what the converter did not use, because a field it missed and a
  // field the supplier omitted produce the same finding.
  const n = result.normalisation;
  if (n) {
    lines.push(`  read as ${n.from}, converted to be checked: ${n.counts.packages} package(s), ` +
      `${n.counts.relationships} relationship(s)`);
    if (n.unmappedTypes.length > 0) {
      lines.push(`  element types not used: ${n.unmappedTypes.join(', ')}`);
    }
    if (n.unmappedPackageKeys.length > 0) {
      lines.push(`  package fields not used: ${n.unmappedPackageKeys.join(', ')}`);
    }
  }
  lines.push(
    // Three numbers, not two. "Skipped" used to cover both a rule that does not
    // apply to this format and a rule that applies and found no node to look
    // at. The first is a fact about the pack, the second is a fact about the
    // file, and they call for different actions.
    `  ${result.evaluatedRules.length} rules ran, ${notApplicable} not applicable to ${result.sourceFormat}, ` +
      `${noPath} skipped, ${result.findings.length} findings${counts ? ` (${counts})` : ''}`,
  );
  if (result.overrides.length > 0) {
    lines.push(`  ${result.overrides.length} severity override(s) applied, recorded in the result`);
    for (const o of result.overrides) {
      lines.push(`    ${o.ruleId}  ${o.from} -> ${o.to}`);
    }
  }
  // Declared and did nothing. Printed at the same prominence as the applied
  // ones, because the user who wrote it cannot otherwise tell it from an
  // override that worked and had nothing to change.
  if (result.inertOverrides.length > 0) {
    lines.push(`  ${result.inertOverrides.length} severity override(s) changed nothing:`);
    for (const o of result.inertOverrides) {
      lines.push(`    ${o.ruleId}  asked for ${o.to}: ${o.whyInert}`);
    }
  }
  lines.push('');

  if (result.findings.length === 0) {
    // Never let a clean result look like a failure to run.
    lines.push('  No findings. That is a real result, not a failure to load:');
    lines.push(`  ${result.evaluatedRules.length} rules ran against this file.`);
    lines.push('');
    return lines.join('\n');
  }

  for (const g of groupByRule(result.findings)) {
    const n = g.instances.length;
    lines.push(`  [${g.severity}] ${g.ruleId}  ${g.title}`);
    lines.push(`      ${n} ${n === 1 ? 'instance' : 'instances'}`);
    for (const inst of g.instances.slice(0, max)) {
      lines.push(`        ${inst.path}${inst.component ? `   ${inst.component}` : ''}`);
    }
    if (n > max) lines.push(`        ... and ${n - max} more`);
    lines.push(`      fix:    ${g.fix}`);
    lines.push(`      source: ${g.sourceRef}`);
    lines.push('');
  }

  if (result.skippedRules.length > 0) {
    lines.push(`  Skipped rules (${result.skippedRules.length}), with reasons:`);
    for (const s of result.skippedRules.slice(0, 5)) {
      lines.push(`      ${s.ruleId}: ${s.reason}`);
    }
    if (result.skippedRules.length > 5) {
      lines.push(`      ... and ${result.skippedRules.length - 5} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
