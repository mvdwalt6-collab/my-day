import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import type { Database } from "./types";
import { IMPERSONATION_COOKIE, IMPERSONATION_HEADER } from "@/lib/impersonation";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createClient() {
  const cookieStore = await cookies();
  const impersonatedTenant = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: impersonatedTenant
        ? {
            headers: {
              [IMPERSONATION_HEADER]: impersonatedTenant,
            },
          }
        : undefined,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware will refresh.
          }
        },
      },
    },
  );
}
