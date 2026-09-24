#!/usr/bin/env python3
"""No private key material is tracked in this repository.

SPEC.md's security table has a row reading "No secrets in the repo". Until now
that was a policy with nothing enforcing it, which was survivable while nothing
here could produce a key. `stratifypro keygen` can, and the obvious accident is
now one keystroke wide: running it with `--out .` writes cosign.key into the
working tree, and the next `git add -A` commits a signing key to a PUBLIC
repository. .gitignore covers the names this tool writes; it does not cover a
key somebody renames, moves, or pastes into a fixture.

WHAT IT MATCHES IS A PEM BLOCK, NOT THE WORDS. `packages/ledger/src/seal.ts`
discusses private keys at length and must keep doing so. The check looks for
the opening line of an actual key container, which no amount of prose about
keys produces:

    -----BEGIN PRIVATE KEY-----          PKCS#8, what keygen writes
    -----BEGIN EC PRIVATE KEY-----       SEC1
    -----BEGIN RSA PRIVATE KEY-----      PKCS#1
    -----BEGIN OPENSSH PRIVATE KEY-----
    -----BEGIN PGP PRIVATE KEY BLOCK-----
    -----BEGIN ENCRYPTED PRIVATE KEY-----

ONLY TRACKED FILES ARE SCANNED, deliberately. An untracked key in a scratch
directory is a local matter; a tracked one is published the moment anybody
clones. Scanning the working tree instead would fire on every developer who
generated a key to try the feature, and a check that fires on correct behaviour
gets muted.

    python3 scripts/check-no-private-keys.py
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

KEY_BLOCK = re.compile(
    r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY(?: BLOCK)?-----"
)

# This file necessarily contains the pattern, in the docstring above and in the
# self-tests below. It is the only exemption and it is named rather than
# inferred from a path shape.
EXEMPT = {os.path.join("scripts", "check-no-private-keys.py")}

# (label, text, must_be_flagged)
SELF_TESTS = [
    ("a PKCS#8 key, which is what keygen writes",
     "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49\n-----END PRIVATE KEY-----\n", True),
    ("a SEC1 EC key", "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n", True),
    ("an RSA key", "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n", True),
    ("an openssh key", "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNz\n", True),
    ("an encrypted key", "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIFHD\n", True),
    ("a PGP private block", "-----BEGIN PGP PRIVATE KEY BLOCK-----\n", True),
    # The false positives that would get this check muted.
    ("prose about a private key", "The private key is never written into a bundle.\n", False),
    ("a public key, which is meant to be published",
     "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZI\n-----END PUBLIC KEY-----\n", False),
    ("a certificate", "-----BEGIN CERTIFICATE-----\nMIIDdzCC\n", False),
    ("a variable named privateKeyPem", "const privateKeyPem: string = read(path);\n", False),
]


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, stdout=subprocess.PIPE, check=True
    ).stdout
    return [f for f in out.decode("utf-8", "replace").split("\0") if f]


def self_test():
    bad = []
    for label, text, must_flag in SELF_TESTS:
        flagged = bool(KEY_BLOCK.search(text))
        if flagged != must_flag:
            verb = "was not flagged" if must_flag else "was flagged"
            bad.append("    the check is wrong: %r %s" % (label, verb))
    return bad


def main():
    broken = self_test()
    if broken:
        print("\n".join(broken))
        print("    the check does not work, so its verdict on the repository means nothing")
        return 1
    print("    %d key shapes planted, all sorted correctly" % len(SELF_TESTS))

    hits = []
    scanned = 0
    for rel in tracked_files():
        if rel.replace("/", os.sep) in EXEMPT:
            continue
        path = os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "rb") as fh:
                head = fh.read(2_000_000)
        except OSError:
            continue
        scanned += 1
        text = head.decode("utf-8", "replace")
        m = KEY_BLOCK.search(text)
        if m:
            line = text[: m.start()].count("\n") + 1
            hits.append("%s:%d: %s" % (rel, line, m.group(0)))

    if hits:
        for h in hits:
            print("    %s" % h)
        print("    PRIVATE KEY MATERIAL IS TRACKED IN THIS REPOSITORY.")
        print("    Treat it as disclosed: rotate it, then remove it from history.")
        return 1

    print("    %d tracked files, no private key material" % scanned)
    return 0


if __name__ == "__main__":
    sys.exit(main())
