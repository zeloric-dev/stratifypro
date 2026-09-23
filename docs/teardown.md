# What the existing tools actually check

SPEC.md step 0.1, the competitor teardown. Two of the three named tools were obtained and run against five real bills of material from `fixtures/corpus`. Every number below came out of running them.

## This gate was skipped

SPEC.md marks this task **"Blocking: no build starts until this exists"**, and line 794 repeats it: "Do not start Step 1 until `docs/teardown.md` exists". It did not exist. The engine, both rule packs, the resolver, the benchmark, the crosswalk, the site, the advisory mirror and the matcher were all built before anyone ran a competing tool once. This document is that gate arriving late, and saying so here is cheaper than pretending the order was followed.

## Read this before the tables

**Neither tool claims to check FDA section 524B.** sbomqs checks NTIA, BSI, FSCT and OpenChain Telco. ntia-conformance-checker checks NTIA and FSCT. A tool that does not report an FDA field it never claimed to look for is not deficient, and a teardown that scored those as failures would be marketing with a table in it.

So the column that matters is not whether a tool failed. It is whether the question is asked **by anyone at all**.

## The tools

| Tool | Version | Standards it checks | Formats |
|---|---|---|---|
| `ntia-conformance-checker` | 5.0.3 | NTIA minimum elements, FSCT v3 minimum | SPDX only |
| `sbomqs` | v2.1.2 | NTIA (2021 and CISA 2026), BSI TR-03183-2, FSCT v3, OpenChain Telco | SPDX and CycloneDX |

### The third tool does not exist

SPEC.md 0.1 names `sbom-tools --standard fda`. No package by this name exists on PyPI, and no repository matching it publishes an `--standard fda` flag. The nearest match by name is Microsoft's `sbom-tool`, which GENERATES SPDX documents and does not validate them against any standard. SPEC.md 0.1 names a tool that does not appear to exist, which is worth recording: the teardown was specified against an assumption about the market rather than a survey of it.

## A row per rule, per tool

Every rule in `fda-524b`, against each tool. `checks` means the tool reports an element answering the same question, and that element is named so the claim can be checked. `partial` means it answers a weaker version.

| Rule | Asks for | `ntia-conformance-checker` | `sbomqs` |
|---|---|---|---|
| `FDA-STAT-001` | A software bill of materials exists and is machine-readable | partial | partial |
| `FDA-STAT-002` | The SBOM enumerates commercial, open-source and off-the-shelf components | **not checked** | **not checked** |
| `FDA-NTIA-001` | Supplier name is present for every component | checks | checks |
| `FDA-NTIA-002` | Component name is present | checks | checks |
| `FDA-NTIA-003` | Version of the component is present | checks | checks |
| `FDA-NTIA-004` | Other unique identifiers are present | checks | checks |
| `FDA-NTIA-005` | Dependency relationships are declared | checks | checks |
| `FDA-NTIA-006` | Author of the SBOM data is present | checks | checks |
| `FDA-NTIA-007` | Timestamp is present | checks | checks |
| `FDA-SUP-001` | Every component declares a software level of support | **not checked** | **not checked** |
| `FDA-SUP-002` | Every component declares an end-of-support date | **not checked** | **not checked** |
| `FDA-VULN-001` | Known vulnerabilities are identified, including CISA KEV entries | **not checked** | **not checked** |
| `FDA-DEPTH-001` | Transitive dependencies are present | partial | partial |
| `FDA-JUST-001` | If SBOM information is missing, a justification is present | **not checked** | **not checked** |
| `FDA-USER-001` | The SBOM is in a form that can be provided to users continuously | **not checked** | **not checked** |
| `FDA-TRACE-001` | The SBOM can be traced to the threat model and risk assessment | **not checked** | **not checked** |

**7 of the 16 rules are asked by neither tool**: `FDA-STAT-002`, `FDA-SUP-001`, `FDA-SUP-002`, `FDA-VULN-001`, `FDA-JUST-001`, `FDA-USER-001`, `FDA-TRACE-001`.

That is the finding. Supplier name, component version and dependency relationships are well served and this project adds nothing there. Level of support, end-of-support date, a justification for missing information, the form the SBOM is provided in, and traceability to the threat model are asked by nobody, and they are what a 524B reviewer returns a submission over.

### Why each unchecked rule is unchecked

| Rule | Tool | Reason |
|---|---|---|
| `FDA-STAT-001` | `ntia-conformance-checker` | Same: parse failure rather than a stated finding |
| `FDA-STAT-001` | `sbomqs` | Refuses to parse an unreadable file, which is not the same as asserting a machine-readable SBOM exists for a submission |
| `FDA-STAT-002` | `ntia-conformance-checker` | Same |
| `FDA-STAT-002` | `sbomqs` | No element distinguishes commercial, open-source and off-the-shelf components |
| `FDA-SUP-001` | `ntia-conformance-checker` | Same |
| `FDA-SUP-001` | `sbomqs` | No element for software level of support. Neither format has a field for it |
| `FDA-SUP-002` | `ntia-conformance-checker` | Same |
| `FDA-SUP-002` | `sbomqs` | No element for an end-of-support date |
| `FDA-VULN-001` | `ntia-conformance-checker` | Same |
| `FDA-VULN-001` | `sbomqs` | Compliance mode evaluates no vulnerability element, and none of its standards asks for one |
| `FDA-DEPTH-001` | `ntia-conformance-checker` | dependencyRelationshipsProvided is the same presence test |
| `FDA-DEPTH-001` | `sbomqs` | Element 1.9 Relationships asks whether relationships exist, not whether the graph reaches transitive dependencies |
| `FDA-JUST-001` | `ntia-conformance-checker` | Not evaluated |
| `FDA-JUST-001` | `sbomqs` | CISA 2026 element CISA-PR-004, Explicitly Identifying Unknown Information, is in the Practices group, and sbomqs evaluates no Practices element |
| `FDA-USER-001` | `ntia-conformance-checker` | Not evaluated |
| `FDA-USER-001` | `sbomqs` | Distribution and Delivery is CISA-PR-003, in the Practices group |
| `FDA-TRACE-001` | `ntia-conformance-checker` | Same |
| `FDA-TRACE-001` | `sbomqs` | No element relates the document to a threat model or risk assessment |

## What happened on five real files

| File | `sbomqs` NTIA score | `ntia-conformance-checker` |
|---|---|---|
| `spdx__lab-syft.json` | 6.95 / 10 | not conformant |
| `spdx__grype-sbom.spdx.json` | failed | not conformant |
| `spdx__julia.spdx.json` | 3.05 / 10 | not conformant |
| `cyclonedx__redis-commander-sbom-cdx.json` | 9.29 / 10 | could not read this file |
| `cyclonedx__ghidra-sbom-cdx.json` | 6.24 / 10 | could not read this file |

`ntia-conformance-checker` reads SPDX only, so the 2 CycloneDX files above are outside what it can answer. That is a stated limitation of the tool and not a defect: it is in its name.

### One malformed field costs the whole document

`sbomqs` returned no result at all for `spdx__grype-sbom.spdx.json`, which has 1160 components:

```
Error: failed to parse Originator 'Georg Brandl <georg@python.org>'
```

The file is at fault. SPDX 2.2 requires an `Originator` to read `Person: name (email)`, `Organization: ...` or `NOASSERTION`, and a bare name with an angle bracketed address is none of those. The tool is right to notice.

But the user gets **nothing**. Not a finding, not a warning naming the offending component, not the other 1,159 components that parse perfectly. One malformed field in one component discards the entire document, and the person holding it learns only that something, somewhere, failed to parse.

This project's engine reads the same file and produces 3,484 findings against the FDA pack, which is the exact inverse of the failure it spends most of its effort avoiding. Reporting nothing about a file you could not fully read is safer than reporting it clean, and it is still not an answer.

## The CISA 2026 practices group

`sbomqs compliance --ntia` reports itself as "NTIA Minimum Elements (2026)". It evaluates 17 distinct elements: ten about the document and seven about each component. CISA's 2026 v2.1 minimum elements are 23, in three groups: 9 SBOM Metadata, 8 Component Data and **6 Practices**.

The two data groups are well covered. **No element in the Practices group is evaluated at all**, which is where Coverage, Distribution and Delivery, Frequency and Explicitly Identifying Unknown Information live. Those are the four that a device submission is judged on, and they are the four that no tool reports.

## Reproducing this

```
pip install ntia-conformance-checker==5.0.3
# sbomqs v2.1.2 from https://github.com/interlynk-io/sbomqs/releases
python3 scripts/teardown.py --run /path/to/sbomqs
```

The raw results are committed at `docs/teardown-data/results.json`. `verify.sh` runs `--check`, which regenerates this document from that data and fails if it has drifted, and which fails if any `fda-524b` rule has no row above. That last check is SPEC.md 1.5's second acceptance test, which was also unmet until now.

