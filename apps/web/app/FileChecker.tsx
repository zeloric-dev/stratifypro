'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckResult, Coverage } from '@stratifypro/engine';
import type { CheckRequest, CheckResponse, PackId } from './check.worker';
import { COPY, type Message } from './copy';
import { humanSize, SIZE_CAP } from './format';
import { Findings } from './Findings';

const PACKS: { id: PackId; label: string }[] = [
  { id: 'fda-524b', label: 'FDA section 524B' },
  { id: 'cisa-2026-v2.1', label: 'CISA 2026 minimum elements' },
  { id: 'g7-ai-2026', label: 'G7 AI SBOM minimum elements' },
];

/** Doc 3 flow B: after two seconds, stop showing a bare spinner. */
const SLOW_MS = 2000;
/** After ten, the honest answer is that the command line has no cap. */
const VERY_SLOW_MS = 10000;

interface Done {
  result: CheckResult;
  cover: Coverage;
  packId: PackId;
  filename: string;
}

/** Everything the worker can return that is not a result, in the approved words. */
function messageFor(r: CheckResponse): Message | null {
  switch (r.kind) {
    case 'not-json':
      // No offset means the parser reported no position, which is what a
      // truncated export produces. Printing byte 0 there was a measurement
      // nobody took.
      return r.offset === undefined
        ? COPY.notJsonNoPosition(r.snippet)
        : COPY.notJson(r.offset, r.snippet);
    case 'not-an-sbom':
      return COPY.notAnSbom();
    case 'unsupported-version':
      return COPY.unsupportedVersion(r.format, r.version);
    case 'no-components':
      return COPY.noComponents();
    case 'pack-failed':
      return COPY.packFailed(r.packId, r.packVersion, r.reason);
    case 'internal':
      return {
        heading: 'Something in the checker broke, so nothing was checked',
        body: `${r.detail} This is a defect on our side, not in your file. Nothing was sent anywhere.`,
      };
    default:
      return null;
  }
}

export function FileChecker() {
  const [packId, setPackId] = useState<PackId>('fda-524b');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [counted, setCounted] = useState<number | null>(null);
  const [error, setError] = useState<Message | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  /**
   * Which request the UI is willing to accept an answer for.
   *
   * A ref rather than state because the worker's handler reads it, and it must
   * see the value at the moment a message arrives rather than the one captured
   * when the handler was created.
   */
  const currentId = useRef(0);
  const pending = useRef(new Map<number, string>());

  // Installed ONCE, not per run. onmessage used to be reassigned inside
  // runFile, so dropping file B while file A was still checking delivered A's
  // result to B's handler: A's findings rendered as the answer to dropping B,
  // and B's own error then appeared underneath them.
  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const w = new Worker(new URL('./check.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<CheckResponse>) => {
      const r = e.data;
      // Anything but the newest request is a stale answer to a question the
      // user has already replaced.
      if (r.id !== currentId.current) return;
      if (r.kind === 'progress') {
        setCounted(r.components);
        return;
      }
      setBusy(false);
      if (r.kind === 'ok') {
        setError(null);
        setDone({
          result: r.result,
          cover: r.cover,
          packId: r.packId,
          filename: pending.current.get(r.id) ?? '',
        });
        return;
      }
      setDone(null);
      setError(messageFor(r));
    };
    w.onerror = () => {
      setBusy(false);
      setDone(null);
      setError({
        heading: 'The checker could not start',
        body: 'Nothing was checked and nothing was sent anywhere. Reloading the page usually fixes it.',
      });
    };
    workerRef.current = w;
    return w;
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(t);
  }, [busy]);

  /** Every early exit goes through here, so `busy` can never be stranded. */
  const stop = useCallback((m: Message | null) => {
    setBusy(false);
    setCounted(null);
    setDone(null);
    setError(m);
  }, []);

  const runFile = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // One file, and say so rather than checking the first and ignoring the
      // rest. On a submission-evidence tool, a result the reader cannot
      // attribute to a file is worse than no result.
      if (files.length > 1) {
        stop({
          heading: `That is ${files.length} files, and this checks one at a time`,
          body: 'Drop them one at a time, or use the command line tool, which takes a list. Nothing was sent anywhere.',
        });
        return;
      }
      const file = files[0]!;

      // A new request invalidates any answer still in flight for an older one.
      const id = currentId.current + 1;
      currentId.current = id;
      pending.current.set(id, file.name);

      setError(null);
      setDone(null);
      setCounted(null);

      if (file.size === 0) {
        stop(COPY.empty());
        return;
      }
      // Checked before reading. Reading a 400 MB file into a string to discover
      // it is too large is the failure the cap exists to prevent.
      if (file.size > SIZE_CAP) {
        stop(COPY.tooLarge(humanSize(file.size), file.name, packId));
        return;
      }

      setBusy(true);
      setElapsed(0);

      let text: string;
      try {
        text = await file.text();
      } catch {
        // A folder, or a file moved or rewritten between selection and read.
        // Unhandled, this left the spinner running forever on a file that was
        // never read, and the rejection escaped to window.onunhandledrejection.
        stop({
          heading: 'That could not be read',
          body: 'It may be a folder, or the file may have moved since you chose it. Nothing was sent anywhere.',
        });
        return;
      }

      // `.size` was a snapshot taken before the read. Checking what actually
      // arrived closes the gap for a file that grew in between.
      if (text.length > SIZE_CAP) {
        stop(COPY.tooLarge(humanSize(text.length), file.name, packId));
        return;
      }

      if (currentId.current !== id) return; // superseded while reading
      const req: CheckRequest = { id, text, packId };
      getWorker().postMessage(req);
    },
    [getWorker, packId, stop],
  );

  return (
    <>
      {/*
        Results above the drop zone, never below it. Doc 4 section 5.1 states
        the rule twice, and BRIEF 5.8 is where it comes from: a drop zone at the
        top of a page asks for work before giving any value, and it demonstrates
        the commodity rather than the product.
      */}
      {done ? (
        <Findings
          result={done.result}
          cover={done.cover}
          packId={done.packId}
          filename={done.filename}
        />
      ) : null}

      {error ? (
        <div className="card" role="alert">
          <h2>{error.heading}</h2>
          <p className="abstain-why">{error.body}</p>
        </div>
      ) : null}

      <h2>Or check a whole file</h2>

      <div
        className={`drop${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void runFile(e.dataTransfer.files);
        }}
      >
        <p>
          Drop a CycloneDX or SPDX file here, or{' '}
          <button type="button" className="linkish" onClick={() => inputRef.current?.click()}>
            choose one
          </button>
          .
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={(e) => {
            void runFile(e.target.files);
            // Cleared so choosing the same file twice fires again.
            e.target.value = '';
          }}
        />
        <p className="meta">
          <label htmlFor="pack">Rule pack</label>{' '}
          <select
            id="pack"
            value={packId}
            onChange={(e) => setPackId(e.target.value as PackId)}
            disabled={busy}
          >
            {PACKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </p>
        {/* Verbatim from docs/copy.md. The free tier rests on this being true. */}
        <p className="meta">{COPY.privacy}</p>
      </div>

      {busy ? (
        <p className="meta" role="status">
          Checking
          {elapsed > SLOW_MS && counted !== null
            ? ` ${counted.toLocaleString()} components (${(elapsed / 1000).toFixed(0)}s)`
            : elapsed > SLOW_MS
              ? ` (${(elapsed / 1000).toFixed(0)}s)`
              : ''}
          {elapsed > VERY_SLOW_MS ? (
            <>
              {' '}
              This one is large. The command line tool has no size cap:{' '}
              <code>
                npx stratifypro check {'<file>'} --pack {packId}
              </code>
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
