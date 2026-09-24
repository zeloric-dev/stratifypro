# Four things no SBOM format carries, and what to add

SPEC.md 3.3: "The four gaps the competitor left: KPI cluster, real security
fields, hardware link, support and end-of-support dates. Each has rules,
fixtures and a documented schema-extension proposal."

The rules and fixtures exist. This is the third part.

## Why these four and not others

Two independent pieces of evidence point at the same short list.

`docs/teardown.md` ran the competing validators over real files and recorded
what each one asks. **Seven of the sixteen FDA rules are asked by neither
tool**, and level of support, end-of-support date and traceability to the
threat model are among them. Those are not obscure: they are what a 524B
reviewer returns a submission over.

`docs/crosswalk/data/ai-sbom-crosswalk.json` mapped all 50 G7 AI elements into
both formats and rated the fit. Four elements come out `properties-only`,
which the crosswalk's own scale defines as: *"Expressible only through a
free-form property bag or an external link. Not interoperable."*

Those two lists overlap, and the overlap is this document.

## What "properties-only" costs

Every proposal below has the same shape, so the cost is worth stating once.

A CycloneDX `properties[]` entry is a name and a string. Nothing constrains the
name, nothing constrains the value, and nothing tells a consumer that two
documents from two vendors mean the same thing. StratifyPro writes
`stratifypro:end-of-support` because it had to write something; a different
tool writes `acme:eol`; a third writes the date into a free-text comment. All
three are conformant and none of them is comparable.

**This is not a complaint about the formats.** It is the reason a rule that
checks such a field can only ask whether *somebody's* convention is present,
which is a weaker question than the regulation asks. Until the field exists,
that is the strongest honest check available, and every rule below says so in
its own justification.

Each proposal therefore names a migration: what StratifyPro writes today, and
what it would read instead once the field exists. Both would be read during a
transition, with the standard field winning.

---

## 1. Support level and end-of-support date

**Rules** `FDA-SUP-001`, `FDA-SUP-002` |
**Fixtures** `packages/rules/fixtures/FDA-SUP-001`, `FDA-SUP-002` |
**Fit** properties-only in CycloneDX; SPDX 3.0 has part of it

### Why it matters

21 USC 360n-2 and the FDA premarket guidance ask a manufacturer to state
whether each component is supported and until when. A device is fielded for a
decade; the libraries inside it are not. A reviewer reading an SBOM with no
support horizon cannot tell a maintained dependency from an abandoned one, and
that distinction is most of what the document is for in a premarket review.

`docs/teardown.md` records that **neither** competing validator checks either
field.

### What exists today

CycloneDX has no support-lifecycle field on a component. StratifyPro writes:

```json
{ "properties": [
  { "name": "stratifypro:support-level",   "value": "actively maintained" },
  { "name": "stratifypro:end-of-support",  "value": "2027-06-30" }
] }
```

SPDX 3.0 is further along and carries `supportLevel` and `validUntilTime` on
`Artifact`, which `packages/engine/src/spdx3.ts` reads. The vocabulary is
there; CycloneDX has no equivalent.

### Proposed

A `support` object on `component`, mirroring SPDX 3.0's vocabulary rather than
inventing a second one:

```json
{
  "support": {
    "level": "supported",
    "endOfSupport": "2027-06-30",
    "endOfLife": "2029-06-30",
    "statedBy": "supplier"
  }
}
```

`level` takes SPDX 3.0's `SupportType` values (`development`, `design`,
`deployed`, `support`, `noAssertion`, `noSupport`, `endOfSupport`) so the two
formats stay convertible. `endOfSupport` and `endOfLife` are dates, not
strings, because "2027-06-30" and "June 2027" are not comparable and a
free-text field guarantees both. `statedBy` distinguishes a supplier's own
commitment from a downstream integrator's guess, which is the difference
between a fact and an estimate in a submission.

### Migration

Read `support.endOfSupport` when present, fall back to
`stratifypro:end-of-support`, and prefer the standard field when both appear.

---

## 2. Security controls, as fields rather than prose

**Rule** `G7-SEC-001` |
**Fixtures** `packages/rules/fixtures/G7-SEC-001` |
**Fit** properties-only

### Why it matters

The G7 minimum elements ask what protects the system. CycloneDX can attach a
`threat-model` or `risk-assessment` external reference, which says a document
exists somewhere, and CDXA declarations can attest against a named standard.
Neither states a control. A reader gets a URL and a claim of conformity, and
has to open a PDF to learn whether inputs are validated.

### What exists today

An external reference, a CDXA attestation, or a property bag. StratifyPro
accepts all three, which is why the rule is `info` rather than `warning`: it
can only establish that somebody gestured at security, not what is in place.

### Proposed

A `controls[]` array on `component` or on `metadata.component`:

```json
{
  "controls": [
    {
      "id": "input-validation",
      "catalogue": "CIS-IG1",
      "catalogueRef": "4.1",
      "state": "implemented",
      "appliesTo": ["model-1"],
      "evidence": { "type": "attestation", "url": "https://example.invalid/..." }
    }
  ]
}
```

`catalogue` and `catalogueRef` point into an existing control catalogue rather
than defining a new taxonomy, which is the mistake that would sink this: nobody
needs a CycloneDX control vocabulary competing with CIS, NIST 800-53 and
ISO 27002. `state` takes the values VEX already uses for analysis state, so the
two are read the same way. `appliesTo` matters for AI specifically: a control
on the inference service is not a control on the model weights.

### Migration

Read `controls[]` when present; keep accepting the external reference and the
attestation, since both remain valid and carry different information.

---

## 3. The hardware link

**Rule** `G7-INF-002` |
**Fixtures** `packages/rules/fixtures/G7-INF-002` |
**Fit** partial

### Why it matters

An AI model in a medical device runs on a specific board with a specific
accelerator. The G7 elements ask for it. A software SBOM that cannot say which
hardware its inference stack assumes is describing half a system, and for a
device submission the hardware half is the regulated one.

### What exists today

Two partial answers. A `component` of `type: device` can name the hardware but
carries none of the fields a hardware bill of materials needs. An
`externalReferences[].type: "bom"` entry with a BOM-Link URN can point at a
separate hardware BOM, which is the right shape, but the link is untyped: a
consumer cannot tell a hardware BOM from a subassembly SBOM without fetching
it.

### Proposed

Type the relationship rather than inventing a hardware model inside CycloneDX.
Hardware belongs in a hardware BOM; what is missing is the ability to say what
the link means:

```json
{
  "externalReferences": [
    {
      "type": "bom",
      "url": "urn:cdx:3e671687-.../1#board",
      "bomRelationship": "runs-on",
      "required": true
    }
  ]
}
```

`bomRelationship` takes a small closed set (`runs-on`, `contains`,
`manufactured-by`, `accompanies`). `required: true` states that the referenced
BOM is needed to understand this one, which is what turns a convenience link
into a completeness claim a checker can act on.

This is the smallest of the four proposals on purpose. The alternative,
modelling hardware inside a software BOM, is a much larger change that CycloneDX
has deliberately not made, and this document is not the place to relitigate it.

---

## 4. The KPI cluster

**Rules** `G7-KPI-001`, `G7-KPI-002` |
**Fixtures** `packages/rules/fixtures/G7-KPI-001`, `G7-KPI-002` |
**Fit** properties-only

### Why it matters

For an AI component, the performance figure IS the safety argument. A triage
model with a 2 percent false-negative rate and one with 20 percent are
different devices, and nothing else in the SBOM distinguishes them.

### What exists today

This is the weakest of the four. CycloneDX has
`modelCard.quantitativeAnalysis.performanceMetrics[]`, and the crosswalk
records what it carries: a free-text `type`, a **string** `value`, and an
optional slice and confidence interval. So:

```json
{ "type": "false negative rate", "value": "0.021", "slice": "all studies" }
```

`value` being a string means `"0.021"`, `"2.1%"` and `"about 2 percent"` are
all conformant and none is comparable. `type` being free text means one vendor
writes "false negative rate", another "FNR", a third "miss rate". Two model
cards describing the same measurement cannot be put side by side. Operational
figures such as latency and throughput have no home at all and fall back
entirely to properties.

### Proposed

Constrain what is already there rather than adding a parallel structure:

```json
{
  "type": "false-negative-rate",
  "value": 0.021,
  "unit": "ratio",
  "slice": { "dimension": "age", "value": "18-64" },
  "confidenceInterval": { "lower": 0.018, "upper": 0.025, "level": 0.95 },
  "measuredOn": "dataset-1",
  "measuredAt": "2026-04-11"
}
```

Four changes, in order of how much they matter. **`value` becomes a number and
`unit` becomes required**, which alone makes two documents comparable.
**`type` takes a closed vocabulary** for the common measures, with an
`x-` prefix for anything outside it, so "FNR" and "false negative rate" stop
being different metrics. **`measuredOn` references a dataset component**, so a
figure is tied to the data it was measured on rather than floating free.
**`measuredAt` dates it**, because a metric from an earlier model version is
the most misleading kind of stale field.

A second array, `operationalMetrics[]`, with the same shape, for latency,
throughput and resource envelope. These are not model quality and putting them
in the same array would confuse the safety argument with the integration one.

### Migration

Accept a numeric `value` alongside the current string, and prefer the numeric.
Keep reading `stratifypro:operational-kpi` until `operationalMetrics[]` exists.

---

## What happens to this document

SPEC.md 3.4 is a pull request adding `model_card` support to
`cyclonedx-python-lib`. These four are separate from that and larger: they are
schema changes, which belong upstream as specification issues against
CycloneDX rather than as library patches.

Nothing here is filed yet. Filing is an outward-facing act and is the
owner's to make, not this repository's, and a proposal filed without a worked
example and a tool that implements it is noise. All four now have the worked
example: a rule, a fixture that fires, and a fixture that passes.

**The honest status of every rule above is the same.** Each one checks whether
a convention is present, because a convention is all the format offers. A
reader should not take a passing `G7-KPI-001` as evidence that a model's
performance is comparable to anything, and the rule's own severity
justification says so.
