import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getHistory, clearHistory, makeTextResponse } from "./helpers.js";

export function registerHistoryTools(server: McpServer): void {
  server.registerTool(
    "command-history",
    {
      title: "View command history",
      description: "View recent MCP tool invocations with their arguments, timestamps, duration, and success/failure status. Useful for debugging and understanding what has been executed.",
      inputSchema: z.object({
        limit: z.number().describe("Maximum number of history entries to return (default: 20)").optional().default(20),
      }),
    },
    async ({ limit }) => {
      const entries = getHistory(limit);
      if (entries.length === 0) {
        return makeTextResponse("No command history yet.");
      }
      const formatted = entries.map((e) => {
        const date = new Date(e.timestamp).toISOString().slice(11, 23);
        const status = e.success ? "OK" : "FAIL";
        return `[${date}] ${e.toolName} (${e.durationMs}ms, ${status})\n  Args: ${JSON.stringify(e.args)}\n  Response: ${e.responseSnippet}`;
      }).join("\n\n");
      return makeTextResponse(formatted);
    }
  );

  server.registerTool(
    "clear-history",
    {
      title: "Clear command history",
      description: "Clears all stored command history entries.",
    },
    async () => {
      clearHistory();
      return makeTextResponse("Command history cleared.");
    }
  );
}
