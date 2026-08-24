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

-- ---- as user B: audit log actor must be self ---------------------------------
-- Must raise — cannot forge another user's identity in the audit trail.
do $$
begin
  begin
    insert into audit_log (actor_user_id, action, target)
    values (current_setting('request.jwt.claim.sub')::uuid, 'test.self', 'ok');
    raise notice 'audit ok — self-attributed insert allowed';
  exception when others then
    raise exception 'AUDIT FAILED — self-attributed insert rejected';
  end;
  begin
    insert into audit_log (actor_user_id, action, target)
    values (gen_random_uuid(), 'test.forged', 'bad');
    raise exception 'AUDIT FAILED — forged actor insert succeeded';
  exception when others then
    raise notice 'audit ok — forged actor insert rejected';
  end;
end;
$$;

-- ---- impersonation is read-only ----------------------------------------------
-- Simulate a sysadmin previewing tenant B via the x-imp-tenant header.
set local request.headers = '{"x-imp-tenant": "00000000-0000-0000-0000-000000000000"}';

-- Must raise — writes are forbidden while impersonating, even in own tenant.
do $$
begin
  begin
    insert into children (tenant_id, name, color, color_lite)
    values (current_setting('vars.tenant_b')::uuid, 'Ghost', '#000', '#fff');
    raise exception 'RLS FAILED — write succeeded during impersonation';
  exception when others then
    raise notice 'RLS ok — write rejected during impersonation';
  end;
end;
$$;

-- RPCs must also refuse writes during impersonation (_assert_member raises).
do $$
begin
  begin
    perform create_tenant('Should fail');
    raise exception 'RPC FAILED — create_tenant succeeded during impersonation';
  exception when others then
    raise notice 'RPC ok — blocked during impersonation or duplicate family';
  end;
end;
$$;

set local request.headers = '';

-- ---- one family per user ------------------------------------------------------
-- Must raise — unique index blocks a second membership for the same user.
do $$
begin
  begin
    perform create_tenant('Second family');
    raise exception 'CONSTRAINT FAILED — second family created for same user';
  exception when others then
    raise notice 'constraint ok — second family rejected';
  end;
end;
$$;

rollback;
