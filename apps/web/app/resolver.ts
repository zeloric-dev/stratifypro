import dictionary from '@stratifypro/rules/data/alias-dictionary.json';
import { resolve, type AliasDictionary, type Resolution } from '@stratifypro/resolve';

const DICT = (dictionary as { entries: AliasDictionary }).entries;

export interface Answer {
  input: string;
  resolution: Resolution | null;
  /** Why we could not answer, when we could not. */
  reason?: string;
}

/**
 * Why a name could not be resolved, said plainly.
 *
 * "I do not know" is an answer, not a failure, and it is the one output no
 * competitor prints. Saying nothing would let an abstention read as a bug.
 */
function whyNot(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < 2) return 'That is too short to identify.';
  if (/^[0-9a-f]{32,}$/i.test(trimmed)) {
    return 'That looks like a hash or a layer digest rather than a component name.';
  }
  if (!/[a-z]/i.test(trimmed)) return 'That does not look like a component name.';
  return 'This name is not in the dictionary, and no reversible form of it matched. It may be an internal or vendored component, or the identifying path may be missing from the name.';
}

export function answer(input: string): Answer {
  const resolution = resolve(input, DICT);
  return resolution ? { input, resolution } : { input, resolution: null, reason: whyNot(input) };
}

/** How the answer was reached. The method is the confidence. */
export const METHOD_EXPLAINS: Record<string, string> = {
  exact: 'The identifier was already present and valid in the name given.',
  dictionary: 'A known alias matched after standard normalisation.',
  heuristic: 'Derived by reversing a shape that real documents add, such as an archive extension or a vendor prefix.',
  'model-suggested': 'Proposed by a model. Not a finding until a person confirms it.',
  'human-confirmed': 'A named person confirmed this identity.',
};

/**
 * Answered on first paint so nobody ever meets an empty box.
 *
 * The first example is deliberately one we cannot answer. Abstention is the
 * behaviour this product sells hardest, and showing it immediately is more
 * honest than showing four successes and hiding the limit.
 */
export const EXAMPLES = [
  // Each of these was checked against the shipped dictionary, not assumed.
  // The first three resolve by a different method; the last one cannot be
  // resolved by anything and says so.
  'openssl 1.1.1k.tar.gz',
  'libgomodules.xyz/jsonpatch/v2',
  'pkg:npm/lodash@4.17.21',
  'mbedtls (custom build)',
] as const;

/**
 * Must resolve. first-paint.test.ts asserts it, because an example that
 * quietly stops resolving turns the first screen into an abstention and the
 * product looks broken to everyone who has never used it.
 */
export const FIRST_PAINT = 'openssl 1.1.1k.tar.gz';
