# StratifyPro

SBOM conformance and component identity resolution, sold to FDA 524B consultancies.
Read `SPEC.md` before writing code. Section 12 is the build order.

## Commands

```
pnpm install             # bun is not used here. pnpm workspaces
pnpm -r build
pnpm -r test
pnpm -r typecheck
pnpm -r lint
pnpm bench:identity      # score resolvers against bench/identity
python3 scripts/coverage.py  # regenerate docs/coverage-baseline (no pnpm needed)
pnpm check <file>        # run the CLI against a file locally
```

## Layout

```
packages/engine      pure TS. zero runtime deps. no DOM, no node builtins
packages/rules       JSON rule packs + loader + schema
packages/resolve     component identity. deterministic tiers, then a model tier
packages/vulnmatch   cross-reference resolved components against advisories
packages/eos         end-of-support dates, PURL-keyed
packages/report      Finding[] to one standalone HTML string
apps/web             Next.js App Router, Vercel
apps/cli             npm-published CLI
bench/identity       the public benchmark: dataset, runner, baselines
fixtures/corpus      21 real SBOMs + provenance.json. do not edit these files
docs/                design.md, copy.md, coverage-baseline.md, teardown.md
```

Nothing flows upward. `engine` never imports from `apps` or from `resolve`.
The free browser checker ships `engine` and `rules` alone, so the engine must stay
usable with `resolve`, `vulnmatch` and `eos` absent.

## Rules that are not negotiable

These are in SPEC.md section 2.3. Repeated here because they are the ones most likely
to get eroded by a well-meaning refactor.

1. **Severity is configuration, never a constant.** Every default has a written
   justification inside the rule pack. The loader throws if one is missing.
2. **Every finding traces to a file path and a source clause.** No exceptions.
3. **No check ships until it has been seen to fail.** Every rule needs a fixture that
   triggers it. CI enumerates rules and fails on a missing fixture.
4. **AI proposes, rules decide.** The model tier may not be reachable from severity
   assignment or from the attestation text. There is a CI import test. Do not route
   around it.
5. **PURL first, CPE second.** Measured in this repo: 94.8% of corpus components carry
   a PURL, 40.9% carry a CPE. Since NIST's April 2026 change most new CVEs never get a
   CPE at all.
6. **Every resolution carries provenance and confidence.** A dictionary hit, a model
   suggestion and a human confirmation are three different facts.

## Words that fail the build

The list lives in exactly one place: **`docs/banned-phrases.txt`**. Read it. Do not
copy it into another file, because a second copy is a second policy that nobody
updates. `verify.sh` reads that file directly and fails the build on a match, and it
also fails if any phrase from it is restated **here**, in any case. `docs/copy.md` is
the one exception: its "Words to use instead" table has to name a banned word to give
the replacement, so it is pinned the other way round instead, by a check that every
word that table replaces is still banned.

Every entry in that file carries the reason it is there. The reasons run: we cannot
assert something no regulator has blessed, a checked file is never described as having
held particular content because we do not retain it, the integrity seal is not the thing
21 CFR 11.3(b)(7) reserves for an individual, medical devices sit outside the EU
regulation people assume covers them, and one FDA policy people still cite expired in
2023. Read the file for the exact wording.

This applies to UI copy, README files, marketing pages, error strings and code
comments. `docs/copy.md` has the approved wording for every string the user sees. Use
it verbatim rather than writing new prose.

## Rule pack conventions

- Rule ids: `{SOURCE}-{GROUP}-{NNN}`, for example `CISA-CD-005`, `FDA-STAT-001`.
- `severityJustification` and `sourceRef` are mandatory. The loader throws without them.
- A rule may only be `severity: "error"` if its source document has
  `normativeLanguage: true`. Today exactly one source qualifies: the statute at
  21 USC 360n-2. The CISA 2026 document uses "should" 66 times and "shall" zero times.
- The FDA pack checks the **October 2021 NTIA** baseline attributes, not the 2026 CISA
  elements, because the February 2026 FDA guidance still points at NTIA 2021. The two
  packs are different on purpose. Do not merge them.

## Testing

Vitest. The load-bearing job is the fixture check: it enumerates every rule in every
pack and fails if a rule has no `fail.json` that actually triggers it. Before trusting
any new check, delete a fixture and confirm CI goes red.

Snapshot tests run over `fixtures/corpus`. If a snapshot changes, that is a real
behaviour change. Read the diff before updating it.

## Style

- TypeScript strict. No `any` that survives review.
- No new runtime dependency in `packages/engine`. Ever. The zero-dependency property
  is what keeps the browser bundle small and the security review short, and a buyer
  will ask about it.
- Prefer the standard library, then a platform feature, then an existing dependency.
  A new package for what twenty lines covers is the most common kind of slop here.
- Errors name what went wrong and what to do about it. See `docs/copy.md`.

## Things that look like good ideas and are not

- Adding a JSONPath library. The subset used by the packs is about 120 lines and the
  zero-dependency property is worth more than the convenience.
- Letting a model set a severity, even "just as a suggestion". Rule 4.
- Storing the uploaded SBOM "temporarily, for debugging". It is never stored. The
  privacy claim in `docs/copy.md` has to stay literally true.
- Making the free tier worse to push upgrades. The free tier is complete and narrow
  on purpose.
- Writing new user-facing prose instead of using `docs/copy.md`.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool.
When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming -> invoke /office-hours
- Strategy/scope -> invoke /plan-ceo-review
- Architecture -> invoke /plan-eng-review
- Design system/plan review -> invoke /design-consultation or /plan-design-review
- Full review pipeline -> invoke /autoplan
- Bugs/errors -> invoke /investigate
- QA/testing site behavior -> invoke /qa or /qa-only
- Code review/diff check -> invoke /review
- Visual polish -> invoke /design-review
- Ship/deploy/PR -> invoke /ship or /land-and-deploy
- Save progress -> invoke /context-save
- Resume context -> invoke /context-restore
- Author a backlog-ready spec/issue -> invoke /spec
