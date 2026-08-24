import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

type SearchParams = { q?: string; tenant?: string };

type AuditRow = {
  id: number;
  action: string;
  target: string | null;
  tenant_id: string | null;
  ts: string;
};

export default async function AdminAuditPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const supabase = await createClient();
  const resolved = (await searchParams) ?? {};
  const query = (resolved.q ?? "").trim().toLowerCase();
  const tenant = (resolved.tenant ?? "").trim();

  let dbQuery = supabase
    .from("audit_log")
    .select("id, action, target, tenant_id, ts")
    .order("ts", { ascending: false })
    .limit(200);

  if (tenant) dbQuery = dbQuery.eq("tenant_id", tenant);

  const { data: rows, error } = await dbQuery;
  if (error) throw error;

  const filtered = (rows ?? []).filter((row: AuditRow) => {
    if (!query) return true;
    return `${row.action} ${row.target ?? ""} ${row.tenant_id ?? ""}`.toLowerCase().includes(query);
  });

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <section style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Audit log</h1>
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>Sysadmin event history across the platform.</p>
        </div>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input name="q" defaultValue={resolved.q ?? ""} placeholder="Search action or tenant" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)" }} />
          <input name="tenant" defaultValue={resolved.tenant ?? ""} placeholder="Tenant id" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)" }} />
          <button type="submit">Filter</button>
        </form>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        {(filtered ?? []).map((row: AuditRow) => (
          <article key={row.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, padding: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <strong>{row.action}</strong>
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                {row.target ?? "-"}
              </div>
              {row.tenant_id && (
                <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                  <Link href={`/admin/tenants/${row.tenant_id}`}>{row.tenant_id}</Link>
                </div>
              )}
            </div>
            <time style={{ color: "var(--ink-soft)", fontSize: 13 }}>{new Date(row.ts).toLocaleString()}</time>
          </article>
        ))}
        {!filtered.length && <p style={{ color: "var(--ink-soft)" }}>No audit rows matched your filters.</p>}
      </section>
    </main>
  );
}