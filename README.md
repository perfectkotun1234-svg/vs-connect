# VS Connect

An enhanced MCP (Model Context Protocol) server for interacting with Roblox game clients. A rewrite of the original [roblox-executor-mcp](https://github.com/notpoiu/roblox-executor-mcp) with major improvements.

## Features

- Auto-generated authentication tokens
- Modular codebase (20+ components)
- Adaptive HTTP polling (0.1s–0.5s)
- Configurable per-tool timeouts (5s–45s)
- Heartbeat system with stale detection
- 24 tools: execution, introspection, remote spy, GUI, screenshots, deobfuscation
- Dashboard at `localhost:16384`

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

### 4. Register in Claude Code

Add the MCP server to your Claude Code configuration to start using the tools.

## Architecture

The codebase uses a bridge system managing client registry and transport, with tools organized into:

- **Execution** — run Lua scripts remotely
- **Introspection** — explore game instances and hierarchy
- **Remote Spy** — Cobalt-based remote monitoring
- **GUI Interaction** — click buttons, type in text boxes
- **Screenshots** — capture game windows
- **Deobfuscation** — analyze obfuscated scripts
