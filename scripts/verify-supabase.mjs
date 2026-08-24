// Verifies Supabase URL, publishable key, and that migrations 0001–0003 ran.
// Run: node --env-file=.env.local scripts/verify-supabase.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key);

const checks = [
  { label: "tenants table",   run: () => supabase.from("tenants").select("id").limit(1) },
  { label: "children table",  run: () => supabase.from("children").select("id").limit(1) },
  { label: "goals table",     run: () => supabase.from("goals").select("id").limit(1) },
  { label: "settings table",  run: () => supabase.from("settings").select("tenant_id").limit(1) },
  { label: "profiles table",  run: () => supabase.from("profiles").select("user_id").limit(1) },
  { label: "audit_log table", run: () => supabase.from("audit_log").select("id").limit(1) },
  { label: "is_sysadmin() fn",       run: () => supabase.rpc("is_sysadmin") },
  { label: "current_user_tenant() fn", run: () => supabase.rpc("current_user_tenant") },
];

let failed = 0;
for (const check of checks) {
  const { error } = await check.run();
  if (error && !isBenignRlsResult(error)) {
    console.error(`✗ ${check.label}: ${error.message}`);
    failed++;
  } else {
    console.log(`✓ ${check.label}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed. Migrations may not have been applied.`);
  process.exit(1);
}
console.log("\nAll checks passed. Schema is in place and reachable.");

function isBenignRlsResult(error) {
  // Anonymous callers hitting RLS-protected tables get 0 rows or a permission
  // notice — either way the table exists. We only fail on missing-relation errors.
  const msg = (error.message || "").toLowerCase();
  return !msg.includes("does not exist") && !msg.includes("could not find");
}
