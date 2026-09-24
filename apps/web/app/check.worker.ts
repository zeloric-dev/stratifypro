/// <reference lib="webworker" />
/**
 * The file check, off the main thread.
 *
 * This runs in a Web Worker for one reason that is a copy requirement rather
 * than a preference. docs/copy.md justifies the 25 MB cap with "past that the
 * page stops responding and you would be left guessing", which is a promise
 * that under 25 MB the page does NOT stop responding. On the main thread a
 * multi-megabyte JSONPath walk freezes the tab, the progress states doc 3 flow
 * B specifies (>2s show a count, >10s offer the CLI) could never paint, and
 * that sentence would be false.
 *
 * It is also why nothing here touches the network. The whole file stays in this
 * worker's memory and is discarded when the check returns. "Your file is
 * checked in this browser. It is never uploaded." is a verbatim string from
 * docs/copy.md and it is the free tier's entire proposition, so this module has
 * no fetch, no XMLHttpRequest and no sendBeacon, and a test asserts that.
 */
import {
  check,
  coverage,
  detectFormat,
  isSupportedVersion,
  loadRulePack,
} from '@stratifypro/engine';
import type { CheckResult, Coverage } from '@stratifypro/engine';
import cisaPack from '@stratifypro/rules/packs/cisa-2026-v2.1.json';
import fdaPack from '@stratifypro/rules/packs/fda-524b.json';
import g7Pack from '@stratifypro/rules/packs/g7-ai-2026.json';

export type PackId = 'fda-524b' | 'cisa-2026-v2.1' | 'g7-ai-2026';

const PACKS: Record<PackId, unknown> = {
  'fda-524b': fdaPack,
  'cisa-2026-v2.1': cisaPack,
  'g7-ai-2026': g7Pack,
};

export interface CheckRequest {
  /**
   * Which request this is. Responses carry it back so a result can be matched
   * to the drop that asked for it.
   *
   * Without it the worker was a single mutable onmessage slot reassigned per
   * run: drop a large valid file, then a small malformed one while the first is
   * still going, and the first file's findings arrive at the second file's
   * handler and render as the answer to the second drop.
   */
  id: number;
  text: string;
  packId: PackId;
}

/**
 * Every way this can end, named. The UI renders one branch per kind.
 *
 * Split from CheckResponse so the worker's own helpers can return an outcome
 * without inventing an id, and so the id is attached in exactly one place.
 */
export type CheckOutcome =
  | { kind: 'progress'; components: number }
  | { kind: 'ok'; result: CheckResult; cover: Coverage; packId: PackId }
  /**
   * offset is absent when the parser gave no position, which is the common
   * case for exactly the failure docs/copy.md names as most likely. A truncated
   * export yields "Unexpected end of JSON input", which carries no position at
   * all, and reporting that as byte 0 sent the reader to the start of the file
   * with a number that was never measured.
   */
  | { kind: 'not-json'; offset?: number; snippet: string }
  | { kind: 'not-an-sbom' }
  | { kind: 'unsupported-version'; format: string; version: string }
  | { kind: 'no-components' }
  | { kind: 'pack-failed'; packId: string; packVersion: string; reason: string }
  | { kind: 'internal'; detail: string };

/** An outcome, tagged with the request that produced it. */
export type CheckResponse = CheckOutcome & { id: number };

/**
 * Where the JSON parser gave up, as a byte offset.
 *
 * docs/copy.md promises "the problem is at byte {offset}, near {snippet}", and
 * a user looking at a 40,000 line export needs somewhere to start.
 *
 * undefined, not 0, when there is no position to report. V8 only includes one
 * for some failures: `JSON.parse('[1,2,')` gives "Unexpected end of JSON input"
 * with no position at all, and that is precisely the truncated export the copy
 * names as the most likely cause. Returning 0 there printed "The problem is at
 * byte 0" and sent the reader to the start of a file whose problem is at the
 * end. Byte 0 is a number, and it was never measured.
 */
function parsePosition(message: string): number | undefined {
  const m = /position (\d+)/.exec(message);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

function snippetAt(text: string, offset: number): string {
  const start = Math.max(0, offset - 20);
  const raw = text.slice(start, offset + 20).replace(/\s+/g, ' ');
  return raw.length > 0 ? `"${raw}"` : '"the end of the file"';
}

function run(req: CheckRequest, post: (r: CheckOutcome) => void): CheckOutcome {
  let doc: unknown;
  try {
    doc = JSON.parse(req.text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const offset = parsePosition(message);
    return {
      kind: 'not-json',
      ...(offset === undefined ? {} : { offset }),
      snippet: snippetAt(req.text, offset ?? req.text.length),
    };
  }

  let format: string;
  let spec: string;
  try {
    const d = detectFormat(doc as never);
    format = d.format;
    spec = d.spec;
  } catch {
    return { kind: 'not-an-sbom' };
  }

  if (!isSupportedVersion(format as 'cyclonedx' | 'spdx', spec)) {
    return {
      kind: 'unsupported-version',
      format: format === 'cyclonedx' ? 'CycloneDX' : 'SPDX',
      version: spec,
    };
  }

  const cover = coverage(doc);
  if (cover.total === 0) return { kind: 'no-components' };

  // Doc 3 flow B: after two seconds, show a count. This is the count. The type
  // used to declare `stage` and an optional `components` and send neither, so
  // the ">2s" state showed elapsed seconds and nothing about the document.
  post({ kind: 'progress', components: cover.total });

  const raw = PACKS[req.packId];
  let pack;
  try {
    pack = loadRulePack(raw as never);
  } catch (e) {
    const r = raw as { id?: string; version?: string };
    return {
      kind: 'pack-failed',
      packId: r?.id ?? req.packId,
      packVersion: r?.version ?? 'unknown',
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  // No fileSha256. Hashing would mean holding the bytes to hash them, and the
  // free tier has nothing to pin a hash to: the report that needs one is the
  // workspace artifact, where the user has chosen to store something.
  const result = check(doc as never, pack, { engineVersion: '0.0.0' });
  return { kind: 'ok', result, cover, packId: req.packId };
}

self.onmessage = (e: MessageEvent<CheckRequest>) => {
  const id = e.data.id;
  const post = (r: CheckOutcome): void => {
    (self as unknown as Worker).postMessage({ ...r, id });
  };
  try {
    post(run(e.data, post));
  } catch (err) {
    // Never let a crash look like a clean file, the same rule the CLI's exit
    // code 70 exists for.
    post({ kind: 'internal', detail: err instanceof Error ? err.message : String(err) });
  }
};
