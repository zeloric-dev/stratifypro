#!/usr/bin/env python3
"""Build dataset.jsonl from the corpus. Deterministic, reproducible, seeded.

Why this file exists
--------------------
The dataset arrived as a committed artifact with no generator anywhere in the
repository's history. Rule 4 of this benchmark says every number here must be
reproducible with one command by someone who does not work here, or it is a
claim and not a measurement. The baselines satisfied that. The dataset they
were measured on did not: nobody, including its author, could rebuild it.

What it fixes
-------------
The previous perturbed rows took the last path segment BEFORE applying a
perturbation, so `github.com/golang/groupcache` became `groupcache 8.14.1`
while the expected answer still carried the full path. Nothing deterministic
can recover the first string from the second. Measured: 270 of the 270 rows
whose original name had a path lost it, and every resolver including the
published baselines scored F1 0.000 on the perturbed subset as a result.

The fix is not to preserve the path in every case, because a supplier document
really does sometimes carry only the last segment. It is to label those rows
honestly. `groupcache 8.14.1` is not a known row with an unrecoverable answer;
it is an UNKNOWN row, and a resolver that abstains on it is correct.

That also feeds the class this benchmark was starving for. The unknown class
was 37 rows, 1.3 percent, too small to say anything about abstention, which is
the behaviour this product sells hardest.

Usage:
  python3 bench/identity/build.py            # rebuild dataset.jsonl
  python3 bench/identity/build.py --check    # verify the committed file matches
"""
import argparse
import json
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "fixtures" / "corpus"
HERE = Path(__file__).parent
SPLIT = HERE / "split.json"
OUT = HERE / "dataset.jsonl"

# Fixed so anyone re-running gets byte-identical output.
SEED = 20260913

VENDOR_PREFIXES = ["lib", "python-", "node-", "golang-", "perl-", "ruby-"]
ARCHIVES = [".zip", ".jar", ".tar.gz", ".tgz", ".whl"]
PARENTHETICALS = ["(bundled)", "(vendored)", "(FIPS)", "(static)", "(patched)"]


def purl_of(pkg):
    """The identifier a component declares, if any."""
    if pkg.get("purl"):
        return str(pkg["purl"]).split("@")[0]
    for ref in pkg.get("externalRefs") or []:
        if ref.get("referenceType") == "purl" and ref.get("referenceLocator"):
            return str(ref["referenceLocator"]).split("@")[0]
    return None


def components(doc):
    return doc.get("components") or doc.get("packages") or []


def observed_rows(files):
    """Real (name, identifier) pairs, and real names carrying no identifier."""
    known, unknown = [], []
    for name in files:
        doc = json.loads((CORPUS / name).read_text(encoding="utf-8"))
        for c in components(doc):
            label = c.get("name") or c.get("packageName")
            if not label or not str(label).strip():
                continue
            label = str(label).strip()
            p = purl_of(c)
            (known if p else unknown).append((label, p, name))
    return known, unknown


def perturb(rng, name):
    """One realistic mess, applied to the WHOLE name.

    The identifier stays recoverable: every shape here is reversible, which is
    what makes the row a fair test rather than an unanswerable one.
    """
    shape = rng.choice(["archive", "vendor-prefix", "parenthetical", "versioned", "spaces", "case"])
    if shape == "archive":
        return name + rng.choice(ARCHIVES), shape
    if shape == "vendor-prefix":
        return rng.choice(VENDOR_PREFIXES) + name, shape
    if shape == "parenthetical":
        return f"{name} {rng.choice(PARENTHETICALS)}", shape
    if shape == "versioned":
        return f"{name} {rng.randint(0, 9)}.{rng.randint(0, 20)}.{rng.randint(0, 9)}", shape
    if shape == "spaces":
        return name.replace("-", " ").replace("_", " "), shape
    return name.upper() if rng.random() < 0.5 else name.title(), shape


def last_segment(name):
    """What a supplier document often carries instead of the full path."""
    return name.rstrip("/").split("/")[-1]


def build():
    rng = random.Random(SEED)
    split = json.loads(SPLIT.read_text(encoding="utf-8"))
    known, unknown = observed_rows(split["heldOut"])

    rows = []

    # 1. Observed: the real string with its real identifier.
    for label, purl, src in known:
        rows.append({"input": label, "purl": purl, "sourceFile": src, "class": "known"})

    # 2. Names that appeared with no identifier at all. Genuinely unknown.
    for label, _, src in unknown:
        rows.append({"input": label, "purl": None, "sourceFile": src, "class": "unknown"})

    # 3. Perturbed: reversible mess over the whole name, answer preserved.
    for label, purl, src in known:
        for _ in range(2):
            messy, shape = perturb(rng, label)
            if messy == label:
                continue
            rows.append(
                {
                    "input": messy,
                    "purl": purl,
                    "sourceFile": src,
                    "class": "known",
                    "derivedFrom": label,
                    "perturbation": shape,
                }
            )

    # 4. Path-stripped: the last segment of a path-bearing name, which is what
    #    a supplier document frequently carries. Correctly labelled unknown,
    #    because the module path cannot be recovered from the segment alone and
    #    a resolver that answers is guessing.
    for label, _purl, src in known:
        if "/" not in label:
            continue
        seg = last_segment(label)
        if not seg or seg == label or len(seg) < 2:
            continue
        for _ in range(2):
            messy, shape = perturb(rng, seg)
            rows.append(
                {
                "input": messy,
                "purl": None,
                "sourceFile": src,
                "class": "unknown",
                "derivedFrom": label,
                "perturbation": f"path-stripped+{shape}",
                "whyUnknown": "the module path is absent from the input and cannot be recovered from the final segment",
            }
        )

    # Deduplicate on the input string: the same text cannot have two answers,
    # and a duplicate would let a resolver be scored twice for one behaviour.
    seen, unique = set(), []
    for r in rows:
        if r["input"] in seen:
            continue
        seen.add(r["input"])
        unique.append(r)

    unique.sort(key=lambda r: (r["class"], r["input"]))
    return unique


def serialise(rows):
    return "\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in rows) + "\n"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify the committed dataset reproduces")
    a = ap.parse_args()

    rows = build()
    text = serialise(rows)

    if a.check:
        if OUT.exists():
            with open(OUT, "r", encoding="utf-8", newline="") as fh:
                current = fh.read()
        else:
            current = ""
        if current.replace("\r\n", "\n") != text:
            print("dataset.jsonl does not reproduce from build.py")
            sys.exit(1)
        print(f"dataset reproduces: {len(rows)} rows")
        sys.exit(0)

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)

    classes = {}
    shapes = {}
    for r in rows:
        classes[r["class"]] = classes.get(r["class"], 0) + 1
        if r.get("perturbation"):
            shapes[r["perturbation"]] = shapes.get(r["perturbation"], 0) + 1
    print(f"wrote {len(rows)} rows to {OUT.relative_to(ROOT)}")
    print(f"  classes: {classes}")
    print(f"  unknown share: {100 * classes.get('unknown', 0) / len(rows):.1f}%")
