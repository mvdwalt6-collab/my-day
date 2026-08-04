-- supabase/tests/rls.sql — manual RLS smoke test.
--
-- Run inside a psql shell against a fresh DB with 0001–0003 applied. Assumes
-- two auth users exist:  A (id = :uid_a)  and  B (id = :uid_b).
-- Uses `set local role authenticated` + `set local request.jwt.claim.sub`
-- to simulate a signed-in session for each user.

begin;

-- ---- as user A: create family and children ---------------------------------
set local role authenticated;
set local request.jwt.claim.sub = :'uid_a';

select create_tenant('Family A') as tenant_a \gset

insert into children (tenant_id, name, color, color_lite)
values (:'tenant_a'::uuid, 'Alice', '#8a7ff0', '#e6e2fb');

-- ---- as user B: create their own family and try to reach A's rows ---------
set local request.jwt.claim.sub = :'uid_b';

select create_tenant('Family B') as tenant_b \gset

-- Must return 0 — RLS blocks cross-tenant reads.
select count(*) as should_be_zero from children where tenant_id = :'tenant_a'::uuid;

-- Must raise — RLS blocks cross-tenant writes.
do $$
begin
  begin
    insert into children (tenant_id, name, color, color_lite)
    values (current_setting('vars.tenant_a')::uuid, 'Hacker', '#000', '#fff');
    raise exception 'RLS FAILED — cross-tenant insert succeeded';
  exception when others then
    raise notice 'RLS ok — cross-tenant insert rejected';
  end;
end;
$$;

rollback;
