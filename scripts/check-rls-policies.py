#!/usr/bin/env python3
"""No row-level security policy trusts anything a client can set.

SPEC.md's security table, the row "No client-supplied `firm_id` trusted", names
a grep test. packages/db/src/rls.test.ts already proves the behaviour: firm A
naming firm B's id in a WHERE clause gets nothing back. This is the other half,
and it is not redundant with it.

WHY BOTH. The behavioural test can only fail on a policy that exists and runs.
A policy added later that reads a request header would pass every test in that
file, because no test sends a header. This reads the policy text and rejects
the shape regardless of whether anything exercises it.

WHAT A CLIENT CAN SET. Under PostgREST the only trustworthy input is
`request.jwt.claims`, because PostgREST populates it from a token whose
signature it verified. Everything else in the `request.*` namespace comes
straight off the wire: `request.headers`, `request.cookies`, `request.path`,
`request.method`. A policy reading any of those is asking the attacker who they
are.

SECURITY DEFINER IS THE OTHER ESCAPE HATCH. A helper marked `security definer`
runs as its owner, and the usual reason to reach for it inside a policy is to
break a recursion by bypassing row-level security. The migrations FORCE
row-level security precisely so the owner is not exempt, so a definer helper
would undo the guarantee from inside the thing that states it.

THE CHECK IS SELF-TESTED. Eight policies that must be rejected and four that
must be accepted run on every invocation, because a checker that accepts
everything prints the same output as a clean tree.

    python3 scripts/check-rls-policies.py
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS = os.path.join(ROOT, "packages", "db", "migrations")

# Tables holding one firm's data. public_metrics is deliberately not here: it
# is world-readable by design and carries no customer data.
CUSTOMER_TABLES = ("firms", "projects", "checks", "evidence_bundles")

# The only session setting PostgREST fills from a verified signature.
TRUSTED_CLAIM = "request.jwt.claims"

# Everything else PostgREST exposes comes off the wire unverified.
CLIENT_CONTROLLED = (
    "request.headers",
    "request.cookies",
    "request.path",
    "request.method",
    "request.jwt.claim.",  # the deprecated per-claim form, easy to spell wrong
)

POLICY_RE = re.compile(
    r"create\s+policy\s+(?P<name>\w+)\s+on\s+(?P<table>\w+)(?P<body>.*?);",
    re.IGNORECASE | re.DOTALL,
)
USING_RE = re.compile(r"\busing\s*\((?P<expr>.*?)\)\s*(?=with\s+check|$|;)", re.IGNORECASE | re.DOTALL)
CHECK_RE = re.compile(r"\bwith\s+check\s*\((?P<expr>.*?)\)\s*$", re.IGNORECASE | re.DOTALL)


def strip_comments(sql):
    return "\n".join(re.sub(r"--.*$", "", line) for line in sql.splitlines())


def faults_in_expression(where, expr):
    """Everything wrong with one USING or WITH CHECK expression."""
    out = []
    flat = " ".join(expr.split())
    low = flat.lower()

    if low.strip() in ("true", "(true)"):
        out.append("%s is `true`, which is not a restriction" % where)
        return out

    for bad in CLIENT_CONTROLLED:
        if bad in low:
            out.append("%s reads %s, which the client controls" % (where, bad))

    # current_setting on anything but the verified claims.
    for m in re.finditer(r"current_setting\s*\(\s*'([^']+)'", low):
        if m.group(1) != TRUSTED_CLAIM:
            out.append("%s reads the session setting %r, which is not the verified token"
                       % (where, m.group(1)))

    if "auth.jwt()" not in low and "app_current_firm_id()" not in low:
        out.append("%s derives from neither auth.jwt() nor app_current_firm_id()" % where)

    return out


def audit(sql):
    """Every fault in one migration's policy text."""
    sql = strip_comments(sql)
    faults = []
    seen_tables = set()

    for m in POLICY_RE.finditer(sql):
        table = m.group("table").lower()
        if table not in CUSTOMER_TABLES:
            continue
        seen_tables.add(table)
        name, body = m.group("name"), m.group("body")
        u = USING_RE.search(body)
        c = CHECK_RE.search(body.rstrip())

        if not u:
            faults.append("%s on %s has no USING" % (name, table))
        else:
            faults += ["%s on %s: %s" % (name, table, f)
                       for f in faults_in_expression("USING", u.group("expr"))]

        if not c:
            faults.append("%s on %s has no WITH CHECK, so it filters reads and "
                          "permits a write into another firm" % (name, table))
        else:
            faults += ["%s on %s: %s" % (name, table, f)
                       for f in faults_in_expression("WITH CHECK", c.group("expr"))]

    # A helper used inside a policy must not bypass row-level security.
    for m in re.finditer(r"create\s+(or\s+replace\s+)?function\s+(\w+)(.*?)\$\$",
                         sql, re.IGNORECASE | re.DOTALL):
        if "security definer" in m.group(3).lower():
            faults.append("%s is SECURITY DEFINER, which bypasses the force flag"
                          % m.group(2))

    return faults, seen_tables


# (label, sql, must_be_rejected)
SELF_TESTS = [
    ("using true",
     "create policy p on checks for all using (true) with check (firm_id = app_current_firm_id());",
     True),
    ("with check true",
     "create policy p on checks for all using (firm_id = app_current_firm_id()) with check (true);",
     True),
    ("no with check",
     "create policy p on checks for all using (firm_id = app_current_firm_id());",
     True),
    ("reads a request header",
     "create policy p on checks for all using (firm_id::text = current_setting('request.headers')) "
     "with check (firm_id = app_current_firm_id());",
     True),
    ("reads an app-level session setting",
     "create policy p on checks for all using (firm_id::text = current_setting('app.firm_id')) "
     "with check (firm_id = app_current_firm_id());",
     True),
    ("the deprecated per-claim form",
     "create policy p on checks for all "
     "using (firm_id::text = current_setting('request.jwt.claim.firm_id')) "
     "with check (firm_id = app_current_firm_id());",
     True),
    ("derives from nothing",
     "create policy p on checks for all using (firm_id is not null) "
     "with check (firm_id is not null);",
     True),
    ("a security definer helper",
     "create function app_current_firm_id() returns uuid language sql security definer as $$ "
     "select 1 $$;",
     True),
    ("the real shape, via the helper",
     "create policy p on checks for all using (firm_id = app_current_firm_id()) "
     "with check (firm_id = app_current_firm_id());",
     False),
    ("the real shape, the firms base case",
     "create policy p on firms for all using (clerk_org_id = auth.jwt() -> 'o' ->> 'id') "
     "with check (clerk_org_id = auth.jwt() -> 'o' ->> 'id');",
     False),
    ("a policy on public_metrics, which is world-readable by design",
     "create policy p on public_metrics for select using (true);",
     False),
    ("a security invoker helper",
     "create function app_current_firm_id() returns uuid language sql "
     "stable security invoker as $$ select 1 $$;",
     False),
]


def self_test():
    bad = []
    for label, sql, must_reject in SELF_TESTS:
        faults, _ = audit(sql)
        rejected = bool(faults)
        if rejected != must_reject:
            verb = "was accepted" if must_reject else "was rejected"
            bad.append("    the check is wrong: %r %s" % (label, verb))
            if faults:
                bad.append("      %s" % faults[0])
    return bad


def main():
    broken = self_test()
    if broken:
        print("\n".join(broken))
        print("    the check does not work, so its verdict on the real policies means nothing")
        return 1
    print("    %d policy shapes planted, all sorted correctly" % len(SELF_TESTS))

    files = sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql")))
    if not files:
        print("    no migrations found at packages/db/migrations")
        return 1

    faults, covered = [], set()
    for path in files:
        f, tables = audit(io.open(path, "r", encoding="utf-8").read())
        faults += ["%s: %s" % (os.path.basename(path), x) for x in f]
        covered |= tables

    missing = [t for t in CUSTOMER_TABLES if t not in covered]
    if missing:
        faults.append("no policy at all on: %s" % ", ".join(missing))

    if faults:
        for x in faults:
            print("    %s" % x)
        return 1

    print("    %d customer tables, every policy derives from the verified token only"
          % len(CUSTOMER_TABLES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
