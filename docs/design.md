# Design specification

Version 1.0, 13 September 2026. This file exists so Claude Code does not invent a look.
Everything below is a decision, not a suggestion.

## Who is looking at this

A regulatory affairs director at a device consultancy, on a laptop, between meetings,
who has been sent hundreds of vendor tools and trusts almost none of them. They are
deciding in about eight seconds whether this is a serious instrument or another
landing page. They are not a designer and they will not admire anything. They will
notice if it looks generic, because generic is what the tools they already ignore
look like.

The page has to read as an instrument: precise, quiet, and obviously built by someone
who understands the work. Closer to a lab report than to a SaaS marketing site.

## Palette

Cool neutrals with a single deep blue-green accent. No gradients anywhere. No warm
cream, no terracotta, no purple-to-blue hero, no acid green on near-black. Those are
what AI-generated tooling looks like in 2026 and the buyer has seen all of them.

```
--ground        #F5F6F5   page background, light
--surface       #FFFFFF   cards, tables
--sunken        #EBEDEC   table headers, inset panels
--ink           #141A19    body text
--ink-soft      #4B5452    secondary text
--ink-faint     #7E8785    labels, metadata
--rule          #D8DCDA    borders
--rule-soft     #E7EAE8    row separators
--accent        #0F5B57    the single accent. Links, focus, the one emphasis
--accent-wash   #E5EFEE    inline code, quiet highlight
```

Severity colours are separate from the accent and are the only other hues on the page:

```
--error         #9B2C28  / bg #F7E4E3
--warning       #8A5A0C  / bg #F7EEDC
--info          #3A5A78  / bg #E6EDF3
--advisory      #55605E  / bg #EAEDEC
--pass          #1F5E42  / bg #E2EEE8
```

Dark theme redefines the same tokens and nothing else:

```
--ground #0F1312  --surface #171D1B  --sunken #131817
--ink #E8EDEB  --ink-soft #A8B2AF  --ink-faint #7C8683
--rule #283130  --rule-soft #1F2725
--accent #5FBDB2  --accent-wash #16302D
--error #E39490 / bg #2C1B1A   --warning #DCAD5E / bg #2B2317
--info #93B3D0 / bg #1A242D    --advisory #9AA5A2 / bg #1D2322
--pass #74BF9A / bg #182721
```

Every colour is defined on bare `:root` first. The dark block redefines tokens only,
guarded so an explicit light choice beats a dark operating system.

## Type

Revised 13 September 2026 after researching what is actually overexposed. See
`docs/ui-stack.md` for the full reasoning and the paid alternative.

| Role | Face | Where |
|---|---|---|
| Body and UI | **IBM Plex Sans** 400/500/600 | Everything. Institutional and technical, and almost nobody in the AI-SaaS cohort reaches for it |
| Data | **Commit Mono**, customised and **renamed** | JSONPaths, hashes, versions, component names, rule ids, counts |
| Display | None. IBM Plex Sans at the top of the scale | A serif display face was the earlier choice and is dropped: it pulls toward editorial when the brief is instrument |

Commit Mono is free under the OFL and is **configured before download**: weight, letter
spacing, line height, alternates, and a custom font name. Ship it under a name nobody
can identify. Use 450 weight on light backgrounds, 400 on dark.

**Previously specified and now superseded:** Instrument Serif, Public Sans, JetBrains
Mono. JetBrains Mono is good and very widespread, and its distinctive `l` and `i` are
recognisable on sight.

**Banned outright:** Inter, Space Grotesk, Geist Sans, Satoshi, General Sans, Plus
Jakarta Sans, Manrope, Outfit, Sora, Cal Sans.

Component names, file paths and identifiers are **always monospace**. They are data the
user will compare character by character, and a proportional face makes that harder.

Scale, fixed: 11 / 12.5 / 14 / 16 / 19 / 24 / 32 / 44. Nothing between. Body is 16 at
1.6 line height. Running text caps at 66 characters.

Tabular figures (`font-variant-numeric: tabular-nums`) wherever digits stack: counts,
percentages, version columns.

## Layout

One column, 900px maximum, 24px side gutters that never collapse. No sidebar. No
hero. The checker is the page, not a section of a page.

**The first screen, in order:**

1. One line of what this is. Not a slogan.
2. The privacy sentence, visible without scrolling: *"Your file is checked in this
   browser. It is never uploaded."*
3. **The findings table for a sample file that is already loaded.** Real findings on
   real content, visible before the visitor does anything.
4. The drop zone, below the findings, labelled "Check your own file".

That order is deliberate and inverts the usual. A drop zone above the fold asks a
suspicious stranger to hand over their most sensitive file before seeing anything
work. Showing the result first and the ask second is what earns the file.

**Never show a new user a zero.** If the sample fails to load, show the sample findings
from a static fallback rather than an empty state.

## Components, and there are only seven

1. **Finding row.** Severity chip, rule id in mono, title, the JSONPath in mono, the
   fix in plain sentences, the source citation. Collapsed to title and chip by default;
   expands in place. No modal, ever.
2. **Severity chip.** Uppercase, 11px, mono, letter-spaced, 3px padding. Colour from
   the severity tokens. Never a bare dot: colour alone fails for a colourblind reader
   and this is a document people print.
3. **Summary bar.** Counts by severity, plus the count of rules that ran. "18 rules
   ran, 0 findings" and "18 rules ran, 12 findings" must be visibly the same kind of
   result. A clean pass must look deliberate, never like a failure to load.
4. **Drop zone.** Dashed 1px border in `--rule`, accent on drag-over, 120px tall. A
   file picker button inside it, because not everyone drags.
5. **Table.** Header in `--sunken`, 1px `--rule-soft` row separators, no zebra
   striping, no outer shadow. Wrapped in its own `overflow-x: auto`.
6. **Resolution chain.** For match findings: raw string, then arrow, then what it
   resolved to, then how, then confidence. Monospace. A model-sourced link carries a
   visible `model` tag in `--info`; a confirmed one carries `confirmed` in `--pass`.
7. **Provenance footer.** Engine version, rule pack id and version, timestamp, file
   SHA-256. On every report and every screen that shows findings. This is what makes a
   result quotable in a submission.

Nothing else gets built. No cards with accent rails, no rounded-everything, no icon
set, no illustration, no emoji as section markers.

## Motion

Two transitions and no more: the finding row expand at 120ms ease-out, and the
drop-zone border colour at 80ms. Everything else is instant. Respect
`prefers-reduced-motion` by disabling both.

## The report artifact

The report is the object that gets forwarded and printed, so it is designed for paper
as well as screen.

- Single self-contained HTML file. Inline CSS. No network requests of any kind.
- Firm branding at the top: logo as a data URI, firm name, their footer text.
- Provenance footer on every page via `@media print` running elements.
- Page breaks never split a finding row.
- Severity is carried by **chip text and position, not colour alone**, so it survives
  a black and white printer.
- Findings grouped by severity, then rule. Within a rule, by JSONPath.

## Accessibility, and it is not optional here

- Contrast at least 4.5:1 for body text and 3:1 for large text, in both themes.
- Visible focus ring: 2px `--accent`, 2px offset. Never `outline: none`.
- The drop zone is keyboard reachable and activates on Enter and Space.
- Findings are a real `<table>` with `<th scope>`, not a grid of divs.
- Severity is announced in text, never conveyed by colour alone.
- Every interactive element has an accessible name.
