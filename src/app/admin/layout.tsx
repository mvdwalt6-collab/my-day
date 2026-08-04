import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const impersonatedTenant = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_sysadmin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || !(profile as { is_sysadmin: boolean }).is_sysadmin) redirect("/");

  return (
    <div style={{ padding: 24 }}>
      {impersonatedTenant && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 16, background: "#fff3d6", border: "1px solid #f3d38a", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong>Preview mode active</strong>
          <span style={{ color: "var(--ink-soft)" }}>{impersonatedTenant}</span>
          <a href="/admin/preview">Open preview</a>
          <a href="/admin/preview/stop">End preview</a>
        </div>
      )}
      <header style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
        <strong>My Day — System admin</strong>
        <nav style={{ display: "flex", gap: 12, fontSize: 14 }}>
          <a href="/admin">Dashboard</a>
          <a href="/admin/tenants">Families</a>
          <a href="/admin/announcements">Announcements</a>
          <a href="/admin/users">Users</a>
          <a href="/admin/audit">Audit log</a>
        </nav>
        <form action="/auth/signout" method="post" style={{ marginLeft: "auto" }}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}
