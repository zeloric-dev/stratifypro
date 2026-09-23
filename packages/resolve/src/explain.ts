/**
 * Why a name could not be resolved, and what a method means.
 *
 * THESE LIVED IN apps/web/app/resolver.ts AND NOW LIVE HERE, because a second
 * caller arrived. The CLI needs the same two things the web app needs, and the
 * cheap move was to copy fourteen lines into the CLI. Two copies of an
 * explanation is how the explanation drifts: someone improves the wording in
 * one place, the other keeps the old text, and the product answers the same
 * question two different ways depending on where you asked it.
 *
 * `docs/plan-status.md` has a section on exactly this failure for rule
 * rendering, and `scripts/check-one-source.py` exists because of it.
 *
 * ABSTENTION IS THE OUTPUT THIS PRODUCT SELLS HARDEST. "I do not know" is an
 * answer rather than a failure, and it is the one no competitor prints. Saying
 * nothing would let an abstention read as a bug, so every refusal carries a
 * reason a person can act on.
 */

/**
 * Why this name could not be resolved, said plainly.
 *
 * The order matters: the specific diagnoses come first, and the general one is
 * the fallback. A digest told "this name is not in the dictionary" would be
 * true and useless, because the problem is that it is not a name.
 */
export function whyNot(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < 2) return 'That is too short to identify.';
  if (/^[0-9a-f]{32,}$/i.test(trimmed)) {
    return 'That looks like a hash or a layer digest rather than a component name.';
  }
  if (!/[a-z]/i.test(trimmed)) return 'That does not look like a component name.';
  return (
    'This name is not in the dictionary, and no reversible form of it matched. It may be ' +
    'an internal or vendored component, or the identifying path may be missing from the name.'
  );
}

/**
 * How the answer was reached. The method is the confidence.
 *
 * There is no numeric score anywhere in this package, deliberately. An exact
 * identifier already present in the input and a heuristic that reversed an
 * archive extension are different in kind, not in degree, and a 0.82 beside
 * the second invites arithmetic the evidence does not support.
 */
export const METHOD_EXPLAINS: Record<string, string> = {
  exact: 'The identifier was already present and valid in the name given.',
  dictionary: 'A known alias matched after standard normalisation.',
  heuristic:
    'Derived by reversing a shape that real documents add, such as an archive extension or a vendor prefix.',
  'model-suggested': 'Proposed by a model. Not a finding until a person confirms it.',
  'human-confirmed': 'A named person confirmed this identity.',
};
