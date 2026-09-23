-- StratifyPro schema. SPEC.md section 4.
--
-- THE UPLOADED FILE IS NEVER STORED, and the schema is the enforcement rather
-- than the policy. `checks` holds a SHA-256 and the findings; there is no
-- column a file body could go in. A device maker's bill of materials is a map
-- of every weakness in their product, so storing it creates a breach target
-- with no product benefit. A firm re-uploads to re-run.
--
-- Every table carrying customer data is row-level-secured and FORCED, so the
-- table owner is not exempt. See 0002_rls.sql.

create table if not exists firms (
  id              uuid primary key default gen_random_uuid(),
  clerk_org_id    text unique not null,
  name            text not null,
  plan            text not null default 'pilot'
                    check (plan in ('pilot','licensed','lapsed')),
  seats           int  not null default 5,
  created_at      timestamptz not null default now()
);

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id) on delete cascade,
  name        text not null,
  -- The firm's own reference. Never a device name: a project list that named
  -- devices would leak a client's roadmap to anybody who saw the workspace.
  client_ref  text,
  created_at  timestamptz not null default now()
);
create index if not exists projects_firm_idx on projects(firm_id);

create table if not exists checks (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references firms(id) on delete cascade,
  project_id     uuid references projects(id) on delete set null,
  clerk_user_id  text not null,
  engine_version text not null,
  rule_pack_id   text not null,
  rule_pack_ver  text not null,
  source_format  text not null check (source_format in ('cyclonedx','spdx')),
  source_spec    text not null,
  file_name      text not null,
  -- The file is NOT stored. Only its hash. There is deliberately no column
  -- that could hold its contents, and a test asserts that stays true.
  file_sha256    text not null,
  finding_count  int  not null,
  error_count    int  not null,
  warn_count     int  not null,
  info_count     int  not null,
  findings       jsonb not null,
  created_at     timestamptz not null default now()
);
create index if not exists checks_firm_created_idx on checks(firm_id, created_at desc);
create index if not exists checks_project_idx on checks(project_id);

create table if not exists evidence_bundles (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references firms(id) on delete cascade,
  -- restrict, not cascade: deleting a check that an evidence bundle attests to
  -- would orphan a record somebody may have filed with a regulator.
  check_id       uuid not null references checks(id) on delete restrict,
  storage_path   text not null,
  bundle_sha256  text not null,
  seal           text not null,
  sealed_at      timestamptz not null,
  -- The verbatim scope-of-attestation string, stored with the bundle so the
  -- record carries its own limits. packages/report/src/attestation.ts is the
  -- single source of that wording.
  attests        text not null
);
create index if not exists evidence_bundles_firm_idx on evidence_bundles(firm_id);

-- Append only, never updated. Public by design: this is the objective-evidence
-- table behind published figures, and a number nobody can audit is a claim.
create table if not exists public_metrics (
  id          bigserial primary key,
  captured_at timestamptz not null default now(),
  source      text not null,
  metric      text not null,
  value       numeric,
  detail      jsonb,
  url         text
);
