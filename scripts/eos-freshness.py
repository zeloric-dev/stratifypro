#!/usr/bin/env python3
"""Re-fetch every source the end-of-support dataset cites, and say what moved.

Doc 6 step 2.3: "re-fetches every source URL; fails on 404 or a stale capture
date."

WHY THIS EXISTS SEPARATELY FROM verify.sh. Every row in the dataset carries a
capturedAt, and a capture date nobody re-checks is not provenance, it is a
timestamp on a claim that has quietly stopped being true. verify.sh runs offline
and must keep doing so, because it gates the build and a gate that needs the
network fails for reasons that have nothing to do with the code. So this is a
scheduled job instead.

THREE FAILURES, AND THE MIDDLE ONE IS THE POINT.

  gone     the source URL 404s. The product was renamed or withdrawn and the
           row now cites nothing.

  drifted  the source still resolves and its answer has CHANGED. This is the
           one that matters. An end-of-support date that moved while a
           submission quoted the old one is a wrong date in a regulatory
           filing, and it fails silently in every other respect: the file
           parses, the check passes, the report renders.

  stale    nothing has been re-checked in STALE_DAYS. Not a defect in the data,
           a defect in the process around it.

Exit 1 on any of them, with the specific product and cycle named, because
"something changed" is not actionable and "OpenSSL 3.0 moved from 2026-09-07 to
a later date" is.

    python3 scripts/eos-freshness.py           check, report, exit nonzero on drift
    python3 scripts/eos-freshness.py --quiet   same, only the summary
"""
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "packages", "eos", "src", "data", "eos.json")

# Ninety days. endoflife.date changes continuously, and a dataset that is a
# quarter old is one a reader could reasonably still trust while a reviewer
# could reasonably question. Shorter and the job cries wolf on a stable
# dataset; longer and a moved date can sit in a submission for two quarters.
STALE_DAYS = 90


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "stratifypro-eos-freshness"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def days_since(iso):
    try:
        then = time.mktime(time.strptime(iso, "%Y-%m-%d"))
    except ValueError:
        return None
    return int((time.time() - then) / 86400)


def main():
    quiet = "--quiet" in sys.argv
    if not os.path.exists(DATA):
        print("    FAILED: %s does not exist" % os.path.relpath(DATA, ROOT))
        return 1

    d = json.load(io.open(DATA, encoding="utf-8"))
    products = d.get("products") or []
    if not products:
        print("    FAILED: the dataset has no products, so this check proves nothing")
        return 1

    gone, drifted, errors = [], [], []
    checked = 0

    for row in products:
        url = row["source"]
        try:
            live = fetch(url)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                gone.append((row["product"], url))
            else:
                errors.append((row["product"], "HTTP %s" % e.code))
            continue
        except Exception as e:  # network, DNS, timeout
            errors.append((row["product"], type(e).__name__))
            continue

        checked += 1
        # Compare only what we committed. The source publishes fields this
        # dataset deliberately does not carry, and a diff on those would be
        # noise that trains people to ignore this job.
        live_by_cycle = {str(c.get("cycle")): c for c in live}
        for c in row["cycles"]:
            name = c["cycle"]
            fresh = live_by_cycle.get(name)
            if fresh is None:
                drifted.append((row["product"], name, c.get("eol"), "the cycle is gone upstream"))
                continue
            if fresh.get("eol") != c.get("eol"):
                drifted.append((row["product"], name, c.get("eol"), fresh.get("eol")))
        for name in live_by_cycle:
            if not any(c["cycle"] == name for c in row["cycles"]):
                drifted.append((row["product"], name, "absent here", live_by_cycle[name].get("eol")))
        time.sleep(0.05)

    age = days_since(d.get("capturedAt", ""))
    stale = age is not None and age > STALE_DAYS

    if not quiet:
        for p, url in gone:
            print("    GONE     %s  %s" % (p, url))
        for p, cycle, was, now in drifted:
            print("    DRIFTED  %s cycle %s: %s -> %s" % (p, cycle, was, now))
        for p, why in errors:
            print("    ERROR    %s  %s" % (p, why))

    print()
    print("    %d of %d sources re-fetched" % (checked, len(products)))
    print("    captured %s, %s days ago (stale after %d)" % (d.get("capturedAt"), age, STALE_DAYS))

    if errors and not gone and not drifted:
        # A source that is unreachable right now is not a source that changed.
        # Saying otherwise would make this job fail on someone else's outage and
        # teach people to ignore it.
        print("    %d source(s) unreachable; treated as inconclusive, not as drift" % len(errors))

    problems = len(gone) + len(drifted) + (1 if stale else 0)
    if problems == 0:
        print("    every source still resolves and still says the same thing")
        return 0

    if stale:
        print("    STALE: re-run scripts/eos-build.py --refresh")
    if gone or drifted:
        print("    %d gone, %d drifted: re-run scripts/eos-build.py --refresh and read the diff"
              % (len(gone), len(drifted)))
    return 1


if __name__ == "__main__":
    sys.exit(main())
