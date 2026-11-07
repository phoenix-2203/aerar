// The public demo workspace's latest Morning Seal, for checking against Base in the browser.
import { getDbOnly, operatorOrgId } from "@/lib/server/context";
import { json, withErrors } from "@/lib/server/http";
import { sealStatus } from "@/lib/seal/seal";

export const GET = withErrors(async () => json({ seal: await sealStatus(await getDbOnly(), operatorOrgId()) }));
