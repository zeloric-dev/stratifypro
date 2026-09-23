/**
 * The engine contract.
 *
 * This package declares zero runtime dependencies on purpose. The same rule
 * evaluation runs in a browser tab with no network, in CI with no browser, and
 * on a server, and one published package with a version number is the only way
 * that stays honest. It is also what keeps the answer to "what is in your tool"
 * short enough for a regulatory affairs director to accept.
 *
 * Nothing here may import from apps/.
 */

export type Severity = 'error' | 'warning' | 'info' | 'advisory';

export type SourceFormat = 'cyclonedx' | 'spdx';

/**
 * What the engine does when a rule's selector matches zero nodes in a document
 * whose format does support that path.
 *
 * This is a third case, distinct from the two already specified: a rule whose
 * appliesTo excludes the detected format is skipped, and a rule referencing a
 * path the format lacks entirely is skipped. Neither covers a CycloneDX
 * document that simply carries no hashes, which is the common case. Left to an
 * implementer it would be guessed, and two implementations would guess
 * differently.
 */
export type EmptySelectorBehaviour = 'fire' | 'skip' | 'pass';

/**
 * How an identity was established. This replaces a confidence percentage.
 *
 * The benchmark measures precision, recall, F1 and abstention. It does not
 * measure calibration, so a displayed "73%" would assert a calibrated
 * probability to a regulatory reader that nothing here can support. The method
 * is strictly more informative and it is defensible.
 */
export type ResolutionMethod =
  | 'exact'
  | 'dictionary'
  | 'heuristic'
  | 'model-suggested'
  | 'human-confirmed';

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  severityJustification: string;
  /**
   * Set only when a severity override moved this finding, and holding the
   * severity the rule pack assigns.
   *
   * `severityJustification` above is the pack's argument for the pack's
   * severity. Once an override has moved a finding, that prose argues for a
   * severity the finding no longer states. A renderer that shows findings one
   * at a time has no reason to read the sibling `overrides` array, so without
   * this it would print "info" beside an argument that the rule is an error,
   * with nothing to say that a person moved it.
   */
  overriddenFrom?: Severity;
  /** JSONPath to the exact node, e.g. $.components[7] */
  path: string;
  /** Human label, e.g. "libssl 3.0.2" */
  component?: string;
  fix: string;
  sourceRef: string;
  /** Stable identifier a user can search for, e.g. SP-RULE-CISA-CD-004 */
  code: string;
  /** Where to read more. A finding a user cannot check is one they will not trust. */
  docsUrl?: string;
}

/**
 * A severity changed from the pack default, recorded as evidence.
 *
 * The reason is required. It mirrors severityJustification, and it turns an
 * escape hatch into part of the record: a reader sees the findings and every
 * place the firm disagreed with a default, and why. That is a better artifact
 * than one with no overrides at all.
 */
export interface SeverityOverride {
  ruleId: string;
  from: Severity;
  to: Severity;
  reason: string;
}

/**
 * Where a set of overrides came from, recorded whether or not any applied.
 *
 * Supplying an overrides file that yields nothing used to produce output
 * byte-identical to not supplying one: an empty array, a stale path in CI, a
 * shell that word-split the argument, or a hand-merged file with a duplicate
 * top-level "overrides" key (JSON.parse takes the last one) all read
 * successfully and then vanished. That is the failure this whole feature is
 * written against, reappearing one level up.
 *
 * The count is what the file asked for, not what took effect. Those two
 * numbers differing is exactly what a reader needs to notice.
 */
export interface OverridesSource {
  /** As the user wrote it, so they can recognise the file they meant. */
  path: string;
  sha256: string;
  /** How many entries were in the file. Zero is an answer, not an absence. */
  requested: number;
}

/** What a caller supplies. `from` is deliberately absent: the pack decides it. */
export interface OverrideRequest {
  ruleId: string;
  to: Severity;
  reason: string;
}

/**
 * An override that was declared and changed nothing.
 *
 * Three ways this happens. The rule did not run on this document at all (wrong
 * format, or its selector matched nothing and it declares onEmptySelector:
 * skip). The pack already assigns the severity being asked for, which is what a
 * pack upgrade does to an override written against the old version. Or the rule
 * ran and found nothing, so there was no finding whose severity could change.
 *
 * Neither is an error. Both are silent by default, and silent is the problem.
 * A user who writes an override and sees no change in the output has no way to
 * tell "it worked and there was nothing to change" from "it never ran", so the
 * result says which, in the same place the applied ones are recorded.
 */
export interface InertOverride {
  ruleId: string;
  to: Severity;
  reason: string;
  /** Why it changed nothing on this document, in the user's words, not a code. */
  whyInert: string;
}

/**
 * Per-source outcome for the matching layer.
 *
 * CheckResult carries evaluatedRules and skippedRules so that "no findings" and
 * "the rules never ran" can never look the same. The matching layer needs the
 * same guarantee: an advisory source that was unreachable must not render as a
 * clean bill of health on a document attached to a submission.
 */
export interface SourceStatus {
  id: string;
  queriedAt: string;
  status: 'complete' | 'partial' | 'unavailable';
  componentsCovered: number;
  snapshotId: string;
}

/**
 * Why a rule did not run. These are two different facts about a document and
 * they were both called "skipped".
 *
 * `not-applicable`: the rule's appliesTo excludes this format. It was never
 * going to run and nothing about the file could change that. A CycloneDX rule
 * against an SPDX document is not a gap in the document.
 *
 * `no-path`: the rule applies to this format and still did not run, because the
 * document has no node at its selector and the rule declares onEmptySelector:
 * skip. That IS a fact about this file.
 *
 * A reader who sees one number cannot tell "this pack half covers your format"
 * from "your file is missing the structures these rules look at", and those
 * call for different actions. Doc 3 flow B requires all three counts on the
 * summary bar for exactly this reason.
 */
export type SkipKind = 'not-applicable' | 'no-path';

export interface SkippedRule {
  ruleId: string;
  reason: string;
  kind: SkipKind;
}

export interface CheckResult {
  engineVersion: string;
  rulePackId: string;
  rulePackVersion: string;
  sourceFormat: SourceFormat;
  sourceSpec: string;
  fileSha256: string;
  findings: Finding[];
  counts: Record<Severity, number>;
  /** Every rule id that ran, including passes. */
  evaluatedRules: string[];
  skippedRules: SkippedRule[];
  /** Overrides that took effect. Every one of these changed a finding's severity. */
  overrides: SeverityOverride[];
  /** Overrides that were declared and changed nothing, each saying why. */
  inertOverrides: InertOverride[];
  /** The file the overrides came from, present whenever one was supplied. */
  overridesSource?: OverridesSource;
  sources?: SourceStatus[];
  /**
   * Present only when the document was SPDX 3.x and had to be converted before
   * any rule could read it.
   *
   * It is on the result rather than in a log because a reader of the report is
   * entitled to know that the findings were produced from a converted view of
   * their file and not from the file itself. `unmappedTypes` and
   * `unmappedPackageKeys` are the honest part: they name what the converter did
   * not use, which is where a false "missing element" would come from.
   */
  normalisation?: {
    from: string;
    unmappedTypes: string[];
    unmappedPackageKeys: string[];
    counts: { packages: number; relationships: number; agents: number; annotations: number };
  };
}

export interface CheckOptions {
  /**
   * Requests, not assertions: the caller says which rule and which new
   * severity, and the pack supplies the old one. A caller who could state
   * `from` could state it wrongly, and the report would then carry a false
   * claim about what the rule used to say.
   */
  severityOverrides?: OverrideRequest[];
  /** Identity of the file the above came from, so the result can record it. */
  overridesSource?: OverridesSource;
  /** IANA hash names and similar vocabularies a rule may check against. */
  vocabularies?: Record<string, readonly string[]>;
}

export interface DetectResult {
  format: SourceFormat;
  spec: string;
}
