#!/usr/bin/env python3
"""Score this resolver against the benchmark and write what /bench publishes.

The baselines were always reproducible. This resolver's own score was not
published anywhere: verify.sh ran run.py without --predictions, so the number
the product is judged on existed only in whoever last ran it by hand.

Two steps, both other people's code:
  1. packages/resolve emits a prediction per benchmark row
  2. bench/identity/run.py scores it, using the SAME scorer that produced the
     published baselines

There is deliberately no scoring here. A second scorer would be two
implementations of this project's public credential, which is the drift the
crosswalk round-trip discipline exists to prevent.

  python3 scripts/bench-publish.py           rewrite bench/identity/published.json
  python3 scripts/bench-publish.py --check    fail if it would change
"""
import json
import io
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "bench", "identity", "published.json")
EMIT = os.path.join(ROOT, "packages", "resolve", "dist", "emit-predictions.js")
RUN = os.path.join(ROOT, "bench", "identity", "run.py")
SUBSETS = ["clean", "perturbed", "all"]
OURS = "stratifypro-deterministic"


def main():
    if not os.path.exists(EMIT):
        print("    FAILED: packages/resolve is not built, so there is nothing to score")
        print("    Run: pnpm --filter @stratifypro/resolve build")
        return 1

    preds = os.path.join(tempfile.mkdtemp(prefix="sp-bench-"), "preds.jsonl")
    with io.open(preds, "w", encoding="utf-8") as fh:
        r = subprocess.run(["node", EMIT], stdout=fh, stderr=subprocess.PIPE, cwd=ROOT)
    if r.returncode != 0:
        print("    FAILED: emit-predictions exited %d: %s" % (r.returncode, r.stderr.decode()[:200]))
        return 1

    out = {"subsets": {}}
    for subset in SUBSETS:
        scored = os.path.join(os.path.dirname(preds), "scored-%s.json" % subset)
        p = subprocess.run(
            [sys.executable, RUN, "--subset", subset, "--predictions", preds, "--out", scored],
            capture_output=True, text=True, cwd=ROOT,
        )
        if p.returncode != 0:
            print("    FAILED: run.py --subset %s exited %d" % (subset, p.returncode))
            print(p.stdout[-400:] + p.stderr[-400:])
            return 1
        out["subsets"][subset] = json.load(io.open(scored, encoding="utf-8"))

    # run.py prints "WARNING: N rows absent from the predictions file, scored as
    # abstentions. The file is stale or incomplete." and then exits 0. This
    # script captured stdout and printed it only on a non-zero exit, so the one
    # guard against publishing a degraded score was thrown away by the publisher.
    #
    # Measured: an emitter covering 1000 of 3326 rows produced F1 0.4327 against
    # a real 0.1609, run.py said BEATS the best baseline, and this script printed
    # "wrote published.json" and exited 0. Committed, /bench would have rendered
    # a winning number directly under the sentence "We lose on the headline
    # metric."
    for subset, rows in out["subsets"].items():
        for r in rows:
            n = r.get("predictionsMissing", 0)
            if n:
                print("    FAILED: %d of %d rows in subset %s are absent from the "
                      "predictions file" % (n, r["rows"], subset))
                print("    They were scored as abstentions, so this is not a measurement.")
                print("    Rebuild packages/resolve and run this again.")
                return 1

    text = json.dumps(out, indent=2, sort_keys=True) + "\n"

    if "--check" in sys.argv:
        if not os.path.exists(OUT):
            print("    FAILED: %s does not exist" % os.path.relpath(OUT, ROOT))
            return 1
        current = io.open(OUT, encoding="utf-8").read()
        if current != text:
            print("    FAILED: the published benchmark no longer reproduces")
            print("    Run scripts/bench-publish.py and read the diff before committing it")
            return 1
        # Counted, not asserted with `and`. This printed
        # `len(ours) and len(SUBSETS)`, which is Python's `and`: it evaluates to
        # 3 whenever `ours` is non-empty and 0 otherwise, so it could never
        # report anything but "3 of them" or "0 of them" however many subsets
        # actually carried our row. A gate whose job is asserting things should
        # not print a false one.
        scored_in = sum(
            1 for s in SUBSETS if any(r["resolver"] == OURS for r in out["subsets"][s])
        )
        if scored_in != len(SUBSETS):
            print("    FAILED: ours is scored in %d of %d subsets" % (scored_in, len(SUBSETS)))
            return 1
        print("    reproduces, ours scored in all %d subsets" % len(SUBSETS))
        return 0

    io.open(OUT, "w", encoding="utf-8", newline="\n").write(text)
    print("wrote %s" % os.path.relpath(OUT, ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
