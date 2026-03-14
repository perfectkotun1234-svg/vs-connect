import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "VSConnect",
    version: "1.0.0",
    description:
      "An improved MCP Server for interacting with Roblox Game Clients, with authentication, modular architecture, per-tool timeouts, and deobfuscation tools.",
  });

  registerAllTools(server);

  return server;
}
