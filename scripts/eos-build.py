#!/usr/bin/env python3
"""Build the end-of-support dataset, and measure how little of an SBOM it can reach.

FDA asks for a software level of support and an end-of-support date per
component. Neither CycloneDX nor SPDX has a field for either, and both packs
carry a rule that fires when they are absent: FDA-SUP-001 and FDA-SUP-002 are
the two largest finding groups in the corpus, 1,160 instances each on a single
file. The tool says the dates are missing and offers nothing to fill them.

THE MEASUREMENT CAME FIRST, AND IT IS NOT FLATTERING. endoflife.date is the only
public source named for this. It tracks 477 PRODUCTS: operating systems,
runtimes, databases, frameworks. Real SBOMs are made of PACKAGES: the corpus is
962 Go modules, 867 npm packages, 560 Maven artifacts, 251 NuGet packages.

Measured across the 21 corpus files, with generous matching that tries the bare
name, the last path segment, and common prefix and suffix stripping:

    58 of 2,873 distinct names      2.0 percent
    125 of 5,088 component instances 2.5 percent

So a dataset built from this source can speak to one component in forty. That is
the honest ceiling and it is published next to the data rather than discovered by
whoever relies on it. What it does reach is the part a reviewer asks about:
OpenSSL, Debian, PostgreSQL, Elasticsearch, Rails. A device running an OpenSSL
past end of support is a finding. `go.uber.org/atomic` having no end-of-support
date is not.

SOURCE AND LICENCE. endoflife.date, https://github.com/endoflife-date/endoflife.date,
MIT, checked 21 September 2026. Every row carries the URL it came from and the
date it was captured, because a date with no provenance is a rumour.

    python3 scripts/eos-build.py --refresh   fetch and rewrite the dataset
    python3 scripts/eos-build.py --check     validate it offline, no network
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "eos", "src", "data", "eos.json")
CORPUS = os.path.join(ROOT, "fixtures", "corpus")

API = "https://endoflife.date/api"
SOURCE_NAME = "endoflife.date"
SOURCE_REPO = "https://github.com/endoflife-date/endoflife.date"
SOURCE_LICENCE = "MIT"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "stratifypro-eos-build"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def norm(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def corpus_components():
    """Every component name in the corpus, with its purl where it has one."""
    names = {}
    for fn in sorted(os.listdir(CORPUS)):
        if not fn.endswith(".json") or fn == "provenance.json":
            continue
        doc = json.load(io.open(os.path.join(CORPUS, fn), encoding="utf-8"))
        stack = list(doc.get("components") or [])
        comps = []
        while stack:
            c = stack.pop(0)
            if isinstance(c, dict):
                comps.append(c)
                stack.extend(c.get("components") or [])
        for c in comps:
            n = c.get("name")
            if n:
                names.setdefault(n, {"count": 0, "purl": None})
                names[n]["count"] += 1
                if c.get("purl"):
                    names[n]["purl"] = names[n]["purl"] or c["purl"]
        for p in doc.get("packages") or []:
            n = p.get("name")
            if not n:
                continue
            names.setdefault(n, {"count": 0, "purl": None})
            names[n]["count"] += 1
            for r in p.get("externalRefs") or []:
                if r.get("referenceType") == "purl":
                    names[n]["purl"] = names[n]["purl"] or r.get("referenceLocator")
    return names


def candidate_slugs(name):
    """The forms a component name might take as an endoflife.date product slug.

    Deliberately generous. A narrow matcher would understate the coverage
    figure, and the point of that figure is to be an honest ceiling rather than
    a flattering floor.
    """
    s = norm(name)
    out = [s, s.split("-")[-1]]
    out.append(re.sub(r"^(lib|python3?-|golang-|node-|ruby-|perl-)", "", s))
    out.append(re.sub(r"(-js|-core|-client|-server|-common|-dev|\d+)$", "", s))
    if "/" in name:
        out.append(norm(name.split("/")[-1]))
    return [x for x in dict.fromkeys(out) if x]


def refresh():
    today = time.strftime("%Y-%m-%d")
    products = fetch(API + "/all.json")
    names = corpus_components()

    by_slug = {norm(p): p for p in products}
    matched = {}
    for n in names:
        for c in candidate_slugs(n):
            if c in by_slug:
                matched[n] = by_slug[c]
                break

    wanted = sorted(set(matched.values()))
    print("  %d products published by the source" % len(products))
    print("  %d of them appear in the corpus; fetching those" % len(wanted))

    rows = []
    for i, product in enumerate(wanted, 1):
        url = "%s/%s.json" % (API, product)
        try:
            cycles = fetch(url)
        except urllib.error.HTTPError as e:
            print("    %s: HTTP %s, skipped" % (product, e.code))
            continue
        rows.append(
            {
                "product": product,
                "cycles": [
                    {
                        "cycle": str(c.get("cycle")),
                        # true means "still supported", false means "ended, date
                        # not published". Neither is a date and neither is
                        # flattened into one.
                        "eol": c.get("eol"),
                        "lts": bool(c.get("lts")),
                        "latest": c.get("latest"),
                    }
                    for c in cycles
                ],
                "source": url,
                "sourceName": SOURCE_NAME,
                "sourceLicence": SOURCE_LICENCE,
                "capturedAt": today,
            }
        )
        if i % 10 == 0:
            print("    %d/%d" % (i, len(wanted)))
        time.sleep(0.05)

    total_names = len(names)
    total_instances = sum(v["count"] for v in names.values())
    covered_names = len(matched)
    covered_instances = sum(names[n]["count"] for n in matched)

    out = {
        "$comment": (
            "End-of-support dates keyed by product, with the corpus coverage this "
            "source can reach. Rebuild with scripts/eos-build.py --refresh."
        ),
        "capturedAt": today,
        "source": {"name": SOURCE_NAME, "repository": SOURCE_REPO, "licence": SOURCE_LICENCE},
        "coverage": {
            "corpusFiles": len([f for f in os.listdir(CORPUS) if f.endswith(".json")]) - 1,
            "distinctNames": total_names,
            "distinctNamesWithData": covered_names,
            "componentInstances": total_instances,
            "componentInstancesWithData": covered_instances,
            "method": (
                "Generous slug matching: the bare name, its last path segment, and "
                "common prefix and suffix stripping. A narrower matcher would "
                "understate this figure."
            ),
        },
        "matches": {n: matched[n] for n in sorted(matched)},
        "products": sorted(rows, key=lambda r: r["product"]),
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(
        json.dumps(out, indent=2, sort_keys=True) + "\n"
    )
    print()
    print("  wrote %s" % os.path.relpath(OUT, ROOT))
    print(
        "  coverage: %d of %d names (%.1f%%), %d of %d instances (%.1f%%)"
        % (
            covered_names, total_names, 100.0 * covered_names / total_names,
            covered_instances, total_instances, 100.0 * covered_instances / total_instances,
        )
    )
    return 0


def check():
    """Offline. verify.sh runs on a machine with no network and must stay that way."""
    if not os.path.exists(OUT):
        print("    FAILED: %s does not exist; run --refresh" % os.path.relpath(OUT, ROOT))
        return 1
    d = json.load(io.open(OUT, encoding="utf-8"))
    fail = 0

    for key in ("capturedAt", "source", "coverage", "products", "matches"):
        if key not in d:
            print("    FAILED: the dataset has no %s" % key)
            fail = 1
    if fail:
        return 1

    # A date with no provenance is a rumour. Every row states where it came from
    # and when, or it is not a row.
    for r in d["products"]:
        for field in ("product", "source", "sourceName", "sourceLicence", "capturedAt", "cycles"):
            if not r.get(field):
                print("    FAILED: %s has no %s" % (r.get("product", "?"), field))
                fail = 1
        if not str(r.get("source", "")).startswith("https://"):
            print("    FAILED: %s source is not a URL" % r.get("product"))
            fail = 1
        for c in r.get("cycles", []):
            if "cycle" not in c or "eol" not in c:
                print("    FAILED: %s has a cycle with no cycle or eol key" % r["product"])
                fail = 1

    # The coverage figure is the honest ceiling on this dataset and it is
    # recomputed here rather than trusted, because it is the number a reader is
    # most likely to quote.
    names = corpus_components()
    total_names = len(names)
    total_instances = sum(v["count"] for v in names.values())
    cov = d["coverage"]
    if cov["distinctNames"] != total_names or cov["componentInstances"] != total_instances:
        print(
            "    FAILED: the stated corpus size (%s names, %s instances) is not the "
            "corpus (%s, %s)" % (cov["distinctNames"], cov["componentInstances"],
                                 total_names, total_instances)
        )
        fail = 1

    matched = d["matches"]
    if cov["distinctNamesWithData"] != len(matched):
        print("    FAILED: stated match count %s, actual %s" % (cov["distinctNamesWithData"], len(matched)))
        fail = 1
    recomputed = sum(names[n]["count"] for n in matched if n in names)
    if cov["componentInstancesWithData"] != recomputed:
        print("    FAILED: stated instance coverage %s, recomputed %s" % (cov["componentInstancesWithData"], recomputed))
        fail = 1

    if fail:
        return 1
    print(
        "    %d products, every row with a source and a capture date; reaches %d of %d "
        "component instances (%.1f%%)"
        % (len(d["products"]), cov["componentInstancesWithData"], cov["componentInstances"],
           100.0 * cov["componentInstancesWithData"] / cov["componentInstances"])
    )
    return 0


if __name__ == "__main__":
    if "--refresh" in sys.argv:
        sys.exit(refresh())
    sys.exit(check())
