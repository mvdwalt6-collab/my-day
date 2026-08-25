import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/pin";

type ChildInput = {
  name?: string;
  av?: string;
  color?: string;
  colorLite?: string;
};

type Body = {
  familyName?: string;
  importSnapshot?: unknown;
  children?: ChildInput[];
  pin?: string;
};

const MAX_FAMILY_NAME = 80;
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const MAX_CHILDREN = 8;

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

  // Skip wizard children when importing a snapshot — the import brings its own.
  const childrenInput = !importSnapshot && Array.isArray(body.children) ? body.children.slice(0, MAX_CHILDREN) : [];
  const childRows = childrenInput
    .map((child, index) => ({
      tenant_id: tenantId,
      name: String(child?.name ?? "").trim().slice(0, 40),
      av: String(child?.av ?? "\u{1F642}").slice(0, 8),
      color: String(child?.color ?? "#34c08a").slice(0, 16),
      color_lite: String(child?.colorLite ?? "#cdeede").slice(0, 16),
      sort_order: index,
    }))
    .filter((row) => row.name);

  if (childRows.length) {
    const { error: childError } = await supabase.from("children").insert(childRows);
    if (childError) warning = "Family created, but the children could not be added. You can add them on the board.";
  }

  const pin = String(body.pin ?? "").trim();
  if (pin) {
    if (!/^\d{4}$/.test(pin)) {
      warning = warning ?? "Family created, but the PIN must be 4 digits — set it in Settings.";
    } else {
      const pinHash = await hashPin(pin, tenantId);
      const { error: pinError } = await supabase.from("settings").update({ pin_hash: pinHash }).eq("tenant_id", tenantId);
      if (pinError) warning = warning ?? "Family created, but the PIN could not be saved — set it in Settings.";
    }
  }

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
