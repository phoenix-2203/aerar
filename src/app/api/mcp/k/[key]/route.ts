// MCP with the agent key in the URL, for Claude.ai / ChatGPT "custom connector" settings that only take a URL.
// Treat the URL like a password: anyone with it can ask this agent to buy, inside the task's rules. Revoke the agent
// to kill it. Purchases still go through every rule, approval and (for wallet workspaces) the owner's Vault.
import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/server/http";
import { handleMcp } from "@/lib/mcp/handler";

const handle = async (req: NextRequest, { params }: { params: Promise<{ key: string }> }) => handleMcp(req, (await params).key);
export const POST = withErrors(handle);
export const GET = withErrors(handle);
export const DELETE = withErrors(handle);
