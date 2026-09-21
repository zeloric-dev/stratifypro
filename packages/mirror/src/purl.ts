/**
 * Turn a package URL into the key OSV files an advisory under, or refuse.
 *
 * This is the join between a bill of materials and an advisory database, and
 * every mismatch here is silent. A purl mapped to the wrong ecosystem string
 * finds nothing and reports a clean component. That is indistinguishable, in
 * the output, from a component that genuinely has no advisory, which is why
 * this returns a REASON when it cannot map rather than a null the caller can
 * quietly treat as zero.
 *
 * FOUR THINGS MEASURED FROM THE CORPUS AND THE OSV EXPORTS SHAPE THIS FILE.
 *
 * 1. OSV's Debian ecosystem is per release: Debian:10 through Debian:14 are
 *    five separate namespaces, and openssl in Debian:11 is a different key
 *    from openssl in Debian:12. A `pkg:deb/...` purl with no distro qualifier
 *    therefore cannot be placed, and abstains. All 200 Debian components in
 *    the corpus do carry one.
 *
 * 2. OSV files Go advisories under the MODULE path. The corpus is mostly
 *    packages: of 2,605 golang purls, 549 say type=package, 183 say
 *    type=module, and 1,873 carry no type qualifier at all. Only 62.6 percent
 *    of the package-typed names have their own module listed elsewhere in the
 *    same document, so ignoring packages would drop a third of them. Instead
 *    an unmatched Go path is retried against successively shorter prefixes,
 *    and the prefix that answered is reported, never hidden.
 *
 * 3. Maven keys are `group:artifact`, one string, not two fields.
 *
 * 4. An advisory affecting several ecosystems is filed in each ecosystem's
 *    export, so Go/all.zip contains crates.io and npm entries. The index is
 *    built from each advisory's own `affected[].package.ecosystem`, never from
 *    the file it arrived in.
 */

export interface PurlKey {
  /** The OSV ecosystem string, e.g. `npm`, `Go`, `Maven`, `NuGet`, `Debian:11`. */
  ecosystem: string;
  /** The OSV package name, in that ecosystem's own spelling. */
  name: string;
  version: string | null;
}

export type PurlMapping =
  | { mapped: true; key: PurlKey }
  | { mapped: false; why: string };

/** Debian release codenames, so a distro qualifier that names one still maps. */
const DEBIAN_CODENAMES: Record<string, string> = {
  buster: '10',
  bullseye: '11',
  bookworm: '12',
  trixie: '13',
  forky: '14',
};

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

interface Split {
  type: string;
  segments: string[];
  version: string | null;
  qualifiers: Record<string, string>;
}

function split(purl: string): Split | null {
  if (!purl.startsWith('pkg:')) return null;
  let body = purl.slice(4);

  // Subpath, then qualifiers, then version: strip from the right so a `@` or
  // `?` inside a qualifier value cannot be mistaken for a delimiter.
  const hash = body.indexOf('#');
  if (hash !== -1) body = body.slice(0, hash);

  const qualifiers: Record<string, string> = {};
  const q = body.indexOf('?');
  if (q !== -1) {
    for (const pair of body.slice(q + 1).split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      qualifiers[decode(pair.slice(0, eq)).toLowerCase()] = decode(pair.slice(eq + 1));
    }
    body = body.slice(0, q);
  }

  let version: string | null = null;
  const at = body.lastIndexOf('@');
  const slash = body.lastIndexOf('/');
  if (at !== -1 && at > slash) {
    version = decode(body.slice(at + 1)) || null;
    body = body.slice(0, at);
  }

  const parts = body.split('/');
  const type = decode(parts.shift() ?? '').toLowerCase();
  if (!type || parts.length === 0) return null;
  return { type, segments: parts.map(decode), version, qualifiers };
}

/**
 * Map a purl to an OSV key.
 *
 * `version` may be null: a component can carry a purl with no version, and the
 * caller supplies the version from the document's own field. A missing version
 * is not an error here, it becomes an abstention at match time, because
 * "affected" is a statement about a version and there is none to make it about.
 */
export function purlToKey(purl: string): PurlMapping {
  const s = split(purl);
  if (!s) return { mapped: false, why: `${purl} is not a package URL this can parse.` };

  const joinAll = (): string => s.segments.join('/');

  switch (s.type) {
    case 'golang':
      return { mapped: true, key: { ecosystem: 'Go', name: joinAll(), version: s.version } };

    case 'npm': {
      // A scoped package is namespace `@scope`, name `pkg`, and OSV spells it
      // back as the one string `@scope/pkg`.
      const name = s.segments.length > 1 ? s.segments.join('/') : (s.segments[0] as string);
      return {
        mapped: true,
        key: {
          ecosystem: 'npm',
          name: name.startsWith('@') || s.segments.length === 1 ? name : `@${name}`,
          version: s.version,
        },
      };
    }

    case 'maven': {
      if (s.segments.length < 2) {
        return { mapped: false, why: `${purl} has no Maven group, so there is no group:artifact key to look up.` };
      }
      const artifact = s.segments[s.segments.length - 1] as string;
      const group = s.segments.slice(0, -1).join('.');
      return { mapped: true, key: { ecosystem: 'Maven', name: `${group}:${artifact}`, version: s.version } };
    }

    case 'nuget':
      return { mapped: true, key: { ecosystem: 'NuGet', name: joinAll(), version: s.version } };

    case 'deb': {
      const distro = s.qualifiers['distro'];
      if (!distro) {
        return {
          mapped: false,
          why: `${purl} names no distro. OSV files Debian advisories per release, so openssl in Debian 11 is a different record from openssl in Debian 12, and without the release there is nothing to look up.`,
        };
      }
      // `debian-11.2` is a point release of `Debian:11`; the codename spellings
      // appear in real documents too.
      const lowered = distro.toLowerCase();
      let release: string | undefined;
      const numeric = /(?:^|[-_])(\d+)(?:\.\d+)*$/.exec(lowered);
      if (numeric) release = numeric[1];
      else {
        for (const [code, num] of Object.entries(DEBIAN_CODENAMES)) {
          if (lowered.includes(code)) release = num;
        }
      }
      if (!release) {
        return { mapped: false, why: `${purl} names the distro "${distro}", which this cannot resolve to a Debian release.` };
      }
      const name = s.segments.length > 1 ? (s.segments[s.segments.length - 1] as string) : (s.segments[0] as string);
      return { mapped: true, key: { ecosystem: `Debian:${release}`, name, version: s.version } };
    }

    default:
      return {
        mapped: false,
        why: `pkg:${s.type} is not an ecosystem this mirror holds. It mirrors Go, npm, Maven, NuGet and Debian, which is 94.6 percent of the corpus.`,
      };
  }
}

/**
 * Go module paths to try for a component path, longest first.
 *
 * OSV keys Go advisories by module. A component that names a package inside a
 * module will not match the module's own key, so the package path is walked
 * back one segment at a time. The caller accepts a prefix only when that exact
 * prefix is a key in the index, which is the guard that keeps this from
 * reducing `github.com/foo/bar` to `github.com`.
 *
 * Two segments is the floor. Nothing shorter is a module path.
 */
export function goModuleCandidates(path: string): string[] {
  const parts = path.split('/').filter((p) => p !== '');
  const out: string[] = [];
  for (let n = parts.length; n >= 2; n -= 1) {
    out.push(parts.slice(0, n).join('/'));
  }
  return out;
}
