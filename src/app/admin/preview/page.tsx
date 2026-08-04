import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";

export default async function AdminPreviewPage() {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (!tenantId) redirect("/admin");

  const supabase = await createClient();
  const [{ data: tenant }, { data: children }, { data: tasks }, { data: goals }, { data: members }] = await Promise.all([
    supabase.from("tenants").select("id, name, status, plan, created_at").eq("id", tenantId).maybeSingle(),
    supabase.from("children").select("id, name, av, balance").eq("tenant_id", tenantId),
    supabase.from("tasks").select("id, en, win, amount, active").eq("tenant_id", tenantId),
    supabase.from("goals").select("id, name, price, status").eq("tenant_id", tenantId),
    supabase.from("tenant_members").select("role, user_id").eq("tenant_id", tenantId),
  ]);

  if (!tenant) return <main><h1>Tenant not found</h1></main>;

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <section style={{ background: "#fff3d6", border: "1px solid #f3d38a", borderRadius: 22, padding: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <strong>Preview mode</strong>
          <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>{tenant.name}</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/admin/tenants/${tenant.id}`}>Back to tenant</Link>
          <Link href="/admin/preview/stop">End preview</Link>
        </div>
      </section>

      <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 16 }}>
          <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>Status</div>
          <strong>{tenant.status}</strong>
        </article>
        <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 16 }}>
          <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>Plan</div>
          <strong>{tenant.plan}</strong>
        </article>
        <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 16 }}>
          <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>Members</div>
          <strong>{members?.length ?? 0}</strong>
        </article>
        <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 16 }}>
          <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>Children</div>
          <strong>{children?.length ?? 0}</strong>
        </article>
        <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 16 }}>
          <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>Tasks</div>
          <strong>{tasks?.length ?? 0}</strong>
        </article>
        <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 16 }}>
          <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>Goals</div>
          <strong>{goals?.length ?? 0}</strong>
        </article>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Children</h2>
        {(children ?? []).map((child) => (
          <article key={child.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <strong>{child.name}</strong>
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>{child.av}</div>
            </div>
            <div className="pill">R{child.balance}</div>
          </article>
        ))}
        {!(children ?? []).length && <p style={{ color: "var(--ink-soft)" }}>No children found.</p>}
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Tasks</h2>
        {(tasks ?? []).map((task) => (
          <article key={task.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <strong>{task.en}</strong>
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>{task.win}</div>
            </div>
            <div className="pill">R{task.amount}</div>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Goals</h2>
        {(goals ?? []).map((goal) => (
          <article key={goal.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <strong>{goal.name}</strong>
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>{goal.status}</div>
            </div>
            <div className="pill">R{goal.price}</div>
          </article>
        ))}
      </section>
    </main>
  );
}