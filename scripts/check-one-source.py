#!/usr/bin/env python3
"""A rule is described in one place, and no renderer may hold its own field list.

Doc 3 flow C: "explain <ruleId> in the CLI and /rules/<ruleId> on the web render
the same content from the same source. Two renderings of one rule is the drift
pattern this project has already been bitten by twice."

The tests in packages/engine hold explainRule to the packs. They cannot see a
renderer that stops using it, which is what drift actually looks like: someone
adds a field to one surface because it is one line, and the other quietly stops
agreeing.

WHY THIS IS A SCRIPT AND NOT A GREP IN verify.sh. It was a grep in verify.sh,
and it shipped reporting clean while the branch it shipped in already violated
it. apps/web/app/rules/page.tsx rendered `{r.sourceDocument}` alone while
/rules/<id> rendered "document: clause" from the shared view. Two renderings of
one field, live, in the same commit as the check meant to prevent that. The
check did not scan that file, because the file list was written by hand.

verify.sh itself says the standard, immediately above where that grep used to
sit: step 1.16's acceptance is "each of the six greps planted with a violation
and seen to go red", which an inline grep cannot be held to. This one is held to
it by scripts/one-source-mutation-test.py.

Two things changed besides the location. The scan is a glob, so a new renderer
is covered by existing. And the patterns match the identifier however it is
reached, because `\\.fix\\b` missed `const { fix } = rule` and `rule["fix"]`.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Everything that renders a rule to a human.
SCAN_GLOBS = [
    ("apps/cli/src", (".ts",)),
    ("apps/web/app/rules", (".tsx", ".ts")),
]

# Fields that exist ONLY on a rule. Naming one of these anywhere in a renderer
# is describing a rule outside the shared view, whatever it is reached off, so
# these are matched bare: rule.selector, rule["selector"], { selector } = rule
# and a helper in another file all match.
#
# id, title and severity are deliberately absent. A renderer needs them for
# headings and chips, and explainRule exposes all three on the view.
RULE_ONLY_FIELDS = [
    "severityJustification",
    "onEmptySelectorJustification",
    "onEmptySelector",
    "sourceLocation",
    "sourceDocument",
    "appliesTo",
    "selector",
]

# `fix` is the one field that lives on BOTH a Rule and a Finding: check.ts
# copies it onto every finding it emits. So apps/cli/src/render.ts printing
# `g.fix` for a finding group is correct and is not drift, and CliError carrying
# its own `fix` has nothing to do with rules at all. Matching it bare flagged
# five such lines. It is matched only with a rule in sight on the same line.
AMBIGUOUS_FIELDS = ["fix"]

BARE = re.compile(r"\b(" + "|".join(RULE_ONLY_FIELDS) + r")\b")
IN_RULE_CONTEXT = re.compile(r"\b(" + "|".join(AMBIGUOUS_FIELDS) + r")\b")
RULE_WORD = re.compile(r"\brule\b|\bRule\b")

# Where naming a field is the point rather than a violation.
ALLOWED_FILES = {
    # The shared source itself.
    "packages/engine/src/explain.ts",
}


def is_comment(line):
    t = line.strip()
    return t.startswith("//") or t.startswith("*") or t.startswith("/*")


def files():
    for rel, exts in SCAN_GLOBS:
        base = os.path.join(ROOT, rel)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in {"node_modules", "dist", ".next"}]
            for fn in filenames:
                if fn.endswith(exts) and not fn.endswith((".test.ts", ".test.tsx")):
                    yield os.path.join(dirpath, fn)


def main():
    paths = sys.argv[1:] or None
    hits = []
    scanned = 0

    targets = []
    if paths:
        for p in paths:
            full = p if os.path.isabs(p) else os.path.join(ROOT, p)
            if os.path.isdir(full):
                for dirpath, _dirnames, filenames in os.walk(full):
                    for fn in filenames:
                        if fn.endswith((".ts", ".tsx")):
                            targets.append(os.path.join(dirpath, fn))
            else:
                targets.append(full)
    else:
        targets = list(files())

    for path in targets:
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        if rel in ALLOWED_FILES:
            continue
        try:
            text = io.open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        scanned += 1
        for n, line in enumerate(text.splitlines(), 1):
            if is_comment(line):
                continue
            m = BARE.search(line)
            if m is None and RULE_WORD.search(line):
                m = IN_RULE_CONTEXT.search(line)
            if m:
                hits.append((rel, n, m.group(1), line.strip()))

    for rel, n, field, line in hits:
        print("    %s:%d names %s directly" % (rel, n, field))
        print("        %s" % line[:100])

    if scanned == 0:
        print("    skipped: no rule renderer exists yet")
        return 0
    if hits:
        print("    FAILED: %d place(s) describe a rule outside explainRule" % len(hits))
        return 1
    print("    %d renderer file(s) walk explainRule, none holds a field list" % scanned)
    return 0


if __name__ == "__main__":
    sys.exit(main())
