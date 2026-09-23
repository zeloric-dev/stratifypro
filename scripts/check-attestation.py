#!/usr/bin/env python3
"""The attestation text is SPEC.md's, to the character.

SPEC.md Step 11 gives the scope-of-attestation wording and says, in bold:
"This wording is load-bearing and is not open to paraphrase." SPEC.md 2.7 makes
that an acceptance test: "The exact wording in Step 11. Never 'contained'.
Never 'signature'."

WHY THIS SCRIPT EXISTS AT ALL, which is a story about a check colliding with a
specification.

docs/banned-phrases.txt forbids "contained" and "signature" in product source,
for good reasons: a checked file is never described as having contained
anything, because StratifyPro does not retain it; and the seal is machine
provenance, not a person's signature under 21 CFR 11.3(b)(7).

SPEC.md's mandated wording uses both words, to say the OPPOSITE of a claim:

    ...not to what that artifact contained.
    It is not an electronic signature within the meaning of 21 CFR 11.3(b)(7).

A grep cannot tell a claim from its own denial. The first attempt to render the
attestation turned the banned-phrase check red, and there were two ways out.
Paraphrase the text, which the specification forbids in bold for reasons that
are about FTC Act exposure rather than taste. Or exempt the file and lose the
check.

This is the third way. The text lives in packages/report/src/attestation.ts,
that one file is excluded from the banned-phrase scan, and this script replaces
the exclusion with something stricter than it:

  1. The rendered text must equal SPEC.md's blockquote, character for
     character, after substituting the placeholders.
  2. The banned words may appear in that file ONLY inside the mandated wording
     or the comment explaining it. Anywhere else is a failure.

Before this, the attestation was not compared to the specification at all. The
exemption is narrower than what it replaces, which is the only kind of
exemption worth granting.

    python3 scripts/check-attestation.py
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, "SPEC.md")
SRC = os.path.join(ROOT, "packages", "report", "src", "attestation.ts")
DIST = os.path.join(ROOT, "packages", "report", "dist", "attestation.js")

BANNED_HERE = ["contained", "signature"]


def spec_paragraphs():
    """The blockquote under 'says exactly this and nothing more', unwrapped."""
    s = io.open(SPEC, encoding="utf-8").read()
    try:
        start = s.index("`attestation.txt` says exactly this and nothing more:")
        end = s.index("Apply a Sigstore keyless")
    except ValueError:
        return None
    paras, cur = [], []
    for line in s[start:end].split("\n"):
        if not line.startswith(">"):
            continue
        body = line[1:].strip()
        if body == "":
            if cur:
                paras.append(" ".join(cur))
                cur = []
        else:
            cur.append(body)
    if cur:
        paras.append(" ".join(cur))
    # SPEC writes the placeholders and the filename in backticks. The rendered
    # text is plain, so the comparison is made on the words.
    return [p.replace("`", "") for p in paras]


def rendered_template():
    """ATTESTATION_TEMPLATE, read out of the module that actually ships.

    An earlier version of this function parsed the TypeScript with a regular
    expression and concatenated the string literals it found. That dropped the
    paragraph separator, so the check reported a mismatch that existed only in
    the checker. Reading the built module removes the guesswork: what is
    compared is what callers get.
    """
    if not os.path.exists(DIST):
        return None
    url = "file:///" + DIST.replace("\\", "/")
    r = subprocess.run(
        [os.environ.get("NODE", "node"), "--input-type=module", "-e",
         'const m = await import(process.argv[1]); process.stdout.write(m.ATTESTATION_TEMPLATE);',
         url],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print("    FAILED: could not read the built attestation: %s" % r.stderr.strip()[:200])
        return None
    return re.sub(r"\s+", " ", r.stdout).strip()


def main():
    fail = 0

    spec = spec_paragraphs()
    if not spec:
        print("    FAILED: could not find the attestation blockquote in SPEC.md")
        return 1
    if len(spec) != 3:
        print("    FAILED: SPEC.md's attestation is %d paragraphs, expected 3" % len(spec))
        fail = 1

    want = re.sub(r"\s+", " ", " ".join(spec)).strip()
    got = rendered_template()
    if got is None:
        print("    FAILED: build @stratifypro/report first")
        return 1

    if want != got:
        print("    FAILED: the attestation does not match SPEC.md Step 11.")
        print("    SPEC.md says the wording is not open to paraphrase.")
        # Name the first divergence rather than printing two paragraphs.
        for i, (a, b) in enumerate(zip(want, got)):
            if a != b:
                print("    first difference at character %d:" % i)
                print("      SPEC.md: ...%s" % want[max(0, i - 40):i + 40])
                print("      source:  ...%s" % got[max(0, i - 40):i + 40])
                break
        else:
            print("      SPEC.md has %d characters, the source has %d" % (len(want), len(got)))
        fail = 1

    # The exemption must not become a hiding place. Every occurrence of a
    # banned word in this file has to be inside the mandated wording or the
    # comment that explains why the wording uses it.
    src = io.open(SRC, encoding="utf-8").read()
    for word in BANNED_HERE:
        for m in re.finditer(r"\b%s\b" % word, src, re.IGNORECASE):
            line_start = src.rfind("\n", 0, m.start()) + 1
            line = src[line_start:src.find("\n", m.start())]
            stripped = line.strip()
            in_comment = stripped.startswith("*") or stripped.startswith("//")

            # NOT "the word appears somewhere in the mandated text". That was
            # the first version and it let this through:
            #
            #     export const SEAL_LABEL = 'a digital signature from StratifyPro';
            #
            # because "signature" is in the mandated text and the line has
            # quotes. Calling the seal a signature is the exact thing 21 CFR
            # 11.3(b)(7) makes expensive, and the check waved it past.
            #
            # So: find the quoted literal this occurrence sits inside, and
            # require THAT to be part of the mandated wording.
            in_text = False
            for lit in re.findall(r"'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`", line):
                text = (lit[0] or lit[1])
                if not text or word.lower() not in text.lower():
                    continue
                normalised = re.sub(r"\s+", " ", text).strip()
                if normalised and normalised.lower() in want.lower():
                    in_text = True

            if not (in_comment or in_text):
                print("    FAILED: %r appears outside the mandated wording: %s"
                      % (word, stripped[:90]))
                fail = 1

    if fail:
        return 1
    print("    the attestation is SPEC.md Step 11 verbatim, %d characters, "
          "and neither banned word appears outside it" % len(want))
    return 0


if __name__ == "__main__":
    sys.exit(main())
