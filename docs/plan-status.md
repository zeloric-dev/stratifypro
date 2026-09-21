# Plan status

Which numbered steps of the implementation plan are actually done, as opposed to
claimed. Updated when a step lands. If this file and a commit message disagree,
this file is the one being maintained.

It exists because of a specific mistake, recorded below.

## Phase 1: the free layer

| # | Step | Status |
|---|---|---|
| 1.1 | Scaffold all eight packages, CI green | done |
| 1.2 | `packages/engine`: parse and detect both formats | done |
| | its acceptance, unsupported versions refused by name | done, was never implemented until 1.14 needed it |
| 1.3 | Rule pack schema requires `onEmptySelector` plus justification | done |
| 1.4 | `packages/engine`: evaluate, a finding per failing node with its path | done |
| 1.5 | Differential oracle, golden artifact per corpus file and pack | done |
| 1.6 | Overrides with a required reason, recorded in `CheckResult` | done, merged in #11 |
| 1.7 | `packages/resolve`: deterministic tiers only, with abstention | done |
| 1.8 | `bench/identity` runner, single implementation | done |
| 1.9 | `packages/report`: aggregated findings, coverage header first | done |
| 1.10 | `apps/cli`: `check`, `explain`, `packs`, exit codes, `--fail-on` | done |
| 1.11 | Stable error codes and a docs URL on every user-facing error | done |
| 1.12 | `apps/web`: the paste-a-name entry point, answered on first paint | done |
| 1.13 | Permanent URL per resolution, prerendered and indexable | done |
| 1.14 | The file checker, drop zone below the findings | done |
| 1.15 | `/honesty`, `/bench`, `/crosswalk`, `/rules/<id>` | done |
| 1.16 | Design enforcement check in `verify.sh` | done, 7 rules, every one mutation-tested |
| 1.17 | Verbatim copy check | done, `scripts/check-copy.py`, whole-cell match |
| 1.18 | Publish: repository public, benchmark and crosswalk released | prepared: site deployed, public repo built and verified, awaiting DNS and the visibility flip |

`resolve` is not yet a CLI subcommand, though step 1.10 lists it. The library and
the web app both use it; the command is missing.

## What 1.14 turned up

Building the file checker required a version check that step 1.2 claims to have.
Its acceptance test is "unsupported versions refused by name, not generically",
and nothing enforced it: `detectFormat` returned whatever version string it
found and every rule then ran regardless. A CycloneDX 1.0 document would have
been checked with selectors written for 1.4 and reported as a clean pass. Both
the CLI and the browser refuse it now, by name.

Step 1.17 landed with 1.14 rather than after it. The file checker is the first
thing to use `docs/copy.md`, and a copy module with no check against the
document it copies would have started drifting on the day it was written.

The severity of this pattern is worth naming, since it is now three for three:
1.14 was claimed and not built, 1.2 was claimed and not enforced, and 1.16 was
claimed with half its checks. In every case the code looked finished.

Adversarial review of the merged 1.14 commit then found three more checks in
the same state, two of them checks written in that very commit to prevent this:

- `scripts/check-copy.py` compared substrings, so TRUNCATING the privacy line
  to "Your file is checked in this browser." passed. The promise the free tier
  rests on could be deleted with the check green. It also read only single
  quotes and backticks, so a double-quoted `"...A copy is kept for debugging."`
  was invisible and the page could say the opposite of the claim.
- The no-upload check scanned `apps/web/app` and matched the literal `fetch(`.
  `next.config.mjs` transpiles `@stratifypro/engine` into the bundle, so a POST
  of the parsed SBOM planted in `packages/engine` reported clean, as did an
  aliased call inside the scanned directory. That check had already been fixed
  twice and announced as fixed. It had been narrowed, not fixed.

1.16 is closed now, and closing it found a fourth instance of the same thing at
one level down. The `drop-shadow` rule was written as `box-shadow\s*:\s*(?!none)`,
where `\s*` backtracks to zero width so the lookahead lands on " none" instead
of "none". It flagged `box-shadow: none`, which is the line that REMOVES a
shadow. Nothing would have caught that except the half of the mutation test that
asserts deliberately-allowed near misses still pass, and that is the half anyone
under time pressure leaves out.

## The mistake this file exists for

Commit `87e9b98` is titled "Phase 1.12-1.14". Step 1.14 was not implemented in
it and is not implemented now: there is no file drop zone anywhere in
`apps/web`, and no summary bar showing ran, skipped and not applicable.

Nobody was misled for long, because the next person to look went looking for the
drop zone. That is luck, not a process. A commit message is immutable and gets
read by people deciding what is already handled, so the correction lives here,
where the answer is maintained.

The parallel is not subtle. This repository's argument is that a tool which
reports something it did not check is worse than one that reports nothing, and
section 5.6's standard is that a rule nobody checks does not exist. A plan step
nobody checks is in exactly the same position. Steps 1.13 and 1.16 are marked
partial above for the same reason: both were treated as finished, and neither
meets the acceptance test written next to it in the plan.
