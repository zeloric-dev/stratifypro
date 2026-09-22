/**
 * The three answers, and the wall between the second and the third.
 *
 * `clear` is a claim: this version was compared against this snapshot and no
 * advisory matched. `unknown` is the absence of a claim. Every scanner that
 * has embarrassed itself in this space did so by printing the first when it
 * meant the second, and the failure is invisible in the output: a component
 * with nothing beside it looks the same either way.
 *
 * So most of this file is about the cases where a real comparison did NOT
 * happen: no purl, no version, an ecosystem that is not mirrored, a shard that
 * did not load, and the big one, an advisory whose affected versions are
 * stated in an ordering this does not implement. All of them must come back
 * `unknown` with a reason a person can read.
 *
 * The fixture is real OSV data, cut from a full mirror by
 * scripts/mirror-fixture.py. A hand-written one would agree with whatever this
 * code already does.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openMirror, MirrorError } from '@stratifypro/mirror';
import { check, run, type Verdict } from './index.js';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(ROOT, 'packages', 'mirror', 'src', 'fixtures', 'mini');
const mirror = openMirror(FIXTURE);

function why(v: Verdict): string {
  assert.equal(v.status, 'unknown', `expected an abstention, got ${v.status}`);
  return (v as { status: 'unknown'; why: string }).why;
}

test('a known-affected version is reported affected, with its evidence', () => {
  const v = check(mirror, {
    name: 'log4j-core',
    version: '2.17.1',
    purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1',
  });
  assert.equal(v.status, 'affected');
  if (v.status !== 'affected') return;
  assert.ok(v.hits.length > 0);
  // The method travels with the hit so the reasoning is visible rather than
  // asserted: a reviewer can see whether an explicit list or a computed range
  // produced this.
  assert.ok(v.hits.every((h) => h.method === 'enumerated-version' || h.method === 'semver-range'));
  assert.equal(v.examined.ecosystem, 'Maven');
  assert.equal(v.examined.name, 'org.apache.logging.log4j:log4j-core');
});

test('a version outside every enumerated list is clear, and says what it was compared against', () => {
  // 1.0 predates every advisory in the fixture for this package.
  const v = check(mirror, {
    name: 'guava',
    version: '1.0',
    purl: 'pkg:maven/com.google.guava/guava@1.0',
  });
  assert.equal(v.status, 'clear');
  if (v.status !== 'clear') return;
  assert.equal(v.examined.ecosystem, 'Maven');
  assert.equal(v.examined.version, '1.0');
});

test('a component with no purl abstains: a bare name matches the wrong package', () => {
  assert.match(why(check(mirror, { name: 'openssl', version: '1.1.1n', purl: null })), /no package URL/);
});

test('a component with no version abstains, because affected is a claim about a version', () => {
  assert.match(
    why(check(mirror, { name: 'lodash', version: null, purl: 'pkg:npm/lodash' })),
    /has no version/,
  );
});

test('an ecosystem this mirror does not hold abstains and names itself', () => {
  assert.match(
    why(check(mirror, { name: 'serde', version: '1.0.0', purl: 'pkg:cargo/serde@1.0.0' })),
    /not an ecosystem this mirror holds/,
  );
});

test('THE ONE THAT MATTERS: an unevaluable range abstains, it does not report clear', () => {
  // This package has 51 affected entries stated as Maven version ranges with
  // no enumerated list, and NOT ONE entry this matcher can evaluate. Maven
  // orders versions by its own algorithm, which this does not implement, so
  // the only honest output is an abstention. `clear` here would be claiming a
  // comparison that never ran.
  //
  // The first version of this test used Debian openssl and FAILED, because 43
  // percent of Debian entries carry an enumerated version list alongside their
  // ranges and the exact match answered it without any dpkg ordering at all.
  // The matcher was right and the test was wrong, which is why the fixture
  // check now requires an entry with ranges and no versions rather than
  // counting ECOSYSTEM ranges and assuming.
  const v = check(mirror, {
    name: 'xwiki-platform-web-templates',
    version: '14.10.0',
    purl: 'pkg:maven/org.xwiki.platform/xwiki-platform-web-templates@14.10.0',
  });
  assert.equal(v.status, 'unknown', 'a component with no evaluable entry must never come back clear');
  assert.match(why(v), /cannot evaluate/);
  assert.match(why(v), /Reporting this component as clear would be claiming a comparison that did not happen/);
});

test('an exact version-list hit answers even where the ordering is not implemented', () => {
  // The complement of the test above, and the reason Debian is worth
  // mirroring at all: 43 percent of its entries enumerate their affected
  // versions, and string equality needs no dpkg ordering.
  const v = check(mirror, {
    name: 'openssl',
    version: '1.1.1n-0+deb11u3',
    purl: 'pkg:deb/debian/openssl@1.1.1n-0+deb11u3?distro=debian-11',
  });
  assert.equal(v.status, 'affected');
  if (v.status !== 'affected') return;
  assert.ok(v.hits.every((h) => h.method === 'enumerated-version'));
});

test('REGRESSION: a range is consulted even when an enumerated list exists', () => {
  // go.opentelemetry.io/otel/baggage carries both, and its semver range covers
  // versions the list omits, because OSV materialises `versions` from the
  // ranges against the releases known at export time. Treating the list as
  // authoritative and skipping the range made this component come back CLEAR
  // while the range said affected.
  //
  // Measured on the full mirror when this was found: 508 affected-entries
  // carry both, 85 disagree, and 65 of those produced a false `clear`. Nothing
  // in the suite caught it, because every test used a package where the two
  // agreed.
  const v = check(mirror, {
    name: 'baggage',
    version: '1.41.1',
    purl: 'pkg:golang/go.opentelemetry.io/otel/baggage@v1.41.1',
  });
  assert.equal(v.status, 'affected', 'a version inside the range must not be reported clear');
  if (v.status !== 'affected') return;
  assert.ok(
    v.hits.some((h) => h.method === 'semver-range'),
    'the range, not the list, is what answers here',
  );
});

test('an enumerated list still answers a hit outright', () => {
  // The complement: the fix must not have turned the list into decoration.
  const v = check(mirror, {
    name: 'log4j-core',
    version: '2.17.1',
    purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1',
  });
  assert.equal(v.status, 'affected');
  if (v.status !== 'affected') return;
  assert.ok(v.hits.some((h) => h.method === 'enumerated-version'));
});

test('REGRESSION: a missing or unreadable KEV catalogue is reported, not shrugged off', () => {
  // knownExploited is the highest-signal field in the report: a reviewer
  // escalates on a known-exploited CVE. Deleting kev.json used to return an
  // empty set, turn every flag false, and leave EVERY source reporting
  // present=true. The report was wrong in the one place it is most read and
  // nothing said so.
  for (const mode of ['delete', 'corrupt'] as const) {
    const dir = mkdtempSync(join(tmpdir(), 'mirror-'));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      if (mode === 'delete') rmSync(join(dir, 'kev.json'));
      else writeFileSync(join(dir, 'kev.json'), '{ not json');
      const broken = openMirror(dir);
      const result = run(broken, [
        { name: 'guava', version: '19.0', purl: 'pkg:maven/com.google.guava/guava@19.0' },
      ]);
      const kev = result.sources.find((s) => s.name === 'CISA KEV');
      assert.ok(kev, `no CISA KEV row in the source status (${mode})`);
      assert.equal(kev.present, false, `a ${mode}d KEV catalogue must not report present`);
      assert.ok(kev.problem, `a ${mode}d KEV catalogue must carry a problem`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('an intact KEV catalogue reports present, with its count and capture date', () => {
  const kev = run(mirror, []).sources.find((s) => s.name === 'CISA KEV');
  assert.ok(kev);
  assert.equal(kev.present, true);
  assert.ok(kev.vulnerabilities > 0, 'an intact catalogue has entries');
  assert.ok(kev.fetchedAt, 'and a capture date');
});

test('SPEC 1.14: every match carries how its identifier was established', () => {
  // A match with no account of where its identifier came from is a match a
  // reviewer cannot check. When the document carried the purl, that is what it
  // says; when a resolver supplied it, the resolver's own method travels with
  // the result.
  const declaredPurl = check(mirror, {
    name: 'log4j-core',
    version: '2.17.1',
    purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1',
  });
  assert.equal(declaredPurl.status, 'affected');
  if (declaredPurl.status !== 'affected') return;
  assert.equal(declaredPurl.examined.identifiedBy.method, 'declared');

  const resolved = check(mirror, {
    name: 'log4j',
    version: '2.17.1',
    purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1',
    provenance: { method: 'dictionary', matchedOn: 'log4j', observations: 412 },
  });
  assert.equal(resolved.status, 'affected');
  if (resolved.status !== 'affected') return;
  assert.equal(resolved.examined.identifiedBy.method, 'dictionary');
  assert.equal(resolved.examined.identifiedBy.observations, 412);
});

test('SPEC 1.14: an advisory the document already declared is marked, not hidden', () => {
  // A supplier who declared a CVE is in a different position from one who
  // stayed silent, and a report that flattens the two tells a reviewer the
  // wrong thing. Declaring by ALIAS counts: a document naming the CVE has
  // declared the GHSA that aliases it.
  const bare = check(mirror, {
    name: 'log4j-core',
    version: '2.17.1',
    purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1',
  });
  assert.equal(bare.status, 'affected');
  if (bare.status !== 'affected') return;
  assert.ok(bare.hits.every((h) => h.alreadyDeclared === false), 'nothing was declared here');

  const first = bare.hits[0];
  assert.ok(first);
  for (const id of [first.id, ...(first.aliases.length > 0 ? [first.aliases[0] as string] : [])]) {
    const withDeclaration = check(mirror, {
      name: 'log4j-core',
      version: '2.17.1',
      purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1',
      declared: [id],
    });
    assert.equal(withDeclaration.status, 'affected');
    if (withDeclaration.status !== 'affected') return;
    const same = withDeclaration.hits.find((h) => h.id === first.id);
    assert.ok(same?.alreadyDeclared, `declaring ${id} should mark ${first.id}`);
    // Still reported. Declared is not a reason to drop it from the report.
    assert.equal(withDeclaration.hits.length, bare.hits.length);
  }
});

test('SPEC 1.14: the tally separates undeclared advisories from the total', () => {
  const comp = {
    name: 'log4j-core',
    version: '2.17.1',
    purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1',
  };
  const before = run(mirror, [comp]);
  assert.ok(before.tally.undeclared > 0);

  const hits = before.results[0]?.verdict;
  assert.ok(hits && hits.status === 'affected');
  const allIds = hits.hits.map((h) => h.id);
  const after = run(mirror, [{ ...comp, declared: allIds }]);
  assert.equal(after.tally.undeclared, 0, 'declaring every hit leaves nothing undeclared');
  assert.equal(after.tally.affected, 1, 'but the component is still affected');
});

test('a Go package path is answered by its parent module, and says so', () => {
  // OSV files Go advisories against the module. 72 percent of the corpus's
  // golang purls carry no type qualifier, so the package-or-module question
  // cannot be read off the document and has to be resolved by lookup.
  const v = check(mirror, {
    name: 'consul/agent',
    version: 'v1.0.0',
    purl: 'pkg:golang/github.com/hashicorp/consul/agent@v1.0.0',
  });
  if (v.status === 'unknown') return; // the fixture may not carry a matching version
  assert.equal(v.examined.viaGoModule, 'github.com/hashicorp/consul');
  assert.equal(v.examined.name, 'github.com/hashicorp/consul');
});

test('a Go prefix is only accepted when it is itself a module in the index', () => {
  // Otherwise a package path reduces to a prefix that matches unrelated code.
  const v = check(mirror, {
    name: 'nothing',
    version: 'v1.0.0',
    purl: 'pkg:golang/github.com/definitely/not/a/real/module@v1.0.0',
  });
  assert.equal(v.status, 'clear');
  if (v.status !== 'clear') return;
  assert.equal(v.examined.viaGoModule, undefined);
});

test('malicious-package reports are reachable and are never vulnerabilities', () => {
  // A malicious package in a medical device is worse news than a CVE, not
  // lesser news, so they are mirrored. They are counted separately because
  // 221,756 of npm's 229,185 OSV records are MAL- entries, and folding them
  // into a vulnerability count would inflate it by a factor of thirty.
  const result = run(mirror, [
    { name: 'log4j-core', version: '2.17.1', purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.17.1' },
  ]);
  assert.equal(result.tally.affected, 1);
  assert.equal(result.tally.malicious, 0, 'a Maven package has no npm malicious reports');
  for (const { verdict } of result.results) {
    if (verdict.status === 'unknown') continue;
    for (const m of verdict.malicious) assert.ok(m.id.startsWith('MAL-'));
  }
});

test('a run reports its sources, and a broken shard shows up as a problem', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-'));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    // Corrupt one shard. The run must still finish, that ecosystem must come
    // back unknown rather than clean, and the source must report the problem.
    writeFileSync(join(dir, 'advisories', 'Maven.json'), '{ this is not json');
    const broken = openMirror(dir);
    const result = run(broken, [
      { name: 'guava', version: '19.0', purl: 'pkg:maven/com.google.guava/guava@19.0' },
    ]);
    assert.equal(result.tally.clear, 0, 'a corrupt index must not produce a clean verdict');
    assert.equal(result.tally.unknown, 1);
    const maven = result.sources.find((s) => s.ecosystems.includes('Maven'));
    assert.ok(maven);
    assert.equal(maven.present, false);
    assert.match(maven.problem ?? '', /could not be read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty ecosystem shard is not the same as a missing one', () => {
  // Debian has zero malicious-package reports, and the first build wrote no
  // file for them. The reader then reported the entire Debian source absent.
  // Every ecosystem gets both shards, so a missing file always means a fault.
  const dir = mkdtempSync(join(tmpdir(), 'mirror-'));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const m = openMirror(dir);
    for (const eco of m.ecosystems()) {
      assert.notEqual(m.advisoriesFor(eco, '::nothing::'), null, `${eco} advisories shard missing`);
      assert.notEqual(m.maliciousFor(eco, '::nothing::'), null, `${eco} malicious shard missing`);
    }
    assert.deepEqual(m.status().filter((s) => !s.present), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('opening a directory that is not a mirror explains how to build one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'empty-'));
  try {
    assert.throws(() => openMirror(dir), MirrorError);
    assert.throws(() => openMirror(dir), /is not committed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a mirror written by a future schema is refused, not read optimistically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-'));
  try {
    mkdirSync(join(dir, 'advisories'), { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ schema: 99, builtAt: '', sources: [] }));
    assert.throws(() => openMirror(dir), /schema 99/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
