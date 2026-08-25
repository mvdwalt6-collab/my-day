-- 0008_screen_timer.sql — per-child screen-time countdown budget.
-- Daily allowance lives on children; per-day usage/bonus/running state in screen_time.

alter table public.children add column if not exists screen_daily_min int not null default 60;

create table if not exists public.screen_time (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  child_id      uuid not null references public.children(id) on delete cascade,
  date          text not null,
  used_sec      int  not null default 0,
  bonus_min     int  not null default 0,
  running_since timestamptz,
  primary key (child_id, date)
);
create index if not exists screen_time_tenant on public.screen_time (tenant_id);

alter table public.screen_time enable row level security;

create policy screen_time_select on public.screen_time
  for select using (tenant_id = public.current_user_tenant() or public.is_sysadmin());
create policy screen_time_insert on public.screen_time
  for insert with check (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy screen_time_update on public.screen_time
  for update using    (tenant_id = public.current_user_tenant() and not public.is_impersonating())
  with check          (tenant_id = public.current_user_tenant() and not public.is_impersonating());
create policy screen_time_delete on public.screen_time
  for delete using    (tenant_id = public.current_user_tenant() and not public.is_impersonating());
