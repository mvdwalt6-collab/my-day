-- 0004_seed_admin.sql — bootstrap the first system administrator.
--
-- Run this ONCE against production after the first sysadmin has signed up.
-- Replace the email below and execute in the Supabase SQL editor.

-- update public.profiles
--    set is_sysadmin = true
--  where user_id = (select id from auth.users where email = 'you@example.com');
