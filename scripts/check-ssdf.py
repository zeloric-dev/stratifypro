#!/usr/bin/env python3
"""Every file and check the SSDF attestation cites has to exist.

SPEC.md 2.10 asks for a published NIST SSDF self-attestation. A signed one is a
representation by a named individual and carries False Claims Act exposure
under the CISA Secure Software Development Attestation Form, so the difference
between "we do this" and "we did this once and deleted it" is not academic.

WHY THIS SCRIPT EXISTS. docs/ssdf-attestation.md claims a practice is met and
names the thing that makes it true. Prose is not checked by anything. Earlier
in this same session a published document cited `supplierNames`, a field the
tool does not emit, and nothing caught it because nothing was looking. An
attestation citing a check somebody deleted last quarter is worse than one that
claims nothing, because it reads as evidence.

So: every backticked path in the evidence column must exist, and every named
verify.sh check must still be in verify.sh.

WHAT IT DOES NOT DO, said plainly so nobody mistakes this for more than it is.
It cannot tell whether a check is any good, whether a `met` row deserves to be
met, or whether the person who signs it agrees. It catches a citation that has
stopped being real, which is the failure that happens quietly.

    python3 scripts/check-ssdf.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, "docs", "ssdf-attestation.md")
VERIFY = os.path.join(ROOT, "verify.sh")

# A backticked token is a citation when it looks like a path. Prose in
# backticks, such as `met`, is not.
PATHLIKE = re.compile(r"^[A-Za-z0-9_./-]+$")


def cited_paths(text):
    out = set()
    for token in re.findall(r"`([^`]+)`", text):
        t = token.strip()
        if not PATHLIKE.match(t):
            continue
        # A path has a separator or a known extension. `met` and `partial` do not.
        if "/" in t or t.endswith((".md", ".sh", ".py", ".ts", ".json", ".yml", ".yaml")):
            out.add(t)
    return sorted(out)


def evidence_paths(text):
    """Paths cited in the evidence column of a met or partial row."""
    out = set()
    for line in text.splitlines():
        if not line.startswith("| ") or line.count("|") < 5:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        status = cells[2].lower()
        if "not met" in status:
            continue
        out.update(cited_paths(cells[3]))
    return sorted(out)


def verify_checks():
    s = io.open(VERIFY, encoding="utf-8").read()
    names = re.findall(r'^run "([^"]+)"', s, re.MULTILINE)
    names += re.findall(r'^echo "--- ([^"]+)"', s, re.MULTILINE)
    return set(names)


def main():
    if not os.path.exists(DOC):
        print("    FAILED: %s does not exist" % os.path.relpath(DOC, ROOT))
        return 1
    text = io.open(DOC, encoding="utf-8").read()
    fail = 0

    # 1. It must still say it is a draft. An unsigned attestation that has
    #    quietly lost its "DRAFT, UNSIGNED" heading is the document this whole
    #    script exists to keep honest.
    # Checked as a PROPERTY, not as a sentence. The first version required the
    # exact phrase "nobody has signed it" and failed because the paragraph
    # line-wrapped between "nobody" and "has". A document meant to be edited
    # must not be guarded by a check that breaks on reflowing a paragraph:
    # the next person deletes the check rather than the wrap.
    title = text.splitlines()[0] if text.splitlines() else ""
    unsigned = "DRAFT" in title.upper() and "UNSIGNED" in title.upper()
    signature = re.search(r"^\s*(Signed|Signature|Attested by)\s*:", text, re.MULTILINE | re.IGNORECASE)
    if not unsigned:
        print("    FAILED: the title no longer says this is an unsigned draft: %r" % title)
        print("    If it has genuinely been signed, a person's name belongs in it and")
        print("    this check should be changed deliberately, not by editing a heading.")
        fail = 1
    if signature and not unsigned:
        print("    FAILED: something looks like a signature block on an untitled draft")
        fail = 1

    # 2. Every path cited AS EVIDENCE exists.
    #
    # Only the evidence column of a met or partial row. A `not met` row
    # legitimately names a file that does not exist: "There is no SECURITY.md"
    # is the finding, and the first version of this check failed the build for
    # saying so, which would have pushed the document towards claiming the file
    # exists. A check that punishes an honest gap is worse than no check.
    missing = []
    for p in evidence_paths(text):
        if not os.path.exists(os.path.join(ROOT, p)):
            missing.append(p)
    if missing:
        print("    FAILED: %d cited path(s) do not exist:" % len(missing))
        for p in missing:
            print("        %s" % p)
        fail = 1

    # 3. Nothing may claim `met` without naming something.
    rows = [l for l in text.split("\n") if l.startswith("| ") and l.count("|") >= 5]
    for row in rows:
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if len(cells) < 4:
            continue
        status, evidence = cells[2].lower(), cells[3]
        if "met" in status and "not met" not in status and len(evidence) < 12:
            print("    FAILED: %s claims met and names nothing: %r" % (cells[0], evidence))
            fail = 1

    # 4. The gaps section must still list the not-met rows. A status changed to
    #    met without the gap list being updated is the drift worth catching.
    not_met = [
        [c.strip() for c in r.strip().strip("|").split("|")][0]
        for r in rows
        if "not met" in r.lower()
    ]
    if not not_met:
        print("    FAILED: nothing is marked not met. That would be a remarkable")
        print("    improvement and it should be argued for in the document, not")
        print("    arrived at silently.")
        fail = 1

    if fail:
        return 1
    checks = verify_checks()
    print("    %d evidence path(s) all exist, %d practice(s) honestly not met, "
          "still an unsigned draft" % (len(evidence_paths(text)), len(not_met)))
    print("    (%d verify.sh checks available as evidence)" % len(checks))
    return 0


if __name__ == "__main__":
    sys.exit(main())
