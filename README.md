# StratifyPro

Reads a software bill of materials and tells you what a reviewer will ask about it.
Resolves component names to canonical identifiers, or says plainly that it cannot.

No regulator has reviewed this tool. A rule passing does not mean a submission will be
accepted.

**Not published to npm yet**, so there is no `npx` one-liner. Clone it and build,
which takes about a minute:

```bash
git clone https://github.com/zeloric-dev/stratifypro && cd stratifypro
pnpm install --frozen-lockfile && pnpm build

node apps/cli/dist/index.js check fixtures/corpus/spdx__lab-syft.json --pack fda-524b
node apps/cli/dist/index.js resolve "openssl 1.1.1k.tar.gz"
node apps/cli/dist/index.js explain FDA-STAT-001
```

The README used to open with `npx stratifypro check sbom.json`. The package is
private at version 0.0.0 and has never been published, so the first thing a reader
tried was the first thing that failed. `scripts/check-readme.py` now fails the build
if this file tells anyone to install something that is not there.

## What it does

**Checks a document against a rule pack.** Two packs ship: FDA section 524B and the CISA
2026 minimum elements. Every rule names the clause it comes from and carries a written
argument for its severity, because a severity resting on nothing is the error this project
was built to avoid repeating. Run `explain <ruleId>` to read one.

**Resolves a component name to an identifier.** `openssl 1.1.1k.tar.gz` to
`pkg:deb/debian/openssl`. Deterministic tiers only, and it abstains rather than guess.

**Says what it did not check.** A component with no package URL and no CPE is invisible to
every advisory database. The tool counts those and says so rather than reporting a clean
result over them.

**Finds advisories, without sending your file anywhere.** `advisories <file>` answers from
a local mirror built by `apps/sync`. Querying an API per component would send a
manufacturer's bill of materials to a third party one component at a time, before they have
filed. Three answers, never two: affected, clear, and *not examined*, because a component
nobody could look up must not read as clean.

**Transcribes a supplier spreadsheet.** `draft <file.csv|file.xlsx>` turns the document a
supplier actually sends into a CycloneDX draft. No model is involved and no identifier is
invented. The output carries a property marking it a draft, and `bundle` refuses to make
evidence out of one.

**Produces an evidence bundle.** `bundle <file>` writes the report, the result, a manifest,
the scope of attestation and instructions for verifying it. The submitted file is **not** in
it: the attestation says the file was not retained, so a bundle containing it would make its
own attestation false.

All seven commands: `check`, `advisories`, `draft`, `bundle`, `resolve`, `explain`, `packs`.

## What it does not do

There is a whole page of this, with numbers: `/honesty` in the web app, or
[docs/coverage-baseline.md](docs/coverage-baseline.md) for the measurements behind it.
The short version:

- It matches nothing against advisory sources. It reads your file against a rule pack.
- It cannot tell you what is missing from a list it was handed.
- Its resolver declines to answer 92.2% of the time on the benchmark below. That is the
  cost of never giving a wrong identifier, and it is deliberate.

## The benchmark

`bench/identity` scores four baselines and this resolver on the same rows with the same
scorer. **Our F1 is below the best baseline** and the result is published anyway, because a
benchmark whose author always comes first is marketing and worth nothing as evidence.

| | precision | F1 | wrong on unknowns |
|---|---|---|---|
| StratifyPro | 1.000 | 0.1548 | 0 |
| prefix-strip | 0.960 | 0.1576 | 4 |
| normalised-match | 0.955 | 0.1392 | 4 |
| exact-match | 0.976 | 0.0519 | 0 |

The last column is the one that matters here. A confident wrong identifier produces a clean
vulnerability verdict for a component nobody identified.

Those figures are a snapshot of `bench/identity/published.json`, which is the file the
checks below reproduce. Two of them were mistyped in the first draft of this README, by
one digit each, which is the argument for reading them out of the file rather than off a
page.

```bash
python3 bench/identity/build.py --check      # the dataset regenerates
python3 scripts/bench-publish.py --check     # the scores reproduce
```

## The crosswalk

[docs/crosswalk](docs/crosswalk) maps the 50 G7 AI bill of materials minimum elements
against CycloneDX 1.7 and SPDX 3.0.1, element by element, with the gaps named. Data only;
no conformance policy is expressed. Released under CC BY 4.0, separately from the code.

## Running it

Requires Node 22, pnpm 12 and Python 3.12.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm ci          # typecheck, test, and the published benchmark
./verify.sh      # everything that can be checked, checked
```

`./verify.sh` is the gate, and it is what CI runs first. It re-runs the rule fixtures, the
golden differential, the benchmark generator, the coverage baseline, the interface copy and
the design rules. It also asserts that no network primitive can reach the browser checker or
the advisory matcher, that the attestation text matches the specification character for
character, that no model call can reach a severity assignment, and that this file is not
lying about the tool.

If it prints anything other than `ALL CHECKS PASS`, a claim somewhere in this repository is
no longer true.

Several of those checks are mutation-tested: a violation is planted and the check is watched
failing. A check nobody has seen fail is a decoration, and this repository has shipped a few
of those.

## How this repository is organised

| | |
|---|---|
| `packages/engine` | Rule evaluation. Zero runtime dependencies, runs in a browser tab |
| `packages/resolve` | Identity resolution, deterministic tiers, abstention |
| `packages/rules` | The rule packs, their schema, fixtures and golden results |
| `packages/report` | The standalone HTML report, and the attestation wording |
| `packages/mirror` | The local advisory index. No network primitive, ever |
| `packages/vulnmatch` | Components against the mirror. Three answers, never two |
| `packages/eos` | End-of-support dates, and how rarely one is available |
| `packages/ledger` | The evidence bundle |
| `packages/draft` | A supplier spreadsheet in, a CycloneDX draft out |
| `packages/zip` | Just enough of PKZIP to read an OSV export or a workbook |
| `apps/cli` | The command line tool and its exit-code contract |
| `apps/sync` | The only code here that touches the network |
| `apps/web` | The public checker. Files are checked in the browser and never uploaded |
| `bench/identity` | The benchmark, its generator and its baselines |
| `fixtures/corpus` | 21 real SBOMs from 13 generator versions |
| `scripts` | The checks `verify.sh` runs |
| `SPEC.md` | What was built and why, step by step |

## A note on the checks

Several of the scripts in `scripts/` have a mutation test beside them that plants a
violation of every rule and asserts each one fires. This is not decoration. Over this
project's history a check has reported clean while the property it asserted was false six
times: a malformed `sed`, a `\b` written into a file as a literal backspace byte, a scan
list that omitted the file that violated it, a substring comparison that a truncation
satisfied. Each was found by planting a violation and watching, and none by reading.

If you add a check here, add the test that proves it can fail.

## What is not done

This repository documents its own gaps rather than describing a finished product.

| | |
|---|---|
| `docs/plan-status.md` | Which steps are actually done, as opposed to claimed |
| `docs/teardown.md` | What the existing tools check, measured by running them |
| `docs/self-check.md` | What this tool says about its own bill of materials |
| `docs/ssdf-attestation.md` | NIST SSDF, unsigned, with half the practices marked not met |
| `docs/security-program.md` | CIS Controls IG1, unsigned and not legally reviewed |
| `docs/continuity.md` | What happens to you if this stops |
| `docs/incident-response.md` | Notification windows, and a plan nobody has rehearsed |

The shortest honest summary: nothing is released, nothing is signed, and no firm has used
this on a real engagement. `SECURITY.md` says how to report a problem.

## Licence

Apache 2.0, except `docs/crosswalk` which is CC BY 4.0 and says so in its own directory.
