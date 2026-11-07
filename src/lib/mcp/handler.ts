// One MCP request: authenticate the agent (Bearer header, or the key from a connector URL), pick its payment context,
// and answer statelessly with a fresh server bound to that agent.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/mcp/server";
import { requireAgent, requireAgentKey } from "@/lib/server/auth";
import { getDbOnly } from "@/lib/server/context";
import { agentContext } from "@/lib/try/sandbox";

export async function handleMcp(req: Request, keyFromPath?: string): Promise<Response> {
  const db = await getDbOnly();
  const agent = keyFromPath ? await requireAgentKey(db, keyFromPath) : await requireAgent(db, req);
  // Sandbox agents pay simulated shops, wallet agents pay from their owner's Vault, everyone else the operator rail.
  const ctx = await agentContext(agent.orgId);
  const server = buildMcpServer(ctx, agent);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close();
  }
}
