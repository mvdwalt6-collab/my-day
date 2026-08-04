-- 0001_init.sql — schema for multi-tenant My Day.
--
-- Every domain row carries tenant_id and is protected by RLS in 0002_rls.sql.
-- Kids do NOT get accounts; parents authenticate and select a child in the UI.

create extension if not exists pgcrypto;

create type tenant_status  as enum ('active', 'suspended', 'deleted');
create type plan_status    as enum ('trial', 'active', 'expired');
create type member_role    as enum ('owner', 'parent');
create type goal_status    as enum ('active', 'wishlist');
create type task_window    as enum ('Morning', 'Afternoon', 'Evening', 'Bonus');
create type task_carry     as enum ('none', 'next', 'later');
create type completion_status as enum ('done', 'disputed');
create type ledger_type    as enum ('earn', 'bonus', 'spend', 'advance', 'adjust', 'penalty', 'undo', 'dispute');

create table tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     tenant_status not null default 'active',
  plan       plan_status   not null default 'trial',
  created_at timestamptz   not null default now(),
  deleted_at timestamptz
);

create table profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_sysadmin  boolean not null default false,
  created_at   timestamptz not null default now()
);

create table tenant_members (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       member_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index on tenant_members (user_id);

create table settings (
  tenant_id         uuid primary key references tenants(id) on delete cascade,
  day_start         smallint not null default 4,
  weekly_summary    boolean  not null default true,
  hold_ms           int      not null default 650,
  alarm_lead_min    smallint not null default 5,
  alarm_ring_sec    smallint not null default 60,
  alarm_visible_sec int      not null default 300,
  snooze_min        smallint not null default 5,
  screen_time_start text     not null default '18:00',
  screen_time_end   text     not null default '19:00',
  weather_enabled   boolean  not null default true,
  kid_lang          text     not null default 'af',
  pin_hash          text
);

create table children (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  av         text not null default '🙂',
  color      text not null,
  color_lite text not null,
  balance    int  not null default 0,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index on children (tenant_id);

create table tasks (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  child_id   uuid not null references children(id) on delete cascade,
  icon       text not null default '🙂',
  en         text not null default '',
  af         text not null default '',
  win        task_window not null default 'Morning',
  "time"     text,
  amount     int  not null default 0,
  alarm      boolean not null default false,
  mute       boolean not null default false,
  penalty    int  not null default 0,
  carry      task_carry not null default 'none',
  days       smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index on tasks (tenant_id, child_id);

create table goals (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  child_id         uuid not null references children(id) on delete cascade,
  icon             text not null default '🎁',
  name             text not null,
  price            int  not null default 0,
  status           goal_status not null default 'active',
  repeatable_daily boolean not null default false,
  created_at       timestamptz not null default now()
);
create index on goals (tenant_id, child_id);

create table completions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  child_id   uuid not null references children(id) on delete cascade,
  task_id    uuid not null references tasks(id) on delete cascade,
  date       date not null,
  ts         timestamptz not null default now(),
  amount     int  not null,
  status     completion_status not null default 'done',
  manual     boolean not null default false
);
create index on completions (tenant_id, child_id, date);
create index on completions (task_id, date);

create table ledger (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  child_id   uuid not null references children(id) on delete cascade,
  ts         timestamptz not null default now(),
  type       ledger_type not null,
  amount     int  not null,
  note       text not null default ''
);
create index on ledger (tenant_id, child_id, ts desc);

-- Idempotency markers: redeemed goals + applied penalties per (tenant, key).
create table applied (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  key        text not null,
  applied_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

create table snoozes (
  tenant_id     uuid not null references tenants(id) on delete cascade,
  task_id       uuid not null references tasks(id) on delete cascade,
  date          date not null,
  snooze_until  timestamptz not null,
  primary key (tenant_id, task_id, date)
);

create table announcements (
  id           uuid primary key default gen_random_uuid(),
  message      text not null,
  active_from  timestamptz not null default now(),
  active_until timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table announcement_dismissals (
  tenant_id       uuid not null references tenants(id) on delete cascade,
  announcement_id uuid not null references announcements(id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  primary key (tenant_id, announcement_id)
);

create table audit_log (
  id             bigserial primary key,
  actor_user_id  uuid references auth.users(id) on delete set null,
  tenant_id      uuid references tenants(id) on delete set null,
  action         text not null,
  target         text,
  meta           jsonb not null default '{}'::jsonb,
  ts             timestamptz not null default now()
);
create index on audit_log (ts desc);
create index on audit_log (tenant_id, ts desc);

-- On new auth user, mirror a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
