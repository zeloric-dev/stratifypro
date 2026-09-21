# StratifyPro

Reads a software bill of materials and tells you what a reviewer will ask about it.
Resolves component names to canonical identifiers, or says plainly that it cannot.

No regulator has reviewed this tool. A rule passing does not mean a submission will be
accepted.

```bash
npx stratifypro check sbom.json --pack fda-524b
npx stratifypro explain FDA-STAT-001
npx stratifypro packs
```

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

`./verify.sh` is the gate. It re-runs the rule fixtures, the golden differential, the
benchmark generator, the coverage baseline, the interface copy, the design rules and more:
23 checks, and it is what CI runs first. If it prints anything other than `ALL CHECKS PASS`,
a claim somewhere in this repository is no longer true.

## How this repository is organised

| | |
|---|---|
| `packages/engine` | Rule evaluation. Zero runtime dependencies, runs in a browser tab |
| `packages/resolve` | Identity resolution, deterministic tiers, abstention |
| `packages/rules` | The rule packs, their schema, fixtures and golden results |
| `apps/cli` | The command line tool and its exit-code contract |
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

## Licence

Apache 2.0, except `docs/crosswalk` which is CC BY 4.0 and says so in its own directory.
