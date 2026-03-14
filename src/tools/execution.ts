import { z } from "zod";
import fs from "fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SendArbitraryDataToClient, GetResponseOfIdFromClient } from "../bridge/transport.js";
import { getToolTimeout } from "../config.js";
import { logger } from "../utils/logger.js";
import { clientIdSchema, checkSendResult, makeTextResponse } from "./helpers.js";

export function registerExecutionTools(server: McpServer): void {
  server.registerTool(
    "execute",
    {
      title: "Execute Code in the Roblox Game Client",
      inputSchema: z.object({
        code: z.string().describe("The code to execute in the Roblox Game Client. This tool does NOT return output - use get-data-by-code if you need to retrieve data."),
        threadContext: z.number().describe("The thread identity to execute the code in (default: 8, normal game scripts run on 2)").optional().default(8),
        clientId: clientIdSchema,
      }),
    },
    async ({ code, threadContext, clientId }) => {
      logger.debug("Tools", `Executing code in thread ${threadContext}...`);
      const result = SendArbitraryDataToClient("execute", {
        source: `setthreadidentity(${threadContext})\n${code}`,
      }, undefined, clientId);
      const err = checkSendResult(result);
      if (err) return err;
      return makeTextResponse(`Code has been scheduled to be run in thread context ${threadContext}.`);
    }
  );

  server.registerTool(
    "execute-file",
    {
      title: "Execute a Luau file in the Roblox Game Client",
      description: "Reads a local .luau or .lua file from disk and executes its contents in the Roblox Game Client. This tool does NOT return output - use get-data-by-code if you need to retrieve data.",
      inputSchema: z.object({
        filePath: z.string().describe("The absolute path to the .luau or .lua file to execute"),
        threadContext: z.number().describe("The thread identity to execute the code in (default: 8)").optional().default(8),
        clientId: clientIdSchema,
      }),
    },
    async ({ filePath, threadContext, clientId }) => {
      if (!fs.existsSync(filePath)) {
        return makeTextResponse(`File not found: ${filePath}`);
      }
      const code = fs.readFileSync(filePath, "utf-8");
      logger.debug("Tools", `Executing file ${filePath} in thread ${threadContext}...`);
      const result = SendArbitraryDataToClient("execute", {
        source: `setthreadidentity(${threadContext})\n${code}`,
      }, undefined, clientId);
      const err = checkSendResult(result);
      if (err) return err;
      return makeTextResponse(`File executed: ${filePath} (thread context ${threadContext})`);
    }
  );

  server.registerTool(
    "get-data-by-code",
    {
      title: "Get data by code",
      description: "Query data from the Roblox Game Client by executing code, note that the code MUST return one or more values. IMPORTANT: Do NOT serialize/encode the return value yourself (no HttpService:JSONEncode, no custom table-to-string) - just return raw Lua values directly. The connector automatically serializes all returned data.",
      inputSchema: z.object({
        code: z.string().describe("The code to execute in the Roblox Game Client (MUST return one or more values). Return raw Lua values - do NOT manually serialize tables or use JSONEncode, the connector handles serialization automatically."),
        threadContext: z.number().describe("The thread identity to execute the code in (default: 8, normal game scripts run on 2)").optional().default(8),
        clientId: clientIdSchema,
      }),
    },
    async ({ code, threadContext, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("get-data-by-code", {
        source: `setthreadidentity(${threadContext});${code}`,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-data-by-code"));
      if (response === undefined || response.output === undefined) {
        return makeTextResponse("Failed to get data by code. Response: " + JSON.stringify(response));
      }
      return { success: true, content: [{ type: "text" as const, text: response.output }] };
    }
  );
}
