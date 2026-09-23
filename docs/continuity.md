# What happens to you if we stop

SPEC.md 2.8, which calls this "the question that actually loses solo-founder
deals". It is the right description. A regulatory affairs consultancy putting a
tool in the path of a client's FDA submission is being asked to depend on one
person, and everybody in the room knows it.

**The escrow agreement is not signed.** SPEC.md 2.8 requires one before the
first paid contract, and there is no paid contract yet. That half is listed at
the end with the other gaps.

This document is the other half, and it is worth more than the escrow, because
it describes protection you have **today** rather than protection that arrives
when a lawyer has been paid.

## The short answer

Everything that produces an answer is public, licensed to you, and reproducible
on your own machine without us.

| | |
|---|---|
| Repository | <https://github.com/zeloric-dev/stratifypro>, public |
| Licence | Apache-2.0, in `LICENSE`, declared by all 12 packages |
| Rule packs | `packages/rules/packs/`, JSON, versioned |
| The engine | `packages/engine/`, zero runtime dependencies |
| Corpus | `fixtures/corpus/`, 21 real files with provenance and hashes |
| Benchmark | `bench/identity/`, dataset generator, runner and baselines |
| Every published figure | regenerable by a documented command |

Apache-2.0 includes a patent grant and survives us entirely. If this company
disappears tomorrow, the licence you have does not lapse, and nobody can
withdraw it.

## What that means concretely

**You can run the checks yourself.** `pnpm install && pnpm build` and the CLI
works offline. `stratifypro check <file> --pack fda-524b` produces the same
findings ours does, because it is the same engine and the same pack.

**You can verify our answers rather than trust them.** `bash verify.sh` runs
every check in this repository, including the ones that assert the published
numbers are reproducible. A claim of ours you doubt has a command attached.

**You can fork it.** The licence permits it and the repository has no private
build step. The rule packs are data, so a pack can be corrected by editing JSON
rather than by waiting for us.

**You can keep the advisory data.** `apps/sync` builds the mirror from public
OSV exports and the CISA KEV catalogue. Those sources are not ours and do not
depend on us existing.

## What you would actually lose

Said plainly, because a continuity plan that claims you lose nothing is one
nobody believes.

**Judgement.** The rule packs encode arguments about enforcement consequence,
written down in `severityJustification` on every rule. When the guidance
changes, somebody has to re-read it and decide what moved. A fork gets the
current answers, not the next ones.

**Maintenance of the data.** The end-of-support dataset has a weekly freshness
job, the advisory mirror has a rebuild path, and the alias dictionary grows as
components are confirmed. All of it keeps working; none of it updates itself.

**The paid layer, which does not exist yet.** The workspace, history and
evidence bundle are unbuilt. There is nothing there to lose and nothing there
to escrow.

## Why escrow adds less here than it usually does

Source escrow exists because a customer cannot see a vendor's source. It is a
promise that if the vendor dies, a third party will hand over what you could
never inspect.

**You can already inspect all of it.** The repository is public and the licence
is permissive, so the thing escrow normally protects is already in your hands.

The escrow agreement in SPEC.md 2.8 is still worth signing, for two reasons
neither of which is the source: it answers the question in the form a
procurement team expects to hear it, and it would cover the parts that are
genuinely not public, which today is nothing and in Phase 2 would be the
workspace and customer data.

Claiming escrow as the protection while the real protection is the licence
would be selling the wrong thing.

## If the one person is unavailable

There is one person. No rota, no second engineer, no escalation path, and
`docs/incident-response.md` says the same. Pretending otherwise in a
questionnaire would be a false representation.

What exists instead:

1. **Nothing needed to operate is only in that person's head.** Every check
   carries a written reason and, usually, the specific past failure that
   motivated it. `docs/plan-status.md` records where the process went wrong,
   including where its own headings were wrong.
2. **Nothing needed to operate is only on that person's machine.** The
   repository is the system. The one thing not in it is the advisory mirror,
   which is 297 MB of public OSV export rebuilt by one command.
3. **No credential is required to use what you have.** The CLI and the engine
   need no account, no key and no network.

## What is not done

1. **No escrow agreement is signed.** SPEC.md 2.8 requires one before the first
   paid contract. There is no paid contract.
2. **No named successor.** Nobody has agreed to take this on, and naming
   somebody who has not agreed would be worthless.
3. **No company.** There is no entity to hold an agreement, which is the real
   reason 1 has not happened.
4. **Nothing is released.** No npm package, no signed artifact, no versioned
   download. A fork today starts from a git clone, which works, and is not the
   same as a release you can pin.
