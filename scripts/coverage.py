#!/usr/bin/env python3
"""Regenerate docs/coverage-baseline.json from fixtures/corpus/.

Counting rules, stated so the number is arguable rather than magic:
  purl      a non-empty Package URL string
  cpe       a non-empty CPE string (CycloneDX `cpe`, SPDX externalRef cpe22/cpe23Type)
  supplier  the entity that PRODUCED the component: CycloneDX supplier.name or
            publisher, SPDX supplier or originator. NOASSERTION does not count.
            CycloneDX `author` is deliberately excluded: it names whoever wrote the
            SBOM entry, not whoever produced the component
  version   a non-empty version / versionInfo
  license   a license that is actually asserted. NOASSERTION and NONE do not count
  hash      at least one checksum
Document level:
  deps          the file carries a dependency/relationship structure at all
  compositions  the file declares its graph incomplete (CycloneDX `compositions`)
"""
import json, os, sys, glob

NOT_A_VALUE = {"", "NOASSERTION", "NONE", "NOASSERTION.", None}

def clean(v):
    return isinstance(v, str) and v.strip() not in NOT_A_VALUE

def cdx(doc):
    comps = doc.get("components") or []
    out = []
    stack = list(comps)
    while stack:
        c = stack.pop(0)
        out.append(c)
        stack.extend(c.get("components") or [])
    rows = []
    for c in out:
        # A `licenses` array can exist and still assert nothing: a bare url with no id,
        # name or expression, or the literal NOASSERTION. Those do not count, exactly as
        # they do not count on the SPDX side.
        lic = False
        for entry in (c.get("licenses") or []):
            if clean(entry.get("expression")):
                lic = True
            l = entry.get("license") or {}
            if clean(l.get("id")) or clean(l.get("name")):
                lic = True
        rows.append(dict(
            purl=clean(c.get("purl")),
            cpe=clean(c.get("cpe")),
            supplier=clean((c.get("supplier") or {}).get("name")) or clean(c.get("publisher")),
            version=clean(c.get("version")),
            license=lic,
            hash=bool(c.get("hashes")),
        ))
    return rows, bool(doc.get("dependencies")), bool(doc.get("compositions"))

def spdx(doc):
    pkgs = doc.get("packages") or []
    rows = []
    for p in pkgs:
        refs = p.get("externalRefs") or []
        purl = any(r.get("referenceType") == "purl" and clean(r.get("referenceLocator")) for r in refs)
        cpe = any(str(r.get("referenceType", "")).startswith("cpe") and clean(r.get("referenceLocator")) for r in refs)
        lic = clean(p.get("licenseConcluded")) or clean(p.get("licenseDeclared"))
        rows.append(dict(
            purl=purl, cpe=cpe,
            supplier=clean(p.get("supplier")) or clean(p.get("originator")),
            version=clean(p.get("versionInfo")),
            license=lic,
            hash=bool(p.get("checksums")),
        ))
    return rows, bool(doc.get("relationships")), False

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    prov = json.load(open(os.path.join(root, "fixtures/corpus/provenance.json"), encoding="utf-8"))
    keys = ["purl", "cpe", "supplier", "version", "license", "hash"]
    summary = {k: 0 for k in keys}
    summary["n"] = 0
    per = []
    files = 0
    with_deps = 0
    with_comp = 0
    for entry in prov:
        name = entry["file"] if isinstance(entry, dict) else entry
        path = os.path.join(root, "fixtures/corpus", name)
        doc = json.load(open(path, encoding="utf-8"))
        rows, deps, comp = (cdx(doc) if "components" in doc or doc.get("bomFormat") else spdx(doc))
        files += 1
        with_deps += 1 if deps else 0
        with_comp += 1 if comp else 0
        rec = {"file": name, "tool": entry.get("tool", "?") if isinstance(entry, dict) else "?",
               "n": len(rows)}
        for k in keys:
            c = sum(1 for r in rows if r[k])
            rec[k] = c
            summary[k] += c
        summary["n"] += len(rows)
        rec["deps"] = deps
        rec["compositions"] = comp
        per.append(rec)
    summary["files"] = files
    summary["with_deps"] = with_deps
    summary["with_comp"] = with_comp
    # Stamped by the script that measures, so the page rendering these numbers
    # does not have to carry a date in prose that nothing can check.
    import datetime
    out = {"measuredAt": datetime.date.today().isoformat(),
           "summary": {k: summary[k] for k in
                       ["n", "purl", "cpe", "supplier", "version", "license", "hash",
                        "files", "with_deps", "with_comp"]},
           "perFile": per}
    if "--check" in sys.argv:
        cur = json.load(open(os.path.join(root, "docs/coverage-baseline.json"), encoding="utf-8"))
        # The stamp is deliberately NOT compared: it changes every day the
        # script is re-run and the numbers are what must reproduce.
        ok = cur["summary"] == out["summary"]
        print("summary reproduces:" , ok)
        if not ok:
            print(" stored:", cur["summary"]); print(" fresh :", out["summary"])
        sys.exit(0 if ok else 1)
    json.dump(out, open(os.path.join(root, "docs/coverage-baseline.json"), "w", encoding="utf-8"), indent=2)
    print(json.dumps(out["summary"], indent=2))

main()
