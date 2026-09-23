#!/usr/bin/env python3
"""Weaken the row-level security policies and watch the suite go red.

SPEC.md 2.2 accepts on "a direct PostgREST call with firm A's token returns
zero of firm B's rows". packages/db/src/rls.test.ts asserts that against real
Postgres. This file asserts the assertion.

The reason is specific rather than ceremonial. An isolation suite is the
easiest kind of test to write wrong, because the failure mode of a broken
isolation test is that everything passes. Three ways to get a false green
here, all of which this repository was one edit away from:

  connect as the table owner   `enable row level security` EXEMPTS the owner,
                               so every isolation test passes without a single
                               policy being consulted

  policy returns nothing       "firm A sees zero of firm B's rows" is
                               satisfied by a policy that shows nobody
                               anything

  USING without WITH CHECK     reads are filtered, writes are not, so firm A
                               can plant a row in firm B's workspace and the
                               read tests stay green

FOUR MUTATIONS. Each removes one guarantee; each must be caught by the test
whose name claims that guarantee. A mutation that no test notices is printed
as MISSED and fails this script, because the honest reading of that result is
that the guarantee is undefended, not that the policy is fine.

    python3 scripts/rls-mutation-test.py
"""
import io
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RLS = os.path.join(ROOT, "packages", "db", "migrations", "0002_rls.sql")
SUITE = os.path.join("packages", "db", "dist", "rls.test.js")

# (label, pattern, replacement, the test that must notice)
MUTATIONS = [
    (
        "with check -> true (a firm can write into another firm)",
        "with check (firm_id = app_current_firm_id())",
        "with check (true)",
        "cannot WRITE a row into firm B",
    ),
    (
        "using -> true (a firm can read another firm)",
        "using (firm_id = app_current_firm_id())",
        "using (true)",
        "THE ACCEPTANCE",
    ),
    (
        "firms base case -> true (every firm is readable)",
        "using (clerk_org_id = auth.jwt() -> 'o' ->> 'id')",
        "using (true)",
        "through the firms table itself",
    ),
    (
        "force dropped (the table owner becomes exempt)",
        None,  # handled as a line deletion, not a substitution
        None,
        "is FORCED",
    ),
]


def run_suite():
    """Return (ok, failing test names). The suite reads the .sql at run time,
    so a mutation needs no rebuild.

    The reporter is pinned to TAP rather than left to default. Node picks its
    default from whether stdout is a terminal and from its own version, so the
    first draft of this parser matched the local run's `✖ name` lines and
    matched nothing at all on CI, where the same command emitted TAP. Every
    mutation was still detected by exit code, so the script reported that all
    four were "caught by the wrong test" rather than reporting a broken
    parser. Pinning the format removes the difference rather than handling it.
    """
    p = subprocess.run(
        ["node", "--test", "--test-reporter=tap", SUITE],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    out = p.stdout.decode("utf-8", "replace")
    names = set()
    for line in out.splitlines():
        m = re.match(r"^not ok \d+ - (.+?)\s*$", line)
        if m:
            names.add(m.group(1))
    if p.returncode != 0 and not names:
        # Red with nothing parsed means the suite did not start, or the format
        # moved again. Either way the run proves nothing, so say so.
        raise RuntimeError("the suite failed but no TAP failure lines were "
                           "parsed; output was:\n" + out[-2000:])
    return p.returncode == 0, names


def read(path):
    return io.open(path, "r", encoding="utf-8").read()


def write(path, text):
    io.open(path, "w", encoding="utf-8", newline="\n").write(text)


def main():
    if not os.path.exists(os.path.join(ROOT, SUITE)):
        print("  packages/db is not built; run pnpm --filter @stratifypro/db build")
        return 1

    original = read(RLS)
    backup = RLS + ".mutation-backup"
    shutil.copyfile(RLS, backup)
    failures = []
    try:
        ok, _ = run_suite()
        if not ok:
            print("  the suite is already red before any mutation; fix that first")
            return 1

        for label, pattern, replacement, expect in MUTATIONS:
            if pattern is None:
                mutated = "\n".join(
                    l for l in original.splitlines() if "force row level security" not in l
                ) + "\n"
            else:
                if pattern not in original:
                    failures.append("%s: the pattern is no longer in the file" % label)
                    continue
                mutated = original.replace(pattern, replacement)
            write(RLS, mutated)
            ok, red = run_suite()
            if ok:
                print("  MISSED   %s" % label)
                failures.append("%s: no test noticed" % label)
            elif not any(expect in n for n in red):
                print("  WRONG    %s" % label)
                print("           expected a test naming %r; got %s" % (expect, sorted(red)))
                failures.append("%s: caught by the wrong test" % label)
            else:
                print("  caught   %s" % label)
    finally:
        shutil.copyfile(backup, RLS)
        os.remove(backup)

    if failures:
        for f in failures:
            print("  %s" % f)
        return 1
    print("  %d mutations planted, %d caught" % (len(MUTATIONS), len(MUTATIONS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
