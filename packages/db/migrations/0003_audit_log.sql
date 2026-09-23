-- R8. An immutable audit log of every administrative action.
--
-- SPEC.md names this as a COMPENSATING CONTROL, and the thing it compensates
-- for is stated plainly there: a one-person company cannot separate duties.
-- Every framework that asks for segregation of duties assumes two people. When
-- there is one, the honest answer is not to claim the control, it is to record
-- what the one person did in a way that person cannot later alter.
--
-- APPEND-ONLY IS ENFORCED BY THE ABSENCE OF A POLICY, NOT BY A PROMISE.
-- Row-level security denies by default: with RLS enabled and forced, an
-- operation with no policy permitting it is refused. So this table has a SELECT
-- policy and an INSERT policy and deliberately NO UPDATE and NO DELETE policy.
-- There is nothing to disable and no flag to flip. A log that the logger can
-- edit is a diary.
--
-- The `revoke` below is belt and braces for the same claim, and it is worth
-- having because a future migration that adds a permissive policy by accident
-- would otherwise be the only thing standing between this table and an edit.

create table if not exists audit_log (
  id          bigserial primary key,
  firm_id     uuid not null references firms(id) on delete restrict,
  -- restrict, not cascade. Deleting a firm must not delete the record of what
  -- was done to that firm's data; that is the one deletion an audit log exists
  -- to survive.

  -- Who. The Clerk user id rather than a foreign key, because the actor may
  -- have left the organization by the time anybody reads this row, and the
  -- record must not depend on them still being a member.
  actor       text not null,
  -- What, on what. Free text by design: an enum would need a migration every
  -- time an action is added, and a migration is exactly the moment somebody
  -- decides not to log the new thing.
  action      text not null,
  target      text,
  detail      jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_log_firm_time_idx on audit_log(firm_id, occurred_at desc);

alter table audit_log enable row level security;
alter table audit_log force  row level security;

-- Read your own firm's log.
create policy audit_log_read on audit_log
  for select
  using (firm_id = app_current_firm_id());

-- Append to your own firm's log. WITH CHECK only: an INSERT has no existing
-- row to test, and the constraint that matters is that the new row cannot be
-- stamped with another firm's id.
create policy audit_log_append on audit_log
  for insert
  with check (firm_id = app_current_firm_id());

-- NO UPDATE POLICY AND NO DELETE POLICY. This is the control. Do not add one.
revoke update, delete on audit_log from authenticated;
