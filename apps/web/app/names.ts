import dictionary from '@stratifypro/rules/data/alias-dictionary.json';
import { addressable, resolve, type AliasDictionary } from '@stratifypro/resolve';

const DICT = (dictionary as { entries: AliasDictionary }).entries;

export { addressable, slugPath, slugify, unslug } from '@stratifypro/resolve';

/**
 * The names that get a prerendered, indexed page: the ones with an answer and
 * an address.
 *
 * 444 of the 1,854 aliases resolve. The other 1,410 abstain, and an abstention
 * is a real result this product argues for showing, so those pages still render
 * on request and still say why. They are not prerendered and not in the
 * sitemap, because 1,410 pages each saying "could not be identified" is not
 * something to ask a search engine to carry, and a reader who arrives at one
 * arrived from somewhere that already knew the name.
 *
 * A name whose URL would not give the name back is excluded rather than
 * published wrong. See addressable() in packages/resolve: a page that misnames
 * its own subject is worse than a page that does not exist.
 */
export function indexedNames(): string[] {
  return Object.keys(DICT)
    .filter((name) => resolve(name, DICT) !== null && addressable(name))
    .sort();
}
