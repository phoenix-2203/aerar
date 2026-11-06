// Demo provider: standard market report, 0.10 USDC on Base Sepolia via x402. Synthetic data, labelled as such.
import { NextResponse, type NextRequest } from "next/server";
import { buildReport, normaliseTopic } from "@/lib/demo/report";
import { paidDemoRoute } from "@/lib/demo/x402-server";

export const GET = paidDemoRoute("0.10", "Aerar demo provider: standard market report (synthetic data)", async (req: NextRequest) => {
  const topic = normaliseTopic(req.nextUrl.searchParams.get("topic"));
  // A 4xx here means x402 does not settle, so a bad request is never charged.
  if (!topic) return NextResponse.json({ error: "INVALID_TOPIC", message: "topic is required (1-80 letters, numbers, basic punctuation)" }, { status: 400 });
  return NextResponse.json(buildReport(topic, "standard"));
});
