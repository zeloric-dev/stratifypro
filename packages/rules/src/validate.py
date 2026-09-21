#!/usr/bin/env python3
"""Reference validator for rule packs. The TypeScript loader in packages/rules/src/load.ts
must reproduce every check here exactly. This file is the specification of correct behaviour
and is runnable, so 'the loader is correct' is a claim anyone can test.

Usage: python3 packages/rules/src/validate.py packages/rules/packs/*.json
Exit 0 = all packs valid. Exit 1 = at least one pack rejected."""
import json, sys, re
from jsonschema import Draft202012Validator

SCHEMA = json.load(open("packages/rules/schema/rule-pack-1.json", encoding="utf-8"))

def check(path):
    errs = []
    pack = json.load(open(path, encoding="utf-8"))

    # 1. structural schema
    for e in sorted(Draft202012Validator(SCHEMA).iter_errors(pack), key=lambda e: e.path):
        errs.append(f"schema: {'/'.join(str(p) for p in e.path)}: {e.message}")

    srcs = {s["id"]: s for s in pack.get("sourceDocuments", [])}
    seen = set()
    for r in pack.get("rules", []):
        rid = r.get("id", "?")

        # 2. unique rule ids
        if rid in seen:
            errs.append(f"{rid}: duplicate rule id")
        seen.add(rid)

        # 3. sourceDocument must resolve to a listed document
        sd = r.get("sourceDocument")
        if sd not in srcs:
            errs.append(f"{rid}: sourceDocument {sd!r} is not in sourceDocuments")
        for extra in r.get("alsoSee", []):
            if extra.get("sourceDocument") not in srcs:
                errs.append(f"{rid}: alsoSee references unknown document {extra.get('sourceDocument')!r}")

        # 4. THE RULE THAT MATTERS: error severity requires a normative primary source.
        #    alsoSee is deliberately not counted. A rule cannot borrow normativity from
        #    a secondary reference.
        if r.get("severity") == "error":
            if sd not in srcs or not srcs[sd].get("normativeLanguage"):
                errs.append(
                    f"{rid}: severity 'error' but primary source {sd!r} is not normative. "
                    f"Guidance that says 'should' cannot support an error."
                )

        # 5. declared max severity is respected
        mx = pack.get("severityModel", {}).get("maxSeverityFromThisSource")
        if mx:
            order = ["advisory", "info", "warning", "error"]
            if order.index(r.get("severity", "advisory")) > order.index(mx):
                errs.append(f"{rid}: severity {r.get('severity')} exceeds pack maxSeverityFromThisSource {mx}")

        # 6. selector keys must match appliesTo
        for fmt in r.get("appliesTo", []):
            if fmt not in r.get("selector", {}):
                errs.append(f"{rid}: appliesTo includes {fmt} but selector has no {fmt} entry")
    return errs

if __name__ == "__main__":
    bad = 0
    for p in sys.argv[1:]:
        e = check(p)
        print(f"{p}: {'OK' if not e else str(len(e)) + ' PROBLEMS'}")
        for x in e:
            print(f"   {x}")
        bad += len(e)
    sys.exit(1 if bad else 0)
