import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SendArbitraryDataToClient, GetResponseOfIdFromClient } from "../bridge/transport.js";
import { getToolTimeout } from "../config.js";
import { clientIdSchema, checkSendResult, makeTextResponse } from "./helpers.js";

export function registerDeobfuscationTools(server: McpServer): void {
  server.registerTool(
    "dump-constants",
    {
      title: "Dump constants from functions",
      description: "Extracts string and number constants from garbage-collected function prototypes using getgc(). Useful for analyzing obfuscated scripts without deobfuscating them. Returns organized constant values grouped by type.",
      inputSchema: z.object({
        maxStrings: z.number().describe("Maximum number of string constants to return (default: 200)").optional().default(200),
        minStringLength: z.number().describe("Minimum string length to include (default: 3)").optional().default(3),
        filterPattern: z.string().describe("Optional Lua pattern to filter strings (e.g. 'Remote' or 'Fire')").optional(),
        clientId: clientIdSchema,
      }),
    },
    async ({ maxStrings, minStringLength, filterPattern, clientId }) => {
      const code = `
local strings = {}
local numbers = {}
local count = 0
for _, v in ipairs(getgc(true)) do
    if type(v) == "function" then
        local ok, constants = pcall(debug.getconstants or getconstants, v)
        if ok and constants then
            for _, c in ipairs(constants) do
                if type(c) == "string" and #c >= ${minStringLength} then
                    ${filterPattern ? `if string.find(c, "${filterPattern.replace(/"/g, '\\"')}") then` : ""}
                    if not strings[c] then
                        strings[c] = true
                        count = count + 1
                        if count >= ${maxStrings} then break end
                    end
                    ${filterPattern ? "end" : ""}
                elseif type(c) == "number" then
                    numbers[c] = true
                end
            end
        end
    end
    if count >= ${maxStrings} then break end
end
local result = {}
for s in pairs(strings) do table.insert(result, s) end
table.sort(result)
return {strings = result, numberCount = 0}`;

      const toolCallId = SendArbitraryDataToClient("get-data-by-code", {
        source: `setthreadidentity(8);${code}`,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("dump-constants"));
      if (!response?.output) return makeTextResponse("Failed to dump constants.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "hook-loadstring",
    {
      title: "Hook loadstring for deobfuscation",
      description: "Installs a hook on loadstring that captures all dynamically loaded code. Each call to loadstring will be logged with a snippet of the source code and caller info. Use list-loadstring-calls to retrieve captured calls.",
      inputSchema: z.object({
        clientId: clientIdSchema,
      }),
    },
    async ({ clientId }) => {
      const code = `
if getgenv().__vsConnectLoadstringHook then
    return {status = "already_installed", callCount = #(getgenv().__vsConnectLoadstringCalls or {})}
end

getgenv().__vsConnectLoadstringCalls = {}
local oldLoadstring = loadstring
getgenv().__vsConnectOldLoadstring = oldLoadstring

getgenv().loadstring = newcclosure(function(source, ...)
    local info = debug.info(2, "sl") or "unknown"
    table.insert(getgenv().__vsConnectLoadstringCalls, {
        snippet = type(source) == "string" and string.sub(source, 1, 500) or tostring(source),
        fullLength = type(source) == "string" and #source or 0,
        caller = tostring(info),
        timestamp = os.clock(),
    })
    return oldLoadstring(source, ...)
end)

getgenv().__vsConnectLoadstringHook = true
return {status = "installed", message = "Loadstring hook installed. Use list-loadstring-calls to see captured calls."}`;

      const toolCallId = SendArbitraryDataToClient("get-data-by-code", {
        source: `setthreadidentity(8);${code}`,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("hook-loadstring"));
      if (!response?.output) return makeTextResponse("Failed to install loadstring hook.");
      return makeTextResponse(response.output);
    }
  );

  server.registerTool(
    "list-loadstring-calls",
    {
      title: "List captured loadstring calls",
      description: "Retrieves all loadstring calls captured by the hook installed via hook-loadstring. Shows source snippet, full length, caller info, and timestamp for each call.",
      inputSchema: z.object({
        limit: z.number().describe("Maximum number of calls to return (default: 50)").optional().default(50),
        saveLargest: z.boolean().describe("If true, save the largest captured source to a file (default: false)").optional().default(false),
        clientId: clientIdSchema,
      }),
    },
    async ({ limit, saveLargest, clientId }) => {
      const code = `
local calls = getgenv().__vsConnectLoadstringCalls
if not calls then
    return {error = "No loadstring hook installed. Use hook-loadstring first."}
end

local results = {}
local largest = {source = "", idx = 0}

for i = math.max(1, #calls - ${limit} + 1), #calls do
    local c = calls[i]
    if c then
        table.insert(results, {
            index = i,
            snippet = c.snippet,
            fullLength = c.fullLength,
            caller = c.caller,
            timestamp = c.timestamp,
        })
        if c.fullLength > largest.source then
            largest = {length = c.fullLength, idx = i}
        end
    end
end

${saveLargest ? `
if largest.idx > 0 and calls[largest.idx] then
    local src = getgenv().__vsConnectOldLoadstring and "stored" or "not available"
    writefile("vs_connect_largest_loadstring.lua", calls[largest.idx].snippet)
end` : ""}

return {totalCalls = #calls, returned = #results, calls = results}`;

      const toolCallId = SendArbitraryDataToClient("get-data-by-code", {
        source: `setthreadidentity(8);${code}`,
      }, undefined, clientId);
      const err = checkSendResult(toolCallId);
      if (err) return err;
      const response = await GetResponseOfIdFromClient(toolCallId!, getToolTimeout("list-loadstring-calls"));
      if (!response?.output) return makeTextResponse("Failed to list loadstring calls.");
      return makeTextResponse(response.output);
    }
  );
}
