# What is measured, and what is not

The free checker at the apex domain **makes no request after the page loads**.
Not an analytics call, not an error report, not a heartbeat. `verify.sh`
enforces it by refusing any network primitive in anything that can reach the
browser bundle, and the scan list is derived from `next.config.mjs` rather than
written out, so a package pulled into the bundle is scanned automatically.

This document exists because "we measure nothing" is the obvious reading of
that, and it is wrong.

## The decision this records

SPEC.md 1.10 asks for five instrumentation events: arrival, file loaded,
findings shown, report saved, contact clicked. SPEC.md 1.8 requires the free
checker be "Fully client-side. Network tab shows zero requests after page
load", and `docs/copy.md` tells a visitor "Your file is checked in this
browser. It is never uploaded."

Both cannot be true. **1.8 wins. 1.10 and 1.11 are withdrawn, not deferred.**

Three reasons, in the order they matter.

**A conditional promise cannot be enforced by the check that enforces this
one.** The tempting middle position is to fire events only after a deliberate
outward click, and keep a narrower promise. But `verify.sh`'s network guard
works by finding network primitives and failing. It has been wrong four times
and reported clean every time, once on a planted `POST` of the parsed SBOM
sitting in `packages/engine`. "Zero network primitives" is a property a grep
can decide. "Only these two requests, only after a click" is a judgement about
which call is which, and that judgement is precisely what failed four times.
The middle option buys the least data of the three and pays for it by
weakening the one check that makes the claim worth stating.

**Two of the five events do not need the page to say anything.** See below.
The three that do need it are the three that fire while a customer's bill of
materials is loaded in the tab.

**The buyer is the reason.** A regulatory affairs consultant is handling a
client's device under an NDA, and an SBOM is a map of every weakness in that
device. The competing validators are hosted and upload. When a vendor security
questionnaire asks whether the free tool transmits anything about their files,
"no, and the build fails if that changes" is one line. Anything else is a
conversation about telemetry on a page that reads SBOMs, during a sale.

## What is measured anyway

| SPEC 1.10 event | Available | How |
|---|---|---|
| arrival | yes | Edge and hosting request logs. A page view is a request for the page, which happens before "after page load" begins. No client code. |
| contact clicked | yes | At the destination. A mailto, a form submission or a calendar booking is observable where it lands, not where it was clicked. |
| file loaded | **no** | Would require the page to speak while a client SBOM is in memory. |
| findings shown | **no** | Same. |
| report saved | **no** | Same. The report is written by the browser to the visitor's disk; nothing else is entitled to know. |

So the funnel is visible at both ends and opaque in the middle. That is the
trade, stated rather than discovered: **how many people arrived** and **how
many got in touch**, with nothing in between.

## What this costs

Real things, named rather than waved away.

- No conversion rate. The ratio between arrivals and contacts is knowable; the
  steps between them are not, so a drop-off cannot be located.
- No error reporting from the public page. A visitor whose file crashes the
  checker is a visitor nobody hears about. The mitigation is that the engine is
  the most heavily tested thing in the repository and runs the same code path
  in CI over the corpus, but a mitigation is not a monitor.
- No sample of what people actually upload. That would be the single most
  useful dataset for improving the rule packs, and it is exactly the dataset
  the promise exists to refuse.

## What would reverse this

Not a growth target. Reversing means withdrawing a published privacy claim from
people who have already relied on it, which is a one-way door with the buyer
this product is for.

The honest reversal path is a **separate, signed-in surface**: the firm
workspace at the app subdomain is a different promise to a different person who
has a contract. Instrumenting that changes nothing about the apex checker.
`docs/copy.md` already scopes the sentence to the free checker rather than to
the company.

## Where the claim is enforced

- `verify.sh`, "the file checker cannot upload anything": no network primitive
  in `apps/web/app` or in any package `next.config.mjs` transpiles into the
  bundle.
- `scripts/mirror-mutation-test.py`: the runtime half, for the advisory
  matcher, replacing `fetch`, `XMLHttpRequest` and the node network entry
  points with something that throws.
- `scripts/check-copy.py`: the site says what `docs/copy.md` approved, rather
  than a paraphrase of it.
