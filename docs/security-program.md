# Written security program: DRAFT, UNSIGNED

SPEC.md 2.11 asks for a written security program mapped to CIS Controls
Implementation Group 1, on the basis that Texas SB 2610 offers a shield against
exemplary damages to a business that maintains one.

**This is not legal advice and nobody has confirmed the shield applies.** What
SB 2610 requires, whether this business is in scope, and which tier of its
requirements applies are questions for a Texas lawyer, and the answer depends
on facts about the entity that do not exist yet: there is no company. SPEC.md
2.8 records the same gap. This document is the engineering half, written so
that the legal half has something real to look at rather than a promise.

**It is also unsigned**, for the reason `docs/ssdf-attestation.md` is unsigned:
a security program is a representation, and a person has to read it, disagree
where it is wrong, and put their name to it.

## Scope, stated before the table

One person. One laptop. One GitHub organisation. One Vercel project. No
office, no server, no customer data, and no customers.

That is the honest scope, and most of CIS IG1 is written for an enterprise with
an IT estate. A program claiming to implement asset inventory, account
management and network monitoring across that estate would be describing a
company that does not exist. The rows below say `n/a, no estate` where that is
the truth, and they say `not met` where the control genuinely applies and is
not done.

The distinction matters: `n/a` is not a quieter way of writing `not met`.

## CIS Controls v8.1, Implementation Group 1

| # | Control | Status | What makes it true |
|---|---|---|---|
| 1 | Inventory and control of enterprise assets | partial | One laptop, known. No automated inventory, and nothing to discover |
| 2 | Inventory and control of software assets | met | `docs/self/stratifypro.cdx.json`, generated and checked on every build. Zero runtime dependencies, enforced by CI |
| 3 | Data protection | met | No customer data is held. The browser checker parses files locally and the advisory matcher makes no outbound call, both enforced by mutation-tested scans |
| 4 | Secure configuration of assets and software | partial | Disk encryption and screen lock on the one machine. No managed baseline |
| 5 | Account management | partial | Individual accounts with unique credentials. No account inventory, because there is no estate |
| 6 | Access control management | partial | Multi-factor on GitHub. No formal grant and revoke process, and nobody to grant to |
| 7 | Continuous vulnerability management | met | `pnpm audit --prod` gates every build; a local advisory mirror; a weekly end-of-support freshness job |
| 8 | Audit log management | partial | Git history and GitHub audit log. No log aggregation or retention policy |
| 9 | Email and web browser protections | partial | Managed provider defaults. Nothing configured deliberately |
| 10 | Malware defences | partial | Operating system defaults. No dependency may run install scripts, enforced by `verify.sh` |
| 11 | Data recovery | partial | Everything of value is in a public git repository with distributed copies. No tested restore procedure |
| 12 | Network infrastructure management | n/a, no estate | No network to manage |
| 13 | Network monitoring and defence | n/a, no estate | Same |
| 14 | Security awareness and skills training | **not met** | One person, no training programme. `docs/ssdf-attestation.md` says the same about PO.2.2 |
| 15 | Service provider management | partial | GitHub, Vercel and Cloudflare are the providers. No written assessment of any of them |
| 16 | Application software security | met | The strongest area, and the product is the reason: 33 checks in `verify.sh`, 294 tests, a model containment wall, output escaping and logo validation, each one mutation-tested |
| 17 | Incident response management | partial | `docs/incident-response.md` exists with named windows. Never rehearsed |
| 18 | Penetration testing | **not met** | None has been done |

## Where this is genuinely strong, and why

Control 16 and Control 7 are the two that matter for a software supplier, and
they are the two that are met rather than partial. That is not an accident of
effort: the product is a conformance checker, so the checks that keep it honest
are the same discipline applied to itself.

Specifically, and each of these fails the build when it stops being true:

- No network primitive may reach the browser checker or the advisory matcher.
- No model call may reach a severity assignment, the attestation text or a
  bundle.
- The attestation wording must equal the specification character for character.
- Every package must declare the licence the repository ships.
- Every claim in the published results must be the engine's own output.

Six of those checks are mutation-tested, which is the difference between a
check and a decoration.

## Where it is weak, and the weakness is structural

Controls 14 and 18 are not met, and Control 17 is partial. All three need
somebody other than the author: training, a penetration test, and a rehearsal
with a second person in the room. **One person cannot review their own work
independently**, and every document in this repository that touches the
question says so rather than implying a team.

`docs/ssdf-attestation.md` records the same limit from the SSDF angle. It is
the same fact, and it is the fact that a signed program would be representing.

## What is not done

1. **No legal review.** Whether SB 2610 applies, which tier, and whether this
   satisfies it are questions nobody qualified has answered.
2. **No entity.** There is no company to hold a program, which is also why
   SPEC.md 2.8's escrow agreement is unsigned.
3. **No penetration test.** Control 18.
4. **No security training.** Control 14.
5. **The incident response plan has never been rehearsed.** Control 17, and the
   open half of SPEC.md 2.9.
6. **No written assessment of the service providers.** Control 15.
