/**
 * `draft`, and the refusal that is the point of it.
 *
 * SPEC.md 2A.3 accepts on: "Output always labelled a draft. Never signed,
 * never bundled, never filed without human confirmation."
 *
 * The first three words are easy and the rest is the requirement. A console
 * warning does not travel with a file that gets emailed, renamed and handed to
 * another command a week later, so the marker lives in the document and
 * `bundle` reads it back. That refusal is what these tests are mostly about.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const HERE = import.meta.dirname;
const CLI = resolve(HERE, 'index.js');
const TS = '2026-09-23T10:00:00Z';

const SHEET = [
  'Component Name,Version,Supplier,License,Notes',
  'OpenSSL,1.1.1k,The OpenSSL Project,"Apache-2.0, OpenSSL",Statically linked',
  '"libcurl, bundled",7.68.0,Haxx,curl,Patched',
  ',,Nobody,,A row with no name',
].join('\n');

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function draftFile(): { dir: string; csv: string; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'draft-'));
  const csv = join(dir, 'supplier.csv');
  const out = join(dir, 'draft.cdx.json');
  writeFileSync(csv, `${SHEET}\n`);
  const r = run(['draft', csv, '--out', out, '--timestamp', TS]);
  assert.equal(r.status, 0, `draft failed: ${r.stderr}`);
  return { dir, csv, out };
}

test('a supplier sheet becomes a CycloneDX draft', () => {
  const { out } = draftFile();
  const doc = JSON.parse(readFileSync(out, 'utf8')) as {
    bomFormat: string;
    components: Array<{ name: string; version?: string; purl?: string }>;
  };
  assert.equal(doc.bomFormat, 'CycloneDX');
  assert.equal(doc.components.length, 2, 'the nameless row should not become a component');
  assert.equal(doc.components[0]?.name, 'OpenSSL');
  assert.equal(doc.components[1]?.name, 'libcurl, bundled', 'a quoted comma split the row');
});

test('THE ONE THAT MATTERS: a draft cannot be turned into evidence', () => {
  const { dir, out } = draftFile();
  const r = run(['bundle', out, '--out', join(dir, 'bundle'), '--timestamp', TS]);
  assert.notEqual(r.status, 0, 'a draft was accepted into an evidence bundle');
  assert.match(r.stderr, /is a draft, and a draft cannot be made into evidence/);
  assert.match(r.stderr, /SP-DRAFT-001/);
  // The reason, not just the refusal: a bundle around an unconfirmed
  // transcription would attest to somebody else's typing.
  assert.match(r.stderr, /attest to somebody else's typing/);
});

test('the refusal survives the file being renamed', () => {
  // A console warning does not travel with a file. The property does.
  const { dir, out } = draftFile();
  const renamed = join(dir, 'final-approved-sbom.json');
  writeFileSync(renamed, readFileSync(out, 'utf8'));
  const r = run(['bundle', renamed, '--out', join(dir, 'bundle'), '--timestamp', TS]);
  assert.notEqual(r.status, 0, 'renaming a draft let it become evidence');
  assert.match(r.stderr, /is a draft/);
});

test('removing the marker is a deliberate act, and then it bundles', () => {
  // The escape hatch is real and it is meant to be. A person checks the draft
  // against the source, removes the property, and takes responsibility. What
  // must not happen is that it slips through unnoticed.
  const { dir, out } = draftFile();
  const doc = JSON.parse(readFileSync(out, 'utf8')) as {
    metadata: { properties: Array<{ name: string }> };
  };
  doc.metadata.properties = doc.metadata.properties.filter(
    (p) => p.name !== 'stratifypro:draft',
  );
  const confirmed = join(dir, 'confirmed.cdx.json');
  writeFileSync(confirmed, JSON.stringify(doc, null, 2));

  const r = run(['bundle', confirmed, '--out', join(dir, 'bundle'), '--timestamp', TS]);
  assert.equal(r.status, 0, `a confirmed document should bundle: ${r.stderr}`);
  assert.match(r.stdout, /bundle digest: [0-9a-f]{64}/);
});

test('a draft can still be checked, because inspecting it is the point', () => {
  const { out } = draftFile();
  const r = run(['check', out, '--pack', 'cisa-2026-v2.1']);
  // Findings or none, it must not refuse: a person confirming a draft needs to
  // see what is wrong with it.
  assert.ok(r.status === 0 || r.status === 1, `check refused a draft: ${r.stderr}`);
});

test('what could not be read is reported on stderr, so piping does not lose it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'draft-'));
  const csv = join(dir, 'supplier.csv');
  writeFileSync(csv, `${SHEET}\n`);
  const r = run(['draft', csv, '--timestamp', TS]);
  // The document goes to stdout so it can be piped.
  assert.match(r.stdout, /"bomFormat": "CycloneDX"/);
  // The account of what was lost goes to stderr so the pipe does not eat it.
  assert.match(r.stderr, /column\(s\) not understood/);
  assert.match(r.stderr, /Notes/);
  assert.match(r.stderr, /row\(s\) produced no component/);
  assert.match(r.stderr, /THIS IS A DRAFT/);
});

test('a missing file is a usage error', () => {
  const r = run(['draft']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: draft/);
});

test('the command appears in help, once', () => {
  const r = run(['help']);
  assert.equal(r.stdout.split('\n').filter((l) => l.includes('draft <file.csv>')).length, 1);
});
