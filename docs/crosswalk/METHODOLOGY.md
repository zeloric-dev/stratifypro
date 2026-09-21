# Methodology

## Sources, and how to actually get them

Two of the primary documents block automated retrieval. That is worth knowing before you try.

| Document | Date | Where it works | Access note |
|---|---|---|---|
| **Software Bill of Materials for AI: Minimum Elements** | 12 May 2026 | [BSI, Germany](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/SBOM-for-AI_minimum-elements.pdf) | `cisa.gov` returns HTTP 403 to automated requests. BSI is a co-publisher and hosts the identical original PDF. |
| **2026 Minimum Elements for a SBOM, v2.1** | 29 July 2026 | [ic3.gov](https://www.ic3.gov/CSA/2026/260729.pdf) | Both `cisa.gov` and `media.defense.gov` return 403. The FBI mirror serves it. |
| **A shared G7 vision on SBOM for AI** | 19 May 2025 | [ACN, Italy](https://www.acn.gov.it/portale/documents/d/guest/paper_sbom-for-ai_19may2025_-clean-2) | The predecessor document. Clusters were added, adjusted and removed between it and the final elements. |
| **CycloneDX 1.7 JSON Schema** | 21 Oct 2025 | [raw.githubusercontent.com](https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-1.7.schema.json) | The GitHub API is blocked in some environments; `raw.githubusercontent.com` is not. Resolve `$ref`s against the sibling `spdx.schema.json` and `jsf-0.82.schema.json`. |
| **CycloneDX Authoritative Guide to AI/ML-BOM** | 10 June 2026 | [cyclonedx.org](https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-AI-ML-BOM-en.pdf) | Note: some of its own property examples are schema-invalid. See below. |
| **SPDX 3.0.1 model** | 17 Dec 2024 | [spdx.org RDF](https://spdx.org/rdf/3.0.1/spdx-model.ttl) | The normative artifact is the ontology, not the rendered web pages. |

## How the mappings were made

Not from documentation. From the artifacts.

- **CycloneDX** mappings were made against `bom-1.7.schema.json` read directly, cross-checked against the official test fixtures `valid-machine-learning-1.7.json` and `valid-machine-learning-considerations-env-1.7.json`, and against the `cdx:ai-ml` property taxonomy registry.
- **SPDX** mappings were made against the OWL/SHACL ontology `spdx-model.ttl`, cross-checked against the model source markdown at tag `3.0.1` and the published JSON Schema. Prose descriptions come from the model source, which is longer than the ontology's `rdfs:comment`.
- **Element definitions and constraints** are from the AI specification PDF itself, quoted or closely paraphrased.

Where the three disagreed, the machine-readable artifact won and the disagreement was recorded.

## The fit scale

| Fit | Meaning |
|---|---|
| `direct` | A purpose-built field carries this element. |
| `partial` | A field exists but is narrower, differently scoped, or uses an incompatible vocabulary. |
| `properties-only` | Expressible only through a free-form property bag or an external link. Not interoperable. |
| `none` | No representation at all. |

`partial` is doing a lot of work and is the rating most likely to be wrong. If you disagree with one, that is exactly the issue worth opening.

## Judgement calls made, and why

**System-level versus model-level.** The specification has both `System input/output properties` and `Model input-output properties`. CycloneDX has only `modelCard.modelParameters.inputs[].format`, which is model-level. That was mapped to both, rated `partial` for each, with the mismatch noted. It is the honest answer but it is a call.

**Property taxonomies do not count as schema.** CycloneDX's `cdx:ai-ml:*` registry defines modality, parameter count, tuning method and many hyperparameters. It is authoritative and useful, but it lives outside the schema in name/value pairs. Where an element is only reachable through it, the fit is `partial` at best and the note says so. Three defects were found in that registry's own documentation, including examples that place `properties` inside `modelParameters`, which is `additionalProperties: false` and would fail validation.

**Free text is not a mapping.** SPDX `informationAboutTraining` is a free-text string that could in principle hold anything from the Models cluster. It was mapped only where the field's own description names the concept. Otherwise the rating is `none`, not `partial`. Being generous here would make the crosswalk useless.

**Absence was verified, not assumed.** Every `none` rating for AI-security terms was checked by full-text scan of both schema files, case-insensitively. Zero hits for `adversarial`, `prompt injection`, `jailbreak`, `poisoning`, `watermark`, `guardrail`, `red team`. SPDX has exactly one hit for `robustness` and it is inside a Functional Safety verification type, unrelated to AI.

## What is deliberately not here

**No conformance levels.** The specification assigns none. Every element carries `"conformance": "unspecified"`. Adding required or optional flags would be inventing a standard, not mapping one.

**No opinion on which format is better.** The counts are in the README and they point in different directions depending on what you care about.

**No mapping to the general SBOM minimum elements.** Those 17 fields are a separate document and the AI elements sit on top of them, not instead of them. That crosswalk is worth doing and is not done here.

## Known limitations

- The AI specification carries **no version number and no date inside the file**. The 12 May 2026 date comes from BSI's landing page. If the document is revised without a version bump, this crosswalk has no way to detect it.
- SPDX 3.1 is a release candidate. It adds `pretrainedOn`, `finetunedOn`, `evaluatedOn`, `validatedOn`, `runsOn` and `isoAutomationLevel`, several of which would change ratings here. This crosswalk targets 3.0.1, the published version.
- CycloneDX 1.6 and 1.7 have a structurally identical AI object graph, so 1.6 users can read these mappings directly.
- Mappings for the Security Properties and KPI clusters are the least satisfying, because the source elements are themselves the least specified. Four of the six `properties-only` and `none` ratings across both formats sit in those two clusters.

## Reproducing this

The JSON is derived from a spreadsheet built by hand from the primary documents, then emitted programmatically so the two cannot drift. The CSV is derived from the JSON. If you want to check a mapping, open the schema at the path given and look.
