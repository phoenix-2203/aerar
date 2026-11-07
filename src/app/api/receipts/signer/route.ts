// The address that signs Aerar's receipts. Publish it; verifiers compare against it.
import { json, withErrors } from "@/lib/server/http";
import { receiptSignerAddress } from "@/lib/receipts/receipt";

export const GET = withErrors(async () => json({ signer: receiptSignerAddress(), scheme: "EIP-191 personal_sign over the receipt's SHA-256" }));
