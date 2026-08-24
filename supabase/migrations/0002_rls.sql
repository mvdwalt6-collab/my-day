-- 0002_rls.sql — Row-Level Security.
--
-- Isolation model:
--   * Every domain row has tenant_id.
--   * `current_user_tenant()` returns the caller's tenant via tenant_members.
--   * `is_sysadmin()` returns true when the caller's profile has is_sysadmin = true.
--   * `is_impersonating()` returns true when the sysadmin has an active impersonation
--     session cookie/header (checked via request header `x-imp-tenant`).
--
-- All tenant tables: members can SELECT/INSERT/UPDATE/DELETE their own tenant's rows.
-- Sysadmins can additionally SELECT any row. Writes by sysadmins on other tenants
-- are only allowed when NOT impersonating (impersonation is read-only) — enforced
-- both at the RPC layer and via the WITH CHECK clauses below.

create or replace function public.current_user_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.tenant_members
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_sysadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_sysadmin from public.profiles where user_id = auth.uid()),
    false
  );
$$;

create or replace function public.is_impersonating()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::json->>'x-imp-tenant', '')::uuid is not null,
    false
  );
$$;

create or replace function public.effective_tenant()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::json->>'x-imp-tenant', '')::uuid,
    public.current_user_tenant()
  );
$$;

alter table tenants                 enable row level security;
alter table profiles                enable row level security;
alter table tenant_members          enable row level security;
alter table settings                enable row level security;
alter table children                enable row level security;
alter table tasks                   enable row level security;
alter table goals                   enable row level security;
alter table completions             enable row level security;
alter table ledger                  enable row level security;
alter table applied                 enable row level security;
alter table snoozes                 enable row level security;
alter table announcements           enable row level security;
alter table announcement_dismissals enable row level security;
alter table audit_log               enable row level security;

-- tenants ---------------------------------------------------------------------
create policy tenants_select on tenants
  for select using (
    id = public.current_user_tenant()
    or public.is_sysadmin()
  );

create policy tenants_update_sysadmin on tenants
  for update using (public.is_sysadmin() and not public.is_impersonating())
  with check    (public.is_sysadmin() and not public.is_impersonating());

-- Signup uses the create_tenant RPC (SECURITY DEFINER); no direct INSERT/DELETE.

-- profiles --------------------------------------------------------------------
create policy profiles_select_self on profiles
  for select using (user_id = auth.uid() or public.is_sysadmin());

create policy profiles_update_self on profiles
  for update using (user_id = auth.uid())
  with check    (user_id = auth.uid() and is_sysadmin = (select is_sysadmin from profiles where user_id = auth.uid()));

-- Sysadmin promotion goes through admin_promote_sysadmin RPC.

-- tenant_members --------------------------------------------------------------
create policy tenant_members_select on tenant_members
  for select using (
    user_id = auth.uid()
    or tenant_id = public.current_user_tenant()
    or public.is_sysadmin()
  );

-- Membership changes go through RPCs.

-- Generic per-tenant read/write policy factory ---------------------------------
-- Rather than a real factory, we spell them out per table for clarity.

-- settings --------------------------------------------------------------------
create policy settings_select on settings
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy settings_write on settings
  for update using (tenant_id = public.current_user_tenant() and not public.is_impersonating())
  with check    (tenant_id = public.current_user_tenant() and not public.is_impersonating());

-- children --------------------------------------------------------------------
create policy children_select on children
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy children_insert on children
  for insert with check (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy children_update on children
  for update using    (tenant_id = public.current_user_tenant() and not public.is_impersonating())
  with check          (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy children_delete on children
  for delete using    (tenant_id = public.current_user_tenant() and not public.is_impersonating());

-- tasks -----------------------------------------------------------------------
create policy tasks_select on tasks
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy tasks_insert on tasks
  for insert with check (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy tasks_update on tasks
  for update using    (tenant_id = public.current_user_tenant() and not public.is_impersonating())
  with check          (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy tasks_delete on tasks
  for delete using    (tenant_id = public.current_user_tenant() and not public.is_impersonating());

-- goals -----------------------------------------------------------------------
create policy goals_select on goals
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy goals_insert on goals
  for insert with check (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy goals_update on goals
  for update using    (tenant_id = public.current_user_tenant() and not public.is_impersonating())
  with check          (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy goals_delete on goals
  for delete using    (tenant_id = public.current_user_tenant() and not public.is_impersonating());

-- completions -----------------------------------------------------------------
create policy completions_select on completions
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy completions_insert on completions
  for insert with check (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy completions_update on completions
  for update using    (tenant_id = public.current_user_tenant() and not public.is_impersonating())
  with check          (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy completions_delete on completions
  for delete using    (tenant_id = public.current_user_tenant() and not public.is_impersonating());

-- ledger ----------------------------------------------------------------------
create policy ledger_select on ledger
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy ledger_insert on ledger
  for insert with check (tenant_id = public.current_user_tenant() and not public.is_impersonating());

-- applied ---------------------------------------------------------------------
create policy applied_select on applied
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy applied_insert on applied
  for insert with check (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy applied_delete on applied
  for delete using    (tenant_id = public.current_user_tenant() and not public.is_impersonating());

-- snoozes ---------------------------------------------------------------------
create policy snoozes_select on snoozes
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy snoozes_write on snoozes
  for insert with check (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy snoozes_update on snoozes
  for update using    (tenant_id = public.current_user_tenant() and not public.is_impersonating())
  with check          (tenant_id = public.current_user_tenant() and not public.is_impersonating());

-- announcements ---------------------------------------------------------------
create policy announcements_select on announcements
  for select using (true);
create policy announcements_write_sysadmin on announcements
  for all using    (public.is_sysadmin() and not public.is_impersonating())
  with check       (public.is_sysadmin() and not public.is_impersonating());

create policy announcement_dismissals_rw on announcement_dismissals
  for all using    (tenant_id = public.current_user_tenant())
  with check       (tenant_id = public.current_user_tenant());

-- audit_log -------------------------------------------------------------------
create policy audit_select on audit_log
  for select using (public.is_sysadmin());
create policy audit_insert on audit_log
  for insert with check (auth.uid() is not null);
