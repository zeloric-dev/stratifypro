#!/usr/bin/env python3
"""Plant every way a renderer can name a rule field, and watch each one fire.

The previous version of this check was an inline grep in verify.sh with no
mutation test, and it reported clean while the branch it shipped in already
violated it. An adversarial review then planted eight evasions and found four
that walked straight through:

    const { fix } = found.rule;     NOT CAUGHT   only `\\.fix\\b` was matched
    found.rule["fix"]               NOT CAUGHT
    const k = "fi"+"x"              NOT CAUGHT   still not caught; see below
    renderFix(rule) in another file NOT CAUGHT   the file list was hand-written
    { rule . fix }                  NOT CAUGHT

Three of those five are fixed by matching the identifier rather than an access
form, and one by globbing the directory instead of listing two files. The
computed-key case is not caught and is not claimed to be: a grep cannot follow
string arithmetic, and pretending otherwise would be the kind of check this
repository keeps discovering was never running.

The near-miss half matters as much. A renderer legitimately uses rule.id,
rule.title and rule.severity for headings and chips, and explainRule exposes all
three on the view. If those tripped the check, someone would add an exception
list, and a check with an exception list is a check people learn to add
exceptions to.
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = os.path.join(ROOT, "scripts", "check-one-source.py")

# Content that must FAIL.
VIOLATIONS = [
    ("plain property access", "a.tsx", "export const A = () => <dd>{found.rule.fix}</dd>;"),
    ("a different field", "b.tsx", "export const B = () => <dd>{found.rule.sourceDocument}</dd>;"),
    ("destructuring with a rename", "c.tsx", "const { severityJustification: sj } = found.rule;"),
    ("destructuring, bare", "d.tsx", "const { fix } = found.rule;"),
    ("bracket access", "e.tsx", 'const v = found.rule["fix"];'),
    ("whitespace around the dot", "f.tsx", "const v = found . rule . fix;"),
    ("a helper in a sibling file", "g.ts", "export const renderFix = (r: Rule) => r.fix;"),
    ("the empty-selector behaviour", "h.tsx", "export const H = () => <dd>{r.onEmptySelector}</dd>;"),
    ("the selector itself", "i.tsx", "export const I = () => <code>{r.selector}</code>;"),
    ("appliesTo", "j.tsx", "export const J = () => <dd>{r.appliesTo.join(', ')}</dd>;"),
]

# Content that must PASS.
NEAR_MISSES = [
    ("a rule id, which a heading needs", "k.tsx", "export const K = () => <h1>{view.ruleId}</h1>;"),
    ("a title, which a heading needs", "l.tsx", "export const L = () => <p>{view.title}</p>;"),
    ("a severity, which a chip needs", "m.tsx", "export const M = () => <span>{view.severity}</span>;"),
    ("walking the view's own fields", "n.tsx",
     "export const N = () => view.fields.map((f) => <dd key={f.label}>{f.value}</dd>);"),
    ("finding a field by its label", "o.tsx",
     "const source = view.fields.find((f) => f.label === 'Source')?.value ?? '';"),
    ("a field named in the comment that explains the rule", "p.tsx",
     "// sourceDocument and fix belong to explainRule, not to this file."),
]


def run(path):
    r = subprocess.run([sys.executable, CHECK, path], capture_output=True, text=True, cwd=ROOT)
    return r.returncode, r.stdout + r.stderr


def main():
    failures = []
    tmp = tempfile.mkdtemp(prefix="sp-onesrc-")
    try:
        clean = os.path.join(tmp, "clean")
        os.makedirs(clean)
        io.open(os.path.join(clean, "ok.tsx"), "w", encoding="utf-8").write(
            "export const Ok = () => view.fields.map((f) => <dd key={f.label}>{f.value}</dd>);\n"
        )
        code, out = run(clean)
        if code != 0:
            failures.append("a clean renderer did not pass: %s" % out.strip()[:200])
        else:
            print("    ok   a clean renderer passes")

        for why, name, body in VIOLATIONS:
            d = os.path.join(tmp, "v-" + name)
            os.makedirs(d, exist_ok=True)
            io.open(os.path.join(d, name), "w", encoding="utf-8").write(body + "\n")
            code, out = run(d)
            if code == 0:
                failures.append("NOT CAUGHT: %s (%s)" % (why, body))
                print("    FAIL %s: not caught" % why)
            else:
                print("    ok   caught: %s" % why)

        for why, name, body in NEAR_MISSES:
            d = os.path.join(tmp, "n-" + name)
            os.makedirs(d, exist_ok=True)
            io.open(os.path.join(d, name), "w", encoding="utf-8").write(body + "\n")
            code, out = run(d)
            if code != 0:
                failures.append("wrongly flagged: %s (%s)" % (why, out.strip()[:120]))
                print("    FAIL wrongly flagged: %s" % why)
            else:
                print("    ok   allowed: %s" % why)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    if failures:
        for f in failures:
            print("    " + f)
        print("    FAILED: %d problem(s) with the check itself" % len(failures))
        return 1
    print(
        "    every access form planted and caught, %d near misses allowed" % len(NEAR_MISSES)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
