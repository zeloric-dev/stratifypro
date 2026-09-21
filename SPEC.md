# SPEC: AI and software bill-of-materials conformance platform

Version 1.0. Written 13 September 2026. Supersedes nothing; this is the first spec.
Source plan: a private planning document, v2, accepted at a review gate.

Placeholders to replace before Step 1: `stratifypro.io` (the registered domain),
`StratifyPro` (the registered entity, exactly as filed), `StratifyPro` (the GitHub
repository name).

---

## 1. Context

### 1.1 What exists in the world

Six governments published "Software Bill of Materials for AI: Minimum Elements" on
12 May 2026: 50 elements across 7 clusters. It declares itself non-mandatory and
contains no MUST or SHALL. CISA published "2026 Minimum Elements for a SBOM v2.1"
on 29 July 2026: 17 fields plus 6 practices, including a new SBOM Author Signature
element.

FDA section 524B requires a software bill of materials by statute for cyber devices.
It names no file format. It demands per-component support level and end-of-support
date, which neither CycloneDX nor SPDX has a field for. Enforcement is an eSTAR
technical screening hold, not a rejection.

No regulator anywhere requires a machine-readable AI bill of materials.

### 1.2 What exists in this project

| Asset | State | Location |
|---|---|---|
| 50-element crosswalk, JSON and CSV | Built, unpublished. The public repo is not live yet | `docs/crosswalk/data/` |
| Crosswalk repo (README, METHODOLOGY, CONTRIBUTING, LICENSE) | Built. LICENSE now reads `Copyright (c) 2026 StratifyPro` | `docs/crosswalk/` |
| Crosswalk spreadsheet, 6 sheets | Built, and generated, not hand-edited | `docs/crosswalk/AI-SBOM-crosswalk.xlsx` |
| Crosswalk build chain | `scripts/build_crosswalk.py` holds the 50 elements as data and writes the xlsx; `scripts/emit.py` reads the xlsx and derives the JSON and CSV. Round trip is byte-identical | `scripts/` |
| Published reference pages | Live, outside this repository | Rulebook, Zero to Conformance |
| Five primary source documents | Captured during research, **not carried in this repository.** Re-fetch if a rule needs re-checking against its source | n/a |

Zero code. Zero users. Zero revenue. This is a greenfield build against an existing
research base.

### 1.3 Who this is for

**Paying buyer:** the small number of consultancies that prepare FDA 524B premarket
submissions. Published rates for that work run to six figures per submission, and the
parts-list step inside it is done by hand. The specific firms are named in the private
planning documents, not here.

**Free user:** anyone with an SBOM and a question about whether it will pass review.
The free layer is not a funnel. It is a deliverable in its own right (see 1.4).

**What they are actually buying, corrected 13 September 2026.** Not conformance
checking. The deficiency FDA reviewers actually issue, per a published review of real
letters, is *"we cross-referenced your SBOM against NVD and GitHub Advisories and
found CVEs you did not disclose,"* plus missing end-of-support dates. That is a
**matching and identification failure, not a conformance failure**. A file can pass
every minimum-element rule in this spec and still draw the letter.

Conformance checking is therefore the free, table-stakes layer. **Component identity
resolution, vulnerability cross-reference and end-of-support resolution are the paid
differentiator.** Same buyer, same engine, different headline.

**Not the buyer:** individual device manufacturers. That category contains Interlynk
(funded, sells "submission-ready SBOM for FDA 524B", named customers BIOTRONIK and
STERIS), sbomqs (free, maintained), sbom-tools (free, MIT, ships `--standard fda`),
spdx/ntia-conformance-checker (Linux Foundation) and FOSSA's free hosted validator.
A solo founder loses a credibility contest there.

### 1.4 Two objectives, and where they conflict

**Objective A, commercial:** licence tooling to a small number of consultancies.

The sizing behind that, built bottom-up from the fraction of work removed rather than
from licence value in the abstract, is not published. It lives with the rest of the
commercial analysis in the private planning documents. Nothing in this spec depends on
it: the engineering decisions below are argued on their own terms, and a reader
checking this work does not need to know what it is expected to earn.

**The consultancies are not the market.** They are ten to fifteen design partners who
see hundreds of real files, supply ground truth for the benchmark (section 6A), and
refer onward. The money is in the thousands of manufacturers filing roughly 3,900
original submissions a year.

**Objective B, evidence:** produce a documented record of work of national
importance. This is a stated goal and it is a product requirement, not a marketing
afterthought. It means the free public layer, the standards contributions and the
adoption metrics are deliverables with acceptance criteria, not optional extras.

**Where they conflict, and the rule:**

| Tension | Commercial answer | Evidence answer | Rule |
|---|---|---|---|
| Publish the crosswalk free | Withhold as a moat | Publish, get cited | **Publish.** A moat nobody can see is not evidence of anything, and the crosswalk is worth more as a credential than as a secret |
| Open-source the engine | Keep closed | Open, get adopted | **Open the engine and rule packs, keep the evidence service closed.** Adoption numbers are the strongest evidence available and the engine alone does not make money |
| Standards body participation | Time not spent selling | Direct evidence | **Schedule it.** Two hours a week, blocked in the calendar, from week 3 |
| Build the AI generator | No buyer today | Uncontested, citable | **Build it in phase 3, not phase 1.** It is the strongest evidence asset and the weakest revenue asset |
| Publish the identity-resolution benchmark | Gives rivals a target | Nobody has one; owning the number is citable | **Publish it.** No benchmark, dataset or measured baseline exists for free-text-name to canonical-identifier resolution. It is the one artifact that is product differentiator, sales asset and credential at once |

Nothing in this spec is written to manufacture evidence. Everything in it is work
worth doing on the commercial merits, sequenced so the record of it is captured
automatically rather than reconstructed later.

**What the national-importance case may rest on, and what it may not.** Verified
13 September 2026.

| Anchor | Use it? | Why |
|---|---|---|
| FD&C Act section 524B(b)(3) | **Yes, primary** | An act of Congress requiring an SBOM for cyber devices. Does not change with administrations |
| CISA 2026 Minimum Elements, 29 July 2026 | **Yes** | Co-sealed by CISA, NSA, FBI and 15 more agencies. States untracked software "poses a significant cybersecurity threat, including to critical infrastructure and government systems" |
| HHS HPH Cybersecurity Performance Goals v3.3.0 | **Yes, supporting** | Names third-party and supplier risk as an essential goal. Voluntary but current and sector-specific |
| A published benchmark and coverage figure | **Yes** | Work others must cite beats work you describe |
| National Cyber Strategy, 6 March 2026 | **No** | Contains no mention of SBOM, software bill of materials, software supply chain, secure software development, or medical devices |
| OMB software attestation mandate | **No** | M-22-18 and M-23-16 were rescinded on 23 January 2026, described by OMB as "unproven and burdensome" |
| EO 14144 provisions | **No** | Amended and stripped by EO 14306, 6 June 2025 |

The narrative that survives scrutiny: the federal government has retreated from broad
software-transparency mandates while keeping and tightening the requirement in the one
place where lives are at stake. Narrower than "the government mandates this", and
true, which the other one is not.

---

## 2. Architecture

### 2.1 Shape

pnpm monorepo. The engine is a published package so the browser, the CLI and the
server run one implementation and cannot drift.

```
StratifyPro/
  packages/
    engine/        pure TypeScript. No DOM, no Node built-ins. Published to npm
    rules/         JSON rule packs + their schema. Published to npm
    resolve/       component identity resolution. Deterministic first, AI second
    vulnmatch/     cross-reference resolved components against advisory sources
    eos/           end-of-support and end-of-life date resolution
    report/        renders a Finding[] into standalone HTML. No framework
  apps/
    web/           Next.js App Router, deployed to Vercel
    cli/           Node CLI wrapping engine + report. Published to npm
  docs/
    crosswalk/     the existing 50-element data, moved here, still CC BY 4.0
  bench/
    identity/      the public identity-resolution benchmark: dataset + runner
  .github/
    workflows/     ci.yml, release.yml
```

**Why the engine is its own package and not a folder in the Next.js app:** the same
rule evaluation has to run in a browser tab with no network, in a CI pipeline with
no browser, and on a server. One published package with a version number is the only
way that stays honest. The crosswalk build scripts already prove the point: the xlsx
is the source and JSON and CSV are derived, precisely so the three copies cannot
disagree.

### 2.2 Dependency graph

```
  packages/rules  (JSON only, zero deps)
        │
        ▼
  packages/engine ──────┬──────────────┬─────────────────┬──────────────┐
   (pure TS, zero        │              │                 │              │
    runtime deps)        ▼              ▼                 ▼              ▼
                  packages/report   apps/cli        apps/web     packages/resolve
                   (HTML string)   (Node, npm)   (Next.js)        (identity)
                                                        │              │
                                          ┌─────────────┼──────┐       ├──▶ packages/vulnmatch
                                          ▼             ▼      ▼       └──▶ packages/eos
                                       Clerk        Supabase  Sentry
                                    (auth, orgs) (data, storage)(errors)
```

`resolve`, `vulnmatch` and `eos` depend on `engine` types only, never the reverse.
The engine must stay usable with none of them present, because the free browser
checker ships engine and rules alone.

Rule: nothing flows upward. The engine never imports from apps. `packages/engine`
declares zero runtime dependencies, which is what makes the browser bundle small and
the security surface auditable.

### 2.3 The three non-negotiables

1. **Severity is configuration, never a constant in code.** Every default carries a
   written justification in the rule pack itself. The source AI document has no MUST
   and no SHALL; any tool that grades it as normative is wrong at the root, and the
   only existing competitor hardcoded exactly that mistake. This is both the honesty
   position and the technical differentiator.
2. **Every finding traces to a file path and a source clause.** A finding the user
   cannot verify is a finding they will not trust, and trust is the entire product.
3. **No check ships until it has been seen to fail.** Every rule has a fixture that
   triggers it. A check that has never gone red has never been tested, and a
   compliance tool that reports clean because it is broken is worse than no tool.
4. **AI proposes, rules decide.** The deterministic engine is the source of truth.
   Models operate on the fuzzy input edge (identity resolution, document extraction)
   and the fuzzy output edge (drafting), never on the judgement in the middle. A model
   that assigns a severity is the competitor's original error with opacity added.
5. **PURL first, CPE second.** On 15 April 2026 NIST moved the NVD to risk-based
   enrichment: only KEV entries, federal software and EO 14028 critical software are
   scheduled for CPE assignment, with the rest marked "Lowest Priority, not scheduled."
   CPE-based matching is a decaying asset. Resolve to Package URL, treat CPE as a
   secondary alias, and never let a missing CPE mean a missing answer.
6. **Every resolved identity carries its provenance and its confidence.** A
   deterministic dictionary hit, a model suggestion and a human confirmation are three
   different facts and must be stored as three different facts. In a regulated
   workflow, who or what asserted a thing is part of the record.

---

## 3. Services and accounts

### 3.1 Confirmed

| Service | Role | Notes |
|---|---|---|
| `stratifypro.io` | Everything | Apex serves the free checker, `app.` serves the firm workspace |
| Vercel | Hosting `apps/web` | Hobby tier is enough until the first paying firm |
| Supabase | Postgres, Storage | Free tier until the first paying firm |
| Clerk | Auth and Organizations | One Organization per consultancy. Seats are the billing unit |
| GitHub | Repo, CI, releases | Public repo for engine and rules, private for the web app |

### 3.2 To be added

| Service | Role | Cost | When |
|---|---|---|---|
| Google Workspace | Email on `stratifypro.io` | ~$7/mo | **Before any outreach.** Highest-return spend in the plan |
| Resend | Transactional email | Free to 3,000/mo | Phase 1 |
| Sentry | Error tracking | Free tier | Phase 1, before the first external user |
| npm account | Publishing engine, rules, cli | Free | Phase 1 |
| **Tailwind Plus** | Catalyst and the Application UI blocks. Bought for the workspace furniture, never for the marketing templates | **$299 one-time** | Phase 1 |
| Typeface | IBM Plex Sans free, or Untitled Sans at roughly $600 if the budget exists | $0 to ~$600 | Phase 1 |
| Designer, 20 to 30 hours | Two reference screens and a colour ramp. Not the product | $2,400 to $5,400 | Phase 1, optional |
| Sigstore / cosign | Signing evidence bundles | Free, no account | Phase 2 |

### 3.3 Deliberately not added

| Service | Why not |
|---|---|
| Stripe | A handful of firms on annual invoices and net-30 terms. A checkout page nobody uses is dead code with a PCI surface |
| **Any admin template** | ThemeForest's Regular licence forbids use in a product sold to end users, and the cheap tiers of every off-Envato equivalent carry the same restriction. StratifyPro charges end users, so the affordable tiers are not legally available. See `docs/ui-stack.md` |
| **Aceternity UI, Magic UI, Cult UI** | The visual fingerprint of generated code in 2026. Aceternity's own pricing page sells "AI-ready prompts for Lovable and V0" |
| AG Grid Enterprise, MUI X Pro | $999 per developer and $299 per developer per year respectively, for table features a check-history view does not need |
| PostHog, Amplitude, Mixpanel | Vercel Analytics covers the five events. A second analytics vendor is a second privacy disclosure for zero gain |
| Separate object storage | Supabase Storage handles evidence bundles |
| Auth0, NextAuth | Clerk is chosen. Two auth systems is the mistake, not the insurance |

---

## 4. Data model

Supabase Postgres. Clerk owns identity; these tables reference Clerk IDs as text and
never duplicate user records.

```sql
-- Every table is row-level-secured. A firm sees only its own rows.

create table firms (
  id              uuid primary key default gen_random_uuid(),
  clerk_org_id    text unique not null,
  name            text not null,
  plan            text not null default 'pilot'
                    check (plan in ('pilot','licensed','lapsed')),
  seats           int  not null default 5,
  created_at      timestamptz not null default now()
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id) on delete cascade,
  name        text not null,
  client_ref  text,              -- the firm's own reference. Never a device name
  created_at  timestamptz not null default now()
);
create index projects_firm_idx on projects(firm_id);

create table checks (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references firms(id) on delete cascade,
  project_id     uuid references projects(id) on delete set null,
  clerk_user_id  text not null,
  engine_version text not null,        -- exact npm version that produced this
  rule_pack_id   text not null,        -- e.g. fda-524b
  rule_pack_ver  text not null,
  source_format  text not null check (source_format in ('cyclonedx','spdx')),
  source_spec    text not null,        -- e.g. 1.7, 3.0.1
  file_name      text not null,
  file_sha256    text not null,        -- the file is NOT stored. Only its hash
  finding_count  int  not null,
  error_count    int  not null,
  warn_count     int  not null,
  info_count     int  not null,
  findings       jsonb not null,       -- Finding[] exactly as the engine returned
  created_at     timestamptz not null default now()
);
create index checks_firm_created_idx on checks(firm_id, created_at desc);
create index checks_project_idx on checks(project_id);

create table evidence_bundles (          -- phase 2 only
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references firms(id) on delete cascade,
  check_id       uuid not null references checks(id) on delete restrict,
  storage_path   text not null,          -- Supabase Storage object key
  bundle_sha256  text not null,
  signature      text not null,          -- detached Sigstore signature
  signed_at      timestamptz not null,
  attests        text not null           -- verbatim scope-of-attestation string
);

create table public_metrics (            -- objective B. Append only, never updated
  id          bigserial primary key,
  captured_at timestamptz not null default now(),
  source      text not null,             -- npm, github, crates, citation, standards
  metric      text not null,             -- downloads_30d, stars, forks, mention
  value       numeric,
  detail      jsonb,
  url         text
);
```

**Design decision: the uploaded SBOM is never stored.** Only its SHA-256 and the
findings. A device maker's bill of materials is a map of every weakness in their
product; storing it creates a breach target with no product benefit. The firm can
re-upload to re-run. State this in the licence agreement and on the page.

**Row-level security.** Every policy resolves `firm_id` from the Clerk organization
claim in the JWT. No policy trusts a client-supplied `firm_id`.

```sql
alter table firms            enable row level security;
alter table projects         enable row level security;
alter table checks           enable row level security;
alter table evidence_bundles enable row level security;

create policy firm_isolation_checks on checks
  for all
  using (firm_id = (
    select id from firms
    where clerk_org_id = auth.jwt() -> 'o' ->> 'id'
  ));
-- Same shape for projects and evidence_bundles.
-- public_metrics is readable by anon, writable only by the service role.
```

---

## 5. The rule pack format

This is the heart of the product and the thing a regulatory person must be able to
read and argue with. It is JSON, not code.

```jsonc
{
  "$schema": "https://stratifypro.io/schema/rule-pack-1.json",
  "id": "fda-524b",
  "version": "1.0.0",
  "title": "FDA section 524B premarket submission profile",
  "sourceDocuments": [
    {
      "id": "fda-premarket-2026-02",
      "title": "Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions",
      "publisher": "US Food and Drug Administration",
      "published": "2026-02",
      "url": "https://www.fda.gov/media/119933/download",
      "normativeLanguage": true,
      "note": "Statutory basis is 21 USC 360n-2. The guidance names no file format."
    }
  ],
  "severityModel": {
    "default": "advisory",
    "justification": "The source guidance is binding by statute but names no format and sets no schema. Every severity below is this project's judgement about what an eSTAR technical screening reviewer is likely to flag, not a quotation of a legal requirement. Firms may override any severity in their own configuration.",
    "overridable": true
  },
  "rules": [
    {
      "id": "FDA-ID-001",
      "title": "Every component carries a machine-readable identifier",
      "severity": "error",
      "severityJustification": "Reviewer deficiency language cited by practitioners names missing PURL or CPE as precluding verification of the vulnerability monitoring claim. This is the single most reported cause of an information request.",
      "appliesTo": ["cyclonedx", "spdx"],
      "selector": {
        "cyclonedx": "$.components[*]",
        "spdx": "$.packages[*]"
      },
      "assert": {
        "anyOf": [
          { "exists": "purl" },
          { "exists": "cpe" },
          { "exists": "externalRefs[?(@.referenceType=='purl')]" }
        ]
      },
      "fix": "Add a Package URL to each component. For npm: pkg:npm/<name>@<version>. For OS packages, use the distribution's purl type.",
      "sourceRef": "FDA premarket guidance, SBOM section, machine-readable requirement"
    }
  ]
}
```

**Rules for authoring a pack:**

- `severityJustification` is mandatory on every rule. A rule without one fails pack
  validation at load. This is what makes the honesty position enforceable rather than
  aspirational.
- `sourceRef` is mandatory and must name a document in `sourceDocuments`.
- `selector` uses JSONPath. One selector per target format.
- `fix` is written for a regulatory affairs reader, not an engineer.
- `normativeLanguage: false` on a source document forces `severityModel.default` to
  `advisory` and forbids `severity: "error"` on any rule citing it. The G7 AI pack
  will trip this, which is correct and is the point.

**Packs to ship:**

| Pack id | Source | Rules | Phase |
|---|---|---|---|
| `cisa-2026-v2.1` | CISA 2026 Minimum Elements v2.1 | 17 fields + 6 practices | 1 |
| `fda-524b` | FDA premarket guidance + 21 USC 360n-2 | ~24 | 1 |
| `g7-ai-2026` | G7 AI SBOM Minimum Elements | 50 | 3 |

---

## 6. Engine API

```ts
// packages/engine/src/index.ts

export type Severity = 'error' | 'warning' | 'info' | 'advisory';

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  severityJustification: string;
  path: string;            // JSONPath to the exact node, e.g. $.components[7]
  component?: string;      // human label, e.g. "libssl 3.0.2"
  fix: string;
  sourceRef: string;
}

export interface CheckResult {
  engineVersion: string;
  rulePackId: string;
  rulePackVersion: string;
  sourceFormat: 'cyclonedx' | 'spdx';
  sourceSpec: string;
  fileSha256: string;
  findings: Finding[];
  counts: Record<Severity, number>;
  evaluatedRules: string[];   // every rule id that ran, including passes
  skippedRules: { ruleId: string; reason: string }[];
}

export function detectFormat(doc: unknown): DetectResult;
export function loadRulePack(json: unknown): RulePack;   // throws on invalid pack
export function check(doc: unknown, pack: RulePack, opts?: CheckOptions): CheckResult;
```

`evaluatedRules` and `skippedRules` exist so a clean result is provably clean. "No
findings" and "the rules never ran" must never look the same.

---

## 6A. The matching layer

Added 13 September 2026. This is the paid differentiator and it did not exist in
version 1.0 of this spec.

### 6A.1 Why it exists

A conformance checker answers "are the required fields present." The deficiency
reviewers actually issue answers a harder question: "is this component the thing you
say it is, and does it have known problems you failed to disclose." Three findings
force this layer:

1. **Identifier coverage is terrible.** Measured across 10,000 repositories in ten
   languages: **0 percent** of generated SBOMs carry supplier data for the primary
   component or any top-level dependency. Component-detection F1 against manual ground
   truth runs from 13.2 percent (one common tool on Python) to 85 percent. License
   accuracy on Python ranges 1.7 to 27.6 percent. Two leading extractors agree on only
   43 percent of unique components in one ecosystem.
2. **The lookup source is decaying.** NIST's 15 April 2026 change means most new CVEs
   never receive a CPE at all.
3. **Nobody sells the fix.** MITRE recommended a canonical-name-plus-alias service to
   FDA in April 2026. No commercial product exists. One vendor claims AI-assisted
   normalization and publishes no accuracy figure of any kind.

### 6A.2 `packages/resolve`: identity resolution

```ts
export type ResolutionSource =
  | 'exact'          // the SBOM already carried a valid PURL
  | 'dictionary'     // deterministic hit in a local alias dictionary
  | 'heuristic'      // deterministic string/version normalization
  | 'model'          // a model proposed this. NEVER auto-accepted
  | 'human';         // a person confirmed it in the workspace

export interface Resolution {
  input: string;                 // the raw text as it appeared
  purl: string | null;           // null is a legitimate, expected answer
  cpe: string | null;            // secondary. Absence is not failure
  confidence: number;            // 0..1
  source: ResolutionSource;
  alternatives: { purl: string; confidence: number }[];
  abstained: boolean;            // true when nothing cleared the threshold
}

export function resolve(name: string, opts: ResolveOptions): Promise<Resolution>;
```

**Order of attempt, and it does not vary:** exact, then dictionary, then heuristic,
then model. The model is asked only for inputs the first three could not settle.

**Abstention is a first-class result.** A resolver that always answers is worse than
one that sometimes says it does not know, because a wrong identifier produces a
confident wrong vulnerability verdict. Set the confidence threshold as configuration,
default it conservatively, and write the justification next to it exactly as the rule
packs do.

**A `source: 'model'` resolution is never used for a finding until a human confirms
it.** Until then it appears in the workspace as a suggestion with its alternatives.
This is non-negotiable 4 made concrete.

### 6A.3 `packages/vulnmatch`: the cross-reference

Takes resolved components, returns advisories the SBOM did not declare. Sources:
OSV.dev (PURL-native, which is why PURL comes first), GitHub Advisory Database, CISA
KEV, and NVD as a fallback rather than a foundation.

Output is a `Finding` like any other, with the advisory id, the source, and the
resolution that produced the match including its confidence and provenance. A match
built on a model suggestion is labelled as such in the report. A reviewer must be able
to see exactly how you got there.

### 6A.4 `packages/eos`: end-of-support dates

FDA asks for per-component software level of support and end-of-support date. Neither
CycloneDX nor SPDX has a field for it. It is a named deficiency in real letters. The
only public source is a community-maintained wiki.

Build a curated dataset keyed by PURL, seeded from endoflife.date plus vendor lifecycle
pages, with provenance and a captured date on every row. Publish it free under CC BY,
for the same reason the crosswalk is free: a dataset other people cite is worth more
than a dataset nobody sees.

This is list-keeping, not hard engineering, and it is the highest-value gap available
that plugs straight into the engine.

### 6A.5 Where AI is allowed, and where it is not

| Use | Verdict | Reasoning |
|---|---|---|
| Identity resolution with abstention, after deterministic methods fail | **Allowed** | Constrained selection from a closed vocabulary, not open generation. The only measured attempt (a DOE national-lab prototype using a local Gemma3 12B) reached recall 0.99 and **precision 0.66**, with the authors noting it "falters in its collection of junk entities." Tractable, unmeasured, and nobody has productised it |
| Supplier document to draft SBOM (PDF, spreadsheet, datasheet) | **Allowed** | Output is a draft a human confirms, never a filed artifact. 39 percent of surveyed firms never receive an SBOM from a supplier and only 2 percent always do; what arrives is a document somebody retypes. No SBOM-specific extraction tool exists anywhere |
| Drafting a deficiency response from existing findings | **Allowed** | Writing grounded in facts already held, signed by a person before it leaves. Highest direct buyer value, lowest technical risk |
| Explaining a finding in plain regulatory language | **Allowed** | Presentation of a deterministic result |
| Assigning or adjusting severity | **Forbidden** | Destroys the honesty position the product rests on. Severity is configuration with a written justification a human can be held to |
| Generating or wording the attestation | **Forbidden** | The seal records a fact. A model cannot attest |
| A chatbot on the marketing site | **Forbidden** | Theatre. The buyer is a regulatory affairs director |
| Autonomous vulnerability triage or exploitability calls | **Not yet** | A 165,000-query study across four models found agreement with human ground truth between 0.06 and 0.10 on a 0-to-1 scale, with every model producing more false positives than false negatives |

**Sales rule that follows from this.** MITRE's April 2026 paper for FDA states that
manual review remains necessary *because of AI and ML false positives*. The buyer's own
technical advisor arrives pre-loaded with that skepticism. **Lead with the benchmark
and the abstention behaviour. Never lead with the word AI.**

### 6A.6 `bench/identity`: the public benchmark

No benchmark, dataset, leaderboard or measured baseline exists for resolving a
free-text component name to a canonical identifier. The one public attempt to build
the underlying mapping is documented by its authors as having failed. There is no
citable figure anywhere for what share of components lack an identifier.

Deliverables, all public, CC BY 4.0:

1. **A labelled dataset.** Free-text component strings with their correct PURL,
   drawn from real SBOMs, with a documented sampling method and an explicit unknown
   class. Target 2,000 rows minimum.
2. **A runner** that scores any resolver on precision, recall, F1 **and abstention
   rate**, reported separately. Abstention is measured, not penalised as a miss.
3. **Baselines**, run and published: exact match, string similarity, an embedding
   method, and a generative model. This is precisely the comparison a DOE national lab
   asked for in print and nobody has run.
4. **A coverage measurement**: what share of components in a real corpus carry a
   usable identifier, and what share have a CPE at all. Publish the method so anyone
   can re-run it.

StratifyPro's own resolver is scored on this benchmark like everything else, and its
numbers are published whether or not they win. A benchmark whose author always tops it
is marketing, and would be worth nothing as evidence.

## 7. Phases, gates and acceptance criteria

At 20+ hours a week. Gates are facts about people who are not Paul.

### Phase 0, weeks 1 to 2: teardown, publish, sell

No product code.

| # | Task | Acceptance |
|---|---|---|
| 0.1 | Competitor teardown. Run `sbomqs compliance`, `sbom-tools --standard fda`, `spdx/ntia-conformance-checker` against 5 real files. Record what each misses, per rule | A markdown table in `docs/teardown.md` with a row per tool per finding class. **Blocking: no build starts until this exists** |
| 0.2 | Replace `[YOUR COMPANY NAME]` with `StratifyPro`, publish the crosswalk repo public | Repo live, CC BY 4.0, README links the methodology |
| 0.3 | Strip every CRA claim and every refuse-to-accept claim from all material | `grep -ri "cyber resilience\|refuse to accept"` returns nothing outside a historical-note file |
| 0.4 | Google Workspace on `stratifypro.io` | Mail sends and receives from `paul@stratifypro.io` |
| 0.5 | Email the eight firms as a supplier | 8 sent, tracked in `docs/outreach.md` with date and outcome |
| 0.6 | Assemble the fallback corpus: public CycloneDX and SPDX files from open-source medical and embedded projects | ≥20 files in `fixtures/corpus/`, provenance recorded |
| 0.7 | **Verify the CISA 2026 v2.1 element list against the current document.** It adds 10 fields versus the 2021 NTIA baseline, renames Supplier Name to **Component Producer**, extends Coverage to transitive dependencies, and adds Explicitly Identifying Unknown Information | A field-by-field table in `docs/cisa-2026-elements.md`. **Blocking: a rule pack built to the 2021 baseline is wrong, and shipping it would be a false claim** |
| 0.8 | Measure identifier coverage across the corpus: what share of components carry a usable PURL, and what share have any CPE | `docs/coverage-baseline.md`. First data point of the benchmark. No such figure exists publicly |

**Gate 1: one firm agrees to a pilot on a live engagement.**
**Failure branch:** zero replies after two follow-ups means the channel is wrong.
Stop. Do not build. Reassess whether this is a product or a service.

### Phase 1, weeks 3 to 7: the engine, the checker, the report

| # | Task | Acceptance |
|---|---|---|
| 1.1 | Monorepo scaffold, CI green on an empty build | `pnpm -r build && pnpm -r test` passes in GitHub Actions |
| 1.2 | `packages/engine` parse and detect both formats | Detects CycloneDX 1.4-1.7 and SPDX 2.2-3.0.1 from the 20-file corpus with zero misdetections |
| 1.3 | Rule pack schema + loader with mandatory `severityJustification` | A pack missing a justification throws at load, with a test proving it |
| 1.4 | `cisa-2026-v2.1` pack, 17 fields + 6 practices | Every rule has a fixture that triggers it and a fixture that passes it |
| 1.5 | `fda-524b` pack, built against the teardown gaps | Same. Plus: every rule in the pack maps to a row in `docs/teardown.md` |
| 1.6 | `packages/report` renders standalone HTML, no network | Opens from `file://` with no console errors, prints to one page per 20 findings |
| 1.7 | `apps/cli` published to npm | `npx @stratifypro/cli check file.json --pack fda-524b` works on a clean machine |
| 1.8 | `apps/web` free checker at `stratifypro.io` | Fully client-side. Network tab shows zero requests after page load |
| 1.9 | A defective sample preloaded on arrival | First paint shows real findings before the visitor does anything |
| 1.10 | Five-event instrumentation | arrival, file loaded, findings shown, report saved, contact clicked. No two share an id |
| 1.11 | Sentry wired | A deliberately thrown error appears in Sentry within 60s |
| 1.12 | Run the engine over all 20 corpus files, publish the results | `docs/corpus-results.md`, dated, reproducible by command |
| 1.13 | **`packages/resolve`, deterministic tiers only.** Exact, dictionary, heuristic. No model yet | Resolves the corpus. Abstention rate reported, never hidden. A null PURL is a valid output |
| 1.14 | **`packages/vulnmatch`.** OSV.dev and GitHub Advisory Database, PURL-native | Given a corpus file, returns advisories the file did not declare. Every match carries its resolution provenance and confidence |
| 1.15 | **`packages/eos`.** Curated PURL-keyed dataset, provenance and capture date per row | Covers the corpus. Published free under CC BY at `stratifypro.io/eos` |
| 1.16 | **`bench/identity` v0.** Labelled dataset, runner, and the four baselines | Public repo. Precision, recall, F1 and abstention rate reported separately. StratifyPro's own resolver scored alongside everything else |

**Gate 2: the pilot firm runs it on a real client engagement and describes the experience.**
**Failure branch:** used once then dropped means the product is wrong, not the marketing. Ask in person.

### Phase 2, weeks 8 to 14: the firm workspace and the evidence layer

| # | Task | Acceptance |
|---|---|---|
| 2.1 | Clerk auth + Organizations on `app.stratifypro.io` | A second firm cannot see the first firm's checks. Proven by a test that tries |
| 2.2 | Supabase schema + RLS | A direct PostgREST call with firm A's token returns zero of firm B's rows |
| 2.3 | Check history, projects, per-seat usage | A firm sees its own checks only, sorted newest first |
| 2.4 | White-label report: firm logo, firm footer, no mention of us unless they want it | Two firms produce visibly different reports from the same file |
| 2.5 | Evidence bundle: report + signed manifest + scope-of-attestation text | `cosign verify-blob` succeeds against the published public key |
| 2.6 | Licence agreement and terms, lawyer-reviewed | Signed by the first paying firm before any money moves |
| 2.7 | Scope of attestation stated verbatim in product and terms | The exact wording in Step 11. Never "contained". Never "signature" |
| 2.8 | **R10. Source code escrow + written continuity plan** | Agreement signed with an escrow agent, `docs/continuity.md` published. **Before the first paid contract.** This is the question that actually loses solo-founder deals |
| 2.9 | **R7. Written incident response plan** | Commits to 5-day breach notice and 3-business-day CISA KEV disclosure, matching MC2 v2 clauses 33 and 35. Tested once with a tabletop walkthrough |
| 2.10 | **R6. NIST SSDF self-attestation** | Published. MC2 v2 clause 46 asks for secure-development attestation by name |
| 2.11 | Texas SB 2610 written security program, mapped to CIS Controls IG1 | Published internally, dated. One week. Earns a statutory shield against exemplary damages and answers most of a vendor questionnaire |
| 2.12 | Texas sales tax permit | Obtained **before the first invoice**. Texas taxes SaaS as a data processing service, 80 percent of the charge |
| 2.13 | Combined technology E&O and cyber policy, $1M/$1M | Bound before the first paying customer. Standalone E&O does not respond to a cyber incident |

**Gate 3: three paying firms, or one firm renewing.**
**Failure branch:** a pilot that will not convert means the value is real but too small to charge for. That is a finding.

### Phase 2A, weeks 8 to 14, parallel: the AI tier, behind human confirmation

| # | Task | Acceptance |
|---|---|---|
| 2A.1 | Model tier in `packages/resolve`, attempted only after the deterministic tiers abstain | Scored on `bench/identity`. **Ships only if it beats the deterministic baseline on the published benchmark.** If it does not, it does not ship, and that result is published too |
| 2A.2 | Model suggestions surface in the workspace as suggestions with alternatives, never as findings | A `source: 'model'` resolution cannot produce a finding until a human confirms it. Proven by a test that tries |
| 2A.3 | Supplier document to draft SBOM: PDF, xlsx, csv in, CycloneDX draft out | Output always labelled a draft. Never signed, never bundled, never filed without human confirmation |
| 2A.4 | Deficiency response drafting from existing findings | Draft only. A person edits and sends. No auto-send path exists |
| 2A.5 | CI guard: no model call may reach a severity assignment or the attestation text | An import test that fails the build if the model tier is reachable from the severity path or the bundle route |

### Phase 3, weeks 15+: the AI parts list layer

This is the evidence asset and the weakest revenue asset. Build it here, not earlier.

| # | Task | Acceptance |
|---|---|---|
| 3.1 | `g7-ai-2026` rule pack, all 50 elements, built from the existing crosswalk JSON | Pack loads, `normativeLanguage: false` forces advisory, no rule may be `error` |
| 3.2 | Generator: emit a CycloneDX 1.7 model card from a Hugging Face or GGUF model | Round-trips through the checker with zero errors |
| 3.3 | The four gaps the competitor left: KPI cluster, real security fields, hardware link, support and end-of-support dates | Each has rules, fixtures and a documented schema-extension proposal |
| 3.4 | Contribute `model_card` support upstream to `cyclonedx-python-lib` | PR opened, whatever the outcome |

### Objective B workstream: runs continuously from week 3

| # | Task | Cadence | Acceptance |
|---|---|---|---|
| B.1 | Standards participation: OWASP GenAI AIBOM initiative (weekly call), SPDX AI WG, Ecma TC54, IETF SCITT | 2 hours/week, calendared | Attendance and contributions logged in `docs/record.md` with dates and links |
| B.2 | Automated metrics capture into `public_metrics` | Nightly cron | npm downloads, GitHub stars and forks, inbound links. Append only |
| B.3 | Public metrics page at `stratifypro.io/adoption` | Live from phase 1 | Reads `public_metrics`. Shows the series, not a single number |
| B.4 | Citation watch: alert on any public reference to the crosswalk or the packs | Weekly | Each logged with source, date, URL |
| B.5 | `docs/record.md`: one line per event, dated, linked | Weekly, 5 minutes | Never reconstructed after the fact |

B.2 through B.4 are ordinary product analytics that happen to also be the evidence
record. Build them once.

---

## 8. Testing

| Layer | What | Target |
|---|---|---|
| Unit | Format detection, JSONPath selectors, each assert operator, pack validation | ≥90% line coverage on `packages/engine` |
| Rule fixtures | Every rule: one file that triggers it, one that passes it | 100% of rules. **CI fails if a rule has no failing fixture** |
| Integration | Engine over the full 20-file corpus, snapshotted | Zero unexpected diffs |
| RLS | Firm A token attempts to read firm B rows, directly against PostgREST | Returns zero rows |
| E2E | Upload, see findings, download report, verify nothing left the browser | Playwright, runs on every PR |
| Security | `pnpm audit`, secret scan, header check | CI job, fails the build |
| **Benchmark** | `bench/identity` run on every resolver change | Precision, recall, F1 and abstention rate. A regression fails the build |
| **AI containment** | Import test proving the model tier is unreachable from severity assignment and from the attestation text | CI job. This is non-negotiable 4 made mechanical |
| **Provenance** | Every `Finding` traced to a match carries the resolution source and confidence | Snapshot test over the corpus |

The rule-fixture requirement is the one that matters most. A compliance tool whose
checks have never been seen to fail is worse than no tool, because everyone believes
it is watching.

---

## 9. Security checklist

Twelve of the standard twenty pre-launch items are CI jobs. If there is no CI they do
not exist, so CI comes in Step 1, not later.

| Item | The check that proves it |
|---|---|
| No secrets in the repo | `gitleaks` in CI, fails the build |
| Any key ever in a commit or screenshot is rotated | Manual, week 1, before the repo goes public |
| Server-side auth enforced | Every route handler calls `auth()` before touching data. Lint rule |
| Row-level security on | Migration test asserts `relrowsecurity` on all four tables |
| No client-supplied `firm_id` trusted | Grep test: no policy references a request body field |
| Input validated | Zod at every boundary. Uploaded JSON size-capped before parse |
| Uploaded content escaped in the report | Report renderer escapes all interpolated strings. Fixture with `<script>` in a component name |
| Security headers | `next.config.js` CSP, checked by an E2E assertion |
| HTTPS forced | Vercel default, asserted |
| Dependencies scanned | `pnpm audit` + Dependabot |
| Rate limiting | Vercel edge middleware on the API routes. Not needed on the static checker |
| Bot protection | Deferred. No auth surface on the free checker to protect |

A check that cries wolf gets muted, and a muted check is worse than an absent one.
Tune thresholds before turning anything on.

## 10. Out of scope

- Stripe, checkout, self-serve signup.
- Any Cyber Resilience Act claim. Medical devices are excluded by Recital 25.
- Any claim using the words: FDA compliant, FDA approved, certified, guaranteed,
  will pass, conformant, validated, Part 11 compliant. **This is a hard rule,
  enforced by a CI grep over all user-facing copy.**
- Any sentence saying a checked file "contained" anything, or calling the integrity
  seal a "signature". Same CI grep. See Step 11 for why these two are load-bearing.
- Any claim that a regulation requires third-party attestation of an SBOM. None does.
- **AI assigning or adjusting severity.** Forbidden, enforced by an import test.
- **AI generating or wording the attestation.** Forbidden, same test.
- **A chatbot anywhere in the product or on the site.**
- **Autonomous vulnerability triage or exploitability verdicts.** Not until the
  published evidence changes. Current best measured agreement with human judgement is
  0.06 to 0.10 on a 0-to-1 scale.
- **Leading any sales material with the word AI.** The buyer's own technical advisor
  has published skepticism of AI false positives in exactly this task. Lead with the
  benchmark.
- **CPE-first matching.** PURL first, always. See non-negotiable 5.
- Architecture views, traceability matrices, labelling and MDS2. All four have zero
  tooling and are real opportunities, and all four are a second product, not this one.
- Storing uploaded SBOMs.
- Mobile apps, browser extensions, IDE plugins.
- A dashboard before a firm asks for one.
- Selling to federal buyers.
- Fork of, or pull requests to, a competitor's codebase.

## 11. Rollback

| Change | Rollback |
|---|---|
| Web app | Vercel instant rollback to the previous deployment |
| npm packages | `npm deprecate` the bad version, publish a patch. Never unpublish |
| Rule pack | Packs are versioned and pinned per check. A bad pack affects new checks only; historical `checks` rows keep the version that produced them |
| DB migration | Every migration ships with its `down`. Tested in CI against a scratch database |
| Evidence bundle | Immutable by design. A bad bundle is superseded by a new one, never edited |

---

# 12. BUILD INSTRUCTIONS FOR CLAUDE CODE

Execute in order. Do not skip ahead. Each step ends with a **VERIFY** block; if it
does not pass, stop and fix before continuing. Do not mark a step done because it
was written. Mark it done because the VERIFY passed.

Replace `stratifypro.io`, `StratifyPro` and `StratifyPro` throughout before Step 1.

## Step 0. Prerequisites

```bash
node -v          # need >= 22
pnpm -v          # need >= 9; if missing: corepack enable && corepack prepare pnpm@latest --activate
gh auth status   # must be logged in
```

**Do not start Step 1 until `docs/teardown.md` exists** (Phase 0 task 0.1). The FDA
rule pack is built against what the free tools miss. Without it you are guessing, and
a guess here becomes a false marketing claim later.

**VERIFY:** all three commands succeed, `docs/teardown.md` exists and has a row per tool.

---

## Step 1. Scaffold, and make CI green before writing any feature

CI first. Twelve of the twenty security items live in CI; if CI arrives in week six
they were never real.

```bash
mkdir StratifyPro && cd StratifyPro && git init -b main
pnpm init
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

Root `package.json` scripts:

```json
{
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

Create all five package directories with a minimal `package.json`, `tsconfig.json`
and a passing placeholder test each: `packages/engine`, `packages/rules`,
`packages/report`, `apps/web`, `apps/cli`.

Create `.github/workflows/ci.yml` running, on every push and PR:
`pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`, `build`, `pnpm audit --audit-level=high`,
and a `gitleaks` scan.

**R5. Generate StratifyPro's own SBOM in CI** and attach it to every release. Use
`cyclonedx-npm` over the workspace. Publish it at `stratifypro.io/sbom.json`. Customer
security questionnaires ask for this by name (MC2 v2 clause 44), and a tool that
cannot produce its own bill of materials is a bad look you never want to explain.

**VERIFY:** push to GitHub. The Actions run is green. Deliberately commit a line
containing `AKIAIOSFODNN7EXAMPLE`, push to a branch, confirm gitleaks **fails** the
build, then remove it. A secret scanner that has never fired has never been tested.

---

## Step 2. `packages/engine`: parse and detect

Zero runtime dependencies. No `fs`, no `path`, no DOM. If you reach for a Node
built-in here, you have put the code in the wrong package.

Build in this order:

1. `src/types.ts`: `Severity`, `Finding`, `CheckResult`, `RulePack`, `Rule` exactly
   as section 6 defines them.
2. `src/detect.ts`: `detectFormat(doc)`. CycloneDX is identified by `bomFormat === 'CycloneDX'`
   plus `specVersion`. SPDX 2.x by `spdxVersion`, 3.x by the JSON-LD `@context`.
   Return `{ format, spec, confidence }`. Never throw on unknown input; return
   `{ format: null }` and let the caller decide.
3. `src/jsonpath.ts`: a minimal JSONPath evaluator covering only what the packs use:
   `$.a.b`, `$.a[*]`, `$.a[?(@.k=='v')]`, and existence. **Do not add a JSONPath
   dependency.** The subset is about 120 lines, and a zero-dependency engine is both
   a smaller browser bundle and a shorter security review for a buyer who will ask.
4. `src/assert.ts`: the operators: `exists`, `equals`, `matches`, `anyOf`, `allOf`,
   `not`, `minLength`, `oneOf`.

**VERIFY:** unit tests covering each operator, including the failure case for each.
Run `detectFormat` over all 20 files in `fixtures/corpus/`: zero misdetections, and
every file's detected spec version matches what the file actually declares.

---

## Step 3. `packages/rules`: the pack schema and the loader

1. `schema/rule-pack-1.json`: JSON Schema for the format in section 5.
2. `packs/cisa-2026-v2.1.json`, `packs/fda-524b.json`.
3. `src/load.ts`: `loadRulePack(json)`. It MUST throw when:
   - any rule lacks `severityJustification`
   - any rule lacks `sourceRef`, or names a document not in `sourceDocuments`
   - a source document has `normativeLanguage: false` and any rule citing it has
     `severity: "error"`
   - two rules share an id

That third condition is the honesty rule made mechanical. It is what stops this
project repeating the competitor's root error.

**VERIFY:** four tests, one per throw condition, each asserting the specific error
message. Then a fifth: load both real packs and assert they pass.

---

## Step 4. `packages/engine`: evaluate, and prove every rule can fail

1. `src/check.ts`: `check(doc, pack, opts)`. Walk each rule's selector, run its
   assert, emit a `Finding` per failing node with the exact JSONPath. Populate
   `evaluatedRules` and `skippedRules`. A rule whose `appliesTo` excludes the
   detected format is **skipped with a reason**, never silently dropped.
2. `opts.severityOverrides`: a `Record<ruleId, Severity>` the caller can pass.
   This is the configurable severity model. It is an input, never a constant.

For every rule in both packs create two fixtures in `packages/rules/fixtures/<ruleId>/`:
`fail.json` (triggers it) and `pass.json` (does not).

Write the CI job that enumerates every rule id in every pack and fails the build if
either fixture is missing or if `fail.json` does not actually produce that finding.

**VERIFY:** the fixture CI job is green. Then delete one `fail.json` and confirm CI
goes red. A check that has never gone red has never been tested.

---

## Step 4A. `packages/resolve`: identity, deterministic tiers only

No model in this step. Build the floor the model will later have to beat.

1. `src/normalize.ts`: canonicalise a raw component string: strip vendor prefixes,
   split name from version, normalise case and separators, handle the common
   `name-version` and `name_version` shapes.
2. `src/dictionary.ts`: a local alias dictionary keyed by normalised name, returning
   candidate PURLs with a confidence. Seed it from the AboutCode PURL database and the
   package registries. Ship it as data, versioned like a rule pack.
3. `src/resolve.ts`: the tier ladder from section 6A.2: exact, dictionary, heuristic.
   Returns a `Resolution` with `abstained: true` when nothing clears the threshold.
4. The confidence threshold is **configuration with a written justification**, exactly
   like severity. Default it conservatively.

**VERIFY:** run over the corpus and print the abstention rate. It will be high and
that is correct. Then assert the thing that matters: **no resolution above the
threshold is wrong on the hand-labelled sample.** A resolver that abstains often and
is never confidently wrong beats one that always answers.

---

## Step 4B. `bench/identity`: the benchmark, before the model

Build this **before** any model tier exists. If you build the model first you will
tune the benchmark to flatter it, which is how benchmarks become marketing.

1. `bench/identity/dataset.jsonl`: at least 2,000 rows of `{input, purl | null,
   source, notes}`, sampled from real SBOMs by a documented method, with an explicit
   unknown class for strings that genuinely resolve to nothing.
2. `bench/identity/run.ts`: scores any resolver implementing the `resolve` signature.
   Reports precision, recall, F1 **and abstention rate separately**. Abstention is
   measured, never counted as a miss.
3. Four baselines, run and published: exact match, string similarity, an embedding
   method, a generative model. This is the comparison a DOE national lab asked for in
   print and nobody has run.
4. `bench/identity/README.md`: the method, the sampling, the limitations, and how to
   re-run it. CC BY 4.0, public repo, from day one.

**VERIFY:** a stranger can clone the repo and reproduce every published number with
one command. If they cannot, it is not a benchmark, it is a claim.

---

## Step 4C. `packages/vulnmatch` and `packages/eos`

**vulnmatch.** Take resolved components, query OSV.dev by PURL, then the GitHub
Advisory Database, then CISA KEV. NVD is a fallback, never the foundation: since
15 April 2026 most new CVEs never get a CPE. Emit a `Finding` per advisory the SBOM
did not declare, carrying the advisory id, the source, and **the full resolution that
produced the match including its confidence and provenance**.

A match built on a low-confidence resolution must say so on the face of the report. A
reviewer has to be able to see how you got there, and so does the person who has to
defend it.

**eos.** A PURL-keyed dataset of support level and end-of-support date. Every row
carries its source URL and the date it was captured. Seed from endoflife.date and
vendor lifecycle pages. Publish free under CC BY at `stratifypro.io/eos`.

**VERIFY:** vulnmatch finds at least one advisory in a corpus file that the file does
not declare, and the report traces it end to end from raw string to advisory. For eos,
every row resolves to a live source URL, checked by a script.

---

## Step 5. `packages/report`: standalone HTML

Pure function: `renderReport(result: CheckResult, brand?: Brand): string`. Returns
one self-contained HTML document. No network requests, no external fonts, no CDN.
Inline the CSS. `brand` carries the firm's name, logo as a data URI, and footer text.

Requirements:

- Escape every interpolated string. Component names come from an uploaded file and
  are hostile input.
- A clean result must look deliberate, not broken: "18 rules ran, 0 findings",
  listing which rules ran.
- Findings grouped by severity, then by rule, each showing the JSONPath, the fix, and
  the source reference.
- **Match findings show their chain**: the raw string, what it resolved to, by which
  method, at what confidence, and the advisory it matched. A finding a reviewer cannot
  trace is a finding they will not accept.
- **Model-sourced resolutions are visibly labelled** wherever they appear.
- Prints cleanly. This document gets attached to an email and forwarded.

**VERIFY:** a fixture with `<script>alert(1)</script>` as a component name renders as
visible text, not script. Open the output from `file://` with the network disconnected
and confirm it renders fully.

---

## Step 6. `apps/cli`

```
npx @stratifypro/cli check <file> --pack fda-524b [--format json|text|html] [--out report.html]
npx @stratifypro/cli packs                    # list available packs and versions
npx @stratifypro/cli explain <ruleId>         # print the rule, its justification, its source
```

Exit codes: `0` no errors, `1` one or more `error` findings, `2` could not parse.
CI pipelines depend on this being stable, so treat it as an API.

`explain` exists because a regulatory person will ask "says who", and the answer must
be one command away.

**VERIFY:** `npm pack`, install the tarball in a clean container, run all three
commands against a corpus file. Confirm exit code 1 on a file with errors.

---

## Step 7. `apps/web`: the free checker

Next.js App Router. The checker route is **fully client-side**.

**UI stack, decided. Read `docs/ui-stack.md` before writing a component.** shadcn/ui
configured to its **Base UI style**, not the Radix default. Tailwind Plus Catalyst for
the workspace furniture. TanStack Table v9 for every table. Kibo UI for the dropzone.

**Four things change before the first component is written**, because shadcn at its
defaults is the most recognisable "AI built this" signature on the web: set the radius
token to 2 to 4 pixels, replace the palette with the ramp in `docs/design.md`, replace
Inter with IBM Plex Sans, and select the Base UI style.

1. Route `/`: the checker. Drop zone plus file picker. Parse and evaluate in the
   browser with `packages/engine`. Nothing is uploaded.
2. **A defective sample is loaded on arrival.** The first paint shows real findings
   before the visitor does anything. Never show a new user a zero.
3. One sentence, visible without scrolling: "Your file is processed in this browser
   and never uploaded."
4. Size guard before parse: over 25 MB, refuse and point at the CLI. A browser tab
   that hangs is worse than an honest refusal.
5. Download the report via a Blob URL. No server round trip.
6. Route `/adoption`: the public metrics page (objective B.3), reading
   `public_metrics` through a Supabase anon client.
7. Route `/crosswalk`: the 50-element crosswalk, browsable, with the JSON and CSV
   downloadable.

Five events via Vercel Analytics: `arrive`, `file_loaded`, `findings_shown`,
`report_saved`, `contact_clicked`. Check no two share an id.

**VERIFY:** load the page, open the network tab, run a file through it. Zero requests
after initial page load. Then run the size guard with a 30 MB file and confirm the
refusal message names the CLI.

---

## Step 8. Clerk

1. Clerk application. Enable **Organizations**. One organization per consultancy.
2. Middleware protects `app.stratifypro.io` and `/api/*`. The apex checker stays public.
3. Roles: `admin` (manages seats, signs the licence) and `member`.
4. Configure the Supabase JWT template so the org id lands in the `o.id` claim that
   the RLS policies in section 4 read.
5. **R2. OFAC screening at organization creation.** Check the organization name and
   the admin's email domain against the Treasury SDN list, and block signups from
   Cuba, Iran, North Korea, Syria and the covered Ukrainian regions. Refresh the SDN
   list weekly. This applies to every US company with no size threshold, so it is not
   optional and it is about fifty lines of code.

**VERIFY:** create two organizations. Sign in as a member of the first. Confirm the
second organization's name appears nowhere in any API response or client bundle.

---

## Step 9. Supabase

1. Apply the schema from section 4 as a numbered migration with a matching `down`.
2. Enable RLS on all four tables. Write every policy.
3. Storage bucket `evidence`, private, no public access.
4. Nightly cron (Vercel Cron) writing npm, GitHub and citation metrics into
   `public_metrics`. Append only.
5. **R1. Pin the Supabase project to a US region** at creation. The region cannot be
   changed later without a migration. MC2 v2 clause 24 forbids processing customer
   data outside the United States, and that clause cascades to you through clause 20.
6. **R9. Tested restore, not just backups.** Enable point-in-time recovery, then
   actually restore into a scratch project and confirm the data is there. Write the
   date and the result into `docs/continuity.md`. A backup nobody has restored is a
   belief, not a backup.

**VERIFY:** the RLS test. Mint a token for firm A. Call PostgREST directly, outside
the app, asking for firm B's `checks` rows. It must return zero rows. Write this as a
test that runs in CI, not a thing you did once by hand.

---

## Step 10. The firm workspace

Routes under `app.stratifypro.io`: check history, projects, seat usage, brand settings
(logo upload, footer text) feeding `renderReport`'s `brand`.

Server-side: a route handler that accepts a check result from the client, validates
it with Zod, and persists it. **The uploaded file itself is never sent.** The client
computes the SHA-256 and sends the hash plus the findings.

**R8. Immutable audit log of every administrative action.** Append-only table, no
update or delete policy, recording actor, action, target and timestamp. This is the
compensating control for the fact that a one-person company cannot separate duties.
Security questionnaires ask how you prevent a single administrator acting unobserved;
this is the honest answer, and it is better than claiming a separation you do not have.

**VERIFY:** two firms, same input file, two visibly different branded reports. Check
the request payload in the network tab and confirm the SBOM content is not in it.

---

## Step 10A. The model tier, and the wall around it

Only after Step 4B exists and the workspace can hold a human confirmation.

1. `packages/resolve/src/model.ts`: attempted **only** when the deterministic tiers
   abstain. Prompt is constrained selection from a candidate list, never open
   generation. The model must be able to return "none of these".
2. Score it on `bench/identity`. **If it does not beat the deterministic baseline, it
   does not ship, and you publish that result.** A negative result honestly reported
   is worth more to your credibility than a model that quietly makes things worse.
3. Workspace UI: model suggestions appear as suggestions with their alternatives and
   confidence. A person accepts or rejects. Acceptance writes a `source: 'human'`
   resolution and adds the pair to the dictionary, so the deterministic tier gets
   better every time someone confirms one.
4. Supplier document extraction: PDF, xlsx and csv in, a **draft** CycloneDX file out,
   labelled a draft in the file itself and in the UI.
5. Deficiency response drafting: findings in, draft prose out, edited and sent by a
   person. No auto-send path exists.

**The wall, and it is a test not a policy.** Write a CI job that fails the build if
the model module is reachable in the import graph from: the severity assignment path,
the attestation text, or the evidence bundle route. Then plant a violating import and
confirm it goes red.

**VERIFY:** the containment test has been seen to fail. The benchmark numbers for the
model tier are published, win or lose. A model-sourced resolution cannot produce a
finding without a human confirmation, proven by a test that attempts it.

---

## Step 11. The evidence bundle

Phase 2 only. Build nothing here until Gate 2 has passed.

Bundle contents:

```
evidence-<checkId>/
  report.html            the rendered report
  result.json            the CheckResult verbatim
  manifest.json          engine version, pack id and version, file sha256, timestamp
  attestation.txt        the scope of attestation, verbatim
  README.txt             how to verify this bundle yourself
```

`attestation.txt` says exactly this and nothing more:

> On `<date>` a file presenting SHA-256 `<hash>` was submitted to StratifyPro
> engine version `<v>` and evaluated against rule pack `<id>@<version>`,
> producing the findings recorded in `result.json`.
>
> StratifyPro did not retain the submitted file and cannot reproduce its contents.
> This record attests to the integrity of an artifact held by the submitter, not
> to what that artifact contained.
>
> This is not a statement that the software described is safe, that it complies
> with any regulation, or that any regulatory submission will be accepted.
> It is not an electronic signature within the meaning of 21 CFR 11.3(b)(7).

Apply a Sigstore keyless **cryptographic integrity seal** to the bundle hash.
Publish the verification command in `README.txt`.

**This wording is load-bearing and is not open to paraphrase.** Two rules:

1. **Never claim the file "contained" anything.** StratifyPro never stores the file,
   so it cannot attest to its contents. It can attest that a file presenting that
   hash was submitted and produced those findings. Version 1.0 of this spec got this
   wrong. A claim that cannot be substantiated is an FTC Act section 5 exposure, and
   the attestation is the entire Phase 2 value proposition, so every word of it is a
   representation a regulator can read.
2. **Never call the seal an electronic signature.** Under 21 CFR 11.3(b)(7) an
   electronic signature is a compilation executed by *an individual* as the legally
   binding equivalent of their handwritten signature. Sigstore keyless signing is
   machine provenance. Marketing it as a person's approval volunteers StratifyPro
   into 11.50, 11.100 and 11.200 territory for no benefit whatsoever.

**VERIFY:** on a different machine, with only the published public key, run
`cosign verify-blob` against the bundle and have it succeed. Then alter one byte and
confirm it fails.

---

## Step 12. Deploy

1. Vercel project on `stratifypro.io`. Apex to the checker, `app.` subdomain to the workspace.
2. Environment variables in Vercel, never in the repo. Separate preview and production values.
3. CSP and security headers in `next.config.js`, asserted by an E2E test.
4. Sentry on both apps, source maps uploaded, release tagged with the git SHA.
5. Publish `packages/engine`, `packages/rules` and `apps/cli` to npm under the org scope.
6. GitHub release workflow: tag, build, publish, attach the CLI tarball.
7. **R1. Pin the Vercel project to a US region** and add an end-to-end assertion that
   reads the deployment region and fails if it is not US.
8. **R3. Publish `/.well-known/security.txt`** and a vulnerability disclosure policy
   at `stratifypro.io/security`, committing to acknowledge a report within 3 business days.
9. **R4. Publish the sub-processor list** at `stratifypro.io/subprocessors`: Vercel,
   Supabase, Clerk, Sentry, Resend. Commit to 15 days' notice before adding one.
   GDPR Article 28(4) requires this if a European customer ever appears, and the
   security questionnaire asks for it either way.

**VERIFY:** a fresh browser on a phone loads `stratifypro.io`, runs the bundled sample, and
downloads a readable report. Throw a deliberate error in production and confirm it
lands in Sentry inside a minute.

---

## 13. Definition of done, per phase

**Phase 1 done means all of:**

1. `pnpm -r test` green, engine coverage ≥90%.
2. Every rule in both packs has a passing and a failing fixture, enforced by CI.
3. The CI secret scanner has been seen to fail on a planted secret.
4. `stratifypro.io` serves the checker, client-side, verified by an empty network tab.
5. The CLI installs from npm on a clean machine and returns exit code 1 on a bad file.
6. `docs/corpus-results.md` published, regenerable by one command.
7. `docs/teardown.md` published, and every `fda-524b` rule maps to a row in it.
8. No banned word appears in any user-facing copy, enforced by a CI grep.
9. `docs/cisa-2026-elements.md` exists and every rule in `cisa-2026-v2.1` maps to a row in it.
10. `bench/identity` is public, has at least 2,000 labelled rows, and reports four baselines.
11. `docs/coverage-baseline.md` publishes an identifier-coverage figure with a re-runnable method.
12. The end-of-support dataset is public under CC BY and covers the corpus.

**Phase 2 done means all of:**

1. The RLS cross-firm test runs in CI and returns zero rows.
2. Two firms produce visibly different branded reports.
3. A bundle verifies with `cosign verify-blob` on a machine that never saw the private key.
4. The licence agreement is lawyer-reviewed and signed by one paying firm.
5. The scope-of-attestation text appears verbatim in the product and in the terms,
   and the words "contained" and "signature" appear nowhere near it.
6. Source code escrow is signed and `docs/continuity.md` is published.
7. The liability cap and the regulatory-consequence disclaimer are in the executed agreement.
8. Vercel and Supabase both report a US region, asserted by a test.
9. Texas SB 2610 program written; sales tax permit obtained; E&O and cyber policy bound.
10. The AI containment import test is in CI and has been seen to fail on a planted violation.
11. No model-sourced resolution has ever produced a finding without human confirmation, proven by a test.
12. If the model tier shipped, its benchmark numbers are published. If it did not beat the deterministic baseline, that result is published instead.

**Phase 3 done means all of:**

1. The `g7-ai-2026` pack loads, and the loader refuses any `error` severity in it.
2. The generator produces a model card that round-trips through the checker cleanly.
3. A pull request adding `model_card` support to `cyclonedx-python-lib` is open.

---

## 14. Effort estimate

At 20 hours a week.

| Phase | Component | CC-assisted |
|---|---|---|
| 0 | Teardown, publish, outreach, corpus | 1.5 weeks |
| 1 | Engine + JSONPath subset | 1 week |
| 1 | Rule packs (41 rules with fixtures) | 1.5 weeks |
| 1 | Report renderer | 0.5 week |
| 1 | CLI | 0.5 week |
| 1 | Web checker + instrumentation | 1 week |
| 2 | Clerk + Supabase + RLS | 1 week |
| 2 | Firm workspace + white-label | 1.5 weeks |
| 2 | Evidence bundle + signing | 1 week |
| 2 | Legal, terms, licence | 1 week wall-clock, mostly waiting |
| 1 | resolve (deterministic) + vulnmatch + eos | 2 weeks |
| 1 | bench/identity: dataset, runner, four baselines | 2 weeks |
| 2A | Model tier + document extraction + drafting + containment test | 2 weeks |
| 3 | AI pack + generator + gap fills | 3 weeks |

Phase 0 to Gate 3: roughly 11 working weeks, plus whatever the firms take to reply.
The schedule risk is entirely in their calendar, not yours.

---

## 14A. What is already built, and how you can check it

Written 13 September 2026. Corrected 20 September 2026. These are files on disk, not
descriptions of files.

**`./verify.sh` asserts the rule packs, the fixtures, the mutation test, the corpus and
its SHA-256 values, the coverage baseline, the benchmark and the alias dictionary.** It
exits nonzero the moment any of those stops being true. The remaining rows in this table
are documents: they exist, and no command checks their contents. That distinction is
stated because a table claiming a command proves something it does not check is exactly
the failure this project is built against.

| Artifact | State | Path |
|---|---|---|
| CISA 2026 v2.1 rule pack | **23 rules.** 9 metadata, 8 component, 6 practices. One to one with the 23 elements | `packages/rules/packs/cisa-2026-v2.1.json` |
| FDA 524B rule pack | **16 rules.** 2 error, 12 warning, 2 info | `packages/rules/packs/fda-524b.json` |
| Rule pack JSON Schema | Encodes both honesty rules: severity justification mandatory, `error` only from a normative source | `packages/rules/schema/rule-pack-1.json` |
| Reference validator | Six checks. The TypeScript loader must reproduce it exactly | `packages/rules/src/validate.py` |
| Mutation test | Plants six violations, confirms each is rejected. **All six go red** | `packages/rules/src/mutation-test.py` |
| Reference engine | Minimal JSONPath and assert evaluator, so the fixture claim can be proven instead of counted | `packages/rules/src/reference-engine.py` |
| Rule fixtures | **156 files, 78 rule-format pairs, every one proved to fire.** Zero silent fixtures, zero rules firing on their own pass fixture | `packages/rules/fixtures/` |
| Corpus | **21 real published SBOMs**, 5,088 components, with provenance and SHA-256 each | `fixtures/corpus/` |
| Coverage baseline | Measured, published and regenerable with `python3 scripts/coverage.py`. PURL 94.8%, **CPE 40.9%**, hash 33.3%, license actually asserted 20.8%, supplier 5.1%. **0 of 21 files declare their graph incomplete.** Supplier and license were corrected downward on 20 September when the counting rules were written down; see the correction note in `docs/coverage-baseline.md` | `docs/coverage-baseline.md` |
| IANA hash vocabulary | With the format-enum mapping and the three-outcome rule | `packages/rules/data/iana-hash-names.json` |
| Seed alias dictionary | 1,854 entries, built from the **train split only** | `packages/rules/data/alias-dictionary.json` |
| Identity benchmark | **2,913 rows**, held-out split by file, four measured baselines, limitations published | `bench/identity/` |
| CISA element verification | 23 elements mapped one to one, eight renames and two removals named | `docs/cisa-2026-elements.md` |
| Design specification | Palette, three faces, seven components, first-screen order, print, accessibility | `docs/design.md` |
| Interface and error copy | Exact strings for every failure path and result state | `docs/copy.md` |
| Repo conventions | Commands, layout, six non-negotiables, banned words, the traps | `CLAUDE.md` |

### Four findings from building this, each of which changes the spec above

**One. Writing the reference engine found 19 defects in my own rule packs**, every one
invisible until the rules were actually run. Most were SPDX selectors that could never
hold: SPDX carries creators as strings of the form `Organization: X`, not objects with
a `name` field, so an assert for `name` was permanently false. Two rules fired on their
own pass fixtures. Three fail fixtures broke nothing.

This is the entire argument for non-negotiable 3, and it arrived before a line of
TypeScript existed. **The schema gained per-format assertions as a result**, because one
assertion genuinely cannot serve two structurally different formats. A directory full of
files named `fail.json` proves nothing. Running them proves something.

**Two. The CISA 2026 document has no normative language at all.** Zero occurrences of
"shall". Zero of "recommended". One "must", in prose about sharing mechanisms rather
than about a data field. "should" appears 66 times, "may" 42 times. **The pack is marked
`normativeLanguage: false` and its ceiling is `warning`.** Section 5's loader rule
forbids `error` on a non-normative source, and this is the first real pack it bites on,
which is the rule working rather than failing. Only two rules in either pack are errors
and both cite the statute, which is the one source with a genuine "shall".

**Three. Deterministic identity resolution is almost always right and almost never
fires.** Measured on the held-out split: precision 0.977, recall 0.089. Nine names in
ten are ones the dictionary has never seen. On realistic messy input recall falls to
0.030 and precision starts to erode. **No baseline produced a single unknown-class false
positive**, and that is the bar a model tier has to match. So the target to beat is not
F1: it is **recall at precision at or above 0.95, with zero unknown-class false
positives.** A model that reaches F1 0.6 by guessing is worse than no model.

**Four, and the one most likely to be got wrong.** The February 2026 FDA guidance still
points at the **October 2021 NTIA** baseline attributes, not at the CISA 2026 element
set. Checking an FDA submission against the 2026 elements is checking against a document
FDA has not adopted. The two packs are deliberately different and must not be merged.

## 15. Open questions

1. `stratifypro.io` and `StratifyPro` are unset. The business name is resolved: StratifyPro.
   These are the only two blanks left in the entire spec.
2. Whether the pilot firm will let their logo appear on a report that is also used to
   sell to their competitors. Ask before building brand settings.
3. Whether any firm wants per-submission pricing rather than an annual licence. If two
   do, Stripe re-enters scope and section 3.3 gets revised.
4. Whether the model tier beats the deterministic baseline at all. Genuinely unknown.
   The only published attempt reached 0.66 precision on a harder version of the task.
   The spec is written so that a negative answer costs two weeks and produces a
   publishable result rather than a dead end.
5. Whether to build the second product: architecture views, traceability, labelling
   and MDS2 all have zero commercial tooling and two of them are named deficiencies.
   Do not decide this before Gate 3.

---

# 16. Regulatory posture for StratifyPro as a vendor

Added 13 September 2026 after a compliance review. Every verdict below is about
what binds **StratifyPro**, not what binds its customers. Sources were read
directly; where a finding is second-hand it says so.

## 16.1 What does not apply, and why that matters

| Regime | Verdict | Why |
|---|---|---|
| **21 CFR Part 11** | **Does not apply** | Part 11 obligations run to "persons who use" electronic records, meaning the regulated entity, never the tool vendor. FDA's October 2024 guidance states it plainly: "Regulated entities are responsible for ensuring that electronic records meet applicable part 11 requirements," and "FDA will generally not review audit reports of the IT service provider's electronic systems." Separately, Part 11 attaches only to records required by a predicate rule. The SBOM is required by 21 USC 360n-2(b)(3); a third-party attestation of it is not required by anything, so the evidence bundle is voluntary supporting material and not a Part 11 record at all. **There is no such thing as a Part 11 compliant product.** Any vendor claiming to sell one is marketing, not law |
| **Computer Software Assurance** | **Does not apply** | The final CSA guidance is scoped to "computers or automated data processing systems used as part of production or the quality management system for medical devices." A tool that prepares a submission is neither |
| **Texas Data Privacy and Security Act** | **Does not apply** | Exempt twice. The Act excludes SBA small businesses, and its definition of consumer "does not include an individual acting in a commercial or employment context." StratifyPro's only data subjects are consultancy staff acting commercially. One residual duty survives even for exempt businesses: do not sell sensitive personal data. Trivially satisfied, state it in the privacy policy |
| **CCPA / CPRA** | **Does not apply** | All three thresholds missed by orders of magnitude. Note the B2B carve-out sunset in 2023, so business contact data is personal information now; the thresholds are the only thing keeping StratifyPro out |
| **EAR / ITAR export control** | **Does not apply** | Sigstore performs signing, integrity, authentication and non-repudiation only. Technical Note 1 to ECCN 5A002.a excludes exactly those functions from "cryptography for data confidentiality," so 5D002 never engages and the 742.15(b) notification never triggers. Sigstore is also standard cryptography built on published IETF and ISO work, so the non-standard-cryptography notification does not apply either |
| **HIPAA** | **Does not apply** | No PHI transits the system. **Decline the BAA in writing** when one arrives by reflex. Signing an unnecessary BAA imports breach-notification timelines and HHS audit rights for nothing |
| **EU MDR** | **Does not apply** | Not a device, no medical purpose |
| **FedRAMP** | **Avoid** | If a customer requires it, the deal is not for a solo founder. Six figures, 12 to 18 months |

**The one important consequence.** The absence of a Part 11 burden is good news for
cost and bad news for the pitch. FDA's current February 2026 cybersecurity guidance
nowhere requires, mentions or contemplates third-party attestation of an SBOM.
**No regulation creates demand for the evidence bundle.** Sell it as workflow and
defensibility value to the consultancy. Selling it as regulatory necessity would be
both false and an FTC section 5 problem.

## 16.2 What does apply

| Regime | Verdict | Obligation |
|---|---|---|
| **FTC Act section 5** | **Applies. Largest real exposure** | No revenue threshold, no small-business exemption. The whole Phase 2 proposition is an attestation, so every word of it is an actionable representation. This, not Part 11, is the regulator to draft around |
| **Texas breach notification** | **Applies** | Notify affected individuals within 60 days. Notify the Texas Attorney General if 250 or more Texans are affected |
| **Texas SB 2610** | **Applies, and is free protection** | Effective 1 September 2025. A business under 250 employees that adopts a conforming written cybersecurity program gets a shield against exemplary damages in breach litigation. At 20 to 99 employees the standard is CIS Controls Implementation Group 1; below 20 it is basic measures. A week of writing for a real liability shield that doubles as questionnaire evidence |
| **Texas sales tax on SaaS** | **Applies, routinely missed** | Texas taxes SaaS as a data processing service. 20 percent of the charge is exempt, so 80 percent is taxable. Sales tax permit required before the first invoice. Confirm with a Texas CPA |
| **OFAC sanctions** | **Applies to everyone** | Screen customers against the SDN list at signup. Block Cuba, Iran, North Korea, Syria and the covered Ukrainian regions. A screening check and a terms clause covers it |
| **GDPR** | **Depends** | Only if a consultancy's engagement touches EU personal data, and then StratifyPro is an Article 28 processor or sub-processor. SBOM findings contain no personal data; the only personal data is Clerk account data. Clerk, Vercel and Supabase all publish DPAs incorporating Standard Contractual Clauses, so the chain exists. Watch Article 27: the EU representative derogation covers "occasional" processing, which regulators read narrowly for a subscription product. Budget 100 to 300 euro a month for a representative service if EU customers appear |
| **EU Cyber Resilience Act** | **Depends. Check before shipping to the EU** | Pure SaaS is generally out of scope, but the CLI is downloadable software placed on the market. Vulnerability and incident reporting obligations commenced 11 September 2026; full application 11 December 2027. Micro and small enterprises cannot be fined for missing the 24-hour actively-exploited-vulnerability deadline, and open-source stewards face no penalties. Resolve this before the npm packages are promoted in the EU |

## 16.3 Commercial gates that are not law but behave like it

**Vendor security questionnaires will arrive.** The relevant instrument is Model
Contract Language for MedTech Cybersecurity version 2 (MC2 v2, HSCC, November 2025).
It is written for hospital-to-manufacturer contracts, but clause 20 makes the
supplier responsible for every subcontractor's compliance, so its terms cascade to
StratifyPro. Clauses that will be pushed down:

| Clause | What it demands | StratifyPro's position |
|---|---|---|
| 44 | Provide an SBOM for your own product | Achievable. Generate it with your own tool. Good story |
| 33 | Disclose exploitable CISA KEV vulnerabilities within 3 business days | Achievable with Dependabot plus a written process |
| 35 | Written breach notice within 5 days | Achievable. Put it in the incident response plan |
| 38 | Test against OWASP Top 10 and CWE/SANS Top 25 | Achievable. Annual third-party penetration test |
| 46 | Attest to secure development under NIST SSDF, IEC 81001-5-1 or ISA 62443-4-1 | Achievable. SSDF self-attestation |
| 24 | **No customer data processed outside the United States** | **Architecture requirement.** Pin Vercel and Supabase to US regions. Add to Step 9 and Step 12 |
| 42/43 | Security testing results subject to customer audit | Achievable at this size |

MC2 v2 does **not** mandate SOC 2, ISO 27001 or HITRUST, and contains no insurance
requirement. Useful negotiating facts.

**SOC 2 is deferred, deliberately.** Published costs put year one at $20,000 to
$35,000 all-in (auditor $8k to $18k, automation platform $6k to $15k a year,
penetration test $4k to $8k) over five to six months, driven by the observation
window. Against the licence revenue a first year realistically produces, a Type II
consumes the whole of it. The sequence instead:

1. **Texas SB 2610 written program mapped to CIS Controls IG1.** One week. Free. Real liability shield. Answers most of a questionnaire.
2. **Completed CAIQ v4**, self-assessed and signed. Free. Covers roughly 80 percent of what gets sent.
3. **Independent penetration test**, $4k to $8k. Often more persuasive to a technical reviewer than a certificate.
4. **SOC 2 Type I**, roughly half the cost, ships in about eight weeks, buys goodwill while the Type II window runs.
5. **SOC 2 Type II** only when a deal actually requires it.

**The strongest card is the architecture, not a certificate.** The free tier runs
client-side and the paid tier never stores the SBOM. "We cannot leak your bill of
materials because we do not have it" defeats most of a security questionnaire on the
merits. Produce a one-page data-flow diagram proving it and lead every security
conversation with that.

**Key-person risk is what actually kills solo-founder deals, not SOC 2.** Answer it
before it is asked: source code escrow (roughly $1,000 to $3,000 a year) plus a
written continuity plan. Highest-leverage trust artifact available for the money.

**Supplier qualification package, not IQ/OQ/PQ.** CSA explicitly blesses leveraging
vendor work: the manufacturer "could incorporate the software development practices,
validation work, and electronic information already performed by developers of the
software as the starting point." So publish: SDLC description, test strategy and
coverage summary, change control and release notes, known-issues list, intended-use
statement with explicit limitations, StratifyPro's own SBOM, and a security overview.
Roughly two weeks of writing. **Do not ship IQ/OQ/PQ documents** and do not sell
"validated software." IQ/OQ/PQ is process-validation vocabulary that does not fit
multi-tenant SaaS on continuous deployment, and promising it creates obligations that
cannot be met.

## 16.4 Insurance and contract terms

Combined technology errors-and-omissions plus cyber liability at $1M per occurrence
and $1M aggregate. Reported market range for a solo US software vendor is $1,500 to
$5,000 a year; the published median across small tech businesses is around $88 a
month, and selling into a regulated industry prices above that but not painfully.
Buy the **combined** form: standalone E&O does not respond to a cyber incident.

Typical exclusions to know about: bodily injury and property damage (so if a device
harms a patient and the findings are implicated, E&O does not respond), regulatory
fines and penalties, and guarantees of results. That last one matters: warranting
that findings are complete or that a submission will be accepted is likely outside
coverage as well as being a banned claim under section 10.

**The liability cap matters more than the policy limit.** In every agreement:

- Cap aggregate liability at fees paid in the trailing 12 months.
- Disclaim consequential, indirect and regulatory-consequence damages.
- **Never accept uncapped indemnity for regulatory outcomes or submission rejection.**
  No insurer follows you there, and one such clause ends the company regardless of
  what is insured.
- **Never contractually assume a regulatory obligation.** The moment an agreement
  says StratifyPro "ensures Part 11 compliance" or "is responsible for the accuracy
  of regulatory records," StratifyPro becomes an inspectable party. State the
  opposite explicitly.

## 16.5 Additions to the build

These are spec changes, not advice.

| # | Change | Where |
|---|---|---|
| R1 | Pin Vercel and Supabase to US regions. Assert it in a test that reads the deployment region | Step 9, Step 12 |
| R2 | OFAC SDN screening at organization creation | Step 8 |
| R3 | `security.txt` and a published vulnerability disclosure policy | Step 12 |
| R4 | Published sub-processor list with 15 days' change notice | Step 12 |
| R5 | Generate StratifyPro's own SBOM in CI and publish it with each release | Step 1 |
| R6 | NIST SSDF self-attestation document | Phase 2 |
| R7 | Written incident response plan committing to 5-day breach notice and 3-business-day KEV disclosure | Phase 2 |
| R8 | Immutable audit logging of every admin action, as the compensating control for having no separation of duties at n=1 | Step 10 |
| R9 | Tested restore from backup, not just backups | Step 9 |
| R10 | Source code escrow and a written continuity plan | Phase 2, before the first paid contract |

## 16.6 Order of work

1. Fix the attestation wording. Free, and it is the largest exposure.
2. Texas SB 2610 written program mapped to CIS IG1. One week.
3. Liability cap and disclaimers in the agreement template. Lawyer, half a day.
4. Combined E&O and cyber policy.
5. Texas sales tax permit before the first invoice.
6. Source code escrow and continuity plan.
7. Completed CAIQ v4.
8. Penetration test.
9. SOC 2 Type I, only when a deal is in sight.
