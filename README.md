# VS Connect

An improved MCP server for interacting with Roblox Game Clients. Fork of [notpoiu/roblox-executor-mcp](https://github.com/notpoiu/roblox-executor-mcp), rewritten from scratch with authentication, modular architecture, better error handling, and new deobfuscation tools.

## What's Different

| Feature | Original | VS Connect |
|---|---|---|
| **Auth** | None | Auto-generated token (opt-out with `--no-auth`) |
| **Structure** | 1 file, 3015 lines | 20+ modular files |
| **Timeouts** | 15s hard global | Per-tool configurable (5s–45s) |
| **Errors** | Generic strings | Typed errors with context |
| **Multi-client** | Broadcast loses responses | `Promise.allSettled` collects all |
| **HTTP polling** | Fixed 0.1s | Adaptive backoff (0.1s → 0.5s when idle) |
| **Heartbeat** | None | 5s heartbeat, 15s stale detection |
| **LuaEncode** | Fetched from GitHub at runtime | Bundled in connector |
| **Dashboard** | Inline HTML in server | External `.html` file |
| **Port** | Hardcoded 16384 | Configurable via `--port` or env var |
| **Logging** | `console.log` | Structured logger with levels + colors |
| **New tools** | — | 5 new tools (see below) |

## Installation

```bash
# Clone and build
git clone https://github.com/Styianos/vs-connect.git
cd vs-connect
pnpm install
pnpm build

# Or install from npm (if published)
npm install -g vs-connect
```

## Usage

### 1. Start the MCP server

```bash
node dist/index.js
```

This will:
- Generate an auth token and print it to stderr
- Start the MCP server over stdio
- Start the HTTP/WebSocket bridge on port 16384

### 2. Configure your executor

In your Roblox executor, set the auth token before running the connector:

```lua
getgenv().VSConnectToken = "your-token-here"
loadstring(readfile("connector.luau"))()
```

### 3. Add to Claude Code

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "vs-connect": {
      "command": "node",
      "args": ["path/to/vs-connect/dist/index.js"]
    }
  }
}
```

## CLI Options

| Flag | Description | Default |
|---|---|---|
| `--port <number>` | HTTP/WS server port | `16384` |
| `--baseurl <url>` | Connect to remote primary instance | — |
| `--no-auth` | Disable authentication | Auth enabled |

Environment variables: `VS_CONNECT_PORT`, `VS_CONNECT_TOKEN`

## Tools (24 total)

### Execution
- **execute** — Run Lua code on a connected client
- **execute-file** — Read a local file and execute its contents
- **get-data-by-code** — Execute Lua code and return the result

### Introspection
- **list-clients** — List all connected Roblox clients
- **get-console-output** — Get recent console/log output
- **get-game-info** — Get current game details (place, server, creator)
- **search-instances** — Search the instance tree by class/name
- **get-descendants-tree** — Get a tree view of descendants

### Scripts
- **get-script-content** — Decompile and retrieve a script's source
- **search-scripts-sources** — Search across all decompiled script sources

### Remote Spy (Cobalt)
- **ensure-remote-spy** — Load the Cobalt remote spy
- **get-remote-spy-logs** — Get captured remote calls
- **clear-remote-spy-logs** — Clear all logged remote calls
- **block-remote** — Block a specific remote from firing
- **ignore-remote** — Ignore a specific remote in logs

### GUI Interaction
- **type-text-box** — Type text into a TextBox instance
- **click-button** — Simulate clicking a button

### Screenshot
- **screenshot-window** — Capture a screenshot of a Roblox window
- **list-roblox-windows** — List all visible Roblox windows

### Deobfuscation (New)
- **dump-constants** — Extract string/number constants from GC'd function prototypes
- **hook-loadstring** — Install a hook to capture dynamically loaded code
- **list-loadstring-calls** — Retrieve all captured loadstring calls

### History (New)
- **command-history** — View recent MCP tool invocations with timing and results
- **clear-history** — Clear the command history buffer

## Architecture

```
src/
  index.ts              Entry point: CLI parsing, boot
  server.ts             McpServer creation + tool registration
  config.ts             Constants, env/CLI config, per-tool timeouts
  types.ts              Shared interfaces
  auth.ts               Token generation & validation
  bridge/
    registry.ts         Client registry (register, unregister, resolve)
    transport.ts        Send/receive, response resolvers
    primary.ts          HTTP + WebSocket server
    secondary.ts        Relay WebSocket client
    boot.ts             Boot sequence + promotion logic
  tools/
    index.ts            Registers all tool modules
    helpers.ts          Shared schemas, error constants
    execution.ts        execute, execute-file, get-data-by-code
    scripts.ts          get-script-content, search-scripts-sources
    introspection.ts    list-clients, get-console-output, etc.
    remote-spy.ts       Cobalt remote spy tools
    screenshot.ts       screenshot-window, list-roblox-windows
    gui.ts              type-text-box, click-button
    history.ts          command-history, clear-history
    deobfuscation.ts    dump-constants, hook-loadstring, list-loadstring-calls
  dashboard/
    index.ts            Serves dashboard HTML
    dashboard.html      Dashboard UI (dark theme)
  utils/
    logger.ts           Structured stderr logging
    errors.ts           Typed error classes
    rate-limiter.ts     Token-bucket rate limiter
connector.luau          Roblox client connector
```

## Authentication

1. Server generates a random 32-byte hex token on startup (or reads `VS_CONNECT_TOKEN`)
2. Token is printed to stderr for you to copy
3. Connector authenticates via:
   - **WebSocket**: token in URL query param `?token=...`
   - **HTTP**: `Authorization: Bearer ...` header
4. Use `--no-auth` to disable (local-only use)

## Per-Tool Timeouts

| Timeout | Tools |
|---|---|
| 5s | list-clients, get-game-info |
| 10s | get-console-output, search-instances, get-descendants-tree, click-button |
| 15s | screenshot-window, remote-spy tools, hook-loadstring, list-loadstring-calls |
| 30s | execute, execute-file, get-data-by-code, dump-constants |
| 45s | search-scripts-sources, get-script-content |

## Dashboard

The dashboard is served at `http://localhost:16384` and shows:
- Connected clients with avatars
- Connection graph visualization
- Uptime, relay peer count
- Server role (primary/secondary)

## License

MIT
