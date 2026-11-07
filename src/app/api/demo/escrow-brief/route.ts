// Demo provider that takes payment through its Aerar Escrow and then sends back nothing (an empty JSON object).
// Aerar's delivery check catches it and refunds the payment from the escrow, on Base Sepolia.
import { NextResponse } from "next/server";
import { demoEscrow, paidDemoRoute } from "@/lib/demo/x402-server";

export const GET = paidDemoRoute("0.05", "Aerar demo provider: weekly market brief, paid through escrow (sends nothing, to show a refund)", async () => NextResponse.json({}), demoEscrow);
