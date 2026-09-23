/**
 * One standalone HTML document from a CheckResult.
 *
 * No network requests, no external fonts, no CDN, no script. The report is an
 * evidence artifact: it gets attached to a submission, forwarded by email and
 * opened by someone who has never seen the application, possibly years later
 * and possibly offline. Anything it has to fetch is something that can fail in
 * front of a regulator.
 *
 * Light only. No dark block ships. A reviewer on a dark operating system must
 * see what the sender saw, and a print stylesheet fighting a dark theme
 * produces an unreadable evidence document.
 */
import type { CheckResult, Finding, Severity } from '@stratifypro/engine';

// The attestation lives in its own file so the banned-phrase scan can exempt
// that file alone. See attestation.ts for why the exemption is narrower than
// the check it replaces.
export { attestationText, ATTESTATION_TEMPLATE, type AttestationInput } from './attestation.js';

export interface ReportInputs {
  /** Version-pinned inputs. Without these the artifact is not re-runnable. */
  engineVersion: string;
  rulePackId: string;
  rulePackVersion: string;
  dictionaryVersion?: string;
  eosVersion?: string;
  advisorySnapshotId?: string;
}

export interface ReportOptions {
  fileName: string;
  generatedAt: string;
  /** Total components seen, so coverage can be stated rather than implied. */
  componentsTotal?: number;
  componentsResolved?: number;
  inputs?: Partial<ReportInputs>;
  /** Partner branding. Absent for the free layer. */
  firmName?: string;
  /**
   * The firm's mark, as a data URI or an absolute https URL.
   *
   * SPEC.md 2.4 asks for a firm logo. It is NOT interpolated as a URL without
   * checking: this report is a standalone HTML file a firm sends to a
   * regulator, and a `javascript:` or `data:text/html` value here would
   * execute when it is opened. `firmLogoSafe` below decides what is allowed,
   * and anything else is dropped rather than rendered.
   */
  firmLogo?: string;
  /** The firm's own closing text, replacing the default sentence about the tool. */
  firmFooter?: string;
  /**
   * Remove every mention of StratifyPro from the rendered document.
   *
   * SPEC.md 2.4: "no mention of us unless they want it". A consultancy sending
   * a deliverable to its own client has not agreed to advertise its
   * subcontractor, and a white label that leaks the vendor's name into the
   * footer is not a white label.
   *
   * This does NOT touch the attestation text. See ATTESTATION: that wording
   * names the engine because it is a statement about what produced the
   * findings, and a firm cannot both hand over the attestation and delete the
   * name of the thing being attested to.
   */
  whiteLabel?: boolean;
}

/**
 * Whether a logo value may be placed in a `src` attribute.
 *
 * Allowed: an https URL, or a data URI for a real image type. Everything else
 * is dropped. The report is a file that gets emailed to a regulator and opened
 * from disk, so `javascript:` and `data:text/html` are code execution in the
 * reader's browser, delivered by the firm, with the firm's name on it.
 */
export function firmLogoSafe(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(v)) return v;
  return null;
}

/**
 * Escape before interpolation, every time.
 *
 * Every component name, version and path in here came out of a file somebody
 * else wrote. A bill of materials is not trusted input, and this document gets
 * opened in a browser.
 */
export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ORDER: Severity[] = ['error', 'warning', 'info', 'advisory'];
const RANK: Record<Severity, number> = { error: 3, warning: 2, info: 1, advisory: 0 };

interface Group {
  ruleId: string;
  title: string;
  severity: Severity;
  fix: string;
  sourceRef: string;
  instances: Finding[];
}

function group(findings: Finding[]): Group[] {
  const m = new Map<string, Group>();
  for (const f of findings) {
    let g = m.get(f.ruleId);
    if (!g) {
      g = { ruleId: f.ruleId, title: f.title, severity: f.severity, fix: f.fix, sourceRef: f.sourceRef, instances: [] };
      m.set(f.ruleId, g);
    }
    g.instances.push(f);
  }
  return [...m.values()].sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.ruleId.localeCompare(b.ruleId));
}

/** Instances listed in full before the rest collapse into a count. */
const LISTED = 10;

const STYLE = `
:root{--ink:#16191d;--ink-2:#4a5158;--ink-3:#727a82;--line:#d8dce0;--bg:#fff;
--err:#9b2c28;--err-bg:#f7e4e3;--warn:#7a5300;--warn-bg:#f6eeda;--info:#2f4f6b;--info-bg:#e6edf2;
--adv:#4a5158;--adv-bg:#eef0f2}
*{box-sizing:border-box}
body{margin:0;padding:32px;background:var(--bg);color:var(--ink);
font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
font-variant-numeric:tabular-nums}
h1{font-size:19px;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:13px;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3)}
.sub{color:var(--ink-2);margin:0 0 20px}
.cover{border:1px solid var(--line);padding:14px 16px;margin:0 0 4px}
.cover .big{font-size:16px;font-weight:600}
.cover .note{color:var(--ink-2);margin-top:5px}
.counts{margin-top:9px;color:var(--ink-2)}
.chip{display:inline-block;padding:1px 7px;border:1px solid;font-size:11px;
font-weight:600;letter-spacing:.03em;text-transform:uppercase;margin-right:6px}
.error{color:var(--err);border-color:var(--err);background:var(--err-bg)}
.warning{color:var(--warn);border-color:var(--warn);background:var(--warn-bg)}
.info{color:var(--info);border-color:var(--info);background:var(--info-bg)}
.advisory{color:var(--adv);border-color:var(--adv);background:var(--adv-bg)}
/* Uniform border on purpose. A coloured left accent rail is the shadcn Alert
   variant that docs/ui-stack.md lists among the things that give a generated
   interface away, and the design brief's notice component says no accent rail.
   Severity is already carried by the chip, which is legible in print and does
   not depend on colour alone. */
.rule{border:1px solid var(--line);padding:13px 15px;margin:0 0 10px;
break-inside:avoid;page-break-inside:avoid}
.rule h3{font-size:14px;margin:0 0 3px;font-weight:600}
.rule .meta{color:var(--ink-3);font-size:12px;margin-bottom:8px}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}
th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;
color:var(--ink-3);border-bottom:1px solid var(--line);padding:5px 8px 5px 0}
td{padding:4px 8px 4px 0;border-bottom:1px solid var(--line);color:var(--ink-2);
vertical-align:top;word-break:break-all}
.path{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}
.more{color:var(--ink-3);font-size:12px;margin-top:6px}
.fix{margin-top:9px;padding-top:9px;border-top:1px solid var(--line);color:var(--ink-2)}
.fix b{color:var(--ink);font-weight:600}
.clean{border:1px solid var(--line);padding:18px;text-align:center;color:var(--ink-2)}
dl{display:grid;grid-template-columns:auto 1fr;gap:3px 16px;margin:0;font-size:12.5px}
dt{color:var(--ink-3)}dd{margin:0;color:var(--ink-2);word-break:break-all}
.firm-logo{max-height:48px;max-width:220px;display:block;margin-bottom:10px}
footer{margin-top:28px;padding-top:12px;border-top:1px solid var(--line);
color:var(--ink-3);font-size:11.5px}
@media print{body{padding:0}.rule{break-inside:avoid}}
`.trim();

export function renderHtml(result: CheckResult, opts: ReportOptions): string {
  const groups = group(result.findings);
  const total = opts.componentsTotal;
  const resolved = opts.componentsResolved;
  const e = escapeHtml;

  const counts = ORDER.filter((s) => result.counts[s] > 0)
    .map((s) => `<span class="chip ${s}">${result.counts[s]} ${s}</span>`)
    .join('');

  // Three numbers. See SkipKind: a rule that does not apply to this format is
  // not the same fact as a rule that applies and found nothing to look at.
  const nApplicable = result.skippedRules.filter((s) => s.kind === 'not-applicable').length;
  const nNoPath = result.skippedRules.filter((s) => s.kind === 'no-path').length;

  // The counts above are post-override. A reader who takes in the header and
  // stops, which is most readers, would otherwise see "0 error" with no hint
  // that a person moved something out of that bucket, and the table saying so
  // sits below the findings. The header is where the number is believed, so it
  // is where the caveat belongs.
  const overrideNote =
    result.overrides.length > 0
      ? `<div class="note">${result.overrides.length} severity ${
          result.overrides.length === 1 ? 'override was' : 'overrides were'
        } applied, so these counts are not the ones the rule pack assigns on its own.
Every one is listed with its reason under "Severity overrides applied".</div>`
      : '';

  // Coverage first, always. With deterministic resolution answering under 9
  // percent of the time, a list of non-answers reads as a broken tool while
  // the same data stated as coverage reads as honest measurement.
  const coverage =
    total !== undefined && resolved !== undefined
      ? `<div class="cover"><div class="big">${resolved} of ${total} components identified</div>
<div class="note">${total - resolved} could not be identified from this file and were therefore
not checked against advisory sources. That is a gap in the file, not a clean result.</div>
<div class="counts">${result.evaluatedRules.length} rules evaluated &middot;
${nApplicable} not applicable &middot; ${nNoPath} skipped &middot; ${result.findings.length} findings ${counts}</div>${overrideNote}</div>`
      : `<div class="cover"><div class="big">${result.findings.length} findings</div>
<div class="counts">${result.evaluatedRules.length} rules evaluated &middot;
${nApplicable} not applicable &middot; ${nNoPath} skipped ${counts}</div>${overrideNote}</div>`;

  const body =
    groups.length === 0
      ? `<div class="clean"><b>No findings.</b><br>That is a real result, not a failure to load:
${result.evaluatedRules.length} rules ran against this file.</div>`
      : groups
          .map((g) => {
            const shown = g.instances.slice(0, LISTED);
            const rows = shown
              .map(
                (f) =>
                  `<tr><td class="path">${e(f.path)}</td><td>${e(f.component ?? '')}</td></tr>`,
              )
              .join('');
            const more =
              g.instances.length > LISTED
                ? `<div class="more">and ${g.instances.length - LISTED} further instances not listed</div>`
                : '';
            return `<div class="rule ${g.severity}">
<h3><span class="chip ${g.severity}">${g.severity}</span>${e(g.ruleId)} &mdash; ${e(g.title)}</h3>
<div class="meta">${g.instances.length} instance${g.instances.length === 1 ? '' : 's'} &middot; ${e(g.sourceRef)}</div>
<table><thead><tr><th scope=\"col\">Location</th><th scope=\"col\">Component</th></tr></thead><tbody>${rows}</tbody></table>${more}
<div class="fix"><b>Fix.</b> ${e(g.fix)}</div></div>`;
          })
          .join('\n');

  const i = opts.inputs ?? {};
  const provenance = `<dl>
<dt>File</dt><dd>${e(opts.fileName)}</dd>
<dt>SHA-256</dt><dd class="path">${e(result.fileSha256)}</dd>
<dt>Format</dt><dd>${e(result.sourceFormat)} ${e(result.sourceSpec)}</dd>
${result.normalisation ? `<dt>Converted</dt><dd>read as ${e(result.normalisation.from)} and converted before checking${result.normalisation.unmappedPackageKeys.length > 0 ? `; fields not used: ${e(result.normalisation.unmappedPackageKeys.join(', '))}` : ''}</dd>` : ''}
<dt>Engine</dt><dd>${e(i.engineVersion ?? result.engineVersion)}</dd>
<dt>Rule pack</dt><dd>${e(result.rulePackId)} ${e(result.rulePackVersion)}</dd>
${i.dictionaryVersion ? `<dt>Alias dictionary</dt><dd>${e(i.dictionaryVersion)}</dd>` : ''}
${i.eosVersion ? `<dt>End-of-support data</dt><dd>${e(i.eosVersion)}</dd>` : ''}
${i.advisorySnapshotId ? `<dt>Advisory snapshot</dt><dd>${e(i.advisorySnapshotId)}</dd>` : ''}
${
  result.overridesSource
    ? `<dt>Overrides file</dt><dd class="path">${e(result.overridesSource.path)}<br>${e(
        result.overridesSource.sha256,
      )}<br>${result.overridesSource.requested} requested, ${result.overrides.length} applied, ${
        result.inertOverrides.length
      } changed nothing</dd>`
    : ''
}
<dt>Generated</dt><dd>${e(opts.generatedAt)}</dd>
</dl>`;

  const overrides =
    result.overrides.length > 0
      ? `<h2>Severity overrides applied</h2><table><thead><tr><th scope=\"col\">Rule</th><th scope=\"col\">From</th><th scope=\"col\">To</th><th scope=\"col\">Reason</th></tr></thead><tbody>${result.overrides
          .map(
            (o) =>
              `<tr><td>${e(o.ruleId)}</td><td>${e(o.from)}</td><td>${e(o.to)}</td><td>${e(o.reason)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '';

  // An override that did nothing is shown too, and shown as separate from the
  // applied ones. A reviewer reading this report needs to be able to tell a
  // severity that was lowered from a request to lower one that never took
  // effect, and the tool is the only thing in the room that knows the
  // difference.
  const inert =
    result.inertOverrides.length > 0
      ? `<h2>Severity overrides that changed nothing</h2><table><thead><tr><th scope=\"col\">Rule</th><th scope=\"col\">Asked for</th><th scope=\"col\">Reason given</th><th scope=\"col\">Why it changed nothing</th></tr></thead><tbody>${result.inertOverrides
          .map(
            (o) =>
              `<tr><td>${e(o.ruleId)}</td><td>${e(o.to)}</td><td>${e(o.reason)}</td><td>${e(o.whyInert)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '';

  // The firm's mark, when it passes firmLogoSafe. A rejected value renders
  // nothing rather than a broken image: a firm that pasted something odd
  // should get a report without a logo, not a report that looks damaged.
  const safeLogo = firmLogoSafe(opts.firmLogo);
  const logo = safeLogo
    ? `<img class="firm-logo" src="${e(safeLogo)}" alt="${e(opts.firmName ?? 'Firm')}">\n`
    : '';

  // SPEC.md 2.4: "firm footer, no mention of us unless they want it."
  //
  // The two sentences that are NOT optional are the ones that limit what this
  // document claims: that it records what a rule pack found in a file
  // presenting that hash, and that nobody has reviewed the tool. A firm may
  // replace our name and add its own words. It may not quietly turn a
  // conformance check into an endorsement by deleting the limits.
  const limits = opts.whiteLabel
    ? 'This report records what the named rule pack found in a file presenting the SHA-256 above. ' +
      'The file was not retained and cannot be reproduced from this report. ' +
      'Checks against the published minimum elements. No regulator has reviewed this tool.'
    : 'This report records what the named rule pack found in a file presenting the SHA-256 above. ' +
      'StratifyPro did not retain the submitted file and cannot reproduce its contents. ' +
      'Checks against the published minimum elements. No regulator has reviewed this tool.';
  const footer = opts.firmFooter ? `${e(opts.firmFooter)}<br>${limits}` : limits;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SBOM check: ${e(opts.fileName)}</title>
<style>${STYLE}</style></head>
<body>
${logo}<h1>Software bill of materials check</h1>
<p class="sub">${e(opts.fileName)}${opts.firmName ? ` &middot; prepared by ${e(opts.firmName)}` : ''}</p>
${coverage}
<h2>Findings</h2>
${body}
${overrides}
${inert}
<h2>What was checked</h2>
${provenance}
<footer>${footer}</footer>
</body></html>`;
}
