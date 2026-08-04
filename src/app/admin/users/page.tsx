import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";

type SearchParams = { q?: string };

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  is_sysadmin: boolean;
  created_at: string;
};

type MembershipRow = {
  user_id: string;
  tenant_id: string;
  tenants?: { name: string | null }[] | null;
};

async function promoteSysadmin(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const value = String(formData.get("value") ?? "true") === "true";
  if (!email) throw new Error("Email is required.");

  const { error } = await supabase.rpc("admin_promote_sysadmin", {
    p_email: email,
    p_value: value,
  });
  if (error) throw error;

  await supabase.from("audit_log").insert({
    action: value ? "admin.sysadmin.promote" : "admin.sysadmin.demote",
    target: email,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

async function startPreview(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("User id is required.");

  const { data: membership, error } = await supabase
    .from("tenant_members")
    .select("tenant_id, tenants(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!membership?.tenant_id) throw new Error("No tenant membership found for this user.");

  await supabase.from("audit_log").insert({
    actor_user_id: user?.id ?? null,
    action: "admin.preview.start",
    tenant_id: membership.tenant_id,
    target: membership.tenant_id,
    meta: { user_id: userId },
  });

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, membership.tenant_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/preview");
  redirect("/admin/preview");
}

export default async function AdminUsersPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const supabase = await createClient();
  const resolved = (await searchParams) ?? {};
  const query = (resolved.q ?? "").trim().toLowerCase();

  const [{ data: profiles, error }, { count: sysadminCount }] = await Promise.all([
    supabase.from("profiles").select("user_id, display_name, is_sysadmin, created_at").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_sysadmin", true),
  ]);

  const { data: memberships } = await supabase
    .from("tenant_members")
    .select("user_id, tenant_id, tenants(name)")
    .in("user_id", (profiles ?? []).map((profile: ProfileRow) => profile.user_id));

  if (error) throw error;

  const filtered = (profiles ?? []).filter((profile: ProfileRow) => {
    if (!query) return true;
    return `${profile.display_name ?? ""} ${profile.user_id}`.toLowerCase().includes(query);
  });

  return (
    <main style={{ display: "grid", gap: 18 }}>
      <section style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Users</h1>
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>Search profiles and promote sysadmins by email.</p>
        </div>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input name="q" defaultValue={resolved.q ?? ""} placeholder="Search display name or user id" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)" }} />
          <button type="submit">Search</button>
        </form>
      </section>

      <section style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 24, padding: 18, display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0 }}>Sysadmin promotion</h2>
        <form action={promoteSysadmin} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Email address</span>
            <input name="email" type="email" placeholder="person@example.com" style={{ padding: 12, borderRadius: 14, border: "1px solid var(--line)" }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Value</span>
            <select name="value" defaultValue="true" style={{ padding: 12, borderRadius: 14, border: "1px solid var(--line)" }}>
              <option value="true">Promote</option>
              <option value="false">Demote</option>
            </select>
          </label>
          <button type="submit">Apply</button>
        </form>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          Current sysadmins: {sysadminCount ?? 0}
        </p>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        {(filtered ?? []).map((profile: ProfileRow) => (
          <article key={profile.user_id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 18, padding: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <strong>{profile.display_name ?? "Unnamed user"}</strong>
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>{profile.user_id}</div>
              <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                {((memberships ?? []).find((membership: MembershipRow) => membership.user_id === profile.user_id)?.tenants?.[0]?.name) ?? "No tenant membership"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="pill">{profile.is_sysadmin ? "sysadmin" : "user"}</span>
              <span className="pill">{new Date(profile.created_at).toLocaleDateString()}</span>
              <form action={startPreview}>
                <input type="hidden" name="userId" value={profile.user_id} />
                <button type="submit" disabled={!(memberships ?? []).some((membership: MembershipRow) => membership.user_id === profile.user_id)}>
                  Preview tenant
                </button>
              </form>
            </div>
          </article>
        ))}
        {!filtered.length && <p style={{ color: "var(--ink-soft)" }}>No users matched your search.</p>}
      </section>
    </main>
  );
}