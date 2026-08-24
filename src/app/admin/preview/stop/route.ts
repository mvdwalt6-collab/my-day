import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get(IMPERSONATION_COOKIE)?.value;

  if (tenantId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      actor_user_id: user?.id ?? null,
      action: "admin.preview.stop",
      tenant_id: tenantId,
      target: tenantId,
    });
  }

  cookieStore.set(IMPERSONATION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
