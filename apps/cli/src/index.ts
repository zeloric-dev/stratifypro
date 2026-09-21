#!/usr/bin/env node
/**
 * StratifyPro command line interface.
 *
 * The exit-code contract is an API. CI pipelines depend on it being stable.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  check,
  detectFormat,
  explainRule,
  isSupportedVersion,
  loadRulePack,
  OverrideError,
  type OverrideRequest,
  type OverridesSource,
  type RulePack,
  type Severity,
  SUPPORTED,
} from '@stratifypro/engine';
import { CliError, Errors, EXIT, type ExitCode } from './errors.js';
import { renderText, SEVERITY_RANK } from './render.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = resolve(HERE, '..', '..', '..', 'packages', 'rules', 'packs');
const DEFAULT_PACK = 'fda-524b';
const THRESHOLDS: Severity[] = ['error', 'warning', 'info'];

function availablePacks(): string[] {
  return readdirSync(PACKS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

function readPack(id: string): RulePack {
  const available = availablePacks();
  if (!available.includes(id)) throw Errors.packUnknown(id, available);
  try {
    return loadRulePack(JSON.parse(readFileSync(join(PACKS_DIR, `${id}.json`), 'utf8')));
  } catch (e) {
    throw Errors.packInvalid(id, e instanceof Error ? e.message : String(e));
  }
}

function readDoc(path: string): { doc: unknown; sha256: string } {
  let raw: Buffer;
  try {
    raw = readFileSync(path);
  } catch (e) {
    throw Errors.fileUnreadable(path, e instanceof Error ? e.message : String(e));
  }
  const sha256 = createHash('sha256').update(raw).digest('hex');
  try {
    return { doc: JSON.parse(raw.toString('utf8')), sha256 };
  } catch (e) {
    throw Errors.notJson(path, e instanceof Error ? e.message : String(e));
  }
}

/**
 * Read an overrides file.
 *
 * Shape-checked here, meaning-checked by the engine. This function only
 * establishes that the JSON is an array of objects with three string-ish
 * fields; whether the rule exists, whether the severity is real and whether
 * the reason is long enough are the engine's to refuse, so the same answers
 * come back whether the caller is this CLI, the web app or a library user.
 */
function readOverrides(path: string): { requests: OverrideRequest[]; source: OverridesSource } {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    throw Errors.overridesUnreadable(path, e instanceof Error ? e.message : String(e));
  }
  const sha256 = createHash('sha256').update(raw).digest('hex');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw Errors.overridesMalformed(path, e instanceof Error ? e.message : String(e));
  }

  const list = (parsed as { overrides?: unknown })?.overrides;
  if (!Array.isArray(list)) {
    throw Errors.overridesMalformed(path, 'No top-level "overrides" array was present.');
  }

  const requests = list.map((entry, i) => {
    const e = entry as Record<string, unknown>;
    if (typeof e?.['ruleId'] !== 'string' || typeof e['reason'] !== 'string' || typeof e['to'] !== 'string') {
      throw Errors.overridesMalformed(
        path,
        `Entry ${i} needs a string ruleId, a string "to" and a string reason.`,
      );
    }
    return { ruleId: e['ruleId'], to: e['to'] as Severity, reason: e['reason'] };
  });

  return { requests, source: { path, sha256, requested: requests.length } };
}

interface Args {
  command: string;
  positional: string[];
  flags: Map<string, string>;
}

/**
 * Flags that mean nothing without a value.
 *
 * Every flag used to collapse to the string "true" when nothing followed it, so
 * `--overrides` with the path missing became a request to read a file named
 * "true", and `check doc.json --overrides --format json` set overrides to
 * "true" and dropped --format entirely. The first produced a tidy error naming
 * a file the user never typed; the second silently ignored an argument they
 * did type.
 */
const VALUE_FLAGS = new Set(['pack', 'fail-on', 'format', 'overrides']);

function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const name = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(name, next);
        i += 1;
      } else if (VALUE_FLAGS.has(name)) {
        throw Errors.flagNeedsValue(name);
      } else flags.set(name, 'true');
    } else positional.push(a);
  }
  return { command, positional, flags };
}

function cmdCheck(args: Args): ExitCode {
  const file = args.positional[0];
  if (!file) {
    process.stderr.write(
      'usage: check <file> [--pack <id>] [--fail-on error|warning|info] [--format text|json] [--overrides <file>]\n',
    );
    return EXIT.PACK;
  }

  const packId = args.flags.get('pack') ?? DEFAULT_PACK;
  const threshold = (args.flags.get('fail-on') ?? 'error') as Severity;
  if (!THRESHOLDS.includes(threshold)) throw Errors.badThreshold(String(args.flags.get('fail-on')));

  const pack = readPack(packId);
  const { doc, sha256 } = readDoc(file);

  // Refused before any rule runs. Checking a version the engine does not read
  // would evaluate selectors written for a different specification and report
  // the result as if it meant something.
  try {
    const { format, spec } = detectFormat(doc as never);
    if (!isSupportedVersion(format, spec)) {
      throw Errors.unsupportedVersion(
        file,
        format === 'cyclonedx' ? 'CycloneDX' : 'SPDX',
        spec,
        SUPPORTED[format].label,
      );
    }
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw Errors.formatUnknown(file);
  }

  const overridesPath = args.flags.get('overrides');
  const loaded = overridesPath ? readOverrides(overridesPath) : undefined;
  const severityOverrides = loaded?.requests ?? [];

  // Say what was read, every time the flag is given, including zero.
  //
  // Without this, an overrides file that yielded nothing produced output
  // byte-identical to not passing the flag at all. An empty array, a stale path
  // in CI, a shell that word-split the argument, or a hand-merged file with a
  // duplicate top-level "overrides" key (JSON.parse keeps the last) all read
  // successfully and then vanished. That is this feature's own headline failure
  // happening one level above the feature.
  if (loaded) {
    process.stderr.write(
      `\n  Read ${loaded.source.requested} override(s) from ${loaded.source.path}\n`,
    );
  }

  let result;
  try {
    result = check(doc, pack, {
      fileSha256: sha256,
      engineVersion: '0.0.0',
      severityOverrides,
      ...(loaded === undefined ? {} : { overridesSource: loaded.source }),
    });
  } catch (e) {
    if (e instanceof OverrideError) throw Errors.overrideRejected(e.code, e.message);
    if (e instanceof Error && e.message.startsWith('format not detected')) throw Errors.formatUnknown(file);
    throw e;
  }

  // A pack with no rule at or above the active threshold can never fail a
  // build. A firm wiring that into CI gets a permanently green gate and
  // believes it is being watched. Say so, loudly, every run.
  //
  // Computed from the POST-override severities, not from pack.rules. Reading
  // the pack directly made this banner blind to the likeliest cause of the very
  // situation it warns about: override every rule at the threshold down below
  // it and the gate can never fail, while the pack still calls those rules
  // errors. Measured before the fix, on a document with two error findings,
  // --fail-on error exited 1; with both error rules overridden to warning it
  // exited 0 and this banner stayed silent.
  // result.overrides, not the requested list: an override the engine recorded
  // as inert changed no severity, and seeding from the request would let it
  // trigger a banner asserting it moved a rule below the threshold.
  const effective = new Map<string, Severity>(pack.rules.map((r) => [r.id, r.severity]));
  for (const o of result.overrides) effective.set(o.ruleId, o.to);
  const reachable = [...effective.values()].some((s) => SEVERITY_RANK[s] >= SEVERITY_RANK[threshold]);
  if (!reachable) {
    const packHasThem = pack.rules.some((r) => SEVERITY_RANK[r.severity] >= SEVERITY_RANK[threshold]);
    process.stderr.write(
      `\n  NOTE: no rule can produce a finding at severity ${threshold} or above.\n` +
        (packHasThem
          ? `  Pack ${packId} does contain such rules. Your --overrides file moved every one\n` +
            `  of them below the threshold.\n`
          : `  Pack ${packId} contains no such rule.\n`) +
        `  With --fail-on ${threshold} this command can never report a failure,\n` +
        `  however bad the file. Lower the threshold to make this check meaningful.\n`,
    );
  }

  // An override that moves a finding across the active threshold changes the
  // exit code, and in CI the exit code is the whole output: nobody reads stdout
  // on a green build. The applied-override line on stdout is not enough on its
  // own, so the fact that a human decision is the reason this run passed goes
  // to stderr, next to the other thing that can make a gate meaningless.
  const movedBelow = result.findings.filter((f) => {
    const o = result.overrides.find((x) => x.ruleId === f.ruleId);
    return o !== undefined && SEVERITY_RANK[o.from] >= SEVERITY_RANK[threshold];
  });
  const failingNow = result.findings.filter(
    (f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[threshold],
  );
  if (failingNow.length === 0 && movedBelow.length > 0) {
    process.stderr.write(
      `\n  NOTE: this run exits 0 because of a severity override.\n` +
        `  ${movedBelow.length} finding(s) sit at or above --fail-on ${threshold} in pack ${packId}\n` +
        `  and were moved below it. The reasons are in the report and in --format json.\n`,
    );
  }

  if ((args.flags.get('format') ?? 'text') === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(renderText(result, { packId }));
  }

  const failing = result.findings.filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[threshold]);
  return failing.length > 0 ? EXIT.FINDINGS : EXIT.CLEAN;
}

function cmdExplain(args: Args): ExitCode {
  const ruleId = args.positional[0];
  const packId = args.flags.get('pack') ?? DEFAULT_PACK;
  if (!ruleId) {
    process.stderr.write('usage: explain <ruleId> [--pack <id>]\n');
    return EXIT.PACK;
  }
  const pack = readPack(packId);
  const rule = pack.rules.find((r) => r.id === ruleId);
  if (!rule) throw Errors.ruleUnknown(ruleId, packId);

  // Rendered from explainRule, not from a field list written here. Doc 3 flow C
  // requires this and /rules/<id> to show the same content from the same
  // source, and two renderers each holding their own list is exactly how that
  // stops being true without anyone noticing.
  const view = explainRule(rule, pack);
  const width = Math.max(...view.fields.map((f) => f.label.length)) + 2;
  const pad = ''.padEnd(width);
  const out = [
    '',
    `  ${view.ruleId}  ${view.title}`,
    `  pack ${view.packId} ${view.packVersion}`,
    '',
  ];
  for (const f of view.fields) {
    out.push(`  ${(f.label + ':').padEnd(width)}${f.value}`);
    if (f.note) out.push(`  ${pad}${f.note}`);
    out.push('');
  }
  process.stdout.write(out.join('\n'));
  return EXIT.CLEAN;
}

function cmdPacks(): ExitCode {
  const lines = ['', '  Available rule packs:', ''];
  for (const id of availablePacks()) {
    const pack = readPack(id);
    const dist = new Map<Severity, number>();
    for (const r of pack.rules) dist.set(r.severity, (dist.get(r.severity) ?? 0) + 1);
    const summary = [...dist.entries()].map(([s, n]) => `${n} ${s}`).join(', ');
    lines.push(`    ${id}  ${pack.version}`);
    lines.push(`      ${pack.rules.length} rules: ${summary}`);
    if (!pack.rules.some((r) => r.severity === 'error')) {
      lines.push(`      no rule at severity error, so --fail-on error can never fail for this pack`);
    }
    lines.push('');
  }
  process.stdout.write(lines.join('\n'));
  return EXIT.CLEAN;
}

function cmdHelp(): ExitCode {
  process.stdout.write(
    [
      '',
      '  stratifypro <command>',
      '',
      '    check <file> [--pack <id>] [--fail-on error|warning|info] [--format text|json]',
      '                 [--overrides <file>]   change a severity, with a reason, on the record',
      '                 [--overrides <file>]   change a severity, with a reason, on the record',
      '    explain <ruleId> [--pack <id>]',
      '    packs',
      '',
      `    default pack: ${DEFAULT_PACK}`,
      '',
      '  Exit codes: 0 no findings at threshold, 1 findings, 2 could not parse,',
      '  3 could not load the pack, 70 internal error.',
      '',
    ].join('\n'),
  );
  return EXIT.CLEAN;
}

function main(): ExitCode {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case 'check':
      return cmdCheck(args);
    case 'explain':
      return cmdExplain(args);
    case 'packs':
      return cmdPacks();
    case 'help':
    case '--help':
    case '-h':
      return cmdHelp();
    default:
      process.stderr.write(`Unknown command "${args.command}". Run "help".\n`);
      return EXIT.PACK;
  }
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof CliError) {
    process.stderr.write('\n' + e.render());
    process.exitCode = e.exitCode;
  } else {
    // Never let a crash masquerade as findings.
    process.stderr.write(`\n  Internal error: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n\n`);
    process.exitCode = EXIT.INTERNAL;
  }
}
