import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExecutionTools } from "./execution.js";
import { registerScriptTools } from "./scripts.js";
import { registerIntrospectionTools } from "./introspection.js";
import { registerRemoteSpyTools } from "./remote-spy.js";
import { registerScreenshotTools } from "./screenshot.js";
import { registerGuiTools } from "./gui.js";
import { registerHistoryTools } from "./history.js";
import { registerDeobfuscationTools } from "./deobfuscation.js";

import { registerMultiClientTools } from "./multi-client.js";

export function registerAllTools(server: McpServer): void {
  registerIntrospectionTools(server);   // list-clients, get-console-output, get-game-info, search-instances, get-descendants-tree
  registerExecutionTools(server);        // execute, execute-file, get-data-by-code
  registerScriptTools(server);           // get-script-content, search-scripts-sources, clear-script-cache, script-cache-stats
  registerRemoteSpyTools(server);        // ensure-remote-spy, get/clear/block/ignore
  registerScreenshotTools(server);       // screenshot-window, list-roblox-windows
  registerGuiTools(server);              // type-text-box, click-button
  registerHistoryTools(server);          // command-history, clear-history
  registerDeobfuscationTools(server);    // dump-constants, hook-loadstring, list-loadstring-calls
  registerMultiClientTools(server);      // execute-all, get-data-all
}
