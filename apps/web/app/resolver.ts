import dictionary from '@stratifypro/rules/data/alias-dictionary.json';
import {
  METHOD_EXPLAINS,
  resolve,
  whyNot,
  type AliasDictionary,
  type Resolution,
} from '@stratifypro/resolve';

// Re-exported so the pages that render these keep importing them from here,
// while the text itself has one home. See packages/resolve/src/explain.ts.
export { METHOD_EXPLAINS };

const DICT = (dictionary as { entries: AliasDictionary }).entries;

export interface Answer {
  input: string;
  resolution: Resolution | null;
  /** Why we could not answer, when we could not. */
  reason?: string;
}

export function answer(input: string): Answer {
  const resolution = resolve(input, DICT);
  return resolution ? { input, resolution } : { input, resolution: null, reason: whyNot(input) };
}

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
