# Plan status

Which numbered steps of the implementation plan are actually done, as opposed to
claimed. Updated when a step lands. If this file and a commit message disagree,
this file is the one being maintained.

It exists because of a specific mistake, recorded below.

## Phase 2, started out of order and knowingly

| # | Step | Status |
|---|---|---|
| 2.1 | Clerk auth + Organizations | blocked, no credentials |
| 2.2 | Supabase schema + RLS | **policies built and proven, not deployed** |
| 2.3 | Check history, projects, per-seat usage | **queries built and proven, no UI** |
| R8 | Immutable audit log of administrative actions | **built, append-only enforced** |
| 2.4 | White-label report: firm logo, firm footer, no mention of us | done |
| 2.5 | Evidence bundle | built, **unsealed** |
| 2.7 | Scope of attestation stated verbatim | done, the bundle states it |
| 2A.3 | Supplier document to draft SBOM | csv, xlsx and PDF done |
| 2A.5 | CI guard: no model call reaches a severity or the attestation | done |
| 2.8 | Source escrow + continuity plan | **partial**, plan written, no escrow |
| 2.11 | Texas SB 2610 security program, mapped to CIS IG1 | **drafted, unsigned, unreviewed** |
| 2.9 | Written incident response plan | **partial**, never rehearsed |
| 2.10 | NIST SSDF self-attestation | **drafted, unsigned** |

**2.5 was built after all.** The gate below has still not passed; the
instruction to proceed was given three times and is recorded rather than
re-argued. What changed the priority is that 2.7 was stuck at partial for a
reason only 2.5 could fix: the attestation text existed, pinned to the
specification and guarded by a check, and was **stated to nobody**. A bundle is
where SPEC.md puts it. `stratifypro bundle <file>` now writes it, and an
end-to-end test asserts the wording lands in a file on disk rather than in an
export nothing calls.

The bundle does **not** contain the submitted file, and that is the design
rather than an omission: `attestation.txt` says the file was not retained, so a
bundle carrying it would make its own attestation false in the same directory.
What is recorded is the SHA-256, which is what lets a submitter prove later
that the artifact they hold is the one that was checked. A test asserts a
distinctive run of the real document appears in none of the five files.

It is **not sealed**, and the command says so every time it runs: the files
hash to what the manifest says, which detects accidental change, and nothing
in the directory proves who produced it. SPEC.md's VERIFY asks for
`cosign verify-blob` against a published key, which needs a key that does not
exist. The half underneath the seal is tested: alter one byte of any covered
file and verification fails, with the failure naming the file.

It is also deterministic. Two runs of the same check produce byte-identical
directories, because a customer comparing their eighteen-month-old copy against
a fresh one is the reason to keep an evidence bundle at all. Every object is
serialised with sorted keys, and the timestamp is an argument rather than a
clock read.

And the model containment wall declared `packages/ledger/src/bundle.ts` as the
evidence bundle route three changes before that file existed, reporting it as
"declared and waiting". It now guards real code.

**2.2 was not actually blocked on credentials.** It was recorded as blocked for
several days on the assumption that testing row-level security needed a
Supabase project. It does not. Row-level security is a Postgres feature, and
Supabase's `auth.jwt()` is an ordinary SQL function over the
`request.jwt.claims` session setting. `packages/db` defines the same function
the same way and runs the real migrations against PGlite, which is Postgres
compiled to WebAssembly, so SPEC.md's acceptance test runs on every CI job with
no account, no Docker and no network.

What is proven: a firm reading, writing, updating or deleting through the
`authenticated` role reaches zero rows of any other firm, across `firms`,
`projects`, `checks` and `evidence_bundles`. What is not: PostgREST's request
handling, Supabase's JWT verification, and storage rules. `connectionNotes()`
in `packages/db` prints that distinction at the top of every test run, so the
limit is stated where somebody reading a green suite will see it.

Two defects were found by running it rather than by reading it. The suite was
first written to connect as the table owner, which `enable row level security`
exempts; every isolation test passed without one policy being consulted. And
the `firms` policy called a helper that reads `firms`, which is infinitely
recursive. The usual fix for the recursion is to mark the helper
`security definer` so its read bypasses row-level security, which would have
quietly undone the `force` flag; the policy states its condition directly
against the token instead. `scripts/rls-mutation-test.py` weakens the policies
four ways and requires each weakening to be caught by the test that claims to
defend it.

It is **not deployed**. No Supabase project exists, so nothing has run these
migrations against a hosted database.

**2.3's queries exist and its screens do not.** SPEC.md 2.3 accepts on "a firm
sees its own checks only, sorted newest first", and that sentence is now proven
against real Postgres: check history, projects with their check counts, and
seat usage, each run as the `authenticated` role with the policies in force.
There is no interface on top, so the step is queries-and-proof rather than
done.

**No query takes a firm id, and that is the design.** SPEC.md's security table
has a row reading "No client-supplied `firm_id` trusted", and the natural way
to break it is an application helper like `checksFor(firmId)`: honest-looking,
easy to call, and the moment one caller passes a value from a request body
every policy in `0002_rls.sql` has been routed around by the application
itself. The queries name no firm, the policies resolve it from the verified
token, and a test greps every statement the package ships to confirm none of
them compares `firm_id` to a parameter.

Two choices worth stating because the alternative looked reasonable. A seat is
a person who has RUN a check, not a Clerk membership: counting memberships
bills a firm for the four people it added on the first afternoon and never
heard from again, and undercounting in the customer's favour is the safe
direction for a number that appears on an invoice. And `seats_used` is allowed
to exceed `seats`, because a firm over its allowance needs to see that it is
over.

### R8, and a control that was briefly off while looking correct

SPEC.md names an immutable audit log as the **compensating control** for the
fact that a one-person company cannot separate duties. Every framework asking
for segregation of duties assumes two people; when there is one, the honest
answer is not to claim the control but to record what the one person did in a
way that person cannot later alter.

**The control is the absence of a policy.** Row-level security denies by
default, so with it enabled and forced, an operation no policy permits is
refused. `audit_log` therefore has a SELECT policy and an INSERT policy and
deliberately no UPDATE and no DELETE policy. There is nothing to disable and no
flag to flip. A log the logger can edit is a diary.

That absence was undone within the hour by something that looked unrelated.
The test harness applies grants AFTER the migrations, and the grants said
`grant select, insert, update, delete on all tables in schema public`, which
handed back the two verbs the migration had just revoked. The migration still
read correctly in the repository; the control was simply off. Grants are now
written one table at a time, so a new table arrives with none and fails closed
rather than inheriting whatever the blanket line happened to say.

`scripts/rls-mutation-test.py` now removes seven guarantees rather than four,
including that one, and `scripts/check-rls-policies.py` reads the policy text
for a `for all`, `for update` or `for delete` policy on the audit log and
refuses it however correctly it is otherwise written.

**Gate 2 has not passed, and Phase 2 is being built anyway.** SPEC.md's Gate 2
is "the pilot firm runs it on a real client engagement and describes the
experience", and Step 11 says in terms: "Phase 2 only. Build nothing here until
Gate 2 has passed." No firm has been contacted, so the gate has neither passed
nor failed. This was raised and the decision was to proceed. It is recorded
here rather than discovered later.

Because of that, the work chosen first is the work that survives a "no" at the
gate: the report a firm hands over, and the wording that limits what it claims.
**2.5, the evidence bundle, is the step Step 11 explicitly gates, and it has
not been built.**

### 2.4, and the one thing branding cannot do

A firm supplies a name, a logo and a closing line, and may remove every mention
of StratifyPro. What it cannot remove are the two sentences that limit what the
document claims: that the report records what a named rule pack found in a file
presenting a given hash, and that no regulator has reviewed the tool. A white
label is a change of letterhead, not a licence to turn a conformance check into
an endorsement, and a test asserts those sentences survive every combination of
branding options.

The logo is validated rather than interpolated. The report is a standalone file
that gets emailed to a regulator and opened from disk, so a `javascript:` or
`data:text/html` value in `src` would be code execution in the reader's
browser, delivered by the firm, with the firm's name on it. Only an https URL
or a real image data URI is accepted; anything else renders no image at all
rather than a broken one.

### 2.11, and a hole I put there myself

`docs/security-program.md` maps this business against CIS Controls IG1. It is
unsigned for the reason the SSDF attestation is, and it carries a second
disclaimer the SSDF one does not need: **nobody qualified has confirmed that
Texas SB 2610 applies, which tier it would apply at, or whether this satisfies
it.** There is no company, which is also why 2.8's escrow is unsigned.

Two controls are met rather than partial, and they are the two that matter for
a software supplier: application software security and continuous vulnerability
management. That is not an accident of effort. The product is a conformance
checker, so the checks that keep it honest are the same discipline turned
inward.

Three are weak and the weakness is structural: training, penetration testing
and a rehearsed incident response all need somebody other than the author.

**A third status was introduced and immediately became a hiding place.** The
program needs to say that a business with no IT estate has no network to
monitor, which is `n/a` rather than `not met`, and the document says in terms
that "`n/a` is not a quieter way of writing `not met`". Then a mutation test
relabelled "Penetration testing: not met, none has been done" as "n/a, no
estate" and the checker **passed**.

Fixed with a pinned count rather than a cleverer rule, the same way
`scripts/check-copy.py` pins its string count. A script cannot judge whether a
control really applies, and a keyword list pretending to would look stronger
than it is. Widening a gap now means editing a number in the checker, in the
same commit, where somebody has to justify it.

### The dogfood, and a finding this project manufactured for itself

`docs/self-check.md`. A bill of materials for this repository, generated by
syft, checked by this tool, both committed and both regenerated by command.
**266 findings on 85 components**, and three rules fail on every single one:
Component Producer, Component Hash Value and Component License.

Fairly stated, and the fairness matters: **that is not syft's fault.** A pnpm
lockfile records names, versions and integrity hashes so installs resolve; it
does not record a producer or a licence per package. A generator reading a
lockfile cannot emit what the lockfile does not contain. The finding is about
the ecosystem, and it is the same thing the 21-file corpus says about other
people's projects, said about us.

Also worth saying: 266 findings and **zero** at severity error, which is
consistent. The CISA pack has no error-severity rule, because the minimum
elements document is not a regulation. `--fail-on error` exits 0 on this
document, and a reader should be told that rather than discover it.

**The first version of this manufactured one of its own findings.** The script
stripped `metadata.timestamp` to stop the file churning on every regeneration.
CISA-MD-006 requires an SBOM timestamp, so stripping it added a finding: 266
became 267, and the page would have published a failure caused by its own
post-processing and attributed it to the generator. Only the random
`serialNumber` is dropped now. A document about how honest a tool is cannot
manufacture the evidence.

### 2.8, and the licence gap it turned up

`docs/continuity.md` is written. The escrow agreement is not signed, because
SPEC.md requires it before the first paid contract and there is no paid
contract, and there is no company to hold one.

The document argues that escrow matters less here than it usually does: escrow
exists so a customer can reach source they cannot inspect, and this repository
is public under Apache-2.0, so the thing escrow normally protects is already in
their hands. Claiming escrow as the protection while the real protection is the
licence would be selling the wrong thing.

**That argument only holds if the licence is actually declared**, which is what
sent somebody to look. `LICENSE` is Apache-2.0 and GitHub reports it. **Not one
of the twelve package.json files in this workspace declared a licence field.**

That is not a nit. `cisa-2026-v2.1` contains CISA-CD-006, "Component License is
present, or explicitly unknown". An SBOM generated from this repository would
have failed this project's own rule on every component, and a checker for
exactly that failure is the product. Tooling reads the package.json field
rather than the file at the repository root, and a package with no license
field is treated as unlicensed, which means a consumer has no permission to use
it.

All twelve now declare Apache-2.0, and `scripts/check-own-licence.py` reads the
expected identifier out of the `LICENSE` file rather than hard-coding it, so
changing the licence cannot leave twelve manifests quietly claiming the old
one.

### 2.9 closes three SSDF gaps and leaves its own open

`SECURITY.md` exists, and GitHub private vulnerability reporting is enabled on
the repository, so a reporter does not have to find an email address or trust
that one is being read. That closes RV.1.2.

`docs/incident-response.md` commits to a 5-day breach notice and a
3-business-day CISA KEV disclosure, matching MC2 v2 clauses 33 and 35. Days for
the breach notice means calendar days, which is the stricter reading: a
supplier quietly reading five days as seven working days has taken an extra
weekend out of a customer's response time.

**The tabletop walkthrough has not happened**, which is half of 2.9's
acceptance, so RV.2.1 and RV.2.2 are partial rather than met. A plan nobody has
rehearsed is a document.

Those windows now appear in three files, so `scripts/check-commitments.py`
requires them to agree. Unlike most drift here this kind is contractual: a
questionnaire asks for these numbers by name. The check was wrong first in a
way worth recording, because it is the third instance of the same mistake this
session: it asked whether the phrase appeared anywhere in the file rather than
whether the row about that commitment carried it, so replacing the KEV row with
"as soon as practical" passed while "3 business days" still sat in the
acknowledgement row above it. Presence is not binding.

### 2.10 is drafted and deliberately not signed

`docs/ssdf-attestation.md` exists. Nobody has signed it, and the document says
so in its title.

A signed SSDF self-attestation is a representation by a named individual and
carries False Claims Act exposure under the CISA Secure Software Development
Attestation Form. That is why roughly half the practices are marked **not met**
rather than argued into a yes: nothing is signed or released, so PS.2.1, PS.3.1
and PS.3.2 all fail together; there is no `SECURITY.md` and no address to send
a vulnerability report to; no incident response process exists; and review is
real but not independent, because one person writes and reviews.

Every `met` row names the thing that makes it true, and
`scripts/check-ssdf.py` fails the build if that thing stops existing, if a met
row names nothing, or if the document quietly stops calling itself a draft.
Mutation-tested five ways, including flipping every not-met row to met, which
is refused.

The check itself got two things wrong first, both the same species: it tested
the wording instead of the property. It required the exact phrase "nobody has
signed it" and failed because the paragraph line-wrapped, and it failed the
build for the sentence "There is no `SECURITY.md`", which would have pushed the
document towards claiming the file exists. A check that punishes an honest gap
is worse than no check.

### 2A.3, the half that needs no model

SPEC.md records why this matters: 39 percent of surveyed firms never receive a
bill of materials from a supplier and only 2 percent always do. What arrives is
a document somebody retypes by hand into a format they then have to defend, and
no SBOM-specific extraction tool exists anywhere.

**Neither the csv nor the xlsx path needs a model.** A spreadsheet is already
structured; what it needs is a careful reader.

When csv shipped, this paragraph said xlsx and PDF were both unbuilt for the
same reason, that "an extractor that usually works is the exact shape of tool
this project refuses". That was right about PDF and **wrong about xlsx**, and
the distinction is worth stating rather than quietly correcting. An xlsx file
is a zip of XML with a defined schema: reading it is careful work. A PDF is a
page-description language where a table is lines and glyphs at coordinates, and
recovering columns from it is inference. One can be correct; the other can only
be usually right.

**PDF is now built, and that paragraph is still true.** What changed is not the
judgement, it is what the tool does with it. `packages/pdf` reads the file
exactly, and the one part that is inference is confined to a single file whose
output says so: a PDF draft reports how many columns it found, how many pieces
of text reached no column, and whether the document's own index had to be
rebuilt. The CLI prints that every run, including the sentence that these
columns are a reading of the page rather than a fact in it.

Three refusals carry the rest. A scan is refused by name, because a component
list produced by running optical character recognition over pixels is invented
content in a regulatory submission. An encrypted file is refused, because a
reader that ignored `/Encrypt` returns confident rubbish. A page with no
recurring column positions produces no components rather than a plausible list
assembled out of running prose.

Two producers were used for the fixtures rather than one, and the second earned
its place. Chrome writes PDF 1.4 with a classic cross-reference table; Excel
writes PDF 1.7 with cross-reference streams and object streams, and it clips
text that overflows a cell instead of shortening it. The Excel file is what
showed that sorting a line's text by horizontal position interleaves an
overflowing cell with its neighbours: the supplier of the first component came
out as "The OpenSSApL Pachrojece-2t.0". Nothing in the Chrome file could have
revealed that, because Chrome never overflows a cell. The fix was to stop
sorting and use the order the page draws its text in, which is how a producer
groups cells in the first place.

One test is worth more than the rest of them together: `supplier-sheet-excel.pdf`
is `packages/draft`'s own `supplier.xlsx`, printed by Excel. The same sheet is
read through both paths and the components must match. If the two disagree, one
of them is wrong, and that is the only check here that can say so.

The zip reader moved out of `apps/sync` into `packages/zip` to make xlsx
possible, because a package cannot depend on an app and the alternative was a
second copy of a parser whose entire job is to refuse a short read. Two copies
of that is how one of them quietly stops refusing.

The xlsx reader is tested against a workbook **openpyxl wrote**, not one
hand-assembled here, for the reason the advisory mirror's fixture is real: a
fixture built by the same person as the reader encodes their assumptions and
agrees with whatever the reader does. It contains a row with a missing
supplier, a row with no name, and a decoy second sheet.

The gap case is the one that matters. An empty cell is usually **absent** from
the XML rather than present and empty, so a reader taking cells in document
order shifts every later column left and puts the licence in the supplier
field. The table still looks fine. Cells are placed by their reference instead.

The parser is written properly rather than splitting on commas, because a
supplier sheet is the document that breaks a naive one. A licence field reading
`Apache-2.0, OpenSSL`, a component called `libcurl, bundled`, a note with a
newline in it: each shifts every later column by one, and the result is a draft
where versions sit in the supplier field. It still parses, still renders, and is
wrong about a device. Excel's byte order mark is stripped too, because without
that the first column is called `﻿name`, matches nothing, and a sheet from
Excel silently produces zero components.

**Nothing is invented.** No package URL is constructed from a name and a
version; one appears only when the supplier supplied one. A licence is recorded
as a `name` rather than an `id`, because `id` asserts the string is a valid SPDX
identifier and nobody validated it. Columns that were not understood, rows that
produced nothing, and rows with the wrong cell count are all reported rather
than dropped.

**"Never bundled" is enforced, not warned about.** 2A.3 accepts on "output
always labelled a draft. Never signed, never bundled, never filed without human
confirmation". A console warning does not travel with a file that gets emailed,
renamed and handed to another command a week later, so the marker lives in the
document and `stratifypro bundle` reads it back and refuses. A test renames a
draft to `final-approved-sbom.json` and confirms it is still refused.

The escape hatch is deliberate: remove the property and it bundles. A person
checks the draft against the source and takes responsibility. What must not
happen is that it slips through unnoticed.

### 2A.5, built before the thing it contains

The model tier is 2A.1 and does not exist. That is the right moment for a
containment test: one written afterwards has to be shaped around whatever was
already done, and every exception it grants is one somebody already depends on.

The wall fails the build if the model tier or any known model SDK is reachable
in the import graph from the severity assignment path, the attestation text, or
the evidence bundle route. The third does not exist yet and is declared anyway,
so the wall is standing when 2.5 arrives rather than being retrofitted around
it. Half of this bites today regardless of 2A.1: an `import OpenAI` anywhere
reachable from the severity path fails now.

Seen to fail, which is what SPEC.md 2A.5 actually asks for. Four plants: a
model SDK in the severity path, one in the attestation, the model tier reached
two hops away through `assert.ts` where a direct-import grep would see nothing,
and a fourth that **must still pass** because a model tier nothing protected
imports is exactly what 2A.1 will build. A guard that forbade the model
outright would be deleted the day somebody needed it.

The walker reports how many imports it resolved and names any it could not
follow rather than dropping them. The first run named six, all deep imports
into `packages/rules`, which ships data and has no `src/index.ts`. It would
have been easy to silence them; an import the wall cannot follow is a hole in
the wall.

### 2.7 is partial, and calling it done would have repeated this session's own criticism

The wording exists, is pinned character for character to SPEC.md, and is
guarded by a mutation-tested check. It is **stated to nobody**.
`attestationText` is exported and called by nothing, and the rendered report
contains no attestation. This file said "done" until a review of the pull
request asked who calls it, which is the same question that exposed
`packages/mirror` and `packages/vulnmatch` shipping with 254 tests and no way
for a person to reach them.

It is not wired into the report on purpose, because 2.4 and 2.7 pull against
each other. The attestation names StratifyPro, since it is a statement about
which engine produced the findings. 2.4 says a white-labelled report carries no
mention of us. Forcing the name into a document a firm has white-labelled would
break the promise 2.4 just made.

SPEC.md puts the attestation in two places, and neither exists yet: the
evidence bundle, which is Step 11 and gated behind Gate 2, and the terms, which
is 2.6 and needs a lawyer. So the text waits for one of those rather than being
pushed somewhere it creates a contradiction.

### The check itself, where a specification and a gate collided

SPEC.md Step 11 mandates the scope-of-attestation wording and marks it in bold
as not open to paraphrase. That wording uses "contained" and "signature", both
of which `docs/banned-phrases.txt` forbids, to say the **opposite** of a claim:
"not to what that artifact contained", and "it is not an electronic signature
within the meaning of 21 CFR 11.3(b)(7)".

A grep cannot tell a claim from its own denial. There were two easy ways out,
and both were wrong: paraphrase the text, which the specification forbids for
FTC Act reasons rather than stylistic ones, or exempt the file and lose the
check.

Instead the text lives alone in `packages/report/src/attestation.ts`, that one
file is excluded from the scan, and `scripts/check-attestation.py` replaces the
exclusion with something stricter. The rendered text must equal SPEC.md's
blockquote character for character, and neither banned word may appear in that
file outside the mandated wording. **Before this, the attestation was never
compared to the specification at all**, so the exemption is narrower than what
it replaces.

Both halves were mutation-tested. A paraphrase is refused with the exact
character that differs. A planted `SEAL_LABEL = 'a digital signature from
StratifyPro'` is refused by name, and the first version of that guard let it
through, because it only asked whether the word appeared somewhere in the
mandated text rather than whether this particular string was part of it.

## Phase 0, which was supposed to block everything

SPEC.md's Phase 0 is headed "No product code." Two of its tasks are marked
blocking, and line 794 repeats one of them: "Do not start Step 1 until
`docs/teardown.md` exists."

| # | Task | Status |
|---|---|---|
| 0.1 | Competitor teardown, a row per tool per finding class | **done late**, see below |
| 0.2 | Crosswalk repo public, CC BY 4.0 | done |
| 0.3 | Strip every CRA and refuse-to-accept claim | done in substance, see below |
| 0.4 | Google Workspace on `stratifypro.io` | **not done**, blocked on DNS |
| 0.5 | Email eight firms, tracked in `docs/outreach.md` | **not done**, no such file |
| 0.6 | Corpus of 20+ files with provenance | done, 21 files |
| 0.7 | Verify the CISA 2026 element list (blocking) | done, `docs/cisa-2026-elements.md` |
| 0.8 | Identifier coverage baseline | done, `docs/coverage-baseline.md` |

**0.1 was blocking and the build ignored it.** The engine, both rule packs, the
resolver, the benchmark, the crosswalk, the site, the advisory mirror and the
matcher were all built before anyone ran a competing tool once. The teardown now
exists, `verify.sh` gates on it, and the document says on its own first screen
that it arrived late. Recording that is cheaper than pretending the order was
followed.

What it found, having actually run the tools rather than assumed:

- **7 of the 16 `fda-524b` rules are asked by neither tool.** Level of support,
  end-of-support date, known vulnerabilities, justification for missing
  information, the form the SBOM is provided in, traceability to the threat
  model, and whether the document enumerates commercial, open-source and
  off-the-shelf components. Those are what a submission comes back over.
- **The third tool SPEC.md names does not exist.** There is no `sbom-tools
  --standard fda` on PyPI and no repository publishing that flag. The teardown
  was specified against an assumption about the market rather than a survey of
  it.
- **`sbomqs` evaluates no element of the CISA 2026 Practices group**, while
  reporting itself as "NTIA Minimum Elements (2026)". It covers the two data
  groups well. Coverage, Distribution and Delivery, Frequency, and Explicitly
  Identifying Unknown Information are the six-element group nobody checks.
- **One malformed field discarded a 1,160-component document.** `sbomqs`
  returned nothing at all for `spdx__grype-sbom.spdx.json` because a single
  `Originator` reads `Georg Brandl <georg@python.org>` without the `Person:`
  prefix SPDX 2.2 requires. The file is at fault and the tool is right to
  notice, but the user learns only that something somewhere failed to parse.
  This engine reads the same file and produces 3,484 findings.

**0.3 is done in substance and fails its own literal test.** The acceptance is
that `grep -ri "cyber resilience\|refuse to accept"` returns nothing outside a
historical note. It returns four files. All four are accurate citations rather
than claims: `fda-524b.json` explains that Refuse to Accept applies to statutory
absence and says in terms "Never describe a deficiency as a rejection", and
`build_crosswalk.py` cites the Federal Register notice and the CRA by its
regulation number. The grep is too blunt to tell a claim from a citation. The
acceptance test should be narrowed rather than the citations removed.

**0.5 has not happened and it is the one that matters.** Gate 1 is "one firm
agrees to a pilot on a live engagement", and its failure branch reads: "zero
replies after two follow-ups means the channel is wrong. Stop. Do not build."
No email has been sent, so the gate has neither passed nor failed. Everything
built so far has been built through a gate that was never opened.

## Phase 1, numbered as SPEC.md numbers it

SPEC.md is the authority. Every row below is its step and its acceptance test,
not a paraphrase.

| # | Step | Status |
|---|---|---|
| 1.1 | Monorepo scaffold, CI green on an empty build | done |
| 1.2 | `packages/engine` parse and detect both formats | done, **narrower than the acceptance** |
| 1.3 | Rule pack schema + loader with mandatory `severityJustification` | done |
| 1.4 | `cisa-2026-v2.1` pack, 17 fields + 6 practices | done |
| 1.5 | `fda-524b` pack, built against the teardown gaps | done |
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

**1.2 now meets its acceptance, and the route there is worth recording.** The
acceptance is "CycloneDX 1.4-1.7 and SPDX 2.2-3.0.1". This paragraph used to
say the acceptance was wrong and should be amended rather than met, because
3.0 is JSON-LD with an `@graph` and no `spdxVersion` key and the selectors
written for 2.x address nothing in it. An earlier build had accepted 3.0
documents and told their authors "this file parsed, but it lists no
components", which is false about the file, so the claim was withdrawn and
3.0 was refused by name.

It is met now because the reading exists rather than because the claim was
restored. `packages/engine/src/spdx3.ts` converts a 3.0 graph into the shape
the rules already read. The rules were left alone on purpose: each one maps to
a CISA element or an FDA expectation and asks a question about information,
not about syntax. "Does this document state who supplies each component" is
the same question whether the answer sits in `packages[].supplier` or behind a
`suppliedBy` reference to an Agent somewhere else in the graph. Teaching
thirty-nine regulatory rules a third file format would have put file syntax
into the artefact that holds regulatory meaning.

**The dangerous failure here is not a crash.** If the converter misses a field
the document really carries, every rule reading that field reports a missing
CISA element, and the report tells a supplier their submission is short of a
regulatory requirement when it is not. Three things guard it. The result
carries `normalisation`, naming every element type and package key the
converter did not use, so what was ignored is countable. A constructed pair
says the same SBOM in 2.3 and in 3.0.1 and a test requires identical findings
from both. And `scripts/spdx3-mutation-test.py` removes each mapping in turn
and requires the suite to notice, because an equivalence test is also
satisfied by two documents that both fail everything.

That guard earned itself immediately. The SPDX project's own 3.0.1 example
writes `originatedBy` as an array; the first draft of the converter read only
a scalar and silently dropped the originator from every package in the file.
Nothing but running it against a real document would have found it.

**1.5's second acceptance is met, and this paragraph said otherwise for
several changes after it stopped being true.** "Every rule in the pack maps to
a row in `docs/teardown.md`." That document now exists, `scripts/teardown.py`
generates it from tools that were actually run, and `verify.sh` fails the build
if any `fda-524b` rule has no row. The gate is mutation-tested: a planted rule
is refused by name.

The status was written when it was accurate, the work landed in a later change,
and nobody came back. In this file, which opens by promising to say which steps
are "actually done, as opposed to claimed". There is now a build gate for the exact
shape this rot took: `scripts/check-plan-status.py` fails when this document
reports a file absent while that file is sitting on disk.

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

`resolve` is now a CLI subcommand. It carried the note above for most of this
project's life: the resolver is what the benchmark is built on and what
publishes 441 `/name/<slug>` pages, and a person at a terminal could not reach
it. Third time this session that a capability existed everywhere except where
somebody could invoke it.

**An abstention exits 0.** "I do not know" is this product's most distinctive
output, and a nonzero exit would make every script wrapping the command treat
an honest answer as a crash. The next person would add `|| true` and lose the
failures that are real. A question that could not be asked, a missing name or
an unreadable dictionary, still exits nonzero.

`whyNot` and `METHOD_EXPLAINS` moved from `apps/web/app/resolver.ts` into
`packages/resolve`, because a second caller arrived and copying fourteen lines
into the CLI is how an explanation drifts into two versions of itself.

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
