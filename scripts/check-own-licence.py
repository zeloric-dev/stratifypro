#!/usr/bin/env python3
"""Every package in this workspace declares the licence the repository ships.

FOUND BY ASKING WHAT A CUSTOMER DOES IF WE DISAPPEAR. SPEC.md 2.8 calls source
escrow and a continuity plan "the question that actually loses solo-founder
deals", and the honest answer here is strong: the repository is public and
everything reproduces by command. That answer only works if the licence lets
somebody use it, so the licence was worth checking.

`LICENSE` is Apache-2.0 and GitHub reports it. Not one of the twelve
package.json files in this workspace declared a licence field.

WHY THAT IS NOT A NIT. `cisa-2026-v2.1` contains rule CISA-CD-006, "Component
License is present, or explicitly unknown". An SBOM generated from this
repository would have failed this project's own rule on every component, and
the product being sold is a checker for exactly that. Tooling reads the
package.json field, not the LICENSE file at the repository root: an npm package
with no license field is treated as unlicensed by convention, which for a
consumer means "you have no permission to use this".

So this check exists to dogfood one rule from our own pack against ourselves.

    python3 scripts/check-own-licence.py
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LICENSE = os.path.join(ROOT, "LICENSE")

# The SPDX identifier every package must declare, read from the LICENSE file
# rather than written here, so a change of licence cannot leave twelve
# manifests quietly claiming the old one.
DETECT = [
    (r"Apache License\s*\n?\s*Version 2\.0", "Apache-2.0"),
    (r"MIT License", "MIT"),
    (r"GNU GENERAL PUBLIC LICENSE\s*\n?\s*Version 3", "GPL-3.0"),
    (r"Mozilla Public License Version 2\.0", "MPL-2.0"),
    (r"BSD 3-Clause", "BSD-3-Clause"),
]


def expected_spdx():
    if not os.path.exists(LICENSE):
        return None
    head = io.open(LICENSE, encoding="utf-8").read()[:2000]
    for pattern, spdx in DETECT:
        if re.search(pattern, head, re.IGNORECASE):
            return spdx
    return None


def manifests():
    out = [os.path.join(ROOT, "package.json")]
    for base in ("packages", "apps"):
        d = os.path.join(ROOT, base)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            p = os.path.join(d, name, "package.json")
            if os.path.exists(p):
                out.append(p)
    return out


def main():
    expected = expected_spdx()
    if expected is None:
        print("    FAILED: no LICENSE at the repository root, or one this cannot identify.")
        print("    A public repository with no licence grants nobody permission to use it,")
        print("    which makes the continuity answer in docs/continuity.md untrue.")
        return 1

    fail = 0
    checked = 0
    for p in manifests():
        d = json.load(io.open(p, encoding="utf-8"))
        rel = os.path.relpath(p, ROOT)
        declared = d.get("license")
        checked += 1
        if not declared:
            print("    FAILED: %s declares no licence." % rel)
            print("            Tooling reads this field, not the LICENSE file. A package")
            print("            with no license field is treated as unlicensed, and this")
            print("            is what CISA-CD-006 in our own pack is about.")
            fail = 1
        elif declared != expected:
            print("    FAILED: %s declares %r but LICENSE is %s" % (rel, declared, expected))
            fail = 1

    if fail:
        return 1
    print("    %d package(s), all declaring %s, matching the LICENSE file" % (checked, expected))
    return 0


if __name__ == "__main__":
    sys.exit(main())
