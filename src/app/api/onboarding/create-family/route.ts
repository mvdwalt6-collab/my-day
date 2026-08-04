import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type Body = {
  familyName?: string;
  importSnapshot?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, message: "Please sign in first." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const familyName = String(body.familyName ?? "").trim() || "My family";
  const importSnapshot = body.importSnapshot;

  const admin = createServiceRoleClient();

  const { data: existingMembership, error: existingError } = await admin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, message: existingError.message }, { status: 500 });
  }

  if (existingMembership?.tenant_id) {
    return NextResponse.json({ ok: false, message: "You already have a family space." }, { status: 400 });
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ name: familyName })
    .select("id")
    .single();

  if (tenantError) {
    return NextResponse.json({ ok: false, message: tenantError.message }, { status: 500 });
  }

  const tenantId = tenant.id as string;

  const [{ error: memberError }, { error: settingsError }, { error: auditError }] = await Promise.all([
    admin.from("tenant_members").insert({ tenant_id: tenantId, user_id: user.id, role: "owner" }),
    admin.from("settings").insert({ tenant_id: tenantId }),
    admin.from("audit_log").insert({
      actor_user_id: user.id,
      tenant_id: tenantId,
      action: "tenant.created",
      target: tenantId,
    }),
  ]);

  if (memberError || settingsError || auditError) {
    return NextResponse.json(
      {
        ok: false,
        message: memberError?.message ?? settingsError?.message ?? auditError?.message ?? "We could not finish setting up your family.",
      },
      { status: 500 },
    );
  }

  let warning: string | null = null;

  if (importSnapshot) {
    const { error: importError } = await admin.rpc("import_snapshot", {
      p_tenant_id: tenantId,
      p_payload: importSnapshot,
    });

    if (importError) {
      warning = "Family created, but the old-device import could not be finished yet.";
    }
  }

  return NextResponse.json({ ok: true, tenantId, warning });
}
