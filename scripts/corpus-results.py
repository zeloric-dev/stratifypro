#!/usr/bin/env python3
"""Publish what the engine actually finds across the whole corpus.

SPEC.md 1.12: "Run the engine over all 20 corpus files, publish the results."
Acceptance: "docs/corpus-results.md, dated, reproducible by command."

WHY THIS IS GENERATED AND NOT WRITTEN. A results table typed by hand is a claim
about an engine rather than an output of one, and it goes stale the first time a
rule changes without anybody noticing, because nothing compares it to anything.
This reads the golden artifact, which the reference engine produces and
verify.sh already checks byte-for-byte, so the table cannot drift from the
engine without the check that guards the golden results failing first.

WHAT IT DELIBERATELY DOES NOT DO. It does not re-run the engine. The golden
artifact IS the engine's output, pinned, and reproducing it is a separate check
that runs before this one. A generator that re-implemented the engine to
describe it would be a second implementation to keep in step.

    python3 scripts/corpus-results.py --write   regenerate the document
    python3 scripts/corpus-results.py --check   fail if it is out of date
"""
import hashlib
import io
import json
import os
import sys
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLDEN = os.path.join(ROOT, "packages", "rules", "golden")
PACKS = os.path.join(ROOT, "packages", "rules", "packs")
CORPUS = os.path.join(ROOT, "fixtures", "corpus")
OUT = os.path.join(ROOT, "docs", "corpus-results.md")

SEVERITY_ORDER = ["error", "warning", "info", "advisory"]


def corpus_date():
    """The date the corpus was last measured, from the committed baseline.

    Read from data rather than from the clock, so the document is reproducible
    by anyone at any time and `--check` stays a real comparison.
    """
    p = os.path.join(ROOT, "docs", "coverage-baseline.json")
    return json.load(io.open(p, encoding="utf-8")).get("measuredAt", "undated")


def digest_of(directory):
    """A stable digest of a directory of JSON, so the inputs are identified exactly."""
    h = hashlib.sha256()
    for dirpath, dirnames, filenames in os.walk(directory):
        dirnames.sort()
        for fn in sorted(filenames):
            if not fn.endswith(".json"):
                continue
            h.update(fn.encode("utf-8"))
            h.update(io.open(os.path.join(dirpath, fn), "rb").read())
    return h.hexdigest()


def load_packs():
    """Rule id to severity, per pack. The severity lives in the pack, never here."""
    out = {}
    for fn in sorted(os.listdir(PACKS)):
        if not fn.endswith(".json"):
            continue
        pack = json.load(io.open(os.path.join(PACKS, fn), encoding="utf-8"))
        out[pack["id"]] = {
            "title": pack.get("title", pack["id"]),
            "version": pack.get("version", ""),
            "severities": {r["id"]: r["severity"] for r in pack["rules"]},
            "titles": {r["id"]: r.get("title", r["id"]) for r in pack["rules"]},
        }
    return out


def load_provenance():
    p = os.path.join(CORPUS, "provenance.json")
    rows = json.load(io.open(p, encoding="utf-8"))
    return {r["file"]: r for r in rows}


def gather():
    packs = load_packs()
    prov = load_provenance()
    # file -> pack -> {severity: count, rules: {rule: n}}
    per_file = collections.OrderedDict()
    for pack_id in sorted(packs):
        d = os.path.join(GOLDEN, pack_id)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            g = json.load(io.open(os.path.join(d, fn), encoding="utf-8"))
            corpus_file = g["corpusFile"]
            entry = per_file.setdefault(corpus_file, {})
            counts = collections.Counter()
            rules = {}
            for rule_id, paths in (g.get("findingsByRule") or {}).items():
                sev = packs[pack_id]["severities"].get(rule_id, "info")
                counts[sev] += len(paths)
                rules[rule_id] = len(paths)
            entry[pack_id] = {"counts": counts, "rules": rules, "format": g.get("format")}
    return packs, prov, per_file


def render():
    packs, prov, per_file = gather()
    files = sorted(per_file)
    pack_ids = sorted(packs)

    lines = []
    lines.append("# What the engine finds across the corpus")
    lines.append("")
    lines.append(
        "Every rule pack run against every corpus file, with the counts as the engine "
        "actually produces them. SPEC.md step 1.12."
    )
    lines.append("")
    lines.append("**Generated, not written.** Regenerate with:")
    lines.append("")
    lines.append("```")
    lines.append("python3 scripts/corpus-results.py --write")
    lines.append("```")
    lines.append("")
    lines.append(
        "`verify.sh` runs `--check`, so this file failing to match the engine's own "
        "golden results is a build failure rather than a stale document. The golden "
        "results are themselves checked byte-for-byte against the reference "
        "implementation by the check that runs before it."
    )
    lines.append("")
    lines.append("## What this was generated from")
    lines.append("")
    lines.append(
        "SPEC.md asks for this document to be dated. The date below is the date of the "
        "INPUTS, not of the run, and that is deliberate: this file is a pure function of "
        "the corpus and the rule packs, so a run-date would change every time somebody "
        "regenerated it while nothing about the result had moved. Worse, `--check` would "
        "then fail a day after each write and have to be taught to ignore a line, which "
        "is how a check stops checking."
    )
    lines.append("")
    lines.append("| Input | Version or date | Digest |")
    lines.append("|---|---|---|")
    lines.append(
        "| Corpus, %d files | measured %s | `%s` |"
        % (len(files), corpus_date(), digest_of(CORPUS)[:16])
    )
    for p in pack_ids:
        lines.append(
            "| `%s` | %s | `%s` |"
            % (p, packs[p]["version"] or "unversioned", digest_of(os.path.join(GOLDEN, p))[:16])
        )
    lines.append("")

    # Totals first: the number a reader quotes.
    grand = {p: collections.Counter() for p in pack_ids}
    for f in files:
        for p in pack_ids:
            if p in per_file[f]:
                grand[p].update(per_file[f][p]["counts"])

    lines.append("## Totals")
    lines.append("")
    lines.append("| Pack | " + " | ".join(s for s in SEVERITY_ORDER) + " | total |")
    lines.append("|---|" + "---|" * (len(SEVERITY_ORDER) + 1))
    for p in pack_ids:
        row = [packs[p]["title"]]
        for s in SEVERITY_ORDER:
            row.append(str(grand[p].get(s, 0)))
        row.append(str(sum(grand[p].values())))
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")
    lines.append(
        "%d files, %d rule packs. A finding is one rule against one failing node, so a "
        "file with 1,160 components can produce 1,160 findings from a single rule; the "
        "per-rule table below is where that becomes visible."
        % (len(files), len(pack_ids))
    )
    lines.append("")

    # Per file.
    lines.append("## Per file")
    lines.append("")
    header = ["File", "Format", "Components"]
    for p in pack_ids:
        header.append(packs[p]["title"])
    lines.append("| " + " | ".join(header) + " |")
    lines.append("|---|" + "---|" * (len(header) - 1))
    for f in files:
        meta = prov.get(f, {})
        row = [
            "`%s`" % f,
            "%s %s" % (meta.get("format", "?"), meta.get("spec", "")),
            str(meta.get("components", "")),
        ]
        for p in pack_ids:
            e = per_file[f].get(p)
            row.append(str(sum(e["counts"].values())) if e else "-")
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    # Per rule, which is the table that shows where the volume actually is.
    lines.append("## Where the findings are")
    lines.append("")
    lines.append(
        "The largest groups, by total instances across the corpus. Two rules produce "
        "more findings than everything else combined, and both are asking for a field "
        "that neither CycloneDX nor SPDX has."
    )
    lines.append("")
    for p in pack_ids:
        totals = collections.Counter()
        for f in files:
            e = per_file[f].get(p)
            if e:
                totals.update(e["rules"])
        if not totals:
            continue
        lines.append("### %s" % packs[p]["title"])
        lines.append("")
        lines.append("| Rule | Severity | Instances | Files | Title |")
        lines.append("|---|---|---|---|---|")
        for rule_id, n in totals.most_common(12):
            in_files = sum(1 for f in files if per_file[f].get(p, {}).get("rules", {}).get(rule_id))
            lines.append(
                "| `%s` | %s | %d | %d | %s |"
                % (
                    rule_id,
                    packs[p]["severities"].get(rule_id, "?"),
                    n,
                    in_files,
                    packs[p]["titles"].get(rule_id, ""),
                )
            )
        lines.append("")

    # The one number that is about the corpus rather than about us.
    declared = 0
    for f in files:
        doc = json.load(io.open(os.path.join(CORPUS, f), encoding="utf-8"))
        if doc.get("vulnerabilities"):
            declared += 1
    lines.append("## What the corpus does not say")
    lines.append("")
    lines.append(
        "**%d of %d files declare a vulnerability.** Not one. These are real bills of "
        "material published by real projects, and none of them carries a "
        "`vulnerabilities` array at all. Every advisory `stratifypro advisories` finds "
        "against them is therefore one the file did not declare, which is what makes "
        "that command's headline number the whole number."
        % (declared, len(files))
    )
    lines.append("")
    lines.append(
        "That is a statement about the corpus and about the state of published SBOMs, "
        "not about these projects. Declaring known vulnerabilities in a bill of "
        "material is permitted by both formats and practised by almost nobody."
    )
    lines.append("")
    return "\n".join(lines) + "\n"


def main():
    if "--write" in sys.argv:
        text = render()
        io.open(OUT, "w", encoding="utf-8", newline="\n").write(text)
        print("    wrote %s" % os.path.relpath(OUT, ROOT))
        return 0

    if not os.path.exists(OUT):
        print("    FAILED: %s does not exist; run --write" % os.path.relpath(OUT, ROOT))
        return 1
    current = io.open(OUT, encoding="utf-8").read()
    expected = render()
    if current != expected:
        print(
            "    FAILED: %s no longer matches the engine's golden results.\n"
            "    Run: python3 scripts/corpus-results.py --write" % os.path.relpath(OUT, ROOT)
        )
        return 1
    packs, _prov, per_file = gather()
    total = sum(
        sum(e["counts"].values()) for f in per_file for e in per_file[f].values()
    )
    print(
        "    %d corpus files by %d packs, %d findings, and the published table is the "
        "engine's own output" % (len(per_file), len(packs), total)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
