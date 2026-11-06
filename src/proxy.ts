// Sends anyone without an operator session to the login page. Pages and server actions check again themselves.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";

export function proxy(req: NextRequest) {
  let ok = false;
  try {
    ok = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    ok = false; // auth not configured: treat as logged out; the login page explains
  }
  if (ok) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/report/:path*", "/tasks/:path*", "/audit/:path*"],
};
