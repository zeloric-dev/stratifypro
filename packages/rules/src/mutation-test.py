#!/usr/bin/env python3
"""Proves the pack validator actually rejects things. A validator that has never been
seen to fail has never been tested. Run in CI. Exit 1 if any mutation slips through."""
import json, subprocess, os, sys, tempfile
SRC = "packages/rules/packs/fda-524b.json"
# Not /tmp: that path does not exist on Windows, and a portability failure here
# reads as "the validator is blind" when the validator was never even reached.
TMP = os.path.join(tempfile.gettempdir(), "_mutation.json")
TESTS = [
  ("error severity on a non-normative source", lambda p: p["rules"].__setitem__(4, {**p["rules"][4], "severity": "error"})),
  ("rule with no severityJustification",       lambda p: p["rules"][0].pop("severityJustification")),
  ("rule pointing at a document that does not exist", lambda p: p["rules"][0].__setitem__("sourceDocument", "made-up-doc")),
  ("duplicate rule id",                        lambda p: p["rules"].append({**p["rules"][0]})),
  ("normativeLanguage true with no evidence",  lambda p: p["sourceDocuments"][0].pop("normativeLanguageEvidence")),
  ("appliesTo a format the selector lacks",    lambda p: p["rules"][0]["selector"].pop("spdx")),
]
fails = []
for name, mutate in TESTS:
    p = json.load(open(SRC, encoding="utf-8")); mutate(p); json.dump(p, open(TMP, "w", encoding="utf-8"))
    # sys.executable, not "python3": the interpreter running this script is the
    # one that has the dependencies, and "python3" is not always on PATH.
    if subprocess.run([sys.executable, "packages/rules/src/validate.py", TMP], capture_output=True).returncode == 0:
        fails.append(name)
    print(f"  {'RED  ' if name not in fails else 'GREEN'}  {name}")
os.path.exists(TMP) and os.remove(TMP)
if fails:
    print(f"\nVALIDATOR IS BLIND TO: {fails}"); sys.exit(1)
print("\nall mutations rejected"); sys.exit(0)
