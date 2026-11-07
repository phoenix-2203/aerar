// Demo provider that takes payment through its Aerar Escrow and delivers a real (synthetic) report. Aerar confirms
// the delivery, so the escrow releases the payment to the shop at once.
import { NextResponse, type NextRequest } from "next/server";
import { buildReport, normaliseTopic } from "@/lib/demo/report";
import { demoEscrow, paidDemoRoute } from "@/lib/demo/x402-server";

export const GET = paidDemoRoute(
  "0.05",
  "Aerar demo provider: market report, paid through escrow (synthetic data)",
  async (req: NextRequest) => {
    const topic = normaliseTopic(req.nextUrl.searchParams.get("topic") ?? "AI agents");
    if (!topic) return NextResponse.json({ error: "INVALID_TOPIC", message: "topic must be 1-80 letters, numbers, basic punctuation" }, { status: 400 });
    return NextResponse.json(buildReport(topic, "standard"));
  },
  demoEscrow,
);
