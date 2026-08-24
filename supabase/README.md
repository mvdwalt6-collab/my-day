# Supabase setup

## 1. Create the project

Sign in at [supabase.com](https://supabase.com), create a project (recommended
region for SA users: `eu-west-2` London), and copy the values from **Settings
→ API** into `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 2. Run migrations

In the Supabase SQL editor, run each file **in order**:

1. `migrations/0001_init.sql` — schema
2. `migrations/0002_rls.sql`  — row-level security
3. `migrations/0003_rpc.sql`  — RPCs (create_tenant, import_snapshot, gameplay, admin)
4. `migrations/0004_seed_admin.sql` — after you've signed up, uncomment and edit
   the SQL statement to promote yourself to `is_sysadmin = true`.
5. `migrations/0005_ensure_create_tenant.sql` — safe re-run if onboarding says
  the family setup function is missing.

## 3. Enable auth providers

Under **Authentication → Providers**:

- Email/password: on.
- Magic link: on (uses same email provider).
- Google: on. Add these redirect URIs in Supabase _and_ in the Google Cloud
  Console OAuth client:
  - `http://localhost:3000/auth/callback`
  - `https://<your-vercel-domain>/auth/callback`

## 4. Verify

Run `supabase/tests/rls.sql` in psql against a dev DB. All assertions must
raise "RLS ok" notices and the `should_be_zero` count must be `0`.
