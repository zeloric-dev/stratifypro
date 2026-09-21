# Severity overrides

A rule pack assigns every rule a severity. An override changes one, for your runs
only, and never quietly.

## Why this exists, and why it is uncomfortable

Some rules cannot be satisfied today. An SBOM producer may have no way to emit a
field until its next release. A pack may assign `error` to something your
regulatory affairs team has already resolved another way. Without a way to
change a severity, the choice is a permanently red build or no checking at all,
and firms pick the second one.

The cost is obvious. An override is a way to make a finding quieter, and a tool
that lets you make findings quieter without leaving a trace is a tool for
producing clean-looking evidence.

So the trade this tool makes is: **you may change a severity, and you may never
do it silently.** Every override that takes effect is recorded in the result, in
the report, and in the header where the counts are read. Every override that
does *not* take effect is recorded too.

## The file

```json
{
  "overrides": [
    {
      "ruleId": "FDA-STAT-001",
      "to": "warning",
      "reason": "Our SPDX producer cannot emit this field before the Q3 toolchain upgrade; tracked internally as SUP-1421 with a target of 2026-11-30."
    }
  ]
}
```

```
stratifypro check sbom.json --pack fda-524b --overrides overrides.json
```

Three fields, all required.

- **`ruleId`** must name a rule in the pack you are checking against.
- **`to`** is `error`, `warning`, `info` or `advisory`. Overrides go both
  directions: raising a severity is as legitimate as lowering one.
- **`reason`** is at least 60 characters. This is the same floor the rule pack
  schema puts on `onEmptySelectorJustification`, on the same argument: a rule
  author has to write a sentence to justify an empty selector, and someone
  lowering a severity on their own submission evidence is not held to a lower
  standard than the rule author.

  A length floor cannot tell a reason from sixty characters of keyboard noise.
  It is a speed bump and it does not pretend otherwise. What it buys is that
  `"x"` stops being possible, and that a reviewer reading the report finds
  something written for them.

There is no `from` field. The pack supplies the severity a rule is being
changed *from*, because a caller who could state it could state it wrongly, and
the report would then carry a false claim about what the rule used to say.

## What gets refused

These stop the run. Nothing is checked, rather than most of the document being
checked and the problem surfacing at the end.

| Code | Condition |
|---|---|
| `SP-OVERRIDE-000` | The overrides file could not be read |
| `SP-OVERRIDE-001` | `ruleId` names no rule in the pack, usually a typo |
| `SP-OVERRIDE-002` | The same rule is overridden twice; the winner would be invisible |
| `SP-OVERRIDE-003` | `to` is not one of the four severities |
| `SP-OVERRIDE-004` | `reason` is under 60 characters after trimming |
| `SP-OVERRIDE-005` | The file parsed but is not shaped like an overrides file, or an entry is not an object with a string `ruleId` |
| `SP-ARG-002` | `--overrides` was given with no value after it |

All exit 3, the same code as a rule pack that fails to load, because the
situation is the same: the tool was told to do something it could not do, and a
partial check on submission evidence is worse than no check.

## Overrides that change nothing

An override can be valid and still have no effect. Three ways:

- **The rule did not run.** It does not apply to the format of the document you
  checked, or its selector matched nothing and it declares `onEmptySelector:
  skip`.
- **The pack already assigns that severity.** This is what a pack upgrade does
  to an override written against the previous version.
- **The rule ran and found nothing.** There was no finding whose severity could
  change. Counting this as applied made the report's header state that the
  counts were not the ones the pack assigns, when they were identical to them.

Neither is refused. An override file that is correct for your SPDX documents is
legitimately inert against a CycloneDX one, and failing the run would make a
shared config impossible.

Both are **recorded**, in `inertOverrides` in the result and in a table in the
report headed "Severity overrides that changed nothing", each saying which of
the two happened.

This is the part worth understanding. Before it existed, an override aimed at a
rule that did not run produced a result byte-identical to one where you had
never written the override at all. No error, no record, no difference. You could
keep a file with a mistyped format for years and believe it was doing something.
"I asked for something, nothing happened, and nobody told me" is the failure
this tool exists to argue against, so it is not a failure this tool is allowed
to have.

## What an override does to the exit code

This section was missing from the first version of this document, which then
claimed its list was exhaustive. It is the most consequential thing an override
does and the only channel CI reads.

`result.counts` and `--fail-on` are both computed from post-override
severities. So an override can turn a failing build green:

```
check bad.json --pack fda-524b --fail-on error                    exit 1
check bad.json --pack fda-524b --fail-on error --overrides o.json exit 0
```

That is the intended behaviour. It is the reason the feature exists. But in CI
the exit code is the entire output, because nobody reads stdout on a green
build, so two things are written to **stderr** when it happens.

**"this run exits 0 because of a severity override"**, with the number of
findings that sit at or above your threshold in the pack and were moved below
it. Fires only when the run would otherwise have exited 1.

**"no rule can produce a finding at severity X or above"**, the pre-existing
banner for a gate that can never fail, which now computes from post-override
severities. If the pack does contain rules at your threshold and your overrides
file moved all of them below it, the banner says so rather than blaming the
pack. This banner was blind to overrides when the flag was added, which meant
the likeliest way to end up with a permanently green gate was the one way it
could not see.

Neither fires while the gate can still fail. A banner that cries wolf gets
muted, which is worse than no banner.

Separately, **every** run that is given `--overrides` writes `Read N
override(s) from <path>` to stderr, including when N is zero.

## Where they show up

- The **exit code**, via `--fail-on`, as above
- Two stderr banners when an override is why a run passed, as above
- `Read N override(s) from <path>` on stderr, on every run given the flag
- `CheckResult.overrides`, applied, each with `from`, `to` and `reason`
- `CheckResult.inertOverrides`, declared and did nothing, each with `whyInert`
- `CheckResult.overridesSource`, the file's path, SHA-256 and entry count,
  present whenever the flag was given even if nothing applied
- `Finding.overriddenFrom` on each finding an override moved, so a renderer
  showing findings one at a time does not print a severity beside prose
  arguing for a different one
- The HTML report, in two separate tables, never merged into one
- The report's coverage header, which states that the counts are not the ones
  the pack assigns on its own
- The report's provenance block, naming the overrides file and its hash
- The CLI text output, naming each affected rule and its change

Deliberately, there is no way to apply an override that appears in none of these.
