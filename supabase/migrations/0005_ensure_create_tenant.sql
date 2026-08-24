-- 0005_ensure_create_tenant.sql — make the family creation RPC available even if
-- the earlier RPC migration was skipped or the schema cache is stale.

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

grant execute on function public.create_tenant(text) to authenticated;
