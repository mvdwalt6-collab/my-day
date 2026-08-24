import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import type { Database } from "./types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const pathname = url.pathname;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (!user && !isPublic) {
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const redirect = url.clone();
    redirect.pathname = "/";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
