// Demo provider: premium market report, 0.50 USDC. Priced above the seeded task's 0.25 USDC
// auto-approve threshold, so buying it shows the human-approval flow.
import { NextResponse, type NextRequest } from "next/server";
import { buildReport, normaliseTopic } from "@/lib/demo/report";
import { paidDemoRoute } from "@/lib/demo/x402-server";

export const GET = paidDemoRoute("0.50", "Aerar demo provider: premium market report (synthetic data)", async (req: NextRequest) => {
  const topic = normaliseTopic(req.nextUrl.searchParams.get("topic"));
  if (!topic) return NextResponse.json({ error: "INVALID_TOPIC", message: "topic is required (1-80 letters, numbers, basic punctuation)" }, { status: 400 });
  return NextResponse.json(buildReport(topic, "premium"));
});
