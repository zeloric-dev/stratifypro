#!/usr/bin/env python3
"""docs/schema-extensions.md names rules and fixtures that exist.

SPEC.md 3.3 accepts on "each has rules, fixtures and a documented schema-
extension proposal". The document is the easy part and the part that rots: a
proposal citing FDA-SUP-002 stays readable long after somebody renames the
rule, and a reader has no way to tell.

So every rule id the document cites must be in a shipped pack, and every
fixture directory it names must exist and hold a fixture. Four gaps are
claimed; four must be found. This is the same discipline as
scripts/check-readme.py, applied to the one document whose whole value is that
its citations are real.

    python3 scripts/check-schema-extensions.py
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, "docs", "schema-extensions.md")
PACKS = os.path.join(ROOT, "packages", "rules", "packs")
FIXTURES = os.path.join(ROOT, "packages", "rules", "fixtures")

EXPECTED_GAPS = 4

RULE_RE = re.compile(r"\b([A-Z][A-Z0-9]{1,5}-[A-Z]{2,6}-\d{3})\b")
# A gap is an H2 whose text starts with a number, which is how the four are
# written. Counting them stops a fifth being added to the prose while the
# summary above still says four.
GAP_RE = re.compile(r"^## \d+\.\s+\S", re.M)


def known_rule_ids():
    out = {}
    for name in sorted(os.listdir(PACKS)):
        if not name.endswith(".json"):
            continue
        pack = json.load(io.open(os.path.join(PACKS, name), encoding="utf-8"))
        for r in pack["rules"]:
            out[r["id"]] = pack["id"]
    return out


def fixture_ok(rule_id):
    d = os.path.join(FIXTURES, rule_id)
    if not os.path.isdir(d):
        return False, "no fixture directory"
    files = [f for f in os.listdir(d) if f.endswith(".json")]
    if not any(f.startswith("pass.") for f in files):
        return False, "no pass fixture"
    if not any(f.startswith("fail.") for f in files):
        return False, "no fail fixture"
    return True, ""


# (label, text, must_be_flagged) -- the checker's own extraction, checked.
SELF_TESTS = [
    ("a real rule id", "See `FDA-SUP-002` for the rule.", ["FDA-SUP-002"]),
    ("a G7 id with a digit in its prefix", "Rule G7-KPI-001 fires.", ["G7-KPI-001"]),
    ("two on one line", "`G7-SEC-001`, `G7-INF-002` both apply.", ["G7-SEC-001", "G7-INF-002"]),
    ("prose that is not an id", "The CIS-IG1 catalogue, control 4.1.", []),
    ("a lowercase near-miss", "see fda-sup-002 somewhere", []),
]


def self_test():
    bad = []
    for label, text, want in SELF_TESTS:
        got = RULE_RE.findall(text)
        if got != want:
            bad.append("    the extractor is wrong on %r: got %s, expected %s"
                       % (label, got, want))
    # And the gap counter, which is the other thing that can silently drift.
    sample = "## 1. A\ntext\n## 2. B\n## Not a gap\n## 3. C\n"
    if len(GAP_RE.findall(sample)) != 3:
        bad.append("    the gap counter is wrong: got %d, expected 3"
                   % len(GAP_RE.findall(sample)))
    return bad


def main():
    broken = self_test()
    if broken:
        print("\n".join(broken))
        print("    the check does not work, so its verdict on the document means nothing")
        return 1
    print("    %d extraction cases planted, all sorted correctly" % (len(SELF_TESTS) + 1))

    if not os.path.exists(DOC):
        print("    docs/schema-extensions.md does not exist, and SPEC.md 3.3 requires it")
        return 1
    text = io.open(DOC, encoding="utf-8").read()

    gaps = len(GAP_RE.findall(text))
    if gaps != EXPECTED_GAPS:
        print("    the document describes %d gaps; SPEC.md 3.3 names %d" % (gaps, EXPECTED_GAPS))
        return 1

    known = known_rule_ids()
    cited = sorted(set(RULE_RE.findall(text)))
    if not cited:
        print("    the document cites no rule at all, so nothing connects it to the packs")
        return 1

    problems = []
    for rid in cited:
        if rid not in known:
            problems.append("%s is cited but is in no pack" % rid)
            continue
        ok, why = fixture_ok(rid)
        if not ok:
            problems.append("%s: %s" % (rid, why))

    if problems:
        for p in problems:
            print("    %s" % p)
        return 1

    print("    %d gaps, %d rules cited, every one shipped and fixtured" % (gaps, len(cited)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
