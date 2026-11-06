// MCP over streamable HTTP (stateless). Auth: Authorization: Bearer aer_... — the same key as the REST API.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NextRequest } from "next/server";
import { buildMcpServer } from "@/lib/mcp/server";
import { requireAgent } from "@/lib/server/auth";
import { getContext } from "@/lib/server/context";
import { withErrors } from "@/lib/server/http";

async function handle(req: NextRequest): Promise<Response> {
  const ctx = await getContext();
  const agent = await requireAgent(ctx.db, req);
  // Stateless: a fresh server + transport per request, bound to the authenticated agent.
  const server = buildMcpServer(ctx, agent);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close();
  }
}

export const POST = withErrors(handle);
export const GET = withErrors(handle);
export const DELETE = withErrors(handle);
