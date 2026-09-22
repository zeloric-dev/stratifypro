/**
 * Pull the components out of a bill of materials, with what it declares about them.
 *
 * Lives here rather than in the CLI because `Component` is this package's type
 * and the web app will want the same walk. It deliberately does NOT reuse
 * packages/engine's coverage walk: that one counts nodes for a coverage figure
 * and treats a nested component as a row, and this one needs the version and
 * the declared advisories alongside. Two walks with two jobs, each tested.
 *
 * BOTH FORMATS, AND THE ORDER MATTERS. A CycloneDX document is detected first,
 * by `components` or `bomFormat`, because a CycloneDX file carrying an empty
 * `packages` key was once counted as SPDX and reported as listing no components
 * at all.
 */
import type { Component } from './index.js';

interface CycloneComponent {
  name?: string;
  version?: string;
  purl?: string;
  'bom-ref'?: string;
  components?: CycloneComponent[];
}

interface SpdxPackage {
  name?: string;
  versionInfo?: string;
  SPDXID?: string;
  externalRefs?: Array<{ referenceType?: string; referenceLocator?: string }>;
}

interface Document {
  bomFormat?: string;
  components?: CycloneComponent[];
  packages?: SpdxPackage[];
  vulnerabilities?: Array<{
    id?: string;
    affects?: Array<{ ref?: string }>;
    references?: Array<{ id?: string }>;
  }>;
}

/**
 * Advisory ids the document declares, grouped by the component they affect.
 *
 * CycloneDX puts vulnerabilities at the top level and points at components by
 * `bom-ref`. A vulnerability with no `affects` is declared about the document
 * as a whole, so it is returned under the empty key and applies to everything:
 * a supplier who says "we know about CVE-X" has said it, and holding them to a
 * bom-ref they did not write would be pedantry that changes a finding.
 */
function declaredByRef(doc: Document): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const v of doc.vulnerabilities ?? []) {
    const ids = [v.id, ...(v.references ?? []).map((r) => r.id)].filter(
      (x): x is string => typeof x === 'string' && x !== '',
    );
    if (ids.length === 0) continue;
    const refs = (v.affects ?? []).map((a) => a.ref).filter((r): r is string => typeof r === 'string');
    for (const ref of refs.length > 0 ? refs : ['']) {
      out.set(ref, [...(out.get(ref) ?? []), ...ids]);
    }
  }
  return out;
}

/**
 * Every component in the document, flattened, with its declared advisories.
 *
 * Nested components are included: a CycloneDX file can nest a component inside
 * another, and the nested one is as much a part of the device as its parent.
 */
export function componentsFrom(doc: unknown): Component[] {
  const d = (doc ?? {}) as Document;
  const declared = declaredByRef(d);
  const everywhere = declared.get('') ?? [];
  const out: Component[] = [];

  const attach = (ref: string | undefined): readonly string[] | undefined => {
    const own = ref ? (declared.get(ref) ?? []) : [];
    const all = [...own, ...everywhere];
    return all.length > 0 ? all : undefined;
  };

  // CycloneDX first. `bomFormat` catches a document whose component list is
  // empty or absent, which is exactly the case that got misread as SPDX.
  if (Array.isArray(d.components) || d.bomFormat) {
    const stack: CycloneComponent[] = [...(d.components ?? [])];
    while (stack.length > 0) {
      const c = stack.shift();
      if (!c || typeof c !== 'object') continue;
      stack.push(...(c.components ?? []));
      const dec = attach(c['bom-ref']);
      out.push({
        name: c.name ?? '',
        version: c.version ?? null,
        purl: c.purl ?? null,
        ...(dec ? { declared: dec } : {}),
      });
    }
    return out;
  }

  for (const p of d.packages ?? []) {
    const purl =
      (p.externalRefs ?? []).find((r) => r.referenceType === 'purl')?.referenceLocator ?? null;
    const dec = attach(p.SPDXID);
    out.push({
      name: p.name ?? '',
      version: p.versionInfo ?? null,
      purl,
      ...(dec ? { declared: dec } : {}),
    });
  }
  return out;
}
