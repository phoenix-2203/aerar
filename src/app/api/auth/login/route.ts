import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PurchaseError } from "@/lib/purchase/pipeline";
import { checkPassword, issueSession, loginThrottle, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/server/auth";
import { withErrors } from "@/lib/server/http";

const Body = z.object({ password: z.string().max(512) });

export const POST = withErrors(async (req: NextRequest) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const throttle = loginThrottle(ip);
  const { password } = Body.parse(await req.json());
  if (!checkPassword(password)) {
    throttle.fail();
    throw new PurchaseError("INVALID_PASSWORD", "Wrong password", 401);
  }
  throttle.ok();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, issueSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
});
