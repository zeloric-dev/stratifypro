#!/usr/bin/env python3
"""Break the SPDX 3 converter and watch the equivalence test go red.

THE TEST THIS GUARDS IS THE ONE THAT COULD PASS FOR THE WRONG REASON.
packages/engine/src/spdx3.test.ts checks that the same SBOM written as SPDX 2.3
and as SPDX 3.0.1 produces an identical set of findings. That comparison is
satisfied by two documents that both fail everything, so a converter which
mapped nothing at all could pass it if the 2.3 side were equally bare. The pair
is written to be mostly clean on purpose, and this script is how that is
checked: every mutation below removes one mapping, and the equivalence test
must notice each one.

The failure being modelled is specific and it is the worst one this project can
produce. When the converter misses a field the document really carries, every
rule reading that field reports a missing CISA element, and the report tells a
supplier their submission is short of a regulatory requirement when it is not.

The first mutation is not invented. The SPDX project's own 3.0.1 example writes
`originatedBy` as an array, the first draft of the converter read only a
scalar, and every package in that file silently lost its originator.

    python3 scripts/spdx3-mutation-test.py
"""
import io
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "packages", "engine", "src", "spdx3.ts")
SUITE = os.path.join("packages", "engine", "dist", "spdx3.test.js")

# (label, pattern, replacement) -- each removes exactly one mapping.
MUTATIONS = [
    (
        "an agent reference given as an array is dropped (the real bug)",
        "    if (Array.isArray(ref)) {",
        "    if (Array.isArray(ref) && ref.length < 0) {",
    ),
    (
        "suppliedBy is not read, so no component states a supplier",
        "    const supplier = agentName(p['suppliedBy']);",
        "    const supplier = undefined;",
    ),
    (
        "the package version is not read",
        "    const version = str(p['software_packageVersion']) ?? str(p['packageVersion']);",
        "    const version = undefined;",
    ),
    (
        "the package URL is not read, so nothing carries an identifier",
        "    const purl = str(p['software_packageUrl']) ?? str(p['packageUrl']);",
        "    const purl = undefined;",
    ),
    (
        "hashes are not read",
        "      if (!hh || typeOf(hh) !== 'hash') continue;",
        "      if (!hh || typeOf(hh) !== 'hash-never-matches') continue;",
    ),
    (
        "licence relationships are not resolved",
        "      if (kind === 'hasdeclaredlicense') declared.set(from, text);",
        "      if (kind === 'hasdeclaredlicense-never') declared.set(from, text);",
    ),
    (
        "no creator of any kind is read, so the document names no author",
        "  if (creators.length > 0) creationInfo['creators'] = creators;",
        "  if (creators.length < 0) creationInfo['creators'] = creators;",
    ),
    (
        "licence relationships are copied in as dependencies",
        "    return k !== 'hasdeclaredlicense' && k !== 'hasconcludedlicense';",
        "    return true;",
    ),
    (
        "AI packages stop being packages, so an AI SBOM reads as empty",
        "      case 'aipackage': case 'datasetpackage':\n        packages.push(e); break;",
        "      case 'aipackage': case 'datasetpackage':\n        break;",
    ),
    (
        "profile properties are read only under their prefixed spelling",
        "  if (a !== undefined) return a;\n  return el[key];",
        "  if (a !== undefined) return a;\n  return undefined;",
    ),
    (
        "the support window is dropped, so a stated one reads as absent",
        "const ARTIFACT_KEYS = ['builtTime', 'releaseTime', 'validUntilTime', 'supportLevel', 'standardName'] as const;",
        "const ARTIFACT_KEYS = ['builtTime'] as const;",
    ),
]


def build():
    p = subprocess.run(
        ["pnpm", "--filter", "@stratifypro/engine", "build"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=(os.name == "nt"),
    )
    return p.returncode == 0, p.stdout.decode("utf-8", "replace")


def run_suite():
    """(ok, failing test names). TAP is pinned so the format is not an accident
    of the Node version or of whether stdout is a terminal."""
    p = subprocess.run(
        ["node", "--test", "--test-reporter=tap", SUITE],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    out = p.stdout.decode("utf-8", "replace")
    names = {m.group(1) for m in re.finditer(r"^not ok \d+ - (.+?)\s*$", out, re.M)}
    if p.returncode != 0 and not names:
        raise RuntimeError("the suite failed but no TAP failure lines parsed:\n" + out[-2000:])
    return p.returncode == 0, names


def main():
    original = io.open(SRC, encoding="utf-8").read()
    backup = SRC + ".mutation-backup"
    shutil.copyfile(SRC, backup)
    failures = []
    try:
        ok, _ = build()
        if not ok:
            print("  the engine does not build before any mutation; fix that first")
            return 1
        ok, _ = run_suite()
        if not ok:
            print("  the suite is already red before any mutation; fix that first")
            return 1

        for label, pattern, replacement in MUTATIONS:
            if pattern not in original:
                print("  STALE    %s" % label)
                failures.append("%s: the line it mutates is no longer in the file" % label)
                continue
            io.open(SRC, "w", encoding="utf-8", newline="\n").write(
                original.replace(pattern, replacement)
            )
            built, log = build()
            if not built:
                # A mutation that does not compile proves nothing either way.
                print("  SKIPPED  %s (does not compile)" % label)
                failures.append("%s: the mutation does not compile, so it tests nothing" % label)
                continue
            ok, red = run_suite()
            if ok:
                print("  MISSED   %s" % label)
                failures.append("%s: no test noticed" % label)
            elif not any("EQUIVALENCE" in n for n in red):
                # Something failed, but not the test whose job this is.
                print("  caught   %s  (by %s)" % (label, sorted(red)[0][:60]))
            else:
                print("  caught   %s" % label)
    finally:
        shutil.copyfile(backup, SRC)
        os.remove(backup)
        build()

    if failures:
        for f in failures:
            print("  %s" % f)
        return 1
    print("  %d mappings removed, %d caught" % (len(MUTATIONS), len(MUTATIONS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
