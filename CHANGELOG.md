# Changelog

Phase 1 of the plan in `SPEC.md`: the free layer, built between 13 and 21 September 2026.

This file records what was built and, more usefully, what was found wrong while building
it. The defects are listed because most of them share one shape, and that shape is the
reason this repository has as many checks as it does.

## Phase 1

### 1.1 to 1.5, the engine

Rule evaluation with zero runtime dependencies, held to a Python reference implementation
by a golden artifact: 42 result files pinning 24,421 failing JSONPaths across 21 corpus
documents and 2 packs. The TypeScript engine must reproduce every one byte for byte.

The rule pack schema gained a required `onEmptySelector` and a justification for it. A
selector matching nothing is a third case, distinct from the two the spec named, and left
to an implementer it would have been guessed differently twice.

**CISA-PR-004 contradicted its own headline.** The rule searched the whole document for
the string `NOASSERTION` and reported 0 of 21 corpus files failing, while the published
figure said all 21 should. Measured: 12 of 13 SPDX files carry `NOASSERTION`, one of them
4,140 times. The headline was right and the rule was wrong.

### 1.6, severity overrides

A severity can be changed, with a written reason of at least 60 characters, and never
silently. Four conditions refuse the run outright; two record themselves as having changed
nothing.

**The feature existed everywhere except where someone could use it.** `SPEC.md` defined
`severityOverrides`, the engine honoured them, the report had a table for them, and there
was no flag. Adding it surfaced three silent failures already in the code, the worst being
that an override aimed at a rule which did not run left no trace at all.

**The inert-gate banner was blind to overrides.** It warned when a pack had no rule at the
`--fail-on` threshold, reading `pack.rules` directly. Overriding every error rule down to
warning produced a gate that could never fail, with the banner silent. Measured: exit 1
became exit 0 and nothing was said.

### 1.7 and 1.8, resolution and the benchmark

Deterministic tiers only, abstaining rather than guessing. Scored against four baselines
by `bench/identity/run.py`.

**The result is published although we lose.** F1 0.1548 against the best baseline's
0.1576. What the resolver wins is the unknown class: zero wrong identifiers against four.

**The dataset had no generator.** It arrived as a committed artifact with no way to
rebuild it, violating rule 4 of the benchmark's own README: a number nobody outside can
reproduce is a claim, not a measurement. Writing `build.py` grew it from 2,913 to 3,326
rows and moved the unknown class from 1.3% to 7.5%, at which point the perturbed subset
started discriminating between resolvers at all.

### 1.9, the report

Self-contained HTML, coverage before findings, no network request of any kind.

**A coloured accent rail shipped in it**, which the design brief had named as a giveaway in
the same document that specified the report.

### 1.12 to 1.14, the public checker

Paste a name and get an answer on first paint. Drop a file and it is checked in the
browser; the file never leaves the tab, and `verify.sh` refuses any network primitive in
code that reaches the bundle.

**Step 1.14 was claimed and never built.** A commit titled "Phase 1.12-1.14" shipped with
no file drop zone anywhere. `docs/plan-status.md` exists because of this.

**Step 1.2 was claimed and never enforced.** Its acceptance is "unsupported versions
refused by name". Nothing checked, so a CycloneDX 1.0 document would have been evaluated
with selectors written for 1.4 and reported as a clean pass.

**SPDX 3.0.1 was advertised and unreadable.** 3.0 is JSON-LD with no `packages` array. A
3.0 file was told it listed no components.

### 1.15, the public evidence routes

`/rules`, `/rules/<id>`, `/crosswalk`, `/bench`, `/honesty`. One rule is described in one
place: the CLI and the web page both walk the same field list and neither holds its own.

**`/bench` described 250 rows as 250 components**, overstating by seven times the one
measurement it claims to win. 36 are real components with no identifier; 214 are
path-stripped names derived from components that have one.

**`/honesty` had a false heading**, reading "most components cannot be identified from the
file alone" above a figure showing 94.8% carry a package URL. The premise had been assumed
rather than measured.

### 1.13, permanent URLs

443 prerendered, indexed pages, one per name with an answer.

**The URL did not give the name back.** Spaces became hyphens going in and every hyphen
became a space coming out, so 827 of 1,854 aliases were displayed, titled and described
under a name nobody had typed. The answer stayed correct throughout, because the resolver
normalises hyphens and spaces alike, which is exactly why nothing caught it.

## Checks that reported clean while the thing they checked was false

Six times, in one week. Each was found by planting a violation and watching, never by
reading the check.

| The check | Why it passed |
|---|---|
| No network call reaches the file checker | a malformed `sed` matched nothing |
| The same, second attempt | `\b` written into the file as a literal backspace byte |
| The same, third attempt | scanned `apps/web/app` while the bundle also pulls in `packages/*/src` |
| Interface copy matches the approved copy | substring comparison, so deleting half a sentence passed |
| The same | only two quote styles matched, so a double-quoted paraphrase was invisible |
| One rule is described in one place | the scan list omitted the file that violated it |
| Design rules | `*` treated as a comment marker when it is also the CSS universal selector |

Three of those are the same root cause: a regular expression written into a file through a
shell heredoc, where an escape was silently mangled. Twice as a backspace byte, once as a
literal newline inside a character class. Each produced a pattern that matched nothing and
a check that printed a reassuring line.

Every check that can be mutation-tested now is, and the mutation test runs **before** the
check it proves, for the same reason the rule pack validator is proved before the packs
are validated with it.

## Measurements published

- **Identifier coverage** across 21 real SBOMs, 5,088 components: 94.8% carry a package
  URL, 40.9% a CPE, 5.1% a supplier. Counting rules stated in `scripts/coverage.py`;
  `NOASSERTION` and `NONE` are not values.
- **Identity benchmark**, 3,326 rows, four baselines plus this resolver, one scorer.
- **AI SBOM crosswalk**, 50 G7 minimum elements against CycloneDX 1.7 and SPDX 3.0.1,
  CC BY 4.0.
