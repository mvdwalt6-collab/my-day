import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type AnnouncementRow = {
  id: string;
  message: string;
  active_from: string;
  active_until: string | null;
  created_at: string;
};

function toInputValue(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 16);
}

async function saveAnnouncement(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const activeFrom = String(formData.get("active_from") ?? "").trim() || new Date().toISOString();
  const activeUntil = String(formData.get("active_until") ?? "").trim() || null;

  if (!message) throw new Error("Announcement message is required.");

  const payload = {
    message,
    active_from: activeFrom,
    active_until: activeUntil,
  };

  const { error } = id
    ? await supabase.from("announcements").update(payload).eq("id", id)
    : await supabase.from("announcements").insert(payload);
  if (error) throw error;

  await supabase.from("audit_log").insert({
    action: id ? "admin.announcement.update" : "admin.announcement.create",
    target: id || message.slice(0, 40),
    meta: { message },
  });

  revalidatePath("/admin/announcements");
  revalidatePath("/admin");
}

async function deleteAnnouncement(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw error;

  await supabase.from("audit_log").insert({
    action: "admin.announcement.delete",
    target: id,
  });

  revalidatePath("/admin/announcements");
  revalidatePath("/admin");
}

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();
  const { data: announcements, error } = await supabase
    .from("announcements")
    .select("id, message, active_from, active_until, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    <main style={{ display: "grid", gap: 18 }}>
      <section style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Announcements</h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          Create messages that can be shown to families across the platform.
        </p>
      </section>

      <section style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 24, padding: 18, display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0 }}>New announcement</h2>
        <form action={saveAnnouncement} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Message</span>
            <textarea name="message" rows={4} placeholder="Family notices, maintenance, releases..." style={{ padding: 12, borderRadius: 14, border: "1px solid var(--line)", font: "inherit" }} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Active from</span>
              <input type="datetime-local" name="active_from" defaultValue={new Date().toISOString().slice(0, 16)} style={{ padding: 10, borderRadius: 12, border: "1px solid var(--line)" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Active until</span>
              <input type="datetime-local" name="active_until" style={{ padding: 10, borderRadius: 12, border: "1px solid var(--line)" }} />
            </label>
          </div>
          <div>
            <button type="submit">Create announcement</button>
          </div>
        </form>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Existing announcements</h2>
          <span style={{ color: "var(--ink-soft)" }}>{announcements?.length ?? 0} total</span>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {(announcements ?? []).map((announcement: AnnouncementRow) => (
            <article key={announcement.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 22, padding: 16, display: "grid", gap: 12 }}>
              <form action={saveAnnouncement} style={{ display: "grid", gap: 12 }}>
                <input type="hidden" name="id" value={announcement.id} />
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Message</span>
                  <textarea name="message" rows={3} defaultValue={announcement.message} style={{ padding: 12, borderRadius: 14, border: "1px solid var(--line)", font: "inherit" }} />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Active from</span>
                    <input type="datetime-local" name="active_from" defaultValue={toInputValue(announcement.active_from)} style={{ padding: 10, borderRadius: 12, border: "1px solid var(--line)" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Active until</span>
                    <input type="datetime-local" name="active_until" defaultValue={toInputValue(announcement.active_until)} style={{ padding: 10, borderRadius: 12, border: "1px solid var(--line)" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit">Save</button>
                </div>
              </form>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                <div style={{ color: "var(--ink-soft)", fontSize: 13 }}>
                  Created {new Date(announcement.created_at).toLocaleString()}
                </div>
                <form action={deleteAnnouncement}>
                  <input type="hidden" name="id" value={announcement.id} />
                  <button type="submit" style={{ background: "var(--bad)", color: "#fff" }}>Delete</button>
                </form>
              </div>
            </article>
          ))}

          {!(announcements ?? []).length && <p style={{ color: "var(--ink-soft)" }}>No announcements yet.</p>}
        </div>
      </section>
    </main>
  );
}