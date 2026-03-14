import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SendArbitraryDataToClient, GetResponseOfIdFromClient } from "../bridge/transport.js";
import { getToolTimeout } from "../config.js";
import { clientIdSchema, checkSendResult, makeTextResponse } from "./helpers.js";

export function registerRemoteSpyTools(server: McpServer): void {
  server.registerTool(
    "ensure-remote-spy",
    {
      title: "Ensure remote spy is loaded",
      description: "Loads the Cobalt remote spy if it is not already running. Cobalt hooks all RemoteEvents, RemoteFunctions, BindableEvents, BindableFunctions (both incoming and outgoing, including Actors) and logs their calls. Must be called before using get-remote-spy-logs. Returns the current status of Cobalt.",
      inputSchema: z.object({ clientId: clientIdSchema }),
    },
    async ({ clientId }) => {
      const toolCallId = SendArbitraryDataToClient("ensure-remote-spy", {}, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("ensure-remote-spy"));
      if (!response?.output) return makeTextResponse("Failed to load remote spy.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "get-remote-spy-logs",
    {
      title: "Get remote spy logs",
      description: "Retrieves captured remote/bindable call logs from the Cobalt remote spy. Returns remote name, class, direction (Incoming/Outgoing), call count, and recent call arguments. Cobalt must be loaded first via ensure-remote-spy.",
      inputSchema: z.object({
        direction: z.enum(["Incoming", "Outgoing", "Both"]).describe("Filter by call direction (default: Both)").optional().default("Both"),
        remoteNameFilter: z.string().describe("Optional filter — only return logs for remotes whose name contains this string (case-insensitive)").optional(),
        limit: z.number().describe("Maximum number of remote logs to return (default: 50)").optional().default(50),
        maxCallsPerRemote: z.number().describe("Maximum number of recent calls to return per remote (default: 5)").optional().default(5),
        clientId: clientIdSchema,
      }),
    },
    async ({ direction, remoteNameFilter, limit, maxCallsPerRemote, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("get-remote-spy-logs", {
        direction, remoteNameFilter, limit, maxCallsPerRemote,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-remote-spy-logs"));
      if (!response?.output) return makeTextResponse("Failed to get remote spy logs.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "clear-remote-spy-logs",
    {
      title: "Clear remote spy logs",
      description: "Clears all captured remote spy logs.",
      inputSchema: z.object({ clientId: clientIdSchema }),
    },
    async ({ clientId }) => {
      const toolCallId = SendArbitraryDataToClient("clear-remote-spy-logs", {}, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("clear-remote-spy-logs"));
      return makeTextResponse(response?.output ?? "Remote spy logs cleared.");
    }
  );

  server.registerTool(
    "block-remote",
    {
      title: "Block/unblock a remote",
      description: "Block or unblock a remote from being called. When blocked, calls to the remote will be silently dropped.",
      inputSchema: z.object({
        remotePath: z.string().describe("The full path to the remote instance to block/unblock"),
        direction: z.enum(["Incoming", "Outgoing"]).describe("The direction of calls to block").optional().default("Outgoing"),
        block: z.boolean().describe("True to block, false to unblock (default: true)").optional().default(true),
        clientId: clientIdSchema,
      }),
    },
    async ({ remotePath, direction, block, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("block-remote", {
        remotePath, direction, block,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("block-remote"));
      return makeTextResponse(response?.output ?? `Remote ${block ? "blocked" : "unblocked"}.`);
    }
  );

  server.registerTool(
    "ignore-remote",
    {
      title: "Ignore/unignore a remote",
      description: "Ignore or unignore a remote from being logged. When ignored, calls still fire but are not recorded in spy logs.",
      inputSchema: z.object({
        remotePath: z.string().describe("The full path to the remote instance to ignore/unignore"),
        direction: z.enum(["Incoming", "Outgoing"]).describe("The direction of calls to ignore").optional().default("Outgoing"),
        ignore: z.boolean().describe("True to ignore, false to unignore (default: true)").optional().default(true),
        clientId: clientIdSchema,
      }),
    },
    async ({ remotePath, direction, ignore, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("ignore-remote", {
        remotePath, direction, ignore,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("ignore-remote"));
      return makeTextResponse(response?.output ?? `Remote ${ignore ? "ignored" : "unignored"}.`);
    }
  );
}
