import type { ResolutionMethod } from '@stratifypro/engine';
import { candidates, norm } from './normalise.js';

export { candidates, norm, VENDOR_PREFIXES } from './normalise.js';

export interface AliasEntry {
  purlBase: string;
  observations: number;
}

export type AliasDictionary = Record<string, AliasEntry>;

export interface Resolution {
  purlBase: string;
  /** How this was established. The method is the confidence. */
  method: ResolutionMethod;
  /** The form that actually matched, so the answer can be checked. */
  matchedOn: string;
  /** How many times the dictionary observed this mapping. */
  observations: number;
}

export interface ResolveOptions {
  /**
   * Minimum observations before a dictionary hit is trusted.
   *
   * A mapping seen once in one file is weaker evidence than one seen twenty
   * times across many. Raising this trades recall for precision, and precision
   * is the one that matters: a wrong identifier produces a confident wrong
   * vulnerability verdict, which is the failure this product exists to prevent.
   */
  minObservations?: number;
}

/** A string that is already a package identifier needs no resolving. */
const PURL = /^pkg:[a-z]+\/[^@]+/i;

/**
 * Resolve a free-text component name to a canonical identifier, or abstain.
 *
 * Returns null for "I do not know". That is an answer, not a failure, and it
 * is the one output no competitor prints. Never guess: an abstention costs a
 * lookup, a wrong answer costs the user a false clean bill of health.
 */
export function resolve(
  input: string,
  dict: AliasDictionary,
  opts: ResolveOptions = {},
): Resolution | null {
  // Default 2, not 1. 1,410 of the 1,854 dictionary entries (76 percent) were
  // observed exactly once, and the dictionary's own warning calls it "a floor to
  // beat, not a finished dictionary". Requiring a second observation takes
  // precision from 0.977 to 1.000 on the clean subset for a recall cost of
  // 0.002. F1 is marginally lower and that is the correct trade: a wrong
  // identifier produces a confident wrong vulnerability verdict, which is the
  // failure this product exists to prevent, and F1 weighs that the same as a
  // missed answer.
  const min = opts.minObservations ?? 2;
  const raw = String(input ?? '').trim();
  if (raw.length < 2) return null;

  // Tier 0: it is already an identifier.
  const purlMatch = PURL.exec(raw);
  if (purlMatch) {
    const base = raw.split('@')[0]!;
    return { purlBase: base, method: 'exact', matchedOn: raw, observations: 0 };
  }

  // Tier 1: exact, as written.
  const exact = dict[raw];
  if (exact && exact.observations >= min) {
    return { purlBase: exact.purlBase, method: 'exact', matchedOn: raw, observations: exact.observations };
  }

  // Tier 2: the published baseline normalisation.
  const normalised = norm(raw);
  const viaNorm = dict[normalised];
  if (viaNorm && viaNorm.observations >= min) {
    return {
      purlBase: viaNorm.purlBase,
      method: 'dictionary',
      matchedOn: normalised,
      observations: viaNorm.observations,
    };
  }

  // Tier 3: reverse the shapes that real documents combine.
  //
  // Ambiguity is abstention. If two different candidate forms hit the
  // dictionary and disagree about the identifier, we do not know which the
  // author meant, and picking one would be a guess wearing a method name.
  let hit: { entry: AliasEntry; form: string } | null = null;
  for (const form of candidates(raw)) {
    const entry = dict[form];
    if (!entry || entry.observations < min) continue;
    if (!hit) {
      hit = { entry, form };
      continue;
    }
    if (hit.entry.purlBase !== entry.purlBase) return null;
  }
  if (hit) {
    return {
      purlBase: hit.entry.purlBase,
      method: 'heuristic',
      matchedOn: hit.form,
      observations: hit.entry.observations,
    };
  }

  return null;
}

/** Convenience for the benchmark contract: a bare identifier or null. */
export function resolveToPurl(input: string, dict: AliasDictionary, opts?: ResolveOptions): string | null {
  return resolve(input, dict, opts)?.purlBase ?? null;
}

export * from './slug.js';
export { whyNot, METHOD_EXPLAINS } from './explain.js';
