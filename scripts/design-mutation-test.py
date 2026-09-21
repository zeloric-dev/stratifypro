#!/usr/bin/env python3
"""Plant a violation of every design rule and watch each one fire.

Step 1.16's acceptance test, in its own words: "Each of the six greps planted
with a violation and seen to go red." Three of them existed and none had ever
been seen to fail, which by section 5.6's standard means they did not exist.
This is the difference between a check and a decoration.

Modelled on packages/rules/src/mutation-test.py, which does the same job for the
rule pack validator, and for the same reason: a validator nobody has watched
reject something is a function that returns zero.

Each case asserts three things, not one:
  1. the planted violation is caught at all,
  2. the rule that catches it is the RIGHT rule, so two patterns cannot quietly
     cover for each other and leave a dead one in the list,
  3. a near-miss that is deliberately allowed still passes, where one exists.

The near-miss cases are the ones with teeth. `box-shadow: none` must pass while
`box-shadow: 0 1px 2px` fails, `border-radius: 3px` must pass while `8px` fails,
and a rule named inside the comment that explains it must never trip it, which
is how the banned-words scan first went red on its own documentation.
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = os.path.join(ROOT, "scripts", "check-design.py")

# (rule key, filename, content that must FAIL)
VIOLATIONS = [
    ("accent-rail", "a.css", ".card { border-left-color: #c00; border-left-width: 3px; }"),
    ("banned-library", "b.tsx", "import { Meteors } from 'aceternity-ui';"),
    ("outline-none", "c.css", "button:focus { outline: none; }"),
    ("drop-shadow", "d.css", ".card { box-shadow: 0 1px 2px rgba(0,0,0,0.1); }"),
    ("large-radius", "e.css", ".card { border-radius: 8px; }"),
    ("large-radius-utility", "f.tsx", "export const C = () => <div className=\"rounded-lg p-4\" />;"),
    # The four that got through the first version of these rules. Every one was
    # reported clean by a check whose whole job was to catch it.
    ("large-radius", "r1.css", ".card { border-radius: 0.5rem; }"),
    ("large-radius", "r2.css", ".avatar { border-radius: 50%; }"),
    ("large-radius", "r3.css", ".x { BORDER-RADIUS: 12PX; }"),
    ("large-radius", "r4.css", "* { border-radius: 8px; }"),
    ("drop-shadow", "r5.css", "* { box-shadow: 0 2px 4px #000; }"),
    ("overexposed-typeface", "g.css", "body { font-family: Inter, sans-serif; }"),
    ("gradient", "h.css", ".hero { background: linear-gradient(to right, #001, #002); }"),
    ("th-without-scope", "t1.tsx", "export const T = () => <tr><th>Rule</th></tr>;"),
    ("th-without-scope", "t2.tsx", 'export const T = () => <tr><th className="num">F1</th></tr>;'),
]

# Content that must PASS. Each is one edit away from a violation above.
NEAR_MISSES = [
    ("box-shadow: none is removing a shadow, not adding one", "i.css", ".card { box-shadow: none; }"),
    ("a radius inside the 2 to 4 pixel band", "j.css", ".card { border-radius: 3px; }"),
    ("a four pixel radius is the top of the band, not over it", "k.css", ".card { border-radius: 4px; }"),
    ("rounded-sm is not rounded-lg", "l.tsx", "export const C = () => <div className=\"rounded-sm\" />;"),
    ("a border colour that is not a one-sided rail", "m.css", ".card { border-color: var(--line); }"),
    ("the outline shorthand with a real value", "n.css", "a:focus-visible { outline: 2px solid var(--accent); }"),
    ("a rule named in the comment that explains it", "o.css", "/* No gradients anywhere: linear-gradient is banned. */"),
    ("a typeface name inside a TypeScript line comment", "p.ts", "// Inter and Geist Sans are deliberately not used here."),
    ("zero radius", "r6.css", ".card { border-radius: 0; }"),
    ("a radius held in a design token", "r7.css", ".card { border-radius: var(--radius); }"),
    ("the universal selector carrying something harmless", "r8.css", "* { box-sizing: border-box; }"),
    ("a violation named inside a block comment", "r9.css", "/* never write border-radius: 8px here */"),
    ("a URL containing // inside a string", "r10.ts", "export const U = 'https://example.invalid/a';"),
    ("a header cell that declares its scope", "t3.tsx",
     'export const T = () => <tr><th scope="col">Rule</th></tr>;'),
    ("a row header with scope", "t4.tsx",
     'export const T = () => <tr><th scope="row" className="x">openssl</th></tr>;'),
    ("a plain data cell", "t5.tsx", "export const T = () => <tr><td>0.1548</td></tr>;"),
    ("a word that merely starts with th", "t6.tsx", "export const T = () => <p>{theme}</p>;"),
    ("the system stack this project actually ships", "q.css",
     "body { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }"),
]


def run(path):
    r = subprocess.run(
        [sys.executable, CHECK, path],
        capture_output=True, text=True, cwd=ROOT,
    )
    return r.returncode, r.stdout + r.stderr


def main() -> int:
    failures = []
    tmp = tempfile.mkdtemp(prefix="sp-design-")
    try:
        # A directory with nothing wrong in it must pass, or every result below
        # is meaningless.
        clean = os.path.join(tmp, "clean")
        os.makedirs(clean)
        io.open(os.path.join(clean, "ok.css"), "w", encoding="utf-8").write(
            ".card { border: 1px solid var(--line); border-radius: 3px; }\n"
        )
        code, out = run(clean)
        if code != 0:
            failures.append(f"a clean file did not pass: {out.strip()}")
        else:
            print("    ok   a clean file passes")

        for key, name, body in VIOLATIONS:
            d = os.path.join(tmp, "v-" + key + "-" + name)
            os.makedirs(d, exist_ok=True)
            io.open(os.path.join(d, name), "w", encoding="utf-8").write(body + "\n")
            code, out = run(d)
            if code == 0:
                failures.append(f"{key}: planted violation was NOT caught ({name})")
                print(f"    FAIL {key}: not caught")
                continue
            # The right rule, not merely some rule. Without this a dead pattern
            # can sit in the list forever while another one covers for it.
            expected = key
            matched = expected in out or _message_of(expected) in out
            if not matched:
                failures.append(f"{key}: caught, but by the wrong rule. Output: {out.strip()[:200]}")
                print(f"    FAIL {key}: caught by the wrong rule")
            else:
                print(f"    ok   {key} planted and caught")

        for why, name, body in NEAR_MISSES:
            d = os.path.join(tmp, "n-" + name)
            os.makedirs(d, exist_ok=True)
            io.open(os.path.join(d, name), "w", encoding="utf-8").write(body + "\n")
            code, out = run(d)
            if code != 0:
                failures.append(f"near miss wrongly flagged ({why}): {out.strip()[:200]}")
                print(f"    FAIL near miss flagged: {why}")
            else:
                print(f"    ok   allowed: {why}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    if failures:
        for f in failures:
            print("    " + f)
        print(f"    FAILED: {len(failures)} problem(s) with the design checks themselves")
        return 1
    print(f"    every design rule planted and seen to go red, {len(NEAR_MISSES)} near misses allowed")
    return 0


def _message_of(key):
    """The human message for a rule key, so the assertion can match either."""
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import importlib.util
    spec = importlib.util.spec_from_file_location("check_design", CHECK)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for r in mod.RULES:
        if r.key == key:
            return r.message
    return "\x00no such rule\x00"


if __name__ == "__main__":
    sys.exit(main())
