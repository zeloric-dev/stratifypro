/**
 * @stratifypro/draft
 *
 * A supplier's spreadsheet in, a CycloneDX **draft** out. SPEC.md 2A.3.
 *
 * WHY THIS EXISTS. SPEC.md records the market fact: 39 percent of surveyed
 * firms never receive a bill of materials from a supplier and only 2 percent
 * always do. What arrives is a document somebody retypes, by hand, into a
 * format they then have to defend. No SBOM-specific extraction tool exists
 * anywhere.
 *
 * NO MODEL IS INVOLVED, and the csv path never needs one. A spreadsheet is
 * already structured; what it needs is a careful reader, not a guess. SPEC.md
 * 2A.3 lists PDF and xlsx alongside csv, and those are not built: they are
 * listed as gaps rather than half-implemented, because a PDF extractor that
 * usually works is the exact shape of tool this project refuses to ship.
 *
 * DRAFT IS NOT A LABEL, IT IS A PROPERTY THE FILE CARRIES. SPEC.md 2A.3
 * accepts on "output always labelled a draft. Never signed, never bundled,
 * never filed without human confirmation." So the marker goes into the
 * document itself, `isDraft` reads it back, and `stratifypro bundle` refuses a
 * document carrying it. A firm that forwards the file without reading our
 * console output still cannot turn it into evidence by accident.
 *
 * NOTHING IS INVENTED. A column that is not present produces an absent field,
 * not a plausible one. In particular no package URL is constructed from a name
 * and a version: guessing an identifier is what produces a confident wrong
 * vulnerability verdict, and `packages/resolve` exists to abstain from exactly
 * that. A purl appears only when the supplier supplied one.
 */
import { parseCsv } from './csv.js';

export const PACKAGE_NAME = '@stratifypro/draft' as const;
export { parseCsv, type CsvTable } from './csv.js';

/** The property that marks a document as a draft, and the check that reads it. */
export const DRAFT_PROPERTY = 'stratifypro:draft';

export interface DraftComponent {
  type: 'library';
  name: string;
  version?: string;
  purl?: string;
  supplier?: { name: string };
  licenses?: Array<{ license: { name: string } }>;
}

export interface DraftResult {
  /** A CycloneDX 1.5 document, marked as a draft. */
  document: Record<string, unknown>;
  /** Columns in the sheet that this did not map to anything. */
  unmappedColumns: string[];
  /** Rows that produced no component, with the reason. */
  skipped: Array<{ line: number; why: string }>;
  /** Rows whose column count did not match the header. */
  ragged: Array<{ line: number; cells: number }>;
  componentCount: number;
}

/**
 * Column aliases, lowercased and stripped of punctuation before matching.
 *
 * Deliberately conservative. A column this does not recognise is REPORTED as
 * unmapped rather than guessed at, because a sheet with a column called
 * `Part Number` might mean a manufacturer part number or an internal SKU, and
 * putting the wrong one in a purl is worse than leaving it out.
 */
const FIELDS: Record<string, string[]> = {
  name: ['name', 'component', 'componentname', 'product', 'productname', 'library', 'package'],
  version: ['version', 'ver', 'componentversion', 'productversion', 'release'],
  supplier: ['supplier', 'vendor', 'manufacturer', 'author', 'publisher', 'producer', 'componentproducer'],
  licence: ['license', 'licence', 'licenseid', 'licenceid', 'spdx', 'spdxid'],
  purl: ['purl', 'packageurl', 'packageurl'],
};

function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapColumns(header: string[]): { map: Record<string, number>; unmapped: string[] } {
  const map: Record<string, number> = {};
  const unmapped: string[] = [];
  header.forEach((h, i) => {
    const n = normalise(h);
    const field = Object.keys(FIELDS).find((f) => (FIELDS[f] as string[]).includes(n));
    // First column wins. A sheet with two columns both called "version" is
    // ambiguous, and silently preferring the later one would be a coin toss.
    if (field && !(field in map)) map[field] = i;
    else if (!field && h.trim() !== '') unmapped.push(h);
  });
  return { map, unmapped };
}

export interface DraftOptions {
  /** Where the sheet came from, recorded in the document. */
  sourceName: string;
  /** ISO 8601. An argument, so the same sheet produces the same draft. */
  timestamp: string;
}

/** Convert a supplier spreadsheet into a draft CycloneDX document. */
export function draftFromCsv(text: string, opts: DraftOptions): DraftResult {
  const table = parseCsv(text);
  const { map, unmapped } = mapColumns(table.header);
  const skipped: Array<{ line: number; why: string }> = [];
  const components: DraftComponent[] = [];

  if (!('name' in map)) {
    return {
      document: emptyDocument(opts, 'no column in this sheet names the component'),
      unmappedColumns: table.header.filter((h) => h.trim() !== ''),
      skipped: [{ line: 1, why: 'no component-name column was found, so nothing could be read' }],
      ragged: table.ragged,
      componentCount: 0,
    };
  }

  table.rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const cell = (field: string): string | undefined => {
      const idx = map[field];
      if (idx === undefined) return undefined;
      const v = (row[idx] ?? '').trim();
      return v === '' ? undefined : v;
    };

    const name = cell('name');
    if (!name) {
      skipped.push({ line, why: 'no component name in this row' });
      return;
    }

    const c: DraftComponent = { type: 'library', name };
    const version = cell('version');
    if (version) c.version = version;
    // Only when the supplier supplied one. Never constructed.
    const purl = cell('purl');
    if (purl) c.purl = purl;
    const supplier = cell('supplier');
    if (supplier) c.supplier = { name: supplier };
    const licence = cell('licence');
    // `name` rather than `id`: an unvalidated string is not an SPDX identifier,
    // and claiming it is would be asserting something nobody checked.
    if (licence) c.licenses = [{ license: { name: licence } }];
    components.push(c);
  });

  const document = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: opts.timestamp,
      properties: [
        { name: DRAFT_PROPERTY, value: 'true' },
        { name: 'stratifypro:draft-source', value: opts.sourceName },
        {
          name: 'stratifypro:draft-warning',
          value:
            'This document was transcribed from a supplier spreadsheet and has not been ' +
            'confirmed by a person. It is not evidence, it has not been sealed, and it must ' +
            'not be filed until somebody has checked it against the source.',
        },
      ],
      tools: [{ vendor: 'StratifyPro', name: 'draft-from-csv' }],
    },
    components,
  };

  return {
    document,
    unmappedColumns: unmapped,
    skipped,
    ragged: table.ragged,
    componentCount: components.length,
  };
}

function emptyDocument(opts: DraftOptions, why: string): Record<string, unknown> {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: opts.timestamp,
      properties: [
        { name: DRAFT_PROPERTY, value: 'true' },
        { name: 'stratifypro:draft-source', value: opts.sourceName },
        { name: 'stratifypro:draft-warning', value: `Nothing could be read: ${why}.` },
      ],
    },
    components: [],
  };
}

/**
 * Is this document a draft?
 *
 * Read from the document rather than from a filename or a flag, so that a
 * draft forwarded by email, renamed, and handed to a different command is
 * still a draft. `stratifypro bundle` refuses one.
 */
export function isDraft(doc: unknown): boolean {
  const props = (doc as { metadata?: { properties?: Array<{ name?: string; value?: string }> } })
    ?.metadata?.properties;
  if (!Array.isArray(props)) return false;
  return props.some((p) => p?.name === DRAFT_PROPERTY && String(p?.value).toLowerCase() === 'true');
}
