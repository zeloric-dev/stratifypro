/**
 * The URL for a component name, and the name back out of it.
 *
 * These two are one decision and they live together so they cannot drift. They
 * live in this package rather than in the web app because apps/web has no test
 * runner, and the defect below was invisible without one.
 *
 * THE FIRST VERSION LOST INFORMATION. It replaced spaces with hyphens going in
 * and every hyphen with a space coming out, so a name already carrying a
 * hyphen came back different: `accessors-smart` became `accessors smart`. 827
 * of the 1,854 dictionary aliases carry a hyphen, so 45 percent of these
 * pages displayed, titled and described a name nobody had typed. The answer was
 * unaffected, because the resolver normalises hyphens and spaces alike, which
 * is exactly why nothing caught it. Not one alias carries a space, so the
 * substitution bought nothing in exchange for the loss.
 *
 * THE SECOND VERSION PERCENT-ENCODED EVERYTHING, which turned
 * `go.uber.org/atomic` into `go.uber.org%2Fatomic`. It served correctly under
 * `next start` and it is a deployment hazard: CDNs and proxies routinely
 * normalise %2F before routing, and Next wrote those files out double-encoded
 * as `.%252Fapi`. 300 of the 444 names with an answer carry a slash, because
 * the dictionary is largely Go module paths.
 *
 * So a slash stays a slash and the route is a catch-all:
 *
 *     go.uber.org/atomic   ->  /name/go.uber.org/atomic
 *     accessors-smart      ->  /name/accessors-smart
 *
 * which is also the form worth citing.
 */

/** Path segments for a name, each encoded, slashes preserved as separators. */
export function slugPath(name: string): string[] {
  return name.trim().toLowerCase().split('/').map(encodeURIComponent);
}

/** The path itself. */
export function slugify(name: string): string {
  return slugPath(name).join('/');
}

/** The name, from the segments a router hands back. */
export function unslug(segments: string[]): string {
  return segments.map(decodeURIComponent).join('/').trim();
}

/**
 * True when this name can be a URL that gives the name back exactly.
 *
 * Two ways it cannot. The encoding might lose something, which is what the
 * first two schemes did. Or a segment may be `.`, `..` or empty, which every
 * URL handler normalises away before routing: `./api` is requested as
 * `/name/./api` and arrives as `/name/api`. Next refuses to prerender that at
 * all, with "Requested and resolved page mismatch", which is correct and is how
 * it was found.
 *
 * Such a name still resolves on the front page. It just cannot have a permanent
 * address, and a page at the wrong address is worse than no page.
 */
export function addressable(name: string): boolean {
  const lowered = name.trim().toLowerCase();
  if (lowered === '') return false;
  const segments = lowered.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return false;
  return unslug(slugPath(name)) === lowered;
}
