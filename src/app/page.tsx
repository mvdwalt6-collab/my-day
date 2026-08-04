import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import HomeBoard from "./HomeBoard";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, tenants!inner(id, name, status)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect("/onboarding");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = (membership as any).tenants;
  if (tenant?.status === "suspended" || tenant?.status === "deleted") redirect("/suspended");

  return <HomeBoard tenantId={membership.tenant_id} familyName={tenant?.name ?? "My Day"} email={user.email ?? ""} />;
}
