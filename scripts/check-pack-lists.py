#!/usr/bin/env python3
"""Every rule pack on disk appears in every hardcoded list of packs.

apps/web/app/packs.ts used to carry a docstring promising "a test asserts the
two agree". No such test existed. The CLI enumerates packages/rules/packs from
disk with readdirSync; a static site cannot, so the web app imports each pack by
name. That leaves three hand-written lists:

    apps/web/app/packs.ts          what /rules and /rules/<id> render
    apps/web/app/check.worker.ts   what the file checker can check against
    apps/web/app/FileChecker.tsx   what the pack selector offers

Add a third pack and the CLI picks it up, every one of those three silently
omits it, generateStaticParams never emits its rule pages, and nothing goes red.
This is the test the comment promised.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS_DIR = os.path.join(ROOT, "packages", "rules", "packs")
CONSUMERS = [
    "apps/web/app/packs.ts",
    "apps/web/app/check.worker.ts",
    "apps/web/app/FileChecker.tsx",
]


def main():
    if not os.path.isdir(PACKS_DIR):
        print("    skipped: no rule packs directory")
        return 0

    ids = sorted(f[:-5] for f in os.listdir(PACKS_DIR) if f.endswith(".json"))
    if not ids:
        print("    FAILED: no rule packs found, so this check proves nothing")
        return 1

    missing = []
    for rel in CONSUMERS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        text = io.open(path, encoding="utf-8").read()
        for pack_id in ids:
            if pack_id not in text:
                missing.append((rel, pack_id))

    for rel, pack_id in missing:
        print("    %s does not mention pack %s" % (rel, pack_id))

    if missing:
        print("    FAILED: %d pack(s) missing from a hand-written list" % len(missing))
        return 1
    print("    %d pack(s) present in all %d lists" % (len(ids), len(CONSUMERS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
