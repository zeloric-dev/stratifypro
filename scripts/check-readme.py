#!/usr/bin/env python3
"""The README describes the tool that exists, not the one it used to.

THE FRONT DOOR WAS BROKEN AND NOTHING NOTICED. The README's first code block
told a reader to run `npx stratifypro check sbom.json`. apps/cli is
`"private": true` at version 0.0.0 and has never been published to npm, so a
stranger's very first action failed. SPEC.md's Phase 1 gate is "a person who is
not the founder completes a resolution unaided", and the first instruction did
not work.

It also said "23 checks" when verify.sh had 34, listed five of twelve packages,
and named three of seven commands.

None of that is exotic. It is a document that was true when written and was
never revisited, which is the same rot scripts/check-plan-status.py exists for,
on the more visible file.

WHAT THIS CHECKS.

  1. Every `stratifypro <command>` the README shows is a real command.
  2. Every count it states matches what is actually there.
  3. It does not tell anyone to `npx` a package that is not published.
  4. Every path in its repository table exists.

WHAT IT CANNOT CHECK. Whether the prose is any good, whether the examples are
the right ones to lead with, or whether a stranger could actually follow it.
That last one needs a stranger, and SPEC.md's gate says so.

    python3 scripts/check-readme.py
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
README = os.path.join(ROOT, "README.md")
VERIFY = os.path.join(ROOT, "verify.sh")
CLI = os.path.join(ROOT, "apps", "cli", "src", "index.ts")
CLI_PKG = os.path.join(ROOT, "apps", "cli", "package.json")


def cli_commands():
    """The commands the dispatcher actually accepts."""
    s = io.open(CLI, encoding="utf-8").read()
    body = s[s.index("switch (args.command)"):]
    return {m for m in re.findall(r"case '([a-z-]+)':", body)} - {"--help", "-h"}


def verify_check_count():
    s = io.open(VERIFY, encoding="utf-8").read()
    return len(re.findall(r'^run "', s, re.MULTILINE)) + len(
        re.findall(r'^echo "--- ', s, re.MULTILINE)
    )


def is_published():
    d = json.load(io.open(CLI_PKG, encoding="utf-8"))
    return not d.get("private", False)


def main():
    if not os.path.exists(README):
        print("    FAILED: README.md does not exist")
        return 1
    text = io.open(README, encoding="utf-8").read()
    fail = 0

    # 1. Commands shown must exist.
    real = cli_commands()
    # BOTH INVOCATION FORMS. The first version matched only `stratifypro <cmd>`,
    # and then the README was rewritten to use `node apps/cli/dist/index.js
    # <cmd>` because the package is not published. The check went on passing
    # while validating ONE command instead of seven: a planted
    # `index.js sign` sailed through. The rewrite blinded the checker, and
    # nothing said so, because a check that finds nothing looks the same as a
    # check that finds nothing wrong.
    #
    # [ \t] rather than \s: `\s` crosses newlines, so "cd stratifypro" followed
    # by "pnpm install" on the next line read as the command `stratifypro pnpm`.
    shown = set(re.findall(r"(?:stratifypro|index\.js)[ \t]+([a-z-]+)", text)) - {"io"}
    if len(shown) < 3:
        print("    FAILED: only %d command(s) found in the README, which means this check"
              % len(shown))
        print("            is looking for the wrong invocation form rather than that the")
        print("            README is thin. Found: %s" % (", ".join(sorted(shown)) or "none"))
        fail = 1
    unknown = sorted(shown - real)
    if unknown:
        print("    FAILED: the README shows command(s) the CLI does not have: %s"
              % ", ".join(unknown))
        fail = 1

    # 2. Any stated check count must be the real one.
    actual = verify_check_count()
    for m in re.finditer(r"(\d+)\s+checks\b", text):
        stated = int(m.group(1))
        if stated != actual:
            line = text[: m.start()].count("\n") + 1
            print("    FAILED: README.md:%d says %d checks; verify.sh has %d"
                  % (line, stated, actual))
            fail = 1

    # 3. Do not tell anyone to npx an unpublished package. This is the one that
    #    actually cost a reader something.
    #
    #    Only inside fenced code blocks. An `npx` in prose is describing
    #    history, which this README now does deliberately; an `npx` in a code
    #    block is an instruction somebody will follow. The first version of
    #    this rule flagged the sentence explaining the fix, which is the third
    #    time this session a checker tripped on a document describing it.
    if not is_published():
        parts = re.split(r"```[a-z]*\n?", text)
        blocks = "\n".join(b for i, b in enumerate(parts) if i % 2 == 1)
        for m in re.finditer(r"npx\s+(?:-y\s+)?(@?stratifypro[a-z/-]*)", blocks):
            snippet = m.group(0)
            at = text.find(snippet)
            line = text[:at].count("\n") + 1 if at != -1 else 0
            print("    FAILED: README.md:%d tells a reader to `npx %s`, and apps/cli is"
                  % (line, m.group(1)))
            print("            private at version 0.0.0. It has never been published, so")
            print("            that is the first thing a stranger tries and the first")
            print("            thing that fails.")
            fail = 1

    # 4. Paths in the repository table must exist.
    #
    # FENCED BLOCKS ARE REMOVED FIRST, and without that this rule was blind.
    # A ``` fence is three backticks, so `([^`]+)` starts matching inside the
    # fence marker and pairs the wrong backticks from there on. Every inline
    # code span after the first fenced block was mispaired: of 58 backticked
    # tokens, exactly 2 survived as path-shaped, and they were `npx` and `to`.
    #
    # The rule reported "every path exists" while examining almost nothing,
    # which is the shape of failure this repository keeps meeting and the
    # reason every check here gets a planted violation.
    prose = re.sub(r"```[\s\S]*?```", "", text)
    missing = []
    for token in re.findall(r"`([^`]+)`", prose):
        t = token.strip()
        if not re.match(r"^[A-Za-z0-9_./-]+$", t):
            continue
        if "/" not in t and not t.endswith((".md", ".sh", ".json")):
            continue
        if t.startswith(("http", "pkg:")):
            continue
        # A leading slash is a route on the website, not a file. `/honesty` is
        # a page; apps/web/app/honesty is the file. Flagging the route would be
        # the check crying wolf on the first thing it was finally able to see.
        if t.startswith("/"):
            continue
        # Command fragments and globs are not paths.
        if " " in t or "*" in t:
            continue
        if not os.path.exists(os.path.join(ROOT, t.rstrip("/"))):
            missing.append(t)
    if missing:
        print("    FAILED: %d path(s) in README.md do not exist: %s"
              % (len(missing), ", ".join(sorted(set(missing)))))
        fail = 1

    if fail:
        return 1
    print("    README names %d command(s), all real; %d checks, matching verify.sh; "
          "every path exists" % (len(shown), actual))
    return 0


if __name__ == "__main__":
    sys.exit(main())
