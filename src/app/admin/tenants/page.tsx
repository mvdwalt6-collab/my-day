import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

type SearchParams = { q?: string; status?: string };

export default async function AdminTenantsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const supabase = await createClient();
  const resolved = (await searchParams) ?? {};
  const query = (resolved.q ?? "").trim().toLowerCase();
  const status = (resolved.status ?? "").trim();

  let dbQuery = supabase.from("tenants").select("id, name, status, plan, created_at, deleted_at").order("created_at", { ascending: false });
  if (status) dbQuery = dbQuery.eq("status", status);
  const { data: tenants, error } = await dbQuery;
  if (error) throw error;

  const filtered = (tenants ?? []).filter((tenant) => !query || `${tenant.name} ${tenant.id}`.toLowerCase().includes(query));

  return (
    <main style={{ display: "grid", gap: 16 }}>
      <section style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Families</h1>
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>Search, inspect, and manage family tenants.</p>
        </div>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input name="q" defaultValue={resolved.q ?? ""} placeholder="Search family or id" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)" }} />
          <select name="status" defaultValue={resolved.status ?? ""} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
          <button type="submit">Filter</button>
        </form>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        {(filtered ?? []).map((tenant) => (
          <Link key={tenant.id} href={`/admin/tenants/${tenant.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, padding: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <strong>{tenant.name}</strong>
                <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>{tenant.id}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="pill">{tenant.status}</span>
                <span className="pill">{tenant.plan}</span>
              </div>
            </article>
          </Link>
        ))}
        {!filtered.length && <p style={{ color: "var(--ink-soft)" }}>No families found.</p>}
      </section>
    </main>
  );
}