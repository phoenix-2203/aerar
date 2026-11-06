// Operator session checks for Server Components and Server Actions (route handlers use requireOperator).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "./auth";

export async function isOperator(): Promise<boolean> {
  const jar = await cookies();
  try {
    return verifySession(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return false;
  }
}

/** For pages: bounce to /login when there is no valid session. */
export async function operatorOrLogin(next: string): Promise<"operator"> {
  if (!(await isOperator())) redirect(`/login?next=${encodeURIComponent(next)}`);
  return "operator";
}
