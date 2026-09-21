# Error and interface copy

Version 1.0, 13 September 2026. These are the exact strings. Claude Code writes them
as given. They are not placeholders.

## Three rules that govern every string here

1. **Say what happened, then what to do.** Never an apology, never a shrug.
2. **Never use a banned word.** The list is `docs/banned-phrases.txt` and it is not
   repeated here. A CI grep built from that file enforces it over application source,
   package source and the public README. This document is deliberately outside that
   scan, because it is where the approved wording lives.
3. **Never claim the file "contained" anything.** StratifyPro does not keep the file.

## Parse and load failures

| Condition | Heading | Body |
|---|---|---|
| Not valid JSON | `That file is not valid JSON` | `The problem is at byte {offset}, near {snippet}. Most often this is a truncated download or a file that was edited by hand. Try re-exporting it from the tool that made it.` |
| Not valid JSON, no position reported | `That file is not valid JSON` | `Something is wrong near {snippet}, and the parser reported no position. Most often this is a truncated download. Try re-exporting it from the tool that made it.` |
| Valid JSON, unrecognised shape | `This does not look like a bill of materials` | `The file parsed, but it has no CycloneDX or SPDX markers. StratifyPro reads CycloneDX 1.2 to 1.7 and SPDX 2.2 to 2.3. If this is a supplier's own spreadsheet or PDF, that is a different job and the workspace can take a run at it.` |
| Recognised format, unsupported version | `That is {format} {version}, which this engine does not read yet` | `Supported today: CycloneDX 1.2 to 1.7, SPDX 2.2 to 2.3. Nothing was sent anywhere. If you need this version, say so and it moves up the list.` |
| Over the size cap | `That file is {size}, which is too large for a browser tab` | `The limit here is 25 MB, because past that the page stops responding and you would be left guessing. The command line tool has no limit: npx stratifypro check {filename} --pack {pack}` |
| Empty file | `That file is empty` | `Zero bytes. Check the export finished before it was copied.` |
| No components found | `This file parsed, but it lists no components` | `A bill of materials with no components is either a template or an export that failed part way. Nothing was sent anywhere.` |

## Rule pack failures, which are our fault and must say so

| Condition | Heading | Body |
|---|---|---|
| Pack fails to load | `A rule pack failed to load, so nothing was checked` | `Pack {id} version {version} did not pass its own validation: {reason}. This is a defect on our side, not in your file. Nothing was checked, and a partial result would be worse than none.` |
| Rule references a path the format lacks | (no user-facing error) | Logged, and the rule is reported in `skippedRules` with the reason. It is never silently dropped. |

## Results

| Condition | Heading | Body |
|---|---|---|
| Findings present | `{n} findings across {r} rules` | `{errors} errors, {warnings} warnings, {infos} for information. Every finding shows where it is in the file and what to change.` |
| Zero findings | `{r} rules ran. Nothing flagged.` | `This file cleared every rule in {pack}. That is a real result, not a failure to load: the rules that ran are listed below. It does not mean the file is complete, and it does not mean a submission will be accepted.` |
| All rules skipped | `No rules applied to this file` | `Pack {pack} has no rules for {format}. Try a different pack.` |

That zero-findings string is load-bearing. A clean pass and a broken tool must never
look the same, which is why the rule list is shown rather than a tick.

## Match findings, where the wording carries the most risk

| Condition | Text |
|---|---|
| High-confidence match | `{component} resolves to {purl}. {advisory} affects this version and the file does not declare it.` |
| Low-confidence match | `{component} may be {purl} (confidence {pct}%). If it is, {advisory} affects this version. Confirm the identity before acting on this.` |
| Model-suggested, unconfirmed | `Suggested identity, not confirmed: {component} may be {purl}. This came from a model and nobody has checked it. Confirm or reject it before it appears in any report.` |
| Abstained | `{component} could not be resolved to a known identifier. It was not checked for vulnerabilities. This is a gap, not a pass.` |

The abstention string matters as much as the match strings. A component nobody could
identify is invisible to every security tool, and the interface must say so out loud
rather than leaving it quietly absent from the results.

## Support and end-of-support

| Condition | Text |
|---|---|
| No support level | `No support level recorded. FDA asks whether each component is actively maintained, no longer maintained, or abandoned.` |
| No end-of-support date | `No end-of-support date recorded. No SBOM format has a field for this, so it usually has to be added by hand or supplied in an addendum.` |
| Date resolved from our dataset | `End of support {date}, from {source}, captured {captured}. Confirm against the vendor before filing.` |
| Past end of support | `{component} passed end of support on {date}. A reviewer is likely to ask what the plan is.` |

## Privacy and trust strings, used verbatim everywhere

| Where | Text |
|---|---|
| Under the drop zone | `Your file is checked in this browser. It is never uploaded.` |
| Workspace upload | `Only the findings and a SHA-256 fingerprint of your file are stored. The file itself is not kept and cannot be recovered from what we hold.` |
| Report footer | `Checked with StratifyPro engine {v}, rule pack {id} {ver}, on {date}. File SHA-256 {hash}.` |
| Evidence bundle | The attestation text in SPEC.md Step 11, verbatim, never paraphrased. |

## Words that are banned, enforced by CI

See **`docs/banned-phrases.txt`**. That file is the only copy, and `verify.sh` reads it
directly. Each entry carries the reason it is there. This section deliberately does not
restate the list: a restated list is a second policy, and the two-copy arrangement that
used to live here drifted without the drift check noticing.

## Words to use instead

| Instead of | Say |
|---|---|
| compliant | `meets the elements in {pack}` |
| will pass review | `is less likely to draw a screening hold` |
| certified | `checked against` |
| validated | `tested against fixtures` |
| our AI found | `resolved to, with {pct}% confidence` |
| guaranteed | nothing. Delete the sentence. |
