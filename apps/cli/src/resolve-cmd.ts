/**
 * `resolve <name>` — what is this component, or why can we not say.
 *
 * `docs/plan-status.md` has carried this line for most of the project's life:
 * "resolve is not yet a CLI subcommand, though the CLI has check, explain and
 * packs. The library and the web app both use it; the command is missing."
 *
 * It is the same shape as the two gaps this session already closed. The
 * resolver is the piece the benchmark is built on, the piece `/name/<slug>`
 * publishes 441 pages of, and the piece a person at a terminal could not
 * reach. A capability nobody can invoke is a claim.
 *
 * ABSTENTION IS A SUCCESSFUL RUN. Exit 0 when the name resolves and exit 0
 * when it honestly cannot, because "I do not know" is this product's most
 * distinctive output and a nonzero exit would make every script treat it as a
 * failure. Exit is reserved for a question that could not be asked: no name
 * given, or a dictionary that would not load.
 */
import { readFileSync } from 'node:fs';
import {
  METHOD_EXPLAINS,
  resolve as resolveName,
  whyNot,
  type AliasDictionary,
  type Resolution,
} from '@stratifypro/resolve';

export interface ResolveOutput {
  input: string;
  resolution: Resolution | null;
  /** Present exactly when `resolution` is null. */
  reason?: string;
  /** What the method means, so the answer can be judged rather than trusted. */
  methodMeans?: string;
}

export function loadDictionary(path: string): AliasDictionary {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { entries?: AliasDictionary };
  const entries = raw.entries;
  if (!entries || typeof entries !== 'object') {
    throw new Error(`${path} has no "entries" object; this is not an alias dictionary`);
  }
  return entries;
}

export function resolveOne(
  input: string,
  dict: AliasDictionary,
  minObservations?: number,
): ResolveOutput {
  const resolution = resolveName(
    input,
    dict,
    minObservations === undefined ? {} : { minObservations },
  );
  if (!resolution) return { input, resolution: null, reason: whyNot(input) };
  return {
    input,
    resolution,
    ...(METHOD_EXPLAINS[resolution.method] ? { methodMeans: METHOD_EXPLAINS[resolution.method] } : {}),
  };
}

/** The human rendering. One answer, its method, and what that method means. */
export function renderResolve(out: ResolveOutput): string {
  const lines = ['', `  ${out.input}`, ''];
  if (!out.resolution) {
    lines.push('  Not identified.');
    lines.push(`  ${out.reason ?? ''}`);
    lines.push('');
    // Said every time, not only when it looks bad. An abstention that reads as
    // an error teaches people to ignore it.
    lines.push('  This is an answer, not an error. A wrong identifier produces a');
    lines.push('  confident wrong vulnerability verdict, which is worse than none.');
    lines.push('');
    return lines.join('\n');
  }
  const r = out.resolution;
  lines.push(`  ${r.purlBase}`);
  lines.push('');
  lines.push(`  method:      ${r.method}`);
  lines.push(`  matched on:  ${r.matchedOn}`);
  if (r.observations > 0) {
    lines.push(`  observed:    ${r.observations} time(s) in the corpus`);
  }
  if (out.methodMeans) {
    lines.push('');
    lines.push(`  ${out.methodMeans}`);
  }
  lines.push('');
  return lines.join('\n');
}
