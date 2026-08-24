import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

type Body = {
  familyName?: string;
  importSnapshot?: unknown;
};

const MAX_FAMILY_NAME = 80;
const MAX_SNAPSHOT_BYTES = 512 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, message: "Please sign in first." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const familyName = String(body.familyName ?? "").trim().slice(0, MAX_FAMILY_NAME) || "My family";
  const importSnapshot = body.importSnapshot;

  if (importSnapshot !== undefined) {
    if (typeof importSnapshot !== "object" || importSnapshot === null || Array.isArray(importSnapshot)) {
      return NextResponse.json({ ok: false, message: "Invalid import data." }, { status: 400 });
    }
    if (JSON.stringify(importSnapshot).length > MAX_SNAPSHOT_BYTES) {
      return NextResponse.json({ ok: false, message: "Import data is too large." }, { status: 400 });
    }
  }

  // Transactional SECURITY DEFINER RPC: tenant + membership + settings + audit
  // entry in one transaction; rejects users who already have a family.
  const { data: tenantId, error: createError } = await supabase.rpc("create_tenant", {
    p_name: familyName,
  });

  if (createError) {
    const alreadyInFamily = createError.message.includes("already-in-family");
    return NextResponse.json(
      {
        ok: false,
        message: alreadyInFamily ? "You already have a family space." : createError.message,
      },
      { status: alreadyInFamily ? 400 : 500 },
    );
  }

  let warning: string | null = null;

  if (importSnapshot) {
    const { error: importError } = await supabase.rpc("import_snapshot", {
      p_tenant_id: tenantId,
      p_payload: importSnapshot,
    });

    if (importError) {
      warning = "Family created, but the old-device import could not be finished yet.";
    }
  }

  return NextResponse.json({ ok: true, tenantId, warning });
}
