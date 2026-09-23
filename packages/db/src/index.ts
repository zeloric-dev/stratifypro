/**
 * @stratifypro/db
 *
 * The schema, the row-level security policies, and a way to run them against a
 * real Postgres without a Supabase project.
 *
 * WHY THIS IS TESTABLE AT ALL. SPEC.md 2.2 accepts on "a direct PostgREST call
 * with firm A's token returns zero of firm B's rows". Row-level security is a
 * Postgres feature, not a Supabase one, and Supabase's `auth.jwt()` is an
 * ordinary SQL function over the `request.jwt.claims` session setting. So the
 * policies can be exercised in PGlite, which is Postgres compiled to WASM, with
 * the same function defined the same way. What is NOT covered is PostgREST
 * itself and Supabase's role grants; that gap is stated rather than papered
 * over, and `connectionNotes()` says so to anybody who asks.
 *
 * THE TEST RUNS AS A NON-OWNER ROLE. `enable row level security` exempts the
 * table owner. A suite connecting as the owner would pass every isolation test
 * without a single policy being consulted, which is the most comfortable kind
 * of false green. The migrations also FORCE row level security, and the
 * harness connects as `authenticated`, so both halves hold.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_NAME = '@stratifypro/db' as const;

const HERE = dirname(fileURLToPath(import.meta.url));
/** Migrations live beside the package, not in dist: they are data, not build output. */
export const MIGRATIONS_DIR = resolve(HERE, '..', 'migrations');

/** Every migration in order, as SQL text. */
export function migrations(): Array<{ name: string; sql: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }));
}

/**
 * Supabase's own `auth.jwt()`, defined identically.
 *
 * Supabase implements it as a stable SQL function reading the
 * `request.jwt.claims` session setting, which PostgREST sets per request from
 * the verified token. Redefining it here is what makes the policy test
 * faithful rather than a simulation of one: the policies run the same
 * expression they will run in production.
 *
 * `true` as the second argument to current_setting means "return null if
 * unset" rather than raising, so an unauthenticated session sees no rows
 * instead of erroring.
 */
export const AUTH_SHIM = `
create schema if not exists auth;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

-- The role PostgREST uses for a signed-in request. Not the table owner, so
-- row-level security actually applies to it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

-- Supabase grants these, and without them every policy fails closed with
-- "permission denied for schema auth" rather than with a row count. That is
-- the safe direction to fail, but it is not the behaviour under test.
grant usage on schema auth to authenticated, anon;
grant execute on function auth.jwt() to authenticated, anon;
`;

/**
 * Everything needed to stand the schema up, in the only order that works.
 *
 * The shim comes FIRST. 0002_rls.sql calls `auth.jwt()` inside a policy, and a
 * policy body is parsed when it is created, so the function has to exist
 * already. In a Supabase project it does: the auth schema is provisioned
 * before your migrations run. Locally nothing provides it, so leaving the
 * order to whoever writes the next harness means they hit "schema auth does
 * not exist" and have no reason to suspect the order rather than the policy.
 *
 * The grants come LAST, because `on all tables in schema public` binds to the
 * tables that exist at the moment it runs, not to tables added later.
 */
export function bootstrapStatements(): Array<{ name: string; sql: string }> {
  return [
    { name: 'auth-shim', sql: AUTH_SHIM },
    ...migrations(),
    { name: 'grants', sql: GRANTS },
  ];
}

/**
 * Grants matching what Supabase gives the request roles.
 *
 * EVERY TABLE IS NAMED, and `on all tables in schema public` is deliberately
 * not used. It was, and it was a trap: these grants run AFTER the migrations,
 * so the blanket form silently re-granted `update, delete` on `audit_log`
 * moments after 0003 revoked them. The append-only control would have been off
 * in the test harness while the migration that establishes it sat in the
 * repository looking correct.
 *
 * Naming each table means a new one arrives with no grant at all and fails
 * closed, which forces the decision to be made rather than inherited.
 */
export const GRANTS = `
grant usage on schema public to authenticated, anon;

grant select, insert, update, delete on firms, projects, checks, evidence_bundles
  to authenticated;

-- Append only. R8's control is that nobody can edit the record of what they
-- did, so this line must never grow an update or a delete.
grant select, insert on audit_log to authenticated;

grant select on public_metrics to anon, authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- Belt and braces for the claim above: if a future change reintroduces a
-- blanket grant anywhere, this still takes the two verbs away.
revoke update, delete on audit_log from authenticated;
`;

/**
 * The claims PostgREST would set for a signed-in user of one organization.
 *
 * Clerk puts the ACTIVE organization under `o`. A user who belongs to two
 * firms is acting in exactly one at a time, which is what a consultancy
 * switching between clients needs and what the policy relies on.
 */
export function claimsForOrg(clerkOrgId: string, clerkUserId = 'user_test'): string {
  return JSON.stringify({ sub: clerkUserId, o: { id: clerkOrgId } });
}

/**
 * The workspace's reads and writes. SPEC.md 2.3.
 *
 * Re-exported here so one import reaches the schema and the statements that
 * run against it, and so that nobody is tempted to write a second set of
 * queries beside this package rather than inside it.
 */
export * from './queries.js';

/** What this harness does and does not prove. Printed by the test suite. */
export function connectionNotes(): string[] {
  return [
    'Tested: the policies themselves, in real Postgres, as a non-owner role.',
    'Not tested: PostgREST request handling, Supabase JWT verification, or storage rules.',
    'A passing suite means the policy logic is right, not that the deployment is.',
  ];
}
