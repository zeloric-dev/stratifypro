/**
 * Reversing the shapes that real component names arrive in.
 *
 * The benchmark's perturbations are the six shapes that actually turn up in
 * supplier documents: an archive extension, a vendor prefix, a trailing
 * parenthetical, a trailing version, separators turned to spaces, and case
 * changes. Real inputs combine them, which is the part the baselines do not
 * handle: `libOpenSSL (FIPS) 1.1.1k.tar.gz` is four at once.
 */

const ARCHIVE = /\.(jar|whl|tar\.gz|tgz|tar|zip|exe|dll|so|gem|nupkg|crate|deb|rpm)$/i;
const TRAILING_PAREN = /\s*\([^)]*\)\s*$/;
const TRAILING_VERSION = /[-_\s]v?\d[\d.\-_a-z]*$/i;
const SEPARATORS = /[_\s]+/g;

/** Vendor prefixes seen in real documents. Order matters: longest first. */
export const VENDOR_PREFIXES = [
  'golang-',
  'python-',
  'node-',
  'perl-',
  'ruby-',
  'rust-',
  'java-',
  'php-',
  'lib',
] as const;

/**
 * The baseline normalisation, reproduced exactly.
 *
 * bench/identity/run.py defines norm() and the published baselines are scored
 * with it. This must not drift from that definition, or our numbers stop being
 * comparable with the ones already published.
 */
export function norm(input: string): string {
  let s = String(input).trim().toLowerCase();
  s = s.replace(/\.(jar|whl|tar\.gz|tgz|zip|exe|dll|so)$/, '');
  s = s.replace(/\s*\([^)]*\)\s*$/, '');
  s = s.replace(/[_\s]+/g, '-');
  s = s.replace(/-v?\d[\d.\-_a-z]*$/, '');
  return s.replace(/^-+|-+$/g, '');
}

/** One pass of each reversal, applied to whatever it is given. */
function strip(s: string): string[] {
  const out: string[] = [];
  const archive = s.replace(ARCHIVE, '');
  if (archive !== s) out.push(archive);
  const paren = s.replace(TRAILING_PAREN, '').trim();
  if (paren !== s) out.push(paren);
  const version = s.replace(TRAILING_VERSION, '').trim();
  if (version !== s) out.push(version);
  const seps = s.replace(SEPARATORS, '-');
  if (seps !== s) out.push(seps);
  for (const p of VENDOR_PREFIXES) {
    if (s.toLowerCase().startsWith(p) && s.length > p.length + 2) out.push(s.slice(p.length));
  }
  return out;
}

/**
 * Every form worth looking up, nearest first.
 *
 * Breadth-first over combinations of the reversals, bounded. Nearest first
 * matters: a candidate produced by removing less is closer to what the author
 * wrote, so if two forms both hit the dictionary the less-mangled one wins.
 */
export function candidates(input: string, limit = 64): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t.length < 2) return;
    for (const form of [t, t.toLowerCase(), norm(t)]) {
      if (form.length >= 2 && !seen.has(form)) {
        seen.add(form);
        ordered.push(form);
      }
    }
  };

  push(input);
  let frontier = [input.trim()];
  for (let depth = 0; depth < 4 && ordered.length < limit; depth += 1) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const s of strip(f)) {
        if (!seen.has(s)) {
          push(s);
          next.push(s);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return ordered.slice(0, limit);
}
