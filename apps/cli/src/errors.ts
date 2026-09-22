/**
 * Stable error identifiers.
 *
 * Measured across the nine user-facing conditions in docs/copy.md: problem
 * stated 9 of 9, cause 7 of 9, fix 8 of 9, documentation link 0 of 9, and no
 * stable codes anywhere. A regulatory affairs director who hits an error has
 * nothing to paste into a search box and nowhere to go.
 *
 * Non-negotiable 2: a finding a user cannot check is a finding they will not
 * trust, and trust is the entire product. The same applies to an error.
 *
 * DOCS_BASE is not yet a real host. The domain is an open decision and it also
 * sits inside both rule packs' $schema URL, so it is named in one place here
 * rather than scattered through the messages.
 */
export const DOCS_BASE = 'https://stratifypro.io/e';

export const EXIT = {
  /** No findings at or above the active threshold. */
  CLEAN: 0,
  /** One or more findings at or above the threshold. */
  FINDINGS: 1,
  /** The input could not be parsed. */
  PARSE: 2,
  /** The rule pack could not be loaded. A pack that fails to load checks nothing. */
  PACK: 3,
  /**
   * Internal error. Separated from FINDINGS because Node exits 1 on an
   * uncaught exception, which made "one or more findings" and "the tool broke"
   * indistinguishable in a submission-evidence tool.
   */
  INTERNAL: 70,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
  constructor(
    readonly code: string,
    readonly exitCode: ExitCode,
    readonly problem: string,
    readonly reason: string,
    readonly fix: string,
  ) {
    super(problem);
    this.name = 'CliError';
  }

  /** Problem, cause, fix, and somewhere to go. In that order, always. */
  render(): string {
    return [
      `${this.problem}`,
      ``,
      `  What happened: ${this.reason}`,
      `  What to do:    ${this.fix}`,
      `  More:          ${DOCS_BASE}/${this.code}`,
      ``,
    ].join('\n');
  }
}

export const Errors = {
  noMirror: (dir: string, detail: string) =>
    new CliError(
      'SP-MIRROR-001',
      EXIT.PARSE,
      `No advisory mirror at ${dir}.`,
      [
        detail,
        'The mirror is not committed: the five ecosystems the corpus uses are 297 MB',
        'of OSV export, and a file that size rebuilt weekly does not belong in git.',
      ].join(' '),
      [
        'Build one:  pnpm --filter @stratifypro/sync start',
        'Or point at an existing one:  advisories <file> --mirror <dir>',
      ].join('\n'),
    ),
  badFormat: (given: string) =>
    new CliError(
      'SP-INPUT-003',
      EXIT.PACK,
      `Unknown format "${given}".`,
      'The advisories command renders as readable text or as JSON, nothing else.',
      'Use --format text or --format json.',
    ),
  fileUnreadable: (path: string, detail: string) =>
    new CliError(
      'SP-INPUT-001',
      EXIT.PARSE,
      `Could not read ${path}`,
      detail,
      'Check the path and that the file is readable.',
    ),

  notJson: (path: string, detail: string) =>
    new CliError(
      'SP-PARSE-001',
      EXIT.PARSE,
      `${path} is not valid JSON`,
      detail,
      'Both supported formats are JSON. XML and tag-value SPDX are not read yet.',
    ),

  formatUnknown: (path: string) =>
    new CliError(
      'SP-PARSE-002',
      EXIT.PARSE,
      `Could not tell what format ${path} is`,
      'No spdxVersion, SPDXID, bomFormat or components field was present.',
      'Supported: CycloneDX JSON and SPDX JSON.',
    ),

  unsupportedVersion: (path: string, format: string, version: string, supported: string) =>
    new CliError(
      'SP-PARSE-003',
      EXIT.PARSE,
      `${path} is ${format} ${version}, which this engine does not read yet`,
      `Supported today: ${supported}. Nothing was checked.`,
      'Running the rules anyway would check a document with selectors written for another version, ' +
        'and report the result as if it meant something.',
    ),

  packUnknown: (id: string, available: string[]) =>
    new CliError(
      'SP-PACK-001',
      EXIT.PACK,
      `No rule pack called "${id}"`,
      `Available packs: ${available.join(', ')}.`,
      `Run with --pack followed by one of those ids.`,
    ),

  packInvalid: (id: string, detail: string) =>
    new CliError(
      'SP-PACK-002',
      EXIT.PACK,
      `Rule pack ${id} did not pass its own validation`,
      `${detail} This is a defect on our side, not in your file.`,
      'Nothing was checked. A partial result would be worse than none.',
    ),

  ruleUnknown: (id: string, packId: string) =>
    new CliError(
      'SP-RULE-404',
      EXIT.PACK,
      `No rule called "${id}" in pack ${packId}`,
      'The rule id did not match any rule in the selected pack.',
      'Run "packs" to list packs, or "explain" with a rule id from the output of a check.',
    ),

  overridesUnreadable: (path: string, detail: string) =>
    new CliError(
      'SP-OVERRIDE-000',
      EXIT.PACK,
      `Could not read the overrides file ${path}`,
      detail,
      'Expected a JSON file with an "overrides" array of { ruleId, to, reason }.',
    ),

  overridesMalformed: (path: string, detail: string) =>
    new CliError(
      'SP-OVERRIDE-005',
      EXIT.PACK,
      `${path} is not a valid overrides file`,
      detail,
      'Expected { "overrides": [ { "ruleId": "...", "to": "warning", "reason": "..." } ] }.',
    ),

  /**
   * The engine refused an override. Its OverrideError already carries a stable
   * code and a message written for a person, so this passes both through rather
   * than restating them badly one layer up.
   */
  overrideRejected: (code: string, message: string) =>
    new CliError(
      code,
      EXIT.PACK,
      'An override was refused, so nothing was checked',
      message,
      'Fix the override file and run again. A partial check would be worse than none.',
    ),

  flagNeedsValue: (name: string) =>
    new CliError(
      'SP-ARG-002',
      EXIT.PACK,
      `--${name} needs a value`,
      'It was given at the end of the command, or immediately followed by another flag.',
      `Write --${name} followed by its value.`,
    ),

  badThreshold: (value: string) =>
    new CliError(
      'SP-ARG-001',
      EXIT.PACK,
      `--fail-on does not accept "${value}"`,
      'Valid thresholds are error, warning and info.',
      'Omit --fail-on to use the default, which is error.',
    ),
} as const;
