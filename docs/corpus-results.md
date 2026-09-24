# What the engine finds across the corpus

Every rule pack run against every corpus file, with the counts as the engine actually produces them. SPEC.md step 1.12.

**Generated, not written.** Regenerate with:

```
python3 scripts/corpus-results.py --write
```

`verify.sh` runs `--check`, so this file failing to match the engine's own golden results is a build failure rather than a stale document. The golden results are themselves checked byte-for-byte against the reference implementation by the check that runs before it.

## What this was generated from

SPEC.md asks for this document to be dated. The date below is the date of the INPUTS, not of the run, and that is deliberate: this file is a pure function of the corpus and the rule packs, so a run-date would change every time somebody regenerated it while nothing about the result had moved. Worse, `--check` would then fail a day after each write and have to be taught to ignore a line, which is how a check stops checking.

| Input | Version or date | Digest |
|---|---|---|
| Corpus, 21 files | measured 2026-09-20 | `2bd3cb1608b47efd` |
| `cisa-2026-v2.1` | 1.0.0 | `12d07a05dc8692ad` |
| `fda-524b` | 1.0.0 | `972fdd9ed88dc7a0` |
| `g7-ai-2026` | 1.0.0 | `f51c7c10f3d8c98e` |

## Totals

| Pack | error | warning | info | advisory | total |
|---|---|---|---|---|---|
| CISA 2026 Minimum Elements for a Software Bill of Materials, v2.1 | 0 | 9996 | 881 | 0 | 10877 |
| FDA section 524B premarket submission profile | 0 | 13532 | 12 | 0 | 13544 |
| G7 SBOM for AI, minimum elements | 0 | 105 | 221 | 0 | 326 |

21 files, 3 rule packs. A finding is one rule against one failing node, so a file with 1,160 components can produce 1,160 findings from a single rule; the per-rule table below is where that becomes visible.

## Per file

| File | Format | Components | CISA 2026 Minimum Elements for a Software Bill of Materials, v2.1 | FDA section 524B premarket submission profile | G7 SBOM for AI, minimum elements |
|---|---|---|---|---|---|
| `cyclonedx__ascii-boxes-sbom-cdx.json` | cyclonedx 1.4 | 2 | 15 | 14 | 41 |
| `cyclonedx__ghidra-sbom-cdx.json` | cyclonedx 1.4 | 109 | 292 | 398 | 45 |
| `cyclonedx__harp-darwin-amd64.sbom.json` | cyclonedx 1.4 | 156 | 473 | 472 | 39 |
| `cyclonedx__joc-cockpit-sbom-cdx.json` | cyclonedx 1.3 | 160 | 168 | 485 | 39 |
| `cyclonedx__kawipiko-sbom-cdx.json` | cyclonedx 1.4 | 27 | 58 | 85 | 39 |
| `cyclonedx__obsidian-sailboat-sbom-cdx.json` | cyclonedx 1.2 | 141 | 10 | 290 | 45 |
| `cyclonedx__redis-commander-sbom-cdx.json` | cyclonedx 1.4 | 435 | 521 | 1309 | 39 |
| `cyclonedx__text-statistician-cdx.json` | cyclonedx 1.3 | 141 | 147 | 428 | 39 |
| `spdx__grype-sbom.spdx.json` | spdx SPDX-2.2 | 1160 | 3482 | 3484 | 0 |
| `spdx__helm-controller_0.16.0_sbom.spdx.json` | spdx SPDX-2.2 | 173 | 527 | 524 | 0 |
| `spdx__image-automation-controller_0.20.0_sbom.spdx.json` | spdx SPDX-2.2 | 134 | 410 | 407 | 0 |
| `spdx__image-reflector-controller_0.16.0_sbom.spdx.json` | spdx SPDX-2.2 | 112 | 344 | 341 | 0 |
| `spdx__julia.spdx.json` | spdx SPDX-2.2 | 34 | 158 | 169 | 0 |
| `spdx__jx-darwin-arm64.tar.gz.sbom.json` | spdx SPDX-2.2 | 84 | 172 | 254 | 0 |
| `spdx__lab-syft.json` | spdx SPDX-2.3 | 380 | 707 | 1059 | 0 |
| `spdx__lab-tern.json` | spdx SPDX-2.2 | 175 | 674 | 708 | 0 |
| `spdx__lab-trivy.json` | spdx SPDX-2.2 | 363 | 1005 | 1095 | 0 |
| `spdx__microsoft-sbom-tool.spdx.json` | spdx SPDX-2.2 | 123 | 374 | 361 | 0 |
| `spdx__missionlz.spdx.json` | spdx SPDX-2.2 | 2 | 11 | 7 | 0 |
| `spdx__powershell.spdx.json` | spdx SPDX-2.2 | 331 | 667 | 995 | 0 |
| `spdx__source-controller_0.21.2_sbom.spdx.json` | spdx SPDX-2.2 | 218 | 662 | 659 | 0 |

## Where the findings are

The largest groups, by total instances across the corpus. Two rules produce more findings than everything else combined, and both are asking for a field that neither CycloneDX nor SPDX has.

### CISA 2026 Minimum Elements for a Software Bill of Materials, v2.1

| Rule | Severity | Instances | Files | Title |
|---|---|---|---|---|
| `CISA-CD-001` | warning | 4214 | 20 | Component Producer is present, singular, and not a bare acronym |
| `CISA-CD-003` | warning | 2835 | 16 | Component Hash Value is present, or explicitly unknown |
| `CISA-CD-007` | warning | 2507 | 12 | Component Name is present and is not a bare acronym |
| `CISA-CD-006` | info | 865 | 14 | Component License is present, or explicitly unknown |
| `CISA-CD-005` | warning | 263 | 8 | Every component carries at least one machine-readable identifier |
| `CISA-CD-008` | warning | 77 | 9 | Component Version is present, or explicitly unknown |
| `CISA-MD-002` | warning | 21 | 21 | SBOM Author Signature is present |
| `CISA-MD-005` | warning | 21 | 21 | SBOM Generation Context is declared |
| `CISA-PR-004` | warning | 21 | 21 | Explicitly identifying unknown information: gaps are stated, not silent |
| `CISA-CD-004` | warning | 11 | 11 | Component Hash Algorithm is a registered IANA Hash Function Textual Name |
| `CISA-CD-002` | warning | 8 | 8 | Dependency relationships are declared |
| `CISA-MD-001` | warning | 8 | 8 | SBOM Author is present and is not a bare acronym |

### FDA section 524B premarket submission profile

| Rule | Severity | Instances | Files | Title |
|---|---|---|---|---|
| `FDA-SUP-001` | warning | 4460 | 21 | Every component declares a software level of support |
| `FDA-SUP-002` | warning | 4460 | 21 | Every component declares an end-of-support date |
| `FDA-NTIA-001` | warning | 4200 | 19 | Supplier name is present for every component |
| `FDA-NTIA-004` | warning | 267 | 10 | Other unique identifiers are present |
| `FDA-NTIA-003` | warning | 77 | 9 | Version of the component is present |
| `FDA-JUST-001` | warning | 21 | 21 | If SBOM information is missing, a justification is present |
| `FDA-VULN-001` | warning | 21 | 21 | Known vulnerabilities are identified, including CISA KEV entries |
| `FDA-DEPTH-001` | warning | 8 | 8 | Transitive dependencies are present |
| `FDA-NTIA-005` | warning | 8 | 8 | Dependency relationships are declared |
| `FDA-NTIA-006` | warning | 8 | 8 | Author of the SBOM data is present |
| `FDA-TRACE-001` | info | 8 | 8 | The SBOM can be traced to the threat model and risk assessment |
| `FDA-USER-001` | info | 4 | 4 | The SBOM is in a form that can be provided to users continuously |

### G7 SBOM for AI, minimum elements

| Rule | Severity | Instances | Files | Title |
|---|---|---|---|---|
| `G7-DS-001` | warning | 8 | 8 | Dataset name is stated |
| `G7-DS-002` | info | 8 | 8 | Dataset description is stated |
| `G7-DS-003` | info | 8 | 8 | Dataset content is stated |
| `G7-DS-004` | warning | 8 | 8 | Dataset identifier is stated |
| `G7-DS-005` | info | 8 | 8 | Dataset hash is stated |
| `G7-DS-006` | info | 8 | 8 | Dataset provenance is stated |
| `G7-DS-007` | info | 8 | 8 | Dataset statistical properties is stated |
| `G7-DS-008` | warning | 8 | 8 | Dataset sensitivity is stated |
| `G7-DS-010` | info | 8 | 8 | Dataset license is stated |
| `G7-INF-002` | info | 8 | 8 | Infrastructure hardware is stated |
| `G7-KPI-001` | info | 8 | 8 | Security metrics is stated |
| `G7-KPI-002` | info | 8 | 8 | Operational performance KPIs is stated |

## What the corpus does not say

**0 of 21 files declare a vulnerability.** Not one. These are real bills of material published by real projects, and none of them carries a `vulnerabilities` array at all. Every advisory `stratifypro advisories` finds against them is therefore one the file did not declare, which is what makes that command's headline number the whole number.

That is a statement about the corpus and about the state of published SBOMs, not about these projects. Declaring known vulnerabilities in a bill of material is permitted by both formats and practised by almost nobody.

