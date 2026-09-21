import type { MetadataRoute } from 'next';
import { indexedNames, slugify } from './names';
import { BASE } from './site-url';

/**
 * Doc 6 step 1.13: "/name/<slug> resolves and is in the sitemap."
 *
 * The name pages are the point of this file. They are the answers people
 * already type into a search box, and a permanent URL nobody can find is a
 * permanent URL in name only.
 *
 * Only the names with an answer are listed, for the reason in names.ts: 1,410
 * pages each saying "could not be identified" is not something to ask an index
 * to carry, even though each one is a real result and still renders.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/rules', '/crosswalk', '/bench', '/honesty'].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: 'monthly' as const,
    priority: path === '' ? 1 : 0.8,
  }));

  const names = indexedNames().map((name) => ({
    url: `${BASE}/name/${slugify(name)}`,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...pages, ...names];
}
