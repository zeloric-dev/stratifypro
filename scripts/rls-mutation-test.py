#!/usr/bin/env python3
"""Weaken the row-level security policies and watch the suites go red.

SPEC.md 2.2 accepts on "a direct PostgREST call with firm A's token returns
zero of firm B's rows", and SPEC.md 2.3 on "a firm sees its own checks only,
sorted newest first". packages/db asserts both against real Postgres. This file
asserts the assertions.

The reason is specific rather than ceremonial. An isolation suite is the
easiest kind of test to write wrong, because the failure mode of a broken
isolation test is that everything passes. Four ways to get a false green here,
all of which this repository was one edit away from:

  connect as the table owner   `enable row level security` EXEMPTS the owner,
                               so every isolation test passes without a single
                               policy being consulted

  policy returns nothing       "firm A sees zero of firm B's rows" is
                               satisfied by a policy that shows nobody
                               anything

  USING without WITH CHECK     reads are filtered, writes are not, so firm A
                               can plant a row in firm B's workspace and the
                               read tests stay green

  a grant that runs later      the migration revokes UPDATE and DELETE on the
                               append-only audit log, and a blanket
                               `grant ... on all tables` afterwards hands them
                               straight back. The migration still reads
                               correctly; the control is simply off

Each mutation below removes one guarantee, and must be caught by the test whose
name claims that guarantee. A mutation that no test notices is printed as
MISSED and fails this script, because the honest reading of that result is that
the guarantee is undefended, not that the policy is fine.

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
AUDIT = os.path.join(ROOT, "packages", "db", "migrations", "0003_audit_log.sql")
INDEX = os.path.join(ROOT, "packages", "db", "src", "index.ts")

SUITES = [
    os.path.join("packages", "db", "dist", "rls.test.js"),
    os.path.join("packages", "db", "dist", "queries.test.js"),
]

# (label, file, pattern, replacement, a test that must notice)
# pattern None means "delete every line containing replacement".
MUTATIONS = [
    (
        "with check -> true (a firm can write into another firm)",
        RLS,
        "with check (firm_id = app_current_firm_id())",
        "with check (true)",
        "cannot WRITE a row into firm B",
    ),
    (
        "using -> true (a firm can read another firm)",
        RLS,
        "using (firm_id = app_current_firm_id())",
        "using (true)",
        "THE ACCEPTANCE",
    ),
    (
        "firms base case -> true (every firm is readable)",
        RLS,
        "using (clerk_org_id = auth.jwt() -> 'o' ->> 'id')",
        "using (true)",
        "through the firms table itself",
    ),
    (
        "force dropped (the table owner becomes exempt)",
        RLS,
        None,
        "force row level security",
        "is FORCED",
    ),
    (
        "the audit log becomes editable (R8's control removed)",
        AUDIT,
        "  for select\n  using (firm_id = app_current_firm_id());",
        "  for all\n  using (firm_id = app_current_firm_id())\n"
        "  with check (firm_id = app_current_firm_id());",
        # Caught by the structural test, not the behavioural one, and that is
        # correct. Removing the policy still leaves the grant, which never
        # included UPDATE, so the write is refused on permissions instead. Two
        # independent layers, and the mutation removes only one of them.
        "no policy on the audit log permits an edit",
    ),
    (
        "a blanket grant hands back update and delete after the migration",
        INDEX,
        # The whole span, because the trailing revoke is load-bearing. A first
        # draft swapped only the explicit grant for the blanket one, the revoke
        # took the two verbs away again, and the script reported MISSED when
        # nothing had in fact been removed. The original bug had neither the
        # explicit grants nor the revoke, so the mutation has to take both.
        "grant select, insert, update, delete on firms, projects, checks, evidence_bundles\n"
        "  to authenticated;\n"
        "\n"
        "-- Append only. R8's control is that nobody can edit the record of what they\n"
        "-- did, so this line must never grow an update or a delete.\n"
        "grant select, insert on audit_log to authenticated;\n"
        "\n"
        "grant select on public_metrics to anon, authenticated;\n"
        "\n"
        "grant usage, select on all sequences in schema public to authenticated;\n"
        "\n"
        "-- Belt and braces for the claim above: if a future change reintroduces a\n"
        "-- blanket grant anywhere, this still takes the two verbs away.\n"
        "revoke update, delete on audit_log from authenticated;",
        "grant select, insert, update, delete on all tables in schema public to authenticated;\n"
        "grant select on public_metrics to anon;\n"
        "grant usage, select on all sequences in schema public to authenticated;",
        "append-only grant survived",
    ),
    (
        "the history is no longer ordered newest first",
        None,  # handled below: this one lives in queries.ts
        "order by c.created_at desc, c.id desc",
        "order by c.created_at asc, c.id asc",
        "newest first",
    ),
]

QUERIES = os.path.join(ROOT, "packages", "db", "src", "queries.ts")


def needs_build(path):
    return path.endswith(".ts")


def build():
    p = subprocess.run(
        ["pnpm", "--filter", "@stratifypro/db", "build"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        shell=(os.name == "nt"),
    )
    return p.returncode == 0


def run_suites():
    """(ok, failing test names) across every suite.

    The reporter is pinned to TAP rather than left to default. Node picks its
    default from whether stdout is a terminal and from its own version, so the
    first draft of this parser matched the local run's spec-reporter lines and
    matched nothing at all on CI, where the same command emitted TAP. Every
    mutation was still detected by exit code, so the script reported that all
    of them were "caught by the wrong test" rather than reporting a broken
    parser.
    """
    ok = True
    names = set()
    for suite in SUITES:
        p = subprocess.run(
            ["node", "--test", "--test-reporter=tap", suite],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        out = p.stdout.decode("utf-8", "replace")
        found = {m.group(1) for m in re.finditer(r"^not ok \d+ - (.+?)\s*$", out, re.M)}
        if p.returncode != 0 and not found:
            raise RuntimeError(
                "%s failed but no TAP failure lines were parsed; output was:\n%s"
                % (suite, out[-2000:]))
        ok = ok and p.returncode == 0
        names |= found
    return ok, names


def read(path):
    return io.open(path, "r", encoding="utf-8").read()


def write(path, text):
    io.open(path, "w", encoding="utf-8", newline="\n").write(text)


def main():
    for suite in SUITES:
        if not os.path.exists(os.path.join(ROOT, suite)):
            print("  packages/db is not built; run pnpm --filter @stratifypro/db build")
            return 1

    targets = {RLS, AUDIT, INDEX, QUERIES}
    originals = {t: read(t) for t in targets}
    backups = {t: t + ".mutation-backup" for t in targets}
    for t in targets:
        shutil.copyfile(t, backups[t])

    failures = []
    try:
        ok, _ = run_suites()
        if not ok:
            print("  the suites are already red before any mutation; fix that first")
            return 1

        for label, path, pattern, replacement, expect in MUTATIONS:
            target = QUERIES if path is None else path
            original = originals[target]

            if pattern is None:
                mutated = "\n".join(
                    l for l in original.splitlines() if replacement not in l
                ) + "\n"
            else:
                if pattern not in original:
                    print("  STALE    %s" % label)
                    failures.append("%s: the text it mutates is no longer in the file" % label)
                    continue
                mutated = original.replace(pattern, replacement)

            write(target, mutated)
            if needs_build(target) and not build():
                print("  SKIPPED  %s (does not compile)" % label)
                failures.append("%s: the mutation does not compile, so it tests nothing" % label)
                write(target, original)
                build()
                continue

            ok, red = run_suites()
            if ok:
                print("  MISSED   %s" % label)
                failures.append("%s: no test noticed" % label)
            elif not any(expect in n for n in red):
                print("  WRONG    %s" % label)
                print("           expected a test naming %r; got %s" % (expect, sorted(red)))
                failures.append("%s: caught by the wrong test" % label)
            else:
                print("  caught   %s" % label)

            write(target, original)
            if needs_build(target):
                build()
    finally:
        for t in targets:
            shutil.copyfile(backups[t], t)
            os.remove(backups[t])
        build()

    if failures:
        for f in failures:
            print("  %s" % f)
        return 1
    print("  %d guarantees removed, %d caught" % (len(MUTATIONS), len(MUTATIONS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
