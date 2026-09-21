/**
 * One rule, described once.
 *
 * Doc 3 flow C states the requirement plainly: "`explain <ruleId>` in the CLI
 * and `/rules/<ruleId>` on the web render the same content from the same
 * source. Two renderings of one rule is the drift pattern this project has
 * already been bitten by twice."
 *
 * So this module decides WHICH facts about a rule are shown and in what order,
 * and returns them as data. The CLI turns that into aligned text, the web turns
 * it into a definition list, and neither decides what a rule is. A field added
 * here appears in both surfaces on the next build; a field added to one
 * renderer appears in neither, because neither renderer has a field list.
 *
 * The two earlier bites this comment refers to are on the record: the
 * coverage-baseline figures produced by a script nobody kept, and the banned
 * phrase list that lived in two places and drifted while its own drift check
 * printed "in sync".
 */
import type { Rule, RulePack } from './check.js';

export interface ExplainField {
  /** What the reader is looking at. */
  label: string;
  value: string;
  /**
   * The sentence under a field that says why it is there.
   *
   * Optional because some fields explain themselves. Where a rule pack carries
   * a written justification, that justification is the point of the field and
   * not decoration: a severity without one is the competitor's root error.
   */
  note?: string;
  /** Rendered as code rather than prose. Selectors and ids, not sentences. */
  mono?: boolean;
}

export interface ExplainView {
  ruleId: string;
  title: string;
  severity: string;
  packId: string;
  packVersion: string;
  fields: ExplainField[];
}

function selectorOf(rule: Rule): string {
  return typeof rule.selector === 'string' ? rule.selector : JSON.stringify(rule.selector);
}

/**
 * The full description of one rule, in display order.
 *
 * Order is part of the contract. Severity and its justification come before the
 * mechanics, because a reader deciding whether to argue with a finding needs
 * the argument for its severity first, and the selector is a detail they may
 * never need.
 */
export function explainRule(rule: Rule, pack: RulePack): ExplainView {
  const fields: ExplainField[] = [
    {
      label: 'Severity',
      value: rule.severity,
      note: rule.severityJustification,
    },
    {
      label: 'Applies to',
      value: rule.appliesTo.join(', '),
    },
    {
      label: 'Selector',
      value: selectorOf(rule),
      mono: true,
    },
    {
      label: 'On an empty selector',
      value: rule.onEmptySelector,
      note: rule.onEmptySelectorJustification,
    },
    {
      label: 'Fix',
      value: rule.fix,
    },
    {
      label: 'Source',
      value: `${rule.sourceDocument}: ${rule.sourceLocation}`,
    },
  ];

  if (rule.note) fields.push({ label: 'Note', value: rule.note });

  return {
    ruleId: rule.id,
    title: rule.title,
    severity: rule.severity,
    packId: pack.id,
    packVersion: pack.version,
    fields,
  };
}

/**
 * The labels every renderer must show, in order.
 *
 * Exported so a test can assert that a surface renders all of them rather than
 * quietly dropping one. A renderer that skips a field is the drift this module
 * exists to prevent, and it would otherwise look like working code.
 */
export function explainLabels(view: ExplainView): string[] {
  return view.fields.map((f) => f.label);
}
