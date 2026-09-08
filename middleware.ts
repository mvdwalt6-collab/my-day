import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
