#!/usr/bin/env bash
# Everything in this repo that can be checked, checked. Run before trusting anything.
# CI runs this. Exit nonzero means a claim in the spec is no longer true.
set -uo pipefail
fail=0
run() { echo "--- $1"; shift; "$@" || { echo "    FAILED"; fail=1; }; }

run "rule packs validate against the schema" \
    python3 packages/rules/src/validate.py packages/rules/packs/cisa-2026-v2.1.json packages/rules/packs/fda-524b.json
run "the validator is not blind (mutation test)" \
    python3 packages/rules/src/mutation-test.py
run "every fail fixture fires, no rule fires on its pass fixture" \
    python3 packages/rules/src/reference-engine.py
# The fixture check above proves each rule CAN fire. It does not prove WHICH
# nodes it fires on, and the engine contract is one Finding per failing node
# with its exact JSONPath. The golden artifact pins that: 21 corpus files by 2
# packs, every failing path recorded. The TypeScript engine must reproduce
# these byte-identically, which is how the fixture claim transfers to the
# implementation that actually ships.
run "golden results reproduce byte-identically (reference oracle)" \
    python3 packages/rules/src/reference-engine.py --check-golden
# The baselines were always reproducible. The dataset they are measured on was
# not: it arrived as a committed artefact with no generator anywhere in the
# repository's history, so nobody, including its author, could rebuild it.
# Rule 4 of bench/identity/README.md says a number that is not reproducible by
# someone who does not work here is a claim and not a measurement.
run "benchmark dataset reproduces from its generator" \
    python3 bench/identity/build.py --check
run "benchmark baselines reproduce" \
    python3 bench/identity/run.py --subset clean
# NOT HERE, AND THE REASON IS WORTH READING. bench/identity/published.json is
# what /bench renders, and reproducing it means running this resolver over every
# benchmark row, which means built TypeScript. This script is deliberately
# Python and git only: it runs first in CI and gates the build job, so it cannot
# depend on that job's output without a cycle.
#
# scripts/bench-publish.py --check therefore runs as a step in the build job,
# after pnpm build, and in `pnpm ci` locally. It is not skipped and not
# optional; it is in the other gate. This comment exists so that nobody reading
# verify.sh concludes the published benchmark is unchecked.

run "structural claims hold (counts, severities, split, no leakage)" \
    python3 scripts/check-claims.py
# Offline on purpose. The dataset is committed; --refresh is the only thing
# that touches the network, and verify.sh must keep running on a machine that
# has none. What this asserts is that every row states where it came from and
# when, and that the coverage figure is the corpus rather than a number somebody
# typed: it is the figure a reader is most likely to quote and the one it would
# be most tempting to leave generous.
run "the end-of-support dataset states its sources and its reach"     python3 scripts/eos-build.py --check

run "coverage baseline regenerates from the corpus" \
    python3 scripts/coverage.py --check

# SPEC.md 1.12 accepts on "docs/corpus-results.md, dated, reproducible by
# command". This is the reproducible-by-command half, and it runs here rather
# than in the build job because it reads the golden artifact rather than
# re-running the engine. The golden results are themselves checked
# byte-for-byte a few lines above, so a table that matches them matches the
# engine, and a published results table cannot drift from the tool it
# describes without one of the two failing.
run "the published corpus results are the engine's own output" \
    python3 scripts/corpus-results.py --check

# SPEC.md 0.1 is the competitor teardown, marked "Blocking: no build starts
# until this exists", and it did not exist until long after the build started.
# SPEC.md 1.5's second acceptance is "every rule in the pack maps to a row in
# docs/teardown.md", which nothing enforced either.
#
# Offline: the tools were run once and their output is committed at
# docs/teardown-data/. This regenerates the document from that data and fails
# if it has drifted, and fails if any fda-524b rule has no row. Adding a rule
# to the pack without saying whether anyone else checks it now breaks the
# build, which is the only way that claim stays true.
run "every FDA rule has a row in the competitor teardown" \
    python3 scripts/teardown.py --check

run "the web app's copy is the approved copy, not a paraphrase"     python3 scripts/check-copy.py

echo "--- the file checker cannot upload anything"
# "Your file is checked in this browser. It is never uploaded." is a verbatim
# string from docs/copy.md and it is the free tier's entire proposition. It is
# also the easiest promise here to break by accident: one analytics call, one
# error reporter, one "just POST the findings so we can debug it" and the
# sentence is a lie while every test still passes. CLAUDE.md names the exact
# temptation: storing the uploaded SBOM "temporarily, for debugging".
#
# THIS CHECK HAS BEEN WRONG FOUR TIMES AND EACH TIME IT REPORTED CLEAN.
#   1. A malformed sed printed errors and matched nothing.
#   2. A \b written into the file as a literal backspace byte matched nothing.
#   3. It scanned only apps/web/app and matched only the literal `fetch(`.
#      apps/web/next.config.mjs sets transpilePackages for @stratifypro/engine
#      and @stratifypro/resolve, and check.worker.ts imports both, so a fetch in
#      packages/engine SHIPS INTO THE WORKER. A POST of the parsed SBOM planted
#      in packages/engine/src/coverage.ts was reported clean.
#   4. The fix for 3 did not do what its own comment claimed. It excluded a
#      preceding dot, as `[^A-Za-z0-9_$.]`, to avoid matching property access.
#      But property access IS how an alias is written. `const send =
#      globalThis.fetch` followed by `send(url, {method:"POST"})` was planted in
#      apps/web/app/site-url.ts and REPORTED CLEAN, while the comment three
#      lines above asserted that exact case was covered. Found by writing the
#      mutation test for the Phase 2 matcher and running it against this
#      pattern; nothing else would have found it, because the check had never
#      been watched failing.
#
# So: scan everything that can reach the bundle, and match the bare identifiers
# rather than a call shape. An alias still has to name the function once, and
# naming it through a property access now counts.
#
# Coarse, and it knows it. `globalThis["fetch"]` would still slip through. It
# catches the blatant cases, which are the ones that actually happen.
# scripts/mirror-mutation-test.py plants against this pattern and is the reason
# failure 4 is in the past tense.
# The scan list is DERIVED from next.config.mjs rather than written out, so a
# package added to the bundle is scanned automatically. Scanning every package
# instead would be wrong in the other direction: packages/mirror and apps/sync
# exist to fetch advisory data in Phase 2, and a check that must be weakened the
# first time it is inconvenient does not survive being inconvenient.
NET_PATHS="apps/web/app"
if [ -f apps/web/next.config.mjs ]; then
  for pkg in $(grep -o "@stratifypro/[a-z-]*" apps/web/next.config.mjs | sort -u); do
    d="packages/${pkg#@stratifypro/}/src"
    [ -d "$d" ] && NET_PATHS="$NET_PATHS $d"
  done
fi
if [ -n "$NET_PATHS" ]; then
  NET=$(grep -rnE '(^|[^A-Za-z0-9_$])(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)([^A-Za-z0-9_]|$)' \
          --include='*.ts' --include='*.tsx' $NET_PATHS 2>/dev/null \
        | grep -vE '\.test\.ts' \
        | grep -vE ':[0-9]+:[[:space:]]*(\*|//)')
  if [ -n "$NET" ]; then
    echo "$NET"
    echo "    FAILED: a network primitive reached code that runs in the browser"; fail=1
  else echo "    no network primitive in:$NET_PATHS"; fi
else
  echo "    skipped: no client source yet"
fi

echo "--- the advisory matcher cannot call anything"
# Doc 6 step 2.1 accepts this phase on one sentence: vulnmatch makes zero
# outbound per-query calls in a full corpus run. This is the static half.
#
# WHY IT IS A SEPARATE CHECK FROM THE BROWSER ONE ABOVE. That one guards a
# promise to the person using the free checker: your file is not uploaded.
# This one guards a promise to a paying customer: the components in your
# submission are not sent to a third party, one HTTP request at a time, before
# you have filed. Different promise, different code, and the browser scan
# deliberately does not cover these packages because apps/sync next door EXISTS
# to fetch advisory data and must keep being allowed to.
#
# So the rule is architectural rather than blanket: every outbound call lives in
# apps/sync, which a customer runs deliberately against public data. Nothing
# that reads a bill of materials may contain a network primitive at all.
#
# Matching bare identifiers rather than a call shape, for the reason the scan
# above learned the hard way: `const send = globalThis.fetch` then `send(...)`
# does not match `fetch\(`. Tests are excluded because offline.test.ts has to
# name every one of these to disable them.
MATCH_PATHS="packages/mirror/src packages/vulnmatch/src"
MATCHNET=$(grep -rnE '(^|[^A-Za-z0-9_$])(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|node:http|node:https|node:net|node:dgram|node:dns|node:tls)([^A-Za-z0-9_]|$)' \
             --include='*.ts' $MATCH_PATHS 2>/dev/null \
           | grep -vE '\.test\.ts' \
           | grep -vE ':[0-9]+:[[:space:]]*(\*|//)')
if [ -n "$MATCHNET" ]; then
  echo "$MATCHNET"
  echo "    FAILED: a network primitive reached the code that reads a customer's SBOM"; fail=1
else echo "    no network primitive in:$MATCH_PATHS"; fi

# The other half of the same claim: the fixture the offline test runs against
# has to actually exercise the paths it says it does, including the ones that
# must abstain. Offline; the fixture is committed.
run "the advisory fixture exercises every matcher path, abstentions included" \
    python3 scripts/mirror-fixture.py --check

echo "--- banned words in product copy"
# SCOPE MATTERS. This scans where CLAIMS ABOUT STRATIFYPRO'S OUTPUT live: application
# source, package source, and the public README. It deliberately does NOT scan
# docs/copy.md, CLAUDE.md, docs/banned-phrases.txt or docs/cisa-2026-elements.md,
# because those either DEFINE the banned list or quote a standards document that uses
# the words legitimately. Scanning them produced seven false positives on the first run,
# and a check that cries wolf gets muted, which is worse than no check at all.
#
# The list lives in exactly one place: docs/banned-phrases.txt. There is no second copy
# to drift against.
#
# This is a coarse net and it knows it. A grep cannot tell "our output is conformant"
# from "the document says a conformant file". It catches the blatant cases; a human
# still reads the prose.
PATTERN=$(grep -v '^#' docs/banned-phrases.txt | grep -v '^[[:space:]]*$' | paste -sd'|' -)
if [ -z "$PATTERN" ]; then echo "    FAILED: docs/banned-phrases.txt is empty"; fail=1; fi
# Source only. Build output is generated from the source this already scans, and
# a bundler's cache is a binary blob that happens to contain the words: once
# apps/web existed, .next/cache turned this check red on a webpack pack file.
# A check that fires on something the developer cannot edit gets muted.
SCAN_EXCLUDE="--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=.turbo"
# ONE FILE IS EXEMPT, and it is exempt because the specification overrides the
# list rather than because the list is inconvenient.
#
# SPEC.md Step 11 mandates the scope-of-attestation wording and says in bold
# that it is not open to paraphrase. That wording uses "contained" and
# "signature" to say the OPPOSITE of a claim: "not to what that artifact
# contained", and "it is not an electronic signature within the meaning of 21
# CFR 11.3(b)(7)". A grep cannot tell a claim from its own denial.
#
# So the wording lives alone in packages/report/src/attestation.json, rendered
# by attestation.ts, those two files are skipped here, and
# scripts/check-attestation.py replaces this scan with a stricter one: the text
# must equal SPEC.md's blockquote character for character, and neither word may
# appear in either file outside the mandated wording. Before that check existed
# the attestation was never compared to the specification at all, so the
# exemption is narrower than what it replaces.
#
# The wording is in JSON rather than in the TypeScript so that the replacement
# check needs no build. verify.sh runs first in CI, before anything is
# compiled, and a gate that only passes on an already-built tree is not a gate.
SCAN_EXCLUDE="$SCAN_EXCLUDE --exclude=attestation.ts --exclude=attestation.json"
# Test files are excluded for the same reason the network scan excludes them:
# they are not product copy and they do not ship. A test whose whole job is to
# assert that the output NEVER claims a file "contained" anything has to write
# the word down to assert on it, and failing the build for that is the check
# refusing its own enforcement.
#
# The residual risk is a banned claim sitting in a test and never being seen.
# It is small: a .test.ts file is a leaf, nothing imports it, and nothing in it
# reaches a user. The claim that matters is the one in the document a firm
# sends to a regulator, and that is still scanned.
SCAN_EXCLUDE="$SCAN_EXCLUDE --exclude=*.test.ts --exclude=*.test.tsx"
SCAN_PATHS=""
for p in apps packages/*/src README.md; do [ -e "$p" ] && SCAN_PATHS="$SCAN_PATHS $p"; done
if [ -z "$SCAN_PATHS" ]; then
  echo "    skipped: no product source exists yet (expected until Step 1 runs)"
elif grep -rniEI $SCAN_EXCLUDE "$PATTERN" $SCAN_PATHS 2>/dev/null; then
  echo "    FAILED: banned claim found in product copy"; fail=1
else echo "    clean"; fi

# The other half of the exemption above. If this check disappears, the
# exemption becomes a hole rather than a trade.
run "the attestation is SPEC.md Step 11, verbatim"     python3 scripts/check-attestation.py

# SPEC.md 2A.5. The model tier is 2A.1 and does not exist yet, which is exactly
# when to build this: a containment test written afterwards has to be shaped
# around whatever was already done, and every exception it grants is one
# somebody already depends on.
#
# Half of it bites today regardless of 2A.1: an `import OpenAI from 'openai'`
# anywhere reachable from the severity path or the attestation fails the build
# now.
run "no model call reaches a severity, the attestation, or a bundle"     python3 scripts/check-model-boundary.py
# SPEC.md 2A.5 does not accept the guard existing. "Then plant a violating
# import and confirm it goes red", and under VERIFY, "the containment test has
# been seen to fail". The fourth plant is the one that matters: a model tier
# that nothing protected imports MUST still pass, because 2A.1 exists to add
# one and a guard that forbade it outright would be deleted the day somebody
# needed it.
run "the model wall is not blind (mutation test)"     python3 scripts/model-boundary-mutation-test.py

# SPEC.md 2.10. A signed SSDF self-attestation is a representation by a named
# individual and carries False Claims Act exposure under the CISA form, so the
# difference between "we do this" and "we did this once and deleted it" is not
# academic. Every practice claimed as met names the thing that makes it true,
# and this fails the build if that thing has stopped existing, if a met row
# names nothing, or if the document quietly stops calling itself an unsigned
# draft.
run "the SSDF attestation cites only things that exist"     python3 scripts/check-ssdf.py

echo "--- the banned list is not restated in CLAUDE.md"
# CLAUDE.md must POINT AT docs/banned-phrases.txt and never restate any of it. A
# restated list is a second policy that nobody updates, which is exactly how the old
# two-copy arrangement drifted while its drift check printed "in sync". This tests
# EVERY pattern in the list, not one of them.
#
# docs/copy.md is NOT scanned here, because its "Words to use instead" table has to
# name the banned words in order to give the replacement. That table is checked a
# different way, in scripts/check-claims.py: every word it offers a replacement for
# must still be banned by docs/banned-phrases.txt, so the two cannot drift apart.
if grep -niE "$PATTERN" CLAUDE.md 2>/dev/null; then
  echo "    FAILED: a banned phrase is restated in CLAUDE.md"; fail=1
else echo "    single source"; fi

# docs/design.md and docs/ui-stack.md were authoritative and unchecked, and by
# section 5.6's own standard an unchecked rule does not exist. Proven necessary:
# a coloured left accent rail reached packages/report on the first build, which
# ui-stack.md lists among the things that give a generated interface away.
#
# These were three inline greps and none of them had ever been seen to fail.
# Step 1.16's acceptance is "each of the six greps planted with a violation and
# seen to go red", which an inline grep cannot be held to, so the rules moved
# into a script with a mutation test behind them. Running the mutation test
# FIRST is deliberate: if the checks are blind, a clean result from them below
# means nothing, exactly as the rule pack validator is proved before the packs
# are validated with it.
run "the design checks are not blind (mutation test)" \
    python3 scripts/design-mutation-test.py
run "design system is enforced, not just written down" \
    python3 scripts/check-design.py

# Doc 3 flow C: "explain <ruleId> in the CLI and /rules/<ruleId> on the web
# render the same content from the same source." The tests in packages/engine
# hold explainRule to the packs; they cannot see a renderer that stops using it.
#
# This was an inline grep here, and it shipped reporting clean while the branch
# it shipped in already violated it: apps/web/app/rules/page.tsx rendered
# {r.sourceDocument} alone while /rules/<id> rendered "document: clause" from
# the shared view. The grep scanned two hand-listed files and that was not one
# of them. An adversarial review then walked four more evasions through it.
#
# Mutation test first, for the same reason it runs first for the design rules:
# a clean result from a blind check means nothing.
# apps/web/app/packs.ts promised "a test asserts the two agree" and no such test
# existed. The CLI enumerates packs from disk; a static site cannot, so three
# hand-written lists in the web app have to be kept in step with the directory.
run "every rule pack appears in every hand-written list"     python3 scripts/check-pack-lists.py

run "the one-source check is not blind (mutation test)"     python3 scripts/one-source-mutation-test.py
run "one rule is described in one place"     python3 scripts/check-one-source.py

echo "--- corpus bytes in git match the working copy"
# The hash check above reads the working copy. Git stores whatever its
# attributes told it to store, and those can differ: this repository's first
# commit predated .gitattributes, so one corpus file was committed with its
# 2,873 CRLF pairs stripped. Every local check passed and CI failed on a fresh
# clone, which is the worst shape for a failure to take.
if command -v git >/dev/null 2>&1 && git rev-parse --verify -q HEAD >/dev/null 2>&1; then
  drift=0
  for f in fixtures/corpus/*.json; do
    git show "HEAD:$f" > "$f.gitblob" 2>/dev/null || continue
    if ! cmp -s "$f" "$f.gitblob"; then
      echo "    committed bytes differ from working copy: $f"; drift=1
    fi
    rm -f "$f.gitblob"
  done
  [ $drift -eq 0 ] && echo "    identical" || { echo "    FAILED: re-add the file with .gitattributes in force"; fail=1; }
else
  echo "    skipped: no git repository or no commit yet"
fi

echo "--- no dependency is allowed to run install scripts"
# pnpm-workspace.yaml records, per package, whether it may run a postinstall.
# The decision for every one of them is false, and this check is what makes
# that a rule rather than a sentence: section 5.6's standard is that an
# unchecked rule does not exist, and this one is a single edit away from being
# silently reversed by whoever hits ERR_PNPM_IGNORED_BUILDS and wants a green
# pipeline more than the property.
#
# The property: installing this repository executes no third-party code. For a
# project whose subject is software supply chain, that is not a nicety.
#
# A dependency that genuinely needs to build can be argued for here, in a
# commit a reviewer reads, rather than at an interactive prompt nobody sees.
if grep -qE '^[[:space:]]+[A-Za-z0-9@._/-]+:[[:space:]]*true[[:space:]]*$' pnpm-workspace.yaml 2>/dev/null; then
  grep -nE '^[[:space:]]+[A-Za-z0-9@._/-]+:[[:space:]]*true[[:space:]]*$' pnpm-workspace.yaml
  echo "    FAILED: a build script is approved; installing this repo now runs third-party code"; fail=1
elif grep -qE '^[[:space:]]+[A-Za-z0-9@._/-]+:[[:space:]]*(set this|$)' pnpm-workspace.yaml 2>/dev/null; then
  echo "    FAILED: allowBuilds has an undecided entry; decide it in the file, not at a prompt"; fail=1
else echo "    none approved"; fi

echo "--- em dashes"
# Scoped to files this repository authors. Vendored dependencies are not ours
# to punctuate: TypeScript alone ships em dashes in its localised diagnostic
# messages, and without these exclusions the check goes red the moment anyone
# runs pnpm install. A check that fires on something the developer cannot fix
# gets muted, and a muted check is worse than an absent one.
#
# .mirror is on that list for the same reason and it is worth naming: it holds
# OSV advisory summaries written by thousands of other people, and the em dashes
# in them are theirs. It is a build output, gitignored, rebuilt by apps/sync.
if grep -rl '—' --include='*.md' --include='*.json' . 2>/dev/null \
     | grep -vE '^\./(\.git|node_modules|dist|build|\.next|\.mirror)/' \
     | grep -vE '/node_modules/'; then
  echo "    FAILED: em dash found"; fail=1
else echo "    clean"; fi

echo
[ $fail -eq 0 ] && echo "ALL CHECKS PASS" || echo "CHECKS FAILED"
exit $fail
