// MCP over streamable HTTP (stateless). Auth: Authorization: Bearer aer_... — the same key as the REST API.
import type { NextRequest } from "next/server";
import { handleMcp } from "@/lib/mcp/handler";
import { withErrors } from "@/lib/server/http";

const handle = (req: NextRequest) => handleMcp(req);
export const POST = withErrors(handle);
export const GET = withErrors(handle);
export const DELETE = withErrors(handle);
