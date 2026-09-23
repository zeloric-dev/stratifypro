#!/usr/bin/env python3
"""The notification windows say the same thing in every document that states them.

SPEC.md 2.9 commits to a 5-day breach notice and a 3-business-day CISA KEV
disclosure, matching MC2 v2 clauses 33 and 35. Those numbers now appear in
three places: SPEC.md, SECURITY.md and docs/incident-response.md.

Three copies of a commitment is how a commitment drifts. Somebody softens one
window under pressure, or tightens one while writing a questionnaire response,
and the supplier is then promising two different things depending on which
document the customer read. Unlike most drift in this repository, this kind is
contractual: a medical device manufacturer's security questionnaire asks for
these numbers by name.

WHAT THIS DOES NOT DO. It does not check that the commitments are wise, or that
anybody can meet them. docs/incident-response.md is candid that the plan has
never been rehearsed. This checks only that the promise is one promise.

    python3 scripts/check-commitments.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SECURITY = os.path.join(ROOT, "SECURITY.md")
PLAN = os.path.join(ROOT, "docs", "incident-response.md")
SPEC = os.path.join(ROOT, "SPEC.md")

# Each commitment, and the pattern that finds it. The pattern is deliberately
# loose about surrounding prose and strict about the number and its unit,
# because the number and the unit are the promise.
COMMITMENTS = [
    # (label, the row this is about, the value that row must carry, shown)
    ("breach notice", r"breach", r"\b5\s*days?\b", "5 days"),
    ("CISA KEV disclosure", r"\bKEV\b", r"\b3\s*business\s*days?\b", "3 business days"),
]


def commitment_rows(path):
    """Table rows as (label, value) from the first two cells."""
    out = []
    if not os.path.exists(path):
        return out
    for line in io.open(path, encoding="utf-8").read().splitlines():
        if not line.startswith("|") or line.count("|") < 3:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2:
            out.append((cells[0], cells[1]))
    return out


def stated_for(path, subject_pattern, value_pattern):
    """Does the row ABOUT this subject carry this value?

    NOT "does the phrase appear anywhere in the file". That was the first
    version, and it let this through: replacing the KEV row's "3 business days"
    with "as soon as practical" passed, because "3 business days" still appeared
    further up in the acknowledgement row. The file contained the phrase; the
    commitment no longer did.

    Same mistake as scripts/check-attestation.py made earlier in this session,
    where a banned word was allowed because it appeared somewhere in the
    mandated text rather than in the string being checked. Presence is not
    binding.
    """
    rows = commitment_rows(path)
    matching = [(a, b) for a, b in rows if re.search(subject_pattern, a, re.IGNORECASE)]
    if not matching:
        return None  # no row about this subject at all
    return any(re.search(value_pattern, b, re.IGNORECASE) for _a, b in matching)


def main():
    fail = 0

    for path in (SECURITY, PLAN):
        if not os.path.exists(path):
            print("    FAILED: %s does not exist" % os.path.relpath(path, ROOT))
            fail = 1
    if fail:
        return 1

    for label, subject, value, shown in COMMITMENTS:
        for path in (SECURITY, PLAN):
            state = stated_for(path, subject, value)
            rel = os.path.relpath(path, ROOT)
            if state is None:
                print("    FAILED: %s has no row about the %s commitment" % (rel, label))
                fail = 1
            elif not state:
                rows = [b for a, b in commitment_rows(path) if re.search(subject, a, re.IGNORECASE)]
                print("    FAILED: %s states the %s commitment as %r, not %s"
                      % (rel, label, rows[0] if rows else "?", shown))
                print("            If it changed, it has to change everywhere at once.")
                fail = 1
        # SPEC.md states them in prose rather than a table, so it is checked for
        # the phrase alone. It is the source the other two are copied from.
        spec_text = io.open(SPEC, encoding="utf-8").read() if os.path.exists(SPEC) else ""
        if not re.search(value, spec_text, re.IGNORECASE):
            print("    FAILED: SPEC.md no longer states the %s commitment (%s)" % (label, shown))
            fail = 1

    # The reverse direction: a window stated in one document and not the other
    # is the drift this exists to catch, and so is a DIFFERENT number appearing
    # where these should be. Any "N day" window in the two operational
    # documents must be one of the agreed ones.
    agreed = {"3", "5", "10"}
    for path in (SECURITY, PLAN):
        text = io.open(path, encoding="utf-8").read()
        for m in re.finditer(r"\b(\d+)\s*(?:business\s*)?days?\b", text, re.IGNORECASE):
            if m.group(1) not in agreed:
                line = text[: m.start()].count("\n") + 1
                print("    FAILED: %s:%d states a %s-day window, which is not one of the"
                      % (os.path.relpath(path, ROOT), line, m.group(1)))
                print("            agreed commitments (3, 5 or 10). Add it here deliberately")
                print("            or fix the document.")
                fail = 1

    if fail:
        return 1
    print("    the breach notice and KEV disclosure windows agree across SPEC.md, "
          "SECURITY.md and the incident response plan")
    return 0


if __name__ == "__main__":
    sys.exit(main())
