/**
 * @stratifypro/modelcard
 *
 * A GGUF model in, a CycloneDX 1.7 model card out. SPEC.md 3.2.
 *
 * WHAT THIS IS FOR. The G7 minimum elements ask a device maker to state what
 * model their system contains: its name, version, producer, hash, what it was
 * trained on, what it is for. A team shipping a local model has all of that
 * sitting in the file already, in the metadata block GGUF puts at the front,
 * and currently retypes it by hand into a document they then have to defend.
 * This reads it instead.
 *
 * IT IS A DRAFT, AND CARRIES THE SAME MARKER A SUPPLIER SPREADSHEET DOES.
 * packages/draft's rule applies unchanged: a document nobody has confirmed is
 * not evidence. The model card this produces is a starting point that a person
 * checks against the model they actually shipped, and `stratifypro bundle`
 * refuses to seal it while the marker is there. A generator that produced
 * filing-ready output from a file header would be inviting exactly the
 * unchecked submission this project exists to argue against.
 *
 * WHAT IS READ IS WHAT IS THERE. GGUF's `general.*` keys are conventional, not
 * mandatory, and most models in the wild set very few of them: the committed
 * fixture, a real published model, sets only architecture, name, quantization
 * version and file type. So the output records what the file stated and says
 * plainly which G7 elements it could not answer, rather than filling them with
 * something plausible.
 */
import { createHash } from 'node:crypto';
import {
  ggufArchitecture,
  ggufNumber,
  ggufString,
  ggufStrings,
  readGgufMetadata,
  type GgufMetadata,
} from './gguf.js';

export const PACKAGE_NAME = '@stratifypro/modelcard' as const;

export { looksLikeGguf, NotGguf, readGgufMetadata, type GgufMetadata } from './gguf.js';

/** The property that marks a document as a draft. Same value packages/draft uses. */
export const DRAFT_PROPERTY = 'stratifypro:draft';

export interface ModelCardOptions {
  /** The file name as it was given. Recorded, never trusted. */
  fileName: string;
  /** ISO 8601. An argument, so the same model produces the same card. */
  timestamp: string;
  /**
   * SHA-256 of the WHOLE model file, when the caller has it.
   *
   * Optional because a caller reading only the header has not hashed the
   * weights, and a hash of the header alone would be worse than none: it looks
   * like a model hash and identifies nothing. G7 element 26 asks for a hash of
   * the model, so when it is absent the card says so rather than substituting.
   */
  fileSha256?: string;
}

export interface ModelCardResult {
  /** A CycloneDX 1.7 document, marked as a draft. */
  document: Record<string, unknown>;
  /** GGUF keys present in the file that this did not map. */
  unmappedKeys: string[];
  /** G7 elements the file could not answer, by rule id. */
  unanswered: string[];
  /** Metadata keys the reader could not decode at all. */
  unreadable: string[];
}

/**
 * The G7 elements this generator can answer from GGUF, and the key each comes
 * from.
 *
 * Kept as a table rather than inline so the honest answer to "what does a GGUF
 * file actually tell you about a model" is readable in one place. Most of it
 * is: less than you would hope.
 */
const ELEMENT_SOURCES: Array<{ rule: string; what: string; from: string }> = [
  { rule: 'G7-MOD-001', what: 'model name', from: 'general.name, else general.basename' },
  { rule: 'G7-MOD-003', what: 'model version', from: 'general.version' },
  { rule: 'G7-MOD-005', what: 'model producer', from: 'general.organization, else general.author' },
  { rule: 'G7-MOD-006', what: 'model description', from: 'general.description' },
  { rule: 'G7-MOD-007', what: 'model hash', from: 'the caller, which must hash the whole file' },
  { rule: 'G7-MOD-009', what: 'model properties', from: 'general.architecture and the per-architecture hyperparameters' },
  { rule: 'G7-MOD-011', what: 'training properties', from: 'general.datasets, general.base_model.*' },
  { rule: 'G7-MOD-012', what: 'model licence', from: 'general.license' },
  { rule: 'G7-MOD-013', what: 'external references', from: 'general.url, general.repo_url, general.doi' },
];

/** Keys read directly by name. Anything else is reported as unmapped. */
const READ_KEYS = new Set([
  'general.architecture', 'general.name', 'general.basename', 'general.author',
  'general.organization', 'general.version', 'general.description',
  'general.license', 'general.license.name', 'general.license.link',
  'general.url', 'general.repo_url', 'general.doi', 'general.source.url',
  'general.quantization_version', 'general.file_type', 'general.size_label',
  'general.tags', 'general.languages', 'general.datasets',
  'general.base_model.count', 'general.finetune',
]);

/**
 * GGUF's file_type enumeration, for the values a published model actually
 * uses. An unknown number is reported as the number rather than mapped to the
 * nearest name.
 */
const FILE_TYPES: Record<number, string> = {
  0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 7: 'Q8_0', 8: 'Q5_0', 9: 'Q5_1',
  10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M', 13: 'Q3_K_L', 14: 'Q4_K_S',
  15: 'Q4_K_M', 16: 'Q5_K_S', 17: 'Q5_K_M', 18: 'Q6_K', 19: 'IQ2_XXS',
  20: 'IQ2_XS', 28: 'IQ3_S', 30: 'BF16',
};

function quantisation(m: GgufMetadata): string | undefined {
  const t = ggufNumber(m, 'general.file_type');
  if (t === undefined) return undefined;
  return FILE_TYPES[t] ?? `file_type ${t}`;
}

/** The architecture's own hyperparameters, which are prefixed by its name. */
function hyperparameters(m: GgufMetadata, arch: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const [k, v] of m.kv) {
    if (!k.startsWith(`${arch}.`)) continue;
    if (typeof v === 'object') continue; // arrays are not a hyperparameter
    out.push({ name: `gguf:${k}`, value: String(v) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** SHA-256 of the whole file, when a caller wants this package to do it. */
export function hashModelFile(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Build a CycloneDX 1.7 model card from a GGUF file.
 *
 * `buf` may be the whole model or only its metadata block. Passing the whole
 * file is what lets `fileSha256` be computed; passing a prefix is legitimate
 * and the card then states that no hash was recorded.
 */
export function modelCardFromGguf(buf: Buffer, opts: ModelCardOptions): ModelCardResult {
  const meta = readGgufMetadata(buf);
  const arch = ggufArchitecture(meta);

  const name =
    ggufString(meta, 'general.name') ??
    ggufString(meta, 'general.basename') ??
    // The filename is a last resort and is recorded as one. It is what the
    // person who downloaded it called it, not what its author named it.
    opts.fileName.replace(/\.gguf$/i, '');
  const version = ggufString(meta, 'general.version');
  const producer =
    ggufString(meta, 'general.organization') ?? ggufString(meta, 'general.author');
  const description = ggufString(meta, 'general.description');
  const licence = ggufString(meta, 'general.license') ?? ggufString(meta, 'general.license.name');

  const externalReferences: Array<Record<string, string>> = [];
  const url = ggufString(meta, 'general.url') ?? ggufString(meta, 'general.source.url');
  if (url) externalReferences.push({ type: 'website', url });
  const repo = ggufString(meta, 'general.repo_url');
  if (repo) externalReferences.push({ type: 'vcs', url: repo });
  const licenceLink = ggufString(meta, 'general.license.link');
  if (licenceLink) externalReferences.push({ type: 'license', url: licenceLink });
  const doi = ggufString(meta, 'general.doi');
  if (doi) externalReferences.push({ type: 'documentation', url: doi });

  const properties: Array<{ name: string; value: string }> = [
    { name: 'gguf:version', value: String(meta.version) },
    { name: 'gguf:tensor-count', value: String(meta.tensorCount) },
  ];
  const quant = quantisation(meta);
  if (quant) properties.push({ name: 'gguf:quantisation', value: quant });
  const qv = ggufNumber(meta, 'general.quantization_version');
  if (qv !== undefined) properties.push({ name: 'gguf:quantization-version', value: String(qv) });
  const size = ggufString(meta, 'general.size_label');
  if (size) properties.push({ name: 'gguf:size-label', value: size });
  if (arch) properties.push(...hyperparameters(meta, arch));

  const component: Record<string, unknown> = {
    type: 'machine-learning-model',
    'bom-ref': 'model-1',
    name,
  };
  if (version) component['version'] = version;
  if (description) component['description'] = description;
  if (producer) component['manufacturer'] = { name: producer };
  if (licence) component['licenses'] = [{ license: { name: licence } }];
  if (opts.fileSha256) {
    component['hashes'] = [{ alg: 'SHA-256', content: opts.fileSha256 }];
  }
  if (externalReferences.length > 0) component['externalReferences'] = externalReferences;
  component['properties'] = properties;

  // The model card proper. Only sections the file can actually fill.
  const modelParameters: Record<string, unknown> = {};
  if (arch) modelParameters['architectureFamily'] = arch;
  const datasets = ggufStrings(meta, 'general.datasets');
  if (datasets) modelParameters['datasets'] = datasets.map((d) => ({ name: d, type: 'dataset' }));
  const languages = ggufStrings(meta, 'general.languages');
  const tags = ggufStrings(meta, 'general.tags');

  const modelCard: Record<string, unknown> = {};
  if (Object.keys(modelParameters).length > 0) modelCard['modelParameters'] = modelParameters;
  if (languages || tags) {
    modelCard['considerations'] = {
      ...(languages ? { environmentalConsiderations: undefined } : {}),
      ...(tags ? { useCases: tags } : {}),
    };
    // A tag is not a use case and the card must not pretend otherwise.
    if (tags) {
      properties.push({
        name: 'stratifypro:usecases-are-tags',
        value:
          'The use cases above were read from general.tags, which is a keyword list rather ' +
          'than a statement of intended use. Replace them before this is relied on.',
      });
    }
  }
  if (Object.keys(modelCard).length > 0) component['modelCard'] = modelCard;

  const unanswered = ELEMENT_SOURCES.filter(({ rule }) => {
    switch (rule) {
      case 'G7-MOD-001': return false; // always produced, even if from the filename
      case 'G7-MOD-003': return version === undefined;
      case 'G7-MOD-005': return producer === undefined;
      case 'G7-MOD-006': return description === undefined;
      case 'G7-MOD-007': return opts.fileSha256 === undefined;
      case 'G7-MOD-009': return arch === undefined;
      case 'G7-MOD-011': return datasets === undefined;
      case 'G7-MOD-012': return licence === undefined;
      case 'G7-MOD-013': return externalReferences.length === 0;
      default: return false;
    }
  }).map((e) => `${e.rule} (${e.what})`);

  const unmappedKeys = [...meta.kv.keys()]
    .filter((k) => k.startsWith('general.') && !READ_KEYS.has(k))
    .sort();

  const document = {
    bomFormat: 'CycloneDX',
    specVersion: '1.7',
    version: 1,
    metadata: {
      timestamp: opts.timestamp,
      lifecycles: [{ phase: 'build' }],
      tools: { components: [{ type: 'application', name: 'stratifypro-modelcard' }] },
      properties: [
        { name: DRAFT_PROPERTY, value: 'true' },
        { name: 'stratifypro:draft-source', value: opts.fileName },
        {
          name: 'stratifypro:draft-warning',
          value:
            'This model card was read from a GGUF file header and has not been confirmed by ' +
            'a person. GGUF metadata keys are conventional rather than mandatory, and most ' +
            'published models set very few of them, so absence here means the file did not ' +
            'say rather than that the answer is nothing. It is not evidence, it has not been ' +
            'sealed, and it must not be filed until somebody has checked it against the ' +
            'model that actually shipped.',
        },
      ],
    },
    components: [component],
  };

  return { document, unmappedKeys, unanswered, unreadable: meta.unreadable };
}

/** What a GGUF file can and cannot answer, for anyone deciding whether to bother. */
export function elementCoverage(): ReadonlyArray<{ rule: string; what: string; from: string }> {
  return ELEMENT_SOURCES;
}
