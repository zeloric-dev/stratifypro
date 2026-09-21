#!/usr/bin/env python3
"""Plant a network call in the matcher, and watch both halves of the guarantee fire.

Doc 6 step 2.1 accepts on one sentence: vulnmatch makes zero outbound per-query
calls in a full corpus run. Two checks defend it, and each is blind to what the
other catches:

  verify.sh          greps packages/mirror and packages/vulnmatch for network
                     primitives. Static, so it sees an import that is never
                     called and misses anything computed at runtime.

  offline.test.ts    disables every network entry point and runs all 5,088
                     corpus components through the matcher. Dynamic, so it sees
                     a computed call and misses a path this corpus never takes.

A check nobody has watched fail is a decoration. This repository has shipped
seven of those in a week, including a publish gate that reported clean four
times because the plants went into the working tree and the gate read
`git archive HEAD`. So each plant below is written to disk, the check is run,
the file is restored, and the REASON is asserted rather than just the failure:
a refusal for the wrong reason is a pass for the case you meant to cover.

    python3 scripts/mirror-mutation-test.py            both halves
    python3 scripts/mirror-mutation-test.py --static   the plants only

--static exists because verify.sh runs FIRST in CI, before anything is built,
and the runtime half needs compiled TypeScript. The full form runs in the build
job. Neither half is optional and neither is skipped quietly: --static says so
in its output.
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PATTERN = (
    r"(^|[^A-Za-z0-9_$])"
    r"(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts"
    r"|node:http|node:https|node:net|node:dgram|node:dns|node:tls)"
    r"([^A-Za-z0-9_]|$)"
)

SCANNED = [
    os.path.join("packages", "mirror", "src"),
    os.path.join("packages", "vulnmatch", "src"),
]


def scan():
    """The static check, reimplemented here so the test does not depend on bash."""
    hits = []
    for base in SCANNED:
        for dirpath, _dirnames, filenames in os.walk(os.path.join(ROOT, base)):
            for fn in filenames:
                if not fn.endswith(".ts") or fn.endswith(".test.ts"):
                    continue
                path = os.path.join(dirpath, fn)
                for i, line in enumerate(io.open(path, encoding="utf-8"), 1):
                    # Comment lines are excluded, exactly as verify.sh excludes
                    # them: this file has to name these identifiers to explain
                    # why they are banned.
                    if re.match(r"\s*(\*|//)", line):
                        continue
                    if re.search(PATTERN, line):
                        hits.append("%s:%d: %s" % (os.path.relpath(path, ROOT), i, line.strip()))
    return hits


# (description, file, line to append, what the static scan must report)
PLANTS = [
    (
        "a bare fetch in the mirror reader",
        os.path.join("packages", "mirror", "src", "purl.ts"),
        "const beacon = fetch;",
        "fetch",
    ),
    (
        "an aliased fetch, which a `fetch(` pattern would miss",
        os.path.join("packages", "vulnmatch", "src", "index.ts"),
        "const send = globalThis.fetch;\nexport const ping = () => send ('https://example.invalid');",
        "fetch",
    ),
    (
        "a node http import, which is how a server-side call gets under a fetch stub",
        os.path.join("packages", "mirror", "src", "ranges.ts"),
        "import { request } from 'node:https';",
        "node:https",
    ),
    (
        "a websocket, which is neither fetch nor http",
        os.path.join("packages", "vulnmatch", "src", "index.ts"),
        "const s = new WebSocket('wss://example.invalid');",
        "WebSocket",
    ),
]


def main():
    static_only = "--static" in sys.argv
    failures = []

    before = scan()
    if before:
        print("    FAILED: the tree already trips the static scan, before any plant")
        for h in before:
            print("      " + h)
        return 1
    print("    ok   the tree as it stands has no network primitive")

    for why, relpath, line, expected in PLANTS:
        path = os.path.join(ROOT, relpath)
        original = io.open(path, encoding="utf-8").read()
        try:
            io.open(path, "w", encoding="utf-8", newline="\n").write(original + "\n" + line + "\n")
            hits = scan()
            if not hits:
                failures.append("NOT CAUGHT: %s" % why)
                print("    FAIL %s: the scan reported clean" % why)
            elif not any(expected in h for h in hits):
                failures.append("caught for the wrong reason: %s" % why)
                print("    FAIL %s: caught, but nothing mentioned %r" % (why, expected))
            else:
                print("    ok   caught: %s" % why)
        finally:
            io.open(path, "w", encoding="utf-8", newline="\n").write(original)

    after = scan()
    if after:
        failures.append("the tree did not come back clean after the plants")
        print("    FAILED: the tree is still dirty after restoring")

    # The dynamic half. A planted call that the static scan catches proves
    # nothing about the runtime guarantee, so this runs the real offline test
    # and requires it to pass on the restored tree. It is the same test CI
    # runs; failing here means the acceptance sentence is false right now.
    dist = os.path.join(ROOT, "packages", "vulnmatch", "dist", "offline.test.js")
    if static_only:
        print("    --static: the runtime half runs in the build job, after pnpm build")
    elif not os.path.exists(dist):
        failures.append("offline.test.js is not built, so the runtime half was not checked")
        print("    FAILED: build @stratifypro/vulnmatch first")
    else:
        r = subprocess.run(
            [os.environ.get("NODE", "node"), "--test", dist],
            cwd=ROOT, capture_output=True, text=True,
        )
        if r.returncode != 0:
            failures.append("the offline corpus test does not pass")
            print("    FAIL the full corpus run is not actually offline")
            print(r.stdout[-1500:])
        else:
            print("    ok   the full corpus run makes zero outbound calls, with every")
            print("         entry point replaced by something that throws")

    print()
    if failures:
        for f in failures:
            print("    " + f)
        print("    FAILED: %d problem(s)" % len(failures))
        return 1
    print("    every planted network call was caught, and the runtime guarantee holds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
