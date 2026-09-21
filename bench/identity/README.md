# bench/identity

A public benchmark for resolving a free-text software component name to a canonical
identifier. CC BY 4.0.

No such benchmark existed when this was built. There is no dataset, no leaderboard and
no measured baseline anywhere for this task. The one public attempt to construct the
underlying PURL to CPE mapping is documented by its authors as having failed. The one
academic measurement of LLM component extraction, from a US Department of Energy
national security lab, reported recall 0.99 and precision 0.66 on a related task and
its own future-work section asked for a comparison between string similarity, an
embedding method and a generative model. **That comparison had never been run.** This
is it.

## Why this matters

A component that cannot be resolved to an identifier cannot be looked up in any
vulnerability database. It is invisible to every security tool. Measured across the
corpus in this repository, only **40.9 percent** of components carry a CPE, and since
NIST moved the National Vulnerability Database to risk-based enrichment on 15 April
2026, most new vulnerability records never receive one at all.

## The dataset

`dataset.jsonl`, 3,326 rows. Built by `build.py` from the held-out corpus files, deterministic from a fixed seed. Rebuild with `python3 bench/identity/build.py`, verify with `--check`.

| Class | Rows | What it is |
|---|---|---|
| Observed | 996 | Real component strings with their real PURL, taken straight from held-out corpus files |
| Perturbed | 2,080 | The same real names made realistically messy, with the same known-correct answer |
| Unknown | 250 | Names no resolver should answer. Included so a resolver is penalised for confident guessing |

The unknown class is 7.5 percent, up from 1.3. Two sources feed it: names that
appeared in a real SBOM carrying no identifier at all, and path-stripped names.
A supplier document frequently carries `groupcache` where the module is really
`github.com/golang/groupcache`, and the path cannot be recovered from the final
segment. A resolver that answers such a row is guessing, so the correct label is
unknown and the correct behaviour is abstention.

Perturbations are the six shapes that actually arrive in supplier documents: case
changes, spaces for separators, an archive extension, a trailing version, a vendor
prefix such as `lib` or `python-`, and a parenthetical such as `(FIPS)` or `(vendored)`.
Clean names are the easy case and are not what a resolver is for.

## The split, and why it is by file

`split.json` records it. Fourteen corpus files build the alias dictionary, seven are
held out for this benchmark, and they never overlap.

**The split is by file, not by component, on purpose.** The same package appears in many
SBOMs, so a component-level split would put near-identical rows on both sides and every
resolver would score its own training data. The first version of this dataset had that
flaw: the dictionary was built from all 21 files and would have reported 2,718 entries
of apparent coverage. Rebuilt honestly on the train split it has 1,854, and it covers
**9.1 percent** of names in the held-out files. That 9.1 percent is the real ceiling of
a dictionary approach on unseen software, and it is the number that justifies building
anything more.

## Baselines, measured

Run `python3 bench/identity/run.py --subset clean|perturbed|all`.

**Clean subset, 996 rows:**

| Resolver | Precision | Recall | F1 | Abstention | Unknown-class false positives |
|---|---|---|---|---|---|
| always-abstain | 0.0000 | 0.0000 | 0.0000 | 1.0000 | 0 |
| exact-match | 0.9762 | 0.0854 | 0.1571 | 0.9157 | 0 |
| normalised-match | 0.9773 | 0.0896 | 0.1641 | 0.9116 | 0 |
| prefix-strip | 0.9773 | 0.0896 | 0.1641 | 0.9116 | 0 |

**Full set including perturbations, 3326 rows:**

| Resolver | Precision | Recall | F1 | Abstention | Unknown-class false positives |
|---|---|---|---|---|---|
| always-abstain | 0.0000 | 0.0000 | 0.0000 | 1.0000 | 0 |
| exact-match | 0.9762 | 0.0267 | 0.0519 | 0.9747 | 0 |
| normalised-match | 0.9545 | 0.0751 | 0.1392 | 0.9272 | 4 |
| prefix-strip | 0.9600 | 0.0858 | 0.1576 | 0.9173 | 4 |

## What the numbers say

**Deterministic resolution is almost always right and almost never fires.** Precision
sits near 0.98 while recall sits below 0.09. Nine times in ten the dictionary has
nothing to say about a name it has not seen before.

**Messy input widens the gap, and separates the methods.** `exact-match` collapses to
F1 0.052 because it reverses nothing. `prefix-strip` reaches 0.158 and `normalised-match`
0.139, so harder normalisation does now buy something measurable, which it did not when
the perturbed rows were unanswerable.

**Two of the three baselines now guess on names that have no answer.** On the full set
`normalised-match` and `prefix-strip` each produce 4 unknown-class false positives.
They did not before, because the old unknown class was 37 rows drawn almost entirely
from one file and never exercised this behaviour. With 250 unknowns the benchmark finally
measures it.

That is the number that matters most. A resolver that invents an identifier for a name
with no answer is worse than one that resolves nothing at all, because the invented
identifier produces a confident wrong vulnerability verdict that a reviewer will act on.
Any model tier must reach zero here before its F1 is worth discussing.

**The target to beat is therefore not F1.** It is recall at precision ≥ 0.95 with zero
unknown-class false positives. A model tier that lifts recall to 0.30 while holding
precision above 0.95 is a real product. One that reaches F1 0.6 by guessing is not.

## Honest limitations

**The corpus is kinder than the population.** Mostly Go binaries and container images
from well-maintained generators. Published academic work finds far worse results in
Python and C, with component detection F1 as low as 13.2 percent for one common tool.

**The ground truth is the SBOM author's, not the world's.** A PURL recorded in a real
file is what the generating tool believed. Where it is wrong, this benchmark scores a
correct answer as wrong. Nobody has measured how often that happens.

**Perturbations are synthetic in shape, real in content.** The names and answers are
real; the specific mess is generated. Real supplier documents will contain shapes not
represented here. When real messy inputs become available they should replace these.

**The perturbed subset was mostly unanswerable until 20 September 2026.** Every
resolver, including the baselines built to reverse those shapes, scored F1 0.000 on it.
The generator took the last path segment before applying a perturbation, so
`github.com/golang/groupcache` became `groupcache 8.14.1` while the expected answer
still carried the path. 270 of the 270 rows whose original had a path lost it.

Fixed by `build.py`: perturbations now apply to the whole name and stay reversible, and
path-stripped inputs are labelled unknown, which is what they are. The perturbed subset
now separates resolvers instead of scoring them all at zero.

**The alias dictionary cannot represent an ambiguous name.** It is a flat map from name
to one identifier, so a name that exists in several ecosystems silently becomes whichever
one the builder saw. `semver` maps to `pkg:nuget/Semver` on a single observation, while
the benchmark expects `pkg:npm/semver`. Every dictionary-backed resolver, including all
three published baselines, therefore answers that row wrong rather than abstaining.

1,410 of the 1,854 entries, 76 percent, rest on a single observation. A confident wrong
identifier produces a confident wrong vulnerability verdict, which is the failure this
product exists to prevent, so the data model needs to express "this name is ambiguous"
rather than picking silently.

**The unknown class is 250 rows, 7.5 percent.** Up from 37, and still short of the 10 to
15 percent that would make abstention behaviour conclusive. Growing it further needs a
wider corpus, and specifically the population this product is aimed at: medical device
submissions are dominated by vendor SDKs, embedded RTOS components and proprietary
firmware, which is where genuinely unresolvable names live. Every corpus file here is
general open-source software.

**One ecosystem is missing entirely.** All thirteen SPDX files are 2.2. No SPDX 3.0 file
appeared in the source collection.

## Rules for this benchmark

1. **StratifyPro's own resolver is scored here like everything else and its numbers are
   published win or lose.** A benchmark whose author always tops it is marketing and is
   worth nothing as evidence.
2. **The dataset is built before any model tier exists.** Build the model first and you
   will tune the test to flatter it.
3. **Abstention is reported, never hidden and never counted as a miss.**
4. **Every number here is reproducible with one command by someone who does not work
   here.** If it is not, it is a claim and not a measurement.
