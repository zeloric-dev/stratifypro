# UI stack: what to buy, what to avoid, and why

Researched 13 September 2026. Every price checked against the vendor's own page on that
date. This document exists because "use a nice template" is the fastest route to a site
that looks exactly like every other AI-built SaaS, and the buyer here is a regulatory
affairs director who has spent years reading FDA guidance and will notice.

## The decision, in one table

| Layer | Choice | Cost | License |
|---|---|---|---|
| Primitives | **shadcn/ui configured to its Base UI style** (`@base-ui/react` v1.8.0) | Free | MIT |
| Workspace furniture | **Tailwind Plus, for Catalyst and the Application UI blocks only** | **$299 one-time** | Commercial SaaS explicitly permitted |
| Tables | **TanStack Table v9** with hand-written Tailwind cells | Free | MIT |
| Dropzone | **Kibo UI** | Free | MIT |
| Type, free path | **IBM Plex Sans + Commit Mono**, custom-named | Free | OFL |
| Type, paid path | **Untitled Sans** family + Commit Mono | ~$600 desktop plus a web tier | Klim, perpetual |
| Design judgement | 20 to 30 hours of a designer, for two reference screens only | $2,400 to $5,400 | |

Total: **$299 alone**, or roughly **$3,300 to $6,700** with a typeface and a short design
engagement. Against $15,000 to $35,000 for a full design engagement.

## Do not buy an admin template, and the reason is legal

**ThemeForest's Regular License does not permit a paid SaaS.** Verbatim from their
licence page: "Use in an end product that's sold" is **No** on Regular and **Yes** on
Extended. The Extended licence is required whenever "the end user must pay to use the
end product."

The same split exists off ThemeForest. Materio, a well-built Next.js 16 App Router
admin template, prices it like this:

| Tier | Price | Charge end users? |
|---|---|---|
| Single Use | $79 | **No** |
| Multiple Use | $149 | **No** |
| Extended Use | $349 | Yes |
| Unlimited Use | $499 | Yes |

StratifyPro charges end users. **The $79 and $149 tiers are not legally available.**
This is the most common licensing mistake a solo founder makes with admin templates,
and for a company selling compliance software to regulated buyers it is a uniquely bad
one to be caught on.

Beyond the licence: every dense admin template currently sold is built on Material UI or
Bootstrap and ships a visual identity that would take longer to remove than to write.

## Do not use shadcn at its defaults

shadcn/ui is the right foundation. Its **default configuration is the problem**: the
`new-york` style, the zinc palette, Inter, `rounded-lg`, Lucide at default stroke. That
combination is the single most recognizable "AI built this" signature on the web in
2026.

Use shadcn, then change four things before writing a component:

1. Set the radius token to **2 to 4 pixels** and never override upward.
2. Replace the palette with the neutral ramp in `docs/design.md`.
3. Replace Inter.
4. Choose the **Base UI style**, not the Radix default. shadcn decoupled from Radix in
   2026 and now ships eight styles across Base UI, React Aria and Radix. Picking Base UI
   sidesteps a good deal of the recognizable output for free.

## Never install these

**Aceternity UI, Magic UI, Cult UI.** Aurora backgrounds, animated beams, spotlight
cards, meteors, BentoGrid, shimmer buttons, text-generate effects. These are the visual
fingerprint of generated code in 2026. Aceternity's own pricing page advertises
"AI-ready prompts for Lovable and V0", which says plainly who the audience is and what
the output is associated with.

An aurora gradient behind a findings table does not read as modern to a regulatory
reviewer. It reads as unserious, and by 2026 it also reads as nobody actually built this.

## Tables: free beats $999

| Option | Price | Verdict |
|---|---|---|
| **TanStack Table v9** | Free, MIT | **Use this.** Headless, current, prescribes no markup. The shadcn data-table pattern is built on it |
| AG Grid Enterprise | $999 per developer | Only earns its keep for pivoting and server-side row grouping. A check-history table needs neither, and its theme system fights Tailwind |
| MUI X Data Grid Pro | $299 per developer per year | Imports an entire competing design language into a product whose whole point is having its own |
| Glide Data Grid | Free | Stale. Last stable release February 2024. Canvas-rendered, so Tailwind cannot style it at all |

## Typefaces

**The free path costs nothing and is well-aimed.** IBM Plex Sans with IBM Plex Mono.
Institutional, technical, and almost nobody in the AI-SaaS cohort reaches for it. For a
product that must read like a lab report this is unusually apt.

**Commit Mono is the better monospace either way.** Free under the OFL, and you
**customise it before download**: weight, letter spacing, line height, alternate
characters, and a **custom font name**. You ship a monospace nobody can identify, which
is exactly the brief.

**The paid path, if the budget exists.** Untitled Sans from Klim: same foundry as Söhne,
deliberately neutral, far less spotted, and roughly a quarter of Söhne's price at family
level. Klim licenses web fonts perpetually but by traffic tier, so the tier has to be
upgraded as the free checker grows. Suisse Int'l is the alternative at around 500 CHF
per style with genuinely unlimited traffic and no tier upgrades ever.

**Overexposed, avoid:** Inter, Space Grotesk, **Geist Sans** (now signals "deployed on
Vercel" more than anything about the product), Satoshi, General Sans, Plus Jakarta Sans,
Manrope, Outfit, Sora, Cal Sans. Söhne is superb and now recognizable among the people
who notice.

**This supersedes the type choice in `docs/design.md`.** That file specified Instrument
Serif, Public Sans and JetBrains Mono. JetBrains Mono is good and widespread, and its
distinctive `l` and `i` are recognisable. Use IBM Plex Sans plus a custom-named Commit
Mono instead, and keep the serif out of display entirely.

## What actually makes it look like an instrument

None of it requires buying anything, and all of it matters more than the component
library.

1. **A tight type scale with real weight contrast.** Three sizes and two weights doing
   all the work.
2. **Tabular numerals everywhere numbers appear.** `font-variant-numeric: tabular-nums`.
   The cheapest change in this document and the one a regulatory reader feels
   immediately without being able to name it.
3. **Very low radii, 2 to 4 pixels, and hairline 1px borders instead of shadows.**
   Shadows read as consumer. Borders read as document.
4. **Restrained, systematic colour.** One neutral ramp of 10 to 12 steps, and severity
   colours that are **desaturated**. Fluorescent status colours are the fastest way to
   make a findings table look like a marketing dashboard.

## Small things that give it away

- `rounded-lg` or `rounded-xl` as the default radius. Set the token low, leave it alone.
- Drop shadows on cards.
- Lucide at default stroke width. If you use it, drop the stroke to 1.5 and hold sizes
  at 14 to 16px.
- Proportional numerals in any numeric column.
- A coloured left accent rail on cards. That is the shadcn Alert variant, and it is
  everywhere.
- Saturated red, amber and green severity chips. Carry severity in the label and the
  weight as much as the hue.

## Hire for judgement, not for screens

Freelance product designers run $50 to $150 an hour in 2026, agencies $100 to $250,
senior specialists $120 to $250 and up. A full small-SaaS engagement covering a
marketing surface and a dashboard runs $15,000 to $35,000. For a pre-revenue solo
product that is the wrong shape of spend, because you would be buying screens and
screens go stale the moment the product changes.

Buy 20 to 30 hours instead, and scope it precisely:

1. A neutral colour ramp of 10 to 12 steps, plus desaturated severity colours for the
   findings chips.
2. A type scale and the density and spacing rhythm for a dense table.
3. **One reference screen per surface**: the public findings table, and the workspace
   check-history view.

Then build the remaining forty screens against that system yourself. Hand them two
reference screens, not a backlog.
