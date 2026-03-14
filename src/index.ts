import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { boot } from "./bridge/boot.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { generateToken } from "./auth.js";

async function main(): Promise<void> {
  logger.info("VS Connect", "Starting up...");

  // Auth token setup
  if (!config.noAuth) {
    const token = generateToken();
    logger.info("Auth", `Token: ${token}`);
    logger.info("Auth", "Set getgenv().VSConnectToken = \"<token>\" in your connector.");
    logger.info("Auth", "Use --no-auth to disable authentication.");
  } else {
    logger.warn("Auth", "Authentication disabled (--no-auth). Use only for local development.");
  }

  // Start the MCP server over stdio
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP", "Server connected via stdio.");

  // Boot the bridge (HTTP/WS server for Roblox clients)
  await boot();

  logger.info("VS Connect", `Ready on port ${config.port}.`);
}

main().catch((err) => {
  logger.error("Fatal", "Unhandled error during startup:", err);
  process.exit(1);
});
