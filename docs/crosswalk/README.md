# AI SBOM Crosswalk

A field-level mapping of the **G7 and CISA "Software Bill of Materials for AI: Minimum Elements"** onto the two formats the industry actually uses: **CycloneDX 1.7** and **SPDX 3.0.1**.

All 50 elements. All 7 clusters. Gaps marked in both directions.

## Why this exists

The specification names no format. The word "CycloneDX" does not appear in it once. "SPDX" appears exactly once, inside an example. The document states plainly that implementation details are out of scope:

> the purpose of this document is to offer useful guidance, without creating new requirements, standards, legislation, or implementation details of an SBOM for AI, which are outside the scope of this work.

So anyone trying to actually write an AI bill of materials has a 24-page document describing 50 things to record, and two file formats that were designed before it, with no map between them. This is that map.

As far as I could find, no official or unofficial crosswalk existed when this was published. If one does, please open an issue and I will link to it.

## What the numbers say

| | Direct | Partial | Property bag only | No representation |
|---|---|---|---|---|
| **CycloneDX 1.7** | 23 | 23 | 4 | 0 |
| **SPDX 3.0.1** | 27 | 14 | 3 | 6 |

Read that carefully, because the headline is not "SPDX wins."

**CycloneDX can express something for all 50 elements**, but only 23 of them cleanly. It never leaves you with nothing, and it is the only one of the two that can model data flow between components or link out to a hardware bill of materials.

**SPDX has more direct hits**, largely because its AI and Dataset profiles were purpose-built with fields like `datasetType`, `dataCollectionProcess` and `confidentialityLevel` that map straight across. But it leaves **six elements with no representation at all**, including system data flow, model input and output properties, dataset statistical properties, and infrastructure hardware.

## The gaps that matter most

Both formats were scanned full-text. These terms return **zero hits in both**:

> adversarial · prompt injection · jailbreak · poisoning · watermark · guardrail · red team · robustness

The Security Properties cluster asks for adversarial robustness training, prompt injection controls, input and output filters and training-data curation. **Neither format has a field for any of it.** Today the only options are a private property namespace or an out-of-band link, neither of which is interoperable.

Four more named requirements with no home in either format:

- **Open weight, open architecture, open data, open training.** Named explicitly under `Model license`. No vocabulary exists anywhere.
- **Dataset statistical properties.** Mean, variance, median, mode, range, skewness. Nothing.
- **Operational KPIs.** Uptime, latency, throughput. Nothing. Arguably out of scope for a static document, and worth saying so rather than pretending otherwise.
- **Base model lineage.** "Fine-tuned from model X" has no first-class representation. CycloneDX offers generic `pedigree.ancestors`; SPDX offers generic `ancestorOf`. Even SPDX 3.1's new `finetunedOn` points at a *dataset*, not a parent model.

## Files

| File | What it is |
|---|---|
| `data/ai-sbom-crosswalk.json` | The canonical machine-readable crosswalk. Clusters, elements, stated constraints, and mapped paths for both formats. |
| `data/ai-sbom-crosswalk.csv` | The same thing flat, for spreadsheets and quick greps. |
| `METHODOLOGY.md` | How this was built, what was verified against primary sources, and what was not. |
| `CONTRIBUTING.md` | How to correct a mapping. |

The JSON is the source of record. The CSV is derived from it.

## Using it

```bash
# every element with no SPDX representation
jq -r '.clusters[].elements[]
       | select(.mappings["spdx-3.0.1"].fit == "none")
       | "\(.id)\t\(.name)"' data/ai-sbom-crosswalk.json

# everything in the Security Properties cluster
jq '.clusters[] | select(.id == "security-properties")' data/ai-sbom-crosswalk.json

# count fits per format
jq -r '[.clusters[].elements[].mappings["cyclonedx-1.7"].fit] | group_by(.)
       | map({fit: .[0], n: length})' data/ai-sbom-crosswalk.json
```

## What this is not

**It is not a conformance policy.** The specification assigns no required, optional or recommended level to any of the 50 elements. It contains no MUST, SHALL or SHOULD keyed to individual fields, and it declares the whole set "not mandatory." Every element in this data carries `"conformance": "unspecified"` for exactly that reason.

Anyone building a checker has to supply their own policy. That policy is a judgement call and it should be declared as one, not smuggled in as though the standard required it.

**It is not a substitute for reading the source.** Two of the primary documents are hard to fetch programmatically. The access notes in `METHODOLOGY.md` tell you where to actually get them.

## Practical notes for implementers

A few things that will bite you, drawn from reading the schemas rather than the documentation:

- **44 of the 50 elements have no stated data type.** Only six carry a format constraint: `SBOM timestamp` (RFC 9557), `SBOM version` (SemVer or RFC 9562), `Model hash value` (ASCII), `Model hash algorithm` (IANA hash names), `Model identifier` (CPE, PURL, UUID, OmniBOR, SWHID) and `SBOM generation context`.
- **RFC 9557 is not RFC 3339.** It permits bracketed suffixes such as `[America/Chicago]`. Both formats validate timestamps as plain `date-time`, so a strictly conformant timestamp can fail their schemas.
- **Neither format uses IANA hash algorithm names**, which the specification asks for. Both have their own closed vocabularies and the sets do not fully overlap.
- **CycloneDX does not enforce that a model card belongs to a model.** That rule lives in a JSON Schema `description` string, not in the schema logic. A schema-only validator will happily accept a `library` component carrying a `modelCard`.
- **SPDX's own required-property rules are not in its published schema or SHACL shapes.** Five External Property Restrictions on `AIPackage`, five on `DatasetPackage`, plus two licence relationship rules for each. `pyshacl` and `ajv` both pass documents that violate them.
- **The CycloneDX Python and JavaScript libraries cannot emit a model card.** In `cyclonedx-python-lib` both `model_card` and `data` are commented-out stubs marked `TODO since CDX1.5`. Go, Java and .NET are complete. In the two languages the machine learning ecosystem actually uses, you must hand-build the JSON.

## Licence

The crosswalk data is **CC BY 4.0**. Use it, fork it, build on it, ship it in a product. Attribution appreciated, not enforced beyond the licence.

Quoted material from the source specifications remains the property of their publishers and is reproduced here for identification and interoperability purposes.

## Status

Version 0.1.0, compiled 29 August 2026. Mappings are judgement calls made by reading both schemas directly. **Corrections are the entire point of publishing this.** If a mapping is wrong, open an issue with the path you would use instead.
