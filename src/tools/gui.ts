import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SendArbitraryDataToClient, GetResponseOfIdFromClient } from "../bridge/transport.js";
import { getToolTimeout } from "../config.js";
import { clientIdSchema, checkSendResult, makeTextResponse } from "./helpers.js";

export function registerGuiTools(server: McpServer): void {
  server.registerTool(
    "type-text-box",
    {
      title: "Type text into a TextBox",
      description: "Type text into a TextBox instance in the game. Can simulate keystroke-by-keystroke typing or set the text property directly.",
      inputSchema: z.object({
        textBoxPath: z.string().describe("Path to the TextBox instance (e.g. game.Players.LocalPlayer.PlayerGui.ScreenGui.TextBox)"),
        text: z.string().describe("The text to type"),
        simulateKeystrokes: z.boolean().describe("If true, simulate keystroke-by-keystroke typing (default: false)").optional().default(false),
        clientId: clientIdSchema,
      }),
    },
    async ({ textBoxPath, text, simulateKeystrokes, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("type-text-box", {
        textBoxPath, text, simulateKeystrokes,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("type-text-box"));
      return makeTextResponse(response?.output ?? "Text typed successfully.");
    }
  );

  server.registerTool(
    "click-button",
    {
      title: "Click a button",
      description: "Simulate clicking a button instance in the game. Fires Activated, MouseButton1Click, and MouseButton1Down/Up signals.",
      inputSchema: z.object({
        buttonPath: z.string().describe("Path to the button instance (e.g. game.Players.LocalPlayer.PlayerGui.ScreenGui.Button)"),
        clientId: clientIdSchema,
      }),
    },
    async ({ buttonPath, clientId }) => {
      const toolCallId = SendArbitraryDataToClient("click-button", {
        buttonPath,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("click-button"));
      return makeTextResponse(response?.output ?? "Button clicked.");
    }
  );
}
