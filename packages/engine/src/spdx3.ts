/**
 * SPDX 3.0 to the shape the rules already read. SPEC step 1.2.
 *
 * WHY NORMALISE RATHER THAN ADD A THIRD DIALECT TO EVERY RULE. The rule packs
 * are the regulatory source of truth: each rule maps to one CISA element or one
 * FDA expectation, and the question each one asks is about INFORMATION, not
 * syntax. "Does this document state who supplies each component" is the same
 * question whether the answer sits in `packages[].supplier` or behind a
 * `suppliedBy` reference to an Agent. Teaching all thirty-nine rules a third
 * file format would put file syntax into the artefact that is supposed to hold
 * regulatory meaning, and the next SPDX release would need thirty-nine more
 * edits. One converter, in one file, is the thing to review.
 *
 * SPDX 3.0 IS NOT 2.3 WITH DIFFERENT SPELLING. It is a graph. Elements live in
 * `@graph`, they refer to each other by identifier, and information that 2.3
 * kept inside a package is 3.0 reached through a relationship: a licence is a
 * separate element joined by `hasDeclaredLicense`, and a supplier is an Agent
 * joined by `suppliedBy`. So this file resolves references rather than renaming
 * keys, and most of its length is that resolution.
 *
 * THE DANGEROUS FAILURE IS SILENT AND IT IS NOT A CRASH. If this converter
 * misses a field that the document really does carry, every rule that reads
 * that field reports a missing CISA element, and the report says a supplier's
 * submission is short of a regulatory requirement when it is not. A false
 * "missing" on submission evidence is the worst output this project can
 * produce. Two things guard it:
 *
 *   `unmapped` records every element type and every package key this converter
 *   did not use, so what was ignored is countable rather than invisible.
 *
 *   A pair of corpus fixtures says the same thing in 2.3 and in 3.0.1, and a
 *   test requires both to produce identical findings. That is the only check
 *   here that can tell a real absence from a conversion that lost something.
 */
import type { Json } from './jsonpath.js';

/** The 2.x-shaped view, plus an account of what was not used to build it. */
export interface Spdx3Normalised {
  /** A document the existing SPDX selectors can read. */
  view: Record<string, Json>;
  /** The version this document declares, e.g. "3.0.1". */
  spec: string;
  /** Element types in @graph that this converter has no mapping for. */
  unmappedTypes: string[];
  /** Keys on software_Package elements that were not read. */
  unmappedPackageKeys: string[];
  /** How many elements of each kind were converted. */
  counts: { packages: number; relationships: number; agents: number; annotations: number };
}

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: Json | undefined): Json[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: Json | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * The element's type, without the profile prefix and without the case.
 *
 * A 3.0 serialiser may write `software_Package`, `Package`, or a fully
 * qualified IRI, and `type` or `@type`. All four mean the same element, and a
 * converter that recognised only one spelling would silently find no packages
 * in a valid document and report an empty SBOM.
 */
function typeOf(el: Record<string, Json>): string {
  const raw = str(el['type']) ?? str(el['@type']) ?? '';
  const last = raw.split(/[#/]/).pop() ?? raw;
  return last.replace(/^(software_|simplelicensing_|security_|build_|ai_|dataset_)/, '').toLowerCase();
}

/** An element's identifier, under either of the names in use. */
function idOf(el: Record<string, Json>): string | undefined {
  return str(el['spdxId']) ?? str(el['@id']);
}

/** Every element in the document, whether it uses @graph or not. */
function elementsOf(doc: Record<string, Json>): Array<Record<string, Json>> {
  const graph = doc['@graph'];
  if (Array.isArray(graph)) return graph.filter(isRecord);
  // A single-element document, or one where the graph was inlined. Reading
  // the top level as one element is better than reporting an empty document.
  if (typeOf(doc) !== '') return [doc];
  return [];
}

/**
 * Is this an SPDX 3.x document?
 *
 * SPEC.md says 3.x is identified by the JSON-LD `@context`, and that is the
 * primary test. The fallbacks exist because a document assembled by hand, or
 * trimmed by a tool, can lose the context and still be unmistakably 3.0: it has
 * a `@graph` of typed elements, or a CreationInfo carrying `specVersion`.
 * Guessing wrong in this direction is safe, because a document that is not
 * SPDX 3 will fail to normalise and be refused by name.
 */
export function isSpdx3(doc: Json): boolean {
  if (!isRecord(doc)) return false;
  const ctx = doc['@context'];
  const ctxText = typeof ctx === 'string' ? ctx : JSON.stringify(ctx ?? '');
  if (/spdx\.org\/rdf\/3\./.test(ctxText)) return true;
  // 2.x has spdxVersion at the top level and no graph. Never confuse the two.
  if (typeof doc['spdxVersion'] === 'string') return false;
  const els = elementsOf(doc);
  if (els.length === 0) return false;
  return els.some((e) => {
    const t = typeOf(e);
    return t === 'creationinfo' || t === 'spdxdocument' || t === 'package' || t === 'sbom';
  });
}

/** The declared version: from CreationInfo if present, else from @context. */
function versionOf(doc: Record<string, Json>, els: Array<Record<string, Json>>): string {
  for (const e of els) {
    if (typeOf(e) === 'creationinfo') {
      const v = str(e['specVersion']);
      if (v) return v;
    }
  }
  const ctx = doc['@context'];
  const ctxText = typeof ctx === 'string' ? ctx : JSON.stringify(ctx ?? '');
  const m = /spdx\.org\/rdf\/(\d+\.\d+(?:\.\d+)?)/.exec(ctxText);
  return m ? (m[1] as string) : 'unknown';
}

/** Keys on a package that this converter reads. Everything else is reported. */
const PACKAGE_KEYS_USED = new Set([
  'type', '@type', 'spdxId', '@id', 'creationInfo', 'name', 'summary', 'description',
  'software_packageVersion', 'packageVersion',
  'software_packageUrl', 'packageUrl',
  'suppliedBy', 'originatedBy', 'builtBy',
  'verifiedUsing',
  'externalIdentifier', 'externalRef', 'software_additionalPurpose', 'software_primaryPurpose',
  'software_downloadLocation', 'software_homePage', 'software_copyrightText',
  'comment', 'extension',
]);

/**
 * Convert an SPDX 3.0 document into the 2.x shape the rules read.
 *
 * The output is not a valid SPDX 2.3 document and is not meant to be one. It is
 * a view: the same information, at the paths the rule packs already name.
 */
export function normaliseSpdx3(doc: Json): Spdx3Normalised {
  if (!isRecord(doc)) throw new Error('not an object: expected a parsed SPDX 3 document');
  const els = elementsOf(doc);
  const spec = versionOf(doc, els);

  const byId = new Map<string, Record<string, Json>>();
  for (const e of els) {
    const id = idOf(e);
    if (id) byId.set(id, e);
  }
  const resolve = (ref: Json | undefined): Record<string, Json> | undefined => {
    if (isRecord(ref)) return ref; // already inlined
    const id = str(ref);
    return id ? byId.get(id) : undefined;
  };

  const creationInfos: Array<Record<string, Json>> = [];
  const packages: Array<Record<string, Json>> = [];
  const relationships: Array<Record<string, Json>> = [];
  const annotations: Array<Record<string, Json>> = [];
  const agents: Array<Record<string, Json>> = [];
  const documents: Array<Record<string, Json>> = [];
  const unmappedTypes = new Set<string>();
  const unmappedPackageKeys = new Set<string>();

  for (const e of els) {
    switch (typeOf(e)) {
      case 'creationinfo': creationInfos.push(e); break;
      case 'package': case 'file': case 'snippet': packages.push(e); break;
      case 'relationship': case 'lifecyclescopedrelationship': relationships.push(e); break;
      case 'annotation': annotations.push(e); break;
      case 'agent': case 'person': case 'organization': case 'softwareagent': case 'tool':
        agents.push(e); break;
      case 'spdxdocument': case 'sbom': case 'bom': documents.push(e); break;
      case 'licenseexpression': case 'anylicenseinfo': case 'customlicense':
      case 'listedlicense': case 'noassertionlicense': case 'nonelicense':
        break; // reached through relationships, never listed on its own
      case 'hash': case 'packageverificationcode': case 'externalmap':
      case 'namespacemap': case 'positivintegerrange':
        break; // only ever appear inline
      case '': break; // an untyped node, such as a bare reference
      default: unmappedTypes.add(typeOf(e));
    }
  }

  /**
   * An agent's display name, which is what 2.x `creators` holds as text.
   *
   * ARRAYS ARE THE NORMAL CASE, not an edge one. In the SPDX project's own
   * 3.0.1 example, `originatedBy` is `["...#JoshuaWatt"]`. A first draft of
   * this function took only a scalar, returned undefined for the array, and
   * dropped the originator from every package in the file. The document plainly
   * states who originated the software; the report would have said it does not,
   * against CISA-CD-001 and FDA-NTIA-001. That is a false "missing regulatory
   * element" on a supplier's submission, which is the worst output this project
   * can produce, and no test that existed at the time could have caught it.
   */
  const agentName = (ref: Json | undefined): string | undefined => {
    if (Array.isArray(ref)) {
      for (const one of ref) {
        const n = agentName(one);
        if (n) return n;
      }
      return undefined;
    }
    const a = resolve(ref);
    if (!a) return str(ref); // an unresolvable reference is still evidence of one
    const name = str(a['name']);
    if (!name) return undefined;
    const t = typeOf(a);
    // 2.x writes "Organization: name" / "Person: name" / "Tool: name", and
    // CISA-MD-001 rejects a bare acronym, so the prefix has to survive.
    if (t === 'organization') return `Organization: ${name}`;
    if (t === 'person') return `Person: ${name}`;
    if (t === 'tool' || t === 'softwareagent') return `Tool: ${name}`;
    return name;
  };

  // ---- creationInfo ------------------------------------------------------

  const ci = creationInfos[0];
  const creators: string[] = [];
  if (ci) {
    for (const ref of asArray(ci['createdBy'])) {
      const n = agentName(ref);
      if (n) creators.push(n);
    }
    for (const ref of asArray(ci['createdUsing'])) {
      const n = agentName(ref);
      if (n) creators.push(n.startsWith('Tool: ') ? n : `Tool: ${n}`);
    }
  }
  const creationInfo: Record<string, Json> = {};
  if (creators.length > 0) creationInfo['creators'] = creators;
  const created = ci ? str(ci['created']) : undefined;
  if (created) creationInfo['created'] = created;
  const ciComment = ci ? str(ci['comment']) : undefined;
  if (ciComment) creationInfo['comment'] = ciComment;

  // ---- licences, which are a relationship in 3.0 -------------------------

  const licenceText = (ref: Json | undefined): string | undefined => {
    const l = resolve(ref);
    if (!l) return str(ref);
    return (
      str(l['simplelicensing_licenseExpression']) ??
      str(l['licenseExpression']) ??
      str(l['name']) ??
      (typeOf(l) === 'noassertionlicense' ? 'NOASSERTION' : undefined) ??
      (typeOf(l) === 'nonelicense' ? 'NONE' : undefined)
    );
  };

  const declared = new Map<string, string>();
  const concluded = new Map<string, string>();
  for (const rel of relationships) {
    const kind = (str(rel['relationshipType']) ?? '').toLowerCase();
    const from = str(rel['from']);
    if (!from) continue;
    for (const to of asArray(rel['to'])) {
      const text = licenceText(to);
      if (!text) continue;
      if (kind === 'hasdeclaredlicense') declared.set(from, text);
      else if (kind === 'hasconcludedlicense') concluded.set(from, text);
    }
  }

  // Annotations attach to their subject by reference in 3.0.
  const annotationsFor = new Map<string, Json[]>();
  for (const a of annotations) {
    for (const subj of asArray(a['subject'])) {
      const id = str(subj);
      if (!id) continue;
      const list = annotationsFor.get(id) ?? [];
      list.push({
        annotationType: (str(a['annotationType']) ?? 'OTHER').toUpperCase(),
        comment: str(a['statement']) ?? str(a['comment']) ?? '',
      });
      annotationsFor.set(id, list);
    }
  }

  // ---- packages ----------------------------------------------------------

  const outPackages: Json[] = packages.map((p) => {
    for (const k of Object.keys(p)) if (!PACKAGE_KEYS_USED.has(k)) unmappedPackageKeys.add(k);

    const out: Record<string, Json> = {};
    const id = idOf(p);
    if (id) out['SPDXID'] = id;
    const name = str(p['name']);
    if (name) out['name'] = name;
    const version = str(p['software_packageVersion']) ?? str(p['packageVersion']);
    if (version) out['versionInfo'] = version;

    const supplier = agentName(p['suppliedBy']);
    if (supplier) out['supplier'] = supplier;
    const originator = agentName(p['originatedBy']) ?? agentName(p['builtBy']);
    if (originator) out['originator'] = originator;

    // verifiedUsing carries Hash elements, which are 2.x checksums.
    const checksums: Json[] = [];
    for (const h of asArray(p['verifiedUsing'])) {
      const hh = resolve(h);
      if (!hh || typeOf(hh) !== 'hash') continue;
      const algorithm = str(hh['algorithm']);
      const value = str(hh['hashValue']);
      if (!value) continue;
      checksums.push({
        // 2.x spells them SHA256 and SHA1; 3.0 spells them sha256 and sha1.
        algorithm: algorithm ? algorithm.toUpperCase().replace(/[^A-Z0-9]/g, '') : 'NOASSERTION',
        checksumValue: value,
      });
    }
    if (checksums.length > 0) out['checksums'] = checksums;

    const externalRefs: Json[] = [];
    const purl = str(p['software_packageUrl']) ?? str(p['packageUrl']);
    if (purl) {
      externalRefs.push({
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: purl,
      });
    }
    for (const ref of asArray(p['externalIdentifier'])) {
      const r = resolve(ref) ?? (isRecord(ref) ? ref : undefined);
      if (!r) continue;
      const kind = (str(r['externalIdentifierType']) ?? '').toLowerCase();
      const locator = str(r['identifier']);
      if (!locator) continue;
      if (kind === 'packageurl' && purl) continue; // already recorded
      externalRefs.push({
        referenceCategory: kind === 'cpe22' || kind === 'cpe23' ? 'SECURITY' : 'OTHER',
        referenceType: kind === 'packageurl' ? 'purl' : kind || 'other',
        referenceLocator: locator,
      });
    }
    if (externalRefs.length > 0) out['externalRefs'] = externalRefs;

    if (id && declared.has(id)) out['licenseDeclared'] = declared.get(id) as string;
    if (id && concluded.has(id)) out['licenseConcluded'] = concluded.get(id) as string;
    if (id && annotationsFor.has(id)) out['annotations'] = annotationsFor.get(id) as Json[];

    const download = str(p['software_downloadLocation']);
    if (download) out['downloadLocation'] = download;
    const copyright = str(p['software_copyrightText']);
    if (copyright) out['copyrightText'] = copyright;
    const comment = str(p['comment']);
    if (comment) out['comment'] = comment;

    return out;
  });

  // ---- the document itself -----------------------------------------------

  const view: Record<string, Json> = {
    // Carried so that a rule asking "does this declare its format and version"
    // sees the truth: this document did say, in 3.0's own way.
    spdxVersion: `SPDX-${spec}`,
    packages: outPackages,
  };
  if (Object.keys(creationInfo).length > 0) view['creationInfo'] = creationInfo;

  const docEl = documents[0];
  const namespace =
    (docEl ? idOf(docEl) : undefined) ??
    (() => {
      for (const d of documents) {
        const nm = resolve(d['namespaceMap']);
        const prefix = nm ? str(nm['namespace']) : undefined;
        if (prefix) return prefix;
      }
      return undefined;
    })();
  if (namespace) view['documentNamespace'] = namespace;
  if (docEl) {
    const dn = str(docEl['name']);
    if (dn) view['name'] = dn;
  }

  // `import` holds ExternalMap entries, which is 2.x externalDocumentRefs.
  const imports: Json[] = [];
  for (const d of documents) {
    for (const im of asArray(d['import'])) {
      const m = resolve(im) ?? (isRecord(im) ? im : undefined);
      if (!m) continue;
      const ext = str(m['externalSpdxId']);
      if (ext) imports.push({ externalDocumentId: ext, spdxDocument: ext });
    }
  }
  if (imports.length > 0) view['externalDocumentRefs'] = imports;

  // Licence relationships are consumed above and would otherwise read as
  // component dependencies, which they are not.
  const structural = relationships.filter((r) => {
    const k = (str(r['relationshipType']) ?? '').toLowerCase();
    return k !== 'hasdeclaredlicense' && k !== 'hasconcludedlicense';
  });
  if (structural.length > 0) {
    view['relationships'] = structural.map((r) => ({
      spdxElementId: str(r['from']) ?? '',
      relatedSpdxElement: str(asArray(r['to'])[0]) ?? '',
      relationshipType: (str(r['relationshipType']) ?? 'OTHER')
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toUpperCase(),
    }));
  }

  const docAnnotations: Json[] = [];
  for (const a of annotations) {
    const subjects = asArray(a['subject']).map((s) => str(s));
    const onDocument = subjects.some((s) => s !== undefined && s === namespace);
    if (onDocument || subjects.length === 0) {
      docAnnotations.push({
        annotationType: (str(a['annotationType']) ?? 'OTHER').toUpperCase(),
        comment: str(a['statement']) ?? str(a['comment']) ?? '',
      });
    }
  }
  if (docAnnotations.length > 0) view['annotations'] = docAnnotations;

  return {
    view,
    spec,
    unmappedTypes: [...unmappedTypes].sort(),
    unmappedPackageKeys: [...unmappedPackageKeys].sort(),
    counts: {
      packages: outPackages.length,
      relationships: structural.length,
      agents: agents.length,
      annotations: annotations.length,
    },
  };
}
