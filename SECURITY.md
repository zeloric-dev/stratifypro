# Reporting a vulnerability

**Use GitHub's private vulnerability reporting:**
<https://github.com/zeloric-dev/stratifypro/security/advisories/new>

That channel is enabled on this repository. It is private until an advisory is
published, it does not require you to find an email address, and it does not
require you to trust that one is being read.

**Please do not open a public issue for a security problem.** A public issue is
a disclosure, and it is a disclosure made on your timetable rather than on one
agreed with the people who have to fix it.

## What this project is, so you can judge the impact

StratifyPro checks software bills of material against published minimum
elements. Two properties are load-bearing, and a report that breaks either is a
serious finding even if nothing crashes:

1. **The browser checker uploads nothing.** A file dropped into the web checker
   is parsed in the browser. Any path that sends its contents anywhere is a
   vulnerability, not a feature request. `verify.sh` enforces this with a scan
   over everything that reaches the bundle, and the scan is mutation-tested.

2. **The advisory matcher makes no outbound call.** Querying an API per
   component would send a manufacturer's bill of materials to a third party
   before they have filed. Everything is answered from a local mirror.

Beyond those: the report is a standalone HTML file that gets emailed and opened
from disk, so anything that executes when it is opened is high impact, and
component names, versions, firm names and logo URLs all come from untrusted
input.

## What we commit to

These are the same commitments as `docs/incident-response.md`, which has the
detail:

| | |
|---|---|
| Acknowledge your report | 3 business days |
| Tell you our assessment and a plan | 10 business days |
| Notify affected users of a confirmed breach | **5 days** |
| Disclose a confirmed CISA KEV issue in our software | **3 business days** |

The last two match MC2 v2 clauses 33 and 35, which is what a medical device
manufacturer's security questionnaire asks for.

## What we cannot promise

**There is no bug bounty.** This is a one-person project with no revenue. We
cannot pay you, and saying otherwise to encourage reports would be a lie told
to people doing us a favour.

**There is no 24-hour response.** The business days above are real business
days, and there is one person behind them.

**Nothing is released yet**, so there is no published artifact to be vulnerable
in the supply-chain sense. The CLI is unpublished and the site is the only
deployed surface. `docs/ssdf-attestation.md` is candid about what that means
for the practices we cannot yet claim.

## Credit

If you want it, you will be named in the advisory and in the commit that fixes
the problem. If you would rather not be, say so and you will not be.
