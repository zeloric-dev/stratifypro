# The sample shown on arrival

SPEC.md 1.9: "A defective sample preloaded on arrival." Acceptance: "First paint
shows real findings before the visitor does anything."

`meridian-infusion-pump.cdx.json` is a **fictional device from a fictional
company.** There is no Meridian Medical Systems and there is no MX-40 infusion
pump. That is deliberate and it is not decoration.

The obvious way to preload a defective sample is to use a real bill of material
from the corpus, and every one of them produces plenty of findings. But the
landing page presents its sample as an example of a document with problems, and
doing that to a real project means publishing a page that says a named
company's software is deficient, on a site selling a tool that finds
deficiencies. The projects in `fixtures/corpus` published their SBOMs as a
public good. Using their work as the "before" picture in someone else's sales
material is not a trade they agreed to.

So the sample is invented, and it says so on the page.

## What is wrong with it, on purpose

Each defect is one a real submission actually gets returned for, and each one
is something the rule packs detect rather than something written to make a
particular rule fire:

| Defect | Why it is in here |
|---|---|
| No supplier on any component | The single most common gap in the corpus |
| No hashes | Nothing pins what was actually shipped |
| Licences missing on most components | Asked for by CISA minimum elements |
| An OpenSSL past its end of support | The component every reviewer asks about |
| A component with no version | Cannot be matched to any advisory |
| A component with a name and nothing else | The identity problem, in one row |
| No end-of-support or support-level fields | Neither format has them; FDA asks anyway |

The findings are not written down anywhere. They are produced by running the
real engine over this file at build time, so if a rule changes, the sample's
findings change with it and cannot drift into being a screenshot of something
the tool no longer does.
