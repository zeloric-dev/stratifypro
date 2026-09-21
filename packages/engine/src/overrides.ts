/**
 * Severity overrides, and the rules about declaring one.
 *
 * SPEC.md step 4.2 says severity is "an input, never a constant": a firm whose
 * SPDX producer genuinely cannot emit a field needs to run the rest of the pack
 * without a permanently red build. The danger is obvious. An override is a way
 * to make a finding quieter, and a tool that lets you quieten a finding without
 * leaving a trace is a tool for producing clean-looking evidence.
 *
 * So the trade is: you may change a severity, and you may never do it silently.
 * Every override that takes effect is recorded in CheckResult.overrides and
 * printed in the report. Every override that does NOT take effect is recorded
 * in CheckResult.inertOverrides, because "I asked for something and nothing
 * happened and nobody told me" is the failure mode this repository exists to
 * argue against.
 *
 * Four conditions throw instead, because no honest reading of them exists:
 * an unknown rule id, the same rule twice, a severity that is not a severity,
 * and a reason too short to be a reason.
 */
import type { OverrideRequest, Severity } from './types.js';

/**
 * The part of a rule pack this file needs, and no more.
 *
 * RulePack itself lives in check.ts, which imports this module; taking the
 * whole type would make the two files import each other. Naming the two fields
 * actually used is also the truer signature: validation reads rule ids and
 * severities and has no business with selectors or source documents.
 */
interface PackShape {
  id: string;
  rules: readonly { id: string; severity: Severity }[];
}

export const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info', 'advisory'];

/**
 * The floor for a reason, in characters after trimming.
 *
 * Not arbitrary: packages/rules/schema/rule-pack-1.json already requires 60 for
 * onEmptySelectorJustification, on the same argument. A rule author must write a
 * sentence to explain an empty selector; a user lowering a severity on their own
 * submission evidence is not held to a lower standard than the rule author.
 *
 * A length floor cannot tell a reason from sixty characters of keyboard noise.
 * It is a speed bump, and it is honest about being one: what it buys is that
 * "x" stops being possible, and that the field is hard enough to fill in
 * carelessly that a reviewer reading the report has something to read.
 */
export const MIN_REASON = 60;

export class OverrideError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OverrideError';
  }
}

/**
 * Check a set of requests against a pack. Throws on the four unreadable cases.
 *
 * Runs before any rule is evaluated, so a bad override file checks nothing at
 * all rather than checking most of the document and failing at the end. A
 * partial result is worse than none, which is the same reason packInvalid
 * refuses to check anything.
 */
export function validateOverrides(requests: readonly OverrideRequest[], pack: PackShape): void {
  const seen = new Set<string>();
  for (const r of requests) {
    // The CLI shape-checks its file before it gets here, but this engine is the
    // published contract and other callers build this array from parsed JSON
    // that TypeScript never saw. Without these two guards a null entry threw a
    // raw TypeError, which is not an OverrideError, so it escaped the CLI's
    // error mapping and would have surfaced as an internal error with a stack
    // trace instead of a refusal a person can read.
    if (r === null || typeof r !== 'object') {
      throw new OverrideError(
        'SP-OVERRIDE-005',
        `An override entry is ${r === null ? 'null' : typeof r}, not an object with ruleId, to and reason.`,
      );
    }
    if (typeof r.ruleId !== 'string') {
      throw new OverrideError(
        'SP-OVERRIDE-005',
        `An override entry has a ${typeof r.ruleId} where its ruleId should be. ` +
          `Reporting this as an unknown rule would have named "${String(r.ruleId)}" as the rule.`,
      );
    }
    const rule = pack.rules.find((x) => x.id === r.ruleId);
    if (!rule) {
      throw new OverrideError(
        'SP-OVERRIDE-001',
        `No rule called "${r.ruleId}" in pack ${pack.id}. ` +
          `An override naming a rule that does not exist would change nothing and look like it did.`,
      );
    }
    if (seen.has(r.ruleId)) {
      throw new OverrideError(
        'SP-OVERRIDE-002',
        `Rule ${r.ruleId} is overridden twice. Which one wins would not be visible in the result.`,
      );
    }
    seen.add(r.ruleId);

    if (!SEVERITIES.includes(r.to)) {
      throw new OverrideError(
        'SP-OVERRIDE-003',
        `"${String(r.to)}" is not a severity. Valid values: ${SEVERITIES.join(', ')}.`,
      );
    }

    const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
    if (reason.length < MIN_REASON) {
      throw new OverrideError(
        'SP-OVERRIDE-004',
        `The reason for overriding ${r.ruleId} is ${reason.length} characters; ` +
          `${MIN_REASON} is the minimum. This reason is printed in the report that goes to a reviewer.`,
      );
    }
  }
}
