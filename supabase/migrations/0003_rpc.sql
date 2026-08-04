-- 0003_rpc.sql — SECURITY DEFINER functions the client and admin panel call.
--
-- Every RPC that mutates a tenant checks:
--   * the caller belongs to the target tenant (unless is_sysadmin() AND action is admin),
--   * NOT is_impersonating() (impersonation is read-only).
--
-- Rules (mirrors legacy/core.js):
--   * A day boundary is 04:00 local; date is the caller's civil date shifted back
--     if hour < 4. We accept a client-supplied `at timestamptz` so the caller's
--     clock determines "today".

------------------------------------------------------------------------------
-- helpers
------------------------------------------------------------------------------

create or replace function public._logical_date(at timestamptz)
returns date
language sql
immutable
as $$
  select case
    when extract(hour from at at time zone 'UTC') < 4
      then (at at time zone 'UTC')::date - 1
    else (at at time zone 'UTC')::date
  end;
$$;

create or replace function public._assert_member(p_tenant uuid)
returns void
language plpgsql
as $$
begin
  if public.is_impersonating() then
    raise exception 'write-forbidden-during-impersonation' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant and user_id = auth.uid()
  ) then
    raise exception 'not-a-member' using errcode = '42501';
  end if;
end;
$$;

------------------------------------------------------------------------------
-- tenant lifecycle
------------------------------------------------------------------------------

create or replace function public.create_tenant(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'not-authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.tenant_members where user_id = auth.uid()) then
    raise exception 'already-in-family' using errcode = '42501';
  end if;

  insert into public.tenants (name) values (coalesce(nullif(p_name, ''), 'My family'))
  returning id into v_tenant;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant, auth.uid(), 'owner');

  insert into public.settings (tenant_id) values (v_tenant);

  insert into public.audit_log (actor_user_id, tenant_id, action, target)
  values (auth.uid(), v_tenant, 'tenant.created', v_tenant::text);

  return v_tenant;
end;
$$;

------------------------------------------------------------------------------
-- import from legacy localStorage blob (myday.v1)
------------------------------------------------------------------------------

create or replace function public.import_snapshot(p_tenant_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb := coalesce(p_payload->'settings', '{}'::jsonb);
  v_child    jsonb;
  v_task     jsonb;
  v_goal     jsonb;
  v_compl    jsonb;
  v_ledger   jsonb;
  v_map      jsonb := '{}'::jsonb;
  v_new_id   uuid;
  v_old_id   text;
  v_gnew     uuid;
  v_gold     text;
  v_tnew     uuid;
  v_told     text;
begin
  perform public._assert_member(p_tenant_id);

  update public.settings set
    day_start         = coalesce((v_settings->>'dayStart')::smallint, day_start),
    weekly_summary    = coalesce((v_settings->>'weeklySummary')::boolean, weekly_summary),
    hold_ms           = coalesce((v_settings->>'holdMs')::int, hold_ms),
    alarm_lead_min    = coalesce((v_settings->>'alarmLeadMin')::smallint, alarm_lead_min),
    alarm_ring_sec    = coalesce((v_settings->>'alarmRingSec')::smallint, alarm_ring_sec),
    snooze_min        = coalesce((v_settings->>'snoozeMin')::smallint, snooze_min),
    screen_time_start = coalesce(v_settings->>'screenTimeStart', screen_time_start),
    screen_time_end   = coalesce(v_settings->>'screenTimeEnd', screen_time_end),
    weather_enabled   = coalesce((v_settings->>'weatherEnabled')::boolean, weather_enabled),
    kid_lang          = coalesce(p_payload->>'kidLang', kid_lang)
  where tenant_id = p_tenant_id;

  for v_child in select * from jsonb_array_elements(coalesce(p_payload->'children', '[]'::jsonb)) loop
    v_old_id := v_child->>'id';
    insert into public.children (tenant_id, name, av, color, color_lite, balance)
    values (
      p_tenant_id,
      coalesce(v_child->>'name', 'Child'),
      coalesce(v_child->>'av', '🙂'),
      coalesce(v_child->>'color', '#8a7ff0'),
      coalesce(v_child->>'colorLite', '#e6e2fb'),
      coalesce((v_child->>'balance')::int, 0)
    )
    returning id into v_new_id;
    v_map := jsonb_set(v_map, array['c', v_old_id], to_jsonb(v_new_id::text));
  end loop;

  for v_task in select * from jsonb_array_elements(coalesce(p_payload->'tasks', '[]'::jsonb)) loop
    v_told := v_task->>'id';
    if not (v_map ? 'c') or not ((v_map->'c') ? (v_task->>'childId')) then continue; end if;
    insert into public.tasks (
      tenant_id, child_id, icon, en, af, win, "time", amount, alarm, mute, penalty, carry, days, active
    ) values (
      p_tenant_id,
      ((v_map->'c'->>(v_task->>'childId'))::uuid),
      coalesce(v_task->>'icon', '🙂'),
      coalesce(v_task->>'en', ''),
      coalesce(v_task->>'af', ''),
      coalesce(v_task->>'win', 'Morning')::task_window,
      nullif(v_task->>'time', ''),
      coalesce((v_task->>'amount')::int, 0),
      coalesce((v_task->>'alarm')::boolean, false),
      coalesce((v_task->>'mute')::boolean, false),
      coalesce((v_task->>'penalty')::int, 0),
      coalesce(v_task->>'carry', 'none')::task_carry,
      coalesce(
        (select array_agg((x)::smallint) from jsonb_array_elements_text(v_task->'days') as x),
        array[0,1,2,3,4,5,6]::smallint[]
      ),
      coalesce((v_task->>'active')::boolean, true)
    )
    returning id into v_tnew;
    v_map := jsonb_set(v_map, array['t', v_told], to_jsonb(v_tnew::text));
  end loop;

  for v_goal in select * from jsonb_array_elements(coalesce(p_payload->'goals', '[]'::jsonb)) loop
    v_gold := v_goal->>'id';
    if not (v_map ? 'c') or not ((v_map->'c') ? (v_goal->>'childId')) then continue; end if;
    insert into public.goals (tenant_id, child_id, icon, name, price, status, repeatable_daily)
    values (
      p_tenant_id,
      ((v_map->'c'->>(v_goal->>'childId'))::uuid),
      coalesce(v_goal->>'icon', '🎁'),
      coalesce(v_goal->>'name', 'Goal'),
      coalesce((v_goal->>'price')::int, 0),
      coalesce(v_goal->>'status', 'active')::goal_status,
      coalesce((v_goal->>'repeatableDaily')::boolean, false)
    )
    returning id into v_gnew;
    v_map := jsonb_set(v_map, array['g', v_gold], to_jsonb(v_gnew::text));
  end loop;

  for v_compl in select * from jsonb_array_elements(coalesce(p_payload->'completions', '[]'::jsonb)) loop
    if not ((v_map->'c') ? (v_compl->>'childId')) then continue; end if;
    if not ((v_map->'t') ? (v_compl->>'taskId')) then continue; end if;
    insert into public.completions (tenant_id, child_id, task_id, date, ts, amount, status, manual)
    values (
      p_tenant_id,
      ((v_map->'c'->>(v_compl->>'childId'))::uuid),
      ((v_map->'t'->>(v_compl->>'taskId'))::uuid),
      (v_compl->>'date')::date,
      coalesce(to_timestamp(((v_compl->>'ts')::bigint) / 1000.0), now()),
      coalesce((v_compl->>'amount')::int, 0),
      coalesce(v_compl->>'status', 'done')::completion_status,
      coalesce((v_compl->>'manual')::boolean, false)
    );
  end loop;

  for v_ledger in select * from jsonb_array_elements(coalesce(p_payload->'ledger', '[]'::jsonb)) loop
    if not ((v_map->'c') ? (v_ledger->>'childId')) then continue; end if;
    insert into public.ledger (tenant_id, child_id, ts, type, amount, note)
    values (
      p_tenant_id,
      ((v_map->'c'->>(v_ledger->>'childId'))::uuid),
      coalesce(to_timestamp(((v_ledger->>'ts')::bigint) / 1000.0), now()),
      coalesce(v_ledger->>'type', 'earn')::ledger_type,
      coalesce((v_ledger->>'amount')::int, 0),
      coalesce(v_ledger->>'note', '')
    );
  end loop;

  insert into public.audit_log (actor_user_id, tenant_id, action, meta)
  values (auth.uid(), p_tenant_id, 'tenant.imported', jsonb_build_object('map', v_map));
end;
$$;

------------------------------------------------------------------------------
-- gameplay RPCs
------------------------------------------------------------------------------

create or replace function public.complete_task(p_child uuid, p_task uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_task   public.tasks%rowtype;
  v_date   date := public._logical_date(p_at);
  v_type   ledger_type;
begin
  select tenant_id into v_tenant from public.children where id = p_child;
  if v_tenant is null then return jsonb_build_object('ok', false, 'reason', 'no-child'); end if;
  perform public._assert_member(v_tenant);

  select * into v_task from public.tasks where id = p_task and tenant_id = v_tenant;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no-task'); end if;

  if exists (
    select 1 from public.completions
    where tenant_id = v_tenant and child_id = p_child and task_id = p_task
      and date = v_date and status = 'done'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'done');
  end if;

  insert into public.completions (tenant_id, child_id, task_id, date, ts, amount, status, manual)
  values (v_tenant, p_child, p_task, v_date, p_at, v_task.amount, 'done', false);

  v_type := case when v_task.win = 'Bonus' then 'bonus'::ledger_type else 'earn'::ledger_type end;
  insert into public.ledger (tenant_id, child_id, ts, type, amount, note)
  values (v_tenant, p_child, p_at, v_type, v_task.amount, v_task.en);

  update public.children set balance = balance + v_task.amount where id = p_child;

  return jsonb_build_object('ok', true, 'coins', v_task.amount);
end;
$$;

create or replace function public.undo_completion(p_completion uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_compl  public.completions%rowtype;
begin
  select * into v_compl from public.completions where id = p_completion;
  if not found then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  v_tenant := v_compl.tenant_id;
  perform public._assert_member(v_tenant);

  if v_compl.status = 'done' then
    insert into public.ledger (tenant_id, child_id, ts, type, amount, note)
    values (v_tenant, v_compl.child_id, now(), 'undo', -v_compl.amount, 'Undo');
    update public.children set balance = balance - v_compl.amount where id = v_compl.child_id;
  end if;

  delete from public.completions where id = p_completion;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dispute_completion(p_completion uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compl public.completions%rowtype;
begin
  select * into v_compl from public.completions where id = p_completion;
  if not found or v_compl.status <> 'done' then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  perform public._assert_member(v_compl.tenant_id);

  if v_compl.date <> public._logical_date(p_at) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  update public.completions set status = 'disputed' where id = p_completion;
  insert into public.ledger (tenant_id, child_id, ts, type, amount, note)
  values (v_compl.tenant_id, v_compl.child_id, now(), 'dispute', -v_compl.amount, 'Disputed');
  update public.children set balance = balance - v_compl.amount where id = v_compl.child_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.redeem_goal(p_child uuid, p_goal uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_goal    public.goals%rowtype;
  v_bal     int;
  v_key     text;
  v_date    date := public._logical_date(p_at);
begin
  select * into v_goal from public.goals where id = p_goal;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no-goal'); end if;
  v_tenant := v_goal.tenant_id;
  perform public._assert_member(v_tenant);

  v_key := 'goal:' || p_goal::text || ':' || v_date::text;
  if exists (select 1 from public.applied where tenant_id = v_tenant and key = v_key)
     and not v_goal.repeatable_daily then
    return jsonb_build_object('ok', false, 'reason', 'already-redeemed');
  end if;

  select balance into v_bal from public.children where id = p_child and tenant_id = v_tenant;
  if v_bal is null then return jsonb_build_object('ok', false, 'reason', 'no-child'); end if;
  if v_bal < v_goal.price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient-balance');
  end if;

  insert into public.ledger (tenant_id, child_id, ts, type, amount, note)
  values (v_tenant, p_child, p_at, 'spend', -v_goal.price, 'Redeemed: ' || v_goal.name);
  update public.children set balance = balance - v_goal.price where id = p_child;

  insert into public.applied (tenant_id, key) values (v_tenant, v_key)
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'coins', v_goal.price);
end;
$$;

create or replace function public.snooze_task(p_task uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_min    smallint;
begin
  select tenant_id into v_tenant from public.tasks where id = p_task;
  if v_tenant is null then return jsonb_build_object('ok', false, 'reason', 'no-task'); end if;
  perform public._assert_member(v_tenant);

  select snooze_min into v_min from public.settings where tenant_id = v_tenant;

  insert into public.snoozes (tenant_id, task_id, date, snooze_until)
  values (v_tenant, p_task, public._logical_date(p_at), p_at + make_interval(mins => coalesce(v_min, 5)))
  on conflict (tenant_id, task_id, date) do update
    set snooze_until = excluded.snooze_until;

  return jsonb_build_object('ok', true, 'mins', v_min);
end;
$$;

------------------------------------------------------------------------------
-- sysadmin RPCs
------------------------------------------------------------------------------

create or replace function public.admin_set_tenant_status(p_tenant uuid, p_status tenant_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_sysadmin() and not public.is_impersonating()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.tenants
     set status = p_status,
         deleted_at = case when p_status = 'deleted' then now() else null end
   where id = p_tenant;
  insert into public.audit_log (actor_user_id, tenant_id, action, target, meta)
  values (auth.uid(), p_tenant, 'admin.tenant.status', p_tenant::text, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_set_tenant_plan(p_tenant uuid, p_plan plan_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_sysadmin() and not public.is_impersonating()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.tenants set plan = p_plan where id = p_tenant;
  insert into public.audit_log (actor_user_id, tenant_id, action, target, meta)
  values (auth.uid(), p_tenant, 'admin.tenant.plan', p_tenant::text, jsonb_build_object('plan', p_plan));
end;
$$;

create or replace function public.admin_promote_sysadmin(p_email text, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if not (public.is_sysadmin() and not public.is_impersonating()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then raise exception 'no-such-user'; end if;
  update public.profiles set is_sysadmin = p_value where user_id = v_uid;
  insert into public.audit_log (actor_user_id, action, target, meta)
  values (auth.uid(), 'admin.sysadmin.set', v_uid::text, jsonb_build_object('value', p_value));
end;
$$;

------------------------------------------------------------------------------
-- grants
------------------------------------------------------------------------------

grant execute on function
  public.create_tenant(text),
  public.import_snapshot(uuid, jsonb),
  public.complete_task(uuid, uuid, timestamptz),
  public.undo_completion(uuid),
  public.dispute_completion(uuid, timestamptz),
  public.redeem_goal(uuid, uuid, timestamptz),
  public.snooze_task(uuid, timestamptz),
  public.admin_set_tenant_status(uuid, tenant_status),
  public.admin_set_tenant_plan(uuid, plan_status),
  public.admin_promote_sysadmin(text, boolean)
to authenticated;
