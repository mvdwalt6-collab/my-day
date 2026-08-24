// End-to-end RLS/security test against the live Supabase project.
// Creates two throwaway users + families, probes isolation, then cleans up.
// Run: node --env-file=.env.local scripts/test-rls.mjs

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function testClient(extraHeaders) {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(extraHeaders ? { global: { headers: extraHeaders } } : {}),
  });
}

async function makeUser(label) {
  const email = `rls-test-${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = crypto.randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  return { id: data.user.id, email, password };
}

async function signIn(user) {
  const client = testClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`signIn ${user.email}: ${error.message}`);
  return client;
}

const cleanup = { users: [], tenants: [] };

try {
  const userA = await makeUser("a");
  const userB = await makeUser("b");
  cleanup.users.push(userA.id, userB.id);

  const clientA = await signIn(userA);
  const clientB = await signIn(userB);

  // -- family creation ---------------------------------------------------------
  const { data: tenantA, error: createAErr } = await clientA.rpc("create_tenant", { p_name: "RLS Test A" });
  record("user A creates family", !createAErr, createAErr?.message);
  if (createAErr) throw new Error("cannot continue without tenant A");
  cleanup.tenants.push(tenantA);

  const { data: tenantB, error: createBErr } = await clientB.rpc("create_tenant", { p_name: "RLS Test B" });
  record("user B creates family", !createBErr, createBErr?.message);
  if (createBErr) throw new Error("cannot continue without tenant B");
  cleanup.tenants.push(tenantB);

  // -- one family per user (migration 0006) ------------------------------------
  const { error: dupErr } = await clientB.rpc("create_tenant", { p_name: "RLS Test B2" });
  record("second family for same user is rejected", !!dupErr, dupErr ? dupErr.message : "second create_tenant succeeded");

  // -- cross-tenant isolation ---------------------------------------------------
  const { error: childAErr } = await clientA.from("children").insert({
    tenant_id: tenantA, name: "Alice", color: "#8a7ff0", color_lite: "#e6e2fb",
  });
  record("user A inserts child in own family", !childAErr, childAErr?.message);

  const { data: crossRead } = await clientB.from("children").select("id").eq("tenant_id", tenantA);
  record("user B cannot read A's children", (crossRead ?? []).length === 0, `rows: ${(crossRead ?? []).length}`);

  const { error: crossWriteErr } = await clientB.from("children").insert({
    tenant_id: tenantA, name: "Hacker", color: "#000", color_lite: "#fff",
  });
  record("user B cannot write into A's family", !!crossWriteErr, crossWriteErr ? "rejected" : "insert succeeded");

  // -- audit log integrity (migration 0006) -------------------------------------
  const { error: selfAuditErr } = await clientB.from("audit_log").insert({
    actor_user_id: userB.id, action: "rls-test.self", target: "ok",
  });
  record("self-attributed audit insert allowed", !selfAuditErr, selfAuditErr?.message);

  const { error: forgedAuditErr } = await clientB.from("audit_log").insert({
    actor_user_id: userA.id, action: "rls-test.forged", target: "bad",
  });
  record("forged-actor audit insert rejected", !!forgedAuditErr, forgedAuditErr ? "rejected" : "insert succeeded");

  // -- impersonation is read-only ------------------------------------------------
  const impClient = testClient({ "x-imp-tenant": tenantB });
  const { error: impSignInErr } = await impClient.auth.signInWithPassword({ email: userB.email, password: userB.password });
  if (impSignInErr) throw new Error(`impersonation sign-in: ${impSignInErr.message}`);

  const { data: impRead, error: impReadErr } = await impClient.from("children").select("id").eq("tenant_id", tenantB);
  record("reads still work while impersonating", !impReadErr, impReadErr?.message ?? `rows: ${(impRead ?? []).length}`);

  const { error: impWriteErr } = await impClient.from("children").insert({
    tenant_id: tenantB, name: "Ghost", color: "#000", color_lite: "#fff",
  });
  record("direct writes blocked while impersonating", !!impWriteErr, impWriteErr ? "rejected" : "insert succeeded");

  const { data: impRpcData, error: impRpcErr } = await impClient.rpc("complete_task", {
    p_child: crypto.randomUUID(), p_task: crypto.randomUUID(), p_at: new Date().toISOString(),
  });
  const impRpcBlocked = !!impRpcErr || impRpcData?.ok === false;
  record("RPC writes blocked while impersonating", impRpcBlocked, impRpcErr?.message ?? JSON.stringify(impRpcData));
} catch (error) {
  console.error(`\nAborted: ${error.message}`);
} finally {
  for (const tenantId of cleanup.tenants) {
    const { error } = await admin.from("tenants").delete().eq("id", tenantId);
    if (error) console.error(`cleanup tenant ${tenantId}: ${error.message}`);
  }
  for (const userId of cleanup.users) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`cleanup user ${userId}: ${error.message}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.error("Failing checks (apply supabase/migrations/0006_hardening.sql if audit/duplicate checks fail):");
  failed.forEach((f) => console.error(`  ✗ ${f.name}`));
  process.exit(1);
}
