#!/usr/bin/env python3
"""Scores a resolver against the identity benchmark.

A resolver is any callable taking a raw component string and returning either a PURL
base string or None. None means abstain. Abstention is measured separately and is
never counted as a wrong answer, because a resolver that says "I do not know" is
strictly better than one that guesses: a wrong identifier produces a confident wrong
vulnerability verdict, which is the failure this whole product exists to prevent.

Reported: precision over answers given, recall over answerable rows, F1, abstention
rate, and the false-positive rate on the unknown class, which is the number that
matters most.

Usage: python3 bench/identity/run.py [--subset clean|perturbed|all]
"""
import json, sys, re, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).parent / "dataset.jsonl"

def load(subset="all"):
    rows = [json.loads(l) for l in open(DATA, encoding="utf-8")]
    if subset == "clean":     rows = [r for r in rows if "perturbation" not in r]
    elif subset == "perturbed": rows = [r for r in rows if "perturbation" in r]
    return rows

def score(name, resolver, rows):
    tp = fp = abstain = 0
    unknown_fp = unknown_ok = 0
    answerable = sum(1 for r in rows if r["purl"])
    for r in rows:
        got = resolver(r["input"])
        if got is None:
            abstain += 1
            if not r["purl"]: unknown_ok += 1
        elif r["purl"] and got == r["purl"]:
            tp += 1
        else:
            fp += 1
            if not r["purl"]: unknown_fp += 1
    answered = tp + fp
    prec = tp / answered if answered else 0.0
    rec  = tp / answerable if answerable else 0.0
    f1   = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    # The unknown class is rows, not components, and the two are very different
    # numbers. 36 of these are real components that carry no identifier. The
    # rest are path-stripped names built by build.py step 4 from components that
    # DO have one, where the identifier cannot be recovered from the final
    # segment. Reporting only the total let a page describe 250 rows as "250
    # components that have none", overstating the breadth of this measurement by
    # about seven times on the one column this project claims to win.
    unknown_rows = [r for r in rows if not r["purl"]]
    unknowns = len(unknown_rows)
    unknown_observed = sum(1 for r in unknown_rows if "perturbation" not in r)

    # How many rows the predictions file did not cover. Scored as abstentions,
    # which quietly flatters or punishes the result depending on which rows are
    # missing, so the number travels with the score rather than being printed
    # and discarded.
    missing = getattr(resolver, "missing", None)

    return {"resolver": name, "rows": len(rows), "answered": answered,
            "precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4),
            "abstentionRate": round(abstain / len(rows), 4),
            "unknownClass": unknowns,
            "unknownObserved": unknown_observed,
            "unknownDerived": unknowns - unknown_observed,
            "unknownCorrectlyAbstained": unknown_ok,
            "unknownFalsePositives": unknown_fp,
            "predictionsMissing": len(missing) if missing else 0}

# ---- baselines. Every one of these must be beaten to justify shipping anything. ----

def norm(s):
    s = str(s).strip().lower()
    s = re.sub(r'\.(jar|whl|tar\.gz|tgz|zip|exe|dll|so)$', '', s)
    s = re.sub(r'\s*\([^)]*\)\s*$', '', s)
    s = re.sub(r'[_\s]+', '-', s)
    s = re.sub(r'-v?\d[\d\.\-_a-z]*$', '', s)
    return s.strip('-')

DICT = json.load(open(ROOT / "packages/rules/data/alias-dictionary.json", encoding="utf-8"))["entries"]

def baseline_abstain(_):        return None                      # the floor
def baseline_exact(s):          return DICT.get(s, {}).get("purlBase")
def baseline_normalised(s):     return DICT.get(norm(s), {}).get("purlBase")

def baseline_prefix_strip(s):
    n = norm(s)
    for p in ("lib", "python-", "node-", "golang-", "perl-", "ruby-"):
        if n.startswith(p) and norm(n[len(p):]) in DICT:
            return DICT[norm(n[len(p):])]["purlBase"]
    return DICT.get(n, {}).get("purlBase")

BASELINES = [
    ("always-abstain",   baseline_abstain),
    ("exact-match",      baseline_exact),
    ("normalised-match", baseline_normalised),
    ("prefix-strip",     baseline_prefix_strip),
]

def from_predictions(path):
    """A resolver backed by a JSONL file of {input, purl} lines.

    Lets a resolver written in another language be scored by THIS scorer rather
    than by a second implementation of it. The numbers here are the project's
    public credential; two implementations of them would drift, and the one
    that flattered us would be the one that survived.
    """
    table = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            table[rec["input"]] = rec.get("purl")
    missing = []

    def resolver(s):
        if s not in table:
            missing.append(s)
        return table.get(s)

    resolver.missing = missing  # type: ignore[attr-defined]
    return resolver


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--subset", default="all", choices=["clean", "perturbed", "all"])
    ap.add_argument("--predictions", help="JSONL of {input, purl} to score alongside the baselines")
    ap.add_argument("--out", help="write the full scored table, baselines and predictions alike, here")
    a = ap.parse_args()
    rows = load(a.subset)
    print(f"benchmark: {len(rows)} rows, subset={a.subset}\n")
    hdr = f"{'resolver':20} {'prec':>7} {'recall':>7} {'F1':>7} {'abstain':>8} {'unk-FP':>7}"
    print(hdr); print("-" * len(hdr))
    out = []
    entries = list(BASELINES)
    if a.predictions:
        entries.append(("stratifypro-deterministic", from_predictions(a.predictions)))
    for n, f in entries:
        r = score(n, f, rows); out.append(r)
        print(f"{n:20} {r['precision']:7.3f} {r['recall']:7.3f} {r['f1']:7.3f} "
              f"{r['abstentionRate']:8.3f} {r['unknownFalsePositives']:7}")
        miss = getattr(f, "missing", None)
        if miss:
            print(f"{'':20} WARNING: {len(miss)} rows absent from the predictions file, "
                  f"scored as abstentions. The file is stale or incomplete.")

    # A scored resolver that does not beat the best baseline does not ship, and
    # the result is published either way. A benchmark whose author always comes
    # first is marketing and worth nothing as evidence.
    if a.predictions:
        best = max((r for r in out if r["resolver"] != "stratifypro-deterministic"),
                   key=lambda r: r["f1"])
        ours = next(r for r in out if r["resolver"] == "stratifypro-deterministic")
        verdict = "BEATS" if ours["f1"] > best["f1"] else "DOES NOT BEAT"
        print(f"\n{verdict} the best baseline ({best['resolver']}, F1 {best['f1']:.4f}) "
              f"with F1 {ours['f1']:.4f}")
        if ours["unknownFalsePositives"] > best["unknownFalsePositives"]:
            print(f"  but it guesses on {ours['unknownFalsePositives']} unknown-class rows "
                  f"against {best['unknownFalsePositives']}, which is the number that matters most")

    # An explicit destination for the whole table, ours included. Separate from
    # results-{subset}.json below, which stays baselines-only: that file is the
    # published measurement of OTHER people's methods and must not acquire a row
    # for ours by a flag anyone might pass by accident.
    if a.out:
        json.dump(out, open(a.out, "w", encoding="utf-8"), indent=2)

    # Predictions are scored, never recorded as the published baselines.
    if not a.predictions:
        json.dump(out, open(Path(__file__).parent / f"results-{a.subset}.json", "w", encoding="utf-8"), indent=2)
        print(f"\nwritten to bench/identity/results-{a.subset}.json")
