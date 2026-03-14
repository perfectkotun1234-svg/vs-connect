import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SendArbitraryDataToClient, GetResponseOfIdFromClient } from "../bridge/transport.js";
import { resolveTargetClient } from "../bridge/registry.js";
import { getToolTimeout } from "../config.js";
import { clientIdSchema, checkSendResult, makeTextResponse } from "./helpers.js";
import { getCachedScript, setCachedScript, clearScriptCache, getScriptCacheStats } from "../utils/script-cache.js";

export function registerScriptTools(server: McpServer): void {
  server.registerTool(
    "get-script-content",
    {
      title: "Get the content of a script in the Roblox Game Client",
      description: "Get the content of a script in the Roblox Game Client",
      inputSchema: z.object({
        scriptGetterSource: z.string().describe("The code that fetches the script object from the game (should return a script object, and MUST be client-side only, will not work on Scripts with RunContext set to Server)").optional(),
        scriptPath: z.string().describe("The path to the script to get the content of. If passing a GC'd script proxy (e.g. <ScriptProxy: 1_316566>), use the literal angle brackets < > — do NOT HTML-encode them.").optional(),
        clientId: clientIdSchema,
      }),
    },
    async ({ scriptGetterSource, scriptPath, clientId }) => {
      if (scriptGetterSource === undefined && scriptPath === undefined) {
        return makeTextResponse("Must provide either scriptGetterSource or scriptPath.");
      }
      if (scriptGetterSource !== undefined && scriptPath !== undefined) {
        return makeTextResponse("Must provide either scriptGetterSource or scriptPath, not both.");
      }

      // Check disk cache first
      const cacheKey = scriptPath ?? scriptGetterSource ?? "";
      const client = resolveTargetClient(clientId);
      const placeId = client?.placeId ?? 0;
      const cached = getCachedScript(placeId, cacheKey);
      if (cached) {
        return { success: true, content: [{ type: "text" as const, text: `[CACHED]\n${cached}` }] };
      }

      const scriptProxyMatch = cacheKey.match(/^<ScriptProxy: (.+)>$/);
      const toolCallId = SendArbitraryDataToClient("get-script-content",
        scriptProxyMatch
          ? { debugId: scriptProxyMatch[1] }
          : { source: scriptGetterSource === undefined ? `return ${scriptPath}` : scriptGetterSource },
        undefined, clientId
      );
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-script-content"));
      if (!response?.output) return makeTextResponse("Failed to get script content.");

      // Cache the result
      setCachedScript(placeId, cacheKey, response.output);

      return { success: true, content: [{ type: "text" as const, text: response.output }] };
    }
  );

  server.registerTool(
    "search-scripts-sources",
    {
      title: "Search through all script sources",
      description: "Searches all mapped script sources for a given pattern. Uses Luau string.find() pattern matching. Returns matching scripts with context around each match.",
      inputSchema: z.object({
        queries: z.array(z.string()).describe("Array of search patterns (Luau string.find compatible). Multiple queries are combined with AND logic by default."),
        useOrLogic: z.boolean().describe("If true, combine queries with OR logic instead of AND (default: false)").optional().default(false),
        contextLines: z.number().describe("Number of context lines around each match (default: 2)").optional().default(2),
        maxResults: z.number().describe("Maximum number of matching scripts to return (default: 20)").optional().default(20),
        clientId: clientIdSchema,
      }),
    },
    async ({ queries, useOrLogic, contextLines, maxResults, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("search-scripts-sources", {
        queries, useOrLogic, contextLines, maxResults,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("search-scripts-sources"));
      if (!response?.output) return makeTextResponse("Failed to search script sources.");
      return { content: [{ type: "text" as const, text: response.output }] };
    }
  );

  server.registerTool(
    "clear-script-cache",
    {
      title: "Clear the decompiled script cache",
      description: "Removes all cached decompiled scripts from disk.",
    },
    async () => {
      const result = clearScriptCache();
      return makeTextResponse(`Cleared ${result.deleted} cached files.`);
    }
  );

  server.registerTool(
    "script-cache-stats",
    {
      title: "Get script cache statistics",
      description: "Returns the number of cached scripts and total cache size.",
    },
    async () => {
      const stats = getScriptCacheStats();
      const sizeMB = (stats.sizeBytes / 1024 / 1024).toFixed(2);
      return makeTextResponse(`Cache: ${stats.entries} scripts, ${sizeMB} MB`);
    }
  );
}
