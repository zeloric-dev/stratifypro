#!/usr/bin/env python3
"""Cut a small, real mirror out of a full one, so the tests can run offline.

WHY A FIXTURE AND NOT THE REAL THING. The mirror is 297 MB of OSV export, and
a mirror rebuilt weekly cannot live in git. But tests that need a 297 MB
download are tests nobody runs, and CI has no network by design. So a few
hundred kilobytes of REAL advisory records are committed instead.

WHY REAL RECORDS AND NOT HAND-WRITTEN ONES. A hand-written fixture agrees with
whatever the code already does. Every advisory here was published by OSV and
carries its own id, so a test that passes against it is a test against the
shape of the data as it actually arrives, including the parts nobody
anticipated. The two times this repository wrote its own fixture for a parser,
the fixture matched the parser's bugs.

WHAT IS CHOSEN, AND WHY EACH ONE. The set is picked to exercise every path
through the matcher, including the ones that must ABSTAIN:

  enumerated-version match   Maven and NuGet, where 95% and 87% of entries
                             carry an explicit affected-versions list
  semver-range match         Go and npm, which are 98.8% and 94% ranges
  go parent module           a package path whose advisory is filed against
                             the module above it
  indeterminate              a Debian record with ECOSYSTEM ranges and no
                             enumerated versions, which must come back unknown
                             rather than clear
  known exploited            an advisory whose alias is on the CISA KEV list
  malicious package          a MAL- record, which must never be counted as a
                             vulnerability

    python3 scripts/mirror-fixture.py --from .mirror   rebuild it
    python3 scripts/mirror-fixture.py --check          validate it, offline
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "mirror", "src", "fixtures", "mini")

# Chosen by hand so that a person can read this list and say what it covers.
# Each entry is (ecosystem, package name, what it is here to prove).
WANTED = [
    ("Maven", "org.apache.logging.log4j:log4j-core", "enumerated versions, many advisories"),
    ("Maven", "com.google.guava:guava", "enumerated versions"),
    ("NuGet", "Newtonsoft.Json", "enumerated versions in a second ecosystem"),
    ("Go", "github.com/hashicorp/consul", "semver ranges"),
    ("Go", "golang.org/x/crypto", "semver ranges, and a common corpus module"),
    ("Go", "github.com/opencontainers/runc", "semver ranges, KEV candidate"),
    ("npm", "lodash", "semver ranges in a second ecosystem"),
    ("npm", "minimist", "semver ranges"),
    ("Debian:11", "openssl", "the package every reviewer asks about; enumerated versions"),
    ("Debian:11", "ntp", "87 entries with ranges and no version list: must abstain"),
    (
        "Maven",
        "org.xwiki.platform:xwiki-platform-web-templates",
        "51 unevaluable entries and ZERO evaluable ones, so the whole component must abstain",
    ),
]

# MAL- records, which must be reachable and must never be summed with the above.
WANTED_MALICIOUS = [("npm", None, "whichever malicious npm records the source holds")]

SCHEMA = 1


def slug(ecosystem):
    return "".join(c if (c.isalnum() or c in "._-") else "-" for c in ecosystem)


def build(src):
    manifest_path = os.path.join(src, "manifest.json")
    if not os.path.exists(manifest_path):
        print("    FAILED: no mirror at %s; build one first" % src)
        return 1
    manifest = json.load(io.open(manifest_path, encoding="utf-8"))

    os.makedirs(os.path.join(OUT, "advisories"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "malicious"), exist_ok=True)

    picked = {}
    for ecosystem, name, _why in WANTED:
        picked.setdefault(ecosystem, {})
        path = os.path.join(src, "advisories", slug(ecosystem) + ".json")
        if not os.path.exists(path):
            print("    %s: no shard in the source mirror, skipped" % ecosystem)
            continue
        shard = json.load(io.open(path, encoding="utf-8"))
        found = shard["advisories"].get(name)
        if not found:
            print("    %s %s: not in the source mirror, skipped" % (ecosystem, name))
            continue
        picked[ecosystem][name] = found

    # Keep the malicious side small: a handful of real MAL- records is enough
    # to prove they are reachable, separate, and never counted as vulnerabilities.
    malicious = {}
    for ecosystem, _n, _why in WANTED_MALICIOUS:
        path = os.path.join(src, "malicious", slug(ecosystem) + ".json")
        if not os.path.exists(path):
            continue
        shard = json.load(io.open(path, encoding="utf-8"))
        chosen = dict(sorted(shard["advisories"].items())[:5])
        malicious[ecosystem] = chosen

    ecosystems = sorted(set(list(picked) + list(malicious)))
    for ecosystem in ecosystems:
        for kind, table in (("advisories", picked), ("malicious", malicious)):
            io.open(
                os.path.join(OUT, kind, slug(ecosystem) + ".json"), "w", encoding="utf-8", newline="\n"
            ).write(
                json.dumps(
                    {
                        "ecosystem": ecosystem,
                        "kind": "vulnerability" if kind == "advisories" else "malicious",
                        "advisories": table.get(ecosystem, {}),
                    },
                    indent=1,
                    sort_keys=True,
                )
                + "\n"
            )

    # Only the KEV entries the fixture's own advisories reference. The full
    # catalogue is 1.7 MB and none of the rest is reachable from here.
    aliases = set()
    for table in picked.values():
        for advisories in table.values():
            for a in advisories:
                aliases.add(a["id"])
                aliases.update(a.get("aliases") or [])
    kev_src = json.load(io.open(os.path.join(src, "kev.json"), encoding="utf-8"))
    kev_rows = [v for v in kev_src.get("vulnerabilities", []) if v.get("cveID") in aliases]
    io.open(os.path.join(OUT, "kev.json"), "w", encoding="utf-8", newline="\n").write(
        json.dumps(
            {
                "catalogVersion": kev_src.get("catalogVersion"),
                "$comment": (
                    "Only the KEV rows referenced by this fixture's advisories. The full "
                    "catalogue is 1,717 entries and the rest is unreachable from here."
                ),
                "vulnerabilities": kev_rows,
            },
            indent=1,
            sort_keys=True,
        )
        + "\n"
    )

    by_source = {s["name"]: s for s in manifest["sources"]}
    sources = []
    for ecosystem in ecosystems:
        origin = next(
            (s for s in manifest["sources"] if ecosystem in s["ecosystems"]),
            None,
        )
        sources.append(
            {
                "name": origin["name"] if origin else "OSV %s" % ecosystem,
                "url": origin["url"] if origin else "",
                # The date the REAL data was captured, carried through. A fixture
                # that reports today's date would be claiming freshness it does
                # not have.
                "fetchedAt": origin["fetchedAt"] if origin else "",
                "sha256": origin["sha256"] if origin else "",
                "ecosystems": [ecosystem],
                "vulnerabilities": sum(len(v) for v in picked.get(ecosystem, {}).values()),
                "maliciousPackageReports": sum(len(v) for v in malicious.get(ecosystem, {}).values()),
            }
        )

    out_manifest = {
        "schema": SCHEMA,
        "$comment": (
            "A small real subset of a full mirror, for offline tests. Rebuild with "
            "scripts/mirror-fixture.py --from .mirror. Not a mirror to check anything "
            "real against: it holds %d packages." % sum(len(v) for v in picked.values())
        ),
        "builtAt": manifest["builtAt"],
        "sources": sources,
        "kev": {
            "url": manifest.get("kev", {}).get("url", ""),
            "fetchedAt": manifest.get("kev", {}).get("fetchedAt", ""),
            "catalogVersion": manifest.get("kev", {}).get("catalogVersion", ""),
            "count": len(kev_rows),
        },
    }
    io.open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8", newline="\n").write(
        json.dumps(out_manifest, indent=2, sort_keys=True) + "\n"
    )

    total = sum(len(v) for v in picked.values())
    size = sum(
        os.path.getsize(os.path.join(dp, f))
        for dp, _dn, fn in os.walk(OUT)
        for f in fn
    )
    print("    wrote %s" % os.path.relpath(OUT, ROOT))
    print("    %d packages across %d ecosystems, %d KEV rows, %.0f KB"
          % (total, len(ecosystems), len(kev_rows), size / 1024))
    return 0


def check():
    """Offline. Structure, provenance, and that each path it claims to cover is present."""
    fail = 0
    manifest_path = os.path.join(OUT, "manifest.json")
    if not os.path.exists(manifest_path):
        print("    FAILED: no fixture at %s" % os.path.relpath(OUT, ROOT))
        return 1
    m = json.load(io.open(manifest_path, encoding="utf-8"))

    if m.get("schema") != SCHEMA:
        print("    FAILED: fixture is schema %s, this script writes %s" % (m.get("schema"), SCHEMA))
        fail = 1

    # Every shard the manifest names must exist, in BOTH kinds. An ecosystem
    # with no malicious records still gets an empty file, because that is what
    # makes a missing file mean something went wrong rather than nothing did.
    ecosystems = sorted({e for s in m["sources"] for e in s["ecosystems"]})
    for ecosystem in ecosystems:
        for kind in ("advisories", "malicious"):
            p = os.path.join(OUT, kind, slug(ecosystem) + ".json")
            if not os.path.exists(p):
                print("    FAILED: %s names %s but %s is missing" % (ecosystem, kind, os.path.relpath(p, ROOT)))
                fail = 1

    # A date with no provenance is a rumour, and a fixture is the easiest place
    # for provenance to get lost, because nothing downstream depends on it.
    for s in m["sources"]:
        for field in ("name", "url", "fetchedAt", "sha256"):
            if not s.get(field):
                print("    FAILED: source %s has no %s" % (s.get("name", "?"), field))
                fail = 1

    # The paths the fixture exists to exercise. If a rebuild silently drops the
    # Debian records, every abstention test still passes by checking nothing.
    seen_ranges = {"SEMVER": 0, "ECOSYSTEM": 0}
    enumerated = 0
    malicious_total = 0
    # An affected entry with ranges this matcher cannot evaluate AND no
    # enumerated version list. THIS is the abstention path, and counting
    # ECOSYSTEM ranges does not find it: 43 percent of Debian entries carry
    # both, and an exact match on the version list answers those without any
    # dpkg ordering at all. The first version of this check counted the ranges,
    # reported the path covered, and the fixture contained no such entry.
    unevaluable = 0
    for ecosystem in ecosystems:
        adv = json.load(io.open(os.path.join(OUT, "advisories", slug(ecosystem) + ".json"), encoding="utf-8"))
        for rows in adv["advisories"].values():
            for a in rows:
                for af in a["affected"]:
                    if af.get("versions"):
                        enumerated += 1
                    ranges = af.get("ranges") or []
                    for r in ranges:
                        if r.get("type") in seen_ranges:
                            seen_ranges[r["type"]] += 1
                    if not af.get("versions") and ranges and all(r.get("type") != "SEMVER" for r in ranges):
                        unevaluable += 1
        mal = json.load(io.open(os.path.join(OUT, "malicious", slug(ecosystem) + ".json"), encoding="utf-8"))
        malicious_total += len(mal["advisories"])

    if enumerated == 0:
        print("    FAILED: no enumerated version lists, so the exact-match path is untested")
        fail = 1
    if seen_ranges["SEMVER"] == 0:
        print("    FAILED: no SEMVER ranges, so the range evaluator is untested")
        fail = 1
    if seen_ranges["ECOSYSTEM"] == 0:
        print("    FAILED: no ECOSYSTEM ranges, so the abstention path is untested")
        fail = 1
    if malicious_total == 0:
        print("    FAILED: no malicious-package records, so their separation is untested")
        fail = 1
    if unevaluable == 0:
        print(
            "    FAILED: no affected entry has ranges without an enumerated version list, so "
            "nothing here forces an abstention and the clear-versus-unknown wall is untested"
        )
        fail = 1

    if fail:
        return 1
    print(
        "    %d ecosystems; %d enumerated lists, %d semver ranges, %d ecosystem ranges, "
        "%d malicious packages, %d entries that must abstain; every source carries a url, "
        "a date and a digest"
        % (len(ecosystems), enumerated, seen_ranges["SEMVER"], seen_ranges["ECOSYSTEM"],
           malicious_total, unevaluable)
    )
    return 0


if __name__ == "__main__":
    if "--from" in sys.argv:
        sys.exit(build(sys.argv[sys.argv.index("--from") + 1]))
    sys.exit(check())
