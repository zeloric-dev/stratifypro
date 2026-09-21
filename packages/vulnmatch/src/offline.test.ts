/**
 * The acceptance test for the advisory mirror: a full corpus run makes zero
 * outbound calls.
 *
 * Doc 6 step 2.1 states it in those words, and it is the claim the whole
 * two-package split exists to support. A customer's bill of materials before
 * filing is confidential. "We never send your components anywhere" is either
 * structural or it is marketing, and the only way to make it structural is for
 * the code that answers questions to have no way to make a call at all.
 *
 * TWO CHECKS, BECAUSE EITHER ALONE IS WEAK.
 *
 *   verify.sh greps this package and @stratifypro/mirror for network
 *   primitives. Static, cheap, and blind to anything computed.
 *
 *   This file replaces every entry point with something that throws, then runs
 *   all 5,088 corpus components through the matcher and requires it to finish.
 *   Dynamic, and blind to a path this particular corpus does not reach.
 *
 * The poisoning happens before the modules under test are loaded, which is why
 * they are imported dynamically. A static import is hoisted above everything
 * here and would let a module capture the real fetch on the way in, which is
 * precisely the aliasing trick the static check already learned to look for.
 */
import assert from 'node:assert/strict';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(ROOT, 'packages', 'mirror', 'src', 'fixtures', 'mini');
const CORPUS = join(ROOT, 'fixtures', 'corpus');

interface Node {
  name?: string;
  version?: string;
  purl?: string;
  components?: Node[];
}

function corpusComponents(): Array<{ name: string; version: string | null; purl: string | null }> {
  const out: Array<{ name: string; version: string | null; purl: string | null }> = [];
  for (const fn of readdirSync(CORPUS).sort()) {
    if (!fn.endsWith('.json') || fn === 'provenance.json') continue;
    const doc = JSON.parse(readFileSync(join(CORPUS, fn), 'utf8')) as {
      components?: Node[];
      packages?: Array<{
        name?: string;
        versionInfo?: string;
        externalRefs?: Array<{ referenceType?: string; referenceLocator?: string }>;
      }>;
    };
    const stack: Node[] = [...(doc.components ?? [])];
    while (stack.length > 0) {
      const c = stack.shift();
      if (!c || typeof c !== 'object') continue;
      stack.push(...(c.components ?? []));
      out.push({ name: c.name ?? '', version: c.version ?? null, purl: c.purl ?? null });
    }
    for (const p of doc.packages ?? []) {
      const purl =
        (p.externalRefs ?? []).find((r) => r.referenceType === 'purl')?.referenceLocator ?? null;
      out.push({ name: p.name ?? '', version: p.versionInfo ?? null, purl });
    }
  }
  return out;
}

test('a full corpus run makes zero outbound calls', async () => {
  const attempts: string[] = [];
  const boom =
    (what: string) =>
    (): never => {
      attempts.push(what);
      throw new Error(`network call attempted: ${what}`);
    };

  // Everything a module could reach for, including the low-level paths a
  // hand-rolled client would use to get under a fetch stub.
  const g = globalThis as Record<string, unknown>;
  const saved = {
    fetch: g['fetch'],
    XMLHttpRequest: g['XMLHttpRequest'],
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    netConnect: net.connect,
    netCreate: net.createConnection,
    dnsLookup: dns.lookup,
  };
  g['fetch'] = boom('fetch');
  g['XMLHttpRequest'] = boom('XMLHttpRequest');
  (http as unknown as Record<string, unknown>)['request'] = boom('http.request');
  (http as unknown as Record<string, unknown>)['get'] = boom('http.get');
  (https as unknown as Record<string, unknown>)['request'] = boom('https.request');
  (https as unknown as Record<string, unknown>)['get'] = boom('https.get');
  (net as unknown as Record<string, unknown>)['connect'] = boom('net.connect');
  (net as unknown as Record<string, unknown>)['createConnection'] = boom('net.createConnection');
  (dns as unknown as Record<string, unknown>)['lookup'] = boom('dns.lookup');

  try {
    const { openMirror } = await import('@stratifypro/mirror');
    const { run } = await import('./index.js');

    const components = corpusComponents();
    // The corpus is 5,088 component instances across 21 real documents. A run
    // over a handful would not exercise the paths that reach for a network.
    assert.ok(components.length > 5000, `expected the whole corpus, got ${components.length}`);

    const result = run(openMirror(FIXTURE), components);

    assert.deepEqual(attempts, [], 'the matcher attempted a network call');
    assert.equal(result.results.length, components.length);
    // Every component got one of the three answers and none was skipped.
    assert.equal(
      result.tally.affected + result.tally.clear + result.tally.unknown,
      components.length,
    );
    // And the sources travel with the result, so a reader can see what the
    // answers were measured against.
    assert.ok(result.sources.length > 0);
    for (const s of result.sources) assert.ok(s.fetchedAt, `${s.name} has no capture date`);
  } finally {
    g['fetch'] = saved.fetch;
    g['XMLHttpRequest'] = saved.XMLHttpRequest;
    (http as unknown as Record<string, unknown>)['request'] = saved.httpRequest;
    (http as unknown as Record<string, unknown>)['get'] = saved.httpGet;
    (https as unknown as Record<string, unknown>)['request'] = saved.httpsRequest;
    (https as unknown as Record<string, unknown>)['get'] = saved.httpsGet;
    (net as unknown as Record<string, unknown>)['connect'] = saved.netConnect;
    (net as unknown as Record<string, unknown>)['createConnection'] = saved.netCreate;
    (dns as unknown as Record<string, unknown>)['lookup'] = saved.dnsLookup;
  }
});

test('the poisoning this test relies on actually bites', () => {
  // A test that disables the network and then proves nothing called it is
  // worthless if the disabling silently failed. This repository has shipped
  // seven checks that reported clean while the property was false, so the
  // instrument gets checked too.
  const g = globalThis as Record<string, unknown>;
  const saved = g['fetch'];
  g['fetch'] = (): never => {
    throw new Error('network call attempted: fetch');
  };
  try {
    assert.throws(() => (g['fetch'] as () => unknown)(), /network call attempted/);
  } finally {
    g['fetch'] = saved;
  }
});
