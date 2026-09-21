#!/usr/bin/env python3
"""The design system, enforced.

docs/design.md and docs/ui-stack.md are authoritative and were unchecked, and by
section 5.6's own standard an unchecked rule does not exist. This was proven the
expensive way: a coloured left accent rail reached packages/report on the first
build, and doc 4 section 9 had already named accent rails as a giveaway in the
same document that specified the report.

WHY A SCRIPT RATHER THAN GREPS IN verify.sh. The three rules that lived inline
there had never been seen to fail. Step 1.16's acceptance test is "each of the
six greps planted with a violation and seen to go red", which is not something
an inline grep can be held to. Pulling them out gives each rule a key, a
message and the sentence it comes from, and lets design-mutation-test.py plant a
violation for every one and watch it fire.

WHAT THIS CANNOT DO. It cannot tell whether the result looks good. Every rule is
a mechanical proxy for a judgement in the two design documents, and a page can
satisfy all of them and still be ugly. What it buys is that the specific, named,
recurring tells cannot come back silently.

Usage: check-design.py [paths...]   (defaults to the product source)
       check-design.py --why        (also print the source sentence for each hit)
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_PATHS = ["apps", "packages/report/src", "packages/engine/src"]
SKIP_DIRS = {"node_modules", ".next", "dist", "build", ".turbo", ".git"}
SCAN_EXT = {".ts", ".tsx", ".css", ".js", ".jsx", ".html"}


class Rule:
    """Either a forbidden pattern, or a property whose value must be allowed.

    The allowlist mode exists because a forbidden-pattern cannot state "a radius
    above 4 pixels" without enumerating every way CSS can write one. The first
    version of the radius rule matched `border-radius: <5-99>px` and therefore
    missed `0.5rem`, which is 8 pixels, and `50%`, which is a pill. Listing what
    is permitted and refusing everything else is the only form of that rule that
    cannot be walked around by changing units.

    Every pattern is case insensitive, because CSS property names and units are:
    `BORDER-RADIUS: 12PX` passed the case-sensitive version.
    """

    def __init__(self, key, pattern, message, why, allowed_value=None):
        self.key = key
        self.re = re.compile(pattern, re.I)
        self.allowed_value = re.compile(allowed_value, re.I) if allowed_value else None
        self.message = message
        self.why = why

    def matches(self, line):
        if self.allowed_value is None:
            return self.re.search(line) is not None
        for m in self.re.finditer(line):
            if not self.allowed_value.fullmatch(m.group("value").strip()):
                return True
        return False


RULES = [
    Rule(
        "accent-rail",
        r"border-(left|right)-color\s*:",
        "a coloured rail down one side of a card",
        "ui-stack.md, Small things that give it away: 'A coloured left accent rail on "
        "cards. That is the shadcn Alert variant, and it is everywhere.' Not hypothetical: "
        "it reached packages/report on the first build.",
    ),
    Rule(
        "banned-library",
        r"aceternity|magic-ui|cult-ui",
        "a component library whose look is the tell",
        "ui-stack.md, Never install these. Aurora backgrounds and spotlight cards are the "
        "visual fingerprint of generated code, and an aurora gradient behind a findings "
        "table reads as nobody actually built this.",
    ),
    Rule(
        "outline-none",
        r"outline\s*:\s*none",
        "outline: none, which removes the keyboard focus ring",
        "design.md accessibility: 'Visible focus ring: 2px --accent, 2px offset. Never "
        "outline: none.' A keyboard user who cannot see focus cannot use the page at all.",
    ),
    Rule(
        "drop-shadow",
        # The lookahead swallows the whitespace itself. Written as
        # `\s*:\s*(?!none)` the `\s*` backtracks to zero width, the lookahead
        # then sits on " none" rather than "none", and `box-shadow: none` was
        # flagged as a drop shadow. Found by the near-miss half of
        # design-mutation-test.py, which is the half people leave out.
        r"box-shadow\s*:(?!\s*none\b)",
        "a drop shadow",
        "ui-stack.md: 'hairline 1px borders instead of shadows. Shadows read as consumer. "
        "Borders read as document.' design.md says the findings table carries no outer "
        "shadow. box-shadow: none is allowed, because removing one is not adding one.",
    ),
    Rule(
        "large-radius",
        r"border-radius\s*:(?P<value>[^;}]*)",
        "a corner radius outside the 2 to 4 pixel band",
        "ui-stack.md: 'Set the radius token to 2 to 4 pixels and never override upward', "
        "and rounded-lg as a default radius is listed among the things that give it away. "
        "It is half of the shadcn default signature. Written as an allowlist because the "
        "forbidden-pattern version missed 0.5rem, which is 8 pixels, and 50%.",
        allowed_value=r"\s*(0|0px|[1-4]px|var\([^)]*\)|inherit|initial|unset|revert)\s*",
    ),
    Rule(
        "large-radius-utility",
        r"rounded-(lg|xl|2xl|3xl|full)",
        "a Tailwind radius utility above the 4 pixel band",
        "ui-stack.md lists rounded-lg as a default radius among the things that give it "
        "away. Separate from large-radius because that rule reads a CSS value and this one "
        "reads a class name.",
    ),
    Rule(
        "overexposed-typeface",
        r"\b(Inter|Space Grotesk|Geist Sans|Geist Mono|Satoshi|General Sans|"
        r"Plus Jakarta Sans|Manrope|Outfit|Sora|Cal Sans|JetBrains Mono)\b",
        "a typeface ui-stack.md lists as overexposed",
        "ui-stack.md, Typefaces: Inter and Geist Sans in particular signal 'AI built this' "
        "and 'deployed on Vercel' more than anything about the product. The system stack in "
        "use now is deliberate; IBM Plex Sans is the named alternative.",
    ),
    Rule(
        "th-without-scope",
        # The word boundary here was written into this file as a literal backspace
        # byte the first time, which made the lookahead never fire and the rule flag
        # every <th>, including the ones that declare a scope. Third time that has
        # happened in this repository; regexes are edited directly now.
        r"<th(?![A-Za-z])(?![^>]*\bscope=)",
        "a table header cell with no scope",
        "design.md accessibility: 'Findings are a real <table> with <th scope>, not a grid of "
        "divs.' Without scope a screen reader in table mode announces a cell with no row or "
        "column association, which on a 50 row crosswalk is 100 chips and no idea what they "
        "describe. Every table on the public pages shipped without one.",
    ),
    Rule(
        "gradient",
        r"linear-gradient|radial-gradient|conic-gradient",
        "a gradient",
        "design.md, palette: 'No gradients anywhere.' A findings table is a document, and a "
        "gradient is the fastest way to make one read as a marketing dashboard.",
    ),
]


def files(paths):
    for p in paths:
        full = p if os.path.isabs(p) else os.path.join(ROOT, p)
        if os.path.isfile(full):
            yield full
            continue
        for dirpath, dirnames, filenames in os.walk(full):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                if os.path.splitext(fn)[1] in SCAN_EXT:
                    yield os.path.join(dirpath, fn)


NEWLINE = "\n"


def blank_comments(text):
    """Replace comment spans with spaces, preserving every newline.

    A rule named in the prose that explains why it exists is not a violation of
    it, which is how the banned-words scan first went red on its own
    documentation.

    This was a line-start heuristic: a line beginning with `*` was treated as a
    JSDoc continuation and skipped. `*` is ALSO the CSS universal selector, and
    apps/web/app/globals.css opens with `* { box-sizing: border-box; }`, so
    every declaration written against `*` was invisible to every rule here. A
    planted `* { border-radius: 8px; box-shadow: 0 2px 4px #000; }` came back
    clean on two counts at once.

    Blanking rather than deleting keeps line numbers honest, which is the whole
    reason a reader trusts the file:line a check prints.
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join(c if c == NEWLINE else " " for c in text[i:j]))
            i = j
        elif text.startswith("//", i):
            j = text.find(NEWLINE, i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        elif text[i] in "\"'`":
            # Step over string bodies so that // inside a URL is not read as the
            # start of a comment. Not a tokeniser; enough for this file set.
            quote = text[i]
            out.append(text[i])
            j = i + 1
            while j < n and text[j] != quote and text[j] != NEWLINE:
                if text[j] == "\\" and j + 1 < n:
                    out.append(text[j : j + 2])
                    j += 2
                    continue
                out.append(text[j])
                j += 1
            if j < n:
                out.append(text[j])
            i = j + 1
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def scan(paths):
    hits = []
    for path in files(paths):
        try:
            text = io.open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        stripped = blank_comments(text)
        raw = text.splitlines()
        for n, line in enumerate(stripped.splitlines(), 1):
            for rule in RULES:
                if rule.matches(line):
                    rel = os.path.relpath(path, ROOT).replace("\\", "/")
                    shown = raw[n - 1].strip() if n - 1 < len(raw) else line.strip()
                    hits.append((rule, rel, n, shown))
    return hits


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    paths = args or [p for p in DEFAULT_PATHS if os.path.exists(os.path.join(ROOT, p))]

    if not paths:
        print("    skipped: no product source exists yet")
        return 0

    hits = scan(paths)
    for rule, rel, n, line in hits:
        print("    %s:%d  %s" % (rel, n, rule.message))
        print("        %s" % line[:100])
        if "--why" in sys.argv:
            print("        %s" % rule.why)

    if hits:
        print("    FAILED: %d design system violation(s)" % len(hits))
        return 1
    print("    clean, %d rules checked" % len(RULES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
