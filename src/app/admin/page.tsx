import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

async function countRows(table: string, filter?: { column: string; value: string }) {
  const supabase = await createClient();
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const [
    tenants,
    activeTenants,
    suspendedTenants,
    deletedTenants,
    users,
    announcements,
    auditRows,
  ] = await Promise.all([
    countRows("tenants"),
    countRows("tenants", { column: "status", value: "active" }),
    countRows("tenants", { column: "status", value: "suspended" }),
    countRows("tenants", { column: "status", value: "deleted" }),
    countRows("profiles"),
    countRows("announcements"),
    countRows("audit_log"),
  ]);

  const { data: recentAudit } = await supabase
    .from("audit_log")
    .select("id, action, target, ts, tenant_id")
    .order("ts", { ascending: false })
    .limit(8);

  const summaryCards = [
    { label: "Families", value: tenants, href: "/admin/tenants" },
    { label: "Active", value: activeTenants, href: "/admin/tenants?status=active" },
    { label: "Suspended", value: suspendedTenants, href: "/admin/tenants?status=suspended" },
    { label: "Deleted", value: deletedTenants, href: "/admin/tenants?status=deleted" },
    { label: "Users", value: users, href: "/admin/users" },
    { label: "Announcements", value: announcements, href: "/admin/announcements" },
    { label: "Audit rows", value: auditRows, href: "/admin/audit" },
  ];

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <section style={{ display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          System overview and entry points for family operations.
        </p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {summaryCards.map((card) => (
          <Link key={card.label} href={card.href} style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 16, boxShadow: "var(--shadow-lo)" }}>
              <div style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>{card.label}</div>
              <strong style={{ fontSize: 28 }}>{card.value}</strong>
            </article>
          </Link>
        ))}
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Recent audit log</h2>
          <Link href="/admin/audit">View all</Link>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {(recentAudit ?? []).map((row) => (
            <article key={row.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <strong>{row.action}</strong>
                <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>{row.target ?? "-"}</div>
              </div>
              <time style={{ color: "var(--ink-soft)", fontSize: 13 }}>{new Date(row.ts).toLocaleString()}</time>
            </article>
          ))}
          {!(recentAudit ?? []).length && <p style={{ color: "var(--ink-soft)" }}>No audit entries yet.</p>}
        </div>
      </section>
    </main>
  );
}
