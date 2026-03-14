import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SendArbitraryDataToClient, GetResponseOfIdFromClient } from "../bridge/transport.js";
import { getActiveClients } from "../bridge/registry.js";
import { getToolTimeout } from "../config.js";
import { makeTextResponse, makeErrorResponse } from "./helpers.js";
import { logger } from "../utils/logger.js";

export function registerMultiClientTools(server: McpServer): void {
  server.registerTool(
    "execute-all",
    {
      title: "Execute code on all connected clients",
      description: "Runs the same Lua code on every connected Roblox client simultaneously. Returns a summary of results per client.",
      inputSchema: z.object({
        code: z.string().describe("The Lua code to execute on all clients"),
        threadContext: z.number().describe("Thread identity (default: 8)").optional().default(8),
      }),
    },
    async ({ code, threadContext }) => {
      const clients = getActiveClients();
      if (clients.length === 0) {
        return makeErrorResponse("No Roblox clients connected.");
      }

      const results: string[] = [];
      for (const client of clients) {
        const result = SendArbitraryDataToClient("execute", {
          source: `setthreadidentity(${threadContext})\n${code}`,
        }, undefined, client.clientId);

        if (result === null || result === "INVALID_CLIENT") {
          results.push(`${client.username}: FAILED (client unavailable)`);
        } else {
          results.push(`${client.username}: OK (scheduled)`);
        }
      }

      logger.info("MultiClient", `Executed on ${clients.length} clients`);
      return makeTextResponse(`Executed on ${clients.length} client(s):\n${results.join("\n")}`);
    }
  );

  server.registerTool(
    "get-data-all",
    {
      title: "Get data from all connected clients",
      description: "Executes code that returns data on every connected client and collects all results.",
      inputSchema: z.object({
        code: z.string().describe("The Lua code to execute (MUST return a value)"),
        threadContext: z.number().describe("Thread identity (default: 8)").optional().default(8),
      }),
    },
    async ({ code, threadContext }) => {
      const clients = getActiveClients();
      if (clients.length === 0) {
        return makeErrorResponse("No Roblox clients connected.");
      }

      const promises = clients.map(async (client) => {
        const toolCallId = SendArbitraryDataToClient("get-data-by-code", {
          source: `setthreadidentity(${threadContext});${code}`,
        }, undefined, client.clientId);

        if (toolCallId === null || toolCallId === "INVALID_CLIENT") {
          return { username: client.username, result: "FAILED" };
        }

        const response = await GetResponseOfIdFromClient(toolCallId, getToolTimeout("get-data-by-code"));
        return { username: client.username, result: response?.output ?? "No response" };
      });

      const results = await Promise.allSettled(promises);
      const output = results.map((r) => {
        if (r.status === "fulfilled") return `${r.value.username}: ${r.value.result}`;
        return `Unknown: Error - ${r.reason}`;
      }).join("\n\n");

      return makeTextResponse(output);
    }
  );
}
