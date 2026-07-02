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

  server.registerTool(
    "get-instance-properties",
    {
      title: "Get all properties of an instance",
      description: "Returns all properties, attributes, and children of a specific instance. Like DarkDex's property panel — shows ClassName, Name, Parent, and all readable properties.",
      inputSchema: z.object({
        path: z.string().describe("Path to the instance (e.g. game.Workspace.Part, game.Players.LocalPlayer)"),
        clientId: clientIdSchema,
      }),
    },
    async ({ path, clientId }) => {
      const code = `
local inst = ${path}
assert(typeof(inst) == "Instance", "Path did not resolve to an Instance")
local info = {Name=inst.Name, ClassName=inst.ClassName, Parent=inst.Parent and inst.Parent:GetFullName() or "nil", FullName=inst:GetFullName(), Children=#inst:GetChildren()}
local props = {}
local common = {"Archivable","Name","Parent","ClassName"}
for _,p in common do pcall(function() props[p] = tostring(inst[p]) end) end
if inst:IsA("BasePart") then
  for _,p in {"Position","Size","CFrame","Color","Material","Transparency","Anchored","CanCollide","Shape","BrickColor"} do pcall(function() props[p] = tostring(inst[p]) end) end
end
if inst:IsA("Humanoid") then
  for _,p in {"Health","MaxHealth","WalkSpeed","JumpPower","JumpHeight","HipHeight","DisplayName"} do pcall(function() props[p] = tostring(inst[p]) end) end
end
if inst:IsA("Player") then
  for _,p in {"UserId","DisplayName","Team","AccountAge","MembershipType","Character"} do pcall(function() props[p] = tostring(inst[p]) end) end
end
if inst:IsA("GuiObject") then
  for _,p in {"Position","Size","Visible","BackgroundColor3","BackgroundTransparency","Text","ZIndex"} do pcall(function() props[p] = tostring(inst[p]) end) end
end
if inst:IsA("ValueBase") then pcall(function() props["Value"] = tostring(inst.Value) end) end
local attrs = inst:GetAttributes()
info.Properties = props
info.Attributes = attrs
info.Tags = inst:GetTags()
local kids = {}
for i, c in inst:GetChildren() do if i > 50 then break end table.insert(kids, {Name=c.Name, ClassName=c.ClassName}) end
info.ChildList = kids
return info`;
      const toolCallId = SendArbitraryDataToClient("get-data-by-code", { source: `setthreadidentity(8);${code}` }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-data-by-code"));
      if (!response?.output) return makeTextResponse("Failed to get instance properties.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "find-instance",
    {
      title: "Find instances by name or class",
      description: "Search the entire game for instances matching a name and/or class. Returns path, class, and basic info for each match. Use this when asked to find something in the game.",
      inputSchema: z.object({
        name: z.string().describe("Instance name to search for (partial match, case-insensitive)").optional(),
        className: z.string().describe("ClassName to filter by (exact match, uses IsA)").optional(),
        root: z.string().describe("Root to search from (default: game)").optional().default("game"),
        limit: z.number().describe("Max results (default: 25)").optional().default(25),
        clientId: clientIdSchema,
      }),
    },
    async ({ name, className, root, limit, clientId }) => {
      const nameCheck = name ? `and string.lower(d.Name):find(string.lower("${name.replace(/"/g, '\\"')}"), 1, true)` : "";
      const classCheck = className ? `and d:IsA("${className.replace(/"/g, '\\"')}")` : "";
      const code = `
local results = {}
local root = ${root}
for _, d in root:GetDescendants() do
  if #results >= ${limit} then break end
  if true ${nameCheck} ${classCheck} then
    local info = {Name=d.Name, ClassName=d.ClassName, Path=d:GetFullName()}
    if d:IsA("BasePart") then pcall(function() info.Position = tostring(d.Position) end) end
    if d:IsA("Humanoid") then pcall(function() info.Health = d.Health; info.MaxHealth = d.MaxHealth end) end
    if d:IsA("Player") then pcall(function() info.UserId = d.UserId; info.DisplayName = d.DisplayName end) end
    table.insert(results, info)
  end
end
return {count=#results, results=results}`;
      const toolCallId = SendArbitraryDataToClient("get-data-by-code", { source: `setthreadidentity(8);${code}` }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-data-by-code"));
      if (!response?.output) return makeTextResponse("Failed to find instances.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "select-in-darkdex",
    {
      title: "Select an instance in DarkDex",
      description: "Highlights and selects an instance in the DarkDex explorer UI. DarkDex must be loaded first.",
      inputSchema: z.object({
        path: z.string().describe("Path to the instance to select (e.g. game.Workspace.Part)"),
        clientId: clientIdSchema,
      }),
    },
    async ({ path, clientId }) => {
      const code = `
local inst = ${path}
assert(typeof(inst) == "Instance", "Path did not resolve to an Instance")
if getgenv().Dex then
  pcall(function() getgenv().Dex.SelectInstance(inst) end)
  return "Selected " .. inst:GetFullName() .. " in DarkDex"
else
  return "DarkDex is not loaded. Use launch-darkdex first."
end`;
      const toolCallId = SendArbitraryDataToClient("get-data-by-code", { source: `setthreadidentity(8);${code}` }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("get-data-by-code"));
      if (!response?.output) return makeTextResponse("Failed to select in DarkDex.");
      return makeTextResponse(response.output);
    }
  );
}
