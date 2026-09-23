/**
 * The workspace's reads and writes. SPEC.md 2.3.
 *
 * NO FIRM ID IS EVER A PARAMETER HERE, and that is the design rather than an
 * omission. SPEC.md's security table has a row reading "No client-supplied
 * firm_id trusted", and the most natural way to break it is a helper like
 * `checksFor(firmId)`: honest-looking, easy to call, and the moment one caller
 * passes a value that came from a request body, every row-level security
 * policy in 0002_rls.sql has been routed around by the application itself.
 *
 * So these queries name no firm. The policies resolve it from the verified
 * token, which means the WHERE clause a caller cannot write is the one that
 * actually matters, and a caller who wants another firm's rows has nowhere to
 * put the request.
 *
 * WHY SQL TEXT AND NOT A CLIENT. packages/db has no runtime dependency and no
 * opinion about who executes the statement. Supabase, node-postgres and PGlite
 * all satisfy the two-line `Executor` below, which is what lets the test suite
 * run these exact strings against real Postgres rather than against a mock of
 * one. The queries a reviewer reads are the queries that run.
 */

/** Anything that can run a parameterised statement. */
export interface Executor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface CheckSummary {
  id: string;
  project_id: string | null;
  project_name: string | null;
  clerk_user_id: string;
  file_name: string;
  file_sha256: string;
  source_format: string;
  source_spec: string;
  rule_pack_id: string;
  rule_pack_ver: string;
  finding_count: number;
  error_count: number;
  warn_count: number;
  info_count: number;
  created_at: string;
}

/**
 * A firm's check history, newest first. SPEC.md 2.3's acceptance sentence.
 *
 * The ORDER BY carries `id desc` as a tiebreak because `created_at` is a
 * timestamp and two checks submitted in the same transaction share one. Without
 * it Postgres may return them in either order, and "sorted newest first" would
 * be true on most runs and unstable on the run somebody screenshots.
 *
 * The join to projects is LEFT: a check need not belong to a project, and an
 * inner join would quietly hide every ad-hoc check from the history.
 */
export const RECENT_CHECKS = `
select c.id, c.project_id, p.name as project_name, c.clerk_user_id,
       c.file_name, c.file_sha256, c.source_format, c.source_spec,
       c.rule_pack_id, c.rule_pack_ver,
       c.finding_count, c.error_count, c.warn_count, c.info_count,
       c.created_at
from checks c
left join projects p on p.id = c.project_id
order by c.created_at desc, c.id desc
limit $1 offset $2
`;

export function recentChecks(
  db: Executor,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ rows: CheckSummary[] }> {
  // Clamped rather than trusted. A limit arriving from a query string as
  // 10_000_000 is a denial of service against the firm's own workspace.
  const take = Math.min(Math.max(1, Math.trunc(limit) || 1), 200);
  const skip = Math.max(0, Math.trunc(offset) || 0);
  return db.query<CheckSummary>(RECENT_CHECKS, [take, skip]);
}

export interface ProjectSummary {
  id: string;
  name: string;
  client_ref: string | null;
  created_at: string;
  check_count: number;
  last_check_at: string | null;
}

/**
 * A firm's projects, each with how much has been checked against it.
 *
 * The count is a LEFT JOIN with a GROUP BY rather than a correlated subquery
 * so that a project with no checks still appears, at zero. A projects list
 * that silently omits the empty ones looks like data loss to the person who
 * just created one.
 */
export const PROJECTS = `
select p.id, p.name, p.client_ref, p.created_at,
       count(c.id)::int as check_count,
       max(c.created_at) as last_check_at
from projects p
left join checks c on c.project_id = p.id
group by p.id, p.name, p.client_ref, p.created_at
order by p.created_at desc, p.id desc
`;

export function projects(db: Executor): Promise<{ rows: ProjectSummary[] }> {
  return db.query<ProjectSummary>(PROJECTS);
}

export interface SeatUsage {
  seats: number;
  seats_used: number;
  plan: string;
  checks_this_month: number;
}

/**
 * Seats, and how many of them are in use. Seats are the billing unit.
 *
 * A SEAT IS A PERSON WHO HAS RUN A CHECK, which is a choice worth stating
 * because the alternative is counting Clerk memberships. Membership counts
 * everybody who was ever invited, including the four people a firm added on
 * the first afternoon and never heard from again, and billing a firm for those
 * is the kind of thing that ends a pilot. Counting distinct actors in `checks`
 * can only undercount, and undercounting in the customer's favour is the safe
 * direction for a number that appears on an invoice.
 *
 * It follows that `seats_used` can exceed `seats`, and the query does not clamp
 * it. A firm over its allowance needs to see that it is over, not a number
 * capped to sit inside the plan it has outgrown.
 */
export const SEAT_USAGE = `
select f.seats, f.plan,
       (select count(distinct c.clerk_user_id)::int from checks c) as seats_used,
       (select count(*)::int from checks c
         where c.created_at >= date_trunc('month', now())) as checks_this_month
from firms f
`;

export function seatUsage(db: Executor): Promise<{ rows: SeatUsage[] }> {
  return db.query<SeatUsage>(SEAT_USAGE);
}

/**
 * Record one check. The uploaded file is not a parameter, because it is not
 * stored: 0001_schema.sql has no column it could go in.
 */
export const INSERT_CHECK = `
insert into checks (firm_id, project_id, clerk_user_id, engine_version,
                    rule_pack_id, rule_pack_ver, source_format, source_spec,
                    file_name, file_sha256,
                    finding_count, error_count, warn_count, info_count, findings)
values (app_current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
returning id, created_at
`;

export interface NewCheck {
  projectId: string | null;
  clerkUserId: string;
  engineVersion: string;
  rulePackId: string;
  rulePackVer: string;
  sourceFormat: 'cyclonedx' | 'spdx';
  sourceSpec: string;
  fileName: string;
  fileSha256: string;
  findingCount: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  findings: unknown;
}

/**
 * The firm id comes from `app_current_firm_id()` inside the statement, not
 * from the caller. A caller who could supply it could supply somebody else's,
 * and the WITH CHECK policy would refuse the write, but refusing is a worse
 * outcome than never offering the field: the first is an error somebody
 * debugs, the second is a mistake nobody can make.
 */
export function insertCheck(
  db: Executor,
  c: NewCheck,
): Promise<{ rows: Array<{ id: string; created_at: string }> }> {
  return db.query(INSERT_CHECK, [
    c.projectId,
    c.clerkUserId,
    c.engineVersion,
    c.rulePackId,
    c.rulePackVer,
    c.sourceFormat,
    c.sourceSpec,
    c.fileName,
    c.fileSha256,
    c.findingCount,
    c.errorCount,
    c.warnCount,
    c.infoCount,
    JSON.stringify(c.findings ?? []),
  ]);
}

export const INSERT_PROJECT = `
insert into projects (firm_id, name, client_ref)
values (app_current_firm_id(), $1, $2)
returning id, created_at
`;

export function insertProject(
  db: Executor,
  name: string,
  clientRef: string | null = null,
): Promise<{ rows: Array<{ id: string; created_at: string }> }> {
  return db.query(INSERT_PROJECT, [name, clientRef]);
}

// ---- R8, the audit log -------------------------------------------------

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  detail: unknown;
  occurred_at: string;
}

export const INSERT_AUDIT = `
insert into audit_log (firm_id, actor, action, target, detail)
values (app_current_firm_id(), $1, $2, $3, $4)
returning id, occurred_at
`;

/**
 * Record an administrative action. There is no matching update or delete, and
 * there is no policy that would permit one.
 *
 * SPEC.md calls this the compensating control for a one-person company being
 * unable to separate duties. A control whose own records can be edited by the
 * person it watches is not one, so the absence of an edit path here is the
 * feature, not an unfinished interface.
 */
export function recordAudit(
  db: Executor,
  entry: { actor: string; action: string; target?: string | null; detail?: unknown },
): Promise<{ rows: Array<{ id: string; occurred_at: string }> }> {
  return db.query(INSERT_AUDIT, [
    entry.actor,
    entry.action,
    entry.target ?? null,
    entry.detail === undefined ? null : JSON.stringify(entry.detail),
  ]);
}

export const AUDIT_TRAIL = `
select id, actor, action, target, detail, occurred_at
from audit_log
order by occurred_at desc, id desc
limit $1 offset $2
`;

export function auditTrail(
  db: Executor,
  { limit = 100, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ rows: AuditEntry[] }> {
  const take = Math.min(Math.max(1, Math.trunc(limit) || 1), 500);
  const skip = Math.max(0, Math.trunc(offset) || 0);
  return db.query<AuditEntry>(AUDIT_TRAIL, [take, skip]);
}

/** Every statement this package runs, for anyone auditing what touches the data. */
export const ALL_STATEMENTS: ReadonlyArray<{ name: string; sql: string }> = [
  { name: 'RECENT_CHECKS', sql: RECENT_CHECKS },
  { name: 'PROJECTS', sql: PROJECTS },
  { name: 'SEAT_USAGE', sql: SEAT_USAGE },
  { name: 'INSERT_CHECK', sql: INSERT_CHECK },
  { name: 'INSERT_PROJECT', sql: INSERT_PROJECT },
  { name: 'INSERT_AUDIT', sql: INSERT_AUDIT },
  { name: 'AUDIT_TRAIL', sql: AUDIT_TRAIL },
];
