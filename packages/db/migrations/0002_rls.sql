-- Row-level security. SPEC.md section 4.
--
-- Every policy resolves firm_id from the Clerk organization claim in the JWT.
-- NO POLICY TRUSTS A CLIENT-SUPPLIED firm_id, and that is the whole point: a
-- client can send any firm_id it likes, so a policy comparing the row's
-- firm_id to a value from the request body would authorise the attacker with
-- the attacker's own input. The only trusted source is the signed token.
--
-- FORCE, not just ENABLE. `enable row level security` exempts the table owner,
-- and in a Supabase project the tables are owned by postgres while queries
-- arrive as `authenticated`. Forcing it means the policies also hold when
-- something connects as the owner, which is the case a test run as the owner
-- would otherwise pass without exercising anything.

alter table firms            enable row level security;
alter table projects         enable row level security;
alter table checks           enable row level security;
alter table evidence_bundles enable row level security;
alter table public_metrics   enable row level security;

alter table firms            force row level security;
alter table projects         force row level security;
alter table checks           force row level security;
alter table evidence_bundles force row level security;
alter table public_metrics   force row level security;

-- `firms` is the BASE CASE, and it is stated directly in terms of the token
-- rather than through the helper below.
--
-- This is not a style choice. The obvious version, `using (id =
-- app_current_firm_id())`, is infinitely recursive: the helper reads `firms`,
-- reading `firms` applies this policy, and this policy calls the helper.
-- Postgres catches it at query time with "infinite recursion detected in
-- policy for relation firms", so the failure is loud rather than silent, but
-- it is a failure on every request.
--
-- The usual escape is to mark the helper `security definer` so its read
-- bypasses row-level security. That does not work here and SHOULD not: the
-- tables FORCE row-level security, which means the owner is not exempt
-- either. Breaking the recursion that way would mean weakening the guarantee
-- the force flag exists to give. Stating the base case directly costs one
-- comparison and keeps it.
--
-- `auth.jwt()` is Supabase's own function over `request.jwt.claims`. Clerk puts
-- the active organization under the `o` claim, so `o.id` is the organization
-- the user is currently acting in, not merely one they belong to. A user in
-- two firms gets one firm's rows at a time, which is what a consultancy
-- switching between clients needs.
create policy firm_isolation_firms on firms
  for all
  using (clerk_org_id = auth.jwt() -> 'o' ->> 'id')
  with check (clerk_org_id = auth.jwt() -> 'o' ->> 'id');

-- Every other table derives from that base case. The helper reads `firms`
-- under the policy above, so it can only ever return the caller's own firm:
-- there is no argument to it and nothing from the request body reaches it.
create or replace function app_current_firm_id() returns uuid
language sql stable security invoker
as $$
  select id from firms
  where clerk_org_id = auth.jwt() -> 'o' ->> 'id'
$$;

create policy firm_isolation_projects on projects
  for all
  using (firm_id = app_current_firm_id())
  with check (firm_id = app_current_firm_id());

create policy firm_isolation_checks on checks
  for all
  using (firm_id = app_current_firm_id())
  with check (firm_id = app_current_firm_id());

create policy firm_isolation_evidence on evidence_bundles
  for all
  using (firm_id = app_current_firm_id())
  with check (firm_id = app_current_firm_id());

-- WITH CHECK on every policy, not just USING.
--
-- USING filters what a statement can SEE. WITH CHECK constrains what it can
-- WRITE. A policy with USING alone lets a firm insert a row stamped with
-- somebody else's firm_id: the insert is permitted, and the row then becomes
-- invisible to its author and visible to the victim. That is worse than a
-- read leak, because it plants data in another firm's workspace.

-- public_metrics is readable by anyone and writable only by the service role.
-- It carries no customer data; it is the evidence behind published figures.
create policy public_metrics_read on public_metrics
  for select
  using (true);
