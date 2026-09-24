#!/usr/bin/env python3
"""Assert the structural claims this repo makes about itself.

Every number here is read from a data file, never from prose. If a document and this
script disagree, the document is wrong.
"""
import json, os, sys, glob
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fail = []

def check(label, got, want):
    if got == want:
        print("    ok   %-52s %s" % (label, got))
    else:
        print("    FAIL %-52s got %s, expected %s" % (label, got, want))
        fail.append(label)


def nonempty(value):
    """True when a field carries an actual value.

    A key that exists holding an empty string is not a recorded fact. The
    provenance check below previously tested `k not in e`, which asserts only
    that the key is present. All 21 corpus entries carried an `upstream` key
    and 18 of them held "", so a check named for recording provenance passed
    while 86 percent of the provenance was missing.

    Quality rule 6: a grep is not a check, a count is not a match. Presence is
    not a value. Every claim assertion in this file goes through here.
    """
    return value is not None and str(value).strip() != ""


def declared_unknown(entry, field):
    """True when the record explicitly states that this field is not known.

    A gap that is stated is not the same as a gap that is silent. That is the
    CISA practice rule CISA-PR-004 in this repository tests for, and there is
    no reason the repository's own records should be held to a weaker standard
    than the documents it grades.

    A blank field still fails. Only `<field>Unknown` carrying a real reason
    satisfies the check, which makes the gap countable, greppable and
    reviewable instead of invisible.
    """
    return nonempty(entry.get(field + "Unknown"))


def missing_fields(entries, fields):
    """Sorted "file:field" for every field neither supplied nor declared unknown."""
    return sorted(
        "%s:%s" % (e.get("file", "?"), k)
        for e in entries
        for k in fields
        if not nonempty(e.get(k)) and not declared_unknown(e, k)
    )

# 1. rule packs: counts and severity distribution
expect = {
    "cisa-2026-v2.1": (23, {"warning": 15, "info": 8}),
    "fda-524b":       (16, {"error": 2, "warning": 12, "info": 2}),
    # 50 elements, one rule each, and not one of them may be an error: the
    # source says its elements are not mandatory, so normativeLanguage is
    # false and the loader refuses `error` on every rule citing it.
    "g7-ai-2026":     (50, {"warning": 17, "info": 33}),
}
total_rules = 0
for name, (n, dist) in expect.items():
    d = json.load(open(os.path.join(root, "packages/rules/packs/%s.json" % name), encoding="utf-8"))
    rules = d["rules"]
    total_rules += len(rules)
    got = {}
    for r in rules:
        got[r["severity"]] = got.get(r["severity"], 0) + 1
    check("%s rule count" % name, len(rules), n)
    check("%s severity split" % name, got, dist)

# 2. no rule in an advisory pack may be an error
cisa = json.load(open(os.path.join(root, "packages/rules/packs/cisa-2026-v2.1.json"), encoding="utf-8"))
check("cisa pack caps severity at warning",
      cisa["severityModel"]["maxSeverityFromThisSource"], "warning")
check("cisa pack has zero error-severity rules",
      sum(1 for r in cisa["rules"] if r["severity"] == "error"), 0)

# 3. fixtures: one pass and one fail per rule, per format
fixdir = os.path.join(root, "packages/rules/fixtures")
rule_dirs = sorted(os.listdir(fixdir))
check("fixture directories equal total rules", len(rule_dirs), total_rules)
# Two files per rule PER FORMAT the rule applies to, not four per rule. The
# flat multiplier was right while every pack covered both formats and became
# wrong the moment one did not: g7-ai-2026 is CycloneDX only, so it contributes
# two files per rule rather than four.
expected_files = sum(
    2 * len(r["appliesTo"])
    for name in expect
    for r in json.load(
        open(os.path.join(root, "packages/rules/packs/%s.json" % name), encoding="utf-8")
    )["rules"]
)
check("fixture files", sum(len(fs) for _, _, fs in os.walk(fixdir)), expected_files)

# 4. the reference validator really does have six numbered checks
import re
vsrc = open(os.path.join(root, "packages/rules/src/validate.py"), encoding="utf-8").read()
check("reference validator numbered checks",
      len(re.findall(r"^\s*#\s*(\d+)\.", vsrc, re.M)), 6)

# 5. corpus
prov = json.load(open(os.path.join(root, "fixtures/corpus/provenance.json"), encoding="utf-8"))
check("corpus files", len(prov), 21)
import hashlib
bad = []
for e in prov:
    f = os.path.join(root, "fixtures/corpus", e["file"])
    h = hashlib.sha256(open(f, "rb").read()).hexdigest()
    if h != e["sha256"].replace("sha256:", ""):
        bad.append(e["file"])
check("every corpus file matches its recorded SHA-256", bad, [])
PROV_FIELDS = ("file", "sha256", "upstream", "tool")
check("every corpus file records its provenance",
      missing_fields(prov, PROV_FIELDS), [])

# onEmptySelector decides the engine contract for the commonest case, so its
# distribution is pinned the way severity distribution is. The schema's
# required array catches a rule that omits the field; nothing else would catch
# a rule quietly flipped from fire to skip, which changes what the engine
# reports without changing any count.
_oes = {}
for _name in ("cisa-2026-v2.1", "fda-524b"):
    _p = json.load(open(os.path.join(root, "packages/rules/packs/%s.json" % _name), encoding="utf-8"))
    for _r in _p["rules"]:
        _oes[_r["onEmptySelector"]] = _oes.get(_r["onEmptySelector"], 0) + 1
check("onEmptySelector distribution", sorted(_oes.items()), [("fire", 39)])

# 5. coverage baseline reproduces from the corpus
cov = json.load(open(os.path.join(root, "docs/coverage-baseline.json"), encoding="utf-8"))["summary"]
check("coverage component total", cov["n"], 5088)

# 6. benchmark split has no leakage: no held-out file feeds the alias dictionary
split = json.load(open(os.path.join(root, "bench/identity/split.json"), encoding="utf-8"))
train = set(split["train"]); held = set(split["heldOut"])
check("train and heldout do not overlap", sorted(train & held), [])
check("split covers the corpus", len(train | held), len(prov))
ad = json.load(open(os.path.join(root, "packages/rules/data/alias-dictionary.json"), encoding="utf-8"))
check("alias dictionary built from train files only",
      sorted(set(ad["trainFiles"]) - train), [])
check("alias dictionary entries", len(ad["entries"]), 1854)

# 7. benchmark dataset
rows = [json.loads(l) for l in open(os.path.join(root, "bench/identity/dataset.jsonl"), encoding="utf-8")]
check("benchmark rows", len(rows), 3326)

# The total alone does not pin the dataset. A regenerated file with the same
# 2,913 rows but five unknowns would pass, and README.md's stated composition
# would quietly become false. These are the figures the README publishes, so
# they are asserted here and the README is not a second copy of them.
_unknown = [r for r in rows if r.get("class") == "unknown"]
_synth = [r for r in rows if r.get("perturbation")]
check("benchmark unknown-class rows", len(_unknown), 250)
check("benchmark real (unperturbed) rows", len(rows) - len(_synth), 996)
check("benchmark synthetic rows", len(_synth), 2330)

# Families, not the exact per-shape counts. The shapes are drawn at random from
# a fixed seed, so their individual counts are an artefact of the seed and not
# a claim anyone makes. What matters is that all six families are present and
# that the path-stripped family, which is the one carrying the unknown class,
# has not silently vanished.
_families = {}
for r in _synth:
    _families[r["perturbation"].split("+")[0]] = _families.get(r["perturbation"].split("+")[0], 0) + 1
check("benchmark perturbation families", sorted(_families),
      ["archive", "case", "parenthetical", "path-stripped", "spaces", "vendor-prefix", "versioned"])
check("benchmark path-stripped rows are all unknown",
      sorted({r["class"] for r in _synth if r["perturbation"].startswith("path-stripped")}),
      ["unknown"])

# Rule 4 of the benchmark README: every number reproducible by someone who does
# not work here. That covered the baselines and not the dataset they are
# measured on, which arrived as a committed artefact with no generator.
_build = os.path.join(root, "bench/identity/build.py")
check("benchmark dataset has a generator", os.path.exists(_build), True)

# 8. the replacement table and the banned list cannot drift apart
import re as _re
pats = [l.strip() for l in open(os.path.join(root, "docs/banned-phrases.txt"), encoding="utf-8")
        if l.strip() and not l.startswith("#")]
copy = open(os.path.join(root, "docs/copy.md"), encoding="utf-8").read()
table = copy.split("## Words to use instead", 1)[1].split("\n## ", 1)[0]
offered = [l.split("|")[1].strip() for l in table.splitlines()
           if l.startswith("|") and "---" not in l and "Instead of" not in l]
# "our AI found" is a phrasing to avoid, not a banned phrase: no grep can catch a
# sentence shape, so it lives in the replacement table only and is exempt here. It is
# the one exemption, and it is named so it is not a silent hole.
TABLE_ONLY = ("our AI found",)
uncovered = [w for w in offered
             if not any(_re.search(p, w, _re.I) for p in pats)
             and w not in TABLE_ONLY]
check("every word copy.md replaces is still banned", uncovered, [])
check("banned-phrases.txt patterns", len(pats), 15)

# Meta-test: prove the provenance assertion can actually go red.
#
# Non-negotiable 3 says no check ships until it has been seen to fail, and
# until now that rule was applied to the rules and not to the harness that
# enforces them. That asymmetry is what let the empty-provenance defect
# through. This plants a violation in an in-memory copy and asserts the
# assertion reports it. It never touches a file on disk.
# Synthetic, not a copy of the corpus: a plant on a field that is already
# empty proves nothing, and that mistake is easy to make.
_fixture = [
    {"file": "clean.json", "sha256": "abc", "upstream": "https://example.test/x", "tool": "syft-1.0"},
    {"file": "empty-string.json", "sha256": "abc", "upstream": "", "tool": "syft-1.0"},
    {"file": "whitespace.json", "sha256": "abc", "upstream": "   ", "tool": "syft-1.0"},
    {"file": "key-absent.json", "sha256": "abc", "upstream": "https://example.test/y"},
    # A stated gap satisfies the check. A silent one does not.
    {"file": "declared.json", "sha256": "abc", "tool": "syft-1.0",
     "upstream": None, "upstreamUnknown": "Not recorded at collection time; no release asset exists."},
    # An empty reason is not a declaration. It is a blank wearing a label.
    {"file": "hollow-declaration.json", "sha256": "abc", "tool": "syft-1.0",
     "upstream": None, "upstreamUnknown": "   "},
]
check("provenance assertion detects a planted violation",
      missing_fields(_fixture, PROV_FIELDS),
      ["empty-string.json:upstream", "hollow-declaration.json:upstream",
       "key-absent.json:tool", "whitespace.json:upstream"])
check("provenance assertion passes a clean record",
      missing_fields(_fixture[:1], PROV_FIELDS), [])
check("a stated gap satisfies the check, a silent one does not",
      missing_fields([_fixture[4]], PROV_FIELDS), [])

# Countable, not invisible. If these numbers drift upward unnoticed the
# repository is quietly becoming less reproducible, which is the opposite of
# what it claims about itself.
_declared = {f: sum(1 for e in prov if declared_unknown(e, f)) for f in PROV_FIELDS}
check("provenance gaps explicitly declared unknown",
      sorted((k, v) for k, v in _declared.items() if v),
      [("tool", 3), ("upstream", 14)])

print()
if fail:
    print("CLAIM CHECKS FAILED: %d" % len(fail)); sys.exit(1)
print("all structural claims hold")
