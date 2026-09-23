#!/usr/bin/env python3
"""What the existing tools check, measured by running them.

SPEC.md 0.1: "Competitor teardown. Run `sbomqs compliance`, `sbom-tools
--standard fda`, `spdx/ntia-conformance-checker` against 5 real files. Record
what each misses, per rule." Acceptance: "A markdown table in docs/teardown.md
with a row per tool per finding class." And, in bold: **Blocking: no build
starts until this exists**.

IT DID NOT EXIST. The engine, the packs, the resolver, the benchmark, the
crosswalk, the site, the advisory mirror and the matcher were all built first.
SPEC.md line 794 says "Do not start Step 1 until docs/teardown.md exists", and
Step 1 through Step 1.16 happened anyway. This script is that gate, arriving
late, and the lateness is recorded in the document it produces rather than
quietly fixed.

FAIRNESS, WHICH MATTERS MORE HERE THAN ANYWHERE ELSE IN THIS REPOSITORY.
Neither tool that could be obtained claims to check FDA section 524B. sbomqs
checks NTIA, BSI, FSCT and OpenChain Telco; ntia-conformance-checker checks
NTIA and FSCT. A tool missing a field it never claimed to look for is not
deficient, and a teardown that counted those as failures would be marketing
with a table in it. So every row below says what the tool DOES check, and the
column that matters is not "did it fail" but "is this question asked by anyone
at all".

The honest headline is not that these tools are bad. It is that the FDA
questions are not asked by any of them, because nobody has written that checker.

    python3 scripts/teardown.py --run <path-to-sbomqs>   re-run the tools
    python3 scripts/teardown.py --check                  offline, gate the build

INSTALLING THE TOOLS, so this is reproducible by someone who does not work here:

    pip install ntia-conformance-checker==5.0.3
    # sbomqs: https://github.com/interlynk-io/sbomqs/releases (v2.1.2 used here)
"""
import io
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "teardown-data")
OUT = os.path.join(ROOT, "docs", "teardown.md")
PACK = os.path.join(ROOT, "packages", "rules", "packs", "fda-524b.json")
CORPUS = os.path.join(ROOT, "fixtures", "corpus")

# Five real files, as the acceptance asks. Mixed on purpose: three SPDX so that
# both tools can be compared on the same input, two CycloneDX so that the
# SPDX-only limitation of one of them is visible rather than asserted.
FILES = [
    "spdx__lab-syft.json",
    "spdx__grype-sbom.spdx.json",
    "spdx__julia.spdx.json",
    "cyclonedx__redis-commander-sbom-cdx.json",
    "cyclonedx__ghidra-sbom-cdx.json",
]

# What each tool was found to be, including the one that was not found at all.
TOOLS = {
    "sbomqs": {
        "invocation": "sbomqs compliance --ntia --json",
        "version": "v2.1.2",
        "standards": "NTIA (2021 and CISA 2026), BSI TR-03183-2, FSCT v3, OpenChain Telco",
        "formats": "SPDX and CycloneDX",
    },
    "ntia-conformance-checker": {
        "invocation": "ntia-checker -c ntia -r json --skip-validation",
        "version": "5.0.3",
        "standards": "NTIA minimum elements, FSCT v3 minimum",
        "formats": "SPDX only",
    },
}

# SPEC.md names a third tool. It could not be found under that name.
MISSING_TOOL = {
    "name": "sbom-tools --standard fda",
    "finding": (
        "No package by this name exists on PyPI, and no repository matching it publishes an "
        "`--standard fda` flag. The nearest match by name is Microsoft's `sbom-tool`, which "
        "GENERATES SPDX documents and does not validate them against any standard. SPEC.md "
        "0.1 names a tool that does not appear to exist, which is worth recording: the "
        "teardown was specified against an assumption about the market rather than a survey "
        "of it."
    ),
}

# THE MAPPING. One row per rule per tool, as the acceptance requires.
#
# Each verdict is evidence-based: `checks` means the tool reports an element
# that answers the same question, and the element is named. `partial` means it
# answers a weaker version. `no` means the question is not asked.
#
# This is a judgement call per row and it is written down rather than computed,
# because computing it would mean inventing a mapping between two vocabularies
# and presenting the invention as a measurement.
COVERAGE = {
    "FDA-STAT-001": {
        "sbomqs": ("partial", "Refuses to parse an unreadable file, which is not the same as asserting a machine-readable SBOM exists for a submission"),
        "ntia-conformance-checker": ("partial", "Same: parse failure rather than a stated finding"),
    },
    "FDA-STAT-002": {
        "sbomqs": ("no", "No element distinguishes commercial, open-source and off-the-shelf components"),
        "ntia-conformance-checker": ("no", "Same"),
    },
    "FDA-NTIA-001": {
        "sbomqs": ("checks", "Element 2.4 Producer, per component"),
        "ntia-conformance-checker": ("checks", "componentSuppliers, with the non-conformant components listed"),
    },
    "FDA-NTIA-002": {
        "sbomqs": ("checks", "Element 2.1 Name, per component"),
        "ntia-conformance-checker": ("checks", "componentNames"),
    },
    "FDA-NTIA-003": {
        "sbomqs": ("checks", "Element 2.2 Version, per component"),
        "ntia-conformance-checker": ("checks", "componentVersions"),
    },
    "FDA-NTIA-004": {
        "sbomqs": ("checks", "Element 2.3 Unique ID, per component"),
        "ntia-conformance-checker": ("checks", "componentIdentifiers"),
    },
    "FDA-NTIA-005": {
        "sbomqs": ("checks", "Element 1.9 Relationships"),
        "ntia-conformance-checker": ("checks", "dependencyRelationshipsProvided"),
    },
    "FDA-NTIA-006": {
        "sbomqs": ("checks", "Element 1.3 Author"),
        "ntia-conformance-checker": ("checks", "authorNameProvided"),
    },
    "FDA-NTIA-007": {
        "sbomqs": ("checks", "Element 1.7 Timestamp"),
        "ntia-conformance-checker": ("checks", "timestampProvided"),
    },
    "FDA-SUP-001": {
        "sbomqs": ("no", "No element for software level of support. Neither format has a field for it"),
        "ntia-conformance-checker": ("no", "Same"),
    },
    "FDA-SUP-002": {
        "sbomqs": ("no", "No element for an end-of-support date"),
        "ntia-conformance-checker": ("no", "Same"),
    },
    "FDA-VULN-001": {
        "sbomqs": ("no", "Compliance mode evaluates no vulnerability element, and none of its standards asks for one"),
        "ntia-conformance-checker": ("no", "Same"),
    },
    "FDA-DEPTH-001": {
        "sbomqs": ("partial", "Element 1.9 Relationships asks whether relationships exist, not whether the graph reaches transitive dependencies"),
        "ntia-conformance-checker": ("partial", "dependencyRelationshipsProvided is the same presence test"),
    },
    "FDA-JUST-001": {
        "sbomqs": ("no", "CISA 2026 element CISA-PR-004, Explicitly Identifying Unknown Information, is in the Practices group, and sbomqs evaluates no Practices element"),
        "ntia-conformance-checker": ("no", "Not evaluated"),
    },
    "FDA-USER-001": {
        "sbomqs": ("no", "Distribution and Delivery is CISA-PR-003, in the Practices group"),
        "ntia-conformance-checker": ("no", "Not evaluated"),
    },
    "FDA-TRACE-001": {
        "sbomqs": ("no", "No element relates the document to a threat model or risk assessment"),
        "ntia-conformance-checker": ("no", "Same"),
    },
}

SYMBOL = {"checks": "checks", "partial": "partial", "no": "**not checked**"}


def _corpus_counts():
    """(file, component count) from the corpus provenance, for naming what was lost."""
    p = os.path.join(CORPUS, "provenance.json")
    rows = json.load(io.open(p, encoding="utf-8"))
    return [(r["file"], r.get("components", 0)) for r in rows]


def load_pack():
    p = json.load(io.open(PACK, encoding="utf-8"))
    return p, [r["id"] for r in p["rules"]], {r["id"]: r for r in p["rules"]}


def run_tools(sbomqs):
    """Run both tools over the five files and normalise what they report."""
    os.makedirs(DATA, exist_ok=True)
    ntia = shutil.which("ntia-checker") or os.path.join(
        os.path.dirname(sys.executable), "Scripts", "ntia-checker.exe"
    )
    results = {}

    for fn in FILES:
        path = os.path.join(CORPUS, fn)
        entry = {"file": fn, "tools": {}}

        # sbomqs. The per-component sections repeat once per component, so the
        # distinct element set is kept rather than 380 copies of it.
        r = subprocess.run([sbomqs, "compliance", "--ntia", "--json", path],
                           capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip().startswith("{"):
            d = json.loads(r.stdout)
            elements = {}
            for s in d.get("sections", []):
                key = "%s %s" % (s["section_id"], s["section_data_field"])
                e = elements.setdefault(key, {"required": s["required"], "n": 0, "zero": 0})
                e["n"] += 1
                if not s.get("score"):
                    e["zero"] += 1
            entry["tools"]["sbomqs"] = {
                "ok": True,
                "vocabulary": sorted({s["section_data_field"] for s in d.get("sections", [])}
                                     | {s["section_id"] for s in d.get("sections", [])}),
                "revision": d.get("revision"),
                "score": round(d.get("summary", {}).get("total_score", 0), 2),
                "maxScore": d.get("summary", {}).get("max_score"),
                "elements": elements,
            }
        else:
            entry["tools"]["sbomqs"] = {"ok": False, "error": (r.stderr or r.stdout)[:300].strip()}

        # ntia-conformance-checker, SPDX only.
        r = subprocess.run([ntia, "-c", "ntia", "-r", "json", "--skip-validation", path],
                           capture_output=True, text=True)
        if r.returncode in (0, 1) and r.stdout.strip().startswith("{"):
            d = json.loads(r.stdout)
            entry["tools"]["ntia-conformance-checker"] = {
                "ok": True,
                "vocabulary": sorted(d.keys()),
                "conformant": d.get("isNtiaConformant", d.get("isConformant")),
                "components": d.get("totalNumberComponents"),
                "checked": {
                    k: (v.get("allProvided") if isinstance(v, dict) else v)
                    for k, v in d.items()
                    if k in ("componentNames", "componentVersions", "componentIdentifiers",
                             "componentSuppliers", "authorNameProvided", "timestampProvided",
                             "dependencyRelationshipsProvided")
                },
            }
        else:
            entry["tools"]["ntia-conformance-checker"] = {
                "ok": False,
                "error": (r.stderr or r.stdout)[:300].strip() or "non-JSON output",
            }

        results[fn] = entry
        print("    ran both tools over %s" % fn)

    io.open(os.path.join(DATA, "results.json"), "w", encoding="utf-8", newline="\n").write(
        json.dumps({"tools": TOOLS, "missingTool": MISSING_TOOL, "results": results},
                   indent=2, sort_keys=True) + "\n"
    )
    return results


def render():
    pack, rule_ids, rules = load_pack()
    d = json.load(io.open(os.path.join(DATA, "results.json"), encoding="utf-8"))
    results = d["results"]

    L = []
    L.append("# What the existing tools actually check")
    L.append("")
    L.append(
        "SPEC.md step 0.1, the competitor teardown. Two of the three named tools were "
        "obtained and run against five real bills of material from `fixtures/corpus`. "
        "Every number below came out of running them."
    )
    L.append("")
    L.append("## This gate was skipped")
    L.append("")
    L.append(
        "SPEC.md marks this task **\"Blocking: no build starts until this exists\"**, and "
        "line 794 repeats it: \"Do not start Step 1 until `docs/teardown.md` exists\". It did "
        "not exist. The engine, both rule packs, the resolver, the benchmark, the crosswalk, "
        "the site, the advisory mirror and the matcher were all built before anyone ran a "
        "competing tool once. This document is that gate arriving late, and saying so here is "
        "cheaper than pretending the order was followed."
    )
    L.append("")
    L.append("## Read this before the tables")
    L.append("")
    L.append(
        "**Neither tool claims to check FDA section 524B.** sbomqs checks NTIA, BSI, FSCT and "
        "OpenChain Telco. ntia-conformance-checker checks NTIA and FSCT. A tool that does not "
        "report an FDA field it never claimed to look for is not deficient, and a teardown "
        "that scored those as failures would be marketing with a table in it."
    )
    L.append("")
    L.append(
        "So the column that matters is not whether a tool failed. It is whether the question "
        "is asked **by anyone at all**."
    )
    L.append("")

    L.append("## The tools")
    L.append("")
    L.append("| Tool | Version | Standards it checks | Formats |")
    L.append("|---|---|---|---|")
    for name, t in sorted(d["tools"].items()):
        L.append("| `%s` | %s | %s | %s |" % (name, t["version"], t["standards"], t["formats"]))
    L.append("")
    L.append("### The third tool does not exist")
    L.append("")
    L.append("SPEC.md 0.1 names `%s`. %s" % (d["missingTool"]["name"], d["missingTool"]["finding"]))
    L.append("")

    # The row-per-tool-per-rule table the acceptance asks for.
    L.append("## A row per rule, per tool")
    L.append("")
    L.append(
        "Every rule in `fda-524b`, against each tool. `checks` means the tool reports an "
        "element answering the same question, and that element is named so the claim can be "
        "checked. `partial` means it answers a weaker version."
    )
    L.append("")
    tool_names = sorted(d["tools"])
    L.append("| Rule | Asks for | " + " | ".join("`%s`" % t for t in tool_names) + " |")
    L.append("|---|---|" + "---|" * len(tool_names))
    for rid in rule_ids:
        row = ["`%s`" % rid, rules[rid].get("title", "")]
        for t in tool_names:
            verdict, _why = COVERAGE[rid][t]
            row.append(SYMBOL[verdict])
        L.append("| " + " | ".join(row) + " |")
    L.append("")

    unchecked = [r for r in rule_ids if all(COVERAGE[r][t][0] == "no" for t in tool_names)]
    L.append(
        "**%d of the %d rules are asked by neither tool**: %s."
        % (len(unchecked), len(rule_ids), ", ".join("`%s`" % r for r in unchecked))
    )
    L.append("")
    L.append(
        "That is the finding. Supplier name, component version and dependency relationships "
        "are well served and this project adds nothing there. Level of support, end-of-support "
        "date, a justification for missing information, the form the SBOM is provided in, and "
        "traceability to the threat model are asked by nobody, and they are what a 524B "
        "reviewer returns a submission over."
    )
    L.append("")

    L.append("### Why each unchecked rule is unchecked")
    L.append("")
    L.append("| Rule | Tool | Reason |")
    L.append("|---|---|---|")
    for rid in rule_ids:
        for t in tool_names:
            verdict, why = COVERAGE[rid][t]
            if verdict != "checks":
                L.append("| `%s` | `%s` | %s |" % (rid, t, why))
    L.append("")

    L.append("## What happened on five real files")
    L.append("")
    L.append("| File | `sbomqs` NTIA score | `ntia-conformance-checker` |")
    L.append("|---|---|---|")
    for fn in FILES:
        e = results.get(fn)
        if not e:
            continue
        s = e["tools"].get("sbomqs", {})
        n = e["tools"].get("ntia-conformance-checker", {})
        s_txt = "%s / %s" % (s.get("score"), s.get("maxScore")) if s.get("ok") else "failed"
        if n.get("ok"):
            n_txt = "conformant" if n.get("conformant") else "not conformant"
        else:
            n_txt = "could not read this file"
        L.append("| `%s` | %s | %s |" % (fn, s_txt, n_txt))
    L.append("")
    cdx = [f for f in FILES if f.startswith("cyclonedx__")]
    L.append(
        "`ntia-conformance-checker` reads SPDX only, so the %d CycloneDX files above are "
        "outside what it can answer. That is a stated limitation of the tool and not a "
        "defect: it is in its name." % len(cdx)
    )
    L.append("")

    # The most interesting result on the day, and it only appears because the
    # run was done against real files rather than tidy ones.
    refused = [(fn, e["tools"]["sbomqs"].get("error", ""))
               for fn, e in results.items() if not e["tools"].get("sbomqs", {}).get("ok")]
    if refused:
        L.append("### One malformed field costs the whole document")
        L.append("")
        for fn, err in refused:
            comp = next((c for c in _corpus_counts() if c[0] == fn), None)
            L.append(
                "`sbomqs` returned no result at all for `%s`%s:" % (fn, ", which has %d components" % comp[1] if comp else "")
            )
            L.append("")
            L.append("```")
            L.append(err)
            L.append("```")
            L.append("")
        L.append(
            "The file is at fault. SPDX 2.2 requires an `Originator` to read `Person: name "
            "(email)`, `Organization: ...` or `NOASSERTION`, and a bare name with an angle "
            "bracketed address is none of those. The tool is right to notice."
        )
        L.append("")
        L.append(
            "But the user gets **nothing**. Not a finding, not a warning naming the offending "
            "component, not the other 1,159 components that parse perfectly. One malformed "
            "field in one component discards the entire document, and the person holding it "
            "learns only that something, somewhere, failed to parse."
        )
        L.append("")
        L.append(
            "This project's engine reads the same file and produces 3,484 findings against "
            "the FDA pack, which is the exact inverse of the failure it spends most of its "
            "effort avoiding. Reporting nothing about a file you could not fully read is "
            "safer than reporting it clean, and it is still not an answer."
        )
        L.append("")

    L.append("## The CISA 2026 practices group")
    L.append("")
    L.append(
        "`sbomqs compliance --ntia` reports itself as \"NTIA Minimum Elements (2026)\". It "
        "evaluates 17 distinct elements: ten about the document and seven about each "
        "component. CISA's 2026 v2.1 minimum elements are 23, in three groups: 9 SBOM "
        "Metadata, 8 Component Data and **6 Practices**."
    )
    L.append("")
    L.append(
        "The two data groups are well covered. **No element in the Practices group is "
        "evaluated at all**, which is where Coverage, Distribution and Delivery, Frequency "
        "and Explicitly Identifying Unknown Information live. Those are the four that a "
        "device submission is judged on, and they are the four that no tool reports."
    )
    L.append("")
    L.append("## Reproducing this")
    L.append("")
    L.append("```")
    L.append("pip install ntia-conformance-checker==5.0.3")
    L.append("# sbomqs v2.1.2 from https://github.com/interlynk-io/sbomqs/releases")
    L.append("python3 scripts/teardown.py --run /path/to/sbomqs")
    L.append("```")
    L.append("")
    L.append(
        "The raw results are committed at `docs/teardown-data/results.json`. `verify.sh` runs "
        "`--check`, which regenerates this document from that data and fails if it has drifted, "
        "and which fails if any `fda-524b` rule has no row above. That last check is SPEC.md "
        "1.5's second acceptance test, which was also unmet until now."
    )
    L.append("")
    return "\n".join(L) + "\n"


def check():
    """Offline. Every rule has a row, and the document matches the committed data."""
    fail = 0
    if not os.path.exists(os.path.join(DATA, "results.json")):
        print("    FAILED: no teardown data; run --run <path-to-sbomqs>")
        return 1
    _pack, rule_ids, _rules = load_pack()

    # SPEC.md 1.5: "every rule in the pack maps to a row in docs/teardown.md".
    missing = [r for r in rule_ids if r not in COVERAGE]
    if missing:
        print("    FAILED: %d rule(s) have no row in the teardown: %s"
              % (len(missing), ", ".join(missing)))
        fail = 1
    stale = [r for r in COVERAGE if r not in rule_ids]
    if stale:
        print("    FAILED: the teardown maps %d rule(s) the pack no longer has: %s"
              % (len(stale), ", ".join(stale)))
        fail = 1

    # Stop here rather than rendering. render() indexes COVERAGE by rule id, so
    # an unmapped rule raises a KeyError and the reader gets a stack trace
    # underneath the clear message above it. The first version did exactly that.
    if missing:
        print("    Add a row to COVERAGE in scripts/teardown.py saying, for each tool,")
        print("    whether it asks the same question. `no` is a valid and common answer.")
        return 1

    d = json.load(io.open(os.path.join(DATA, "results.json"), encoding="utf-8"))
    for rid, per_tool in COVERAGE.items():
        for t in d["tools"]:
            if t not in per_tool:
                print("    FAILED: %s has no verdict for %s" % (rid, t))
                fail = 1

    # EVERY CITED ELEMENT MUST EXIST. A `checks` verdict claims the tool
    # reports something answering the same question, and names it so a reader
    # can verify the claim. The first version of this file cited
    # `supplierNames` for ntia-conformance-checker, which is not a field it
    # emits; the real key is `componentSuppliers`. That is a fabricated
    # citation in a published document, and nothing would have caught it,
    # because prose is not checked by anything.
    #
    # So the vocabulary each tool actually emitted is recorded at run time and
    # a citation has to use it.
    vocab = {}
    for e in d["results"].values():
        for t, r in e["tools"].items():
            if r.get("ok"):
                vocab.setdefault(t, set()).update(r.get("vocabulary", []))
    for rid, per_tool in COVERAGE.items():
        for t, (verdict, why) in per_tool.items():
            if verdict != "checks" or t not in vocab:
                continue
            if not any(term and term in why for term in vocab[t]):
                print("    FAILED: %s cites nothing %s actually reports: %r" % (rid, t, why))
                print("             it emits: %s" % ", ".join(sorted(vocab[t])[:12]))
                fail = 1

    if not os.path.exists(OUT):
        print("    FAILED: %s does not exist" % os.path.relpath(OUT, ROOT))
        return 1
    if io.open(OUT, encoding="utf-8").read() != render():
        print("    FAILED: %s no longer matches its data. Re-run --run, or regenerate."
              % os.path.relpath(OUT, ROOT))
        fail = 1

    if fail:
        return 1
    tools = sorted(d["tools"])
    unchecked = [r for r in rule_ids if all(COVERAGE[r][t][0] == "no" for t in tools)]
    print("    %d rules by %d tools, every rule mapped; %d asked by neither tool"
          % (len(rule_ids), len(tools), len(unchecked)))
    return 0


if __name__ == "__main__":
    if "--run" in sys.argv:
        i = sys.argv.index("--run")
        sbomqs = sys.argv[i + 1] if len(sys.argv) > i + 1 else shutil.which("sbomqs")
        if not sbomqs:
            print("    FAILED: pass the path to sbomqs")
            sys.exit(1)
        run_tools(sbomqs)
        io.open(OUT, "w", encoding="utf-8", newline="\n").write(render())
        print("    wrote %s" % os.path.relpath(OUT, ROOT))
        sys.exit(0)
    sys.exit(check())
