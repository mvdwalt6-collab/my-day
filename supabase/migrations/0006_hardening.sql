-- 0006_hardening.sql — go-live hardening.
--
-- 1. One family per user, enforced at the DB level (closes onboarding race).
-- 2. Audit log inserts must carry the caller's own identity (no forged actors).
--    SECURITY DEFINER RPCs bypass RLS and are unaffected.
-- 3. Announcements are for signed-in families only, not anonymous visitors.

-- One membership per user (matches current_user_tenant() semantics).
create unique index if not exists tenant_members_one_family_per_user
  on public.tenant_members (user_id);

-- Audit log: replace permissive insert policy.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert with check (
    auth.uid() is not null
    and actor_user_id = auth.uid()
  );

-- Announcements: require an authenticated session to read.
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select using (auth.uid() is not null);
