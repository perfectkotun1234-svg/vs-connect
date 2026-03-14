# VS Connect

An enhanced MCP (Model Context Protocol) server for interacting with Roblox game clients. A rewrite of the original [roblox-executor-mcp](https://github.com/notpoiu/roblox-executor-mcp) with major improvements.

## Features

- Auto-generated authentication tokens
- Modular codebase (20+ components)
- Adaptive HTTP polling (0.1s–0.5s)
- Configurable per-tool timeouts (5s–45s)
- Heartbeat system with stale detection
- 28 tools: execution, introspection, remote spy, GUI, screenshots, deobfuscation, multi-client
- Auto-decompile cache — decompiled scripts cached to disk for instant re-access
- Discord webhook notifications on client connect/disconnect
- Multi-client execution — run scripts on all clients at once
- Full interactive dashboard with 8 pages

## Setup

### 1. Clone & Build

```bash
git clone https://github.com/perfectkotun1234-svg/vs-connect.git
cd vs-connect
pnpm install && pnpm build
```

### 2. Start the MCP Server

```bash
node dist/index.js
```

### 3. Connect from Roblox

Execute this in your Roblox executor to connect your client:

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/notpoiu/roblox-executor-mcp/refs/heads/main/connector.luau"))()
```

> **Note:** You must run this every time you join a new game.

### 4. Open the Dashboard

Visit [http://localhost:16384](http://localhost:16384) in your browser to access the VS Connect dashboard.

The dashboard includes:
- **Overview** — FPS, ping, memory, player count, server info, connected clients
- **Players** — live player list with avatars, health bars, positions, teams
- **Console** — live console output viewer with auto-refresh
- **Script Editor** — write and execute Luau code with Ctrl+Enter
- **Quick Actions** — one-click ESP, fly, noclip, speed, infinite jump, fullbright, anti-AFK, rejoin, reset
- **Remote Spy** — auto-refreshing remote call viewer
- **Instance Explorer** — expandable instance tree browser
- **Script History** — tracks all executed scripts with timestamps

### 5. Register in Claude Code

Add the MCP server to your Claude Code configuration to start using the tools.

## CLI Options

| Flag | Description | Default |
|---|---|---|
| `--port <number>` | HTTP/WS server port | `16384` |
| `--baseurl <url>` | Connect to remote primary instance | — |
| `--no-auth` | Disable authentication | Auth enabled |
| `--webhook <url>` | Discord webhook URL for notifications | — |

Environment variables: `VS_CONNECT_PORT`, `VS_CONNECT_TOKEN`, `VS_CONNECT_WEBHOOK`

## Architecture

The codebase uses a bridge system managing client registry and transport, with tools organized into:

- **Execution** — run Lua scripts remotely
- **Introspection** — explore game instances and hierarchy
- **Remote Spy** — Cobalt-based remote monitoring
- **GUI Interaction** — click buttons, type in text boxes
- **Screenshots** — capture game windows
- **Deobfuscation** — analyze obfuscated scripts
- **Multi-Client** — execute on all connected clients simultaneously
- **Script Cache** — disk-based decompile caching for performance

## License

MIT
