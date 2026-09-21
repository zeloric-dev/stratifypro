# CISA 2026 minimum elements, verified field by field

Task 0.7 in SPEC.md. Blocking: a rule pack built to the 2021 baseline is wrong, and
shipping one would be a false claim.

Verified 13 September 2026 against the document text. Source retrieved from
`https://www.ic3.gov/CSA/2026/260729.pdf` because cisa.gov and media.defense.gov both
return 403 to automated retrieval. PDF metadata confirms Title "2026 Minimum Elements
for a Software Bill of Materials (SBOM)", Author CISA, 23 pages, created 2026-07-28.

**Version 2.1. Published 29 July 2026. TLP:CLEAR. No document number exists**: there is
no CSI number, product ID or publication number in the text or the metadata. The `CSI_`
prefix appears only in the media.defense.gov filename. Do not cite a document number.

## The count, which is easy to get wrong

**17 data fields: 9 SBOM Metadata and 8 Component Data.** Not 18, and not 9 plus 9.
Appendix A Table 1 lists exactly 17 rows; the body headings agree. Plus **6 practices
and processes**, giving 23 rules in the pack.

## Mapping: element to rule

| # | Element | Status vs 2021 | Rule |
|---|---|---|---|
| **SBOM Metadata** | | | |
| 1 | SBOM Author | Major, renamed from Author of SBOM Data | CISA-MD-001 |
| 2 | SBOM Author Signature | **New** | CISA-MD-002 |
| 3 | SBOM Data Format Name | **New** | CISA-MD-003 |
| 4 | SBOM Data Format Version | **New** | CISA-MD-004 |
| 5 | SBOM Generation Context | **New** | CISA-MD-005 |
| 6 | SBOM Timestamp | Minor, now RFC 9557 | CISA-MD-006 |
| 7 | SBOM Tool Name | **New** | CISA-MD-007 |
| 8 | SBOM Tool Version | **New** | CISA-MD-008 |
| 9 | SBOM Version | **New** | CISA-MD-009 |
| **Component Data** | | | |
| 1 | Component Producer | Major, renamed from **Supplier Name** | CISA-CD-001 |
| 2 | Component Dependency Relationship | Minor | CISA-CD-002 |
| 3 | Component Hash Value | **New** | CISA-CD-003 |
| 4 | Component Hash Algorithm | **New** | CISA-CD-004 |
| 5 | Component Identifiers | Major, renamed from Other Unique Identifiers | CISA-CD-005 |
| 6 | Component License | **New** | CISA-CD-006 |
| 7 | Component Name | Minor, multiple entries now allowed | CISA-CD-007 |
| 8 | Component Version | Major, renamed from Version of the Component | CISA-CD-008 |
| **Practices** | | | |
| 1 | Accommodation of Updates to SBOM Data | Major, renamed from Accommodation of Mistakes | CISA-PR-001 |
| 2 | Coverage | Major, **replaces Depth** | CISA-PR-002 |
| 3 | Distribution and Delivery | Minor, absorbed Access Control | CISA-PR-003 |
| 4 | Explicitly Identifying Unknown Information | Major, renamed from Known Unknowns | CISA-PR-004 |
| 5 | Frequency | Minor | CISA-PR-005 |
| 6 | Machine-Processable Data | Major, renamed from Automation Support | CISA-PR-006 |

**23 elements, 23 rules, one to one.** No element is unimplemented and no rule is
invented.

## Eight renames that break a 2021-era pack

Author of SBOM Data → SBOM Author · **Supplier Name → Component Producer** · Version of
the Component → Component Version · Other Unique Identifiers → Component Identifiers ·
**Depth → Coverage** · Known Unknowns → Explicitly Identifying Unknown Information ·
Accommodation of Mistakes → Accommodation of Updates to SBOM Data · Automation Support
→ Machine-Processable Data.

## Two removals, and the second is the one people miss

**Access Control** is gone as a standalone element, folded into Distribution and
Delivery.

**SWID tags are removed from the list of accepted data formats.** The document's
reason: "SWID tags are not a widely used SBOM data format for which multiple tools
exist." A validator that still accepts SWID as a conformant format is now wrong. This
removal is not in the document's own "Notable Updates" summary and appears only in
Appendix B.

## Four findings that change how a validator must behave

**1. There is no MUST, and therefore no severity tiering can be derived.** Zero
occurrences of "shall". Zero of "recommended". One "must", in prose about sharing
mechanisms rather than about a data field. "should" appears 66 times and "may" 42
times. **The pack is marked `normativeLanguage: false` and its maximum severity is
`warning`.** Any tool that grades this document as MUST versus SHOULD invented the
distinction.

**2. Timestamps are RFC 9557, not RFC 3339.** RFC 9557 is RFC 3339 plus optional
bracketed suffixes such as `[America/New_York]`. A validator accepting only RFC 3339
rejects conformant files. CISA-MD-006's pattern accepts both.

**3. Depth changed meaning, not just name.** The 2021 Depth element covered top-level
dependencies only. Coverage now includes horizontal as well as vertical breadth and
sets **no minimum depth**. A pack carrying the old top-level reading understates what
is asked for.

**4. An element is not a field.** The document says plainly: "Each Data Fields element
need not correlate directly with a particular data field in an SBOM data format, and an
implemented data field may satisfy one or more of the minimum elements." A
component-name and component-version pair may satisfy two elements at once, and format
field names differ. **The rules check for information, never for a named field.**

## Standards citations the document uses, and which to quote

- PURL is **Ecma International ECMA-427**, December 2025. Cite the standard, not the
  GitHub specification.
- CycloneDX is **Ecma International ECMA-424**, December 2025.
- SPDX is **ISO/IEC 5962:2021**.
- SWHID is **ISO/IEC 18670:2025**.
- Timestamps: **RFC 9557**. Serial-number identifiers: **RFC 9562**.
- Hash algorithm names: **IANA Hash Function Textual Names**.

## The thing not to do with this document

**Do not apply it to the FDA pack.** The February 2026 FDA guidance still points at the
**October 2021 NTIA** baseline attributes. Checking an FDA submission against the 2026
element set is checking against a document FDA has not adopted. `fda-524b.json` and
`cisa-2026-v2.1.json` are different on purpose.
