/**
 * How many components a document lists, and how many carry an identifier.
 *
 * This is the number doc 3 flow B calls the conversion moment: "1,247 of 5,088
 * components could not be identified from this file alone." It is computable in
 * the free tier without doing any matching, which is the point: it is a
 * measurement of the document, not a claim about what StratifyPro could find.
 *
 * THE COUNTING RULES ARE NOT INVENTED HERE. They are a port of
 * scripts/coverage.py, which produced the published figures in
 * docs/coverage-baseline.md. A second definition that disagreed with the
 * published baseline would be worse than no number, and the baseline document
 * already records what happens when a number comes from a script nobody kept:
 * the 13 September run could not be reproduced and two of its ten figures were
 * wrong, one by a factor of three.
 *
 * "From this file alone" is meant literally, so the alias dictionary is NOT
 * consulted. A name this project could resolve is still a name the file did not
 * identify, and counting those as identified would make the number prettier and
 * less true.
 */

/**
 * NOASSERTION and NONE assert nothing. Treating them as present is the most
 * common way an SBOM tool overstates coverage: SPDX producers emit NOASSERTION
 * by the thousand, and one corpus file carries 4,140 of them.
 */
const NOT_A_VALUE = new Set(['', 'NOASSERTION', 'NONE', 'NOASSERTION.']);

function clean(v: unknown): boolean {
  return typeof v === 'string' && !NOT_A_VALUE.has(v.trim());
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** An array, or an empty one. A `components` key holding an object used to throw. */
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export interface Coverage {
  /** Every component in the document, nested ones included. */
  total: number;
  /**
   * Components at the top level of the document.
   *
   * Separate from `total` because the rule packs select `$.components[*]`, and
   * the JSONPath subset in jsonpath.ts has no descendant operator. Nested
   * components are therefore counted here and examined by no per-component
   * rule. Printing `total` beside a finding count implied every one of them had
   * been looked at: a container SBOM whose one top level component passes every
   * rule, with a thousand bare children, reported "1,001 components. 16 rules
   * ran. Nothing flagged." Whoever renders this has to be able to say which
   * number is which.
   */
  topLevel: number;
  /** Carries a purl or a cpe, so an advisory source could be queried for it. */
  identified: number;
  /**
   * Counted separately so this port can be checked against the published
   * baseline in docs/coverage-baseline.json, which holds both figures. A port
   * producing only the combined number could drift from coverage.py with no
   * test noticing.
   */
  purl: number;
  cpe: number;
}

const EMPTY: Coverage = { total: 0, topLevel: 0, identified: 0, purl: 0, cpe: 0 };

/**
 * CycloneDX components nest. coverage.py walks the tree with an explicit stack
 * and so does this: a top-level count would miss the sub-components that
 * container and application SBOMs put most of their entries in.
 */
function cycloneDxComponents(doc: Record<string, unknown>): {
  all: Record<string, unknown>[];
  topLevel: number;
} {
  const top = asArray(doc['components']).filter(isRecord);
  const all: Record<string, unknown>[] = [];
  const stack = [...top];
  while (stack.length > 0) {
    const c = stack.shift();
    if (!isRecord(c)) continue;
    all.push(c);
    stack.push(...asArray(c['components']).filter(isRecord));
  }
  return { all, topLevel: top.length };
}

export function coverage(doc: unknown): Coverage {
  if (!isRecord(doc)) return EMPTY;

  // CycloneDX FIRST, and the condition is coverage.py's verbatim:
  //   rows, deps, comp = (cdx(doc) if "components" in doc or doc.get("bomFormat") else spdx(doc))
  //
  // This was the other way round, testing `packages` first. A CycloneDX
  // document that also carries a `packages` key was then counted as SPDX, and
  // if that key held an empty array the worker's `cover.total === 0` branch
  // told the user "This file parsed, but it lists no components" about a file
  // with components in it. coverage.py returns the right answer for both.
  if ('components' in doc || doc['bomFormat']) {
    const { all, topLevel } = cycloneDxComponents(doc);
    let identified = 0;
    let nPurl = 0;
    let nCpe = 0;
    for (const c of all) {
      const purl = clean(c['purl']);
      const cpe = clean(c['cpe']);
      if (purl) nPurl += 1;
      if (cpe) nCpe += 1;
      if (purl || cpe) identified += 1;
    }
    return { total: all.length, topLevel, identified, purl: nPurl, cpe: nCpe };
  }

  const pkgs = asArray(doc['packages']).filter(isRecord);
  let identified = 0;
  let nPurl = 0;
  let nCpe = 0;
  for (const p of pkgs) {
    const refs = asArray(p['externalRefs']).filter(isRecord);
    const purl = refs.some((r) => r['referenceType'] === 'purl' && clean(r['referenceLocator']));
    // cpe22Type and cpe23Type both count, as in coverage.py.
    const cpe = refs.some(
      (r) => String(r['referenceType'] ?? '').startsWith('cpe') && clean(r['referenceLocator']),
    );
    if (purl) nPurl += 1;
    if (cpe) nCpe += 1;
    if (purl || cpe) identified += 1;
  }
  // SPDX 2.x packages do not nest, so every one of them is top level.
  return { total: pkgs.length, topLevel: pkgs.length, identified, purl: nPurl, cpe: nCpe };
}
