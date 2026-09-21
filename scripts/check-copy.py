#!/usr/bin/env python3
"""The interface copy in the web app is the copy in docs/copy.md, not a paraphrase.

docs/copy.md opens with "These are the exact strings. Claude Code writes them as
given. They are not placeholders." Nothing enforced that, and a paraphrase is the
easiest defect in this repository to introduce and the hardest to notice: it
compiles, it renders, it reads fine, and it quietly changes what the product
promises.

THREE WAYS THE FIRST VERSION OF THIS CHECK PASSED WHILE THAT WAS FALSE.

1. It tested `n not in doc`, a substring match against the whole document. So
   truncating the privacy line from

       'Your file is checked in this browser. It is never uploaded.'
   to
       'Your file is checked in this browser.'

   passed, because the shorter string is a substring of the longer one. The
   entire privacy promise, which is the free tier's whole proposition, could be
   deleted from the page with the check still green. The mutation test that was
   run against it changed "never" to "not", which proves substitution is caught
   and says nothing about truncation. Truncation is the cheaper edit.

   Fixed by extracting the backticked cells of docs/copy.md into a set and
   requiring whole-cell equality. A string that is merely contained in an
   approved one is no longer approved.

2. Its literal extractor matched '...' and `...` and not "...". A double-quoted
   string was invisible, so

       privacy: "Your file is checked in this browser. A copy is kept for debugging."

   passed. The page said the opposite of the governing claim and CI was green.
   There is no linter in this repository forcing quote style, so nothing else
   was holding that line either.

3. Nothing asserted how many strings were checked. The count silently dropped
   from 21 to 20 in case 2 and no output said so. EXPECTED below is a pin: a
   string that stops being seen is now a failure, not a quieter line.

WHAT THIS STILL DOES NOT CHECK. It runs in one direction: a string in
docs/copy.md that nobody implemented does not fail, because the document covers
screens that do not exist yet. It cannot tell an approved string used in the
wrong place from one used in the right place. And it only reads copy.ts, so
prose written inline in a component is outside it.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COPY_TS = os.path.join(ROOT, "apps", "web", "app", "copy.ts")
COPY_MD = os.path.join(ROOT, "docs", "copy.md")

# Shorter than this is a label or a fragment, not a sentence anyone approved.
# Set from the shortest real string in the document, "That file is empty" at 18.
MIN_LEN = 18

# How many strings this file expects to find. A drop means a string stopped
# being extracted, which is how a double-quoted paraphrase hid in plain sight.
# Raise it deliberately when copy is added; never lower it to make a run pass.
EXPECTED = 23


def strip_comments(src):
    """Remove // and /* */ so prose inside a comment is never taken for copy."""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def normalise(s):
    """Flatten the differences that are formatting rather than wording."""
    s = re.sub(r"\$\{[^}]*\}", lambda m: "{" + m.group(0)[2:-1].split(".")[0].strip() + "}", s)
    s = s.replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip()


def literals(src):
    """Every string literal, with adjacent + concatenations joined into one.

    copy.ts wraps long strings across lines with +, and each fragment alone is
    meaningless. Joining them is what lets whole sentences be compared. All
    three quote styles, because omitting one made every string in that style
    invisible to the check rather than merely unmatched.
    """
    token = re.compile(
        r"'((?:[^'\\]|\\.)*)'"
        r'|"((?:[^"\\]|\\.)*)"'
        r"|`((?:[^`\\]|\\.)*)`",
        re.S,
    )
    out = []
    pos = 0
    current = None
    for m in token.finditer(src):
        raw = next(g for g in m.groups() if g is not None)
        text = raw.replace("\\'", "'").replace('\\"', '"').replace("\\`", "`").replace("\\n", "\n")
        between = src[pos:m.start()]
        pos = m.end()
        if current is not None and re.fullmatch(r"\s*\+\s*", between):
            current += text
        else:
            if current is not None:
                out.append(current)
            current = text
    if current is not None:
        out.append(current)
    return out


def approved_cells(md):
    """The backticked spans of docs/copy.md, normalised, as a set.

    Whole cells, not the whole document. Membership in a set cannot be satisfied
    by a prefix, which is the entire point of this rewrite.
    """
    return {normalise(c) for c in re.findall(r"`([^`]+)`", md)}


def main():
    src = strip_comments(io.open(COPY_TS, encoding="utf-8").read())
    cells = approved_cells(io.open(COPY_MD, encoding="utf-8").read())

    checked = 0
    missing = []
    for lit in literals(src):
        n = normalise(lit)
        if len(n) < MIN_LEN or " " not in n:
            continue
        checked += 1
        if n not in cells:
            missing.append(n)

    for m in missing:
        print("    NOT AN APPROVED STRING: " + (m[:110] + "..." if len(m) > 110 else m))

    if checked != EXPECTED:
        print(
            "    FAILED: %d strings extracted, expected %d. A string that stops being "
            "seen is how a paraphrase hides." % (checked, EXPECTED)
        )
        return 1

    if missing:
        print(
            "    FAILED: %d of %d strings are not approved copy" % (len(missing), checked)
        )
        return 1

    print("    %d strings matched whole cells in docs/copy.md" % checked)
    return 0


if __name__ == "__main__":
    sys.exit(main())
