# Incident response plan

SPEC.md 2.9. Acceptance: "Commits to 5-day breach notice and 3-business-day
CISA KEV disclosure, matching MC2 v2 clauses 33 and 35. Tested once with a
tabletop walkthrough."

**The tabletop walkthrough has not happened.** That half of the acceptance is
unmet and is listed at the end. A plan nobody has rehearsed is a document, and
the gap between a document and a capability is the thing this repository keeps
writing checks about.

## Why a one-person company writes this down at all

Not for the file. A medical device manufacturer's security questionnaire asks
whether a supplier has a written incident response plan and what its
notification windows are, and "we would obviously tell you" is an answer that
ends a procurement conversation.

The second reason is worse and more likely: an incident is the moment when
judgement is poorest. Deciding a notification window while frightened, at
night, with a customer waiting, produces a different answer from deciding it
now. The point of writing it down is to remove that decision from the incident.

## The commitments

These are binding on us and are repeated in `SECURITY.md`.

| Event | Commitment | Source |
|---|---|---|
| Acknowledging a report | 3 business days | ours |
| Assessment and plan to the reporter | 10 business days | ours |
| **Notifying affected users of a confirmed breach** | **5 days** | MC2 v2 clause 33 |
| **Disclosing a confirmed CISA KEV issue in our software** | **3 business days** | MC2 v2 clause 35 |

"Days" for the breach notice means calendar days, not business days. That is
the stricter reading, and a supplier who quietly reads a five-day clause as
seven working days has taken an extra weekend out of a customer's response
time.

## What counts as an incident

Three kinds, and the first is the one this product is uniquely exposed to.

**A broken promise about data.** Any path by which a submitted bill of material
leaves the browser, or by which the advisory matcher makes an outbound call
carrying component data. These are promises made in product copy and enforced
by checks. If one is broken in shipped code, it is an incident even if no data
was actually sent, because the promise was false while it was shipped.

**A wrong answer that a customer relied on.** A rule that fires when it should
not, a severity that misstates enforcement consequence, an advisory match
against the wrong component, or an attestation that claims more than it can
support. A regulatory submission built on a wrong answer is the harm this
product exists to prevent, and it does not announce itself as a security
incident.

**A conventional compromise.** Credential exposure, a malicious dependency,
unauthorised access to the repository or the deployment.

## The procedure

1. **Write down the time and what is known.** In a file, in the repository, on
   a branch. Memory during an incident is unreliable and the notification
   clocks start from a moment somebody has to be able to name later.

2. **Stop the bleeding before understanding it.** Revoke the credential, take
   the deployment down, pull the release. A site that is down is a known state;
   a site that is quietly leaking is not. This product's whole argument is that
   no answer beats a wrong answer, and the same applies to its own operation.

3. **Decide whether it is a breach.** A breach means customer data was or
   plausibly may have been exposed. If it is unclear, the clock is running: the
   5-day window is not paused by an investigation being inconvenient.

4. **Start the clocks.** Breach: 5 days. CISA KEV issue in our software: 3
   business days. Set the deadline before the analysis, not after, so the
   analysis cannot expand to fill the window.

5. **Notify.** What happened, when, what data was affected, what has been done,
   what the recipient should do. Say what is not yet known rather than waiting
   until everything is known.

6. **Fix it, and add the check that makes it not happen again.** Every defect
   found in this project has a written record naming the cause and, where it
   can, a check that fails the build the next time. An incident with no check
   added is an incident that is allowed to recur.

7. **Write the post-incident record** into `docs/plan-status.md`, including what
   the process got wrong. That file exists for exactly this.

## Who

One person. There is no rota, no escalation path and no second pair of hands,
and pretending otherwise in a questionnaire would be a false representation.

The mitigation is that everything needed to respond is in the repository and
reproducible by command: the checks, the corpus, the golden results, the
benchmark. SPEC.md 2.8 asks for source code escrow and a written continuity
plan before the first paid contract, which is the real answer to "what if that
person is unavailable", and it has not been done.

## What is not done

1. **No tabletop walkthrough.** Half of 2.9's acceptance. Until it is run, the
   procedure above is untested and the timings in it are estimates.
2. **No continuity plan and no escrow.** SPEC.md 2.8, required before the first
   paid contract.
3. **No customers.** Nothing has been notified because there is nobody to
   notify. Every commitment here is untested against a real recipient.
