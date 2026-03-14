import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolResponse, CommandHistoryEntry } from "../types.js";
import { getToolTimeout } from "../config.js";
import { formatErrorForTool } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export const clientIdSchema = z
  .string()
  .describe(
    "Target a specific Roblox client by its clientId. Use the list-clients tool to discover connected clients. If omitted, the most recently active client is used."
  )
  .optional();

export const NO_CLIENT_ERROR: ToolResponse = {
  content: [{
    type: "text" as const,
    text: "No Roblox client connected to the MCP server. Please notify the user that they have to run the connector.luau script in order to connect the MCP server to their game.",
  }],
  isError: true,
};

export const INVALID_CLIENT_ERROR: ToolResponse = {
  content: [{
    type: "text" as const,
    text: "Invalid client ID provided. Please use the list-clients tool to get a list of valid client IDs.",
  }],
  isError: true,
};

export function makeTextResponse(text: string): ToolResponse {
  return { content: [{ type: "text" as const, text }] };
}

export function makeErrorResponse(text: string): ToolResponse {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function checkSendResult(result: string | null): ToolResponse | null {
  if (result === null) return NO_CLIENT_ERROR;
  if (result === "INVALID_CLIENT") return INVALID_CLIENT_ERROR;
  return null;
}

// ─── Command History ─────────────────────────────────────────────────────────
const MAX_HISTORY = 500;
const history: CommandHistoryEntry[] = [];

export function addToHistory(entry: CommandHistoryEntry): void {
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
}

export function getHistory(limit: number = 50): CommandHistoryEntry[] {
  return history.slice(-limit);
}

export function clearHistory(): void {
  history.length = 0;
}
