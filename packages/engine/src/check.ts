import { evaluate, type Assertion } from './assert.js';
import { jsonPathNodes, type Json } from './jsonpath.js';
import { isSpdx3, normaliseSpdx3 } from './spdx3.js';
import { validateOverrides } from './overrides.js';
import type {
  CheckOptions,
  CheckResult,
  DetectResult,
  EmptySelectorBehaviour,
  Finding,
  InertOverride,
  OverrideRequest,
  Severity,
  SeverityOverride,
  SkippedRule,
  SourceFormat,
} from './types.js';

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  severityJustification: string;
  onEmptySelector: EmptySelectorBehaviour;
  onEmptySelectorJustification: string;
  appliesTo: SourceFormat[];
  selector: Record<string, string> | string;
  assert: Assertion | Record<string, Assertion>;
  fix: string;
  sourceDocument: string;
  sourceLocation: string;
  note?: string;
}

export interface RulePack {
  id: string;
  version: string;
  title: string;
  rules: Rule[];
}

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Which format this document is, and which version of it.
 *
 * Throws rather than returning null. An undetectable document would otherwise
 * match no rule's appliesTo and produce an empty result, which reads as a clean
 * file rather than one that could not be processed.
 */
export function detectFormat(doc: Json): DetectResult {
  if (!isRecord(doc)) throw new Error('not an object: expected a parsed SBOM document');
  if (typeof doc['spdxVersion'] === 'string') {
    return { format: 'spdx', spec: doc['spdxVersion'].replace(/^SPDX-/, '') };
  }
  // SPEC.md: "SPDX 2.x by spdxVersion, 3.x by the JSON-LD @context". This is
  // checked before SPDXID because a 3.0 document has no spdxVersion at all,
  // and the old order reported such a file as an undetectable format while
  // the error text claimed 3.0 was supported.
  if (isSpdx3(doc)) {
    const n = normaliseSpdx3(doc);
    return { format: 'spdx', spec: n.spec };
  }
  if ('SPDXID' in doc) return { format: 'spdx', spec: 'unknown' };
  if (doc['bomFormat'] === 'CycloneDX') {
    return { format: 'cyclonedx', spec: typeof doc['specVersion'] === 'string' ? doc['specVersion'] : 'unknown' };
  }
  if ('components' in doc) {
    return { format: 'cyclonedx', spec: typeof doc['specVersion'] === 'string' ? doc['specVersion'] : 'unknown' };
  }
  throw new Error(
    'format not detected: no spdxVersion, SPDXID, bomFormat or components. ' +
      'Supported: CycloneDX and SPDX.',
  );
}

/** Throws on an invalid pack. A pack that fails to load checks nothing. */
export function loadRulePack(json: Json): RulePack {
  if (!isRecord(json)) throw new Error('rule pack is not an object');
  const { id, version, rules } = json;
  if (typeof id !== 'string' || typeof version !== 'string') {
    throw new Error('rule pack is missing id or version');
  }
  if (!Array.isArray(rules)) throw new Error('rule pack is missing rules');
  for (const r of rules) {
    if (!isRecord(r)) throw new Error('rule is not an object');
    for (const k of ['id', 'severity', 'severityJustification', 'onEmptySelector', 'appliesTo', 'selector', 'assert']) {
      if (!(k in r)) throw new Error(`rule ${String(r['id'] ?? '?')} is missing ${k}`);
    }
  }
  return json as unknown as RulePack;
}

/**
 * Failing JSONPaths for one rule against one document, or null when the rule
 * does not apply to this format and belongs in skippedRules.
 *
 * Exported because the golden differential test compares exactly this.
 */
export function ruleFailures(doc: Json, rule: Rule, fmt: SourceFormat): string[] | null {
  const sel = typeof rule.selector === 'string' ? rule.selector : rule.selector[fmt];
  if (!sel) return null;

  let a: Assertion | Record<string, Assertion> = rule.assert;
  const keys = Object.keys(a);
  if (keys.length > 0 && keys.every((k) => k === 'cyclonedx' || k === 'spdx')) {
    const perFormat = (a as Record<string, Assertion>)[fmt];
    if (perFormat === undefined) return null;
    a = perFormat;
  }

  const pairs = jsonPathNodes(doc, sel);
  if (pairs.length === 0) {
    // The third case, declared per rule. Neither of the two specified cases
    // covers a document whose format supports the path but which carries no
    // such node.
    switch (rule.onEmptySelector) {
      case 'fire':
        return [sel]; // no node to point at; the selector is the locus
      case 'skip':
        return null; // same path as a format mismatch: skippedRules
      case 'pass':
        return [];
      default:
        throw new Error(`${rule.id}: unknown onEmptySelector ${String(rule.onEmptySelector)}`);
    }
  }
  return pairs.filter((p) => !evaluate(a as Assertion, p.node, doc)).map((p) => p.path);
}

function labelFor(doc: Json, path: string): string | undefined {
  const hit = jsonPathNodes(doc, path)[0];
  const n = hit?.node;
  if (!isRecord(n)) return undefined;
  const name = n['name'] ?? n['packageName'];
  if (typeof name !== 'string') return undefined;
  const version = n['version'] ?? n['versionInfo'];
  return typeof version === 'string' ? `${name} ${version}` : name;
}

export function check(
  doc: Json,
  pack: RulePack,
  opts: CheckOptions & { engineVersion?: string; fileSha256?: string } = {},
): CheckResult {
  const { format, spec } = detectFormat(doc);

  // An SPDX 3 document is a graph, and every SPDX selector in both packs names
  // a 2.x path. Converting here, once, is what lets thirty-nine rules that
  // encode regulatory meaning stay free of file syntax. What the conversion
  // did not use is carried on the result rather than dropped, because a field
  // this converter missed and a field the supplier omitted produce the same
  // finding, and only one of them is the supplier's fault.
  let evaluated: Json = doc;
  let normalisation: CheckResult['normalisation'];
  if (format === 'spdx' && isSpdx3(doc)) {
    const n = normaliseSpdx3(doc);
    evaluated = n.view;
    normalisation = {
      from: `SPDX ${n.spec} (JSON-LD)`,
      unmappedTypes: n.unmappedTypes,
      unmappedPackageKeys: n.unmappedPackageKeys,
      counts: n.counts,
    };
  }

  // Before anything is evaluated. A bad override file checks nothing rather
  // than checking most of the document and failing at the end, for the same
  // reason packInvalid refuses to check anything: a partial result on a
  // submission-evidence tool is worse than no result.
  const requested = opts.severityOverrides ?? [];
  validateOverrides(requested, pack);

  const overrideFor = new Map<string, OverrideRequest>();
  for (const o of requested) overrideFor.set(o.ruleId, o);

  const findings: Finding[] = [];
  const evaluatedRules: string[] = [];
  const skippedRules: SkippedRule[] = [];
  const overrides: SeverityOverride[] = [];
  const inertOverrides: InertOverride[] = [];

  /**
   * An override was asked for and did not change anything.
   *
   * This used to be the silent path. `overrideFor.get` ran after both `continue`
   * statements below, so overriding a rule that did not apply to the document's
   * format left no trace anywhere in the result: the user got exactly the output
   * they would have got if they had never written the override at all.
   */
  const recordInert = (ruleId: string, whyInert: string): void => {
    const o = overrideFor.get(ruleId);
    if (o) inertOverrides.push({ ruleId, to: o.to, reason: o.reason, whyInert });
  };

  for (const rule of pack.rules) {
    if (!rule.appliesTo.includes(format)) {
      const reason = `does not apply to ${format}`;
      skippedRules.push({ ruleId: rule.id, reason, kind: 'not-applicable' });
      recordInert(rule.id, `the rule ${reason}, so there was no severity to change`);
      continue;
    }
    const paths = ruleFailures(evaluated, rule, format);
    if (paths === null) {
      const reason = `${format} has no path for this rule, or the rule declares onEmptySelector: skip`;
      skippedRules.push({ ruleId: rule.id, reason, kind: 'no-path' });
      recordInert(rule.id, `the rule did not run: ${reason}`);
      continue;
    }
    evaluatedRules.push(rule.id);

    const o = overrideFor.get(rule.id);
    // Asking for the severity the pack already assigns changes nothing. It is
    // not a mistake worth refusing the run over, because a pack upgrade does
    // exactly this to an override written against the previous version, but it
    // is not an applied override either and must not be counted as one.
    if (o && o.to === rule.severity) {
      recordInert(rule.id, `the pack already assigns severity ${rule.severity} to this rule`);
    }
    // A rule that ran and found nothing had no severity to change either. This
    // push used to sit outside the loop below, so an override on a clean rule
    // was recorded as applied and the report's header then asserted that the
    // counts were not the ones the pack assigns, when they were identical to
    // them. Wrong in the safe direction, but a false sentence in a submission
    // artifact, and it dilutes a caveat whose whole job is to be believed.
    const applied = o && o.to !== rule.severity && paths.length > 0 ? o : undefined;
    if (o && o.to !== rule.severity && paths.length === 0) {
      recordInert(rule.id, 'the rule ran and found nothing, so no severity was changed');
    }
    const severity = applied ? applied.to : rule.severity;
    if (applied) overrides.push({ ...applied, from: rule.severity });

    for (const path of paths) {
      const component = labelFor(evaluated, path);
      findings.push({
        ruleId: rule.id,
        title: rule.title,
        severity,
        // The pack's justification argues for the pack's severity. When an
        // override has moved the finding, that prose argues for a severity the
        // finding no longer states, so the finding carries the one it came
        // from. A renderer showing findings one at a time has no reason to read
        // the sibling overrides array, and without this it would show "info"
        // beside an argument that the rule is an error, with nothing saying a
        // person moved it.
        severityJustification: rule.severityJustification,
        ...(applied === undefined ? {} : { overriddenFrom: rule.severity }),
        path,
        ...(component === undefined ? {} : { component }),
        fix: rule.fix,
        sourceRef: `${rule.sourceDocument}: ${rule.sourceLocation}`,
        code: `SP-RULE-${rule.id}`,
      });
    }
  }

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0, advisory: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return {
    engineVersion: opts.engineVersion ?? '0.0.0',
    rulePackId: pack.id,
    rulePackVersion: pack.version,
    sourceFormat: format,
    sourceSpec: spec,
    fileSha256: opts.fileSha256 ?? '',
    findings,
    counts,
    evaluatedRules,
    skippedRules,
    overrides,
    inertOverrides,
    ...(opts.overridesSource === undefined ? {} : { overridesSource: opts.overridesSource }),
    ...(normalisation === undefined ? {} : { normalisation }),
  };
}
