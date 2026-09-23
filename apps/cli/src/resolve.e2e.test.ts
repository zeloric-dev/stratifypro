/**
 * `resolve`, exercised the way a person reaches it.
 *
 * docs/plan-status.md carried this gap for most of the project's life: the
 * resolver was used by the library and the web app, and a person at a terminal
 * could not reach it. Third time this session that a capability existed
 * everywhere except where somebody could invoke it, so the test spawns the
 * real binary rather than importing the module.
 *
 * The case that matters most here is the abstention, and specifically its exit
 * code. "I do not know" is this product's most distinctive output. If it
 * exited nonzero, every script wrapping this command would treat an honest
 * answer as a crash, and the next person would add `|| true` and lose the
 * failures that are real.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const HERE = import.meta.dirname;
const CLI = resolve(HERE, 'index.js');

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

test('a name in the dictionary resolves, and says how', () => {
  const r = run(['resolve', 'openssl 1.1.1k.tar.gz']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /pkg:/, 'no identifier in the output');
  assert.match(r.stdout, /method:\s+\w+/);
  assert.match(r.stdout, /matched on:/);
});

test('THE ONE THAT MATTERS: an abstention exits 0 and explains itself', () => {
  const r = run(['resolve', 'mbedtls (custom build)']);
  assert.equal(r.status, 0, 'an honest "I do not know" must not look like a crash');
  assert.match(r.stdout, /Not identified/);
  assert.match(r.stdout, /not in the dictionary/);
  // Said every time, so an abstention is never mistaken for a defect.
  assert.match(r.stdout, /This is an answer, not an error/);
});

test('the reason is specific to the input, not one sentence for everything', () => {
  // A digest told "this name is not in the dictionary" would be true and
  // useless: the problem is that it is not a name.
  const digest = run(['resolve', 'a'.repeat(40)]);
  assert.match(digest.stdout, /hash or a layer digest/);

  const tiny = run(['resolve', 'x']);
  assert.match(tiny.stdout, /too short/);

  const numeric = run(['resolve', '12345']);
  assert.match(numeric.stdout, /does not look like a component name/);
});

test('json output carries the resolution or the reason, never both, never neither', () => {
  for (const name of ['openssl 1.1.1k.tar.gz', 'mbedtls (custom build)']) {
    const r = run(['resolve', name, '--format', 'json']);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout) as {
      input: string;
      resolution: { purlBase: string; method: string } | null;
      reason?: string;
      methodMeans?: string;
    };
    assert.equal(parsed.input, name);
    if (parsed.resolution) {
      assert.ok(parsed.resolution.purlBase);
      assert.equal(parsed.reason, undefined, 'a resolved name must not also carry a reason');
      assert.ok(parsed.methodMeans, 'a resolution must say what its method means');
    } else {
      assert.ok(parsed.reason, 'an abstention must carry its reason');
    }
  }
});

test('--min-observations is refused rather than coerced', () => {
  // NaN would behave like zero and loosen precision without saying so, which
  // is the quiet direction of failure this project refuses everywhere else.
  for (const bad of ['two', '-1', '1.5', '']) {
    const r = run(['resolve', 'openssl', '--min-observations', bad]);
    assert.notEqual(r.status, 0, `--min-observations ${JSON.stringify(bad)} was accepted`);
  }
  const ok = run(['resolve', 'openssl 1.1.1k.tar.gz', '--min-observations', '0']);
  assert.equal(ok.status, 0);
});

test('raising --min-observations can only remove answers, never add them', () => {
  // The knob trades recall for precision. If a higher threshold ever produced
  // MORE resolutions, it would mean the threshold is not what it claims.
  const low = run(['resolve', 'openssl 1.1.1k.tar.gz', '--min-observations', '0', '--format', 'json']);
  const high = run(['resolve', 'openssl 1.1.1k.tar.gz', '--min-observations', '9999', '--format', 'json']);
  const a = JSON.parse(low.stdout) as { resolution: unknown };
  const b = JSON.parse(high.stdout) as { resolution: unknown; reason?: string };
  assert.ok(a.resolution, 'the low threshold should resolve this name');
  assert.equal(b.resolution, null, 'an impossible threshold should abstain');
  assert.ok(b.reason, 'and still explain itself');
});

test('a missing name is a usage error, unlike an unresolvable one', () => {
  // Two different failures. "I could not answer" is exit 0; "you did not ask"
  // is not.
  const r = run(['resolve']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: resolve/);
});

test('a dictionary that is not a dictionary is refused by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dict-'));
  const bad = join(dir, 'not-a-dictionary.json');
  writeFileSync(bad, JSON.stringify({ nope: true }));
  const r = run(['resolve', 'openssl', '--dictionary', bad]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /entries/);
});

test('the command appears in help, once', () => {
  const r = run(['help']);
  const mentions = r.stdout.split('\n').filter((l) => l.includes('resolve <name>'));
  assert.equal(mentions.length, 1);
});
