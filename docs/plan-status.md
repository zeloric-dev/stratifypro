# Plan status

Which numbered steps of the implementation plan are actually done, as opposed to
claimed. Updated when a step lands. If this file and a commit message disagree,
this file is the one being maintained.

It exists because of a specific mistake, recorded below.

## Phase 1, numbered as SPEC.md numbers it

SPEC.md is the authority. Every row below is its step and its acceptance test,
not a paraphrase.

| # | Step | Status |
|---|---|---|
| 1.1 | Monorepo scaffold, CI green on an empty build | done |
| 1.2 | `packages/engine` parse and detect both formats | done, **narrower than the acceptance** |
| 1.3 | Rule pack schema + loader with mandatory `severityJustification` | done |
| 1.4 | `cisa-2026-v2.1` pack, 17 fields + 6 practices | done |
| 1.5 | `fda-524b` pack, built against the teardown gaps | pack done, **second acceptance unmet** |
| 1.6 | `packages/report` renders standalone HTML, no network | done |
| 1.7 | `apps/cli` published to npm | **not done** |
| 1.8 | `apps/web` free checker at `stratifypro.io` | software done, **not at that domain** |
| 1.9 | A defective sample preloaded on arrival | done |
| 1.10 | Five-event instrumentation | **not done, and contradicts 1.8** |
| 1.11 | Sentry wired | **not done, and contradicts 1.8** |
| 1.12 | Run the engine over all corpus files, publish the results | done |
| 1.13 | `packages/resolve`, deterministic tiers only | done |
| 1.14 | `packages/vulnmatch`, PURL-native | done |
| 1.15 | `packages/eos`, provenance and capture date per row | done |
| 1.16 | `bench/identity` v0, dataset, runner, four baselines | done |

### The five that are not done, and why each one is not a typo

**1.2 is narrower than its acceptance says.** The acceptance is "CycloneDX
1.4-1.7 and SPDX 2.2-3.0.1". The engine supports CycloneDX 1.2 to 1.7 and SPDX
2.2 to 2.3, and **refuses SPDX 3.0 deliberately**: 3.0 is JSON-LD with an
`@graph` and no `spdxVersion` key, so the selectors written for 2.x address
nothing in it. An earlier build accepted 3.0 documents and told their authors
"this file parsed, but it lists no components", which is false about the file.
Refusing by name is the better failure. The acceptance test is the thing that
is wrong here, and it should be amended rather than met.

**1.5's second acceptance is unmet.** "Every rule in the pack maps to a row in
`docs/teardown.md`." That file does not exist. The pack was built against real
gaps, but the document that would let anyone check that claim was never
written, so right now the mapping is an assertion. Writing it needs the
teardown itself, which is research, not code.

**1.7 has not happened.** `apps/cli/package.json` is `"private": true` at
version `0.0.0`. The acceptance is `npx @stratifypro/cli check file.json` on a
clean machine, and nothing has ever been published to npm.

**1.8 is done as software and not as a URL.** "Fully client-side, network tab
shows zero requests after page load" holds, and `verify.sh` enforces it. The
site is live at its deployment address; `stratifypro.io` has Cloudflare
nameservers and no DNS records. Two records fix it, and neither token supplied
so far can write them.

**1.10 and 1.11 cannot both be built and leave 1.8 true.** 1.8 accepts on
"network tab shows zero requests after page load". 1.10 asks for five
instrumentation events and 1.11 asks for Sentry, and both of those are requests
after page load. This is a contradiction inside the spec, not an oversight in
the build: `verify.sh` currently fails the build if a network primitive reaches
the browser bundle, so wiring Sentry would turn the gate red by design. Somebody
has to decide which of the two promises wins. Until then, neither is built, and
that is a decision recorded rather than a task forgotten.

`resolve` is not yet a CLI subcommand, though the CLI has `check`, `explain`,
`packs` and now `advisories`. The library and the web app both use it; the
command is missing.

## The numbering in this file was wrong, and this is the correction

Until now the Phase 2 rows below were numbered from a planning document that is
not in this repository. SPEC.md, which IS in this repository and is the public
specification, numbers the same work differently:

| Work | SPEC.md | what this file used to call it |
|---|---|---|
| `packages/vulnmatch` | **1.14**, Phase 1 | 2.2, Phase 2 |
| `packages/eos` | **1.15**, Phase 1 | 2.3, Phase 2 |
| Clerk auth + Organizations | 2.1, Phase 2 | not listed |

Two consequences, and the second is the bad one.

A reader of the public repository could not resolve any Phase 2 number at all,
because the document those numbers came from is not published.

And this file said **"Phase 1 is complete"** while SPEC.md's own 1.14 and 1.15
were unbuilt. That is precisely the mistake this file exists to record, made in
the file that records it. Nobody was misled for long, because the next person to
look went looking. Again: luck, not a process.

The collision went further than Phase 2. This file's own Phase 1 table used the
other document's numbers too, so `1.12`, `1.14` and `1.15` each meant two
different things in one file:

| # | SPEC.md | what this file used to call it |
|---|---|---|
| 1.12 | Run the engine over the corpus, publish the results | the paste-a-name entry point |
| 1.14 | `packages/vulnmatch` | the file checker drop zone |
| 1.15 | `packages/eos` | `/honesty`, `/bench`, `/crosswalk`, `/rules/<id>` |

Commit messages before this point cite the old numbers and cannot be edited, so
the mapping stays here. The table above is now SPEC.md's numbering throughout.

`packages/mirror` and `apps/sync` are not a numbered step in SPEC.md. They are
how 1.14 is built: SPEC.md 1.14 says "OSV.dev and GitHub Advisory Database,
PURL-native", and querying an API per component would send a customer's bill of
materials to a third party one component at a time, before they have filed. The
mirror is the way to satisfy that step without that.

**The acceptance tests for the three steps just finished**, as SPEC.md writes
them:

| Step | Acceptance | Met? |
|---|---|---|
| 1.12 | `docs/corpus-results.md`, dated, reproducible by command | yes |
| 1.14 | Given a corpus file, returns advisories the file did not declare | yes |
| 1.14 | Every match carries its resolution provenance and confidence | yes |
| 1.15 | Covers the corpus | yes, and the 2.5% ceiling is published |
| 1.15 | Published free under CC BY at `stratifypro.io/eos` | yes, with the licence stated precisely |

**On that last one, read the page rather than the tick.** The end-of-support
rows are endoflife.date's, published by them under MIT, and they keep that
licence. What is released under CC BY 4.0 is the selection, the corpus matching
and the coverage measurement, which is the part that is ours. Claiming CC BY
over the whole thing would be relicensing somebody else's data.

### The thing no acceptance test stated

When `packages/mirror` and `packages/vulnmatch` first landed, **neither was
wired into anything**: not the CLI, not `packages/report`, not the web app.
2,000 lines and 254 tests, and the product a person could run was unchanged.

That is now fixed. `stratifypro advisories <file>` is the command, and
`apps/cli/src/advisories.e2e.test.ts` spawns the real binary rather than
importing the library, because this repository has already shipped a feature
that existed everywhere except where somebody could reach it: severity
overrides were in the spec, honoured by the engine, rendered by the report, and
had no flag.

A library nobody calls is a claim, not a capability. The corpus's largest file
now reports 39 affected components and 117 advisories it never declared.

1.15 first, out of order, because it is free and public like the crosswalk
rather than part of the paid layer, and because both packs already fire on the
gap it fills: FDA-SUP-001 and FDA-SUP-002 are the two largest finding groups in
the corpus.

Its coverage is 2.5 percent of component instances and that figure is published
with the data rather than buried. The only public source tracks products;
bills of material are made of packages.

The mirror and the matcher landed together because the mirror's whole point is
a sentence about the matcher: "vulnmatch makes zero outbound per-query calls in
a full corpus run". Building the index without the thing that queries it would
have left that sentence unprovable, which is the state this file exists to
prevent.

It is proved twice. verify.sh greps `packages/mirror` and `packages/vulnmatch`
for network primitives, and `scripts/mirror-mutation-test.py` plants four kinds
of outbound call and watches each one caught. Then `offline.test.ts` replaces
fetch, XMLHttpRequest and the node http, https, net, tls and dns entry points
with something that throws, and runs all 5,088 corpus components through the
matcher: 0 attempts, 87 ms.

### What the measurements said before any of it was built

| | |
|---|---|
| Corpus covered by five ecosystems | 4,815 of 5,088 instances, 94.6% |
| Raw OSV exports for those five | 297 MB |
| Compacted and gzipped | 12.8 MB |
| npm records that are actually vulnerabilities | 7,429 of 229,185, **3.2%** |
| Go affected-entries with an enumerated version list | 271 of 14,432, **1.9%** |

Each one changed the design. 297 MB rebuilt weekly cannot live in git, so the
mirror is built into a gitignored directory and the tests run against a 286 KB
committed fixture cut from a real one. The other 221,756 npm records are `MAL-`
malicious-package reports, so they are mirrored into separate files: a
malicious package in a device is worse news than a CVE, not lesser news, but
"checked against 229,000 npm advisories" would be true and would mislead every
reader of it. And Go, half the corpus, is unreachable by exact version
matching, which is why there is a real semver comparator written against the
specification clause by clause rather than a string compare.

### The third answer

`affected`, `clear`, `unknown`. Almost every scanner in this space collapses
the third into the second, and the collapse is invisible: a component with
nothing beside it looks identical whether it was examined and found fine or
never examined at all. `clear` is only returned when a comparison actually ran.
On the corpus that is 838 affected, 3,952 clear, 298 unknown, and the 298 are
mostly the 265 components that carry no package URL at all.

Maven and NuGet are answered by exact version lists, Go and npm by semver
ranges, and dpkg ordering is not implemented, so a Debian package whose
advisories carry only ranges abstains rather than being declared clean. 332
Go components were answered through their parent module, because OSV files Go
advisories by module and 72 percent of the corpus's golang purls do not say
whether they name a module or a package.

### What writing the mutation test found

The browser scan that guards "Your file is checked in this browser. It is never
uploaded." did not do what its own comment claimed. It excluded a preceding dot
to avoid matching property access, but property access is how an alias is
written: `const send = globalThis.fetch` planted in `apps/web/app/site-url.ts`
was **reported clean**, three lines under a comment asserting that exact case
was covered. Fourth time that check has been wrong, fourth time it reported
clean. It had never been watched failing.

## Phase 1 is not complete, and this heading used to say it was

Written when the free layer shipped, and wrong the moment it was written:
SPEC.md's Phase 1 runs to 1.16, and 1.12, 1.14 and 1.15 were all unbuilt. The
sentence below it is still true and is kept for that reason. The heading was
not.

What IS true: the repository is public at github.com/zeloric-dev/stratifypro
and the site is live. The benchmark, its generator, its baselines and this
resolver's own score are published together; so is the crosswalk, under CC BY
4.0.

What was not, when this heading was corrected: 1.12 had no
`docs/corpus-results.md`; 1.14 carried no resolution provenance on a match;
1.15 had no `/eos` route. All three are now done and the table at the top of
this file tracks them. SPEC.md's Phase 1 runs to 1.16, and 1.16, the identity
benchmark, was already built and published.

One thing is not done and it is not code: stratifypro.io has Cloudflare
nameservers and no DNS records, so the site answers at its deployment address
rather than at its own domain. Two records fix it.

The Phase 1 gate is unchanged and still unmet, by its own words: "a person who
is not the founder completes a resolution unaided, and says what it was like."
That number is zero. Everything above is what had to exist before it could stop
being zero.

## What the file checker turned up

(Numbered 1.14 in the old scheme, which is SPEC.md's `packages/vulnmatch`. The
work described below is the file checker drop zone.)

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
