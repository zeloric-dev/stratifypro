#!/usr/bin/env python3
"""Plant a model call inside the wall and watch it go red.

SPEC.md 2A.5 does not accept the guard existing. It says: "Then plant a
violating import and confirm it goes red", and under VERIFY: "the containment
test has been seen to fail."

FOUR PLANTS, AND THE LAST ONE IS THE POINT.

  direct SDK in the severity path        the blunt case
  direct SDK in the attestation          the other blunt case
  model tier reached transitively        the case a direct-import grep misses:
                                         check.ts imports assert.ts, and
                                         assert.ts imports the model tier
  a model tier that nothing protected    MUST STILL PASS. The wall is not "no
  imports                                model anywhere". 2A.1 exists to add a
                                         model tier, and a guard that forbade
                                         it outright would be deleted the day
                                         somebody needed it.

That fourth case is why this file exists rather than a grep for "openai". A
check that fails on legitimate work gets weakened, and a weakened wall is worse
than an honest absence of one.

    python3 scripts/model-boundary-mutation-test.py
"""
import io
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, "scripts", "check-model-boundary.py")

CHECK_TS = os.path.join(ROOT, "packages", "engine", "src", "check.ts")
ASSERT_TS = os.path.join(ROOT, "packages", "engine", "src", "assert.ts")
ATTEST_TS = os.path.join(ROOT, "packages", "report", "src", "attestation.ts")
MODEL_DIR = os.path.join(ROOT, "packages", "resolve", "src", "model")
MODEL_TS = os.path.join(MODEL_DIR, "index.ts")
RESOLVE_TS = os.path.join(ROOT, "packages", "resolve", "src", "index.ts")

MODEL_STUB = (
    "// A stand-in for the 2A.1 model tier, written by the mutation test.\n"
    "export const MODEL_TIER = 'stub' as const;\n"
)


def run_guard():
    r = subprocess.run([sys.executable, GUARD], cwd=ROOT, capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def main():
    code, out = run_guard()
    if code != 0:
        print("    FAILED: the wall is already red before any plant")
        print(out)
        return 1
    print("    ok   the tree as it stands has no model inside the wall")

    originals = {p: io.open(p, encoding="utf-8").read()
                 for p in (CHECK_TS, ASSERT_TS, ATTEST_TS, RESOLVE_TS)}
    failures = []

    def restore():
        for p, text in originals.items():
            io.open(p, "w", encoding="utf-8", newline="\n").write(text)
        shutil.rmtree(MODEL_DIR, ignore_errors=True)

    # (description, setup, must the guard refuse?, phrase the output must carry)
    def plant_sdk_severity():
        io.open(CHECK_TS, "w", encoding="utf-8", newline="\n").write(
            "import OpenAI from 'openai';\n" + originals[CHECK_TS]
        )

    def plant_sdk_attestation():
        io.open(ATTEST_TS, "w", encoding="utf-8", newline="\n").write(
            "import Anthropic from '@anthropic-ai/sdk';\n" + originals[ATTEST_TS]
        )

    def plant_transitive():
        os.makedirs(MODEL_DIR, exist_ok=True)
        io.open(MODEL_TS, "w", encoding="utf-8", newline="\n").write(MODEL_STUB)
        # check.ts imports assert.ts, so reaching the model tier from assert.ts
        # is two hops from the severity path. A direct-import scan sees nothing.
        io.open(ASSERT_TS, "w", encoding="utf-8", newline="\n").write(
            "import { MODEL_TIER } from '../../resolve/src/model/index.js';\n"
            + originals[ASSERT_TS]
        )

    def plant_legitimate_model_tier():
        # The model tier exists and is imported by the resolver's own entry
        # point, which is NOT one of the protected roots. This is what 2A.1
        # will actually do, and it must not fail the build.
        os.makedirs(MODEL_DIR, exist_ok=True)
        io.open(MODEL_TS, "w", encoding="utf-8", newline="\n").write(
            "import OpenAI from 'openai';\n" + MODEL_STUB
        )
        io.open(RESOLVE_TS, "w", encoding="utf-8", newline="\n").write(
            "import { MODEL_TIER } from './model/index.js';\n"
            "export const USES_MODEL = MODEL_TIER;\n" + originals[RESOLVE_TS]
        )

    PLANTS = [
        ("a model SDK in the severity path", plant_sdk_severity, True, "severity assignment reaches"),
        ("a model SDK in the attestation", plant_sdk_attestation, True, "attestation text reaches"),
        ("the model tier reached two hops away", plant_transitive, True, "reaches the model tier"),
        ("a model tier nothing protected imports", plant_legitimate_model_tier, False, None),
    ]

    try:
        for why, setup, must_refuse, phrase in PLANTS:
            restore()
            setup()
            code, out = run_guard()
            refused = code != 0
            if must_refuse and not refused:
                failures.append("NOT CAUGHT: %s" % why)
                print("    FAIL %s: the wall stayed green" % why)
            elif must_refuse and phrase and phrase not in out:
                failures.append("caught for the wrong reason: %s" % why)
                print("    FAIL %s: refused, but nothing said %r" % (why, phrase))
            elif not must_refuse and refused:
                failures.append("FALSE POSITIVE: %s" % why)
                print("    FAIL %s: refused legitimate work" % why)
                print("         " + out.strip().replace("\n", "\n         ")[:400])
            else:
                print("    ok   %s: %s" % ("refused" if must_refuse else "allowed", why))
    finally:
        restore()

    code, out = run_guard()
    if code != 0:
        failures.append("the tree did not come back clean after the plants")
        print("    FAILED: still red after restoring")
        print(out)

    print()
    if failures:
        for f in failures:
            print("    " + f)
        print("    FAILED: %d problem(s)" % len(failures))
        return 1
    print("    the wall was seen to fail on every violation, and to allow the model")
    print("    tier where it belongs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
