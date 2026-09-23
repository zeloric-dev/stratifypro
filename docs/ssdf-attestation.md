# NIST SSDF self-attestation: DRAFT, UNSIGNED

**This document is not an attestation yet.** It is a draft of one, and nobody
has signed it. SPEC.md 2.10 asks for a NIST SSDF self-attestation because
MC2 v2 clause 46 requests secure-development attestation by name.

A signed self-attestation is a representation by a named individual. Under the
CISA Secure Software Development Attestation Form it carries False Claims Act
exposure, and that is not a theoretical risk attached to a compliance
checkbox: it is the reason every row below says what enforces it, and the
reason the rows that nothing enforces say **not met** instead of yes.

**Signing this requires a person**, who must read it, disagree where it is
wrong, close the gaps listed at the end or accept them in writing, and put
their name on it. That has not happened.

## How to read the evidence column

Every `met` row names the thing that makes it true, and every named thing is
a file or a check in this repository that `scripts/check-ssdf.py` confirms
exists. An attestation that cites a check somebody deleted last quarter is
worse than one that claims nothing. This session already produced one
fabricated citation in a published document, which is why the citations here
are machine-checked.

`verify.sh` is the offline gate. It runs first in CI and blocks the build job.

---

## PO: Prepare the Organization

| SSDF | Practice | Status | What makes it true |
|---|---|---|---|
| PO.1.1 | Security requirements for development are defined | met | `CLAUDE.md` and `SPEC.md` state them, and `verify.sh` enforces a subset |
| PO.1.2 | Requirements for a software product are defined | met | `SPEC.md`, with a numbered acceptance test per step |
| PO.1.3 | Toolchain is defined | met | `pnpm-workspace.yaml`, pinned versions, `.github/workflows/ci.yml` |
| PO.2.1 | Roles and responsibilities are defined | **not met** | One person. There is nobody to separate duties from |
| PO.2.2 | Role-specific training | **not met** | Same |
| PO.3.1 | Toolchain supports secure practices | met | `verify.sh`, 28 checks, run before every merge |
| PO.3.2 | Tooling is deployed and configured to produce evidence | met | Golden artifacts, benchmark, corpus results, teardown data, all regenerable by command |
| PO.3.3 | Artifacts of toolchain use are generated and protected | partial | Artifacts are committed and reproducible; they are not signed |
| PO.4.1 | Criteria for software security checks are defined | met | Each check in `verify.sh` carries a written reason and a recorded past failure |
| PO.4.2 | Information is gathered to make checks meaningful | met | Mutation tests: a check nobody has watched fail is treated as a decoration |
| PO.5.1 | Separate development environments | **not met** | Development is one machine |

## PS: Protect the Software

| SSDF | Practice | Status | What makes it true |
|---|---|---|---|
| PS.1.1 | Code is stored securely and access-controlled | partial | Public repository, GitHub access control. No branch protection rules configured |
| PS.2.1 | Integrity verification is made available to consumers | **not met** | Nothing published is signed. SPEC.md Step 11 is the plan; it is gated behind Gate 2 and unbuilt |
| PS.3.1 | Each release is archived and provenance recorded | **not met** | Nothing has been released. `apps/cli` is `private: true` at version 0.0.0 |
| PS.3.2 | An SBOM is provided for each release | **not met** | Same. This is the one a reader will notice, and it should be noticed |

## PW: Produce Well-Secured Software

| SSDF | Practice | Status | What makes it true |
|---|---|---|---|
| PW.1.1 | Design meets security requirements and mitigates risks | partial | The architectural boundaries are enforced rather than intended: `scripts/check-model-boundary.py` and the two network scans in `verify.sh` |
| PW.1.2 | Design is reviewed | partial | Every pull request in this repository has been reviewed, and each review found a defect the tests missed. The reviewer is not independent |
| PW.1.3 | Third-party software is verified | met | `pnpm audit --prod` in CI; zero runtime dependencies, asserted by a CI step; no dependency may run install scripts |
| PW.2.1 | Code is reviewed or analysed | partial | Reviewed, not independently |
| PW.4.1 | Existing well-secured software is reused | met | Zero runtime dependencies is a deliberate reduction of attack surface, and it is enforced, not intended |
| PW.4.4 | Third-party components are verified before use | met | `pnpm audit --prod`; `sbomqs` binary verified against its published sha256 before execution in `scripts/teardown.py` |
| PW.5.1 | Source code adheres to secure coding practices | partial | Output is escaped before interpolation and logo URLs are validated rather than trusted; there is no static analysis tool beyond TypeScript |
| PW.6.1 | Compiler and build tools are configured for security | partial | TypeScript strict mode; no hardening flags beyond that |
| PW.7.1 | Code is reviewed for vulnerabilities | partial | By hand, by one person |
| PW.7.2 | Automated analysis is used | partial | 294 tests, 28 `verify.sh` checks, 6 mutation tests. No SAST |
| PW.8.1 | Code is tested for vulnerabilities | partial | Adversarial tests exist for the paths that carry risk: escaping, logo URLs, the network walls, the model boundary |
| PW.8.2 | Test results are documented | met | CI is public on every pull request |
| PW.9.1 | Default settings are secure | met | The browser checker sends nothing, asserted by a scan and a mutation test. The matcher makes no outbound call, asserted the same way |
| PW.9.2 | Default settings are verified | met | Same two checks, both mutation-tested |

## RV: Respond to Vulnerabilities

| SSDF | Practice | Status | What makes it true |
|---|---|---|---|
| RV.1.1 | Vulnerability information is gathered | partial | `pnpm audit --prod` in CI and a local advisory mirror. Nothing watches our own published artifacts, because nothing is published |
| RV.1.2 | A policy for receiving reports exists | **not met** | There is no `SECURITY.md` and no disclosure address |
| RV.1.3 | Root cause analysis is performed | met | Every defect found this project has a written record naming the cause, in `docs/plan-status.md` or in the check that now prevents it |
| RV.2.1 | Vulnerabilities are assessed and prioritised | **not met** | No process exists, because no report has ever arrived |
| RV.2.2 | Remediation is planned and executed | **not met** | Same |
| RV.3.1 | Root causes are analysed to find similar problems | met | The recurring pattern is recorded and acted on: a check nobody has watched fail is not trusted, and six mutation tests exist because of it |
| RV.3.3 | The SDLC is reviewed and updated | met | `docs/plan-status.md` exists to record where the process failed, including where this file's own headings were wrong |

---

## The gaps, gathered

Anyone reading this should read this section first.

1. **Nothing is signed and nothing is released.** PS.2.1, PS.3.1 and PS.3.2 are
   all not met for the same reason: there is no release. The CLI is private at
   version 0.0.0.
2. **There is no `SECURITY.md`** and no address to send a vulnerability report
   to. RV.1.2 is not met and it is the cheapest gap here to close.
3. **No incident response process exists.** RV.2.1 and RV.2.2. SPEC.md 2.9
   specifies one, committing to 5-day breach notice and 3-business-day CISA KEV
   disclosure. It has not been written.
4. **Review is not independent.** One person writes and reviews. Every review on
   this repository has found a real defect, which argues the review is real; it
   does not make it independent.
5. **No separate environments, no role separation, no training.** PO.2.1, PO.2.2
   and PO.5.1. These are one-person-company facts, not oversights, and an
   attestation that claimed otherwise would be false.
6. **No SAST.** PW.7.2 is partial: there are tests and checks, and no static
   analyser beyond the TypeScript compiler.

## What this document is worth

Roughly half of SSDF is met and enforced by something that fails the build when
it stops being true, which is more than a form asking for yes or no would
capture. The other half is honestly not met, and most of it is not met because
this is one person who has not shipped a release yet.

A reviewer asking for a secure-development attestation is entitled to that
picture rather than a page of ticks. Presenting this as complete would be a
false representation, and the practices it describes exist specifically to make
false representations hard.
