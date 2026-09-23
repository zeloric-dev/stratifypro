/**
 * Firm A's token returns zero of firm B's rows. SPEC.md 2.2's acceptance test.
 *
 * Run against PGlite, which is real Postgres, as the `authenticated` role,
 * which is not the table owner. Both of those matter:
 *
 *   Real Postgres, because row-level security is a Postgres feature. A mock
 *   would be testing the mock.
 *
 *   Non-owner, because `enable row level security` EXEMPTS the table owner. A
 *   suite connecting as the owner passes every isolation test without a single
 *   policy being consulted. That is the most comfortable kind of false green,
 *   and this repository has already shipped several.
 *
 * SPEC.md also lists a separate row: "No client-supplied firm_id trusted".
 * That one is tested by behaviour here rather than by grepping the policy
 * text, because a policy can reference the right column and still be wrong.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { bootstrapStatements, claimsForOrg, connectionNotes } from './index.js';

let db: PGlite;
let firmA: string;
let firmB: string;

/** Run a statement as a signed-in user of one organization. */
async function asOrg<T>(clerkOrgId: string | null, sql: string, params: unknown[] = []) {
  await db.exec('begin');
  try {
    await db.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      clerkOrgId === null ? '' : claimsForOrg(clerkOrgId),
    ]);
    await db.exec('set local role authenticated');
    const r = await db.query<T>(sql, params);
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}

before(async () => {
  db = new PGlite();
  for (const s of bootstrapStatements()) await db.exec(s.sql);

  // Seeded as the owner, which is how a service role would provision firms.
  const a = await db.query<{ id: string }>(
    "insert into firms (clerk_org_id, name) values ('org_a','Northgate Regulatory') returning id",
  );
  const b = await db.query<{ id: string }>(
    "insert into firms (clerk_org_id, name) values ('org_b','Calder Medical Advisors') returning id",
  );
  firmA = a.rows[0]!.id;
  firmB = b.rows[0]!.id;

  for (const [firm, name] of [[firmA, 'A project'], [firmB, 'B project']] as const) {
    await db.query('insert into projects (firm_id, name) values ($1,$2)', [firm, name]);
    const chk = await db.query<{ id: string }>(
      `insert into checks (firm_id, clerk_user_id, engine_version, rule_pack_id, rule_pack_ver,
         source_format, source_spec, file_name, file_sha256,
         finding_count, error_count, warn_count, info_count, findings)
       values ($1,'user_x','1.0.0','fda-524b','1.0.0','cyclonedx','1.5',$2,'deadbeef',1,0,1,0,'[]'::jsonb)
       returning id`,
      [firm, `${name}.cdx.json`],
    );
    // evidence_bundles carries the sealed record a firm may have filed with a
    // regulator. It gets the same proof as the rest, not an assumption that it
    // inherits one.
    await db.query(
      `insert into evidence_bundles (firm_id, check_id, storage_path, bundle_sha256, seal, sealed_at, attests)
       values ($1,$2,$3,'cafe','seal-placeholder', now(), 'scope of attestation')`,
      [firm, chk.rows[0]!.id, `bundles/${firm}.zip`],
    );
  }

  for (const note of connectionNotes()) console.log(`  ${note}`);
});

after(async () => {
  await db?.close();
});

test('THE ACCEPTANCE: firm A sees zero of firm B rows', async () => {
  for (const table of ['projects', 'checks', 'evidence_bundles']) {
    const r = await asOrg<{ firm_id: string }>(
      'org_a',
      `select firm_id from ${table}`,
    );
    assert.ok(r.rows.length > 0, `firm A should see its own ${table}`);
    for (const row of r.rows) {
      assert.equal(row.firm_id, firmA, `firm A saw a ${table} row belonging to another firm`);
    }
    // And the count is exactly its own, not "its own plus something filtered late".
    assert.equal(r.rows.length, 1);
  }
});

test('firm B sees its own rows, so the policy filters rather than blanks', async () => {
  // A policy that returned nothing to everybody would pass the test above.
  const r = await asOrg<{ firm_id: string }>('org_b', 'select firm_id from checks');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]?.firm_id, firmB);
});

test('a token for no organization sees nothing', async () => {
  const r = await asOrg('org_does_not_exist', 'select id from checks');
  assert.equal(r.rows.length, 0);
});

test('an unauthenticated session sees nothing and does not error', async () => {
  // current_setting(..., true) returns null rather than raising, so an
  // anonymous request gets an empty result instead of a 500.
  const r = await asOrg(null, 'select id from checks');
  assert.equal(r.rows.length, 0);
});

test('NO CLIENT-SUPPLIED firm_id IS TRUSTED', async () => {
  // The attack: firm A asks for firm B's rows by naming them. A policy that
  // compared the row's firm_id to a value from the request would authorise the
  // attacker with the attacker's own input.
  const r = await asOrg<{ id: string }>('org_a', 'select id from checks where firm_id = $1', [
    firmB,
  ]);
  assert.equal(r.rows.length, 0, 'naming another firm returned its rows');
});

test('firm A cannot WRITE a row into firm B, which is worse than reading one', async () => {
  // USING alone filters reads. Without WITH CHECK an insert stamped with
  // another firm_id succeeds, becomes invisible to its author, and appears in
  // the victim's workspace. That is data planted in somebody else's account.
  await assert.rejects(
    () =>
      asOrg(
        'org_a',
        `insert into checks (firm_id, clerk_user_id, engine_version, rule_pack_id, rule_pack_ver,
           source_format, source_spec, file_name, file_sha256,
           finding_count, error_count, warn_count, info_count, findings)
         values ($1,'attacker','1.0.0','fda-524b','1.0.0','cyclonedx','1.5','planted.json','x',0,0,0,0,'[]'::jsonb)`,
        [firmB],
      ),
    /row-level security/i,
  );
});

test('firm A cannot move its own row into firm B by updating it', async () => {
  await assert.rejects(
    () => asOrg('org_a', 'update checks set firm_id = $1 where firm_id = $2', [firmB, firmA]),
    /row-level security/i,
  );
});

test('firm A cannot delete firm B rows', async () => {
  await asOrg('org_a', 'delete from checks where firm_id = $1', [firmB]);
  // Coerced, because PGlite maps int8 to a number and node-postgres maps it to
  // a string. The row surviving is the claim; the driver's integer mapping is
  // not.
  const survived = await db.query<{ n: string | number }>(
    'select count(*) as n from checks where firm_id = $1',
    [firmB],
  );
  assert.equal(Number(survived.rows[0]?.n), 1, "firm B's row was deleted by another firm");
});

test('firm A cannot read firm B through the firms table itself', async () => {
  const r = await asOrg<{ clerk_org_id: string }>('org_a', 'select clerk_org_id from firms');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]?.clerk_org_id, 'org_a');
});

test('row-level security is FORCED, so the owner is not exempt', async () => {
  // Without `force`, everything above still passes while the policies are
  // never consulted for the owner. This asserts the flag itself.
  const r = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `select relname, relrowsecurity, relforcerowsecurity from pg_class
     where relname in ('firms','projects','checks','evidence_bundles') order by relname`,
  );
  assert.equal(r.rows.length, 4);
  for (const t of r.rows) {
    assert.ok(t.relrowsecurity, `${t.relname} does not have row-level security enabled`);
    assert.ok(t.relforcerowsecurity, `${t.relname} does not FORCE row-level security`);
  }
});

test('every policy has a WITH CHECK, not only a USING', async () => {
  // The structural version of the write tests above, so a policy added later
  // cannot quietly omit it.
  const r = await db.query<{ tablename: string; policyname: string; with_check: string | null }>(
    `select tablename, policyname, with_check from pg_policies
     where schemaname = 'public' and tablename <> 'public_metrics'`,
  );
  assert.ok(r.rows.length >= 4);
  for (const p of r.rows) {
    assert.ok(p.with_check, `policy ${p.policyname} on ${p.tablename} has no WITH CHECK`);
  }
});

test('the schema has nowhere to put an uploaded file', async () => {
  // SPEC.md: "the uploaded SBOM is never stored. Only its SHA-256 and the
  // findings." Enforced by the shape of the table rather than by remembering.
  const r = await db.query<{ column_name: string; data_type: string }>(
    `select column_name, data_type from information_schema.columns
     where table_name = 'checks'`,
  );
  const names = r.rows.map((c) => c.column_name);
  assert.ok(names.includes('file_sha256'));
  for (const forbidden of ['file_body', 'file_content', 'contents', 'raw', 'document', 'blob']) {
    assert.ok(!names.includes(forbidden), `checks has a ${forbidden} column`);
  }
  assert.ok(!r.rows.some((c) => c.data_type === 'bytea'), 'checks has a bytea column');
});
