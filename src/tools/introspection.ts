import { z } from "zod";
import crypto from "crypto";
import { WebSocket } from "ws";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SendArbitraryDataToClient, GetResponseOfIdFromClient, instanceRole, relaySocket } from "../bridge/transport.js";
import { formatActiveClientListForTool } from "../bridge/registry.js";
import { getToolTimeout } from "../config.js";
import { clientIdSchema, checkSendResult, makeTextResponse, NO_CLIENT_ERROR } from "./helpers.js";

export function registerIntrospectionTools(server: McpServer): void {
  server.registerTool(
    "list-clients",
    {
      title: "List connected Roblox clients",
      description: "Returns a list of all Roblox game clients currently connected to the MCP bridge, including their clientId, username, placeId, jobId, and placeName. Use the clientId from this list to target specific clients in other tools.",
    },
    async () => {
      if (instanceRole === "secondary") {
        const id = crypto.randomUUID();
        if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
          relaySocket.send(JSON.stringify({ id, type: "list-clients" }));
          const response = await GetResponseOfIdFromClient(id);
          return makeTextResponse(response?.output ?? response?.error ?? "Failed to list clients.");
        }
        return NO_CLIENT_ERROR;
      }
      return makeTextResponse(formatActiveClientListForTool());
    }
  );

  server.registerTool(
    "get-console-output",
    {
      title: "Get the roblox developer console output from the Roblox Game Client",
      inputSchema: z.object({
        limit: z.number().describe("Maximum number of log entries to return (default: 50)").optional().default(50),
        newestFirst: z.boolean().describe("If true, return newest entries first (default: true)").optional().default(true),
        clientId: clientIdSchema,
      }),
    },
    async ({ limit, newestFirst, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("get-console-output", { limit, newestFirst }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-console-output"));
      if (!response?.output) return makeTextResponse("Failed to get console output.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "get-game-info",
    {
      title: "Get game information",
      description: "Retrieves basic information about the current game including PlaceId, GameId, PlaceVersion, and other metadata.",
      inputSchema: z.object({ clientId: clientIdSchema }),
    },
    async ({ clientId }) => {
      const toolCallId = SendArbitraryDataToClient("get-game-info", {}, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-game-info"));
      if (!response?.output) return makeTextResponse("Failed to get game info.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "search-instances",
    {
      title: "Search for instances in the Roblox game",
      description: "Search for instances using a CSS-like selector syntax. Supports class names, tags (.Tag), names (#Name), properties ([Prop = value]), attributes ([$Attr = value]), combinators (> direct children, >> all descendants, , OR), and pseudo-classes (:not(), :has()).",
      inputSchema: z.object({
        query: z.string().describe("CSS-like selector query for finding instances"),
        root: z.string().describe("The root instance to search from (default: game)").optional().default("game"),
        limit: z.number().describe("Maximum number of results to return (default: 50)").optional().default(50),
        clientId: clientIdSchema,
      }),
    },
    async ({ query, root, limit, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("search-instances", { query, root, limit }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("search-instances"));
      if (!response?.output) return makeTextResponse("Failed to search instances.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "get-descendants-tree",
    {
      title: "Get instance descendants tree",
      description: "Returns a structured tree of an instance's descendants, useful for exploring game hierarchy.",
      inputSchema: z.object({
        root: z.string().describe("The root instance path (default: game)").optional().default("game"),
        maxDepth: z.number().describe("Maximum depth to traverse (default: 3)").optional().default(3),
        maxChildren: z.number().describe("Maximum children per node (default: 50)").optional().default(50),
        classFilter: z.string().describe("Only include instances of this class (uses IsA)").optional(),
        clientId: clientIdSchema,
      }),
    },
    async ({ root, maxDepth, maxChildren, classFilter, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("get-descendants-tree", {
        root, maxDepth, maxChildren, classFilter,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-descendants-tree"));
      if (!response?.output) return makeTextResponse("Failed to get descendants tree.");
      return makeTextResponse(response.output);
    }
  );
}
