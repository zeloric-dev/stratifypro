/**
 * SPEC.md 2.3: "A firm sees its own checks only, sorted newest first."
 *
 * Run against real Postgres as the `authenticated` role, for the same two
 * reasons rls.test.ts gives: row-level security is a Postgres feature, and
 * `enable row level security` exempts the table owner, so a suite connecting
 * as the owner would pass every isolation assertion without one policy being
 * consulted.
 *
 * WHAT IS BEING TESTED THAT rls.test.ts DOES NOT COVER. That file proves the
 * policies isolate. This one proves the QUERIES do, which is a different claim:
 * a correct set of policies can still be routed around by application code that
 * takes a firm id as a parameter and joins on it. None of these queries accept
 * one, and the tests below check the behaviour that follows from that.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { bootstrapStatements, claimsForOrg } from './index.js';
import {
  ALL_STATEMENTS,
  auditTrail,
  insertCheck,
  insertProject,
  projects,
  recentChecks,
  recordAudit,
  seatUsage,
  type Executor,
} from './queries.js';

let db: PGlite;

/** An Executor bound to one organization, the way a request would be. */
function asOrg(clerkOrgId: string, clerkUserId = 'user_test'): Executor {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      await db.exec('begin');
      try {
        await db.query('select set_config($1, $2, true)', [
          'request.jwt.claims',
          claimsForOrg(clerkOrgId, clerkUserId),
        ]);
        await db.exec('set local role authenticated');
        const r = await db.query<T>(sql, params);
        await db.exec('commit');
        return { rows: r.rows };
      } catch (e) {
        await db.exec('rollback');
        throw e;
      }
    },
  };
}

const A = () => asOrg('org_a', 'user_a');
const B = () => asOrg('org_b', 'user_b');

before(async () => {
  db = new PGlite();
  for (const s of bootstrapStatements()) await db.exec(s.sql);
  await db.exec(
    "insert into firms (clerk_org_id, name, seats, plan) values " +
      "('org_a','Northgate Regulatory',5,'pilot')," +
      "('org_b','Calder Medical Advisors',3,'licensed')",
  );

  // Seeded through the same queries the product uses, as the firms themselves.
  const pa = await insertProject(A(), 'HX-4100 submission', 'client-01');
  await insertProject(A(), 'A project with no checks yet', null);
  const pb = await insertProject(B(), 'Calder device', null);

  const mk = (n: number, projectId: string | null, user: string) => ({
    projectId,
    clerkUserId: user,
    engineVersion: '1.0.0',
    rulePackId: 'fda-524b',
    rulePackVer: '1.0.0',
    sourceFormat: 'cyclonedx' as const,
    sourceSpec: '1.5',
    fileName: `file-${n}.cdx.json`,
    fileSha256: String(n).repeat(8),
    findingCount: n,
    errorCount: 0,
    warnCount: n,
    infoCount: 0,
    findings: [],
  });

  // Firm A: three checks, two users, deliberately not inserted in time order.
  await insertCheck(A(), mk(1, pa.rows[0]!.id, 'user_a'));
  await insertCheck(A(), mk(2, null, 'user_a2'));
  await insertCheck(A(), mk(3, pa.rows[0]!.id, 'user_a'));
  await insertCheck(B(), mk(9, pb.rows[0]!.id, 'user_b'));
});

after(async () => {
  await db?.close();
});

test('THE ACCEPTANCE: a firm sees its own checks only, newest first', async () => {
  const r = await recentChecks(A());
  assert.equal(r.rows.length, 3, 'firm A should see exactly its own three checks');
  assert.ok(
    r.rows.every((c) => c.file_name !== 'file-9.cdx.json'),
    "firm B's check appeared in firm A's history",
  );
  const times = r.rows.map((c) => new Date(c.created_at).getTime());
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i - 1]! >= times[i]!, 'the history is not sorted newest first');
  }
  // Newest first means the last one inserted comes back first.
  assert.equal(r.rows[0]?.file_name, 'file-3.cdx.json');
});

test('checks written in the same transaction still come back in a stable order', async () => {
  // created_at is a timestamp and Postgres gives one value per transaction, so
  // two checks recorded together are tied. Without the id tiebreak the order
  // is whatever the planner returns, and "newest first" is then true on most
  // runs and wrong on the run somebody screenshots.
  const first = await recentChecks(A());
  const second = await recentChecks(A());
  assert.deepEqual(
    first.rows.map((c) => c.id),
    second.rows.map((c) => c.id),
    'two identical queries returned the history in different orders',
  );
});

test('firm B sees its own, so the queries filter rather than return nothing', async () => {
  const r = await recentChecks(B());
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]?.file_name, 'file-9.cdx.json');
});

test('no query takes a firm id, so no caller can ask for another firm', async () => {
  // The structural version of the test above. SPEC.md's security table says
  // "No client-supplied firm_id trusted", and the easiest way to break that is
  // an application helper that accepts one. A $1 bound to a firm id here would
  // route around every policy in 0002_rls.sql.
  for (const { name, sql } of ALL_STATEMENTS) {
    assert.ok(
      !/\bfirm_id\s*=\s*\$\d/.test(sql),
      `${name} compares firm_id to a parameter, which a caller controls`,
    );
    if (/insert\s+into/i.test(sql)) {
      assert.ok(
        /app_current_firm_id\(\)/.test(sql),
        `${name} inserts without taking firm_id from the verified token`,
      );
    }
  }
});

test('an inserted check is stamped with the caller firm, never a supplied one', async () => {
  const before = await recentChecks(B());
  await insertCheck(A(), {
    projectId: null,
    clerkUserId: 'user_a',
    engineVersion: '1.0.0',
    rulePackId: 'fda-524b',
    rulePackVer: '1.0.0',
    sourceFormat: 'spdx',
    sourceSpec: '2.3',
    fileName: 'stamped.spdx.json',
    fileSha256: 'f'.repeat(64),
    findingCount: 0,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    findings: [],
  });
  const afterB = await recentChecks(B());
  assert.equal(afterB.rows.length, before.rows.length, "a write by firm A reached firm B");
  const a = await recentChecks(A());
  assert.ok(a.rows.some((c) => c.file_name === 'stamped.spdx.json'));
});

test('a project with no checks still appears, at zero', async () => {
  // A LEFT JOIN rather than an inner one. A projects list that silently omits
  // the empty ones looks like data loss to somebody who just made one.
  const r = await projects(A());
  const empty = r.rows.find((p) => p.name === 'A project with no checks yet');
  assert.ok(empty, 'a project with no checks vanished from the list');
  assert.equal(empty?.check_count, 0);
  assert.equal(empty?.last_check_at, null);
});

test('a project counts only its own checks, and only this firm sees it', async () => {
  const r = await projects(A());
  assert.equal(r.rows.length, 2);
  const main = r.rows.find((p) => p.name === 'HX-4100 submission');
  assert.equal(main?.check_count, 2);
  assert.ok(!r.rows.some((p) => p.name === 'Calder device'), "firm B's project was visible");
});

test('a check with no project is still in the history', async () => {
  // The LEFT JOIN on the other side. An inner join would hide every ad-hoc
  // check, which is most of them early on.
  const r = await recentChecks(A());
  const loose = r.rows.find((c) => c.file_name === 'file-2.cdx.json');
  assert.ok(loose, 'a check belonging to no project vanished from the history');
  assert.equal(loose?.project_id, null);
  assert.equal(loose?.project_name, null);
});

test('seat usage counts people who ran a check, not everyone invited', async () => {
  // Counting Clerk memberships would bill a firm for the four people it added
  // on the first afternoon and never heard from again.
  const r = await seatUsage(A());
  assert.equal(r.rows.length, 1, 'a firm saw more than its own seat figures');
  assert.equal(r.rows[0]?.seats, 5);
  assert.equal(r.rows[0]?.plan, 'pilot');
  assert.equal(r.rows[0]?.seats_used, 2); // user_a and user_a2
  const b = await seatUsage(B());
  assert.equal(b.rows[0]?.seats, 3);
  assert.equal(b.rows[0]?.seats_used, 1);
});

test('the limit is clamped, so a query string cannot ask for everything', async () => {
  const huge = await recentChecks(A(), { limit: 10_000_000 });
  assert.ok(huge.rows.length <= 200);
  const silly = await recentChecks(A(), { limit: -5 });
  assert.ok(silly.rows.length >= 1, 'a negative limit produced an invalid query');
  const paged = await recentChecks(A(), { limit: 1, offset: 1 });
  assert.equal(paged.rows.length, 1);
});

// ---- R8, the audit log -------------------------------------------------

test('the audit log records an action and shows it back', async () => {
  await recordAudit(A(), {
    actor: 'user_a',
    action: 'seat.invite',
    target: 'someone@example.invalid',
    detail: { role: 'member' },
  });
  const r = await auditTrail(A());
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]?.action, 'seat.invite');
  assert.deepEqual(r.rows[0]?.detail, { role: 'member' });
});

test('THE CONTROL: an audit entry cannot be updated, by anyone', async () => {
  // R8 is the compensating control for a one-person company being unable to
  // separate duties. A log the logger can edit is a diary. There is no UPDATE
  // policy on the table, and row-level security denies what no policy permits.
  await assert.rejects(
    () => A().query("update audit_log set action = 'nothing happened'"),
    /permission denied|row-level security/i,
  );
});

test('THE CONTROL: an audit entry cannot be deleted, by anyone', async () => {
  await assert.rejects(
    () => A().query('delete from audit_log'),
    /permission denied|row-level security/i,
  );
  const still = await auditTrail(A());
  assert.equal(still.rows.length, 1, 'an audit entry disappeared');
});

test('one firm cannot read or append to another firm audit log', async () => {
  const b = await auditTrail(B());
  assert.equal(b.rows.length, 0, "firm B read firm A's audit log");
  await recordAudit(B(), { actor: 'user_b', action: 'project.create' });
  const a = await auditTrail(A());
  assert.equal(a.rows.length, 1, "firm B's entry appeared in firm A's log");
});

test('the append-only grant survived the grants that run after the migration', async () => {
  // This exists because it was briefly false. The harness applies GRANTS after
  // the migrations, and `grant ... on all tables in schema public` re-granted
  // update and delete on audit_log moments after 0003 revoked them. The
  // migration looked correct in the repository while the control was off.
  const r = await db.query<{ privilege_type: string }>(
    `select privilege_type from information_schema.role_table_grants
     where grantee = 'authenticated' and table_name = 'audit_log'`,
  );
  const granted = r.rows.map((x) => x.privilege_type.toUpperCase()).sort();
  assert.deepEqual(granted, ['INSERT', 'SELECT']);
});

test('the audit table has no update or delete policy at all', async () => {
  // The structural claim underneath the two behavioural tests. A future
  // migration that adds one would pass both of those if it also granted the
  // privilege; this fails the moment a policy appears.
  const r = await db.query<{ cmd: string }>(
    `select cmd from pg_policies where schemaname = 'public' and tablename = 'audit_log'`,
  );
  const cmds = r.rows.map((x) => x.cmd.toUpperCase()).sort();
  assert.deepEqual(cmds, ['INSERT', 'SELECT']);
});
