import { revalidatePath } from "next/cache";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ tenantId: string }> };

async function setTenantStatus(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const tenantId = String(formData.get("tenantId") ?? "");
  const status = String(formData.get("status") ?? "active");
  const { error } = await supabase.rpc("admin_set_tenant_status", {
    p_tenant: tenantId,
    p_status: status,
  });
  if (error) throw error;
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/tenants");
  revalidatePath("/admin");
}

async function setTenantPlan(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const tenantId = String(formData.get("tenantId") ?? "");
  const plan = String(formData.get("plan") ?? "trial");
  const { error } = await supabase.rpc("admin_set_tenant_plan", {
    p_tenant: tenantId,
    p_plan: plan,
  });
  if (error) throw error;
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/tenants");
  revalidatePath("/admin");
}

async function startPreview(formData: FormData) {
  "use server";

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) throw new Error("Missing tenant id.");

  cookieStore.set("myday.imp_tenant", tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/admin");
}

export default async function AdminTenantDetailPage({ params }: PageProps) {
  const { tenantId } = await params;
  const supabase = await createClient();

  const [{ data: tenant, error: tenantError }, { data: members }, { data: children }, { data: tasks }, { data: goals }, { data: logs }] = await Promise.all([
    supabase.from("tenants").select("id, name, status, plan, created_at, deleted_at").eq("id", tenantId).maybeSingle(),
    supabase.from("tenant_members").select("user_id, role, created_at").eq("tenant_id", tenantId),
    supabase.from("children").select("id").eq("tenant_id", tenantId),
    supabase.from("tasks").select("id").eq("tenant_id", tenantId),
    supabase.from("goals").select("id").eq("tenant_id", tenantId),
    supabase.from("audit_log").select("id, action, target, ts, meta").eq("tenant_id", tenantId).order("ts", { ascending: false }).limit(20),
  ]);

  if (tenantError) throw tenantError;
  if (!tenant) return <main><h1>Tenant not found</h1></main>;

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <section style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 24, padding: 18, display: "grid", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{tenant.name}</h1>
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>{tenant.id}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill">Status: {tenant.status}</span>
          <span className="pill">Plan: {tenant.plan}</span>
          <span className="pill">Members: {members?.length ?? 0}</span>
          <span className="pill">Children: {children?.length ?? 0}</span>
          <span className="pill">Tasks: {tasks?.length ?? 0}</span>
          <span className="pill">Goals: {goals?.length ?? 0}</span>
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <form action={setTenantStatus} style={{ display: "grid", gap: 10, border: "1px solid var(--line)", borderRadius: 18, padding: 14 }}>
            <strong>Tenant status</strong>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <select name="status" defaultValue={tenant.status} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="deleted">deleted</option>
            </select>
            <button type="submit">Save status</button>
          </form>

          <form action={setTenantPlan} style={{ display: "grid", gap: 10, border: "1px solid var(--line)", borderRadius: 18, padding: 14 }}>
            <strong>Plan status</strong>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <select name="plan" defaultValue={tenant.plan} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
              <option value="trial">trial</option>
              <option value="active">active</option>
              <option value="expired">expired</option>
            </select>
            <button type="submit">Save plan</button>
          </form>

          <form action={startPreview} style={{ display: "grid", gap: 10, border: "1px solid var(--line)", borderRadius: 18, padding: 14 }}>
            <strong>Read-only preview</strong>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13 }}>Open the family in preview mode without enabling writes.</p>
            <button type="submit">Start preview</button>
            <Link href="/admin/preview">Go to preview</Link>
          </form>
        </div>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Audit log</h2>
        {(logs ?? []).map((row) => (
          <article key={row.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <strong>{row.action}</strong>
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>{row.target ?? "-"}</div>
            </div>
            <time style={{ color: "var(--ink-soft)", fontSize: 13 }}>{new Date(row.ts).toLocaleString()}</time>
          </article>
        ))}
        {!(logs ?? []).length && <p style={{ color: "var(--ink-soft)" }}>No audit rows for this tenant.</p>}
      </section>
    </main>
  );
}