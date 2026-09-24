#!/usr/bin/env python3
"""Reference implementation of rule evaluation. Small on purpose.

This exists so `packages/engine` in TypeScript has something to be checked against,
and so the fixture claim can be PROVEN rather than counted. A directory full of files
named fail.json proves nothing; running them does.

Supports only the assert forms the shipped packs actually use. If a pack needs a new
form, add it here first and to the TypeScript engine second, and make them agree.
"""
import json, re, sys, os

def jp_nodes(doc, path):
    """Minimal JSONPath returning (concrete_path, node) pairs.

    The concrete path is what a Finding carries: $.components[*] selects many
    nodes, and each one reports as $.components[7]. Without this the engine
    contract cannot be checked, only the weaker claim that some node failed.
    """
    if path == "$": return [("$", doc)]
    cur = [("$", doc)]
    for tok in re.findall(r'\.([A-Za-z_][\w-]*)|\[(\*)\]|\[\?\(@\.([\w-]+)\s*==\s*[\'"]([^\'"]+)[\'"]\)\]|\[(\d+)\]', path):
        key, star, fk, fv, idx = tok
        nxt = []
        for p, n in cur:
            if key:
                if isinstance(n, dict) and key in n: nxt.append(("%s.%s" % (p, key), n[key]))
            elif star:
                if isinstance(n, list):
                    nxt.extend(("%s[%d]" % (p, i), x) for i, x in enumerate(n))
            elif fk:
                if isinstance(n, list):
                    nxt.extend(("%s[%d]" % (p, i), x) for i, x in enumerate(n)
                               if isinstance(x, dict) and str(x.get(fk)) == fv)
            elif idx:
                if isinstance(n, list) and int(idx) < len(n):
                    nxt.append(("%s[%s]" % (p, idx), n[int(idx)]))
        cur = nxt
    return cur

def jp(doc, path):
    """Nodes only. Used by the assert operators, which do not need paths."""
    return [n for _, n in jp_nodes(doc, path)]

def truthy(v):
    if v is None: return False
    if isinstance(v, str): return v.strip() != "" and v.strip().upper() != "NOASSERTION"
    if isinstance(v, (list, dict)): return len(v) > 0
    return True

def has(node, expr):
    """'a.b' or 'a|b'. A bare path is also tried against the whole document by caller."""
    for alt in expr.split("|"):
        cur = node
        ok = True
        segments = alt.replace("$.", "").split(".")
        for i, k in enumerate(segments):
            if k.endswith("]") or "[" in k:
                # The REMAINING path, not the whole one. Handing the full
                # expression back after cur has already walked part of it made
                # "metadata.authors[*].name" look for that path inside
                # metadata. It evaluated false, so the rule fired, so a
                # document carrying the element was reported as missing it.
                sub = jp(cur if isinstance(cur, (dict, list)) else {}, "$." + ".".join(segments[i:]))
                if any(truthy(x) for x in sub): return True
                ok = False; break
            if isinstance(cur, dict) and k in cur: cur = cur[k]
            elif isinstance(cur, list):
                found = [x.get(k) for x in cur if isinstance(x, dict) and k in x]
                if not found: ok = False; break
                cur = found
            else: ok = False; break
        if ok and truthy(cur): return True
    return False

def evaluate(a, node, doc):
    """Returns True when the assertion HOLDS (no finding)."""
    if "allOf" in a:  return all(evaluate(x, node, doc) for x in a["allOf"])
    if "anyOf" in a:  return any(evaluate(x, node, doc) for x in a["anyOf"])
    if "not" in a:    return not evaluate(a["not"], node, doc)
    if "exists" in a:
        e = a["exists"]
        return has(node, e) or (e.startswith("$") and any(truthy(x) for x in jp(doc, e)))
    if "matches" in a:
        vals = [node] if isinstance(node, str) else list(node.values()) if isinstance(node, dict) else []
        return any(isinstance(v, str) and re.search(a["matches"], v) for v in vals)
    if "equals" in a:
        return any(str(node.get(k, "")).lower() == str(v).lower()
                   for k, v in a["equals"].items()) if isinstance(node, dict) else False
    if "minLength" in a:
        m = a["minLength"]; f = m.get("field", "")
        for alt in f.split("|"):
            v = jp(doc, alt if alt.startswith("$") else "$." + alt)
            if v and isinstance(v[0], list) and len(v[0]) >= m.get("min", 1): return True
        return False
    if "oneOf" in a:  return True   # vocabulary checks need the data file; not fixture-relevant
    if "matchesAny" in a:
        return a["matchesAny"].lower() in json.dumps(doc).lower()
    return True

def check(doc, rule, fmt):
    """None if the rule does not apply to this format, else the list of
    JSONPaths that failed. Empty list means the rule passed.

    Returns paths rather than a boolean because the engine contract is one
    Finding per failing node with its exact path. A boolean proves only that
    SOME node failed, which a TypeScript engine could satisfy while emitting
    the wrong path set on every rule.
    """
    sel = rule["selector"].get(fmt)
    if not sel: return None
    a = rule["assert"]
    if set(a.keys()) <= {"cyclonedx", "spdx"}:   # per-format assertions
        a = a.get(fmt)
        if a is None: return None
    pairs = jp_nodes(doc, sel)
    if not pairs:
        # The third case, declared per rule in the pack. See the schema's
        # onEmptySelector description for why it is not inferable.
        behaviour = rule.get("onEmptySelector", "fire")
        if behaviour == "fire":
            return [sel]        # no node to point at; the selector is the locus
        if behaviour == "skip":
            return None         # same path as a format mismatch: skippedRules
        if behaviour == "pass":
            return []           # evaluated, nothing to report
        raise ValueError("%s: unknown onEmptySelector %r" % (rule["id"], behaviour))
    return [p for p, n in pairs if not evaluate(a, n, doc)]

def detect(doc):
    """Which format this document is, by structural marker.

    Raises rather than returning None. An undetectable document would otherwise
    match no rule's appliesTo and produce an empty findingsByRule, which reads
    as a clean result instead of a document that could not be processed. That is
    the failure this repository exists to argue against.
    """
    if "spdxVersion" in doc or "SPDXID" in doc: return "spdx"
    if "bomFormat" in doc or "components" in doc: return "cyclonedx"
    raise ValueError("format not detected: no spdxVersion, SPDXID, bomFormat or components")


def golden(packs, corpus_dir, out_dir):
    """Emit one result file per (pack, corpus file): ruleId -> failing paths.

    This is the differential artifact. The TypeScript engine must reproduce
    each file byte-identically. It is the same round-trip discipline the
    crosswalk already uses, where the spreadsheet is the source and the JSON
    and CSV are derived precisely so the three cannot drift apart.
    """
    written = []
    files = sorted(f for f in os.listdir(corpus_dir)
                   if f.endswith(".json") and f != "provenance.json")
    for pack in packs:
        pdir = os.path.join(out_dir, pack["id"])
        os.makedirs(pdir, exist_ok=True)
        for fname in files:
            with open(os.path.join(corpus_dir, fname), encoding="utf-8") as fh:
                doc = json.load(fh)
            fmt = detect(doc)
            result = {}
            for r in pack["rules"]:
                if fmt not in r["appliesTo"]:
                    continue
                paths = check(doc, r, fmt)
                if paths is None:
                    continue
                result[r["id"]] = paths
            payload = {
                "corpusFile": fname,
                "format": fmt,
                "rulePackId": pack["id"],
                "rulePackVersion": pack["version"],
                "findingsByRule": dict(sorted(result.items())),
            }
            dest = os.path.join(pdir, fname)
            with open(dest, "w", encoding="utf-8", newline="\n") as fh:
                json.dump(payload, fh, indent=2, ensure_ascii=False, sort_keys=False)
                fh.write("\n")
            written.append(dest)
    return written


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    packs = [json.load(open(p, encoding="utf-8")) for p in args] or [
        json.load(open(f"packages/rules/packs/{n}.json", encoding="utf-8")) for n in ("cisa-2026-v2.1", "fda-524b")]

    if "--golden" in flags or "--check-golden" in flags:
        import shutil, tempfile
        OUT = "packages/rules/golden"
        if "--golden" in flags:
            written = golden(packs, "fixtures/corpus", OUT)
            print(f"golden: wrote {len(written)} result files to {OUT}/")
            sys.exit(0)
        tmp = tempfile.mkdtemp()
        golden(packs, "fixtures/corpus", tmp)

        def tree(base):
            out = set()
            for root, _, fs in os.walk(base):
                for f in fs:
                    out.add(os.path.relpath(os.path.join(root, f), base).replace("\\", "/"))
            return out

        fresh, committed = tree(tmp), tree(OUT) if os.path.isdir(OUT) else set()
        drift = []
        for rel in sorted(fresh - committed):
            drift.append(f"missing: {rel}")
        # Compared both ways on purpose. Walking only the freshly generated tree
        # would never notice a golden file whose corpus document was deleted, so
        # a stale result could sit in the repository indefinitely while the check
        # reported byte-identical.
        for rel in sorted(committed - fresh):
            drift.append(f"stale (no corpus file produces it): {rel}")
        for rel in sorted(fresh & committed):
            with open(os.path.join(tmp, rel), "rb") as x, open(os.path.join(OUT, rel), "rb") as y:
                if x.read() != y.read():
                    drift.append(f"differs: {rel}")
        shutil.rmtree(tmp, ignore_errors=True)
        if drift:
            print(f"GOLDEN DRIFT: {len(drift)}")
            for d in drift[:20]: print(f"   {d}")
            sys.exit(1)
        print("golden results reproduce byte-identically")
        sys.exit(0)

    FX = "packages/rules/fixtures"
    silent, falsepos, ok = [], [], 0
    for pack in packs:
        for r in pack["rules"]:
            rid = r["id"]
            for fmt in r["appliesTo"]:
                fp, pp = f"{FX}/{rid}/fail.{fmt}.json", f"{FX}/{rid}/pass.{fmt}.json"
                if not (os.path.exists(fp) and os.path.exists(pp)):
                    silent.append(f"{rid}/{fmt}: fixture missing"); continue
                fired_on_fail = check(json.load(open(fp, encoding="utf-8")), r, fmt)
                fired_on_pass = check(json.load(open(pp, encoding="utf-8")), r, fmt)
                if not fired_on_fail: silent.append(f"{rid}/{fmt}: fail fixture does NOT trigger the rule")
                elif fired_on_pass:   falsepos.append(f"{rid}/{fmt}: rule fires on its own pass fixture")
                else: ok += 1
    print(f"proved: {ok}")
    print(f"fail fixtures that do not fire: {len(silent)}")
    for s in silent[:40]: print(f"   {s}")
    print(f"rules firing on their pass fixture: {len(falsepos)}")
    for s in falsepos[:40]: print(f"   {s}")
    sys.exit(1 if (silent or falsepos) else 0)
