const args = process.argv.slice(2);

function getArg(name: string): string | null {
  const idx = args.indexOf(name);
  return idx !== -1 ? (args[idx + 1] ?? null) : null;
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

export const config = {
  port: parseInt(process.env.VS_CONNECT_PORT || getArg("--port") || "16384", 10),
  baseUrl: getArg("--baseurl"),
  noAuth: hasFlag("--no-auth"),
  token: process.env.VS_CONNECT_TOKEN || null,
  webhookUrl: process.env.VS_CONNECT_WEBHOOK || getArg("--webhook") || null,

  httpPollTimeout: 10000,
  promotionJitterMax: 300,
  heartbeatInterval: 5000,
  staleClientTimeout: 15000,

  toolTimeouts: {
    "list-clients": 5000,
    "get-game-info": 5000,
    "get-console-output": 10000,
    "search-instances": 10000,
    "get-descendants-tree": 10000,
    "execute": 30000,
    "execute-file": 30000,
    "get-data-by-code": 30000,
    "search-scripts-sources": 45000,
    "get-script-content": 45000,
    "ensure-remote-spy": 20000,
    "get-remote-spy-logs": 15000,
    "clear-remote-spy-logs": 10000,
    "block-remote": 10000,
    "ignore-remote": 10000,
    "screenshot-window": 15000,
    "list-roblox-windows": 10000,
    "type-text-box": 15000,
    "click-button": 10000,
    "command-history": 1000,
    "clear-history": 1000,
    "dump-constants": 30000,
    "hook-loadstring": 15000,
    "list-loadstring-calls": 15000,
    "execute-all": 30000,
    "get-data-all": 30000,
    "clear-script-cache": 1000,
    "script-cache-stats": 1000,
  } as Record<string, number>,

  rateLimits: {
    "execute": { maxTokens: 10, refillRate: 10 },
    "execute-file": { maxTokens: 10, refillRate: 10 },
    "get-data-by-code": { maxTokens: 10, refillRate: 10 },
    "screenshot-window": { maxTokens: 2, refillRate: 2 },
    "search-scripts-sources": { maxTokens: 3, refillRate: 3 },
  } as Record<string, { maxTokens: number; refillRate: number }>,
} as const;

export type ToolName = keyof typeof config.toolTimeouts;

export function getToolTimeout(toolName: string): number {
  return (config.toolTimeouts as Record<string, number>)[toolName] ?? 15000;
}
